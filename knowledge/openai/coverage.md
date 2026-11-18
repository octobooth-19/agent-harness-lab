# OpenAI source coverage

**Snapshot date:** 2026-11-18
**Status:** Useful partial snapshot; this does not claim that every OpenAI source page was read.

## Counts

Counts below describe distinct URL strings in `source-inventory.json`, not necessarily distinct pages: 366 URL groups differ only by a trailing slash and have not been reconciled. A page marked **indexed** was found in an official index, sitemap, or RSS feed, but its own content was not opened. Index/feed metadata is not counted as reading the linked article.

| Measure | Count | Meaning |
|---|---:|---|
| Discovered URL rows | 2,833 | URLs cataloged from official documentation indexes, selected sitemaps, the OpenAI News RSS feed, and official Codex release records. |
| Read pages | 100 | The page itself was opened and reviewed sufficiently for synthesis. |
| Partially read pages | 131 | The page was opened, but only part could be reviewed; these are counted separately from full reads. |
| Inaccessible pages | 0 | No inventoried content page remained inaccessible after resolving the Codex changelog's HTML route. |
| Pending pages | 2,602 | Discovered but not read. This includes most indexed API references, Codex/ChatGPT product docs, Cookbook entries, blog/news articles, and learning resources. |
| Excluded unique links | 26 | Non-primary-domain links or full-export/text resources omitted from the source-page inventory. |

The row-status arithmetic is consistent: 100 read + 131 partial + 0 inaccessible + 2,602 pending = 2,833 discovered URL rows. `source-inventory.json` includes the required per-source fields and records whether a date comes from publication metadata or sitemap `lastmod`.

## Discovery methods and corpus boundaries

1. **Developer documentation hub:** Read `https://developers.openai.com/llms.txt`, which identifies 12 product documentation sets, including API, Codex, Workspace Agents, plugins/Apps SDK, developer blog, Cookbook, learning resources, and showcase. Traversed nested official indexes, including the API guides and endpoint reference. Fifteen unique documentation index pages were fetched successfully (hub, product indexes, and nested API indexes). Duplicate Codex/ChatGPT index aliases were deduplicated at the page URL level.
2. **Official OpenAI site sitemap:** Read `https://openai.com/sitemap.xml`, which lists 44 category sitemap endpoints. Enumerated the technical/news subset of five: `page` (218 `/index/` URLs), `api` (13), `engineering` (23), `release` (85), and `research` (61). These contain 400 URL occurrences and 386 distinct `/index/` article URLs.
3. **Official OpenAI News RSS:** Read `https://openai.com/news/rss.xml` (the legacy `/blog/rss.xml` URL redirects there). The feed yielded 1,405 item records with publication metadata; those records were cataloged but not treated as article reads.
4. **Codex release history:** Read the official `openai/codex` GitHub Releases page. Its November 18, 2026 release entry is reviewed in the synthesis.
5. **Search:** Used official-domain web search to locate the Codex loop and harness-engineering articles, then opened those primary OpenAI pages directly. Search snippets were not treated as page reads.

The inventory contains **2,833** URL rows. Recent batches reconcile redirect aliases for reviewed sources, but the remaining trailing-slash variants have not been reconciled. The counts are not a count of the entire OpenAI web presence: the RSS and selected sitemap sets are bounded discovery sources, while the documentation indexes include pages that remain pending.

## Read coverage and source status

The 100 fully reviewed pages are marked `review_status: "read"` and 131 partial reads are marked `read_partial`. The cumulative reviewed sample covers:

- Codex instruction discovery, skills, memories, MCP, rules, subagents, permissions, sandboxing, and approvals.
- Agents API and Agents SDK architecture, sessions, events, recovery, environments, tool use, MCP, multi-agent flows, and human review.
- Agent Builder's typed-node workflow and its safety recommendations, including the dated shutdown notice.
- Responses API function calling, tools, compaction, model selection, evaluation guides, changelog, and deprecations.
- Twenty-three OpenAI developer-blog posts, 24 Cookbook pages (including agent and evaluation recipes), 20 OpenAI News articles, four sitemap-indexed articles, three research articles, the current ChatGPT & Codex changelog, and the official Codex GitHub release listing.
- The new batch reviewed Codex/Agents SDK architecture, agent definitions, prompt caching, secure MCP, skills, a Codex app-server integration, safety and cyber checks, archived Cookbook patterns, and dated engineering/blog and plugin-changelog entries.
- This batch adds Agents SDK model/provider selection and results/state, API conversation state and async tool calls, two evaluation resources, and dated customer/research/developer-blog cases. Several Evals and Graders pages state a read-only/shutdown transition dated October 31/November 30, 2026; those product lifecycle notes are time-sensitive and remain separate from application-owned evaluation practice.
- Batch five adds Agent SDK quickstart, Bedrock/AWS/Databricks environment integration, Agents API plugins and web search, plus dated Codex harness/security and multi-agent/evaluation case studies.
- Batch six adds an archived Responses API multi-tool/RAG example, a local-first long-term-memory state pattern, a Daytona computer-use sandbox example, and the current Codex MCP-server removal notice.
- Batch seven adds partial reviews of Realtime API tool routing, the computer-use tool loop, and two dated articles: the original Responses API/Agents SDK announcement and Codex role-specific plugins/Sites. The dated posts provide historical release context, not current product specifications.
- Batch eight adds partial reviews of hosted shell, deferred tool search, programmatic tool calling, and a 2019 multi-agent research article. These are separate execution and research patterns; the old research result is not a current agent-product claim.
- Batch nine adds partial API guides on prompt engineering/generation, prompt-object migration, cache diagnostics, patch application, Python execution, file/web search, and computer-use driver ownership. The prompt-object shutdown date is a dated lifecycle notice; other model-specific settings should be checked against the live API pages.
- Batch ten adds reasoning and model-specific prompt guidance, the Evals-backed Prompt Optimizer, and four Agent API self-hosted environment providers. Four batch pages were fully read (the Prompt Optimizer and three provider recipes); the other four were partial. Provider lifecycle, credential, and provisioning behavior differs.
- Batch eleven adds an Agent Builder migration guide, four more Agents API sandbox-provider recipes, project service-account/key guidance, background Responses, and a legacy token/reproducibility page. Three pages were fully read and five partial; API examples, model windows, preview states, and retention claims are snapshot-specific.
- Batch twelve adds the GPT-5.3-Codex and GPT-5.5 frontend prompt guides, an asynchronous Workspace Agent trigger example, and a GPT-Live evaluation guide. All four are partial; model-specific prompting and the voice-evaluation harness should not be generalized as current defaults for other surfaces.
- Batch thirteen adds Codex CLI, a Codex phase-based workflow example, GPT-6.2-in-Codex prompting, and an Agents SDK sandbox-migration example. All four are partial; command/permission behavior, model advice, and sandbox setup are surface-specific.
- Batch fourteen adds the Responses API multi-agent guide, LifeVal evaluation, model-misalignment reporting framework, and historical Model Spec launch post. All four are partial; feature/model claims are beta- or date-specific, and research results are not universal agent benchmarks.
- Batch fifteen reviews Codex Cloud in full and partial excerpts from ChatGPT Tasks and memory, workload identity federation rules, and the Retrieval API guide. It adds one full and three partial reads; the scheduler, API identity, and retrieval behavior remain surface-specific, and the truncated pages need further review.
- Batch sixteen adds nine partial reads: current GPT-5.5/GPT-6.2 guidance, GPT-Live setup/session/delegation/migration, and three dated developer posts. The pages are model/API- and product-specific; the migration and blog examples remain partial and are not universal performance evidence.
- Batch seventeen adds one full trace-grading guide and five partial evaluation resources, including an archived Cookbook recipe and two dated audits of coding-benchmark quality. Benchmark findings are attributed to OpenAI and should not be generalized beyond the named datasets.
- Batch eighteen adds six partial sources on RBAC, Terraform project controls, MCP, security-review workflow, prompt-injection defenses, and Realtime session state. The older `platform.openai.com` MCP URL redirects to the separately inventoried canonical MCP guide and was not counted as an independent read.
- Batch nineteen adds four partial Cookbook sources on incident-response agents, data-agent context/memory boundaries, cost/quality optimization, and ChatGPT workspace agents; these are product examples, not general API guarantees.
- Batch twenty adds four partial Cookbook references on Agents SDK deployment management, a provider-specific migration architecture, archived multi-agent orchestration, and a Slack session/workspace integration.
- Batch twenty-one adds four partial OpenAI engineering/evaluation articles about internal data-agent context and memory, Symphony orchestration, a joint safety evaluation, and third-party evaluation validity. Two RSS/sitemap slash variants were merged after canonical redirects; the inventory counts resolved canonical pages rather than duplicate aliases.
- Batch twenty-two adds four new partial sources on agent standards, read-only Docs MCP, remote MCP publication review, and ChatGPT Apps. A pending non-trailing-slash harness URL was merged into the already reviewed trailing-slash canonical page; the alias is not an additional read.
- Batch twenty-three adds three full reads on model optimization, GPT-5.6 guidance, and the archived routines-and-handoffs Cookbook, plus a partial Agents API streaming-events reference. GPT-5.6 prompt/PTC recommendations and API lifecycle details are model-, beta-, or surface-specific; the Cookbook explicitly marks its Swarm code as proof of concept.

Read status means the page was opened and its relevant content reviewed; it does not mean every code sample or every section was exhaustively audited. `read_partial` records a page whose fetched content was incomplete. Batch four opened 12 pages (2 full, 10 partial); batch five opened 11 pages (all full); batch six opened 4 pages (1 full and 3 partial); batch seven opened 4 pages (all partial); batch eight opened 4 pages (all partial); batch nine opened 11 pages (all partial); batch ten opened 8 pages (4 full, 4 partial); batch eleven opened 8 pages (3 full, 5 partial); batch twelve opened 4 pages (all partial); batch thirteen opened 4 pages (all partial); batch fourteen opened 4 pages (all partial); batch fifteen opened 4 pages (1 full and 3 partial); batch sixteen opened 9 pages (all partial); batch seventeen opened 6 pages (1 full and 5 partial); batch eighteen opened 6 pages (all partial); batch nineteen opened 4 pages (all partial); batch twenty opened 4 pages (all partial); batch twenty-one reviewed four unique canonical pages (all partial) after merging two duplicate trailing-slash aliases; batch twenty-two adds four new partial pages after one redirect alias was merged into an already-read canonical page; batch twenty-three adds three full pages and one partial page. The archived RAG notebook and long Cookbook pages remain partial. No URL was inaccessible. Linked papers, repos, and provider documentation were not followed and are not counted as reviewed.

## Inaccessible, excluded, and pending areas

- **Unavailable discovery resources:** The discovered ChatGPT use-cases `llms.txt` index returned 404; it is recorded separately as an index failure, not a content page. The developer-hosted `sitemap.xml` endpoint returned 404. The Platform sitemap endpoint exposed only a tokenizer URL and was not useful for documentation discovery. The Codex changelog's guessed `.md` twin returned 404, but the canonical HTML route at `https://developers.openai.com/codex/changelog` resolved to the current ChatGPT & Codex changelog and was reviewed.
- **Sitemap coverage not included:** Thirty-nine of the 44 OpenAI sitemap families were not part of this technical-source inventory. An initial fetch of all category endpoints found 36 returned 403; three additional reachable business/plugin families were left out as outside the coding-agent/API/research scope. Their pages are not counted as reviewed or as individual inaccessible pages.
- **Full-document exports:** `llms-full.txt` exports were identified from indexes but not downloaded or counted as individual reads. They are bulk copies, not substitutes for reviewing source pages.
- **Unverified titles:** Sitemap entries do not provide page titles. For sitemap-only items without a matching RSS title, the inventory leaves `title` null rather than deriving or inventing one from the URL slug.
- **Backlog:** The inventory has 2,602 pending URLs, including most API endpoint reference entries, the larger Codex/ChatGPT docs corpus, Cookbook examples, developer-blog posts, OpenAI News items, and learning/showcase pages. The 1,405 RSS items have dates/titles but should be individually opened before making claims about their content.
- **Dates:** Source dates vary. Where available, the inventory records the RSS publication date or sitemap `lastmod`; sitemap timestamps are explicitly labeled as `sitemap lastmod`, not publication dates. Documentation pages without an authoritative date leave it null. The snapshot date remains 2026-11-18.

## Interpretation cautions

- Do not infer that an indexed page was read from its title or summary; `review_status` is the authoritative distinction.
- Product and API behavior changes quickly. Use the live documentation and changelog for current behavior; use dated launch articles as historical evidence only.
- Product surfaces differ. Codex clients, the Agents SDK, Agents API, and Responses API do not share identical state, tools, approvals, or environment controls.
- The synthesis is an original, source-linked summary. It does not reproduce OpenAI documentation wholesale and does not claim exhaustive source coverage.
