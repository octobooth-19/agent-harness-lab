# Session dashboard (Copilot app canvas)

A read-only canvas that lists the Copilot app sessions working in this Project,
with **activity** (busy / idle / blocked / error / unknown) shown separately from
**data freshness** (live / snapshot / stale / unavailable). It never launches,
cancels, approves, or merges anything, and never treats *idle* as *done*.

Open it from any Copilot app session in this repo:

```text
open_canvas({ canvasId: "session-dashboard", instanceId: "sessions", input: { view: "project" } })
```

`view` is `project` (default) or `all` (also shows local/other-scope sources).

## Data sources and limits

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

## Snapshot shape (Copilot app or future harness)

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

## Storage

Snapshots persist as a session-scoped artifact at
`<session workspace>/session-dashboard/snapshots.json`, so they survive reloads
with their original timestamps. Nothing is written into the repository, and no
state is tied to a canvas `instanceId`.

## Development

```sh
node --test .github/extensions/session-dashboard/test/
```

After editing, run `extensions_reload` and then reopen the canvas.
`extensions_manage({ operation: "inspect", name: "session-dashboard" })` shows
the log.
