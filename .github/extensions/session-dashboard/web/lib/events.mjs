// Pure reducer over Copilot session events.jsonl records. Every number it
// produces is a count or sum of logged events; nothing is estimated.

const FEED_LIMIT = 40;
const TEXT_LIMIT = 140;
const WAIT_TOOLS = new Set(["ask_user"]);
const PENDING_OPEN = {
    "permission.requested": "permission",
    "user_input.requested": "input",
    "elicitation.requested": "input",
    "exit_plan_mode.requested": "plan approval",
};
const PENDING_CLOSE = new Set([
    "permission.completed",
    "user_input.completed",
    "elicitation.completed",
    "exit_plan_mode.completed",
]);

export function createSessionState(id) {
    return {
        id,
        startedAt: null,
        lastEventAt: null,
        eventCount: 0,
        turns: 0,
        toolCalls: 0,
        toolFailures: 0,
        tokensIn: 0,
        tokensOut: 0,
        userMessages: 0,
        model: null,
        mode: null,
        coordinatorId: null,
        latestRequest: null,
        latestRequestAt: null,
        inTurn: false,
        shutdown: false,
        openTools: new Map(),
        pending: new Map(),
        lastActivity: null,
        lastError: null,
        completions: [],
        feed: [],
    };
}

export function clip(text, limit = TEXT_LIMIT) {
    if (typeof text !== "string") return "";
    const flat = text.replace(/\s+/g, " ").trim();
    return flat.length > limit ? `${flat.slice(0, limit - 1)}…` : flat;
}

function baseName(p) {
    return typeof p === "string" ? p.split("/").filter(Boolean).pop() || p : "";
}

/** Short, human label for a tool call, derived only from its own arguments. */
export function describeTool(name, args) {
    const a = args && typeof args === "object" ? args : {};
    switch (name) {
        case "bash":
            return clip(a.description || a.command || "shell command", 80);
        case "view":
            return `read ${baseName(a.path)}`;
        case "edit":
        case "create":
            return `${name} ${baseName(a.path)}`;
        case "apply_patch":
            return "apply patch";
        case "grep":
        case "rg":
            return `search “${clip(a.pattern, 40)}”`;
        case "glob":
            return `find ${clip(a.pattern, 40)}`;
        case "web_fetch":
            return `fetch ${clip(a.url, 60)}`;
        case "web_search":
            return `search web “${clip(a.query, 50)}”`;
        case "sql":
            return clip(a.description || "sql", 60);
        case "task":
            return `subagent: ${clip(a.description || a.name, 50)}`;
        case "ask_user":
            return `asking: ${clip(a.question, 70)}`;
        case "send_session_message":
            return "messaging another session";
        case "task_complete":
            return "reporting completion";
        default:
            return name.replace(/_/g, " ");
    }
}

function pushFeed(state, at, kind, text) {
    state.feed.push({ at, kind, text });
    if (state.feed.length > FEED_LIMIT) state.feed.splice(0, state.feed.length - FEED_LIMIT);
}

export function applyEvent(state, event) {
    if (!event || typeof event.type !== "string") return state;
    const d = event.data && typeof event.data === "object" ? event.data : {};
    const at = typeof event.timestamp === "string" ? event.timestamp : state.lastEventAt;
    state.eventCount += 1;
    if (at && (!state.lastEventAt || at > state.lastEventAt)) state.lastEventAt = at;

    if (PENDING_OPEN[event.type]) {
        state.pending.set(d.requestId ?? event.id, { kind: PENDING_OPEN[event.type], at });
        pushFeed(state, at, "wait", `waiting on ${PENDING_OPEN[event.type]}`);
        return state;
    }
    if (PENDING_CLOSE.has(event.type)) {
        state.pending.delete(d.requestId ?? event.id);
        return state;
    }

    switch (event.type) {
        case "session.start":
            state.startedAt = d.startTime || at;
            state.model = d.selectedModel || state.model;
            state.shutdown = false;
            pushFeed(state, at, "start", "session started");
            break;
        case "session.resume":
            state.shutdown = false;
            state.inTurn = false;
            state.openTools.clear();
            state.pending.clear();
            pushFeed(state, at, "start", "session resumed");
            break;
        case "session.shutdown":
            state.shutdown = true;
            state.inTurn = false;
            state.openTools.clear();
            state.pending.clear();
            pushFeed(state, at, "stop", "session shut down");
            break;
        case "abort":
            state.inTurn = false;
            state.openTools.clear();
            pushFeed(state, at, "stop", "turn aborted");
            break;
        case "session.mode_changed":
            state.mode = d.newMode || state.mode;
            break;
        case "user.message": {
            state.userMessages += 1;
            state.latestRequest = clip(d.content);
            state.latestRequestAt = at;
            const m = typeof d.source === "string" && d.source.match(/^agent-([0-9a-f-]{36})$/i);
            // Only the kickoff message identifies a coordinator; later agent
            // messages may be child reports flowing upward.
            if (m && state.userMessages === 1) state.coordinatorId = m[1];
            pushFeed(state, at, "order", m ? "message from another session" : "new message");
            break;
        }
        case "assistant.turn_start":
            state.turns += 1;
            state.inTurn = true;
            break;
        case "assistant.turn_end":
        case "session.idle":
            state.inTurn = false;
            break;
        case "tool.execution_start": {
            const name = typeof d.toolName === "string" ? d.toolName : "tool";
            const label = describeTool(name, d.arguments);
            state.toolCalls += 1;
            state.openTools.set(d.toolCallId ?? event.id, { name, label, at });
            state.lastActivity = { tool: name, label, at };
            pushFeed(state, at, "tool", label);
            break;
        }
        case "tool.execution_complete":
            state.openTools.delete(d.toolCallId ?? event.id);
            if (d.success === false) {
                state.toolFailures += 1;
                pushFeed(state, at, "fail", "tool call failed");
            }
            break;
        case "session.usage_record": {
            const u = d.usage || {};
            state.tokensIn += Number(u.inputTokens) || 0;
            state.tokensOut += Number(u.outputTokens) || 0;
            if (u.modelDisplayName || u.model) state.model = u.modelDisplayName || u.model;
            break;
        }
        case "session.task_complete":
            state.completions.push({ at, success: d.success !== false, summary: clip(d.summary, 200) });
            pushFeed(state, at, "complete", "reported task complete");
            break;
        case "session.error":
            state.lastError = { at, message: clip(d.message || d.errorType || "error") };
            pushFeed(state, at, "fail", state.lastError.message);
            break;
        default:
            break;
    }
    return state;
}

/** Feed newline-delimited text; returns the unconsumed trailing partial line. */
export function applyChunk(state, buffered, chunk) {
    const text = buffered + chunk;
    const lines = text.split("\n");
    const rest = lines.pop();
    for (const line of lines) {
        if (!line.trim()) continue;
        try {
            applyEvent(state, JSON.parse(line));
        } catch {
            // A malformed line is skipped rather than guessed at.
        }
    }
    return rest;
}

/**
 * Activity status from events plus process liveness. "done" is only reported
 * when the session itself logged session.task_complete after its latest
 * request — never inferred from idleness.
 */
export function deriveStatus(state, { alive }) {
    if (!alive) return state.shutdown ? "offline" : "disconnected";
    const waitingTool = [...state.openTools.values()].some((t) => WAIT_TOOLS.has(t.name));
    if (state.pending.size > 0 || waitingTool) return "waiting";
    if (state.inTurn || state.openTools.size > 0) return "busy";
    const last = state.completions[state.completions.length - 1];
    if (state.lastError && (!state.latestRequestAt || state.lastError.at >= state.latestRequestAt)) return "error";
    if (last && (!state.latestRequestAt || last.at >= state.latestRequestAt)) return "done";
    return "idle";
}

export function waitingOn(state) {
    const kinds = new Set([...state.pending.values()].map((p) => p.kind));
    for (const t of state.openTools.values()) if (WAIT_TOOLS.has(t.name)) kinds.add("user answer");
    return [...kinds];
}
