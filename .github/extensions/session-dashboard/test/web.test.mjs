import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, appendFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import http from "node:http";
import { createSessionState, applyChunk, applyEvent, deriveStatus, waitingOn, openSpans, toolCategory } from "../web/lib/events.mjs";
import { parseShortstat, collectGitStats, parseCommitLog } from "../web/lib/git.mjs";
import { SessionMonitor, parseWorkspaceYaml, lockPids } from "../web/lib/monitor.mjs";
import { createDashboardServer } from "../web/server.mjs";
import { mapTaskState, normalizeTasks, fetchAgentTasks, AgentTaskSource } from "../web/lib/agent-tasks.mjs";

const ev = (type, data = {}, timestamp = "2026-01-01T00:00:00.000Z") => JSON.stringify({ type, data, timestamp, id: Math.random().toString(36) });
const COORD = "11111111-2222-3333-4444-555555555555";

test("reducer counts real events and tracks busy → done lifecycle", () => {
    const s = createSessionState("a");
    const rest = applyChunk(s, "", [
        ev("session.start", { startTime: "2026-01-01T00:00:00.000Z", selectedModel: "m1" }),
        ev("user.message", { content: "build   it", source: `agent-${COORD}` }, "2026-01-01T00:00:01.000Z"),
        ev("assistant.turn_start", {}, "2026-01-01T00:00:02.000Z"),
        ev("tool.execution_start", { toolCallId: "t1", toolName: "bash", arguments: { description: "Run tests" } }),
        "",
    ].join("\n") + '{"type":"assistant.turn_end"'); // trailing partial line is held back
    assert.equal(rest, '{"type":"assistant.turn_end"');
    assert.equal(s.coordinatorId, COORD);
    assert.equal(s.latestRequest, "build it");
    assert.equal(deriveStatus(s, { alive: true }), "busy");
    assert.deepEqual([...s.openTools.values()].map((t) => t.label), ["Run tests"]);

    applyChunk(s, rest, `,"timestamp":"2026-01-01T00:00:03.000Z"}\n`);
    applyEvent(s, JSON.parse(ev("tool.execution_complete", { toolCallId: "t1", success: false })));
    applyEvent(s, JSON.parse(ev("session.usage_record", { usage: { inputTokens: 100, outputTokens: 20, modelDisplayName: "Model X" } })));
    assert.equal(s.toolCalls, 1);
    assert.equal(s.toolFailures, 1);
    assert.equal(s.tokensIn + s.tokensOut, 120);
    assert.equal(s.model, "Model X");
    assert.equal(deriveStatus(s, { alive: true }), "idle", "idle is not done");

    applyEvent(s, JSON.parse(ev("session.task_complete", { summary: "shipped" }, "2026-01-01T00:00:05.000Z")));
    assert.equal(deriveStatus(s, { alive: true }), "done");
    applyEvent(s, JSON.parse(ev("user.message", { content: "more", source: "agent-99999999-2222-3333-4444-555555555555" }, "2026-01-01T00:00:06.000Z")));
    assert.equal(deriveStatus(s, { alive: true }), "idle", "a new request supersedes the old completion");
    assert.equal(s.coordinatorId, COORD, "later agent messages (child reports) don't reassign the coordinator");
});

test("pending permission/input blocks until completed; liveness decides offline vs disconnected", () => {
    const s = createSessionState("b");
    applyEvent(s, JSON.parse(ev("permission.requested", { requestId: "p1" })));
    applyEvent(s, JSON.parse(ev("tool.execution_start", { toolCallId: "q", toolName: "ask_user", arguments: { question: "ok?" } })));
    assert.equal(deriveStatus(s, { alive: true }), "waiting");
    assert.deepEqual(waitingOn(s).sort(), ["permission", "user answer"]);
    applyEvent(s, JSON.parse(ev("permission.completed", { requestId: "p1" })));
    applyEvent(s, JSON.parse(ev("tool.execution_complete", { toolCallId: "q", success: true })));
    assert.equal(deriveStatus(s, { alive: true }), "idle");
    assert.equal(deriveStatus(s, { alive: false }), "disconnected");
    applyEvent(s, JSON.parse(ev("session.shutdown")));
    assert.equal(deriveStatus(s, { alive: false }), "offline");
    assert.doesNotThrow(() => applyChunk(s, "", "not json\n"));
});

test("parseShortstat handles singular, plural and missing parts", () => {
    assert.deepEqual(parseShortstat(" 3 files changed, 10 insertions(+), 2 deletions(-)"), { files: 3, added: 10, removed: 2 });
    assert.deepEqual(parseShortstat(" 1 file changed, 1 insertion(+)"), { files: 1, added: 1, removed: 0 });
    assert.deepEqual(parseShortstat(""), { files: 0, added: 0, removed: 0 });
});

test("collectGitStats measures commits, committed+dirty lines and untracked files read-only", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sd-git-"));
    const git = (...a) => execFileSync("git", ["-C", dir, "-c", "user.name=t", "-c", "user.email=t@t", ...a], { stdio: "pipe" });
    try {
        git("init", "-q", "-b", "main");
        await writeFile(join(dir, "a.txt"), "1\n2\n");
        git("add", ".");
        git("commit", "-qm", "base");
        git("checkout", "-qb", "work");
        await writeFile(join(dir, "a.txt"), "1\n3\n4\n");
        git("commit", "-qam", "change");
        await appendFile(join(dir, "a.txt"), "5\n");
        await writeFile(join(dir, "new.txt"), "x\n");
        const stats = await collectGitStats(dir);
        assert.equal(stats.branch, "work");
        assert.equal(stats.baseRef, "main");
        assert.equal(stats.commits, 1);
        assert.deepEqual(stats.total, { files: 1, added: 3, removed: 1 });
        assert.deepEqual(stats.uncommitted, { files: 1, added: 1, removed: 0 });
        assert.equal(stats.untracked, 1);
        assert.equal(stats.lastCommit.subject, "change");
        assert.equal(await collectGitStats(tmpdir()), null);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test("workspace.yaml parsing and lock pid extraction", () => {
    const ws = parseWorkspaceYaml("id: x\nname: |-\n  Multi\n  line\nbranch: main\nuser_named: true\nmc: null\n");
    assert.deepEqual(ws, { id: "x", name: "Multi\nline", branch: "main", user_named: true, mc: null });
    assert.deepEqual(lockPids(["inuse.12.lock", "inuse.12.hold", "events.jsonl"]), [12]);
});

test("monitor tails appended events and server streams them over SSE", async () => {
    const root = await mkdtemp(join(tmpdir(), "sd-state-"));
    const id = "aaaaaaaa-0000-0000-0000-000000000000";
    const dir = join(root, id);
    await mkdir(dir);
    await writeFile(join(dir, "workspace.yaml"), `id: ${id}\nname: Unit A\nclient_name: github/autopilot\n`);
    await writeFile(join(dir, "events.jsonl"), ev("session.start") + "\n");
    await writeFile(join(dir, `inuse.${process.pid}.lock`), "");
    const monitor = new SessionMonitor({ root, git: async () => null });
    await monitor.scan();
    const { listen, close } = createDashboardServer({ monitor, port: 0 });
    const url = await listen();
    try {
        const first = await (await fetch(`${url}api/state`)).json();
        assert.equal(first.sessions[0].name, "Unit A");
        assert.equal(first.sessions[0].alive, true);
        assert.equal(first.sessions[0].appLink, `ghapp://sessions/${id}`);

        const controller = new AbortController();
        const res = await fetch(`${url}events`, { signal: controller.signal });
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        const readUntil = async (pred) => {
            while (!pred(buf)) buf += decoder.decode((await reader.read()).value);
        };
        await readUntil((b) => b.includes("event: state"));
        buf = "";
        await appendFile(join(dir, "events.jsonl"), ev("tool.execution_start", { toolCallId: "t", toolName: "view", arguments: { path: "/x/y.md" } }) + "\n");
        await monitor.scan();
        await readUntil((b) => b.includes("read y.md"));
        assert.match(buf, /"status":"busy"/);
        controller.abort();

        const rejected = await new Promise((resolve, reject) => {
            http.get(`${url}api/state`, { headers: { Host: "evil.example" } }, (r) => {
                r.resume();
                resolve(r.statusCode);
            }).on("error", reject);
        });
        assert.equal(rejected, 421);
    } finally {
        await close();
        await rm(root, { recursive: true, force: true });
    }
});

test("agent-task states pass through; unknown and cancelled are not coerced", () => {
    assert.equal(mapTaskState("waiting_for_user"), "waiting");
    assert.equal(mapTaskState("cancelled"), "cancelled");
    assert.equal(mapTaskState("something_new"), "unknown");
    const [t] = normalizeTasks([{ id: "x", name: " N ", state: "idle", repository: null, pullRequestUrl: "javascript:alert(1)" }, { nope: 1 }]);
    assert.deepEqual([t.name, t.status, t.terminal, t.repository, t.pullRequestUrl], ["N", "idle", false, null, null]);
});

test("fetchAgentTasks retries without an env token on OAuth errors", async () => {
    const saved = process.env.GH_TOKEN;
    process.env.GH_TOKEN = "env-token";
    const envs = [];
    try {
        const tasks = await fetchAgentTasks({
            run: async (_args, env) => {
                envs.push(env.GH_TOKEN);
                if (env.GH_TOKEN) throw new Error("this command requires an OAuth token");
                return JSON.stringify([{ id: "t1", state: "in_progress" }]);
            },
        });
        assert.deepEqual(envs, ["env-token", undefined]);
        assert.equal(tasks[0].status, "busy");
    } finally {
        if (saved === undefined) delete process.env.GH_TOKEN;
        else process.env.GH_TOKEN = saved;
    }
});

test("monitor merges GitHub tasks: annotates local, adds remote-only, keeps local status", async () => {
    const root = await mkdtemp(join(tmpdir(), "mc-remote-"));
    const local = "aaaaaaaa-0000-0000-0000-000000000001";
    try {
        await mkdir(join(root, local));
        await writeFile(join(root, local, "workspace.yaml"), `id: ${local}\nname: Local\n`);
        await writeFile(join(root, local, "events.jsonl"), ev("session.start") + "\n");
        await writeFile(join(root, local, `inuse.${process.pid}.lock`), "");
        const now = Date.parse("2026-01-02T00:00:00.000Z");
        const tasks = new AgentTaskSource({
            now: () => now,
            fetch: async () =>
                normalizeTasks([
                    { id: local, state: "cancelled", updatedAt: "2026-01-01T23:00:00.000Z" },
                    { id: "cloud-1", name: "Cloud", state: "idle", updatedAt: "2026-01-01T23:00:00.000Z" },
                    { id: "cloud-2", name: "Old", state: "idle", updatedAt: "2025-12-01T00:00:00.000Z" },
                    { id: "cloud-3", name: "Gone", state: "completed", updatedAt: "2026-01-01T23:00:00.000Z" },
                ]),
        });
        await tasks.poll();
        const monitor = new SessionMonitor({ root, git: async () => null, tasks, now: () => now });
        await monitor.scan();
        const v = monitor.view();
        const byId = Object.fromEntries(v.sessions.map((s) => [s.id, s]));
        assert.equal(byId[local].origin, "local");
        assert.notEqual(byId[local].status, "cancelled");
        assert.equal(byId[local].githubTask.state, "cancelled");
        assert.equal(byId["cloud-1"].origin, "github");
        assert.equal(byId["cloud-1"].metrics, null);
        assert.deepEqual([byId["cloud-1"].online, byId["cloud-2"].online, byId["cloud-3"].online], [true, false, false]);
        assert.equal(v.remote.count, 4);
        assert.equal(v.remote.stale, false);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("timeline: spans per tool category, links only from real message evidence", () => {
    const s = createSessionState("child");
    const T = (sec) => `2026-01-01T00:00:${String(sec).padStart(2, "0")}.000Z`;
    const peer = COORD;
    for (const e of [
        { type: "session.start", data: { startTime: T(0) }, timestamp: T(0) },
        { type: "user.message", data: { content: "go", source: `agent-${peer}` }, timestamp: T(1) },
        { type: "assistant.turn_start", data: {}, timestamp: T(2) },
        { type: "tool.execution_start", data: { toolName: "edit", toolCallId: "e1", arguments: { path: "/a.js" } }, timestamp: T(3) },
        { type: "tool.execution_complete", data: { toolCallId: "e1", success: true }, timestamp: T(4) },
        { type: "tool.execution_start", data: { toolName: "send_session_message", toolCallId: "m1", arguments: { session_id: peer, purpose: "handoff" } }, timestamp: T(10) },
        { type: "tool.execution_complete", data: { toolCallId: "m1", success: true }, timestamp: T(11) },
        { type: "tool.execution_start", data: { toolName: "send_session_message", toolCallId: "m2", arguments: { session_id: "not-a-session" } }, timestamp: T(12) },
        { type: "assistant.turn_end", data: {}, timestamp: T(20) },
        { type: "user.message", data: { content: "hi" }, timestamp: T(30) },
        { type: "assistant.turn_start", data: {}, timestamp: T(31) },
        { type: "tool.execution_start", data: { toolName: "bash", toolCallId: "b1", arguments: {} }, timestamp: T(32) },
    ]) applyEvent(s, e);
    assert.deepEqual(s.spans.map((x) => x.k), ["edit", "coord", "think"]);
    assert.deepEqual(s.links.map((l) => [l.dir, l.k, l.peer]), [["in", "kickoff", peer], ["out", "handoff", peer]]);
    assert.ok(s.marks.some((m) => m.k === "human" && m.at === T(30)));
    assert.deepEqual(openSpans(s).map((x) => [x.k, x.e]).sort(), [["coord", null], ["run", null], ["think", null]]);
    assert.equal(toolCategory("playwright-browser_click"), "web");
});

test("parseCommitLog flags merge commits by parent count, oldest first", () => {
    const log = "2026-01-01T02:00:00Z\tp1 p2\tMerge main\n2026-01-01T01:00:00Z\tp0\tAdd thing";
    assert.deepEqual(parseCommitLog(log).map((c) => [c.subject, c.merge]), [["Add thing", false], ["Merge main", true]]);
    assert.deepEqual(parseCommitLog(""), []);
});
