// Canvas renderer. Builds DOM with textContent only (no innerHTML) so
// session names and details from any source can't inject markup.
(() => {
    const ACTIVITY_LABEL = { busy: "Busy", idle: "Idle", blocked: "Blocked", error: "Error", unknown: "Unknown" };
    const FRESHNESS_LABEL = { live: "Live", fresh: "Snapshot", stale: "Stale", unavailable: "Unavailable" };
    const SCOPE_LABEL = { project: "This Project", session: "This session", local: "Local runtime", other: "Other" };

    const params = new URLSearchParams(location.search);
    const ui = {
        scope: params.get("view") === "all" ? "all" : "project",
        query: "",
        activities: new Set(),
    };
    let view = null;
    let clockSkew = 0; // server now - client now

    const $ = (id) => document.getElementById(id);
    const el = (tag, props = {}, ...children) => {
        const node = document.createElement(tag);
        for (const [k, v] of Object.entries(props)) {
            if (v === undefined || v === null || v === false) continue;
            if (k === "class") node.className = v;
            else if (k === "text") node.textContent = v;
            else node.setAttribute(k, v);
        }
        for (const c of children) if (c) node.append(c);
        return node;
    };

    function ago(iso) {
        if (!iso) return "never";
        const s = Math.max(0, Math.round((Date.now() + clockSkew - Date.parse(iso)) / 1000));
        if (s < 10) return "just now";
        if (s < 60) return `${s}s ago`;
        const m = Math.round(s / 60);
        if (m < 60) return `${m}m ago`;
        const h = Math.round(m / 60);
        if (h < 48) return `${h}h ago`;
        return `${Math.round(h / 24)}d ago`;
    }
    const exact = (iso) => (iso ? new Date(iso).toLocaleString() : "");

    function badge(kind, value, label, title) {
        return el("span", { class: `badge ${kind}-${value}`, title }, label);
    }

    function activityBadge(row) {
        const label = ACTIVITY_LABEL[row.activity] ?? "Unknown";
        // Never present a stale or unavailable observation as current.
        const text = row.freshness === "stale" ? `Last reported ${label.toLowerCase()}` : label;
        return badge("a", row.activity, text, row.activityDetail);
    }

    function freshnessBadge(f, observedAt, staleAfterSeconds) {
        let title = observedAt ? `Observed ${exact(observedAt)}` : "No observation";
        if (f === "fresh" && staleAfterSeconds) title += ` · becomes stale after ${Math.round(staleAfterSeconds / 60)} min`;
        if (f === "live") title = "Streaming from the Copilot SDK in this session";
        return badge("f", f, FRESHNESS_LABEL[f] ?? f, title);
    }

    function inScope(scope) {
        return ui.scope === "all" || scope === "project";
    }

    function renderSources() {
        const list = $("sources");
        list.replaceChildren(
            ...view.sources.filter((s) => inScope(s.scope)).map((s) => {
                const meta = [];
                meta.push(s.origin === "live" ? "Live SDK source" : "Supplied snapshot");
                meta.push(`Scope: ${s.scopeLabel || SCOPE_LABEL[s.scope] || s.scope}`);
                const details = el("div", { class: "meta" }, meta.join(" · "));
                const when = el(
                    "div",
                    { class: "meta", title: exact(s.observedAt) },
                    s.freshness === "unavailable"
                        ? s.unavailableReason || "Unavailable"
                        : `${s.sessionCount} session${s.sessionCount === 1 ? "" : "s"} · observed ${ago(s.observedAt)}`,
                );
                return el(
                    "li",
                    { class: `source${s.freshness === "unavailable" ? " unavailable" : ""}` },
                    el("div", { class: "name" }, el("span", { text: s.label }), freshnessBadge(s.freshness, s.observedAt, s.staleAfterSeconds)),
                    details,
                    when,
                );
            }),
        );
    }

    function renderNotice() {
        const notice = $("notice");
        const projectSnapshots = view.sources.filter((s) => s.origin === "snapshot" && s.scope === "project");
        const stale = projectSnapshots.filter((s) => s.freshness === "stale");
        let msg = "";
        if (!projectSnapshots.length) {
            msg =
                "Only this session is visible live. The Copilot SDK does not let a canvas list other app sessions, so " +
                "Project-wide status appears here after a coordinator (or future harness) sends a timestamped snapshot " +
                "via the ingest_snapshot action. Automatic live monitoring of other sessions is not available.";
        } else if (stale.length) {
            msg = `The Project snapshot is stale (observed ${ago(stale[0].observedAt)}). Statuses below may be out of date; request a fresh snapshot.`;
        }
        notice.hidden = !msg;
        notice.textContent = msg;
    }

    function matches(row) {
        if (!inScope(row.scope)) return false;
        if (ui.activities.size && !ui.activities.has(row.activity)) return false;
        if (!ui.query) return true;
        const hay = [row.name, row.id, row.branch, row.repository, row.provider, row.sourceLabel, row.activityDetail, row.mode]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
        return hay.includes(ui.query);
    }

    function renderRows() {
        const rows = view.sessions.filter(matches);
        $("rows").replaceChildren(
            ...rows.map((r) => {
                const nameCell = el(
                    "td",
                    {},
                    el("div", {}, el("span", { class: "sname", text: r.name }), r.isSelf ? el("span", { class: "you" }, "this session") : null),
                    el("div", { class: "sub mono", title: r.id }, r.id),
                    r.repository || r.branch
                        ? el("div", { class: "sub" }, [r.repository, r.branch].filter(Boolean).join(" · "))
                        : null,
                );
                const actCell = el(
                    "td",
                    {},
                    activityBadge(r),
                    r.activityDetail ? el("div", { class: "sub" }, r.activityDetail) : null,
                    r.lastActivityAt ? el("div", { class: "sub", title: exact(r.lastActivityAt) }, `last activity ${ago(r.lastActivityAt)}`) : null,
                );
                const freshCell = el(
                    "td",
                    {},
                    freshnessBadge(r.freshness, r.observedAt),
                    el("div", { class: "sub", title: exact(r.observedAt) }, r.freshness === "live" ? `updated ${ago(r.observedAt)}` : `observed ${ago(r.observedAt)}`),
                );
                const also = r.alsoReportedBy?.length
                    ? el("div", { class: "sub" }, `also: ${r.alsoReportedBy.map((a) => `${a.sourceLabel} (${a.activity}, ${a.freshness})`).join("; ")}`)
                    : null;
                const srcCell = el("td", {}, el("div", {}, r.provider || r.sourceLabel), el("div", { class: "sub" }, r.sourceLabel), also);
                const links = el("td", { class: "links" });
                if (r.appUrl) links.append(el("a", { href: r.appUrl, target: "_top", rel: "noopener" }, "Open in app"));
                if (r.pullRequestUrl) links.append(el("a", { href: r.pullRequestUrl, target: "_blank", rel: "noopener" }, "Pull request"));
                if (!r.appUrl && !r.pullRequestUrl) links.append(el("span", { class: "sub" }, "—"));
                return el("tr", { class: r.freshness === "stale" ? "is-stale" : "" }, nameCell, actCell, freshCell, srcCell, links);
            }),
        );
        const empty = $("empty");
        empty.hidden = rows.length > 0;
        empty.textContent = view.sessions.length ? "No sessions match the current filters." : "No sessions reported yet.";
    }

    function renderChips() {
        const counts = {};
        for (const r of view.sessions) if (inScope(r.scope)) counts[r.activity] = (counts[r.activity] || 0) + 1;
        $("activity-filter").replaceChildren(
            ...Object.keys(ACTIVITY_LABEL).map((a) => {
                const b = el("button", { type: "button", class: "chip", "aria-pressed": String(ui.activities.has(a)) }, `${ACTIVITY_LABEL[a]} ${counts[a] || 0}`);
                b.addEventListener("click", () => {
                    ui.activities.has(a) ? ui.activities.delete(a) : ui.activities.add(a);
                    render();
                });
                return b;
            }),
        );
    }

    function render() {
        if (!view) return;
        for (const b of document.querySelectorAll("[data-scope]")) b.setAttribute("aria-checked", String(b.dataset.scope === ui.scope));
        renderSources();
        renderNotice();
        renderChips();
        renderRows();
    }

    function accept(next) {
        view = next;
        clockSkew = Date.parse(next.now) - Date.now();
        render();
    }

    function setConnection(ok, text) {
        const c = $("connection");
        c.className = `conn ${ok ? "ok" : "bad"}`;
        c.textContent = text;
    }

    function connect() {
        const es = new EventSource("events");
        es.addEventListener("state", (e) => {
            setConnection(true, "Connected to extension");
            accept(JSON.parse(e.data));
        });
        es.onerror = () => setConnection(false, "Extension unreachable — showing last received data");
    }

    document.querySelectorAll("[data-scope]").forEach((b) =>
        b.addEventListener("click", () => {
            ui.scope = b.dataset.scope;
            render();
        }),
    );
    $("search").addEventListener("input", (e) => {
        ui.query = e.target.value.trim().toLowerCase();
        renderRows();
    });
    $("refresh").addEventListener("click", async () => {
        try {
            const res = await fetch("api/refresh", { method: "POST" });
            if (res.ok) accept(await res.json());
        } catch {
            setConnection(false, "Refresh failed");
        }
    });
    // Keep relative ages honest between pushes.
    setInterval(render, 10_000);
    connect();
})();
