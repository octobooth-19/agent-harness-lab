# Agent knowledge library

**Snapshot and source retrieval date:** 2026-11-18. Each provider directory has its own source inventory and coverage report; those reports define what was actually reviewed versus merely indexed. The cross-provider guides below cite reviewed primary sources and are an original synthesis, not a copy of the inventories.

## Choose a guide

| Need | Start here |
|---|---|
| Write or refine instructions, prompts, and reusable skills | [Prompt engineering](topics/prompt-engineering.md) |
| Decide what to persist, retrieve, update, or forget | [Memory engineering and management](topics/memory-engineering.md) |
| Keep active task context useful across tools, turns, and compaction | [Context engineering](topics/context-engineering.md) |
| Align on agent/harness/evaluation terminology and design boundaries | [Concepts](topics/concepts.md) |

## Provider snapshots

- [OpenAI](openai/synthesis.md) · [coverage](openai/coverage.md) · [inventory](openai/source-inventory.json)
- [Anthropic](anthropic/synthesis.md) · [coverage](anthropic/coverage.md) · [inventory](anthropic/source-inventory.csv)
- [GitHub Copilot](github-copilot/synthesis.md) · [coverage](github-copilot/coverage.md) · [inventory](github-copilot/sources.json)

The inventories are intentionally provider-specific and not normalized into one lossy schema. `read`, `read_partial`, and equivalent statuses mean the page was opened and reviewed to the stated depth; `indexed`, `indexed_only`, and similar states are discovery records, not evidence. See each coverage report for exact counts, exclusions, inaccessible sources, and the remaining backlog.

## Maintenance

Use the [refresh runbook](MAINTENANCE.md) to discover official-source changes, hash-check a bounded batch, preserve refresh state, and resume the backlog. The deterministic pipeline records source changes; a Copilot maintenance pass must review changed material and update the topical guides with citations. It must not infer facts from an index-only entry or replace a topic with concatenated source text.
