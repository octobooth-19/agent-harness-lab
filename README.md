# agent-harness-lab
Research knowledge base, model and harness evaluations, and a reusable coding-agent harness.

## Agent-operated benchmarking

Use the [`benchmark` Copilot skill](.github/skills/benchmark/SKILL.md) from the
Project coordinator to maintain test cases, launch independent trials with the
harness under test, and grade evidence against versioned rubrics.

The dependency-free [benchmark framework](bench/README.md) includes an
[architecture design](bench/design.md), [diagram](bench/architecture.md), and a
two-variant incident-summary example. The app coordinator owns session creation;
an optional real Copilot CLI runner supports headless experiments.

## Harness assembly

Use [the harness operator guide](harness/README.md) to dispatch user-selected
source scans, curate findings into the benchmark component catalog, and enable
pinned revisions in named profiles. Discovery, adoption, and benchmark launch
are separate steps; source repositories are never installed by the scan.
