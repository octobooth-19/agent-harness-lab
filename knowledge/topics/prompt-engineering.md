# Prompt engineering for agents

**Snapshot and source retrieval date:** 2026-11-18; **last synthesis review:** 2026-11-18.
**Evidence status:** Original cross-provider guidance based on reviewed sources in the provider inventories. Product-specific behavior is not portable by default.

## Practical guidance

1. **Write for a task, not a persona alone.** State the goal, relevant repository or environment, constraints, observable acceptance criteria, and expected handoff. Keep role text short unless it changes the agent's decisions.
2. **Separate durable project rules from task instructions.** Put stable conventions and constraints in the host's supported project-instruction mechanism; keep one-off goals in the task prompt. Link to focused references rather than copying a whole manual into every prompt.
3. **Make instructions operational.** Prefer “run the focused test, inspect the diff, and report any failure” over “be careful.” State what must not happen, which tools or files are in scope, and how to handle uncertainty or a blocked prerequisite.
4. **Use progressive disclosure for reusable procedures.** A skill should have a concise routing description and a focused procedure; load detailed references or scripts only when needed. Test both correct activation and non-activation. A skill describes a workflow but does not itself grant tools or permissions.
5. **Treat natural-language guidance as probabilistic.** If an outcome must be guaranteed, enforce it with the host's permissions, deterministic checks, hooks, tests, or review gates instead of relying on prompt wording.
6. **Version and evaluate prompt changes.** Use representative tasks, an explicit rubric or measurable checks, and repeated trials for nondeterministic behavior. Evaluate the full model-plus-harness workflow, not just whether the final prose sounds plausible.

## Provider-specific boundaries

- **OpenAI:** Codex `AGENTS.md` discovery and precedence are product-specific; its skill formats and API-attached skills also differ by surface. Agents SDK applications own their own review and guardrail behavior, while Codex product controls do not automatically transfer. See [AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md), [Build skills](https://learn.chatgpt.com/docs/build-skills), and [SDK guardrails and approvals](https://developers.openai.com/api/docs/guides/agents/guardrails-approvals).
- **Anthropic:** `CLAUDE.md`, rules, skills, hooks, and Agent SDK options belong to Claude Code/SDK semantics. Prompts and project memory influence the model; the documented permission/hook layer supplies enforcement. See [Claude Code best practices](https://code.claude.com/docs/en/best-practices), [skills](https://code.claude.com/docs/en/skills), and [permissions](https://code.claude.com/docs/en/permissions).
- **GitHub Copilot:** Instructions, custom agents, skills, and MCP support vary by surface and host. Profile inheritance and ordering are not a universal contract; check the target IDE, CLI, app, or cloud agent docs. See [custom instructions](https://docs.github.com/en/copilot/concepts/prompting-and-context/custom-instructions), [custom agents](https://docs.github.com/en/copilot/concepts/customizations/custom-agents), and [agent skills](https://docs.github.com/en/copilot/concepts/customizations/agent-skills).

## Uncertainty and conflicts

“Prompt” can refer to user task text, persistent instructions, skill procedures, agent profiles, or messages sent through an API; these are distinct configuration layers. The three providers document different discovery, precedence, inheritance, and execution rules, so do not transplant a file name or frontmatter field between hosts without checking the current target docs. The cited material was accessed on the snapshot date; model and product behavior may have changed since then.

## Reviewed sources

- OpenAI: [AGENTS.md instructions](https://learn.chatgpt.com/docs/agent-configuration/agents-md); [Build skills](https://learn.chatgpt.com/docs/build-skills); [SDK guardrails and approvals](https://developers.openai.com/api/docs/guides/agents/guardrails-approvals).
- Anthropic: [Claude Code best practices](https://code.claude.com/docs/en/best-practices); [Claude Code skills](https://code.claude.com/docs/en/skills); [Permissions](https://code.claude.com/docs/en/permissions).
- GitHub Copilot: [Custom instructions](https://docs.github.com/en/copilot/concepts/prompting-and-context/custom-instructions); [Custom agents](https://docs.github.com/en/copilot/concepts/customizations/custom-agents); [Agent skills](https://docs.github.com/en/copilot/concepts/customizations/agent-skills).
