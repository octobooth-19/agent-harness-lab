import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildView, normalizeSnapshot, safeUrl, SnapshotError } from "../lib/model.mjs";
import { applySelfEvent, initialSelfState, peersSource, selfSource } from "../lib/live.mjs";
import { createStore } from "../lib/store.mjs";

const NOW = Date.parse("2026-11-18T17:00:00Z");
const snapshot = (over = {}) => ({
    source: { id: "copilot-app-project", kind: "copilot-app", label: "Coordinator snapshot", scope: "project" },
    observedAt: "2026-11-18T16:58:00Z",
    sessions: [
        { id: "a", name: "Alpha", activity: "busy", appUrl: "ghapp://sessions/a" },
        { id: "b", name: "Beta", activity: "idle", appUrl: "javascript:alert(1)" },
    ],
    ...over,
});

test("snapshot requires a real observation timestamp", () => {
    assert.throws(() => normalizeSnapshot(snapshot({ observedAt: undefined }), { now: NOW }), SnapshotError);
    assert.throws(() => normalizeSnapshot(snapshot({ observedAt: "2026-11-18T18:00:00Z" }), { now: NOW }), /future/);
});

test("snapshot rejects reserved live source ids, bad activities and duplicates", () => {
    assert.throws(() => normalizeSnapshot(snapshot({ source: { ...snapshot().source, id: "self" } }), { now: NOW }), /reserved/);
    assert.throws(
        () => normalizeSnapshot(snapshot({ sessions: [{ id: "a", name: "A", activity: "done" }] }), { now: NOW }),
        /activity/,
    );
    assert.throws(
        () => normalizeSnapshot(snapshot({ sessions: [{ id: "a", name: "A", activity: "idle" }, { id: "a", name: "A2", activity: "idle" }] }), { now: NOW }),
        /duplicate/,
    );
});

test("only ghapp: and https: links survive", () => {
    const s = normalizeSnapshot(snapshot(), { now: NOW });
    assert.equal(s.sessions[0].appUrl, "ghapp://sessions/a");
    assert.equal(s.sessions[1].appUrl, undefined);
    assert.equal(safeUrl("http://example.com"), undefined);
});

test("freshness is independent of activity and turns stale after the threshold", () => {
    const s = normalizeSnapshot(snapshot({ staleAfterSeconds: 60 }), { now: NOW });
    const fresh = buildView([s], Date.parse("2026-11-18T16:58:30Z"));
    assert.deepEqual(fresh.sessions.map((r) => [r.activity, r.freshness]), [["busy", "fresh"], ["idle", "fresh"]]);
    const stale = buildView([s], NOW);
    assert.deepEqual(stale.sessions.map((r) => [r.activity, r.freshness]), [["busy", "stale"], ["idle", "stale"]]);
});

test("a live observation of the same session wins over a snapshot and keeps its links", () => {
    const snap = normalizeSnapshot(snapshot(), { now: NOW });
    let self = initialSelfState({ sessionId: "a", name: "Alpha (me)", connectedAt: "2026-11-18T16:59:00Z" });
    self = applySelfEvent(self, { type: "session.idle", timestamp: "2026-11-18T16:59:30Z" });
    const view = buildView([selfSource(self), snap], NOW);
    const a = view.sessions.find((r) => r.id === "a");
    assert.equal(a.activity, "idle");
    assert.equal(a.freshness, "live");
    assert.equal(a.appUrl, "ghapp://sessions/a");
    assert.equal(a.alsoReportedBy[0].activity, "busy");
});

test("self tracker: unknown until observed, blocked until every request completes, idle is not completion", () => {
    let s = initialSelfState({ sessionId: "x" });
    assert.equal(s.activity, "unknown");
    s = applySelfEvent(s, { type: "assistant.turn_start", timestamp: "t1" });
    assert.equal(s.activity, "busy");
    s = applySelfEvent(s, { type: "user_input.requested" });
    s = applySelfEvent(s, { type: "permission.requested" });
    s = applySelfEvent(s, { type: "user_input.completed" });
    assert.equal(s.activity, "blocked");
    assert.equal(s.activityDetail, "awaiting permission");
    assert.equal(applySelfEvent(s, { type: "tool.execution_start" }).activity, "blocked");
    s = applySelfEvent(s, { type: "permission.completed" });
    assert.equal(s.activity, "busy");
    s = applySelfEvent(s, { type: "session.idle" });
    assert.equal(s.activity, "idle");
    assert.match(s.activityDetail, /does not mean the task is complete/);
    assert.equal(applySelfEvent(s, { type: "assistant.message_delta" }), s);
});

test("peer results drop private session-state paths and map unknown states truthfully", () => {
    const src = peersSource(
        { sessions: [{ sessionId: "p", name: "Peer", cwd: "/x", state: "weird", sessionStatePath: "/private" }] },
        "2026-11-18T17:00:00Z",
    );
    assert.equal(src.sessions[0].activity, "unknown");
    assert.ok(!JSON.stringify(src).includes("/private"));
});

test("store persists snapshots only, refuses older snapshots, and reloads", async () => {
    const dir = await mkdtemp(join(tmpdir(), "session-dashboard-"));
    try {
        const path = join(dir, "nested", "snapshots.json");
        const store = createStore({ persistPath: path });
        store.setLive(selfSource(initialSelfState({ sessionId: "me" })));
        assert.equal(store.ingest(snapshot()).accepted, true);
        assert.equal(store.ingest(snapshot({ observedAt: "2026-11-18T16:00:00Z" })).accepted, false);
        await store.flush();
        const saved = JSON.parse(await readFile(path, "utf8"));
        assert.deepEqual(saved.snapshots.map((s) => s.id), ["copilot-app-project"]);

        const reloaded = createStore({ persistPath: path });
        await reloaded.load();
        const view = reloaded.view(NOW);
        assert.equal(view.sessions.length, 2);
        assert.equal(view.sources[0].observedAt, "2026-11-18T16:58:00.000Z");
        assert.equal(reloaded.removeSource("copilot-app-project"), true);
        assert.equal(reloaded.removeSource("self"), false);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});
