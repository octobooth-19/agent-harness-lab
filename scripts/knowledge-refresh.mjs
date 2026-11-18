#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_CONFIG = "knowledge/refresh-config.json";
const DEFAULT_STATE = "knowledge/refresh-state.json";
const DEFAULT_REPORT = "knowledge/refresh-report.json";
const PAGE_MAX_BYTES = 5_000_000;
const DISCOVERY_PARSER_VERSION = 1;

function canonicalizeUrl(value, baseUrl) {
  try {
    const url = new URL(value, baseUrl);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

function decodeEntities(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field.replace(/\r$/, ""));
    if (row.some((cell) => cell !== "")) rows.push(row);
  }
  if (rows.length === 0) return [];
  const headers = rows.shift();
  return rows.map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""])),
  );
}

function eligibleInventoryRow(row) {
  const status = String(row.review_status ?? "");
  const type = String(row.source_type ?? "");
  return (
    row.canonical_url &&
    !status.startsWith("excluded") &&
    !status.startsWith("inaccessible") &&
    !status.startsWith("index_") &&
    !/sitemap|index record/i.test(type)
  );
}

async function loadInventory(root, inventoryPath) {
  const absolutePath = path.resolve(root, inventoryPath);
  const text = await readFile(absolutePath, "utf8");
  const rows = absolutePath.endsWith(".csv")
    ? parseCsv(text)
    : (() => {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) return parsed;
        if (Array.isArray(parsed.sources)) return parsed.sources;
        throw new Error(`Unsupported inventory structure: ${inventoryPath}`);
      })();
  return rows.filter(eligibleInventoryRow).map((row) => ({
    canonical_url: canonicalizeUrl(row.canonical_url),
    title: row.title || null,
    source_type: row.source_type || "official source",
    review_status: row.review_status || "pending",
    topics: row.topics || [],
    discovered_from: row.discovered_from || row.discovery_method || null,
  })).filter((row) => row.canonical_url);
}

function feedMetadata(xml, url) {
  const entries = [];
  const blocks = xml.match(/<(?:item|entry)\b[^>]*>[\s\S]*?<\/(?:item|entry)>/gi) || [];
  for (const block of blocks) {
    const title = block.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
    const date = block.match(/<(?:pubDate|published|updated)\b[^>]*>([\s\S]*?)<\/(?:pubDate|published|updated)>/i)?.[1];
    const textLink = block.match(/<link\b[^>]*>([\s\S]*?)<\/link>/i)?.[1];
    const attrLink = block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?>/i)?.[1];
    const entryUrl = canonicalizeUrl(decodeEntities((attrLink || textLink || "").trim()), url);
    if (entryUrl) {
      entries.push({
        canonical_url: entryUrl,
        title: title ? decodeEntities(title.replace(/<[^>]+>/g, "").trim()) : null,
        published_or_updated_date: date ? decodeEntities(date.replace(/<[^>]+>/g, "").trim()) : null,
      });
    }
  }
  return entries;
}

export function extractCandidates(body, format, discovery) {
  const text = Buffer.isBuffer(body) ? body.toString("utf8") : String(body);
  const urls = [];
  const metadata = new Map();
  const add = (value, extra = {}) => {
    const url = canonicalizeUrl(decodeEntities(value.trim()), discovery.url);
    if (!url) return;
    urls.push(url);
    if (extra.title || extra.published_or_updated_date) metadata.set(url, extra);
  };

  if (format === "llms") {
    for (const match of text.matchAll(/\[[^\]]*\]\((https?:\/\/[^)\s]+)(?:\s+["'][^)]*["'])?\)/g)) add(match[1]);
    for (const match of text.matchAll(/^\s*(https?:\/\/\S+)/gm)) add(match[1].replace(/[),.;]+$/, ""));
  } else if (format === "sitemap") {
    for (const match of text.matchAll(/<(?:loc|link)\b[^>]*>([\s\S]*?)<\/(?:loc|link)>/gi)) add(match[1].replace(/<[^>]+>/g, ""));
    for (const match of text.matchAll(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?>/gi)) add(match[1]);
  } else if (format === "rss") {
    for (const entry of feedMetadata(text, discovery.url)) {
      add(entry.canonical_url, entry);
    }
  } else if (format === "html") {
    for (const match of text.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>/gi)) add(match[1]);
  } else if (format === "github-tree") {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed.tree)) throw new Error("GitHub tree response has no tree array");
    if (parsed.truncated) throw new Error("GitHub tree response is truncated");
    const pathFilter = discovery.include ? new RegExp(discovery.include) : null;
    for (const item of parsed.tree) {
      if (
        item.type !== "blob" ||
        !/^content\/copilot\/.*\.mdx?$/i.test(item.path || "") ||
        (pathFilter && !pathFilter.test(item.path))
      ) continue;
      const route = item.path
        .replace(/^content\//, "")
        .replace(/\/index\.mdx?$/i, "")
        .replace(/\.mdx?$/i, "");
      const url = `https://docs.github.com/en/${route.split("/").map(encodeURIComponent).join("/")}`;
      add(url, { upstream_hash: item.sha || null });
      if (item.sha) metadata.set(canonicalizeUrl(url), { upstream_hash: item.sha });
    }
  } else if (format !== "document") {
    throw new Error(`Unsupported discovery format: ${format}`);
  }

  const include = discovery.include ? new RegExp(discovery.include) : null;
  const exclude = discovery.exclude ? new RegExp(discovery.exclude) : null;
  const unique = new Map();
  for (const url of urls) {
    if ((format !== "github-tree" && include && !include.test(url)) || (exclude && exclude.test(url))) continue;
    const extra = metadata.get(url) || {};
    unique.set(url, {
      canonical_url: url,
      title: extra.title || null,
      published_or_updated_date: extra.published_or_updated_date || null,
      upstream_hash: extra.upstream_hash || null,
    });
  }
  return [...unique.values()].sort((a, b) => a.canonical_url.localeCompare(b.canonical_url));
}

function contentHash(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function fetchResource(fetcher, url, headers, maxBytes) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetcher(url, {
      headers: {
        "User-Agent": "agent-harness-lab-knowledge-refresh/1.0",
        Accept: "text/html,application/xml,application/json,text/plain,*/*",
        ...headers,
      },
      signal: controller.signal,
    });
    if (response.status === 304) return { status: 304, headers: response.headers, body: Buffer.alloc(0) };
    if (!response.ok) return { status: response.status, headers: response.headers, body: Buffer.alloc(0) };
    const body = Buffer.from(await response.arrayBuffer());
    if (body.byteLength > maxBytes) throw new Error(`Response exceeds ${maxBytes} byte limit`);
    return { status: response.status, headers: response.headers, body };
  } finally {
    clearTimeout(timeout);
  }
}

function validators(record) {
  const headers = {};
  if (record?.etag) headers["If-None-Match"] = record.etag;
  if (record?.last_modified) headers["If-Modified-Since"] = record.last_modified;
  return headers;
}

function errorText(error) {
  return String(error?.message || error).slice(0, 500);
}

function sourceTypeForDiscovery(discoveryId) {
  if (/changelog/i.test(discoveryId)) return "changelog";
  if (/blog|news|research|rss/i.test(discoveryId)) return "blog or news";
  return "documentation";
}

function ensureProviderState(state, providerId) {
  state.providers[providerId] ||= { discovery: {}, sources: {} };
  state.providers[providerId].discovery ||= {};
  state.providers[providerId].sources ||= {};
  return state.providers[providerId];
}

async function atomicJsonWrite(filePath, data) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}`;
  await writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await rename(tempPath, filePath);
}

export async function runRefresh({
  root = REPO_ROOT,
  configPath = DEFAULT_CONFIG,
  statePath = DEFAULT_STATE,
  reportPath = DEFAULT_REPORT,
  providerFilter = null,
  limitPerProvider = 1,
  all = false,
  fetcher = globalThis.fetch,
  now = () => new Date(),
} = {}) {
  const config = JSON.parse(await readFile(path.resolve(root, configPath), "utf8"));
  const stateFile = path.resolve(root, statePath);
  let state;
  try {
    state = JSON.parse(await readFile(stateFile, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    state = { schema_version: 1, providers: {} };
  }
  if (state.schema_version !== 1 || typeof state.providers !== "object") {
    throw new Error("Unsupported or invalid refresh state schema");
  }

  const runDate = now().toISOString();
  const report = {
    schema_version: 1,
    run_at: runDate,
    snapshot_date: config.snapshot_date,
    mode: all ? "all" : "bounded",
    providers: {},
  };
  const selectedProviders = config.providers.filter((provider) => !providerFilter || provider.id === providerFilter);
  if (selectedProviders.length === 0) throw new Error(`No configured provider matches ${providerFilter}`);

  for (const provider of selectedProviders) {
    const providerState = ensureProviderState(state, provider.id);
    const inventoryRows = await loadInventory(root, provider.inventory);
    const inventoryByUrl = new Map(inventoryRows.map((row) => [row.canonical_url, row]));
    for (const [url, source] of Object.entries(providerState.sources)) {
      if (inventoryByUrl.has(url)) {
        delete source.title;
        delete source.source_type;
        delete source.review_status;
        delete source.topics;
        delete source.discovered_from;
      }
      delete source.last_seen_at;
    }

    const providerReport = {
      indexed_candidates: 0,
      newly_discovered: 0,
      tracked_sources: 0,
      selected: 0,
      changed: [],
      initialized: [],
      unchanged: [],
      deleted: [],
      removed_from_indexes: [],
      failures: [],
      indexes: [],
    };
    const discoveredCandidates = new Map();
    const newlyDiscoveredUrls = new Set();

    for (const discovery of provider.discovery || []) {
      const discoveryKey = `${discovery.id}:${discovery.url}`;
      const previous = providerState.discovery[discoveryKey] || {};
      const indexReport = { id: discovery.id, url: discovery.url, status: "failed", discovered: 0 };
      try {
        const maxBytes = discovery.max_bytes || config.max_response_bytes || 20_000_000;
        const indexValidators = previous.parser_version === DISCOVERY_PARSER_VERSION ? validators(previous) : {};
        const result = await fetchResource(fetcher, discovery.url, indexValidators, maxBytes);
        const checkedAt = now().toISOString();
        if (result.status === 304) {
          indexReport.status = "unchanged";
          indexReport.discovered = (previous.members || []).length;
          providerState.discovery[discoveryKey] = {
            ...previous,
            parser_version: DISCOVERY_PARSER_VERSION,
            last_checked_at: checkedAt,
            last_status: "unchanged",
            last_error: null,
          };
          for (const url of previous.members || []) {
            const source = providerState.sources[url] || inventoryByUrl.get(url);
            if (source) discoveredCandidates.set(url, {
              canonical_url: url,
              title: source.title || null,
              upstream_hash: source.upstream_hash || null,
              discovered_from: discoveryKey,
            });
          }
        } else if (!((result.status >= 200) && (result.status < 300))) {
          throw new Error(`HTTP ${result.status}`);
        } else {
          const hash = contentHash(result.body);
          const candidates = extractCandidates(result.body, discovery.format, discovery);
          const currentMembers = candidates.map((candidate) => candidate.canonical_url);
          const previousMembers = new Set(previous.members || []);
          const currentSet = new Set(currentMembers);
          for (const url of previousMembers) {
            if (!currentSet.has(url)) providerReport.removed_from_indexes.push({ index: discoveryKey, url });
          }
          for (const candidate of candidates) {
            const current = providerState.sources[candidate.canonical_url] || { canonical_url: candidate.canonical_url };
            const inventorySource = inventoryByUrl.get(candidate.canonical_url);
            if (!inventorySource && !providerState.sources[candidate.canonical_url]) {
              newlyDiscoveredUrls.add(candidate.canonical_url);
            }
            const source = {
              ...current,
              canonical_url: candidate.canonical_url,
              ...(candidate.upstream_hash && !providerState.sources[candidate.canonical_url]
                ? { upstream_hash: candidate.upstream_hash }
                : {}),
              ...(!inventorySource ? {
                title: candidate.title || current.title || null,
                source_type: current.source_type || sourceTypeForDiscovery(discovery.id),
                review_status: current.review_status || "pending",
                discovered_from: current.discovered_from || discoveryKey,
              } : {}),
              ...(!providerState.sources[candidate.canonical_url] ? { first_seen_at: checkedAt } : {}),
              ...(current.last_status === "deleted" ? { last_status: "pending", deleted_at: null } : {}),
            };
            providerState.sources[candidate.canonical_url] = source;
            discoveredCandidates.set(candidate.canonical_url, candidate);
          }
          providerState.discovery[discoveryKey] = {
            canonical_url: discovery.url,
            parser_version: DISCOVERY_PARSER_VERSION,
            last_checked_at: checkedAt,
            last_good_fetched_at: checkedAt,
            last_good_sha256: hash,
            etag: result.headers.get("etag") || previous.etag || null,
            last_modified: result.headers.get("last-modified") || previous.last_modified || null,
            last_status: previous.last_good_sha256 && previous.last_good_sha256 === hash ? "unchanged" : "changed",
            members: currentMembers,
            last_error: null,
          };
          indexReport.status = providerState.discovery[discoveryKey].last_status;
          indexReport.discovered = candidates.length;
          indexReport.new_members = candidates.filter((candidate) => !previousMembers.has(candidate.canonical_url)).length;
        }
      } catch (error) {
        const checkedAt = now().toISOString();
        providerState.discovery[discoveryKey] = {
          ...previous,
          canonical_url: discovery.url,
          last_checked_at: checkedAt,
          last_status: "failed",
          last_error: errorText(error),
          failure_count: (previous.failure_count || 0) + 1,
        };
        indexReport.status = "failed";
        indexReport.error = errorText(error);
        providerReport.failures.push({ phase: "discovery", id: discovery.id, url: discovery.url, error: indexReport.error });
        for (const url of previous.members || []) {
          const source = providerState.sources[url] || inventoryByUrl.get(url);
          if (source) discoveredCandidates.set(url, {
            canonical_url: url,
            title: source.title || null,
            upstream_hash: source.upstream_hash || null,
            discovered_from: discoveryKey,
          });
        }
      }
      providerReport.indexes.push(indexReport);
    }

    providerReport.indexed_candidates = discoveredCandidates.size;
    providerReport.newly_discovered = newlyDiscoveredUrls.size;
    providerReport.tracked_sources = new Set([
      ...inventoryByUrl.keys(),
      ...Object.keys(providerState.sources),
    ]).size;
    const sources = new Map(inventoryByUrl);
    for (const [url, source] of Object.entries(providerState.sources)) {
      sources.set(url, { ...(inventoryByUrl.get(url) || {}), ...source });
    }
    const queue = [...sources.values()]
      .filter((source) => source.last_status !== "deleted")
      .sort((a, b) => {
        const dateA = a.last_checked_at || "";
        const dateB = b.last_checked_at || "";
        if (dateA !== dateB) return dateA.localeCompare(dateB);
        const rank = (status) => ["read", "read_partial"].includes(status) ? 0 : 1;
        const priority = rank(a.review_status) - rank(b.review_status);
        return priority || a.canonical_url.localeCompare(b.canonical_url);
      });
    const limit = all ? queue.length : Math.max(0, Number.isInteger(limitPerProvider) ? limitPerProvider : 1);
    const selected = queue.slice(0, limit);
    providerReport.selected = selected.length;

    for (const source of selected) {
      const previous = providerState.sources[source.canonical_url] || { canonical_url: source.canonical_url };
      const candidate = discoveredCandidates.get(source.canonical_url);
      const upstreamHash = candidate?.upstream_hash || source.upstream_hash || null;
      const checkedAt = now().toISOString();
      if (upstreamHash && previous.last_good_sha256 && previous.upstream_hash === upstreamHash) {
        providerState.sources[source.canonical_url] = {
          ...previous,
          upstream_hash: upstreamHash,
          last_checked_at: checkedAt,
          last_status: "unchanged",
          last_error: null,
        };
        providerReport.unchanged.push({ url: source.canonical_url, via: "upstream_hash" });
        continue;
      }

      try {
        const pageValidators =
          upstreamHash && previous.upstream_hash && upstreamHash !== previous.upstream_hash
            ? {}
            : validators(previous);
        const result = await fetchResource(fetcher, source.canonical_url, pageValidators, PAGE_MAX_BYTES);
        if (result.status === 304) {
          providerState.sources[source.canonical_url] = {
            ...previous,
            upstream_hash: upstreamHash || previous.upstream_hash || null,
            last_checked_at: checkedAt,
            last_status: "unchanged",
            last_error: null,
          };
          providerReport.unchanged.push({ url: source.canonical_url, via: "http_304" });
          continue;
        }
        if (result.status === 404 || result.status === 410) {
          providerState.sources[source.canonical_url] = {
            ...previous,
            upstream_hash: upstreamHash || previous.upstream_hash || null,
            last_checked_at: checkedAt,
            last_status: "deleted",
            deleted_at: checkedAt,
            last_http_status: result.status,
            last_error: null,
          };
          providerReport.deleted.push(source.canonical_url);
          continue;
        }
        if (!((result.status >= 200) && (result.status < 300))) throw new Error(`HTTP ${result.status}`);
        const hash = contentHash(result.body);
        const firstFetch = !previous.last_good_sha256;
        const changed = !firstFetch && hash !== previous.last_good_sha256;
        providerState.sources[source.canonical_url] = {
          ...previous,
          upstream_hash: upstreamHash || previous.upstream_hash || null,
          last_checked_at: checkedAt,
          last_good_fetched_at: checkedAt,
          last_good_sha256: hash,
          etag: result.headers.get("etag") || previous.etag || null,
          last_modified: result.headers.get("last-modified") || previous.last_modified || null,
          last_http_status: result.status,
          last_status: firstFetch ? "initialized" : changed ? "changed" : "unchanged",
          last_error: null,
          failure_count: 0,
          deleted_at: null,
        };
        if (firstFetch) providerReport.initialized.push(source.canonical_url);
        else if (changed) providerReport.changed.push(source.canonical_url);
        else providerReport.unchanged.push({ url: source.canonical_url, via: "content_hash" });
      } catch (error) {
        const message = errorText(error);
        providerState.sources[source.canonical_url] = {
          ...previous,
          last_checked_at: checkedAt,
          last_status: "failed",
          last_error: message,
          failure_count: (previous.failure_count || 0) + 1,
        };
        providerReport.failures.push({ phase: "source", url: source.canonical_url, error: message });
      }
    }
    report.providers[provider.id] = providerReport;
  }

  state.updated_at = runDate;
  report.summary = Object.fromEntries(
    Object.entries(report.providers).map(([id, result]) => [
      id,
      {
        indexed_candidates: result.indexed_candidates,
        newly_discovered: result.newly_discovered,
        tracked_sources: result.tracked_sources,
        selected: result.selected,
        initialized: result.initialized.length,
        changed: result.changed.length,
        unchanged: result.unchanged.length,
        deleted: result.deleted.length,
        failures: result.failures.length,
        removed_from_indexes: result.removed_from_indexes.length,
      },
    ]),
  );
  await atomicJsonWrite(path.resolve(root, statePath), state);
  await atomicJsonWrite(path.resolve(root, reportPath), report);
  return report;
}

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--all") options.all = true;
    else if (["--provider", "--limit-per-provider", "--config", "--state", "--report"].includes(arg)) {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) throw new Error(`Expected a value after ${arg}`);
      i += 1;
      if (arg === "--provider") options.providerFilter = value;
      if (arg === "--limit-per-provider") {
        const limit = Number(value);
        if (!Number.isInteger(limit) || limit < 0) throw new Error("--limit-per-provider must be a non-negative integer");
        options.limitPerProvider = limit;
      }
      if (arg === "--config") options.configPath = value;
      if (arg === "--state") options.statePath = value;
      if (arg === "--report") options.reportPath = value;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const report = await runRefresh(parseArgs(process.argv.slice(2)));
    console.log(JSON.stringify(report.summary, null, 2));
    if (Object.values(report.providers).some((provider) => provider.failures.length > 0)) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`knowledge refresh failed: ${errorText(error)}`);
    process.exitCode = 1;
  }
}
