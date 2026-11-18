import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, appendFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import http from "node:http";
import { createSessionState, applyChunk, applyEvent, deriveStatus, waitingOn } from "../web/lib/events.mjs";
import { parseShortstat, collectGitStats } from "../web/lib/git.mjs";
import { SessionMonitor, parseWorkspaceYaml, lockPids } from "../web/lib/monitor.mjs";
import { createDashboardServer } from "../web/server.mjs";

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
