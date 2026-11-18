const STATUS = {
    waiting: { label: "Needs you", glyph: "!", rank: 0, hint: "Blocked on a permission, input, or plan-approval request" },
    busy: { label: "In action", glyph: "▶", rank: 1, hint: "A turn or tool call is in progress" },
    error: { label: "Error", glyph: "✖", rank: 2, hint: "Latest logged event is a session error" },
    idle: { label: "Standby", glyph: "■", rank: 3, hint: "Loaded and idle. This doesn't mean the work is finished." },
    done: { label: "Reported done", glyph: "★", rank: 4, hint: "Session logged task_complete after its latest request" },
    disconnected: { label: "Signal lost", glyph: "?", rank: 5, hint: "No live process holds this session and no shutdown was logged" },
    offline: { label: "Offline", glyph: "○", rank: 6, hint: "Session shut down cleanly" },
};
const FEED_ICON = { tool: "⚙", order: "📨", complete: "🏆", wait: "⏳", fail: "💥", start: "🚀", stop: "⏹" };

const ui = {
    scope: "online",
    statuses: new Set(),
    query: "",
    data: null,
    lastFeedAt: "",
    lastSeen: new Map(),
    connected: false,
    lastBeat: 0,
};

const $ = (sel) => document.querySelector(sel);
function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
}

const fmt = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const num = (n) => (typeof n === "number" ? fmt.format(n) : "—");

function ago(iso) {
    const t = Date.parse(iso || "");
    if (!Number.isFinite(t)) return "never";
    const s = Math.max(0, Math.round((Date.now() - t) / 1000));
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m ago`;
    return `${Math.floor(s / 86400)}d ago`;
}
function duration(iso) {
    const t = Date.parse(iso || "");
    if (!Number.isFinite(t)) return "—";
    const m = Math.max(0, Math.floor((Date.now() - t) / 60000));
    return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}
function hue(id) {
    let h = 0;
    for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360;
    return h;
}
function displayName(s) {
    return s.name || `Session ${s.id.slice(0, 8)}`;
}
function initials(s) {
    const words = displayName(s).replace(/[^A-Za-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
    return (words.slice(0, 2).map((w) => w[0]).join("") || "??").toUpperCase();
}

function inScope(s) {
    if (ui.scope === "online") return s.alive;
    if (ui.scope === "recent") return s.inScope;
    return true;
}
function matches(s) {
    if (ui.statuses.size && !ui.statuses.has(s.status)) return false;
    if (!ui.query) return true;
    const hay = [displayName(s), s.repository, s.branch, s.id, s.model, s.lastActivity?.label].join(" ").toLowerCase();
    return hay.includes(ui.query);
}

// Walks coordinator links (from "agent-<id>" message sources) to the top of the chain.
function rootOf(s, byId) {
    let cur = s;
    const seen = new Set([s.id]);
    while (cur.coordinatorId && byId.has(cur.coordinatorId) && !seen.has(cur.coordinatorId)) {
        cur = byId.get(cur.coordinatorId);
        seen.add(cur.id);
    }
    return cur;
}

function squadsFor(sessions, all) {
    const byId = new Map(all.map((s) => [s.id, s]));
    const commanders = new Set(all.map((s) => s.coordinatorId).filter((id) => id && byId.has(id)));
    const squads = new Map();
    for (const s of sessions) {
        let key;
        let title;
        let kind;
        const root = rootOf(s, byId);
        if (commanders.has(root.id)) {
            const cmd = root;
            key = `cmd:${cmd.id}`;
            title = displayName(cmd);
            kind = "Squad";
        } else {
            key = `repo:${s.repository || "-"}`;
            title = s.repository || "No repository";
            kind = s.repository ? "Repository" : "Unaffiliated";
        }
        if (!squads.has(key)) squads.set(key, { key, title, kind, commanderId: key.startsWith("cmd:") ? key.slice(4) : null, units: [] });
        squads.get(key).units.push(s);
    }
    for (const sq of squads.values()) {
        sq.units.sort((a, b) => {
            if (a.id === sq.commanderId) return -1;
            if (b.id === sq.commanderId) return 1;
            return STATUS[a.status].rank - STATUS[b.status].rank || String(b.lastEventAt).localeCompare(String(a.lastEventAt));
        });
    }
    return [...squads.values()].sort((a, b) => (a.commanderId ? -1 : 0) - (b.commanderId ? -1 : 0) || a.title.localeCompare(b.title));
}

function meter(label, value, max, cls, title) {
    const row = el("div", `meter ${cls}`);
    row.title = title;
    row.append(el("span", "meter-label", label));
    const track = el("span", "meter-track");
    const fill = el("span", "meter-fill");
    const pct = max > 0 && typeof value === "number" ? Math.max(value > 0 ? 3 : 0, Math.round((value / max) * 100)) : 0;
    fill.style.width = `${pct}%`;
    track.append(fill);
    row.append(track, el("span", "meter-value", typeof value === "number" ? num(value) : "n/a"));
    return row;
}

function stat(label, value, title) {
    const d = el("div", "stat");
    if (title) d.title = title;
    d.append(el("span", "stat-value", value), el("span", "stat-label", label));
    return d;
}

function card(s, maxes, isCommander, reportsTo) {
    const st = STATUS[s.status] || STATUS.idle;
    const c = el("article", `unit status-${s.status}${isCommander ? " commander" : ""}`);
    c.style.setProperty("--unit-hue", hue(s.id));
    const prev = ui.lastSeen.get(s.id);
    if (prev && prev !== s.lastEventAt) c.classList.add("pulse");
    ui.lastSeen.set(s.id, s.lastEventAt);

    const head = el("header", "unit-head");
    const avatar = el("div", "avatar", initials(s));
    avatar.setAttribute("aria-hidden", "true");
    const titles = el("div", "unit-titles");
    const name = el("h3", "unit-name");
    if (s.appLink) {
        const a = el("a", null, displayName(s));
        a.href = s.appLink;
        a.title = "Open in GitHub Copilot app";
        name.append(a);
    } else name.textContent = displayName(s);
    titles.append(name);
    const meta = el("p", "unit-meta");
    meta.textContent = [isCommander ? "Commander" : null, reportsTo ? `↳ ${reportsTo}` : null, s.branch ? `⎇ ${s.branch}` : null, s.model].filter(Boolean).join(" · ") || s.client || "";
    titles.append(meta);
    const badge = el("span", "badge", `${st.glyph} ${st.label}`);
    badge.title = st.hint;
    head.append(avatar, titles, badge);
    c.append(head);

    if (s.status === "waiting" && s.waitingOn.length) c.append(el("p", "alert", `Waiting on ${s.waitingOn.join(", ")}`));

    const action = el("p", "action");
    if (s.current.length) {
        action.append(el("span", "action-tag", "NOW"), document.createTextNode(` ${s.current[s.current.length - 1]}`));
    } else if (s.lastActivity) {
        action.append(el("span", "action-tag dim", "LAST"), document.createTextNode(` ${s.lastActivity.label}`));
    } else action.append(el("span", "action-tag dim", "—"), document.createTextNode(" no tool activity yet"));
    c.append(action);

    if (s.latestRequest) {
        const orders = el("p", "orders");
        orders.title = `Latest message to this session (${ago(s.latestRequestAt)})`;
        orders.append(el("span", "orders-tag", "Orders"), document.createTextNode(` ${s.latestRequest}`));
        c.append(orders);
    }

    const g = s.git;
    const meters = el("div", "meters");
    if (g && g.total) {
        meters.append(
            meter("+ lines", g.total.added, maxes.added, "add", "Lines added vs. merge-base with the default branch (committed + uncommitted tracked files)"),
            meter("− lines", g.total.removed, maxes.removed, "del", "Lines removed vs. merge-base with the default branch"),
        );
    } else {
        meters.append(el("p", "na", g?.error ? `Lines of work unavailable: ${g.error}` : s.hasGitRoot ? "Lines of work: collecting…" : "Lines of work: n/a (no git worktree)"));
    }
    meters.append(
        meter("tools", s.metrics.toolCalls, maxes.tools, "xp", "Tool calls logged in events.jsonl"),
        meter("tokens", s.metrics.tokensIn + s.metrics.tokensOut, maxes.tokens, "mana", "Input + output tokens from session.usage_record events"),
    );
    c.append(meters);

    const stats = el("div", "stats");
    stats.append(
        stat("commits", g && typeof g.commits === "number" ? g.commits : "—", g?.baseRef ? `Commits ahead of ${g.baseRef}` : "No git base"),
        stat("files", g?.total ? g.total.files : "—", "Files changed vs. merge-base"),
        stat("dirty", g?.uncommitted ? `+${num(g.uncommitted.added)}/−${num(g.uncommitted.removed)}` : "—", "Uncommitted tracked changes"),
        stat("new files", typeof g?.untracked === "number" ? g.untracked : "—", "Untracked files (not line-counted)"),
        stat("turns", num(s.metrics.turns), "Assistant turns"),
        stat("fails", s.metrics.toolFailures, "Failed tool calls"),
        stat("reports", s.metrics.completions, "task_complete events logged"),
        stat("uptime", duration(s.startedAt), "Since session.start"),
    );
    c.append(stats);

    if (s.lastCompletion) {
        const r = el("details", "report");
        r.append(el("summary", null, `🏆 Last report · ${ago(s.lastCompletion.at)}`), el("p", null, s.lastCompletion.summary || "(no summary)"));
        c.append(r);
    }

    const foot = el("footer", "unit-foot");
    const sig = el("span", "signal");
    sig.dataset.ago = s.lastEventAt || "";
    sig.title = "Data freshness: time since this session last wrote an event (separate from activity status)";
    sig.textContent = `last signal ${ago(s.lastEventAt)}`;
    foot.append(sig, el("span", "proc", s.alive ? "● process live" : "○ no live process"));
    if (g?.lastCommit) {
        const lc = el("span", "commit", `⎘ ${ago(g.lastCommit.at)}`);
        lc.dataset.ago = g.lastCommit.at;
        lc.dataset.prefix = "⎘ ";
        lc.title = `Last commit: ${g.lastCommit.subject}`;
        foot.append(lc);
    }
    c.append(foot);
    return c;
}

function renderScoreboard(visible) {
    const sb = $("#scoreboard");
    sb.replaceChildren();
    const count = (st) => visible.filter((s) => s.status === st).length;
    const sum = (f) => visible.reduce((t, s) => t + (f(s) || 0), 0);
    const items = [
        ["Units", visible.length],
        ["In action", count("busy")],
        ["Need you", count("waiting")],
        ["+Lines", num(sum((s) => s.git?.total?.added))],
        ["−Lines", num(sum((s) => s.git?.total?.removed))],
        ["Commits", num(sum((s) => s.git?.commits))],
        ["Tool calls", num(sum((s) => s.metrics.toolCalls))],
        ["Tokens", num(sum((s) => s.metrics.tokensIn + s.metrics.tokensOut))],
    ];
    for (const [k, v] of items) {
        const d = el("div", "score");
        d.append(el("dt", null, k), el("dd", null, v));
        sb.append(d);
    }
}

function renderStatusChips(all) {
    const box = $("#status-chips");
    box.replaceChildren();
    for (const [key, meta] of Object.entries(STATUS)) {
        const n = all.filter((s) => s.status === key && inScope(s)).length;
        const b = el("button", `chip status-${key}`, `${meta.glyph} ${meta.label} ${n}`);
        b.type = "button";
        b.title = meta.hint;
        b.setAttribute("aria-pressed", String(ui.statuses.has(key)));
        b.addEventListener("click", () => {
            ui.statuses.has(key) ? ui.statuses.delete(key) : ui.statuses.add(key);
            render();
        });
        box.append(b);
    }
}

function renderFeed(visible) {
    const items = [];
    for (const s of visible) for (const f of s.feed) items.push({ ...f, who: displayName(s), id: s.id });
    items.sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const ol = $("#feed");
    ol.replaceChildren();
    const prevTop = ui.lastFeedAt;
    for (const f of items.slice(0, 60)) {
        const li = el("li", `feed-${f.kind}`);
        if (prevTop && f.at > prevTop) li.classList.add("fresh");
        const time = el("time", null, ago(f.at));
        time.dateTime = f.at || "";
        time.dataset.ago = f.at || "";
        li.style.setProperty("--unit-hue", hue(f.id));
        li.append(el("span", "feed-icon", FEED_ICON[f.kind] || "•"), el("span", "feed-who", f.who), el("span", "feed-text", f.text), time);
        ol.append(li);
    }
    if (items[0]) ui.lastFeedAt = items[0].at;
    if (!items.length) ol.append(el("li", "empty", "No activity in this scope."));
}

function render() {
    const data = ui.data;
    if (!data) return;
    $("#source-root").textContent = data.source.root;
    const all = data.sessions;
    const visible = all.filter((s) => inScope(s) && matches(s));
    renderStatusChips(all);
    renderScoreboard(visible);
    renderFeed(visible);

    const maxes = {
        added: Math.max(0, ...visible.map((s) => s.git?.total?.added || 0)),
        removed: Math.max(0, ...visible.map((s) => s.git?.total?.removed || 0)),
        tools: Math.max(0, ...visible.map((s) => s.metrics.toolCalls)),
        tokens: Math.max(0, ...visible.map((s) => s.metrics.tokensIn + s.metrics.tokensOut)),
    };
    const board = $("#board");
    board.replaceChildren();
    if (data.source.error) board.append(el("p", "banner error", `Session source unavailable: ${data.source.error}`));
    const squads = squadsFor(visible, all);
    if (!squads.length) board.append(el("p", "banner", "No sessions match this scope and filter."));
    for (const sq of squads) {
        const lane = el("section", "lane");
        const h = el("header", "lane-head");
        const added = sq.units.reduce((t, s) => t + (s.git?.total?.added || 0), 0);
        const removed = sq.units.reduce((t, s) => t + (s.git?.total?.removed || 0), 0);
        const active = sq.units.filter((s) => s.status === "busy" || s.status === "waiting").length;
        h.append(
            el("span", "lane-kind", sq.kind),
            el("h2", null, sq.title),
            el("span", "lane-stats", `${sq.units.length} unit${sq.units.length === 1 ? "" : "s"} · ${active} active · +${num(added)} / −${num(removed)} lines`),
        );
        lane.append(h);
        const grid = el("div", "units");
        const byId = new Map(all.map((s) => [s.id, s]));
        for (const s of sq.units) {
            const reportsTo = s.coordinatorId && byId.has(s.coordinatorId) && s.coordinatorId !== sq.commanderId ? displayName(byId.get(s.coordinatorId)) : null;
            grid.append(card(s, maxes, s.id === sq.commanderId, reportsTo));
        }
        lane.append(grid);
        board.append(lane);
    }
}

function setFeedStatus(kind, label) {
    const box = $("#feed-status");
    box.className = `feed-status ${kind}`;
    box.querySelector(".label").textContent = label;
}

function tickTimes() {
    for (const n of document.querySelectorAll("[data-ago]")) {
        if (!n.dataset.ago) continue;
        const base = n.classList.contains("signal") ? "last signal " : n.dataset.prefix || "";
        n.textContent = `${base}${ago(n.dataset.ago)}`;
    }
    if (ui.connected) {
        const age = (Date.now() - ui.lastBeat) / 1000;
        if (age > 15) setFeedStatus("stale", "Feed stale");
        else setFeedStatus("live", "Live");
        $("#feed-detail").textContent = `scan ${ago(ui.data?.source.lastScanAt)} · every ${(ui.data?.source.pollMs || 1000) / 1000}s`;
    }
}

function connect() {
    const es = new EventSource("/events");
    es.addEventListener("open", () => {
        ui.connected = true;
        ui.lastBeat = Date.now();
        setFeedStatus("live", "Live");
    });
    es.addEventListener("state", (e) => {
        ui.data = JSON.parse(e.data);
        ui.lastBeat = Date.now();
        render();
    });
    es.addEventListener("heartbeat", (e) => {
        ui.lastBeat = Date.now();
        if (ui.data) ui.data.source.lastScanAt = JSON.parse(e.data).lastScanAt;
    });
    es.addEventListener("error", () => {
        ui.connected = false;
        setFeedStatus("down", "Disconnected. Retrying…");
        $("#feed-detail").textContent = ui.data ? `showing data from ${ago(ui.data.generatedAt)}` : "";
    });
}

for (const b of document.querySelectorAll("#scope-chips button")) {
    b.addEventListener("click", () => {
        ui.scope = b.dataset.scope;
        for (const o of document.querySelectorAll("#scope-chips button")) o.setAttribute("aria-pressed", String(o === b));
        render();
    });
}
$("#search").addEventListener("input", (e) => {
    ui.query = e.target.value.trim().toLowerCase();
    render();
});
setInterval(tickTimes, 1000);
connect();
