# Session dashboard

Two views of the Copilot sessions running on this machine:

1. **Agent timeline (primary): a live web dashboard** in `web/`. Each agent gets
   an avatar and a lane on a shared timeline, and lanes are grouped by
   coordinator. Coloured spans show the kind of work, and connectors show
   spawns, messages and handoffs between agents. It also polls GitHub's
   agent-task list for cloud sessions and sessions on other hosts.
2. **Canvas (legacy)**: the in-app canvas described further below. It shows only
   coordinator-fed snapshots and is kept for reference.

## Mission Control web dashboard

```bash
node .github/extensions/session-dashboard/web/server.mjs            # http://127.0.0.1:4517/
node .github/extensions/session-dashboard/web/server.mjs --port 0 --root /path/to/session-state
node .github/extensions/session-dashboard/web/server.mjs --no-remote   # local only, skip GitHub
```

Requires Node 22+ (built-ins only, no install step) and binds to 127.0.0.1 only.
Requests carrying any other `Host` header get a 421 response, which blocks DNS rebinding.

### Where every value comes from (read-only)

| Shown | Source |
| --- | --- |
| Units, name, repo, branch, app link | `$COPILOT_HOME/session-state/<id>/workspace.yaml` |
| GitHub task state, cloud/other-host units, PR link | `gh agent-task list` (see below) |
| Process live / signal lost / offline | `inuse.<pid>.lock` whose PID is alive; `session.shutdown` event |
| Status (In action, Needs you, Standby, Reported done, Error) | Reduced from `events.jsonl`: open turns or tool calls, pending `permission`/`user_input`/`exit_plan_mode` requests, an open `ask_user`, `session.task_complete` after the latest message, `session.error` |
| Now / Last action (detail panel) | `tool.execution_start` arguments (bash description, file name, URL…) |
| Latest ask, coordinator grouping | Latest `user.message`. A session's first (kickoff) message with `source: "agent-<id>"` links it to its coordinator |
| Tools, turns, fails, tokens, reports | Counts and sums of logged events (`session.usage_record` for tokens) |
| +/− lines, files, commits, dirty, new files | `git diff --shortstat <merge-base>`, `rev-list --count`, `diff HEAD`, `ls-files --others` against `origin/main` (or `main`), run with `GIT_OPTIONAL_LOCKS=0` so nothing is written |

`events.jsonl` is tailed from a byte offset every second. Git stats refresh when a
session changes, with a 5 s floor and a 30 s ceiling. Updates reach the browser
over Server-Sent Events (`/events`), and `/api/state` returns the same JSON.

### Timeline view

- **Lanes:** one per agent. A child is indented under the coordinator that spawned it. The line runs from session start to now while the process is live, and is dotted once it has ended.
- **Spans:** coloured by what the agent was doing, taken from logged events:
  - thin lavender: an assistant turn (*thinking*), from `assistant.turn_start` to `assistant.turn_end`.
  - thick: a tool call, from `tool.execution_start` to `tool.execution_complete`, coloured by tool: reading, editing, running commands, web/browser, coordinating, or other.
  - red: waiting on a permission, input or `ask_user`.
  - Spans still open pulse at the "now" edge. Adjacent spans of the same kind are merged when the gap is under 3 s.
- **Connectors:** drawn only from message evidence.
  - *Spawned* (blue): the child's first `user.message` with `source: agent-<coordinator>`.
  - *Message* (grey, dashed): a later message with that source, or a `send_session_message` call whose `session_id` is a known lane.
  - *Handoff* (green): the same call with `purpose: handoff`.
  - A delivery that appears in both logs is drawn once.
  - Nothing is drawn as a "merge" when an agent goes idle or reports done.
- **Moments:** dots and diamonds above a lane.
  - *Person sent a message:* a `user.message` with no source.
  - *Reported done:* `session.task_complete`.
  - *Error:* `session.error`.
  - *Commit:* `git log merge-base..HEAD`, showing only commits made after the session started.
  - *Merge commit:* a commit with two or more parents. This is the only thing called a code merge.
- **Cloud lanes:** a hatched bar from created to last-updated, labelled "no event detail". Unfinished tasks get a dotted tail to now, because what happened after the last update isn't known.
- **Detail panel:** click a lane to see status, current or last action, repo, branch and the coordinator it reports to. It also shows the GitHub task state and secondary metrics: lines changed vs main, commits, tool calls, turns, tokens and failed calls. Lines are labelled as output, not progress.
- **Avatars:** original, drawn as inline SVG and seeded by session id. They are inspired by friendly Mii-style characters, but use no Nintendo assets.

Honesty rules:
- **Activity is separate from freshness.** Each agent shows *last signal*, the time since the session last wrote an event. The header shows the feed as Live, Stale (no heartbeat for more than 15 s) or Disconnected.
- **Idle never means done.** "Reported done" requires the session's own `task_complete`.
- **There are no progress percentages.** Lines of work are output, not completion.
- **Gaps are shown as gaps.** Untracked files are counted but not line-diffed, and sessions without a git worktree show "n/a".
- **Read-only.** The dashboard never writes to session-state or to any worktree. `session.db` (SQL todos) is not opened, because SQLite may create `-shm` files.

Limitation: the dashboard sees only sessions whose state lives in this machine's
`$COPILOT_HOME`, which covers Copilot app and CLI sessions. Cloud or remote sessions
aren't included. A future harness can appear here by writing the same
`events.jsonl` + `workspace.yaml` layout, or through the snapshot format below.

### Cloud and other hosts: GitHub agent tasks (polled)

`web/lib/agent-tasks.mjs` runs `gh agent-task list --json …` every 20 s. This is
the only supported source found for sessions that aren't on this machine. The
Copilot app's session tools are agent-only, so a Node server can't call them,
and the canvas SDK has no session-discovery API.

- **Auth:** the command needs an OAuth `gh auth login` with the Copilot scope. If
  a `GH_TOKEN`/`GITHUB_TOKEN` env PAT shadows it, the source retries once
  without the env token. Failures appear in the header's **Cloud** chip; they
  never show up as statuses.
- **Matching:** a task whose `id` equals a local session id is the same session.
  Its card keeps the local, event-derived status and shows *GitHub task state*
  beside it. The two can disagree; for example, a live local session may be
  listed as `cancelled` remotely. Neither state overrides the other.
- **Remote-only tasks** go in the *Cloud & other hosts* lane, with the raw state
  passed through (`in_progress`, `queued`, `waiting_for_user`, `idle`,
  `completed`, `failed`, `timed_out`, `cancelled`). Unrecognised states show as
  **Unknown**. *Online* means a state that isn't terminal; an `idle` task also
  has to have been updated in the last 24 h.

Coverage limits (verified with gh 2.103, Nov 2026):
- `gh agent-task` is a **preview** command, so its output may change.
- It lists only the **signed-in user's** tasks (up to 100).
- It is **polled**, not streamed. Remote state can be up to about 20 s old, and the Cloud chip turns stale after 60 s.
- `repository` was null for every task, and there is no parent or coordinator field. Remote tasks therefore can't be placed in a coordinated team or repository group.
- The source exposes no activity, tool calls, tokens or lines of work. Remote cards say so rather than showing zeros. `gh agent-task view --log` exists but isn't used yet.

### Workstreams: what grouping is authoritative

- **Coordinated teams** come from the coordinator → child link that the app records in each
  child's kickoff `user.message.source` (`agent-<coordinatorId>`). Chains resolve
  to the root coordinator. This is authoritative but local only.
- **Repository lanes** come from `workspace.yaml` `repository`. Sessions with no
  repository fall back to a lane named "-".
- A team's *objective* is only the kickoff message text. No source provides
  milestones, goals or completion criteria.
- Per-agent +/− lines are git output. They are **not** progress toward
  finishing a workstream, and the UI shows no percentages. A team is "done"
  only per unit, when that session reports `task_complete`.

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
