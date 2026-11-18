# GitHub Copilot source coverage

**Snapshot/access date:** 2026-11-18
**Synthesis:** [`synthesis.md`](synthesis.md)
**Inventory:** [`sources.json`](sources.json)

## What was inventoried

The source inventory contains **1,582 unique content URLs** from three official GitHub sources:

| Corpus | Discovered | Index and method |
|---|---:|---|
| GitHub Copilot documentation | 577 | Recursively enumerated Markdown pages under `content/copilot/` in the official [`github/docs` repository tree](https://api.github.com/repos/github/docs/git/trees/main?recursive=1), then mapped paths to docs.github.com routes and extracted titles from source front matter. The enumerated `main` tree was commit `894743c137d97e27ebc2dc7ef3377603684b13eb`. |
| GitHub Blog — GitHub Copilot category | 147 | Official WordPress REST API category `3295`, fetched over both pages at 100 posts per page; the category itself is [here](https://github.blog/ai-and-ml/github-copilot/). |
| GitHub Changelog — `copilot` label | 858 | Official REST API taxonomy search identifies `copilot` as label `2765` with count 858; fetched all nine pages at 100 entries per page. The source index is [the Copilot label archive](https://github.blog/changelog/label/copilot/). |
| **Total** | **1,582** | Canonical URLs are unique across the inventory. |

The documentation titles were read from source front matter; unresolved GitHub product-template variables were expanded to their display names. Publication and update dates are left `null` for documentation when the source front matter did not provide them. Blog and changelog dates are taken from the official REST index. All rows carry the consistent access date `2026-11-18`.

The docs portal sitemap probe at `https://docs.github.com/sitemap.xml` returned 404. Instead of assuming an absent portal sitemap meant no docs, discovery used the docs landing page and the official source repository tree. The Blog category and Changelog label are scoped indexes, not a crawl of every GitHub Blog post or every Changelog post.

## Review status

| Status | Count | Meaning |
|---|---:|---|
| `read` | 88 | Page content was fetched and the relevant article was reviewed sufficiently for synthesis. |
| `read_partial` | 112 | Page content was fetched, but the page response was truncated or only the relevant portion was reviewed. |
| `index_read` | 11 | Navigation pages were opened and reviewed, but their linked subpages were not counted as reviewed. |
| `indexed_only` / pending | 1,371 | The URL and metadata were discovered and entered in the inventory; the article content was not substantively reviewed. |
| Inaccessible pages | 0 verified | No individual content page was confirmed inaccessible. Most pending pages were not individually opened, so this is not a claim that every URL is reachable. |
| Excluded URLs within the three enumerated indexes | 0 | All records returned by the selected indexes are included. |

The `review_status` field in [`sources.json`](sources.json) distinguishes pages read from pages merely indexed. A non-null `synthesis_location` points to the synthesis for the reviewed pages. The 1,371 indexed-only entries remain pending; index discovery is not equivalent to reading or validating their contents. The eleven `index_read` pages are recorded separately because they list links but did not support substantive synthesis.

The Read sample is intentionally focused rather than random. It covers the docs landing page and material about agent surfaces, CLI, SDK loop, app, cloud and local sandboxes, permissions and security, instructions, skills, custom agents, MCP, memory, context, delegation, workflows, environment setup, Autopilot autonomy/permission separation, deferred tool search, and code review. A prior 20-page batch added automation and Agentic Workflows, Autopilot flags, SDK context clearing, enterprise custom-agent governance, CLI instruction loading, MCP policy, remote control, rationale/approval limits, and two section indexes; linked topics on those indexes remain unreviewed. The previous batch added prompt files, hooks, Dreaming, tool permission layering, skills, MCP-registry administration, enterprise controls and CLI session history. Batch four added agent management, task routing, customization comparisons, assisted permissions, OpenTelemetry, model selection, browser-use, and current dated notes about Agentic Workflows, Copilot Automations, plugins, CLI sign-in and code-review outcomes. Batch five adds third-party agent and app surfaces, computer use, CLI-in-Actions policy, integrations, plugins/BYOK, repository indexing, prompt engineering and local sandboxing, plus dated reports on custom-agent workflows, coordination and canvases. Batch six adds the IDE MCP-navigation hub, remote GitHub MCP setup and Enterprise configuration, plus a dated usage-metrics API change. Batch seven adds the MCP-based cloud-agent launch path, CLI MCP configuration, the dated GA of agent skills/MCP in code review, and a 2025 MCP workflow article; the docs and blog are partial while the release note and cloud-agent guide are full. Batch eight adds IDE agent-mode/MCP guidance, GitHub MCP toolset and registry configuration, and a dated UI-debugging walkthrough; the selected docs/blog were partial except the toolset page. Batch nine adds CLI LSP configuration, enterprise plugin and governance controls, GitHub-verified connectors, model availability, Copilot Fusion routing, and dated auto-selection cost/quality tiers. Batch ten reviews local/cloud sandbox controls, organization runner setup, custom-agent organization setup, and enterprise MCP allowlist/registry controls. Batch eleven adds CLI custom-agent/scheduling behavior, Copilot Spaces context, agent-app integration and parallel-fleet/token-efficiency accounts, and dated automation/model lifecycle updates. Four pages are full and five partial; CLI scheduling is experimental and tied to a running session. Batch twelve adds enterprise model controls, three current model/usage changelog updates, and a legal team's Copilot CLI workflow account. Three pages are full and two partial; the dated model and metric details are not stable product guarantees. Batch thirteen reviews two navigation hubs for link discovery (not article reads), plus organization model-policy inheritance, CLI BYOK/model requirements, and interactive CLI code review; one article was full and two partial. Batch fourteen adds the VS Code Local-harness retirement notice, local-model discovery in Copilot CLI, and the technical-preview Agentic Workflows announcement; one changelog entry is full and the other items are partial. Batch fifteen adds three partial reads of content exclusion, network settings, and session data, plus one opened security/governance navigation hub marked `index_read`. Batch sixteen adds eight partial pages on enterprise custom-agent/model governance, CLI model selection and agent invocation, plus three dated blog posts, and opens the enterprise agent-management navigation hub as `index_read`. Batch seventeen adds four partial pages on enterprise governance, MCP, and agent review, one full browser-use page, and one opened IDE agent-navigation hub marked `index_read`. Batch eighteen adds five partial IDE articles on agent execution, planning, custom agents, cloud sessions, and GitHub MCP, plus an opened cloud-agent customization hub marked `index_read`. See `sources.json` for each source's review status.

Batch nineteen adds four partial November 2026 changelog entries on browser use, new model availability, model deprecation, and weekly agent/model releases. All dated availability and lifecycle claims remain time-specific; the full pages were only partially reviewed.

## Coverage limits and pending areas

This is a broad, machine-indexed snapshot with a focused read, **not an exhaustive semantic review** of all Copilot materials.

* **Documentation boundary:** the 577 pages are Markdown under `content/copilot/` in the observed `github/docs` `main` tree. Related material outside that directory—such as general GitHub Actions, security, billing, IDE-vendor, or GitHub CLI documentation—is not counted as Copilot documentation here, even when Copilot pages link to it. The docs repository can change after the recorded commit.
* **Blog boundary:** the 147 items are posts in the dedicated GitHub Copilot blog category. Other official GitHub Blog categories can contain Copilot-related engineering, product, research, or case-study posts; those were not enumerated, so their number is not measured.
* **Changelog boundary:** 858 entries carry the `copilot` label. Copilot-related changes published only under other labels are not included. In particular, `client apps`, account management, application security, and other labels may include relevant releases.
* **Read depth:** 200 pages (88 full and 112 partial) have been reviewed at page level, plus eleven opened navigation pages. Most of the source inventory remains pending. `read_partial` records prevent truncated fetches from being represented as full reads.
* **Linked follow-up:** the November 17 Evals changelog links to the official `github/evals` project and Evals documentation. Those materials were noted but not separately indexed or reviewed in this provider slice. Third-party MCP server catalogs and external standards are likewise outside these three corpora.
* **Historical claims:** dated blog/changelog statements, availability, pricing, preview labels, and benchmark figures can be superseded. Current behavior should be checked against the current documentation page linked in `sources.json`; historical posts are retained as chronology, not merged into current specification.

The next useful coverage increment is to read the pending docs by section, then enumerate related blog and changelog material outside the category/label filters, while preserving the original dates and status distinctions.
