// Extension: session-dashboard
// Read-only canvas that shows Copilot app sessions (and, later, harness
// sessions) with truthful activity and data-freshness states.
// See README.md for data-source capabilities and limitations.

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { joinSession, createCanvas, CanvasError } from "@github/copilot-sdk/extension";
import { SNAPSHOT_SCHEMA, SnapshotError } from "./lib/model.mjs";
import { applySelfEvent, initialSelfState, peersSource, peersUnavailable, selfSource } from "./lib/live.mjs";
import { createStore } from "./lib/store.mjs";
import { startDashboardServer } from "./lib/server.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const UI_DIR = join(here, "ui");
const PEER_POLL_MS = 30_000;
const PEER_TIMEOUT_MS = 5_000;

const servers = new Map(); // instanceId -> { url, close }
let session;
let store;
let selfState;
let peerTimer;
let markReady;
const ready = new Promise((resolve) => (markReady = resolve));

const logError = (err) =>
    session?.log(`session-dashboard: ${err?.message ?? err}`, { level: "warning", ephemeral: true });

async function probePeers() {
    let timer;
    try {
        const result = await Promise.race([
            session.rpc.management.list({}),
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error("timed out")), PEER_TIMEOUT_MS);
            }),
        ]);
        store.setLive(peersSource(result, new Date().toISOString()));
    } catch (err) {
        // Typically: session management (list) is not enabled for this session.
        store.setLive(peersUnavailable(`session.rpc.management.list unavailable: ${err?.message ?? err}`));
    } finally {
        clearTimeout(timer);
    }
}

function syncPeerPolling() {
    if (servers.size && !peerTimer) {
        peerTimer = setInterval(probePeers, PEER_POLL_MS);
        peerTimer.unref?.();
    } else if (!servers.size && peerTimer) {
        clearInterval(peerTimer);
        peerTimer = undefined;
    }
}

function summary() {
    const view = store.view();
    return {
        now: view.now,
        sources: view.sources.map(({ id, label, scope, origin, freshness, observedAt, unavailableReason, sessionCount }) => ({
            id, label, scope, origin, freshness, observedAt, unavailableReason, sessionCount,
        })),
        sessions: view.sessions.map(({ id, name, activity, activityDetail, freshness, sourceId, observedAt }) => ({
            id, name, activity, activityDetail, freshness, sourceId, observedAt,
        })),
    };
}

const canvas = createCanvas({
    id: "session-dashboard",
    displayName: "Session dashboard",
    description: "Read-only dashboard of Copilot app sessions for this Project with activity and data-freshness status.",
    inputSchema: {
        type: "object",
        properties: {
            view: { type: "string", enum: ["project", "all"], description: "Initial scope filter (default: project)." },
        },
        additionalProperties: false,
    },
    actions: [
        {
            name: "ingest_snapshot",
            description:
                "Load a timestamped session snapshot (e.g. from the coordinator's get_sessions_status, or a future harness). Replaces the previous snapshot for the same source.id. Never send fixtures as live data.",
            inputSchema: SNAPSHOT_SCHEMA,
            handler: async (ctx) => {
                await ready;
                try {
                    return store.ingest(ctx.input);
                } catch (err) {
                    if (err instanceof SnapshotError) throw new CanvasError(err.code, err.message);
                    throw err;
                }
            },
        },
        {
            name: "get_state",
            description: "Return the dashboard's current sources and sessions with activity and freshness.",
            handler: async () => {
                await ready;
                return summary();
            },
        },
        {
            name: "refresh_peers",
            description: "Re-probe session.rpc.management.list for opted-in live peers (read-only).",
            handler: async () => {
                await ready;
                await probePeers();
                return summary().sources.find((s) => s.id === "peers");
            },
        },
        {
            name: "remove_snapshot_source",
            description: "Remove a previously ingested snapshot source from the dashboard.",
            inputSchema: {
                type: "object",
                required: ["sourceId"],
                properties: { sourceId: { type: "string" } },
                additionalProperties: false,
            },
            handler: async (ctx) => {
                await ready;
                if (!store.removeSource(ctx.input.sourceId)) {
                    throw new CanvasError("unknown_source", `No snapshot source named ${ctx.input.sourceId}`);
                }
                return { removed: ctx.input.sourceId };
            },
        },
    ],
    open: async (ctx) => {
        await ready;
        let entry = servers.get(ctx.instanceId);
        if (!entry) {
            entry = await startDashboardServer({
                uiDir: UI_DIR,
                getView: () => store.view(),
                subscribe: (fn) => store.subscribe(fn),
                onRefresh: probePeers,
                onError: logError,
            });
            servers.set(ctx.instanceId, entry);
            syncPeerPolling();
            void probePeers();
        }
        const view = ctx.input?.view === "all" ? "all" : "project";
        return { title: "Session dashboard", url: `${entry.url}?view=${view}` };
    },
    onClose: async (ctx) => {
        const entry = servers.get(ctx.instanceId);
        if (entry) {
            servers.delete(ctx.instanceId);
            syncPeerPolling();
            await entry.close();
        }
    },
});

session = await joinSession({ canvases: [canvas] });

// Snapshots are session-scoped artifacts: they describe what this session was told.
const persistPath = session.workspacePath
    ? join(session.workspacePath, "session-dashboard", "snapshots.json")
    : undefined;
store = createStore({ persistPath, onError: logError });
await store.load();

const name = await session.rpc.name.get().then((r) => r?.name ?? undefined, () => undefined);
selfState = initialSelfState({ sessionId: session.sessionId, name });
store.setLive(selfSource(selfState));

session.on((event) => {
    const next = applySelfEvent(selfState, event);
    if (next !== selfState) {
        selfState = next;
        store.setLive(selfSource(selfState));
    }
});

markReady();
