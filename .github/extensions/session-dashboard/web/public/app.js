// Agent timeline: one lane per session, drawn only from logged events, git and GitHub task state.
const NS = "http://www.w3.org/2000/svg";
const LANE_H = 52;
const GROUP_H = 34;

const STATUS = {
    waiting: { label: "Needs you", rank: 0, hint: "Blocked on a permission, input or plan-approval request" },
    busy: { label: "Working", rank: 1, hint: "A turn or tool call is in progress" },
    error: { label: "Error", rank: 2, hint: "Latest logged event is a session error" },
    idle: { label: "Idle", rank: 3, hint: "Loaded and idle. Not the same as finished." },
    done: { label: "Reported done", rank: 4, hint: "Session logged task_complete after its latest request" },
    disconnected: { label: "Signal lost", rank: 5, hint: "No live process and no shutdown logged" },
    offline: { label: "Offline", rank: 6, hint: "Session shut down" },
    cancelled: { label: "Cancelled", rank: 7, hint: "GitHub task state: cancelled" },
    unknown: { label: "Unknown", rank: 8, hint: "Unrecognised state from the source" },
};
const KINDS = {
    think: "Thinking",
    read: "Reading code",
    edit: "Editing",
    run: "Running commands",
    web: "Web & browser",
    coord: "Coordinating",
    wait: "Waiting on someone",
    other: "Other tools",
};
const LINKS = {
    kickoff: "Spawned by coordinator",
    message: "Message between sessions",
    handoff: "Handoff / report back",
};

const ui = { scope: "online", windowMin: 120, query: "", data: null, selected: null, connected: false, lastBeat: 0 };
const $ = (s) => document.querySelector(s);

function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = String(text);
    return n;
}
function svg(tag, attrs = {}) {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, String(v));
    return n;
}
const fmt = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const num = (n) => (typeof n === "number" ? fmt.format(n) : "—");
const clock = (t) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
function ago(iso) {
    const t = Date.parse(iso || "");
    if (!Number.isFinite(t)) return "never";
    const s = Math.max(0, Math.round((Date.now() - t) / 1000));
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m ago`;
    return `${Math.floor(s / 86400)}d ago`;
}
function span(ms) {
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.round(s / 60);
    return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}
function hash(id) {
    let h = 2166136261;
    for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    return h >>> 0;
}
const nameOf = (s) => s.name || `Session ${s.id.slice(0, 8)}`;

// ---------- Avatars: original, Mii-inspired (round head, simple face), seeded by session id ----------
const SKIN = ["#f6d7c3", "#eec1a0", "#d9a07a", "#b97a56", "#8d5a3c"];
const HAIR = ["#2b2b33", "#5b3a29", "#a0612f", "#d9b26a", "#7a7f8c", "#c4553d"];
const SHIRT = ["#5b8def", "#3fb08f", "#f08a5d", "#b07cf0", "#e8b33a", "#4fb3d9", "#ef6f8f"];

function avatar(s, size = 36) {
    const h = hash(s.id);
    const skin = SKIN[h % 5];
    const hair = HAIR[(h >>> 3) % 6];
    const shirt = SHIRT[(h >>> 6) % 7];
    const style = (h >>> 9) % 4;
    const root = svg("svg", { viewBox: "0 0 40 40", width: size, height: size, class: `mii st-${s.status}`, "aria-hidden": "true" });
    root.append(svg("circle", { cx: 20, cy: 20, r: 20, class: "mii-bg" }));
    root.append(svg("path", { d: "M7 40c1-8 6-12 13-12s12 4 13 12z", fill: shirt }));
    if (style === 3) root.append(svg("circle", { cx: 20, cy: 6.5, r: 4, fill: hair }));
    root.append(svg("ellipse", { cx: 20, cy: 18, rx: 9.5, ry: 10.5, fill: skin }));
    const hairPaths = [
        "M10.5 17c0-7 4-10.5 9.5-10.5S29.5 10 29.5 17c-2-3-5-4.5-9.5-4.5s-7.5 1.5-9.5 4.5z",
        "M10.5 18c-.5-7.5 4-11.5 10-11.5 5.5 0 9.5 3.5 9 11-3-4-9-6.5-14-4.5-2 .8-3.5 2.6-5 5z",
        "M10.5 19c-1-8 3-12.5 9.5-12.5S30.5 11 29.5 19l-1.5-5-2 3-2-4-2 3.5-2-4-2 4-2-3.5-2 4z",
        "M10.5 17c0-6.5 4-10 9.5-10s9.5 3.5 9.5 10c-2.5-2.5-5.5-3.5-9.5-3.5s-7 1-9.5 3.5z",
    ];
    root.append(svg("path", { d: hairPaths[style], fill: hair }));
    const blink = s.status === "busy" ? " blink" : "";
    root.append(svg("ellipse", { cx: 16.3, cy: 19, rx: 1.2, ry: 1.5, class: `eye${blink}` }));
    root.append(svg("ellipse", { cx: 23.7, cy: 19, rx: 1.2, ry: 1.5, class: `eye${blink}` }));
    const mouth = { waiting: "M17.5 24.5h5", error: "M17.5 25.3q2.5-2 5 0", done: "M16.8 23.2q3.2 3.6 6.4 0" }[s.status] || "M17.5 23.5q2.5 2 5 0";
    root.append(svg("path", { d: mouth, class: "mouth" }));
    root.append(svg("circle", { cx: 13.6, cy: 22.3, r: 1.4, class: "cheek" }));
    root.append(svg("circle", { cx: 26.4, cy: 22.3, r: 1.4, class: "cheek" }));
    return root;
}

// ---------- Grouping: authoritative coordinator links, else repository, else cloud ----------
function rootOf(s, byId) {
    let cur = s;
    const seen = new Set([s.id]);
    while (cur.coordinatorId && byId.has(cur.coordinatorId) && !seen.has(cur.coordinatorId)) {
        cur = byId.get(cur.coordinatorId);
        seen.add(cur.id);
    }
    return cur;
}
function depthOf(s, byId) {
    let d = 0;
    let cur = s;
    const seen = new Set([s.id]);
    while (cur.coordinatorId && byId.has(cur.coordinatorId) && !seen.has(cur.coordinatorId)) {
        cur = byId.get(cur.coordinatorId);
        seen.add(cur.id);
        d += 1;
    }
    return d;
}
function inScope(s) {
    if (ui.scope === "online") return s.online;
    if (ui.scope === "recent") return s.inScope;
    return true;
}
function matches(s) {
    if (!ui.query) return true;
    return [nameOf(s), s.repository, s.branch, s.id].join(" ").toLowerCase().includes(ui.query);
}

function groups(all) {
    const byId = new Map(all.map((s) => [s.id, s]));
    const visible = all.filter((s) => inScope(s) && matches(s));
    const vis = new Set(visible.map((s) => s.id));
    // Keep a coordinator lane whenever any of its children is visible, so links have an anchor.
    for (const s of visible) {
        const r = rootOf(s, byId);
        if (r.id !== s.id && !vis.has(r.id)) {
            vis.add(r.id);
            visible.push(r);
        }
    }
    const leads = new Set(all.map((s) => s.coordinatorId).filter((id) => id && byId.has(id)));
    const out = new Map();
    for (const s of visible) {
        const r = rootOf(s, byId);
        let key;
        let title;
        let note;
        if (leads.has(r.id)) {
            key = `lead:${r.id}`;
            title = nameOf(r);
            note = "Coordinated team";
        } else if (s.origin === "github") {
            key = "cloud";
            title = "Cloud & other hosts";
            note = "GitHub agent tasks · state only, polled";
        } else {
            key = `repo:${s.repository || "-"}`;
            title = s.repository || "No repository";
            note = "Independent sessions";
        }
        if (!out.has(key)) out.set(key, { key, title, note, lead: key.startsWith("lead:") ? r.id : null, lanes: [] });
        out.get(key).lanes.push({ s, depth: leads.has(r.id) ? depthOf(s, byId) : 0 });
    }
    const order = (g) => (g.lead ? 0 : g.key === "cloud" ? 2 : 1);
    for (const g of out.values()) {
        g.lanes.sort(
            (a, b) =>
                a.depth - b.depth ||
                (STATUS[a.s.status]?.rank ?? 9) - (STATUS[b.s.status]?.rank ?? 9) ||
                String(a.s.startedAt).localeCompare(String(b.s.startedAt)),
        );
    }
    return [...out.values()].sort((a, b) => order(a) - order(b) || a.title.localeCompare(b.title));
}

// ---------- Rendering ----------
function pressed(container, attr, value) {
    for (const b of container.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset[attr] === String(value)));
}

function renderLegend() {
    const lg = $("#legend");
    lg.replaceChildren();
    const sec = (title) => {
        const g = el("div", "lg-group");
        g.append(el("span", "lg-title", title));
        lg.append(g);
        return g;
    };
    const work = sec("Work");
    for (const [k, label] of Object.entries(KINDS)) {
        const i = el("span", "lg-item");
        i.append(el("i", `sw k-${k}`), label);
        work.append(i);
    }
    const ties = sec("Between agents");
    for (const [k, label] of Object.entries(LINKS)) {
        const i = el("span", "lg-item");
        i.append(el("i", `ln l-${k}`), label);
        ties.append(i);
    }
    const marks = sec("Moments");
    for (const [cls, label] of [
        ["m-human", "Person sent a message"],
        ["m-commit", "Commit"],
        ["m-merge", "Merge commit (git)"],
        ["m-complete", "Reported done"],
        ["m-error", "Error"],
    ]) {
        const i = el("span", "lg-item");
        i.append(el("i", `mk ${cls}`), label);
        marks.append(i);
    }
    const cov = sec("Coverage");
    const h = el("span", "lg-item");
    h.append(el("i", "sw k-nodetail"), "Cloud task: no event detail");
    cov.append(h);
}

function render() {
    const d = ui.data;
    if (!d) return;
    const all = d.sessions;
    const gs = groups(all);
    const now = Date.now();
    const t1 = now;
    const t0 = now - ui.windowMin * 60000;
    const tracks = $("#tracks");
    const W = Math.max(320, tracks.clientWidth);
    const x = (iso) => {
        const t = typeof iso === "number" ? iso : Date.parse(iso);
        return ((Math.min(Math.max(t, t0), t1) - t0) / (t1 - t0)) * W;
    };
    const inWin = (a, b) => (b == null ? Date.parse(a) : Date.parse(b)) >= t0 && Date.parse(a) <= t1;

    // Summary line: what's happening, in plain words.
    const shown = gs.flatMap((g) => g.lanes.map((l) => l.s));
    const count = (st) => shown.filter((s) => s.status === st).length;
    const parts = [`${shown.length} agent${shown.length === 1 ? "" : "s"}`];
    if (count("busy")) parts.push(`${count("busy")} working`);
    if (count("waiting")) parts.push(`${count("waiting")} need${count("waiting") === 1 ? "s" : ""} you`);
    if (count("error")) parts.push(`${count("error")} with errors`);
    $("#summary").textContent = parts.join(" · ");

    // Axis ticks.
    const axis = $("#axis");
    axis.replaceChildren(el("span", "axis-pad"));
    const track = el("div", "axis-track");
    const step = [5, 15, 30, 60, 120, 240][[30, 120, 480, 1440, 1e9].findIndex((m) => ui.windowMin <= m) + 1] * 60000 || 3600000;
    for (let t = Math.ceil(t0 / step) * step; t <= t1; t += step) {
        if (x(t) > W - 60) continue;
        const tk = el("span", "tick", clock(t));
        tk.style.left = `${x(t)}px`;
        track.append(tk);
    }
    const nowTk = el("span", "tick now", "now");
    nowTk.style.left = `${W}px`;
    track.append(nowTk);
    axis.append(track);

    // Rows.
    const labels = $("#labels");
    labels.replaceChildren();
    const root = $("#svg");
    root.replaceChildren();
    const defs = svg("defs");
    const pat = svg("pattern", { id: "hatch", width: 6, height: 6, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" });
    pat.append(svg("rect", { width: 6, height: 6, class: "hatch-bg" }), svg("line", { x1: 0, y1: 0, x2: 0, y2: 6, class: "hatch-line" }));
    defs.append(pat);
    for (const k of Object.keys(LINKS)) {
        const m = svg("marker", { id: `arrow-${k}`, viewBox: "0 0 8 8", refX: 7, refY: 4, markerWidth: 6, markerHeight: 6, orient: "auto-start-reverse" });
        m.append(svg("path", { d: "M0 0L8 4L0 8z", class: `arrow l-${k}` }));
        defs.append(m);
    }
    root.append(defs);
    const gridLayer = svg("g", { class: "grid" });
    const laneLayer = svg("g");
    const linkLayer = svg("g", { class: "links" });
    root.append(gridLayer, laneLayer, linkLayer);

    let y = 0;
    const laneY = new Map();
    for (const g of gs) {
        const head = el("div", "group-head");
        head.style.height = `${GROUP_H}px`;
        head.append(el("span", "group-title", g.title), el("span", "group-note", g.note));
        labels.append(head);
        y += GROUP_H;
        for (const { s, depth } of g.lanes) {
            const cy = y + LANE_H / 2;
            laneY.set(s.id, cy);
            labels.append(laneLabel(s, depth, g.lead === s.id));
            if (ui.selected === s.id) laneLayer.append(svg("rect", { x: 0, y, width: W, height: LANE_H, class: "sel-band" }));
            laneLayer.append(lane(s, cy, { x, inWin, now, t0 }));
            y += LANE_H;
        }
    }
    const H = Math.max(y, 80);
    root.setAttribute("width", W);
    root.setAttribute("height", H);
    root.setAttribute("viewBox", `0 0 ${W} ${H}`);
    for (let t = Math.ceil(t0 / step) * step; t <= t1; t += step) gridLayer.append(svg("line", { x1: x(t), x2: x(t), y1: 0, y2: H }));
    gridLayer.append(svg("line", { x1: W - 1, x2: W - 1, y1: 0, y2: H, class: "now-line" }));

    drawLinks(all, laneY, linkLayer, { x, t0, t1 });
    $("#empty").hidden = gs.length > 0;
    renderDetail();
    renderPills();
}

function laneLabel(s, depth, isLead) {
    const row = el("button", `lane-label${ui.selected === s.id ? " selected" : ""}`);
    row.type = "button";
    row.style.height = `${LANE_H}px`;
    row.style.paddingLeft = `${12 + depth * 18}px`;
    row.dataset.id = s.id;
    if (depth) row.append(el("span", "elbow"));
    row.append(avatar(s));
    const txt = el("span", "lane-text");
    const nm = el("span", "lane-name", nameOf(s));
    if (isLead) nm.append(el("span", "lead-tag", "lead"));
    const st = el("span", `lane-status st-${s.status}`);
    st.append(el("i"), STATUS[s.status]?.label || s.status);
    st.title = STATUS[s.status]?.hint || "";
    txt.append(nm, st);
    row.append(txt);
    row.title = `${nameOf(s)} — ${STATUS[s.status]?.label || s.status}`;
    return row;
}

function lane(s, cy, { x, inWin, now, t0 }) {
    const g = svg("g", { class: `lane st-${s.status}`, "data-id": s.id });
    const tl = s.timeline;
    if (!tl) {
        // GitHub task: we only know created/updated times and a state.
        const a = s.startedAt || s.lastEventAt;
        const b = s.lastEventAt;
        // After the last GitHub update nothing is known; a faint dotted line marks an unfinished task.
        if (s.online && b && inWin(b, new Date(now).toISOString())) g.append(svg("line", { x1: x(b), x2: x(now), y1: cy, y2: cy, class: "life ended" }));
        if (a && b && inWin(a, b)) {
            const x0 = x(a);
            const x1 = Math.max(x(b), x0 + 3);
            g.append(svg("rect", { x: x0, y: cy - 7, width: x1 - x0, height: 14, rx: 7, class: "nodetail", "data-tip": `No event detail from this source\nGitHub task state: ${s.githubTask?.state}\nCreated ${ago(s.startedAt)} · updated ${ago(s.lastEventAt)}` }));
        }
        if (s.lastEventAt && inWin(s.lastEventAt)) g.append(svg("circle", { cx: x(s.lastEventAt), cy, r: 3.5, class: "mk m-update", "data-tip": `GitHub updated ${ago(s.lastEventAt)}` }));
        return g;
    }
    const start = s.startedAt || tl.spans[0]?.s;
    const end = s.alive ? new Date(now).toISOString() : s.lastEventAt;
    if (start && end && inWin(start, end)) g.append(svg("line", { x1: x(start), x2: x(end), y1: cy, y2: cy, class: `life${s.alive ? "" : " ended"}` }));
    const drawSpan = (sp, open) => {
        const e = sp.e || new Date(now).toISOString();
        if (!inWin(sp.s, e)) return;
        const x0 = x(sp.s);
        const w = Math.max(2, x(e) - x0);
        const think = sp.k === "think";
        const h = think ? 8 : 16;
        const ms = Date.parse(e) - Date.parse(sp.s);
        g.append(
            svg("rect", {
                x: x0, y: cy - h / 2, width: w, height: h, rx: h / 2,
                class: `span k-${sp.k}${open ? " open" : ""}`,
                "data-tip": `${KINDS[sp.k]}${open ? " (now)" : ""}\n${clock(Date.parse(sp.s))} · ${span(ms)}`,
            }),
        );
    };
    for (const sp of tl.spans) if (sp.k === "think") drawSpan(sp, false);
    for (const sp of tl.open) if (sp.k === "think") drawSpan(sp, true);
    for (const sp of tl.spans) if (sp.k !== "think") drawSpan(sp, false);
    for (const sp of tl.open) if (sp.k !== "think") drawSpan(sp, true);

    const mark = (at, cls, tip, shape = "circle") => {
        if (!at || !inWin(at)) return;
        const cx = x(at);
        if (shape === "diamond") g.append(svg("rect", { x: cx - 4, y: cy - 4 - 13, width: 8, height: 8, transform: `rotate(45 ${cx} ${cy - 13})`, class: `mk ${cls}`, "data-tip": tip }));
        else g.append(svg("circle", { cx, cy: cy - 13, r: 3.5, class: `mk ${cls}`, "data-tip": tip }));
    };
    for (const m of tl.marks) {
        if (m.k === "human") mark(m.at, "m-human", `Person sent a message · ${clock(Date.parse(m.at))}`);
        else if (m.k === "complete") mark(m.at, "m-complete", `Reported done · ${clock(Date.parse(m.at))}`);
        else if (m.k === "error") mark(m.at, "m-error", `Error · ${clock(Date.parse(m.at))}`);
    }
    // Only commits made during this session; earlier ones were inherited with the branch.
    for (const c of (s.git?.history || []).filter((c) => !start || Date.parse(c.at) >= Date.parse(start))) {
        mark(c.at, c.merge ? "m-merge" : "m-commit", `${c.merge ? "Merge commit" : "Commit"} · ${clock(Date.parse(c.at))}\n${c.subject}`, "diamond");
    }
    return g;
}

function drawLinks(all, laneY, layer, { x, t0, t1 }) {
    const seen = [];
    const add = (from, to, at, k) => {
        const t = Date.parse(at);
        if (!(t >= t0 && t <= t1) || !laneY.has(from) || !laneY.has(to) || from === to) return;
        // The same delivery can appear in both logs (sender's tool call, recipient's message): draw it once.
        if (seen.some((o) => o.from === from && o.to === to && Math.abs(o.t - t) < 15000)) return;
        seen.push({ from, to, t });
        const y0 = laneY.get(from);
        const y1 = laneY.get(to);
        const cx = x(t);
        const dir = y1 > y0 ? 1 : -1;
        const a = y0 + dir * 9;
        const b = y1 - dir * 9;
        const bend = Math.min(40, Math.abs(b - a) / 2);
        const d = k === "kickoff" ? `M${cx} ${a} C${cx} ${a + dir * bend}, ${cx + 10} ${b - dir * bend}, ${cx + 10} ${b}` : `M${cx} ${a} C${cx + 14} ${a + dir * bend}, ${cx + 14} ${b - dir * bend}, ${cx} ${b}`;
        const name = (id) => nameOf(all.find((s) => s.id === id));
        layer.append(
            svg("path", {
                d, class: `link l-${k}`, "marker-end": `url(#arrow-${k})`,
                "data-tip": `${LINKS[k]}\n${name(from)} → ${name(to)} · ${clock(t)}`,
            }),
        );
    };
    for (const s of all) {
        for (const l of s.timeline?.links || []) {
            if (l.dir === "in") add(l.peer, s.id, l.at, l.k);
            else add(s.id, l.peer, l.at, l.k);
        }
    }
}

function row(dl, k, v, title) {
    const dt = el("dt", null, k);
    const dd = el("dd", null, v);
    if (title) dd.title = title;
    dl.append(dt, dd);
}

function renderDetail() {
    const box = $("#detail");
    const s = ui.data?.sessions.find((x) => x.id === ui.selected);
    box.replaceChildren();
    if (!s) {
        box.append(el("p", "hint", "Select an agent to see what it's doing."));
        return;
    }
    const head = el("div", "d-head");
    head.append(avatar(s, 56));
    const t = el("div");
    t.append(el("h2", null, nameOf(s)));
    const st = el("span", `lane-status st-${s.status}`);
    st.append(el("i"), STATUS[s.status]?.label || s.status);
    st.title = STATUS[s.status]?.hint || "";
    t.append(st);
    head.append(t);
    box.append(head);

    if (s.origin === "github") {
        box.append(el("p", "d-note", "Cloud or another host. GitHub reports only the task state and times; activity and lines of work aren't available."));
    }
    const now = s.current?.[0] || (s.lastActivity ? `Last: ${s.lastActivity.label}` : null);
    if (now) box.append(el("p", "d-now", now));
    if (s.waitingOn?.length) box.append(el("p", "d-alert", `Waiting on ${s.waitingOn.join(", ")}`));

    const dl = el("dl", "d-facts");
    if (s.repository) row(dl, "Repo", s.repository);
    if (s.branch) row(dl, "Branch", s.branch);
    if (s.coordinatorId) row(dl, "Reports to", nameOf(ui.data.sessions.find((x) => x.id === s.coordinatorId) || { id: s.coordinatorId }));
    row(dl, "Last signal", ago(s.lastEventAt));
    if (s.startedAt) row(dl, "Started", ago(s.startedAt));
    if (s.githubTask) row(dl, "GitHub task", s.githubTask.state, `As reported by gh agent-task list, updated ${ago(s.githubTask.updatedAt)}`);
    if (s.model) row(dl, "Model", s.model);
    box.append(dl);

    if (s.metrics || s.git) {
        const m = el("div", "d-metrics");
        const g = s.git;
        const cell = (v, label, title) => {
            const c = el("div", "metric");
            c.title = title;
            c.append(el("b", null, v), el("span", null, label));
            m.append(c);
        };
        if (g?.total) cell(`+${num(g.total.added)} −${num(g.total.removed)}`, "lines vs main", "git diff --shortstat from the merge-base. Output, not progress.");
        if (g) cell(num(g.commits), "commits", "Commits on this branch since it left main");
        if (s.metrics) {
            cell(num(s.metrics.toolCalls), "tool calls", "tool.execution_start events");
            cell(num(s.metrics.turns), "turns", "assistant.turn_start events");
            cell(num(s.metrics.tokensIn + s.metrics.tokensOut), "tokens", "Sum of session.usage_record");
            cell(num(s.metrics.toolFailures), "failed calls", "tool.execution_complete with success=false");
        }
        box.append(m);
    }
    if (s.latestRequest) {
        const o = el("div", "d-block");
        o.append(el("h3", null, "Latest ask"), el("p", null, s.latestRequest));
        box.append(o);
    }
    if (s.lastCompletion) {
        const o = el("div", "d-block");
        o.append(el("h3", null, `Last report · ${ago(s.lastCompletion.at)}`), el("p", null, s.lastCompletion.summary || "(no summary)"));
        box.append(o);
    }
    const links = el("div", "d-links");
    if (s.appLink) {
        const a = el("a", null, "Open in Copilot app");
        a.href = s.appLink;
        links.append(a);
    }
    if (s.githubTask?.pullRequestUrl) {
        const a = el("a", null, "Pull request");
        a.href = s.githubTask.pullRequestUrl;
        a.target = "_blank";
        a.rel = "noopener";
        links.append(a);
    }
    if (links.childElementCount) box.append(links);
}

function renderPills() {
    const lp = $("#local-pill");
    const live = ui.connected && Date.now() - ui.lastBeat < 15000;
    lp.className = `pill ${!ui.connected ? "down" : live ? "live" : "stale"}`;
    lp.querySelector("span").textContent = !ui.connected ? "Local: disconnected" : live ? "Local · live" : "Local · stale";
    const r = ui.data?.remote;
    const cp = $("#cloud-pill");
    if (!r || r.disabled) {
        cp.className = "pill down";
        cp.querySelector("span").textContent = "Cloud · off";
        return;
    }
    const kind = r.error ? "down" : !r.lastOkAt || r.stale ? "stale" : "live";
    cp.className = `pill ${kind}`;
    cp.querySelector("span").textContent = r.error ? "Cloud · error" : !r.lastOkAt ? "Cloud · loading" : `Cloud · ${ago(r.lastOkAt)}`;
    cp.title = r.error ? `gh agent-task list failed: ${r.error}` : `gh agent-task list (preview) · ${r.count} tasks · polled every ${r.pollMs / 1000}s`;
}

// ---------- Interaction ----------
$("#scope").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    ui.scope = b.dataset.scope;
    pressed($("#scope"), "scope", ui.scope);
    render();
});
$("#window").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    ui.windowMin = Number(b.dataset.min);
    pressed($("#window"), "min", ui.windowMin);
    render();
});
$("#search").addEventListener("input", (e) => {
    ui.query = e.target.value.trim().toLowerCase();
    render();
});
$("#labels").addEventListener("click", (e) => {
    const b = e.target.closest(".lane-label");
    if (!b) return;
    ui.selected = ui.selected === b.dataset.id ? null : b.dataset.id;
    render();
});
$("#svg").addEventListener("click", (e) => {
    const g = e.target.closest(".lane");
    if (g) {
        ui.selected = g.dataset.id;
        render();
    }
});
const tip = $("#tip");
document.addEventListener("pointermove", (e) => {
    const t = e.target.closest?.("[data-tip]");
    if (!t) {
        tip.hidden = true;
        return;
    }
    tip.textContent = t.dataset.tip;
    tip.hidden = false;
    const r = tip.getBoundingClientRect();
    tip.style.left = `${Math.min(e.clientX + 14, innerWidth - r.width - 8)}px`;
    tip.style.top = `${Math.min(e.clientY + 14, innerHeight - r.height - 8)}px`;
});
addEventListener("resize", () => render());

function connect() {
    const es = new EventSource("/events");
    es.addEventListener("state", (e) => {
        ui.data = JSON.parse(e.data);
        ui.connected = true;
        ui.lastBeat = Date.now();
        render();
    });
    es.addEventListener("heartbeat", () => {
        ui.lastBeat = Date.now();
        renderPills();
    });
    es.onerror = () => {
        ui.connected = false;
        renderPills();
    };
    es.onopen = () => {
        ui.connected = true;
    };
}

renderLegend();
connect();
// Keep "now" moving even between events.
setInterval(render, 5000);
