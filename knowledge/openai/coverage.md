# OpenAI source coverage

**Snapshot date:** 2026-11-18
**Status:** Useful partial snapshot; this does not claim that every OpenAI source page was read.

## Counts

Counts below describe unique canonical URL rows in `source-inventory.json`. A page marked **indexed** was found in an official index, sitemap, or RSS feed, but its own content was not opened. Index/feed metadata is not counted as reading the linked article.

| Measure | Count | Meaning |
|---|---:|---|
| Discovered pages | 2,836 | Distinct page URLs cataloged from official documentation indexes, selected sitemaps, the OpenAI News RSS feed, and official Codex release records. |
| Read pages | 45 | The page itself was opened and reviewed for this synthesis. |
| Inaccessible pages | 0 | No inventoried content page remained inaccessible after resolving the Codex changelog's HTML route. |
| Pending pages | 2,791 | Discovered but not read. This includes most indexed API references, Codex/ChatGPT product docs, Cookbook entries, blog/news articles, and learning resources. |
| Excluded unique links | 26 | Non-primary-domain links or full-export/text resources omitted from the source-page inventory. |

The page-status arithmetic is consistent: 45 read + 0 inaccessible + 2,791 pending = 2,836 discovered. `source-inventory.json` includes the required per-source fields and records whether a date comes from publication metadata or sitemap `lastmod`.

## Discovery methods and corpus boundaries

1. **Developer documentation hub:** Read `https://developers.openai.com/llms.txt`, which identifies 12 product documentation sets, including API, Codex, Workspace Agents, plugins/Apps SDK, developer blog, Cookbook, learning resources, and showcase. Traversed nested official indexes, including the API guides and endpoint reference. Fifteen unique documentation index pages were fetched successfully (hub, product indexes, and nested API indexes). Duplicate Codex/ChatGPT index aliases were deduplicated at the page URL level.
2. **Official OpenAI site sitemap:** Read `https://openai.com/sitemap.xml`, which lists 44 category sitemap endpoints. Enumerated the technical/news subset of five: `page` (218 `/index/` URLs), `api` (13), `engineering` (23), `release` (85), and `research` (61). These contain 400 URL occurrences and 386 distinct `/index/` article URLs.
3. **Official OpenAI News RSS:** Read `https://openai.com/news/rss.xml` (the legacy `/blog/rss.xml` URL redirects there). The feed yielded 1,405 item records with publication metadata; those records were cataloged but not treated as article reads.
4. **Codex release history:** Read the official `openai/codex` GitHub Releases page. Its November 18, 2026 release entry is reviewed in the synthesis.
5. **Search:** Used official-domain web search to locate the Codex loop and harness-engineering articles, then opened those primary OpenAI pages directly. Search snippets were not treated as page reads.

The inventory contains **2,836** page rows after canonical URL deduplication across those sources. The counts are not a count of the entire OpenAI web presence: the RSS and selected sitemap sets are bounded discovery sources, while the documentation indexes include pages that remain pending.

## Read coverage and source status

The 45 read pages are the sources marked `review_status: "read"` in the JSON inventory. They cover:

- Codex instruction discovery, skills, memories, MCP, subagents, permissions, sandboxing, and approvals.
- Agents API and Agents SDK architecture, sessions, events, recovery, environments, tools, MCP, multi-agent flows, and human review.
- Responses API function calling, tools, compaction, model selection, evaluation guides, changelog, and deprecations.
- Six OpenAI developer-blog posts, three OpenAI engineering/product articles, the current ChatGPT & Codex changelog, and the official Codex GitHub release listing.

Read status means the page was opened and its relevant content reviewed; it does not mean every code sample or every section was exhaustively audited. Long pages returned truncated excerpts in some fetches, so the synthesis deliberately stays at the documented themes and links to the primary page for exact implementation details.

## Inaccessible, excluded, and pending areas

- **Unavailable discovery resources:** The discovered ChatGPT use-cases `llms.txt` index returned 404; it is recorded separately as an index failure, not a content page. The developer-hosted `sitemap.xml` endpoint returned 404. The Platform sitemap endpoint exposed only a tokenizer URL and was not useful for documentation discovery. The Codex changelog's guessed `.md` twin returned 404, but the canonical HTML route at `https://developers.openai.com/codex/changelog` resolved to the current ChatGPT & Codex changelog and was reviewed.
- **Sitemap coverage not included:** Thirty-nine of the 44 OpenAI sitemap families were not part of this technical-source inventory. An initial fetch of all category endpoints found 36 returned 403; three additional reachable business/plugin families were left out as outside the coding-agent/API/research scope. Their pages are not counted as reviewed or as individual inaccessible pages.
- **Full-document exports:** `llms-full.txt` exports were identified from indexes but not downloaded or counted as individual reads. They are bulk copies, not substitutes for reviewing source pages.
- **Unverified titles:** Sitemap entries do not provide page titles. For sitemap-only items without a matching RSS title, the inventory leaves `title` null rather than deriving or inventing one from the URL slug.
- **Backlog:** The inventory has 2,791 pending URLs, including most API endpoint reference entries, the larger Codex/ChatGPT docs corpus, Cookbook examples, developer-blog posts, OpenAI News items, and learning/showcase pages. The 1,405 RSS items have dates/titles but should be individually opened before making claims about their content.
- **Dates:** Source dates vary. Where available, the inventory records the RSS publication date or sitemap `lastmod`; sitemap timestamps are explicitly labeled as `sitemap lastmod`, not publication dates. Documentation pages without an authoritative date leave it null. The snapshot date remains 2026-11-18.

## Interpretation cautions

- Do not infer that an indexed page was read from its title or summary; `review_status` is the authoritative distinction.
- Product and API behavior changes quickly. Use the live documentation and changelog for current behavior; use dated launch articles as historical evidence only.
- Product surfaces differ. Codex clients, the Agents SDK, Agents API, and Responses API do not share identical state, tools, approvals, or environment controls.
- The synthesis is an original, source-linked summary. It does not reproduce OpenAI documentation wholesale and does not claim exhaustive source coverage.
