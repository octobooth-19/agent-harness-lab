import { readdir, readFile, stat, open } from "node:fs/promises";
import { EventEmitter } from "node:events";
import { join } from "node:path";
import { homedir } from "node:os";
import { createSessionState, applyChunk, deriveStatus, waitingOn } from "./events.mjs";
import { collectGitStats } from "./git.mjs";

export function defaultSessionRoot() {
    return join(process.env.COPILOT_HOME || join(homedir(), ".copilot"), "session-state");
}

/** Minimal parser for the flat `key: value` workspace.yaml (supports `|-` blocks). */
export function parseWorkspaceYaml(text) {
    const out = {};
    const lines = String(text).split("\n");
    for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(/^([A-Za-z_][\w-]*):\s?(.*)$/);
        if (!m) continue;
        let value = m[2];
        if (/^[|>][-+]?$/.test(value)) {
            const block = [];
            while (i + 1 < lines.length && /^\s+/.test(lines[i + 1])) block.push(lines[++i].trim());
            value = block.join(value.startsWith(">") ? " " : "\n");
        } else if (value === "null" || value === "~" || value === "") {
            value = null;
        } else if (value === "true" || value === "false") {
            value = value === "true";
        } else if (/^(['"]).*\1$/.test(value)) {
            value = value.slice(1, -1);
        }
        out[m[1]] = value;
    }
    return out;
}

export function pidAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    } catch (err) {
        return err.code === "EPERM";
    }
}

export function lockPids(fileNames) {
    return fileNames.map((f) => f.match(/^inuse\.(\d+)\.lock$/)).filter(Boolean).map((m) => Number(m[1]));
}

const GIT_MIN_INTERVAL_MS = 5_000;
const GIT_MAX_INTERVAL_MS = 30_000;
const RECENT_MS = 24 * 60 * 60 * 1000;

/**
 * Watches $COPILOT_HOME/session-state read-only: tails each events.jsonl from
 * a byte offset, reads workspace.yaml, checks inuse.<pid>.lock liveness, and
 * collects git line stats for each worktree. Emits "change" when anything moves.
 */
export class SessionMonitor extends EventEmitter {
    constructor({ root = defaultSessionRoot(), pollMs = 1000, git = collectGitStats, now = () => Date.now() } = {}) {
        super();
        this.root = root;
        this.pollMs = pollMs;
        this.git = git;
        this.now = now;
        this.sessions = new Map();
        this.gitByCwd = new Map();
        this.lastScanAt = null;
        this.scanError = null;
        this.timer = null;
        this.scanning = false;
    }

    start() {
        const tick = async () => {
            await this.scan();
            this.timer = setTimeout(tick, this.pollMs);
        };
        return tick();
    }

    stop() {
        clearTimeout(this.timer);
        this.timer = null;
    }

    async scan() {
        if (this.scanning) return;
        this.scanning = true;
        let changed = false;
        try {
            const dirs = await readdir(this.root, { withFileTypes: true });
            const seen = new Set();
            for (const d of dirs) {
                if (!d.isDirectory()) continue;
                seen.add(d.name);
                changed = (await this.scanSession(d.name)) || changed;
            }
            for (const id of this.sessions.keys()) {
                if (!seen.has(id)) {
                    this.sessions.delete(id);
                    changed = true;
                }
            }
            this.scanError = null;
        } catch (err) {
            if (this.scanError !== err.message) changed = true;
            this.scanError = err.message;
        } finally {
            this.lastScanAt = new Date(this.now()).toISOString();
            this.scanning = false;
        }
        this.refreshGit();
        if (changed) this.emit("change");
    }

    async scanSession(id) {
        const dir = join(this.root, id);
        let names;
        try {
            names = await readdir(dir);
        } catch {
            return false;
        }
        if (!names.includes("events.jsonl")) return false;
        let entry = this.sessions.get(id);
        if (!entry) {
            entry = { id, dir, offset: 0, partial: "", state: createSessionState(id), workspace: {}, wsMtime: 0, alive: false, changedAt: 0 };
            this.sessions.set(id, entry);
        }
        let changed = false;

        const alive = lockPids(names).some(pidAlive);
        if (alive !== entry.alive) {
            entry.alive = alive;
            changed = true;
        }

        if (names.includes("workspace.yaml")) {
            try {
                const s = await stat(join(dir, "workspace.yaml"));
                if (s.mtimeMs !== entry.wsMtime) {
                    entry.workspace = parseWorkspaceYaml(await readFile(join(dir, "workspace.yaml"), "utf8"));
                    entry.wsMtime = s.mtimeMs;
                    changed = true;
                }
            } catch {
                // keep previous workspace info
            }
        }

        try {
            const path = join(dir, "events.jsonl");
            const s = await stat(path);
            if (s.size < entry.offset) {
                entry.offset = 0;
                entry.partial = "";
                entry.state = createSessionState(id);
            }
            if (s.size > entry.offset) {
                const fh = await open(path, "r");
                try {
                    const length = s.size - entry.offset;
                    const buf = Buffer.alloc(length);
                    const { bytesRead } = await fh.read(buf, 0, length, entry.offset);
                    entry.offset += bytesRead;
                    entry.partial = applyChunk(entry.state, entry.partial, buf.subarray(0, bytesRead).toString("utf8"));
                } finally {
                    await fh.close();
                }
                entry.changedAt = this.now();
                changed = true;
            }
        } catch {
            // unreadable this tick; retry next poll
        }
        return changed;
    }

    inScope(entry) {
        if (entry.alive) return true;
        const last = Date.parse(entry.state.lastEventAt || "");
        return Number.isFinite(last) && this.now() - last < RECENT_MS;
    }

    refreshGit() {
        const now = this.now();
        const wanted = new Map();
        for (const e of this.sessions.values()) {
            const cwd = e.workspace.cwd;
            if (!cwd || !e.workspace.git_root || !this.inScope(e)) continue;
            wanted.set(cwd, Math.max(wanted.get(cwd) || 0, e.changedAt));
        }
        for (const [cwd, changedAt] of wanted) {
            const g = this.gitByCwd.get(cwd) || { stats: null, at: 0, running: false, error: null };
            this.gitByCwd.set(cwd, g);
            if (g.running) continue;
            const age = now - g.at;
            if (!(age > GIT_MAX_INTERVAL_MS || (changedAt > g.at && age > GIT_MIN_INTERVAL_MS))) continue;
            g.running = true;
            this.git(cwd)
                .then((stats) => {
                    const before = JSON.stringify({ ...g.stats, collectedAt: 0 });
                    g.stats = stats;
                    g.error = stats ? null : "not a git worktree";
                    if (JSON.stringify({ ...stats, collectedAt: 0 }) !== before) this.emit("change");
                })
                .catch((err) => {
                    g.error = err.message;
                })
                .finally(() => {
                    g.at = this.now();
                    g.running = false;
                });
        }
    }

    view() {
        const now = this.now();
        const sessions = [];
        for (const e of this.sessions.values()) {
            const s = e.state;
            const ws = e.workspace;
            const g = ws.cwd ? this.gitByCwd.get(ws.cwd) : null;
            sessions.push({
                id: e.id,
                name: typeof ws.name === "string" && ws.name.trim() ? ws.name.trim() : null,
                repository: ws.repository || null,
                branch: g?.stats?.branch || ws.branch || null,
                cwd: ws.cwd || null,
                hasGitRoot: Boolean(ws.git_root),
                client: ws.client_name || null,
                appLink: ws.client_name === "github/autopilot" ? `ghapp://sessions/${e.id}` : null,
                alive: e.alive,
                inScope: this.inScope(e),
                status: deriveStatus(s, { alive: e.alive }),
                waitingOn: e.alive ? waitingOn(s) : [],
                coordinatorId: s.coordinatorId,
                startedAt: s.startedAt || ws.created_at || null,
                lastEventAt: s.lastEventAt,
                model: s.model,
                mode: s.mode,
                metrics: {
                    turns: s.turns,
                    toolCalls: s.toolCalls,
                    toolFailures: s.toolFailures,
                    tokensIn: s.tokensIn,
                    tokensOut: s.tokensOut,
                    userMessages: s.userMessages,
                    completions: s.completions.length,
                },
                current: e.alive ? [...s.openTools.values()].map((t) => t.label) : [],
                lastActivity: s.lastActivity,
                latestRequest: s.latestRequest,
                latestRequestAt: s.latestRequestAt,
                lastCompletion: s.completions[s.completions.length - 1] || null,
                lastError: s.lastError,
                git: g ? { ...g.stats, error: g.error, stale: g.at > 0 && now - g.at > GIT_MAX_INTERVAL_MS * 3 } : null,
                feed: s.feed.slice(-12),
            });
        }
        return {
            generatedAt: new Date(now).toISOString(),
            source: { kind: "session-state", root: this.root, lastScanAt: this.lastScanAt, error: this.scanError, pollMs: this.pollMs },
            sessions,
        };
    }
}
