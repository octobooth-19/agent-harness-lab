# Anthropic source coverage and limitations

**Snapshot/access date:** 2026-11-18
**Owner:** Anthropic provider track
**Status:** Partial, useful snapshot; not a claim that every indexed page was read.

## Discovery methods and counts

I used official published indexes and sitemaps rather than relying only on search snippets:

| Official source | Discovery method | URLs discovered | Read in this pass |
|---|---|---:|---:|
| Claude Platform docs | `https://platform.claude.com/llms.txt` plus `https://platform.claude.com/sitemap.xml` | 4,718 sitemap URLs: 923 English docs, 3,762 non-English docs, and 33 non-documentation platform/console routes | 44 English documentation pages, partial or full |
| Claude Code docs | `https://code.claude.com/docs/llms.txt` plus `https://code.claude.com/docs/sitemap.xml` | 2,437 sitemap URLs: 204 English pages and 2,233 non-English pages. The LLMS index exposes 216 links; the sitemap is the page-count basis. | 27 English documentation pages, partial or full |
| Anthropic site | `https://www.anthropic.com/sitemap.xml` | 593 pages: 280 `/news/`, 219 `/research/`, and 94 other site pages. Sitemap `lastmod` exists for 574. | 37 news/research pages, partial or full |
| Claude Code changelog | Linked by Claude Code documentation; fetched from the official `anthropics/claude-code` repository | 1 moving changelog | Latest top entry reviewed; partial |

**Sitemap page URLs discovered:** 7,748 across the three sitemap corpora, before adding the changelog and index records. The inventory includes every sitemap URL, including non-English pages and non-documentation platform routes. It also includes the two documentation indexes, the three sitemap endpoints, the changelog, and two failed endpoint probes as separate discovery records.

**Unique source pages reviewed:** 109 (108 documentation/news/research pages plus the changelog). Of the 108 docs/news/research pages, 68 are marked `read_partial` and 40 are marked `read`; the changelog remains `read_partial`. This batch added 14 pages (12 full, 2 partial), including six news/research sources and eight Platform docs. Two docs pages were truncated; details are in the inventory. Review status is page-level and does not imply exhaustive reading of every linked subpage. Index records are marked `index_read`, not page reads. The count excludes index and sitemap records.

**Remaining indexed English pages:** 1,626 sitemap pages (923 Platform docs + 204 Claude Code docs + 280 News + 219 Research) less 108 reviewed docs/news/research pages = **1,518 sitemap-indexed pages pending review**. The Claude Code LLMS index exposes 12 additional links not present in the sitemap; these are also inventoried as pending. The inventory therefore has 1,530 `indexed_only` rows. All 94 other Anthropic-site pages, all 33 platform routes outside the docs section, and all 5,995 non-English sitemap URLs are inventoried but not reviewed as documentation sources.

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
- The Claude Code changelog’s leading entry.

See `source-inventory.csv` for canonical URLs, source type, title where provided by an official index or reviewed page, sitemap date and date basis, snapshot access date, review state, inferred topic tags, and synthesis link.

## Pending work

- Read the remaining 1,518 sitemap-indexed English docs/news/research pages plus the 12 additional Claude Code LLMS-index links. The docs are broad and include API references, SDK language references, model guides, enterprise/admin material, release notes, and product-specific details not covered in the synthesis.
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
