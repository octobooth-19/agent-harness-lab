# Knowledge library maintenance runbook

**Repository source of truth:** this runbook, `refresh-config.json`, the provider inventories, topic guides, and the refresh state/report are all versioned in this repository. No external package manager or generated knowledge service is required.

## 1. Run deterministic discovery and change detection

From the repository root, use Node.js built-ins:

```sh
node scripts/knowledge-refresh.mjs --limit-per-provider 1
```

The default examines one source page per configured provider. It refreshes official discovery indexes first, then prioritizes never-checked sources and previously reviewed pages. Each provider's full discovered backlog comes from its committed inventory plus configured official feeds, sitemaps, and index pages. To target one provider, add `--provider openai`, `--provider anthropic`, or `--provider github-copilot`. Increase the bounded batch with `--limit-per-provider N`; `--all` is an explicit, potentially large crawl.

The script writes:

- `knowledge/refresh-state.json`: index/source hashes, upstream blob hashes where available, HTTP ETags and Last-Modified validators, membership, last-good status, timestamps, failures, and deletions.
- `knowledge/refresh-report.json`: the latest run's discovered, selected, changed, initialized, unchanged, deleted, removed-from-index, and failed records.

GitHub Docs supplies file blob SHAs in its recursive tree index; when a blob SHA is unchanged, the page body is not requested again. For sources without a usable upstream content hash, the script sends `If-None-Match` and/or `If-Modified-Since` when available. A `304` retains the last-good hash. If neither mechanism is available, the body must be fetched and its SHA-256 compared locally; identical content is still reported unchanged.

Each run is resumable: successful checks advance their `last_checked_at`, so subsequent bounded runs move through the inventory rather than repeating the first batch. Failures remain in the state and report, keep prior last-good hashes/validators, and are retried after unchecked or older sources. `404`/`410` marks a page deleted; a URL disappearing from an index is only recorded as removed from that index and is not deleted from the source inventory. A failed discovery index does not erase its previous membership. The command writes state and report even when individual fetches fail, then exits nonzero so a caller can surface the failure.

This is a deterministic change detector, **not** a semantic summarizer. It never overwrites provider syntheses or topic files, and it does not mark a page read because it was fetched or listed in an index. The checked-in knowledge is the last-good human-reviewed synthesis; a failed refresh cannot replace it.

## 2. Have Copilot review changed sources

After a refresh, inspect `knowledge/refresh-report.json` and `knowledge/refresh-state.json`. For every changed source:

1. Open and review the official page itself. Do not rely on an index title, URL, feed excerpt, or hash as evidence for a claim.
2. Compare the current content to the cited material in the provider synthesis and topic guides. Check whether a release or blog claim is historical rather than current product behavior.
3. Update only the relevant provider synthesis and topic files. Keep the text original and concise; cite canonical primary-source URLs and record the actual access date.
4. Update the source inventory's review status only after reading the page. Preserve `indexed_only`/pending status for pages not reviewed, and revise the provider coverage counts/report if the review backlog changed.
5. Add a short note to the refresh report's interpretation or handoff about changed, deleted, failed, and pending pages. Keep the report machine-generated portion intact; do not make a failed fetch look successful.
6. Run the focused tests and validation below, then prepare a branch and pull request. Do not merge automatically.

Suggested in-repo maintenance prompt:

> Read `knowledge/MAINTENANCE.md`, run the bounded refresh command, inspect its report, and review changed official pages before making any semantic edits. Update only affected provider syntheses and topic guides with primary citations and retrieval dates. Preserve last-good content and pending/inaccessible distinctions; never treat an index as a read page or copy source prose wholesale. Run `node --test scripts/knowledge-refresh.test.mjs` and `git diff --check`, then prepare the changes for review in a branch and pull request. Do not merge.

## 3. Validate

```sh
node --test scripts/knowledge-refresh.test.mjs
node --check scripts/knowledge-refresh.mjs
git diff --check
```

The bounded live check can be repeated with `node scripts/knowledge-refresh.mjs --limit-per-provider 1`. If the process exits nonzero, inspect the persisted report and state; continue with sources that succeeded, retain the previous synthesis, and retry failures in a later run.

## 4. Copilot Automation

`.github/automations/knowledge-refresh.json` is the repository-owned definition and thin prompt for a future Copilot Automation. **The intended cadence is weekly**; the exact day and time, and coordinator approval, are pending. The template is not an active Automation and has no configured schedule. On 2026-11-18, the repository settings check reported automations enabled and this account able to manage them; re-check those settings and currently available tools/triggers at activation time. The template's null model means use the platform default. Keep behavior in this runbook and scripts; do not copy changing workflow logic into the Automation prompt. A cloud Automation runs against the repository default branch, so this definition and the refresh implementation must be merged to the default branch before the Automation can run against them. Its output must be a reviewable branch/PR, never an unattended merge.
