import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { startDashboardServer } from "../lib/server.mjs";

const uiDir = join(dirname(fileURLToPath(import.meta.url)), "..", "ui");

test("server is loopback-only, serves UI and state, and rejects unknown routes", async () => {
    let refreshed = 0;
    const srv = await startDashboardServer({
        uiDir,
        getView: () => ({ now: new Date().toISOString(), sources: [], sessions: [] }),
        subscribe: () => () => {},
        onRefresh: async () => refreshed++,
    });
    try {
        assert.match(srv.url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
        const html = await fetch(srv.url);
        assert.equal(html.status, 200);
        assert.match(html.headers.get("content-security-policy"), /script-src 'self'/);
        const state = await (await fetch(`${srv.url}api/state`)).json();
        assert.deepEqual([state.sources, state.sessions], [[], []]);
        assert.equal((await fetch(`${srv.url}../extension.mjs`)).status, 404);
        assert.equal((await fetch(`${srv.url}api/state`, { method: "POST" })).status, 404);
        assert.equal((await fetch(`${srv.url}api/refresh`, { method: "POST" })).status, 200);
        assert.equal(refreshed, 1);
    } finally {
        await srv.close();
    }
});
