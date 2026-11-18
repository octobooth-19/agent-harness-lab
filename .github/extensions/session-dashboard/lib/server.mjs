// Loopback-only HTTP server for one canvas instance: static UI assets,
// a JSON state endpoint, and Server-Sent Events for push updates.
// Read-only by design: the only non-GET route asks for a fresh peer probe.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const ASSETS = {
    "/": ["index.html", "text/html; charset=utf-8"],
    "/index.html": ["index.html", "text/html; charset=utf-8"],
    "/app.js": ["app.js", "text/javascript; charset=utf-8"],
    "/styles.css": ["styles.css", "text/css; charset=utf-8"],
};
const TICK_MS = 15_000;

export async function startDashboardServer({ uiDir, getView, subscribe, onRefresh, onError = () => {} }) {
    const clients = new Set();

    const send = (res, view) => res.write(`event: state\ndata: ${JSON.stringify(view)}\n\n`);
    const broadcast = () => {
        if (!clients.size) return;
        const view = getView();
        for (const res of clients) send(res, view);
    };
    const unsubscribe = subscribe(broadcast);
    // Periodic re-render so fresh -> stale transitions appear without new data.
    const tick = setInterval(broadcast, TICK_MS);
    tick.unref?.();

    const server = createServer(async (req, res) => {
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Cache-Control", "no-store");
        const path = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
        try {
            if (req.method === "GET" && ASSETS[path]) {
                const [file, type] = ASSETS[path];
                res.setHeader("Content-Type", type);
                if (file === "index.html") {
                    res.setHeader(
                        "Content-Security-Policy",
                        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:",
                    );
                }
                res.end(await readFile(join(uiDir, file)));
                return;
            }
            if (req.method === "GET" && path === "/api/state") {
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify(getView()));
                return;
            }
            if (req.method === "GET" && path === "/events") {
                res.writeHead(200, { "Content-Type": "text/event-stream", Connection: "keep-alive" });
                clients.add(res);
                send(res, getView());
                req.on("close", () => clients.delete(res));
                return;
            }
            if (req.method === "POST" && path === "/api/refresh") {
                await onRefresh?.();
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify(getView()));
                return;
            }
            res.statusCode = 404;
            res.end("Not found");
        } catch (err) {
            onError(err);
            if (!res.headersSent) res.statusCode = 500;
            res.end("Internal error");
        }
    });

    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;

    return {
        url: `http://127.0.0.1:${port}/`,
        async close() {
            clearInterval(tick);
            unsubscribe();
            for (const res of clients) res.end();
            clients.clear();
            await new Promise((resolve) => server.close(() => resolve()));
        },
    };
}
