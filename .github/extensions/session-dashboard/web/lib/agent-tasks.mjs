import { execFile } from "node:child_process";
import { EventEmitter } from "node:events";

// GitHub's agent-task list (`gh agent-task list`, preview) covers cloud and
// remote-host Copilot sessions as well as local ones. Its states are passed
// through as reported; only the mapping to a display bucket happens here.
const FIELDS = "id,name,state,repository,createdAt,updatedAt,completedAt,pullRequestUrl,pullRequestState";
const STATE_MAP = {
    in_progress: "busy",
    queued: "busy",
    waiting_for_user: "waiting",
    idle: "idle",
    completed: "done",
    failed: "error",
    cancelled: "cancelled",
    timed_out: "error",
};
const TERMINAL = new Set(["completed", "failed", "cancelled", "timed_out"]);

export function mapTaskState(state) {
    return STATE_MAP[state] || "unknown";
}

export function normalizeTasks(list) {
    if (!Array.isArray(list)) throw new Error("unexpected agent-task output");
    return list
        .filter((t) => t && typeof t.id === "string")
        .map((t) => ({
            id: t.id,
            name: typeof t.name === "string" && t.name.trim() ? t.name.trim() : null,
            state: typeof t.state === "string" ? t.state : "unknown",
            status: mapTaskState(t.state),
            terminal: TERMINAL.has(t.state),
            repository: t.repository?.nameWithOwner || t.repository?.fullName || (typeof t.repository === "string" ? t.repository : null),
            createdAt: t.createdAt || null,
            updatedAt: t.updatedAt || null,
            completedAt: t.completedAt || null,
            pullRequestUrl: typeof t.pullRequestUrl === "string" && t.pullRequestUrl.startsWith("https://") ? t.pullRequestUrl : null,
            pullRequestState: t.pullRequestState || null,
        }));
}

function runGh(args, env) {
    return new Promise((resolve, reject) => {
        execFile("gh", args, { env, timeout: 30_000, maxBuffer: 8 << 20 }, (err, stdout, stderr) =>
            err ? reject(new Error((stderr || err.message).trim().split("\n")[0])) : resolve(stdout),
        );
    });
}

/** `gh agent-task` needs an OAuth login; an env PAT/GH_TOKEN can shadow it, so retry without. */
export async function fetchAgentTasks({ limit = 100, run = runGh } = {}) {
    const args = ["agent-task", "list", "-L", String(limit), "--json", FIELDS];
    try {
        return normalizeTasks(JSON.parse(await run(args, process.env)));
    } catch (err) {
        if (!/OAuth|auth/i.test(err.message) || !(process.env.GH_TOKEN || process.env.GITHUB_TOKEN)) throw err;
        const env = { ...process.env };
        delete env.GH_TOKEN;
        delete env.GITHUB_TOKEN;
        return normalizeTasks(JSON.parse(await run(args, env)));
    }
}

export class AgentTaskSource extends EventEmitter {
    constructor({ pollMs = 20_000, fetch = fetchAgentTasks, now = () => Date.now() } = {}) {
        super();
        this.pollMs = pollMs;
        this.fetch = fetch;
        this.now = now;
        this.tasks = [];
        this.lastOkAt = null;
        this.lastAttemptAt = null;
        this.error = null;
        this.timer = null;
    }

    async poll() {
        this.lastAttemptAt = new Date(this.now()).toISOString();
        try {
            const tasks = await this.fetch();
            const changed = JSON.stringify(tasks) !== JSON.stringify(this.tasks) || this.error;
            this.tasks = tasks;
            this.lastOkAt = this.lastAttemptAt;
            this.error = null;
            if (changed) this.emit("change");
        } catch (err) {
            if (this.error !== err.message) {
                this.error = err.message;
                this.emit("change");
            }
        }
    }

    start() {
        this.stopped = false;
        const tick = async () => {
            await this.poll();
            if (!this.stopped) this.timer = setTimeout(tick, this.pollMs);
        };
        return tick();
    }

    stop() {
        this.stopped = true;
        clearTimeout(this.timer);
    }

    info() {
        const age = this.lastOkAt ? this.now() - Date.parse(this.lastOkAt) : Infinity;
        return {
            kind: "github-agent-tasks",
            lastOkAt: this.lastOkAt,
            lastAttemptAt: this.lastAttemptAt,
            error: this.error,
            pollMs: this.pollMs,
            stale: age > this.pollMs * 3,
            count: this.tasks.length,
        };
    }
}
