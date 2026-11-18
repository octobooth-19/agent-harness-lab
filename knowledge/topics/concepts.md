# Agent concepts

**Snapshot and source retrieval date:** 2026-11-18; **last synthesis review:** 2026-11-18.
**Evidence status:** Cross-provider glossary synthesized from reviewed sources. These are working distinctions, not claims that providers use identical terminology.

## Core concepts

| Concept | Working definition | Design implication |
|---|---|---|
| **Model** | The model that interprets context and produces text or structured/tool requests. | Select and evaluate it for a representative workload; do not attribute harness behavior to the model alone. |
| **Agent** | A model operating within instructions, tools, state, and an execution loop to pursue a goal. | Describe the complete runtime and authority, not just the model name. |
| **Harness** | The surrounding runtime: loop, context preparation, tools, environment, state, permissions, observability, and recovery. | Make these parts explicit and test their interactions. |
| **Agent loop** | Repeated model invocation, tool execution, result incorporation, and continuation until completion, handoff, or stop. | Define stop conditions, errors, retries, cancellation, and durable progress. |
| **Tool** | A capability exposed to the model through a structured interface; execution may belong to the client or a hosted service. | Bound inputs and authority; validate outputs and failures at the execution boundary. |
| **Instruction** | Persistent or task-scoped natural-language guidance interpreted by the model. | Useful for behavior, but not a deterministic security control. |
| **Skill** | A discoverable, task-specific procedure, often with supporting references or scripts. | Use progressive disclosure; a skill does not itself grant tool access. |
| **Memory** | Selected information retained beyond the active context, often with a scope. | Record provenance and freshness; distinguish recall from source-of-truth state. |
| **Context** | The active instructions, messages, tool descriptions/results, retrieved evidence, and other data available to a model call. | Optimize for relevant signal and explicitly manage state loss. |
| **Permission / policy** | A runtime or platform rule governing which actions or resources are allowed or require review. | Enforce at the tool/environment boundary; do not rely on prompt compliance. |
| **Evaluation** | A repeatable task/trial plus graders and evidence used to measure a model-and-harness outcome. | Check environment state and process constraints, not only the final answer. |
| **Handoff / delegation** | Transfer of work to another agent or process, or use of a specialist while a manager retains control. | Specify the assignment, output contract, dependencies, and integration review. |

## Useful distinctions

- **Workflow vs agent:** A workflow can prescribe a largely fixed sequence; an agent chooses some steps dynamically. Use the simplest control flow that meets the task.
- **Instruction vs enforcement:** Natural-language instructions steer the model. Sandboxes, permissions, hooks, validators, and CI can impose runtime checks. They are complementary, not interchangeable.
- **Context vs memory vs artifact:** Context is active input; memory is selected retained knowledge; an artifact is explicit durable task output. A transcript or summary should not silently replace the artifact.
- **Outcome vs process evaluation:** A change may pass tests while violating tool, permission, or review constraints. Grade both the resulting state and important process requirements.
- **Product surface vs protocol:** A product can bundle a loop, tools, state, and policy; a model/API protocol may leave those responsibilities to the application. Similar names do not guarantee similar lifecycle semantics.
- **Autonomy vs permission:** An agent mode can allow more consecutive steps without user turns while the permission layer still limits available actions. Enabling autonomy is not equivalent to granting broader access or waiving review.
- **Parallel tool requests vs parallel execution:** A model can return several tool requests together, but the client decides safe execution order. Concurrency is appropriate for independent operations; side effects and shared state may require serialization.

## Provider-specific terminology cautions

- **OpenAI:** Codex, Responses API, Agents SDK, Agents API, and Agent Builder expose different ownership of loop, state, environment, and approvals. Agent Builder's typed-node visual workflow is a distinct product and is scheduled to shut down Nov. 30, 2026. See [Agents API overview](https://developers.openai.com/api/docs/guides/agents-api/overview), [Agents SDK running agents](https://developers.openai.com/api/docs/guides/agents/running-agents), [Codex as a platform](https://developers.openai.com/blog/codex-as-a-platform), and [Agent Builder](https://developers.openai.com/api/docs/guides/agent-builder).
- **Anthropic:** Claude Code, Agent SDK, Messages API tools, and Managed Agents differ in who executes tools and manages sessions. Multiple `tool_use` blocks do not force concurrent execution; the client chooses and must preserve the Messages API's result/history format. Historical “Building effective agents” patterns are useful concepts but are not current API instructions. See [Agent SDK loop](https://code.claude.com/docs/en/agent-sdk/agent-loop), [tool use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview), [Parallel tool use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/parallel-tool-use), and [Building effective agents](https://www.anthropic.com/research/building-effective-agents).
- **GitHub Copilot:** CLI, IDE, app, cloud agent, and dynamic workflows differ in execution and control; SDK loop details should not be generalized to every Copilot surface. CLI Autopilot keeps permission policy separate, and CLI tool search is version/model-dependent. See [about Copilot agents](https://docs.github.com/en/copilot/concepts/agent-capabilities/about-agents/about-github-copilot-agents), [Copilot SDK agent loop](https://docs.github.com/en/copilot/how-tos/copilot-sdk/features/agent-loop), [Autopilot](https://docs.github.com/en/copilot/concepts/agent-capabilities/agent-powered-workflows-and-operations/autopilot), [Tool search](https://docs.github.com/en/copilot/concepts/agent-capabilities/agent-powered-workflows-and-operations/tool-search), and [delegating and parallelizing work](https://docs.github.com/en/copilot/concepts/agent-capabilities/choosing-and-delegating-agent-work/delegating-and-parallelizing-work-with-agents).

## Uncertainty and conflicts

Providers reuse familiar words—agent, skill, context, memory, approval—for different implementations. This glossary is a shared mental model for design discussions, not a replacement for the product-specific docs or a claim that every term has a canonical definition. Historical blog and release claims are time-bound; check current documentation before implementing a provider-specific behavior.

## Reviewed sources

- OpenAI: [Agents API overview](https://developers.openai.com/api/docs/guides/agents-api/overview); [Agents SDK running agents](https://developers.openai.com/api/docs/guides/agents/running-agents); [Codex as a platform](https://developers.openai.com/blog/codex-as-a-platform); [Agent Builder](https://developers.openai.com/api/docs/guides/agent-builder).
- Anthropic: [Agent SDK loop](https://code.claude.com/docs/en/agent-sdk/agent-loop); [Tool use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview); [Parallel tool use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/parallel-tool-use); [Building effective agents](https://www.anthropic.com/research/building-effective-agents).
- GitHub Copilot: [About Copilot agents](https://docs.github.com/en/copilot/concepts/agent-capabilities/about-agents/about-github-copilot-agents); [Copilot SDK agent loop](https://docs.github.com/en/copilot/how-tos/copilot-sdk/features/agent-loop); [Autopilot](https://docs.github.com/en/copilot/concepts/agent-capabilities/agent-powered-workflows-and-operations/autopilot); [Tool search](https://docs.github.com/en/copilot/concepts/agent-capabilities/agent-powered-workflows-and-operations/tool-search); [Delegating work](https://docs.github.com/en/copilot/concepts/agent-capabilities/choosing-and-delegating-agent-work/delegating-and-parallelizing-work-with-agents).
