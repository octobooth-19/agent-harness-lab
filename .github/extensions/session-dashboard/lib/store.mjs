// In-process source registry with durable persistence for snapshot sources.
// Live sources (self, peers) are never persisted; they are rebuilt on load.

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { buildView, normalizeSnapshot } from "./model.mjs";

export function createStore({ persistPath, onError = () => {} } = {}) {
    const sources = new Map();
    const listeners = new Set();
    let writeChain = Promise.resolve();

    function notify() {
        for (const fn of listeners) {
            try {
                fn();
            } catch (err) {
                onError(err);
            }
        }
    }

    function persist() {
        if (!persistPath) return Promise.resolve();
        const snapshots = [...sources.values()].filter((s) => s.origin === "snapshot");
        writeChain = writeChain
            .then(async () => {
                await mkdir(dirname(persistPath), { recursive: true });
                const tmp = `${persistPath}.tmp`;
                await writeFile(tmp, JSON.stringify({ version: 1, snapshots }, null, 2));
                await rename(tmp, persistPath);
            })
            .catch(onError);
        return writeChain;
    }

    return {
        async load() {
            if (!persistPath) return;
            try {
                const data = JSON.parse(await readFile(persistPath, "utf8"));
                for (const raw of data.snapshots ?? []) {
                    try {
                        // Re-validate; keep original observedAt so staleness stays truthful.
                        const s = normalizeSnapshot(
                            {
                                source: raw,
                                observedAt: raw.observedAt,
                                staleAfterSeconds: raw.staleAfterSeconds,
                                sessions: raw.sessions,
                            },
                            { now: Date.now() },
                        );
                        sources.set(s.id, s);
                    } catch (err) {
                        onError(err);
                    }
                }
                notify();
            } catch (err) {
                if (err.code !== "ENOENT") onError(err);
            }
        },
        setLive(source) {
            sources.set(source.id, source);
            notify();
        },
        ingest(input) {
            const s = normalizeSnapshot(input);
            const prev = sources.get(s.id);
            if (prev?.origin === "snapshot" && Date.parse(prev.observedAt) > Date.parse(s.observedAt)) {
                return { accepted: false, reason: "older than the snapshot already held for this source", source: s.id };
            }
            sources.set(s.id, s);
            notify();
            persist();
            return { accepted: true, source: s.id, sessions: s.sessions.length, observedAt: s.observedAt };
        },
        removeSource(id) {
            const s = sources.get(id);
            if (!s || s.origin !== "snapshot") return false;
            sources.delete(id);
            notify();
            persist();
            return true;
        },
        view(now = Date.now()) {
            // Stable source order: live first, then snapshots by label.
            const ordered = [...sources.values()].sort(
                (a, b) => (a.origin === b.origin ? a.label.localeCompare(b.label) : a.origin === "live" ? -1 : 1),
            );
            return buildView(ordered, now);
        },
        subscribe(fn) {
            listeners.add(fn);
            return () => listeners.delete(fn);
        },
        flush: () => writeChain,
    };
}
