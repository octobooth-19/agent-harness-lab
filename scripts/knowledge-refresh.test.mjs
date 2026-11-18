import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { extractCandidates, runRefresh } from "./knowledge-refresh.mjs";

test("extracts canonical pages and metadata from supported discovery formats", () => {
  const sitemap = extractCandidates(
    "<urlset><url><loc>https://docs.example/a?x=1&amp;y=2#part</loc></url></urlset>",
    "sitemap",
    { url: "https://docs.example/sitemap.xml", include: "^https://docs\\.example/" },
  );
  assert.deepEqual(sitemap.map((item) => item.canonical_url), ["https://docs.example/a?x=1&y=2"]);

  const rss = extractCandidates(
    "<rss><channel><item><title>Release &amp; notes</title><link>https://blog.example/post</link><pubDate>2026-11-18</pubDate></item></channel></rss>",
    "rss",
    { url: "https://blog.example/feed.xml" },
  );
  assert.equal(rss[0].title, "Release & notes");
  assert.equal(rss[0].published_or_updated_date, "2026-11-18");

  const tree = extractCandidates(
    JSON.stringify({ tree: [{ type: "blob", path: "content/copilot/concepts/agents.md", sha: "blob-sha-1" }] }),
    "github-tree",
    {
      url: "https://api.github.com/repos/github/docs/git/trees/main?recursive=1",
      include: "^content/copilot/.*\\.md$",
    },
  );
  assert.equal(tree[0].canonical_url, "https://docs.github.com/en/copilot/concepts/agents");
  assert.equal(tree[0].upstream_hash, "blob-sha-1");
});

test("uses validators, detects changed content, and preserves last-good hash on failure", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "knowledge-refresh-test-"));
  try {
    await mkdir(path.join(root, "knowledge"), { recursive: true });
    await writeFile(
      path.join(root, "knowledge", "inventory.csv"),
      'canonical_url,title,source_type,review_status,topics\n"https://site.test/a","A, title",documentation,read,"agent,tools"\n',
    );
    await writeFile(
      path.join(root, "knowledge", "config.json"),
      JSON.stringify({
        schema_version: 1,
        snapshot_date: "2026-11-18",
        providers: [{
          id: "example",
          inventory: "knowledge/inventory.csv",
          discovery: [{ id: "index", url: "https://index.test/llms.txt", format: "llms" }],
        }],
      }),
    );

    let pageVersion = 1;
    let failureMode = false;
    const fetcher = async (url, options) => {
      if (url === "https://index.test/llms.txt") {
        return new Response("[A](https://site.test/a)\n", { status: 200, headers: { etag: '"index-1"' } });
      }
      if (url === "https://site.test/a") {
        if (failureMode) throw new Error("temporary network failure");
        if (pageVersion === 1 && options.headers["If-None-Match"] === '"page-1"') {
          return new Response(null, { status: 304, headers: { etag: '"page-1"' } });
        }
        return new Response(`page version ${pageVersion}`, {
          status: 200,
          headers: { etag: `"page-${pageVersion}"`, "last-modified": "Wed, 18 Nov 2026 00:00:00 GMT" },
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    const options = { root, configPath: "knowledge/config.json", statePath: "knowledge/state.json", reportPath: "knowledge/report.json", fetcher };
    const first = await runRefresh(options);
    assert.equal(first.providers.example.initialized.length, 1);
    const firstState = JSON.parse(await readFile(path.join(root, "knowledge", "state.json"), "utf8"));
    const firstHash = firstState.providers.example.sources["https://site.test/a"].last_good_sha256;
    assert.ok(firstHash);

    const second = await runRefresh(options);
    assert.deepEqual(second.providers.example.unchanged, [{ url: "https://site.test/a", via: "http_304" }]);
    assert.equal(second.providers.example.failures.length, 0);

    pageVersion = 2;
    const third = await runRefresh(options);
    assert.deepEqual(third.providers.example.changed, ["https://site.test/a"]);
    const changedState = JSON.parse(await readFile(path.join(root, "knowledge", "state.json"), "utf8"));
    const lastGoodHash = changedState.providers.example.sources["https://site.test/a"].last_good_sha256;
    assert.notEqual(lastGoodHash, firstHash);

    failureMode = true;
    const fourth = await runRefresh(options);
    assert.equal(fourth.providers.example.failures.length, 1);
    const failedState = JSON.parse(await readFile(path.join(root, "knowledge", "state.json"), "utf8"));
    const failedSource = failedState.providers.example.sources["https://site.test/a"];
    assert.equal(failedSource.last_good_sha256, lastGoodHash);
    assert.equal(failedSource.last_status, "failed");
    assert.match(failedSource.last_error, /temporary network failure/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("skips a page body when the upstream blob hash is unchanged", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "knowledge-refresh-hash-test-"));
  try {
    await mkdir(path.join(root, "knowledge"), { recursive: true });
    await writeFile(
      path.join(root, "knowledge", "inventory.json"),
      JSON.stringify({ sources: [{ canonical_url: "https://docs.github.com/en/copilot/a", review_status: "read" }] }),
    );
    await writeFile(
      path.join(root, "knowledge", "config.json"),
      JSON.stringify({
        schema_version: 1,
        snapshot_date: "2026-11-18",
        providers: [{
          id: "github-copilot",
          inventory: "knowledge/inventory.json",
          discovery: [{
            id: "tree",
            url: "https://api.github.com/repos/github/docs/git/trees/main?recursive=1",
            format: "github-tree",
          }],
        }],
      }),
    );

    let pageRequests = 0;
    let upstreamHash = "blob-sha-1";
    const pageHeaders = [];
    const fetcher = async (url, options) => {
      if (url.startsWith("https://api.github.com/")) {
        return new Response(JSON.stringify({
          tree: [{ type: "blob", path: "content/copilot/a.md", sha: upstreamHash }],
        }), { status: 200 });
      }
      if (url === "https://docs.github.com/en/copilot/a") {
        pageRequests += 1;
        pageHeaders.push(options.headers);
        return new Response(upstreamHash === "blob-sha-1" ? "source page" : "updated source page", {
          status: 200,
          headers: { etag: `"${upstreamHash}"` },
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    const options = { root, configPath: "knowledge/config.json", statePath: "knowledge/state.json", reportPath: "knowledge/report.json", fetcher };
    await runRefresh(options);
    const second = await runRefresh(options);
    assert.equal(pageRequests, 1);
    assert.deepEqual(second.providers["github-copilot"].unchanged, [
      { url: "https://docs.github.com/en/copilot/a", via: "upstream_hash" },
    ]);
    upstreamHash = "blob-sha-2";
    const third = await runRefresh(options);
    assert.deepEqual(third.providers["github-copilot"].changed, ["https://docs.github.com/en/copilot/a"]);
    assert.equal(pageRequests, 2);
    assert.equal(pageHeaders[1]["If-None-Match"], undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("records an authoritative 404 as deletion without discarding the last-good hash", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "knowledge-refresh-delete-test-"));
  try {
    await mkdir(path.join(root, "knowledge"), { recursive: true });
    await writeFile(path.join(root, "knowledge", "inventory.json"), JSON.stringify({
      sources: [{ canonical_url: "https://site.test/gone", review_status: "read" }],
    }));
    await writeFile(path.join(root, "knowledge", "config.json"), JSON.stringify({
      schema_version: 1,
      snapshot_date: "2026-11-18",
      providers: [{ id: "example", inventory: "knowledge/inventory.json", discovery: [] }],
    }));
    let status = 200;
    const fetcher = async () => new Response("last good body", { status });
    const options = { root, configPath: "knowledge/config.json", statePath: "knowledge/state.json", reportPath: "knowledge/report.json", fetcher };
    await runRefresh(options);
    const statePath = path.join(root, "knowledge", "state.json");
    const initialHash = JSON.parse(await readFile(statePath, "utf8")).providers.example.sources["https://site.test/gone"].last_good_sha256;
    status = 404;
    const result = await runRefresh(options);
    assert.deepEqual(result.providers.example.deleted, ["https://site.test/gone"]);
    const source = JSON.parse(await readFile(statePath, "utf8")).providers.example.sources["https://site.test/gone"];
    assert.equal(source.last_good_sha256, initialHash);
    assert.equal(source.last_status, "deleted");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("keeps last-good discovery membership when an index fetch fails", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "knowledge-refresh-index-failure-test-"));
  try {
    await mkdir(path.join(root, "knowledge"), { recursive: true });
    await writeFile(path.join(root, "knowledge", "inventory.json"), JSON.stringify({
      sources: [{ canonical_url: "https://site.test/a", review_status: "read" }],
    }));
    await writeFile(path.join(root, "knowledge", "config.json"), JSON.stringify({
      schema_version: 1,
      snapshot_date: "2026-11-18",
      providers: [{
        id: "example",
        inventory: "knowledge/inventory.json",
        discovery: [{ id: "index", url: "https://index.test/llms.txt", format: "llms" }],
      }],
    }));
    let failIndex = false;
    const fetcher = async (url) => {
      if (url === "https://index.test/llms.txt") {
        if (failIndex) throw new Error("index unavailable");
        return new Response("[A](https://site.test/a)\n", { status: 200 });
      }
      return new Response("source body", { status: 200 });
    };
    const options = { root, configPath: "knowledge/config.json", statePath: "knowledge/state.json", reportPath: "knowledge/report.json", fetcher };
    await runRefresh(options);
    const statePath = path.join(root, "knowledge", "state.json");
    const before = JSON.parse(await readFile(statePath, "utf8")).providers.example.discovery["index:https://index.test/llms.txt"];
    failIndex = true;
    const failed = await runRefresh({ ...options, limitPerProvider: 0 });
    const after = JSON.parse(await readFile(statePath, "utf8")).providers.example.discovery["index:https://index.test/llms.txt"];
    assert.equal(failed.providers.example.failures.length, 1);
    assert.deepEqual(after.members, before.members);
    assert.equal(after.last_good_sha256, before.last_good_sha256);
    assert.equal(after.last_status, "failed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
