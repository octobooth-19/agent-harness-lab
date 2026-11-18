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
| `read` | 9 | Page content was fetched and the relevant article was reviewed without a truncation notice. |
| `read_partial` | 23 | Page content was fetched, but the page response was truncated or only the relevant portion was reviewed. |
| `indexed_only` / pending | 1,550 | The URL and metadata were discovered and entered in the inventory; the article content was not substantively reviewed. |
| Inaccessible pages | 0 verified | No individual content page was confirmed inaccessible. Most pending pages were not individually opened, so this is not a claim that every URL is reachable. |
| Excluded URLs within the three enumerated indexes | 0 | All records returned by the selected indexes are included. |

The `review_status` field in [`sources.json`](sources.json) distinguishes pages read from pages merely indexed. A non-null `synthesis_location` points to the synthesis for the reviewed pages. The 1,550 indexed-only entries remain pending; index discovery is not equivalent to reading or validating their contents.

The read sample is intentionally focused rather than random. It covers the docs landing page and material about agent surfaces, CLI, SDK loop, app, cloud and local sandboxes, permissions and security, instructions, skills, custom agents, MCP, memory, context, delegation, workflows, environment setup, and code review. Blog/changelog reading prioritized coding-agent setup, skill portability, harness evaluation, review evaluation, Copilot Evals, harness comparisons, customization governance, and the November 2026 code-review release. See `review_status` for the exact URLs.

## Coverage limits and pending areas

This is a broad, machine-indexed snapshot with a focused read, **not an exhaustive semantic review** of all Copilot materials.

* **Documentation boundary:** the 577 pages are Markdown under `content/copilot/` in the observed `github/docs` `main` tree. Related material outside that directory—such as general GitHub Actions, security, billing, IDE-vendor, or GitHub CLI documentation—is not counted as Copilot documentation here, even when Copilot pages link to it. The docs repository can change after the recorded commit.
* **Blog boundary:** the 147 items are posts in the dedicated GitHub Copilot blog category. Other official GitHub Blog categories can contain Copilot-related engineering, product, research, or case-study posts; those were not enumerated, so their number is not measured.
* **Changelog boundary:** 858 entries carry the `copilot` label. Copilot-related changes published only under other labels are not included. In particular, `client apps`, account management, application security, and other labels may include relevant releases.
* **Read depth:** 32 pages (9 full and 23 partial) were reviewed at article level. Most of the source inventory remains pending. `read_partial` records prevent truncated fetches from being represented as full reads.
* **Linked follow-up:** the November 17 Evals changelog links to the official `github/evals` project and Evals documentation. Those materials were noted but not separately indexed or reviewed in this provider slice. Third-party MCP server catalogs and external standards are likewise outside these three corpora.
* **Historical claims:** dated blog/changelog statements, availability, pricing, preview labels, and benchmark figures can be superseded. Current behavior should be checked against the current documentation page linked in `sources.json`; historical posts are retained as chronology, not merged into current specification.

The next useful coverage increment is to read the pending docs by section, then enumerate related blog and changelog material outside the category/label filters, while preserving the original dates and status distinctions.
