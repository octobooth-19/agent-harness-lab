# Session dashboard

Two views of the Copilot sessions running on this machine:

1. **Mission Control (primary): a live web dashboard** in `web/`. It tracks every
   local Copilot session as a game-style unit card, with units grouped into squads
   by coordinator, or by repository when a session has no coordinator.
2. **Canvas (legacy)**: the in-app canvas described further below. It shows only
   coordinator-fed snapshots and is kept for reference.

## Mission Control web dashboard

```bash
node .github/extensions/session-dashboard/web/server.mjs            # http://127.0.0.1:4517/
node .github/extensions/session-dashboard/web/server.mjs --port 0 --root /path/to/session-state
```

Requires Node 22+ (built-ins only, no install step) and binds to 127.0.0.1 only.
Requests carrying any other `Host` header get a 421 response, which blocks DNS rebinding.

### Where every value comes from (read-only)

| Shown | Source |
| --- | --- |
| Units, name, repo, branch, app link | `$COPILOT_HOME/session-state/<id>/workspace.yaml` |
| Process live / signal lost / offline | `inuse.<pid>.lock` whose PID is alive; `session.shutdown` event |
| Status (In action, Needs you, Standby, Reported done, Error) | Reduced from `events.jsonl`: open turns or tool calls, pending `permission`/`user_input`/`exit_plan_mode` requests, an open `ask_user`, `session.task_complete` after the latest message, `session.error` |
| Now / Last action, comms feed | `tool.execution_start` arguments (bash description, file name, URL…) |
| Orders, squads | Latest `user.message`. A session's first (kickoff) message with `source: "agent-<id>"` links it to its coordinator |
| Tools, turns, fails, tokens, reports | Counts and sums of logged events (`session.usage_record` for tokens) |
| +/− lines, files, commits, dirty, new files | `git diff --shortstat <merge-base>`, `rev-list --count`, `diff HEAD`, `ls-files --others` against `origin/main` (or `main`), run with `GIT_OPTIONAL_LOCKS=0` so nothing is written |

`events.jsonl` is tailed from a byte offset every second. Git stats refresh when a
session changes, with a 5 s floor and a 30 s ceiling. Updates reach the browser
over Server-Sent Events (`/events`), and `/api/state` returns the same JSON.

Honesty rules:
- **Activity is separate from freshness.** Each card shows *last signal*, the time since the session last wrote an event. The header shows the feed as Live, Stale (no heartbeat for more than 15 s) or Disconnected.
- **Idle never means done.** "Reported done" requires the session's own `task_complete`.
- **There are no progress percentages.** Bars compare units with the top unit currently on screen. Lines of work are output, not completion.
- **Gaps are shown as gaps.** Untracked files are counted but not line-diffed, and sessions without a git worktree show "n/a".
- **Read-only.** The dashboard never writes to session-state or to any worktree. `session.db` (SQL todos) is not opened, because SQLite may create `-shm` files.

Limitation: the dashboard sees only sessions whose state lives in this machine's
`$COPILOT_HOME`, which covers Copilot app and CLI sessions. Cloud or remote sessions
aren't included. A future harness can appear here by writing the same
`events.jsonl` + `workspace.yaml` layout, or through the snapshot format below.

## Canvas (legacy)

A read-only canvas that lists the Copilot app sessions working in this Project,
with **activity** (busy / idle / blocked / error / unknown) shown separately from
**data freshness** (live / snapshot / stale / unavailable). It never launches,
cancels, approves, or merges anything, and never treats *idle* as *done*.

Open it from any Copilot app session in this repo:

```text
open_canvas({ canvasId: "session-dashboard", instanceId: "sessions", input: { view: "project" } })
```

`view` is `project` (default) or `all` (also shows local/other-scope sources).

### Data sources and limits

What a canvas extension can actually see, checked against the bundled Copilot SDK
(`canvas.d.ts`, `session.d.ts`, `generated/rpc.d.ts`):

| Source | How | Freshness | Notes |
| --- | --- | --- | --- |
| This session | `session.on(...)` SDK events | Live | Busy on turn/tool start, blocked on input/plan/permission requests, idle on `session.idle`. Unknown until the first event after load. |
| Opted-in peers | `session.rpc.management.list()` | Live or unavailable | Session management is **off by default** and returns `This session management tool is disabled`. The dashboard shows that reason and never enables the policy for you. |
| Project snapshot | `ingest_snapshot` canvas action | Snapshot → stale | Supplied by an agent (for example, the Project coordinator after `get_sessions_status`) or, later, by the harness. It needs `observedAt` and turns stale after `staleAfterSeconds` (default 600). |

**Limitation:** the SDK gives a canvas no API that lists all Copilot app
sessions. Host tools such as `get_sessions_status` can be called by agents, but
not by iframe JavaScript or `session.rpc`. Without opted-in peers, the dashboard
only updates other sessions when someone sends a snapshot, so it can't monitor
them live by itself. The dashboard does not read private app databases or other
sessions' `events.jsonl`.

### Snapshot shape (Copilot app or future harness)

```json
{
  "source": { "id": "copilot-app-project", "kind": "copilot-app", "label": "App status snapshot", "scope": "project" },
  "observedAt": "2026-11-18T17:04:20Z",
  "staleAfterSeconds": 600,
  "sessions": [
    { "id": "…", "name": "…", "activity": "busy", "activityDetail": "awaiting plan approval",
      "provider": "GitHub Copilot app", "branch": "…", "appUrl": "ghapp://sessions/…" }
  ]
}
```

- `source.kind` is `copilot-app`, `harness`, or `other`. A future harness can
  push its own sessions under a separate `source.id`, using the same contract.
- Each new snapshot replaces the earlier one for the same `source.id`. The
  dashboard rejects any snapshot older than the one it already has.
- When several sources report the same session `id`, it shows one row. A live
  report beats a fresh snapshot, and a fresh snapshot beats a stale one. The
  other reports appear as "also".
- Links must use `ghapp:` or `https:`; the dashboard drops any other link.

Other actions: `get_state`, `refresh_peers`, and `remove_snapshot_source`.

### Storage

Snapshots persist as a session-scoped artifact at
`<session workspace>/session-dashboard/snapshots.json`, so they survive reloads
with their original timestamps. Nothing is written into the repository, and no
state is tied to a canvas `instanceId`.

### Development

```sh
node --test .github/extensions/session-dashboard/test/
```

After editing, run `extensions_reload` and then reopen the canvas.
`extensions_manage({ operation: "inspect", name: "session-dashboard" })` shows
the log.
