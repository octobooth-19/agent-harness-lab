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

const SPAN_LIMIT = 800;
const LINK_LIMIT = 200;
const MARK_LIMIT = 200;
const MERGE_GAP_MS = 3000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COORD_TOOLS = new Set([
    "send_session_message", "create_session", "get_session", "get_sessions_status", "list_sessions_and_chats",
    "publish_chat_update", "task", "read_agent", "write_agent", "respond_to_session_plan_v2", "answer_session_input",
]);

/** Timeline category for a tool, from its name only. */
export function toolCategory(name) {
    if (WAIT_TOOLS.has(name)) return "wait";
    if (["view", "grep", "glob", "rg", "lsp"].includes(name)) return "read";
    if (["edit", "create", "apply_patch", "write"].includes(name)) return "edit";
    if (["bash", "read_bash", "write_bash", "stop_bash", "powershell"].includes(name)) return "run";
    if (name.startsWith("web_") || name.startsWith("playwright-") || name.includes("browser")) return "web";
    if (COORD_TOOLS.has(name)) return "coord";
    return "other";
}

function pushCapped(list, item, limit) {
    list.push(item);
    if (list.length > limit) list.splice(0, list.length - limit);
}

/** Records a closed span, coalescing with the previous one of the same kind when they nearly touch. */
function pushSpan(state, start, end, k) {
    if (!start || !end) return;
    const last = state.spans[state.spans.length - 1];
    if (last && last.k === k && Date.parse(start) - Date.parse(last.e) < MERGE_GAP_MS && start >= last.s) {
        if (end > last.e) last.e = end;
        return;
    }
    pushCapped(state.spans, { s: start, e: end, k }, SPAN_LIMIT);
}

function closeAll(state, at) {
    if (state.turnStart) pushSpan(state, state.turnStart, at, "think");
    state.turnStart = null;
    for (const t of state.openTools.values()) pushSpan(state, t.at, at, t.cat);
    for (const p of state.pending.values()) pushSpan(state, p.at, at, "wait");
}

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
        turnStart: null,
        spans: [],
        links: [],
        marks: [],
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
        const p = state.pending.get(d.requestId ?? event.id);
        if (p) pushSpan(state, p.at, at, "wait");
        state.pending.delete(d.requestId ?? event.id);
        return state;
    }

    switch (event.type) {
        case "session.start":
            state.startedAt = d.startTime || at;
            state.model = d.selectedModel || state.model;
            state.shutdown = false;
            pushCapped(state.marks, { at: state.startedAt, k: "start" }, MARK_LIMIT);
            pushFeed(state, at, "start", "session started");
            break;
        case "session.resume":
            closeAll(state, at);
            pushCapped(state.marks, { at, k: "resume" }, MARK_LIMIT);
            state.shutdown = false;
            state.inTurn = false;
            state.openTools.clear();
            state.pending.clear();
            pushFeed(state, at, "start", "session resumed");
            break;
        case "session.shutdown":
            closeAll(state, at);
            pushCapped(state.marks, { at, k: "stop" }, MARK_LIMIT);
            state.shutdown = true;
            state.inTurn = false;
            state.openTools.clear();
            state.pending.clear();
            pushFeed(state, at, "stop", "session shut down");
            break;
        case "abort":
            closeAll(state, at);
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
            if (m) pushCapped(state.links, { at, dir: "in", peer: m[1].toLowerCase(), k: state.userMessages === 1 ? "kickoff" : "message" }, LINK_LIMIT);
            else if (!d.source) pushCapped(state.marks, { at, k: "human" }, MARK_LIMIT);
            pushFeed(state, at, "order", m ? "message from another session" : "new message");
            break;
        }
        case "assistant.turn_start":
            state.turns += 1;
            state.inTurn = true;
            if (!state.turnStart) state.turnStart = at;
            break;
        case "assistant.turn_end":
        case "session.idle":
            if (state.turnStart) pushSpan(state, state.turnStart, at, "think");
            state.turnStart = null;
            state.inTurn = false;
            break;
        case "tool.execution_start": {
            const name = typeof d.toolName === "string" ? d.toolName : "tool";
            const label = describeTool(name, d.arguments);
            state.toolCalls += 1;
            state.openTools.set(d.toolCallId ?? event.id, { name, label, at, cat: toolCategory(name) });
            const target = d.arguments?.session_id;
            if (name === "send_session_message" && typeof target === "string" && UUID.test(target)) {
                const k = d.arguments.purpose === "handoff" ? "handoff" : "message";
                pushCapped(state.links, { at, dir: "out", peer: target.toLowerCase(), k }, LINK_LIMIT);
            }
            state.lastActivity = { tool: name, label, at };
            pushFeed(state, at, "tool", label);
            break;
        }
        case "tool.execution_complete": {
            const open = state.openTools.get(d.toolCallId ?? event.id);
            if (open) pushSpan(state, open.at, at, open.cat);
            state.openTools.delete(d.toolCallId ?? event.id);
            if (d.success === false) {
                state.toolFailures += 1;
                pushFeed(state, at, "fail", "tool call failed");
            }
            break;
        }
        case "session.usage_record": {
            const u = d.usage || {};
            state.tokensIn += Number(u.inputTokens) || 0;
            state.tokensOut += Number(u.outputTokens) || 0;
            if (u.modelDisplayName || u.model) state.model = u.modelDisplayName || u.model;
            break;
        }
        case "session.task_complete":
            state.completions.push({ at, success: d.success !== false, summary: clip(d.summary, 200) });
            pushCapped(state.marks, { at, k: "complete" }, MARK_LIMIT);
            pushFeed(state, at, "complete", "reported task complete");
            break;
        case "session.error":
            state.lastError = { at, message: clip(d.message || d.errorType || "error") };
            pushCapped(state.marks, { at, k: "error" }, MARK_LIMIT);
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

/** Spans still open right now (turn, tools, pending requests), with no end time. */
export function openSpans(state) {
    const out = [];
    if (state.turnStart) out.push({ s: state.turnStart, e: null, k: "think" });
    for (const t of state.openTools.values()) out.push({ s: t.at, e: null, k: t.cat });
    for (const p of state.pending.values()) out.push({ s: p.at, e: null, k: "wait" });
    return out;
}
