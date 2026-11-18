// Live data sources backed by documented SDK surfaces only:
//   self  - this extension's own session, via session.on(...) events.
//   peers - session.rpc.management.list(), which returns live peers that
//           have opted in to session management. The policy is off by
//           default; this dashboard never turns it on for the user.

const BLOCKING_REQUESTS = {
    "user_input.requested": "awaiting user input",
    "elicitation.requested": "awaiting form input",
    "exit_plan_mode.requested": "awaiting plan approval",
    "permission.requested": "awaiting permission",
    "session_limits_exhausted.requested": "session limits reached",
};
const BLOCKING_COMPLETIONS = new Set([
    "user_input.completed",
    "elicitation.completed",
    "exit_plan_mode.completed",
    "permission.completed",
    "session_limits_exhausted.completed",
]);
const BUSY_EVENTS = new Set(["user.message", "assistant.turn_start", "tool.execution_start"]);

/** Fresh state for the self tracker. Activity starts unknown until an event is observed. */
export function initialSelfState({ sessionId, name, connectedAt = new Date().toISOString() }) {
    return {
        connectedAt,
        id: sessionId,
        name: name || "This session",
        activity: "unknown",
        activityDetail: "no activity event observed since the dashboard loaded",
        lastActivityAt: undefined,
        observedAt: undefined,
        pendingBlocks: {},
    };
}

/**
 * Pure reducer: fold one SDK session event into the self state. Returns the
 * same object when the event is irrelevant so callers can skip broadcasts.
 */
export function applySelfEvent(state, event) {
    const type = event?.type;
    const at = typeof event?.timestamp === "string" ? event.timestamp : new Date().toISOString();
    if (!type) return state;

    if (type === "session.title_changed" && event.data?.title) {
        return { ...state, name: String(event.data.title).slice(0, 300), observedAt: at };
    }
    if (BLOCKING_REQUESTS[type]) {
        const pendingBlocks = { ...state.pendingBlocks, [type]: BLOCKING_REQUESTS[type] };
        return { ...state, pendingBlocks, activity: "blocked", activityDetail: BLOCKING_REQUESTS[type], lastActivityAt: at, observedAt: at };
    }
    if (BLOCKING_COMPLETIONS.has(type)) {
        const pendingBlocks = { ...state.pendingBlocks };
        delete pendingBlocks[type.replace(/\.completed$/, ".requested")];
        const remaining = Object.values(pendingBlocks);
        return remaining.length
            ? { ...state, pendingBlocks, activity: "blocked", activityDetail: remaining[0], lastActivityAt: at, observedAt: at }
            : { ...state, pendingBlocks, activity: "busy", activityDetail: "resumed after response", lastActivityAt: at, observedAt: at };
    }
    if (type === "session.error") {
        const detail = event.data?.errorType ? `error: ${event.data.errorType}` : "error reported";
        return { ...state, activity: "error", activityDetail: detail, lastActivityAt: at, observedAt: at };
    }
    if (type === "session.idle") {
        return {
            ...state,
            pendingBlocks: {},
            activity: "idle",
            activityDetail: "waiting for the next message (idle does not mean the task is complete)",
            lastActivityAt: at,
            observedAt: at,
        };
    }
    if (BUSY_EVENTS.has(type)) {
        if (Object.keys(state.pendingBlocks).length) return state;
        if (state.activity === "busy" && state.activityDetail === "agent turn in progress") {
            return { ...state, lastActivityAt: at, observedAt: at };
        }
        return { ...state, activity: "busy", activityDetail: "agent turn in progress", lastActivityAt: at, observedAt: at };
    }
    if (type === "session.shutdown") {
        return { ...state, activity: "unknown", activityDetail: "session shut down", lastActivityAt: at, observedAt: at };
    }
    return state;
}

/** Convert the self state into a source record for the model. */
export function selfSource(state) {
    return {
        id: "self",
        kind: "copilot-app",
        label: "This session (live SDK events)",
        scope: "project",
        origin: "live",
        available: true,
        // Before the first event the source is connected but activity is unknown.
        observedAt: state.observedAt ?? state.connectedAt,
        staleAfterSeconds: 0,
        sessions: [
            {
                id: state.id,
                name: state.name,
                activity: state.activity,
                activityDetail: state.activityDetail,
                provider: "GitHub Copilot app (this session)",
                lastActivityAt: state.lastActivityAt,
                isSelf: true,
            },
        ],
    };
}

/** Map a successful management.list result into a source record. */
export function peersSource(result, observedAt) {
    const sessions = (result?.sessions ?? []).map((p) => ({
        id: String(p.sessionId),
        name: String(p.name || p.sessionId).slice(0, 300),
        activity: p.state === "busy" ? "busy" : p.state === "idle" ? "idle" : "unknown",
        activityDetail: p.state === "idle" ? "idle (does not mean the task is complete)" : p.state ? undefined : "state not reported",
        provider: "Copilot runtime peer",
        mode: p.model ? `model ${p.model}` : undefined,
        // sessionStatePath is intentionally dropped: it points at private session history.
    }));
    return {
        id: "peers",
        kind: "copilot-app",
        label: "Opted-in local peers (session management)",
        scope: "local",
        origin: "live",
        available: true,
        observedAt,
        staleAfterSeconds: 0,
        sessions,
    };
}

export function peersUnavailable(reason) {
    return {
        id: "peers",
        kind: "copilot-app",
        label: "Opted-in local peers (session management)",
        scope: "local",
        origin: "live",
        available: false,
        unavailableReason: String(reason).slice(0, 300),
        observedAt: new Date().toISOString(),
        staleAfterSeconds: 0,
        sessions: [],
    };
}
