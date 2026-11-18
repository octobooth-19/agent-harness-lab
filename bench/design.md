# Design: an agent-operated harness lab

## Boundary and responsibility

The Project chat is the **lab orchestrator**, not the evaluated coding agent.
Its synthesis-informed workflow authors scenarios, varies a component, launches
independent sessions, captures outcomes, and asks an independent judge to apply a
pinned rubric. The lab must not copy its own instructions into the subject.

The [architecture diagram](architecture.md) shows the boundary. The app-native
entry point is a repository skill, not a local web dashboard or pretend session
API. Node.js supplies a deterministic file/validation engine under that skill.
Only the Project coordinator creates app sessions; children report/delegate back.
The optional installed Copilot CLI is a separate, real headless adapter.

## Data model

| Record | Purpose |
| --- | --- |
| Component revision | Typed treatment: prompt, skill, instructions, agent, MCP/tool config, or whole harness; text files plus explicit runtime requirements |
| Case revision | Task, fixtures, named component compositions, exact rubric reference, deterministic checks |
| Rubric revision | Criterion descriptions, maximum scores, total pass threshold |
| Run manifest | UUID, variant, model request, outside-repo workspace, frozen case/rubric/components, content hashes, initial-file hashes, prompt hash |
| Evidence | Coordinator/runner provenance, exact artifact bytes and hashes, deterministic check observations, runner exit status when observable |
| Judge packet/verdict | Separate judge workspace; task/rubric/evidence, criterion scores and citations bound to manifest/evidence digests |
| Grade/archive | Derived pass/score; optionally promoted versionable numeric summary with content/context fingerprints |

Catalog revisions are append-only and use explicit integer versions. Tombstones
hide IDs from current lists while historical pins continue to resolve. Exclusive
file creation rejects stale/concurrent updates. Cases cannot select missing
dependencies, file/directory collisions, duplicate component IDs, or conflicting
runtime keys. See [schema](schema.md).

## Lifecycle

`prepare -> launch -> collect -> judge-packet -> independent judge -> grade -> archive`

`prepare` does not run an agent. It checks dependency versions, creates a fresh
outside-repository subject folder, writes only selected files, and freezes the
manifest outside that folder. Each repeat gets a new run, folder, and session.
App launch is a coordinator tool action using the generated prompt; no unsupported
app automation endpoint is invented. Headless launch records exact argv and gives
each process a new UUID. Both provenance receipts explicitly identify the runner.

Collection requires the session to stop writing. It hashes actual files and runs
approved deterministic checks rather than trusting `.bench-result.json`.
A file-preservation check compares against the frozen input hash. Command checks
are frozen argv, not agent-provided commands. The judge sees task/rubric and
collected evidence, not the treatment prompt or variant label; this reduces but
does not guarantee blinding because files may reveal treatments.

The judge runs in a sibling folder, not the subject or the lab checkout. Treatment
configuration is inert data inside its JSON packet, never installed as judge
configuration. Every criterion requires bounded numeric scores, rationale, and
citations to existing artifacts/checks. The judge session ID must differ from the
subject's. Metadata placeholders, missing/duplicate criteria, stale evidence
hashes, and invented citations are rejected. Numeric thresholds, deterministic
checks, and observed headless process success jointly determine pass/fail.

Collected file bytes, judge packets/prompts/verdicts, run records, and reports are
retained inside the repository. External subject/judge folders are execution
workspaces only. Review raw data for secrets before committing experiments.

Each transition writes new artifacts without overwriting existing ones. Frozen
manifest/prompt checks are reverified; reports recompute the derived grade.
Failure is an error or failed check, never a successful default. A failed trial
may still be collected and judged, but it does not become a pass through a
plausible final message. Fix a case/component with a new revision and rerun in a
new workspace; do not silently repair an existing trial.

## Scope of isolation and trust

**Workspace isolation is not a security sandbox or a claim of a pristine model
context.** Subject folders cannot inherit a repository or known ancestor
instruction directories, but Copilot still supplies built-in system behavior,
managed policy, personal instructions, memories/settings, plugins, and tools.
App sessions may also receive Project/user context. The coordinator must inspect
and record these sources, avoid forwarding lab/synthesis instructions to subjects,
and use clean accounts/hosts or a real sandbox where stronger isolation is needed.
If the app cannot target the exact folder or honor required configuration, do not
silently test the lab worktree instead; report the unsupported setting or use a
separately labeled headless run.

Neither file permissions nor hashes defend against a malicious same-user process
rewriting the lab's evidence and checksums. Receipt/session independence is
coordinator-attested, not cryptographic. Treat components and command checks as
trusted code; use external sandboxing and remove credentials for adversarial
benchmarks. Artifact strings and model outputs are untrusted judge data and may
contain prompt injection. Independent judging reduces self-score bias but still
needs calibration, multiple trials, and human-reviewed examples for consequential
decisions.

Runtime selectors support custom agent selection, additional MCP config, and
disabling built-in MCPs in the headless adapter. Arbitrary app-specific harness
requirements are recorded as `runtime.appSetup` and must be applied/audited by
the coordinator; a file alone is not proof that an MCP server was connected.
Future adapters can implement other vendors/harnesses against the same
manifest/receipt/evidence/verdict contracts without making the lab harness the
subject. Hosted runners, model provisioning, external sandboxing, dashboards,
and statistical significance calculations are deliberately not included.

## Research grounding

The available sibling snapshots informed this separation:

- `octobooth-19-anthropic-docs-snapshot:knowledge/anthropic/synthesis.md`,
  "Evaluation and quality loops": distinguish task/trial/grader/transcript/outcome,
  evaluate model plus harness, and inspect environment outcomes rather than claims.
- `octobooth-19-openai-knowledge-base:knowledge/openai/synthesis.md`,
  "Evaluation and model choice": trace end-to-end decisions, use repeatable
  datasets, and separate outcome from process quality.

These are partial, dated research snapshots, not runtime dependencies or copied
subject instructions. Once merged, the coordinator reads the current
`knowledge/*/synthesis.md` before authoring scenarios. Scenarios should test the
claimed practice and record counterexamples, not encode the desired winner.
