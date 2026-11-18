# Record schema v1

`schema.mjs` is the authoritative dependency-free validator. All catalog objects
have `schemaVersion: 1`, kebab-case `id`, positive integer `version`, and a nonempty
`title`. Unknown fields are errors. Revisions live at
`bench/catalog/{cases,rubrics,components,profiles}/<id>/<version>.json` and start at 1 without
gaps. A tombstone contains only `schemaVersion`, `id`, next `version`, `deleted: true`.

References are `{ "id": "kebab-case", "version": 1 }`; no floating versions.
Files are UTF-8 string maps keyed by safe relative POSIX paths. Absolute paths,
backslashes, drive prefixes, control characters, empty/dot/parent segments, and
`.git` segments are rejected. Individual files are limited to 1 MiB; combined
inputs to 20 MiB. Components/cases cannot collide on a file or file/directory.

## Component

```json
{
  "schemaVersion": 1,
  "id": "review-skill",
  "version": 1,
  "title": "Review skill treatment",
  "kind": "skill",
  "prompt": "Use the review skill for this task.",
  "files": {
    ".github/skills/review/SKILL.md": "---\nname: review\ndescription: Review a change using evidence.\n---\nInspect the actual diff; identify actionable defects.\n"
  }
}
```

`kind`: `prompt | skill | instructions | agent | mcp | tool-config | harness`.
`prompt` and `files` are required; both may be empty only for a runtime-only treatment.
Use actual harness-recognized paths and file formats; kind alone does not install
a tool, invoke an agent, or prove a skill was used.

Optional `runtime` contains only:

| Field | Meaning |
| --- | --- |
| `agent` | Nonempty custom agent selector; headless maps to `--agent` |
| `mcpConfig` | Relative path to this component's JSON-object file; headless maps to `--additional-mcp-config @path` |
| `disableBuiltinMcps` | Boolean; true maps to `--disable-builtin-mcps` |
| `appSetup` | Nonempty app-specific setup requirement; coordinator must audit it; headless rejects it |

App mapping is never inferred from CLI flags: inspect the app tool's live schema
and available settings. A variant may not specify the same runtime key in two
components. Tool approval policy is explicit launch provenance, not automatically
granted by a component file.

Optional `requires` contains pinned component references. Every enabled
composition must select those exact versions explicitly; they are never
auto-enabled.

## Profile

Profiles add `target: app | headless | portable` and `parts: [{id, version,
enabled}]`. Each ID appears once, including disabled pins; enabled part order
defines prompt composition order. `portable` and `headless` disallow `appSetup`.
Use `profile-variant` to export the enabled pins and profile reference. The
profile is frozen by `prepare`, not looked up by latest version during launch.

## Rubric

Required extra fields: nonempty `criteria` array and integer `passScore` from zero
through the sum of criterion maxima. Each criterion has unique kebab-case `id`,
nonempty `description`, and integer `maxScore` from 1 to 1000.
Criterion maxima supply weights; there is no hidden weighting or self-report field.
See the committed incident-summary rubric for an example.

## Case

Required extra fields:

| Field | Shape |
| --- | --- |
| `task` | Nonempty standalone prompt describing observable output, not the winner |
| `files` | Fixture map; may be empty |
| `rubric` | Pinned rubric reference |
| `variants` | Nonempty array of `{ "name": "unique-kebab-case", "components": [reference] }`; optional pinned `profile` must match exact enabled pins in order. Empty components is a valid no-treatment baseline |
| `checks` | Array of checks; may be empty |

Check IDs must be unique kebab-case identifiers. Supported checks:

```json
[
  { "id": "exists", "type": "file-exists", "path": "answer.md" },
  { "id": "contains", "type": "file-contains", "path": "answer.md", "text": "required literal" },
  { "id": "preserved", "type": "file-unchanged", "path": "input.txt" },
  { "id": "tests", "type": "command", "argv": ["node", "--test", "solution.test.mjs"], "timeoutMs": 10000 }
]
```

File-contains uses a case-sensitive substring. File-unchanged must name a frozen
input in every variant. Commands use argv without shell interpolation; timeouts
are integer milliseconds from 1 to 60000. Command stdout/stderr and failures
become evidence. Missing files fail checks; unsafe paths/symlinks abort collection
explicitly. Commands require separate coordinator approval at collection time.

## Runtime artifacts

Manifest/evidence/grade files are generated, not manually edited. SHA-256 for
objects uses canonical JSON with sorted object keys and preserved array order;
file content/prompt hashes use exact bytes. Manifests freeze full validated
catalog records and their individual hashes, input hashes, requested model,
workspace, variant, runtime settings, and UTC creation time.

Cases may also pin `source: { repository: "owner/repo", commit: "<40-hex>",
files: { "<destination>": { path: "bench/<retained-source>", sha256: "<64-hex>" } } }`.
Source bytes are retained UTF-8 files no larger than 1 MiB apiece, verified before
materialization, and composed with common fixtures/component files without
collisions or symlinks. No network fetch or solution lookup occurs at preparation.
Original licenses and acquisition/issue metadata belong beside retained sources.

An optional case `policy: {path, sha256}` pins retained JSON policy; its complete
content is additionally frozen in the run manifest. Both kinds of file pin must
refer under `bench/` using safe relative paths.

An `evaluator` check has `id`, `type: "evaluator"`, `script: {path, sha256}`, and
`timeoutMs` from 1 through 60000. Preparation freezes the standalone Node script
in the run directory, never in the subject. Collection verifies its digest and
runs `node <frozen-script> <subject-workspace>` only with `--allow-commands`.
Evaluators use built-in modules and absolute subject paths, not relative imports
from their authoring directory. Their stdout/stderr/exit status become check
evidence. Treat these scripts as trusted lab code, not a sandbox.

A receipt has `schemaVersion`, `sessionId`, `runner`, `model`,
`actualModel`, `environment`, `configurationAudit`, `permissions`, and `isolation`.
All text fields are nonempty; unfilled `<placeholders>` are rejected. `runner`
is `app | headless | manual`. `model` is the requested model and must match the
manifest for subject receipts. `actualModel` can be `unknown` when not observable.
`permissions` is a string array; `isolation` must explicitly be `workspace-only`.
`manual` is intended for imported/external evidence and synthetic unit fixtures;
reports keep it distinct from real app/headless runs.

App/manual receipts additionally require `outcome: completed | failed | unknown`,
based on observed session completion, not output claims. Unknown or failed
execution cannot pass. Headless execution outcome comes from the recorded
process result; its receipt need not repeat that field. Judge app/manual
receipts must attest completed execution.

Optional receipt `metrics` contains `observedFrom` (nonempty text) and optional
`wallMs`, `inputTokens`, `outputTokens`, `totalTokens`, each a nonnegative finite
number or `null` when unavailable. Never infer usage from prose or default a
missing metric to zero. Reports retain the observations per run.

The generated verdict template supplies `schemaVersion`, `runId`,
`manifestSha256`, `evidenceSha256`, a `judge` receipt, and `scores`. Each score has
`criterionId`, finite `score` from zero to the criterion maximum, nonempty
`rationale`, and a nonempty `evidence` array naming existing `workspace/<path>`
or `checks/<id>` references. Every criterion appears exactly once. The judge
cannot be the subject session. The headless judge wrapper replaces only judge
metadata with its own launch receipt; it does not change model-generated scores.

Archive records contain catalog references/hashes, variant, timing, evidence and
manifest hashes, runner/model labels, a context fingerprint, numeric scores, and
pass/check/process outcomes. They intentionally omit raw files and metadata
prose. Local evidence remains necessary to reproduce a judge's reasoning.
