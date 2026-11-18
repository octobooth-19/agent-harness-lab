# Agent benchmark framework

The primary operator is the **Copilot Project coordinator**. In the app, invoke
the [`benchmark` skill](../.github/skills/benchmark/SKILL.md), for example:

> Run the incident-summary benchmark, both variants, one trial each, using fresh
> Copilot app sessions and independent judge sessions. Report the evidence and scores.

The skill is the app-native trigger; the commands below are tools the agent uses,
not a requirement for a human to operate a terminal. No extension, service, npm
package, or Python package is required. Use Node.js 22 or newer.

The [AI SDLC campaign](campaigns/sdlc-20261118/README.md) adds a representative
out-of-box versus pinned-harness suite, including a real reproducible public
Lodash issue with licensed upstream source and pre-fix failure evidence. It uses
app-launched subjects/judges, source pins, and external held-out evaluators.

See the [design](design.md), [architecture diagram](architecture.md), and
[record schema](schema.md). The executable schema lives in `schema.mjs`.

## What is evaluated

A **case** defines a task, fixture files, pinned rubric, deterministic checks, and
named variants. Each variant composes versioned **components**: prompt text and/or
files for skills, custom instructions, agents, MCP/tool configuration, or an entire
harness. Its optional runtime settings select an agent or MCP configuration.

Variants run separately, with the same task and rubric. The example compares a
minimal prompt with evidence/uncertainty guidance on an incident-summary task.
It is a functioning example, **not evidence that one prompt is better**. Repeat
trials with controlled environment/model settings before making a comparison.

## Agent-facing commands

All commands emit JSON on success and a `bench:` error on stderr with a nonzero
exit status on failure. Paths passed to `--file` and `--receipt` are resolved from
the caller's working directory; catalog paths use this checkout by default.
`--root ABS` selects another lab checkout.

```sh
node bench/cli.mjs --help
node bench/cli.mjs validate
node bench/cli.mjs catalog list cases
node bench/cli.mjs catalog read cases incident-summary --version 1
node bench/cli.mjs catalog create components --file /absolute/new-component.json
node bench/cli.mjs catalog update components --file /absolute/next-component-revision.json
node bench/cli.mjs catalog delete components temporary-prompt --version 2
```

`catalog list` requires exactly one kind and rejects extra positional arguments.
Create starts at version 1. Update appends exactly the next version. Delete appends
a tombstone and requires the current version; IDs cannot be silently recreated.
Pinned historical revisions remain readable after deletion. Editing existing JSON
revisions by hand defeats reproducibility; use the commands and commit additions.
A case's dependencies must already exist. Changes to a component or rubric require
a new case revision to opt into their new versions.

## Example lifecycle

The coordinator creates or chooses an **existing absolute directory outside any
repository or instruction-bearing ancestor**, then prepares one trial per variant.
`/tmp/my-benchmark-trials` below is an example, not a preexisting directory.

```sh
mkdir -p /tmp/my-benchmark-trials
node bench/cli.mjs prepare incident-summary --variant baseline --workspace-root /tmp/my-benchmark-trials
node bench/cli.mjs prepare incident-summary --variant evidence-first --workspace-root /tmp/my-benchmark-trials
```

Each response contains a `runId`, `workspace`, manifest path, and `promptFile`.
No model runs during preparation. The subject folder contains only the fixture
and selected component files, not the lab, rubric, catalog, or judge.

For **app execution**, follow the skill to register that exact folder and create
a new folder-backed session from the Project. Do not select the lab's repository
container or reuse this implementation session. Match the requested model and
apply every manifest runtime setting. A child session cannot perform this step.

Record a coordinator-authored receipt outside the subject workspace:

```json
{
  "schemaVersion": 1,
  "sessionId": "actual-id-returned-by-the-app",
  "runner": "app",
  "model": "auto",
  "actualModel": "unknown",
  "environment": "Observed app/runtime version, OS, tool versions, and relevant settings",
  "configurationAudit": "Observed global/managed/personal settings, tools, extensions, and any contamination",
  "permissions": ["observed permission policy"],
  "isolation": "workspace-only",
  "outcome": "completed"
}
```

Use the actual model if observable; never guess what Auto selected. Receipts are
provenance assertions from the coordinator, not agent-authored claims of success.
After the session has actually finished and stopped writing:

```sh
node bench/cli.mjs collect RUN_ID --receipt /absolute/receipt.json
node bench/cli.mjs judge-packet RUN_ID
```

The packet command returns a separate judge folder and prompt. Launch a **new
judge session** there, without the component-under-test configuration. It writes
`verdict.json`; fill its `judge` receipt with observed session metadata, not
placeholders. Preserve the verdict's manifest/evidence hashes and criterion scores.

```sh
node bench/cli.mjs grade RUN_ID --file /absolute/judge/verdict.json
node bench/cli.mjs report incident-summary
node bench/cli.mjs archive RUN_ID
```

The grade combines independently judged scores with deterministic checks; both
must pass. Failed headless processes cannot pass even if their artifacts look good.
An app receipt's `outcome` must be `completed`, `failed`, or `unknown`; inspect the
app session rather than treating an idle state or file alone as completion.
Unknown/failed execution cannot pass. The framework cannot infer app runtime
status from a file alone.

Reports retain prepared, launched-headless, collected, and graded states; missing
scores are `null`, never implicit successes. Groups separate case/rubric/component
hashes, variant, runner, model, environment, configuration audit, and permissions.
`auto` with `actualModel: unknown` is explicitly **not a controlled model comparison**.
No statistical significance or ranking is inferred.

`archive` creates a commit-ready `bench/results/<runId>.json` with versions, hashes,
numeric scores, and a context fingerprint, excluding raw content, local paths,
session IDs, environment prose, and judge rationale. Every run's collected files,
judge inputs/prompts/verdict, and execution records are retained under
`bench/runs/`; `report` also saves its JSON under `bench/reports/`. All framework
artifacts stay in the repository; only live subject/judge workspaces are outside
it for isolation. Review and redact secrets before committing experiments.
Do not put credentials in component files; raw transcripts/config/output may be
sensitive. The committed example data is a reviewed synthetic incident scenario
executed by real sessions, not customer data.

## Optional real headless runner

The installed `copilot --help` confirms `--prompt`, `--session-id`, `--model`,
`--output-format json`, `--allow-tool`, `--agent`, `--additional-mcp-config`,
`--disable-builtin-mcps`, `--no-ask-user`, and `--no-auto-update`. The runner invokes
that executable directly with an argv array, a fresh session UUID, the prepared
working directory, a timeout, and recorded public trace/stderr. Internal
instruction events, hidden reasoning, and opaque payloads are excluded from
persisted traces; a trace summary records retained/omitted event counts. This
does not replace reviewing public tool outputs and files for secrets.
It does not simulate a
session or grant all permissions. It requires a working authenticated Copilot CLI.

```sh
node bench/cli.mjs headless RUN_ID --environment 'Observed runtime context' --configuration-audit 'Observed inherited settings' --allow-tool write
node bench/cli.mjs collect RUN_ID --receipt bench/runs/RUN_ID/receipt.json
node bench/cli.mjs judge-packet RUN_ID
node bench/cli.mjs judge-headless RUN_ID --environment 'Observed judge runtime context' --configuration-audit 'Independent judge; observed inherited settings' --allow-tool write
node bench/cli.mjs grade RUN_ID --file bench/runs/RUN_ID/judge-verdict.json
node bench/cli.mjs report incident-summary
node bench/cli.mjs archive RUN_ID
```

`--allow-tool` is repeatable and opt-in; grant only what the task needs. Omitting
it does not remove inherited permissions. The runner does not broaden path or URL
access. It does not disable custom instructions (that would remove treatments).
`--timeout-ms` defaults to 300000 and is capped at 3600000.
App-only runtime setup is rejected by the headless runner rather than ignored.
The judge runner never receives subject agent/MCP settings. Failures are saved
and surfaced; do not retry an already-launched workspace or reuse its session.
Collect failure artifacts if available, then prepare a fresh trial.

Command checks execute the catalog's argv **without a shell**, with a required
timeout no longer than 60 seconds. Review them first; `collect --allow-commands`
is required. They are trusted lab code, not a sandbox, and may mutate the workspace.
Collection snapshots after checks. Evidence rejects symlinks/special files,
limits each file to 1 MiB and the encoded evidence JSON to 20 MiB, and preserves
binary bytes as base64. `.git` metadata is excluded. Select small fixtures/artifacts;
large output requires a different adapter rather than silently truncating data.

## Validation

The committed [smoke report](reports/7d1c1cdc-ebfe-4606-8c5a-8242c7e46249.json)
contains three real trials from 2026-11-18: baseline/headless,
evidence-first/headless, and baseline/app. Each scored 10/10 from its own fresh
headless judge and passed all deterministic checks. The Project coordinator
verified the app trial's folder routing and actual cwd. Subject and judge
provenance, exact collected evidence, and verdicts are retained in `bench/runs/`.

These are launch/lifecycle smoke results, not evidence of prompt superiority:
there is one trial per runner/variant group, all requested Auto, and inherited
user/managed configuration was not isolated. Rerun with controlled settings and
more samples for a meaningful experiment. Historical reports/grades remain
readable from repository artifacts even after temporary execution folders expire.

```sh
node --test bench/bench.test.mjs
node bench/cli.mjs validate
```

Tests use temporary catalogs/workspaces and explicit synthetic receipts/verdicts.
They do not consume model calls, claim benchmark scores, or install dependencies.
