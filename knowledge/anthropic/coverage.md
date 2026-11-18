# Anthropic source coverage and limitations

**Snapshot/access date:** 2026-11-18
**Owner:** Anthropic provider track
**Status:** Partial, useful snapshot; not a claim that every indexed page was read.

## Discovery methods and counts

I used official published indexes and sitemaps rather than relying only on search snippets:

| Official source | Discovery method | URLs discovered | Read in this pass |
|---|---|---:|---:|
| Claude Platform docs | `https://platform.claude.com/llms.txt` plus `https://platform.claude.com/sitemap.xml` | 4,718 sitemap URLs: 923 English docs, 3,762 non-English docs, and 33 non-documentation platform/console routes | 103 English documentation pages, partial or full |
| Claude Code docs | `https://code.claude.com/docs/llms.txt` plus `https://code.claude.com/docs/sitemap.xml` | 2,437 sitemap URLs: 204 English pages and 2,233 non-English pages. The LLMS index exposes 216 links; the sitemap is the page-count basis. | 28 English documentation pages, partial or full |
| Anthropic site | `https://www.anthropic.com/sitemap.xml` | 593 pages: 280 `/news/`, 219 `/research/`, and 94 other site pages. Sitemap `lastmod` exists for 574. | 43 news/research pages, partial or full |
| Claude Code changelog | Linked by Claude Code documentation; fetched from the official `anthropics/claude-code` repository | 1 moving changelog | Latest top entry reviewed; partial |

**Sitemap page URLs discovered:** 7,748 across the three sitemap corpora, before adding the changelog and index records. The inventory includes every sitemap URL, including non-English pages and non-documentation platform routes. It also includes the two documentation indexes, the three sitemap endpoints, the changelog, and two failed endpoint probes as separate discovery records.

**Unique source pages reviewed:** 204 (203 documentation/news/research pages plus the repository changelog). Of the 203 docs/news/research pages, 161 are marked `read_partial` and 42 are marked `read`; the repository changelog remains `read_partial`, bringing the inventory's partial total to 162. Batch five added 10 new pages, all partial, and deepened three prior partial pages without promoting any to full. Batch six added four new pages (one full and three partial). Batch seven added four more docs (all partial). Batch eight adds four more docs, all partial. Batch nine adds 12 more docs, all partial. Batch ten adds eight more docs, all partial. Batch eleven adds 10 more docs, all partial. Batch twelve adds five more docs, all partial. Batch thirteen adds five more docs, all partial. Batch fourteen adds four news/research pages, all partial. Batch fifteen adds four docs, all partial; two prompting pages were fetched in additional segments, but remain partial. Batch sixteen adds nine pages (eight partial, one full), including six self-hosted docs and two research pages. Batch seventeen adds six partial documentation pages on preserved-thinking behavior, browser/computer toolsets, hallucination and format controls, Claude Code analytics, and self-hosted SSO. Batch eighteen adds six partial pages on Managed Agents CLI/session lifecycle and Enterprise RBAC. Batch nineteen adds four partial Claude Agent SDK references on deployment security, transcript storage, approvals/user input, and subagent context isolation. These fetch slices do not count as complete reads. Review status is page-level and does not imply exhaustive reading of every linked subpage. Index records are marked `index_read`, not page reads. The count excludes index and sitemap records.

**Remaining indexed English pages:** 1,626 sitemap pages (923 Platform docs + 204 Claude Code docs + 280 News + 219 Research) less 203 reviewed docs/news/research pages = **1,423 sitemap-indexed pages pending review**. The Claude Code LLMS index exposes 12 additional links not present in the sitemap; these are also inventoried as pending. The inventory therefore has 1,435 `indexed_only` rows. All 94 other Anthropic-site pages, all 33 platform routes outside the docs section, and all 5,995 non-English sitemap URLs are inventoried but not reviewed as documentation sources.

## Reviewed source coverage

Priority review covered:

- Claude Code overview, best practices, memory, skills, subagents, teams, hooks, MCP, permissions, security, auto mode, and Agent SDK loop/API overview.
- Claude Platform tool use, Agent Skills, Managed Agents, context windows/editing, models, API eval guidance, and release notes.
- Tool schema/description design and parallel tool-call execution/history requirements. Both added pages are marked `read_partial` because the fetched responses were truncated.
- Messages API tool-result sequencing, strict schemas and deferred tool search; Agent SDK configuration, permission order, custom tools/MCP, hooks, telemetry, host persistence, and checkpoint boundaries.
- Anthropic AI safety/governance announcements on the Agent Skills and MCP contributions to the Agentic AI Foundation, plus historical long-context and agent-memory research. The research results remain attributed to their original model/task and are not generalized as current product guarantees.
- Managed Agents policies, budgets, memory, skills, credentials, threads, and orchestration; Messages API tool-context controls, tool combinations, programmatic calling, bash execution, and compaction. The Managed Agents, programmatic tool-calling, and several other long pages were only partially reviewed.
- Anthropic articles on agent patterns, context engineering, long-running coding harnesses, agent evaluations, MCP, skills, multi-agent research, tool use, and auto mode.
- This batch adds research on sandboxing, managed-agent architecture, autonomy and multi-agent coordination; current Claude Code loop and permission docs; a partial changelog, hooks and sandboxing review; and dated news on Claude Code, Agent SDK, Xcode, and governance. Its study claims and model examples remain attributed to their sources rather than generalized.
- Batch four adds tool-loop, server-tool and web-search guidance; cache-prefix behavior; enterprise-skill review/versioning; remote MCP caveats; and MCP-tunnel security controls. News/research covers Claude Code Security, Claude in Xcode, contextual retrieval, coding-skills research, a survey of coding-agent adoption, and safety-evaluation design. Two long docs remain partial; no publication dates were visible in these fetched pages.
- Batch five adds tool-specific web fetch, code execution, text editing and browser-use details; MCP-tunnel architecture; Managed Agents concepts; and two partial research snapshots. It also deepened the tool-using tutorial, prompt-caching guide and moving Claude Code changelog; all three remain partial, and the changelog's visible 2.1.326 entry is not a full release-history review.
- Batch six reads the MCP-tunnel quickstart in full, plus partial Helm deployment, Managed Agents custom-tool/MCP-worker, and API Skills quickstart material. These pages reinforce the research-preview and beta boundaries; the tunnel's credentials, certificates, network policy, and worker placement are product-specific and should be checked against current versions before deployment.
- Batch seven adds partial API tool-streaming, computer-use, thinking/tool-loop guidance, and Claude Code SDK tool search. These are implementation-specific documents; the computer-use risk guidance calls for isolation and human confirmation on meaningful actions, while streamed input requires handling incomplete or invalid JSON safely.
- Batch eight adds partial tunnel proxy/API reference, self-hosted worker deployment, Managed Agents web-domain restrictions, and API tool-version reference material. Preview/beta status and deployment contracts remain product-specific; the web restrictions page distinguishes provider-hosted retrieval tools from sandbox network access.
- Batch nine adds partial API Skills, Managed Agents cloud/self-hosted environment and migration, per-session sandbox, tool troubleshooting/streaming refusal, and MCP-tunnel Console/Compose/troubleshooting references. Managed Agents and tunnels have beta/research-preview caveats; fetched portions do not replace their live deployment and lifecycle references.
- Batch ten adds partial stop-reason/refusal handling, structured outputs, streaming, citations, and adaptive-thinking/effort references. Some controls are beta- or model-specific, and schemas/valid citations do not establish that a requested action is authorized.
- Batch eleven adds ten partial Managed Agents pages on self-hosted sandbox architecture/security, memory-store sync, session updates, event streams/webhooks/deltas, observability, outcomes, and mounted files. These pages are beta-specific; the worker, memory, security, and lifecycle responsibilities differ from Messages API and managed-cloud behavior.
- Batch twelve adds five partial Managed Agents references for session/version selection, full-service vs sandbox hosting, worker operations/reference, and scheduled deployments. The host boundary and beta/API constraints should be checked against the selected deployment mode.
- Batch thirteen adds five partial Managed Agents pages on Dreams-based memory curation, self-hosted setup and data flow, retention/deletion boundaries, and deployment security. Dreams is research-preview; self-hosted deployment controls, model-provider traffic, telemetry, database, backups, and sandbox egress are separate concerns.
- Batch fourteen adds four partial Anthropic news/research sources on third-party evaluations, evaluation methodology, cyber-capability evaluation, and unintended agent actions. Research claims are source- and task-specific; the cyber synthesis intentionally omits operational details.
- Batch fifteen adds partial reads of general prompting guidance, Opus 5.5 prompting, Managed Agents session monitoring, and the Managed Agents reference. Additional segments were reviewed for both prompting pages and monitoring, but the sources remain partial; no publication dates were available in the fetched segments.
- Batch sixteen adds eight partial self-hosted Managed Agents and research pages plus one full dated evaluation-partnership announcement. The self-hosted docs are access-restricted and release-specific; the research findings are task-specific and do not establish general model or deployment guarantees.
- Batch seventeen adds six partial documentation pages on preserved-thinking replay, browser/computer SDK tools, hallucination and output consistency, Claude Code analytics, and self-hosted OIDC. All remain partial because the fetched sections were incomplete.
- Batch eighteen adds six partial sources covering Managed Agents session connect/create/update/delete and the Enterprise RBAC permissions API. These are versioned, beta or Enterprise-only API details; fetched references were not complete reads.
- Batch nineteen adds four partial Claude Agent SDK guides on deployment security, external session persistence, approvals/user input, and subagent design.
- The Claude Code changelog’s leading entry.

See `source-inventory.csv` for canonical URLs, source type, title where provided by an official index or reviewed page, sitemap date and date basis, snapshot access date, review state, inferred topic tags, and synthesis link.

## Pending work

- Read the remaining 1,427 sitemap-indexed English docs/news/research pages plus the 12 additional Claude Code LLMS-index links (1,439 inventoried pending pages total). The docs are broad and include API references, SDK language references, model guides, enterprise/admin material, release notes, and product-specific details not covered in the synthesis.
- Review older and less-agent-focused Anthropic announcements, research papers, and API feature pages.
- Review all 94 other Anthropic site pages only if the intended corpus includes company, policy, trust, legal, careers, and non-documentation product pages. These are indexed as excluded from this coding-agent knowledge synthesis, not discarded from the inventory.
- Review 33 platform URLs outside `/docs/`; these are product/console routes rather than documentation pages.
- Review 5,995 non-English documentation URLs if multilingual coverage is required. They are inventoried and explicitly excluded from this English-language snapshot.
- Re-run discovery before future integration: both indexes and model/release docs change over time.

## Inaccessible / unavailable

- `https://www.anthropic.com/llms.txt` returned HTTP 404. The official Anthropic sitemap was accessible and used instead.
- `https://platform.claude.com/docs/en/test-and-evaluate/overview` returned HTTP 404. The API docs index exposes the evaluation material under `https://platform.claude.com/docs/en/test-and-evaluate/develop-tests`, which was reviewed.
- The platform sitemap contains no `lastmod` values. Platform-doc dates are therefore left blank in the inventory; no publication/update dates are guessed. Claude Code and Anthropic sitemap timestamps are recorded as `sitemap_lastmod`, not assumed to be original publication dates.

## Exclusions and evidence quality

- Non-English sitemap entries are included as `excluded_non_English` rather than silently omitted.
- The 33 platform routes outside `/docs/` are marked `excluded_platform_surface`; the 94 other Anthropic pages are marked `excluded_other_site_page`.
- URLs in a sitemap or LLMS index are considered discovered/indexed, not read.
- `read_partial` means the official page was fetched and the returned portion reviewed, but the fetch was truncated or the source is a long moving document. Search snippets alone are never counted as page reads.
- Official blog/research assertions and evaluation numbers are attributed to those sources, not treated as independently verified benchmarks.
- The snapshot is specific to 2026-11-18. In particular, model names, release-note statements, beta/preview status, and Claude Code behavior can change after that date.
