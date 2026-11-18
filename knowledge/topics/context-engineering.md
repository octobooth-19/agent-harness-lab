# Context engineering

**Snapshot and source retrieval date:** 2026-11-18; **last synthesis review:** 2026-11-18.
**Evidence status:** Original cross-provider guidance based on reviewed sources in the provider inventories. Context limits and mechanics are model/surface-specific.

## Practical guidance

1. **Optimize for useful signal, not maximum input.** Include the goal, constraints, relevant files, evidence, and success criteria. Retrieve additional context just in time instead of front-loading the entire repository or tool catalog.
2. **Keep context layered and navigable.** Use a concise entry-point instruction, then point to focused topic docs, task artifacts, and references. Load long procedures or examples only when they are relevant.
3. **Give tools bounded, descriptive interfaces.** Tool definitions and results consume context. Use specific schemas and names, return compact relevant results, and keep large intermediate data outside the model context when the runtime permits.
4. **Manage the context lifecycle.** Track what has been decided, what remains, evidence gathered, and the next action. Before compaction or handoff, write durable status to a task artifact; after compaction, verify that critical constraints and unresolved work survived.
5. **Separate context from durable state.** Conversation history is not a reliable database. Persist code changes, test results, decisions, and checkpoints in reviewable files or the host's documented session store.
6. **Handle truncation and recovery explicitly.** Preserve ordering and identifiers required by the provider's API, avoid replaying the same history through two state mechanisms, and verify resumed state instead of assuming a stream or tool call completed.

## Provider-specific boundaries

- **OpenAI:** Codex instruction limits and discovery rules are product-specific; Responses API compaction and Agents API session/event state are separate mechanisms. Do not mix replayed local history with server-managed state without checking the relevant API contract. See [AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md), [Compaction](https://developers.openai.com/api/docs/guides/compaction), and [Agents API events and items](https://developers.openai.com/api/docs/guides/agents-api/sessions/events).
- **Anthropic:** Context-window size does not establish context quality. The reviewed guidance emphasizes high-signal context and tool-based retrieval; context editing/compaction behavior is API-specific. See [Context windows](https://platform.claude.com/docs/en/build-with-claude/context-windows), [Context engineering](https://www.anthropic.com/research/effective-context-engineering-for-ai-agents), and [Context editing](https://platform.claude.com/docs/en/build-with-claude/context-editing).
- **GitHub Copilot:** Conversation context and Copilot Memory are separate; compaction can lose fine detail. Supported context controls vary by surface. See [Context management](https://docs.github.com/en/copilot/concepts/prompting-and-context/context-management), [Copilot Memory](https://docs.github.com/en/copilot/concepts/prompting-and-context/copilot-memory), and [Copilot SDK agent loop](https://docs.github.com/en/copilot/how-tos/copilot-sdk/features/agent-loop).

## Uncertainty and conflicts

The cited docs cover distinct runtime state models; there is no provider-neutral context-window size, compaction format, replay contract, or memory retention policy. Product limits and model capabilities are volatile. Check the current doc for the exact surface in use, and keep an explicit source date when a limit or behavior is important to a design.

## Reviewed sources

- OpenAI: [AGENTS.md instructions](https://learn.chatgpt.com/docs/agent-configuration/agents-md); [Compaction](https://developers.openai.com/api/docs/guides/compaction); [Agents API events and items](https://developers.openai.com/api/docs/guides/agents-api/sessions/events).
- Anthropic: [Context windows](https://platform.claude.com/docs/en/build-with-claude/context-windows); [Context engineering for agents](https://www.anthropic.com/research/effective-context-engineering-for-ai-agents); [Context editing](https://platform.claude.com/docs/en/build-with-claude/context-editing).
- GitHub Copilot: [Context management](https://docs.github.com/en/copilot/concepts/prompting-and-context/context-management); [Copilot Memory](https://docs.github.com/en/copilot/concepts/prompting-and-context/copilot-memory); [Copilot SDK agent loop](https://docs.github.com/en/copilot/how-tos/copilot-sdk/features/agent-loop).
