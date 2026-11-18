// Pure, dependency-free status model shared by every data source.
//
// Two independent axes are tracked for every session row:
//   activity  - what the session was doing when observed (busy/idle/blocked/error/unknown)
//   freshness - how trustworthy that observation is now (live/fresh/stale/unavailable)
// "idle" never implies "done"; nothing in this model infers task completion.

export const ACTIVITIES = ["busy", "idle", "blocked", "error", "unknown"];
export const SOURCE_KINDS = ["copilot-app", "harness", "other"];
export const SOURCE_SCOPES = ["project", "session", "local", "other"];
export const RESERVED_SOURCE_IDS = ["self", "peers"];
export const DEFAULT_STALE_AFTER_SECONDS = 600;

const MAX_TEXT = 300;
const MAX_SESSIONS = 500;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SAFE_URL_PROTOCOLS = new Set(["https:", "ghapp:"]);

/** JSON Schema for one snapshot, shared by the canvas action and docs. */
export const SNAPSHOT_SCHEMA = {
    type: "object",
    required: ["source", "observedAt", "sessions"],
    properties: {
        source: {
            type: "object",
            required: ["id", "kind", "label", "scope"],
            properties: {
                id: { type: "string", description: "Stable source key, e.g. copilot-app-project or harness-local." },
                kind: { type: "string", enum: SOURCE_KINDS },
                label: { type: "string", description: "Human label shown in the UI, e.g. 'Coordinator snapshot'." },
                scope: { type: "string", enum: SOURCE_SCOPES, description: "project = this Project's sessions." },
                scopeLabel: { type: "string", description: "Optional human scope name, e.g. the Project name." },
            },
        },
        observedAt: { type: "string", description: "ISO-8601 time the source data was actually observed." },
        staleAfterSeconds: { type: "number", minimum: 10, maximum: 86400 },
        sessions: {
            type: "array",
            maxItems: MAX_SESSIONS,
            items: {
                type: "object",
                required: ["id", "name", "activity"],
                properties: {
                    id: { type: "string" },
                    name: { type: "string" },
                    activity: { type: "string", enum: ACTIVITIES },
                    activityDetail: { type: "string", description: "e.g. 'awaiting plan approval'." },
                    provider: { type: "string", description: "e.g. 'GitHub Copilot app', 'harness'." },
                    mode: { type: "string" },
                    repository: { type: "string" },
                    branch: { type: "string" },
                    appUrl: { type: "string", description: "Exact app link (ghapp:// or https://) when supplied." },
                    pullRequestUrl: { type: "string" },
                    lastActivityAt: { type: "string" },
                },
            },
        },
    },
};

export class SnapshotError extends Error {
    constructor(message) {
        super(message);
        this.code = "invalid_snapshot";
    }
}

function text(value, field, { required = false } = {}) {
    if (value === undefined || value === null || value === "") {
        if (required) throw new SnapshotError(`${field} is required`);
        return undefined;
    }
    if (typeof value !== "string") throw new SnapshotError(`${field} must be a string`);
    const trimmed = value.trim().slice(0, MAX_TEXT);
    if (required && !trimmed) throw new SnapshotError(`${field} is required`);
    return trimmed || undefined;
}

function oneOf(value, allowed, field) {
    if (!allowed.includes(value)) throw new SnapshotError(`${field} must be one of ${allowed.join(", ")}`);
    return value;
}

function timestamp(value, field, { required = false } = {}) {
    const raw = text(value, field, { required });
    if (raw === undefined) return undefined;
    const ms = Date.parse(raw);
    if (Number.isNaN(ms)) throw new SnapshotError(`${field} must be an ISO-8601 timestamp`);
    return new Date(ms).toISOString();
}

/** Returns the URL string only if it uses an allowed protocol; otherwise undefined. */
export function safeUrl(value) {
    if (typeof value !== "string" || !value) return undefined;
    try {
        const url = new URL(value);
        return SAFE_URL_PROTOCOLS.has(url.protocol) ? url.toString() : undefined;
    } catch {
        return undefined;
    }
}

/**
 * Validate and normalize an externally supplied snapshot (coordinator or
 * future harness). Throws SnapshotError on structural problems.
 */
export function normalizeSnapshot(input, { now = Date.now() } = {}) {
    if (!input || typeof input !== "object") throw new SnapshotError("snapshot must be an object");
    const src = input.source;
    if (!src || typeof src !== "object") throw new SnapshotError("source is required");
    const id = text(src.id, "source.id", { required: true });
    if (!ID_PATTERN.test(id) || RESERVED_SOURCE_IDS.includes(id)) {
        throw new SnapshotError("source.id must be a simple identifier and not a reserved live source id");
    }
    const observedAt = timestamp(input.observedAt, "observedAt", { required: true });
    if (Date.parse(observedAt) > now + 60_000) throw new SnapshotError("observedAt is in the future");
    const staleAfterSeconds = input.staleAfterSeconds ?? DEFAULT_STALE_AFTER_SECONDS;
    if (typeof staleAfterSeconds !== "number" || staleAfterSeconds < 10 || staleAfterSeconds > 86400) {
        throw new SnapshotError("staleAfterSeconds must be between 10 and 86400");
    }
    if (!Array.isArray(input.sessions)) throw new SnapshotError("sessions must be an array");
    if (input.sessions.length > MAX_SESSIONS) throw new SnapshotError(`at most ${MAX_SESSIONS} sessions`);

    const seen = new Set();
    const sessions = input.sessions.map((s, i) => {
        if (!s || typeof s !== "object") throw new SnapshotError(`sessions[${i}] must be an object`);
        const sid = text(s.id, `sessions[${i}].id`, { required: true });
        if (seen.has(sid)) throw new SnapshotError(`duplicate session id ${sid}`);
        seen.add(sid);
        return {
            id: sid,
            name: text(s.name, `sessions[${i}].name`, { required: true }),
            activity: oneOf(s.activity, ACTIVITIES, `sessions[${i}].activity`),
            activityDetail: text(s.activityDetail, `sessions[${i}].activityDetail`),
            provider: text(s.provider, `sessions[${i}].provider`),
            mode: text(s.mode, `sessions[${i}].mode`),
            repository: text(s.repository, `sessions[${i}].repository`),
            branch: text(s.branch, `sessions[${i}].branch`),
            appUrl: safeUrl(s.appUrl),
            pullRequestUrl: safeUrl(s.pullRequestUrl),
            lastActivityAt: timestamp(s.lastActivityAt, `sessions[${i}].lastActivityAt`),
        };
    });

    return {
        id,
        kind: oneOf(src.kind, SOURCE_KINDS, "source.kind"),
        label: text(src.label, "source.label", { required: true }),
        scope: oneOf(src.scope, SOURCE_SCOPES, "source.scope"),
        scopeLabel: text(src.scopeLabel, "source.scopeLabel"),
        origin: "snapshot",
        available: true,
        observedAt,
        staleAfterSeconds,
        sessions,
    };
}

/** Freshness of a whole source at `now`. */
export function sourceFreshness(source, now = Date.now()) {
    if (!source.available || !source.observedAt) return "unavailable";
    if (source.origin === "live") return "live";
    const age = now - Date.parse(source.observedAt);
    return age <= source.staleAfterSeconds * 1000 ? "fresh" : "stale";
}

const FRESHNESS_RANK = { live: 3, fresh: 2, stale: 1, unavailable: 0 };

/**
 * Build the render view: one row per distinct session id. When several
 * sources report the same session, the most trustworthy observation wins
 * (live > fresh > stale, then newest) and the others are listed as
 * `alsoReportedBy`.
 */
export function buildView(sources, now = Date.now()) {
    const sourceViews = sources.map((s) => ({
        id: s.id,
        kind: s.kind,
        label: s.label,
        scope: s.scope,
        scopeLabel: s.scopeLabel,
        origin: s.origin,
        observedAt: s.observedAt,
        staleAfterSeconds: s.staleAfterSeconds,
        freshness: sourceFreshness(s, now),
        unavailableReason: s.available ? undefined : s.unavailableReason,
        sessionCount: s.available ? s.sessions.length : 0,
    }));

    const byId = new Map();
    sources.forEach((s, i) => {
        if (!s.available) return;
        const freshness = sourceViews[i].freshness;
        for (const session of s.sessions) {
            const row = {
                ...session,
                sourceId: s.id,
                sourceLabel: s.label,
                sourceKind: s.kind,
                scope: s.scope,
                observedAt: session.observedAt ?? s.observedAt,
                freshness,
                alsoReportedBy: [],
            };
            const existing = byId.get(session.id);
            if (!existing) {
                byId.set(session.id, row);
                continue;
            }
            const better =
                FRESHNESS_RANK[row.freshness] > FRESHNESS_RANK[existing.freshness] ||
                (FRESHNESS_RANK[row.freshness] === FRESHNESS_RANK[existing.freshness] &&
                    Date.parse(row.observedAt) > Date.parse(existing.observedAt));
            const [winner, loser] = better ? [row, existing] : [existing, row];
            winner.alsoReportedBy = [
                ...existing.alsoReportedBy,
                ...row.alsoReportedBy,
                {
                    sourceId: loser.sourceId,
                    sourceLabel: loser.sourceLabel,
                    activity: loser.activity,
                    freshness: loser.freshness,
                    observedAt: loser.observedAt,
                },
            ];
            for (const field of ["appUrl", "pullRequestUrl", "provider", "repository", "branch", "mode"]) {
                winner[field] ??= loser[field];
            }
            // A project-scoped report keeps the merged row visible in the project view.
            if (loser.scope === "project") winner.scope = "project";
            byId.set(session.id, winner);
        }
    });

    const order = { blocked: 0, error: 1, busy: 2, idle: 3, unknown: 4 };
    const sessions = [...byId.values()].sort(
        (a, b) => order[a.activity] - order[b.activity] || a.name.localeCompare(b.name),
    );
    return { now: new Date(now).toISOString(), sources: sourceViews, sessions };
}
