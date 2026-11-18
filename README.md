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
