# Memory engineering and management

**Snapshot and source retrieval date:** 2026-11-18; **last synthesis review:** 2026-11-18.
**Evidence status:** Original cross-provider guidance based on reviewed sources in the provider inventories. Product memory features are not equivalent.

## Practical guidance

1. **Decide what deserves persistence.** Store stable, reusable facts and preferences; keep transient task state in a task artifact, worktree, issue, or session record. Avoid turning every past interaction into a permanent instruction.
2. **Keep memory small, specific, and attributable.** Record the fact, its scope, source, and when it was verified. Prefer a short statement with a path or citation over a broad summary that silently blends inference with evidence.
3. **Separate scopes.** Distinguish user preference, repository convention, organization policy, and task-local progress. Apply the narrowest scope that makes the information useful; do not expose one repository's details as universal user memory.
4. **Treat retrieval as a hypothesis.** Check that a recalled fact still applies to this repo, branch, version, or task before acting. Stale or conflicting memory should be verified against current source-of-truth files and docs.
5. **Make updates reviewable.** Add a memory only when it is durable and useful for future work; revise or retire it when evidence changes. Do not rely on model-generated memory for a safety boundary that must be enforced.
6. **Use compaction and memory for different jobs.** Compaction reduces active conversation history; durable memory preserves selected facts across sessions. A compacted summary is not a permanent source of truth, and a memory store is not necessarily a verbatim transcript.

## Provider-specific boundaries

- **OpenAI:** Codex memory is a distinct product feature and is off by default in the reviewed docs; required project rules belong in checked-in instructions. Responses API compaction is separate from persistent Codex memory. Follow each surface's state/replay rules. See [Codex memories](https://learn.chatgpt.com/docs/customization/memories), [AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md), and [Compaction](https://developers.openai.com/api/docs/guides/compaction).
- **Anthropic:** Claude Code auto memory and `CLAUDE.md`/rules have separate roles; memory is context, not a permission boundary. API context editing and compaction are separate mechanisms with API-specific behavior. See [Claude Code memory](https://code.claude.com/docs/en/memory), [Claude Code security](https://code.claude.com/docs/en/security), and [Context editing](https://platform.claude.com/docs/en/build-with-claude/context-editing).
- **GitHub Copilot:** Copilot Memory distinguishes repository-scoped facts from user preferences and is governed by eligibility/policy controls. It does not replace repository instructions or verified project state. See [Copilot Memory](https://docs.github.com/en/copilot/concepts/prompting-and-context/copilot-memory) and [Context management](https://docs.github.com/en/copilot/concepts/prompting-and-context/context-management).

## Uncertainty and conflicts

“Memory” may mean a product-managed recall store, checked-in instructions, conversation state, or an external database. Those mechanisms have different retention, scope, retrieval, and deletion behavior. Do not assume one vendor's memory feature is enabled, shared, or available in another provider's surface; verify current product docs and policy. This is a snapshot, not a claim about a user's account settings.

## Reviewed sources

- OpenAI: [Codex memories](https://learn.chatgpt.com/docs/customization/memories); [AGENTS.md instructions](https://learn.chatgpt.com/docs/agent-configuration/agents-md); [Compaction](https://developers.openai.com/api/docs/guides/compaction).
- Anthropic: [Claude Code memory](https://code.claude.com/docs/en/memory); [Claude Code security](https://code.claude.com/docs/en/security); [Context editing](https://platform.claude.com/docs/en/build-with-claude/context-editing).
- GitHub Copilot: [Copilot Memory](https://docs.github.com/en/copilot/concepts/prompting-and-context/copilot-memory); [Context management](https://docs.github.com/en/copilot/concepts/prompting-and-context/context-management).
