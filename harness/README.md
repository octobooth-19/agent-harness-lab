# Assemble and test a coding-agent harness

The lab's [discovery skill](../.github/skills/harness-discover/SKILL.md) and
[consolidation skill](../.github/skills/harness-consolidate/SKILL.md) operate on
the catalog; they are not automatically installed in a benchmark subject.
The lifecycle is **discover → curate → enable → benchmark**. A scan does not
give a source repo tool access, and an adoption does not enable its component.

## Plan a batch and collect scans

In the persistent Project, provide your chosen `owner/repo` entries and refs.
The coordinator resolves each ref to a full commit SHA before writing the batch:

```json
{
  "schemaVersion": 1,
  "id": "review-round-one",
  "sources": [
    { "repo": "example-fixture/agent-notes", "commit": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }
  ]
}
```

```sh
node harness/cli.mjs batch create --file selected-repos.json
node harness/cli.mjs batch status review-round-one
node harness/cli.mjs batch dispatch review-round-one SOURCE_KEY --file transition.json
```

The batch list is immutable after creation. Create a new batch for changed
selections. A normalized repo and SHA share one source key across batches;
a new commit gets a new source key. The coordinator is the single ledger
writer and dispatches independent app sessions in the lab, not in source
checkouts. The CLI writes state, not app calls. Do not retry an uncertain create
call until you reconcile its reservation with the app.

| Transition | JSON fields in addition to `version` (observed ledger version) |
| --- | --- |
| Reserve before creating | `"action":"reserve"` |
| Bind actual app session | `"action":"bind"`, `sessionId` |
| Accept reviewed results | `"action":"accept"`, `sessionId`, `scanRevision`, `resultCommit` (lab results commit SHA) |
| Record a blocker | `"action":"block"`, `sessionId`, `note` |
| Resume the same app session | `"action":"resume"`, `sessionId` |
| Release a reservation after proving no session was created | `"action":"release"`, `note` |

`harness/records/{batches,dispatch,scans,decisions}/` is durable Git state.
Commit ledger events at handoffs. Import only reviewed results files or
results-only commits from each scanner's worktree; verify both provenance and
the diff before accepting. A partial checkpoint can be accepted and resumed.
Missing tool access, untrusted repository settings or app capacity can block
dispatch. No claim is made that any particular app can run 50 sessions at once.

Each scan JSON supplies `schemaVersion: 1`, `source: {repo, commit}`, increasing
`revision` starting at 1, `scope`, `coverage`, `files` and `candidates`.
`coverage` has `tree` (`complete`, `truncated`, `unavailable`), `state`
(`partial`, `complete`), plus `limits` and `next` string arrays. A complete
scope can still include indexed-only items outside that scope; explain limits.
Partial coverage must include limits and a continuation step.

- `files`: `{path, status, sha256}` for inspected exact bytes, or
  `{path, status, reason}` for `indexed` and `unavailable`. No raw source bodies.
- `candidates`: one per inspected path; record `kind`, `purpose`, `requirements`
  and `overlaps` (string arrays), and `compatibility: {status, notes}` (`native`,
  `adaptation-needed`, `unsupported`, `unknown`). Use benchmark component kinds
  or `context`, `memory`, `license`, `support`.
- Add `license: {status, expression, attribution, evidence}` (`permissive`,
  `permission-granted`, `unclear`, `restricted`; evidence lists inspected
  paths), `evidence: [{path, note}]` and `links: [{path, reason}]` or
  `[{url, reason}]`. Local links must appear in inventory and be inspected
  before adoption. Keep verified file hashes when saving a continuation. Use clean HTTPS
  reference URLs; don't save query strings, tokens, raw output, or secrets.

```sh
node harness/cli.mjs scan save --file findings.json
node harness/cli.mjs scan read SOURCE_KEY --revision 1
```

## Curate, enable, and prepare

Use the consolidation skill with a selected checkpoint. The catalog handles
CRUD for `components` and `profiles` via `catalog list`, `read`, `create`,
`update`, and `delete` in [the benchmark CLI](../bench/README.md). Curation creates
an inert component revision and records its decision separately:

```sh
node bench/cli.mjs catalog create components --file component.json
node harness/cli.mjs decision save --file decision.json
```

A decision contains `sourceKey`, exact `scanRevision`, source `path`,
increasing decision `revision` per source path, `decision`, and `reason`.
`adopted` adds `component: {id, version}`, `adaptation` and `notices` (paths to
preserved notices in the component). `duplicate` pins the winning `component`.
`reference-only` and `rejected` do not link a component. The record pins
source, snapshot and component hashes where applicable. These are reviewing
agent attestations, not an automatic license determination. Keep unclear
materials reference-only; check effective license obligations, permissions and
configuration before approval.

For approval and activation, create a named profile revision:

```json
{
  "schemaVersion": 1,
  "id": "review",
  "title": "Review harness",
  "version": 1,
  "target": "portable",
  "parts": [{ "id": "review-step", "version": 1, "enabled": true }]
}
```

```sh
node bench/cli.mjs catalog create profiles --file profile.json
node bench/cli.mjs profile-variant review --version 1 --variant with-review
node bench/cli.mjs validate
```

Set `enabled: false` in the next revision and use `catalog update profiles` to
disable a part; reverse with another revision. Changes never rewrite a case's
pins. Tombstones remove IDs from current listings, not historical resolutions.
Paste the exported variant into a new or revised case, then use benchmark
`prepare` for a fresh, outside-repo workspace. It freezes the profile, exact
case and component records, and writes enabled files plus case fixtures. It
never writes into an existing subject folder or the lab's own active config.

## Supported surfaces and limits

- Skill packages use `.github/skills/<name>/SKILL.md` with `name`,
  `description`, and reviewed supporting files. Custom agent profiles use
  `.github/agents/<name>.agent.md`; repository-wide instructions use
  `.github/copilot-instructions.md`, with `.github/instructions/*.instructions.md`
  or `AGENTS.md` only where supported by the target. Prompt treatments use the
  generated benchmark prompt; copying a prompt file does not invoke it.
- Components can include runtime requirements for agent selection, headless
  additional MCP JSON and built-in MCP disabling, or an app setup requirement.
  `portable` and `headless` reject app-only requirements; an `app` profile
  cannot use the headless runner. Actual tools, settings, model permissions,
  and supported frontmatter must be audited for the selected runtime.
- Composition checks validate pinned dependencies, colliding files/directories,
  common skill/agent entry names and runtime keys. They do not interpret
  arbitrary YAML, infer semantic overlap, install tools, provision MCP,
  grant permissions, or translate Codex/Claude hooks, global settings,
  memory stores, runtimes, or vendor-specific extension formats.
  Convert those into reviewed native components, explicit requirements,
  or references rather than treating copied files as working adaptations.

Run the [synthetic lifecycle fixture](harness.test.mjs) with
`node --test harness/harness.test.mjs`: it takes an inspected sample through
curation, two profile revisions, and both benchmark preparations, without
calling a model or scanning live GitHub repositories. The separate skills,
durable scans, and outcome/trace distinction draw from the OpenAI sibling
synthesis (`knowledge/openai/synthesis.md`, sections 1–4 and 6) and the GitHub
Copilot sibling synthesis (customizations and harness evaluation). These
partial snapshots informed the design; neither is a runtime dependency.
