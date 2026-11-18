#!/usr/bin/env node
// Live mission-control dashboard for Copilot sessions on this machine.
// Usage: node .github/extensions/session-dashboard/web/server.mjs [--port 4517] [--root <session-state dir>]
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { SessionMonitor, defaultSessionRoot } from "./lib/monitor.mjs";

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), "public");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };
const STATIC = new Map([["/", "index.html"], ["/index.html", "index.html"], ["/app.js", "app.js"], ["/styles.css", "styles.css"]]);
const HEADERS = {
    "Content-Security-Policy": "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store",
};

export function createDashboardServer({ monitor, port = 4517, host = "127.0.0.1" }) {
    const clients = new Set();
    let pending = null;
    const broadcast = () => {
        if (pending) return;
        pending = setTimeout(() => {
            pending = null;
            const payload = `event: state\ndata: ${JSON.stringify(monitor.view())}\n\n`;
            for (const res of clients) res.write(payload);
        }, 250);
    };
    monitor.on("change", broadcast);
    const heartbeat = setInterval(() => {
        const payload = `event: heartbeat\ndata: ${JSON.stringify({ at: new Date().toISOString(), lastScanAt: monitor.lastScanAt })}\n\n`;
        for (const res of clients) res.write(payload);
    }, 5000);

    const allowedHosts = () => new Set([`127.0.0.1:${server.address()?.port}`, `localhost:${server.address()?.port}`]);

    const server = createServer(async (req, res) => {
        // Reject foreign Host headers so a DNS-rebinding page can't read the feed.
        if (!allowedHosts().has(req.headers.host)) {
            res.writeHead(421).end("misdirected");
            return;
        }
        const url = new URL(req.url, "http://localhost");
        if (req.method !== "GET") {
            res.writeHead(405, HEADERS).end();
            return;
        }
        if (url.pathname === "/api/state") {
            res.writeHead(200, { ...HEADERS, "Content-Type": "application/json" }).end(JSON.stringify(monitor.view()));
            return;
        }
        if (url.pathname === "/events") {
            res.writeHead(200, { ...HEADERS, "Content-Type": "text/event-stream", Connection: "keep-alive" });
            res.write(`retry: 2000\nevent: state\ndata: ${JSON.stringify(monitor.view())}\n\n`);
            clients.add(res);
            req.on("close", () => clients.delete(res));
            return;
        }
        const file = STATIC.get(url.pathname);
        if (!file) {
            res.writeHead(404, HEADERS).end("not found");
            return;
        }
        const body = await readFile(join(PUBLIC_DIR, file));
        res.writeHead(200, { ...HEADERS, "Content-Type": TYPES[extname(file)] }).end(body);
    });

    const listen = () => new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => resolve(`http://${host}:${server.address().port}/`));
    });
    const close = () => new Promise((resolve) => {
        clearInterval(heartbeat);
        clearTimeout(pending);
        monitor.off("change", broadcast);
        for (const res of clients) res.end();
        server.close(() => resolve());
    });
    return { server, listen, close };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    const { values } = parseArgs({
        options: { port: { type: "string", default: "4517" }, root: { type: "string", default: defaultSessionRoot() } },
    });
    const monitor = new SessionMonitor({ root: values.root });
    await monitor.scan();
    monitor.start();
    const { listen } = createDashboardServer({ monitor, port: Number(values.port) });
    const url = await listen();
    process.stdout.write(`Session mission control: ${url}  (watching ${values.root})\n`);
}
