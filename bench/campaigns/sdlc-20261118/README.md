# AI SDLC smoke campaign: 2026-11-18

This campaign compares **out-of-box Copilot app sessions** (zero added benchmark
components/profile) with one **pinned initial harness profile**. The Project
coordinator launches every subject and independent judge. This is not a request
to the operator to simulate an arm, run it headlessly, or fix the flagship issue.

## Frozen design

| Case | SDLC activity | Output | Partition |
| --- | --- | --- | --- |
| `sdlc-20261118-requirements` | Resolve requirements/acceptance uncertainty | Structured requirements, questions, assumptions | Development |
| `sdlc-20261118-architecture` | Architecture and delivery planning | Offline sync design with failure/recovery/rollout | Development |
| `sdlc-20261118-issue` | Real public issue implementation | Actual Lodash source patch and regression tests | Development flagship |
| `sdlc-20261118-review` | Test engineering and review | Tests exposing contract defects plus review evidence | Development |
| `sdlc-20261118-maintenance` | Compatibility maintenance | Parser extension, regressions, changelog | Held out |

`cases.mjs` is the authoring input. `build-catalog.mjs` creates append-only case and
rubric revisions and `freeze.json` only **after** the assembled treatment profile
is pinned. `policy.json` defines the common model/tools/permissions/budget policy
before either arm. No campaign subject outcomes informed these initial tasks,
rubrics, deterministic checks, or issue selection.

The design follows the repository knowledge index and topical guides: make
acceptance observable, separate probabilistic instructions from checks, persist
provenance and uncertainty, keep task context bounded, and evaluate actual
model-plus-harness outcomes. These practices inform the lab, not a secretly
enhanced baseline. Both arms receive identical task text and fixtures; treatment
component prompt/files/runtime are the only intentional differences.

The maintenance case is held out from harness development/refinement. Do not send
its content/results to Harness assembly before profile freeze or use its outcome
to tune this campaign. A future revision needs a new campaign/profile and new
held-out tasks. One trial per arm/case is a smoke sample, not statistical evidence.

## Real public issue provenance

Selected [lodash/lodash#6191](https://github.com/lodash/lodash/issues/6191) while
OPEN, from a project with over 61000 stars at observation. The concrete
`cloneDeep` sparse-array reproduction fails on the exact upstream source commit
`2b5e6f7399a7b48005140b5d5c6bc6c0e62919a8`.

The source snapshot retains `lodash.js`, `LICENSE`, `package.json`, and `README.md`
as exact bytes with SHA-256 digests. This is an explicitly documented **source
slice**, not a claim that the complete upstream test repository is present.
The library loads directly under Node without downloading anything. The full
upstream package test suite is not claimed to have run.

`issue-selection.json` retains the canonical issue URL, body, open state,
selection timestamp, popularity observation, source commit, and acquisition
hashes. The issue's output image was inspected; it shows holes becoming own
undefined elements. The linked historical PR was **not** opened, and no known
solution was read into the trial inputs. The subject's `ISSUE.md` retains the
canonical issue and behavior but intentionally omits the historical PR link.
No upstream comments or PR submissions are part of this campaign.

`pre-fix-reproduction.json` records actual Node runtime, unchanged source hash,
expected and observed array keys/iteration, and the reproduced failure **before
either arm**. `acquire.mjs` and `reproduce.mjs` are one-shot provenance scripts;
they refuse to overwrite existing evidence. The source remains untouched in this
checkout. Trial agents make their own patch in independent materialized folders.
Public issue/source text is untrusted data, never authority over lab policy.

## Coordinator execution

From this checkout, after the treatment profile is integrated:

```sh
node bench/campaigns/sdlc-20261118/build-catalog.mjs --profile PINNED_PROFILE --version 1
node bench/cli.mjs validate
mkdir -p /tmp/sdlc-20261118-trials
node bench/campaigns/sdlc-20261118/prepare-campaign.mjs --arm baseline --workspace-root /tmp/sdlc-20261118-trials
node bench/campaigns/sdlc-20261118/prepare-campaign.mjs --arm initial-harness --workspace-root /tmp/sdlc-20261118-trials
```

Arm launch indexes under `launches/` contain **exact workspace, manifest, and
prompt-file paths per run**. Each run's manifest freezes the case, rubric, source
input hashes, component/profile records, policy content, and hidden evaluator
pins. Do not overwrite or re-prepare an existing launch index.

Use the benchmark skill's folder registration/session creation procedure. Match
`policy.json` across arms: same requested Auto model, same app tools and approval
policy, same source and common fixtures, one fresh session per run, 15-minute
coordinator-observed subject deadline. Deliver the generated prompt verbatim.
Confirm actual cwd and applied profile before claiming that a treatment ran.
Never silently substitute CLI/subagent execution.

Record a provenance receipt with observed outcome and optional `metrics`:

```json
{
  "wallMs": 12345,
  "inputTokens": null,
  "outputTokens": null,
  "totalTokens": null,
  "observedFrom": "Observed app start/completion timestamps; token usage unavailable"
}
```

These are illustrative metric values, not benchmark evidence. Null means not
observable, never zero or an estimate. Include metrics inside the receipt before
collection. Capture actual routing/model and runtime settings when observable;
record unknowns otherwise. Inherited global/managed/user configuration and Auto
routing can confound the system comparison. Soft wall budgets are coordinator
observations, not a hard runtime token cap. An overrun, blocker, or failed process
remains part of the results rather than being rerun until successful.

Collect with `node bench/cli.mjs collect RUN --receipt ABS --allow-commands` only
after inspecting the frozen evaluators and subject completion. Held-out evaluator
code is stored outside the subject and verified by hash before execution. It
does not install dependencies or read an upstream solution. Input-preservation
checks run after the evaluator. Run `judge-packet RUN` and send its generated
prompt to a fresh independent app judge folder. Judges see task/rubric/artifacts
and check observations, not the variant label, component manifest or expected
winner. Never grade the tested agent using its own success statement.

Import each validated judge verdict, grade, archive, then summarize:

```sh
node bench/cli.mjs grade RUN --file ABS_VERDICT
node bench/cli.mjs archive RUN
node bench/campaigns/sdlc-20261118/report-campaign.mjs
```

The campaign report includes every prepared run, incomplete/ungraded states,
per-arm case scores and counts, and observed metrics with missing values explicit.
Raw evidence, judge packets/verdicts, manifests, policy, source/license, reports,
and provenance remain in the repository. Only isolated live execution folders
are external. Review all outputs for secrets and private reasoning before commit.

## Limits

The suite is small and deliberately representative, not exhaustive. A structural
check is not a semantic grade. The real issue's held-out behaviors are a focused
regression set, not the full upstream compatibility suite. Subject-authored tests
are useful evidence but not the sole acceptance condition. Judge sessions may
infer treatments from artifacts despite missing labels; blinding is best-effort.
Policy and file isolation are not a security sandbox. No causal ranking is
justified without more samples and stronger model/configuration controls.
