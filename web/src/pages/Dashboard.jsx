// web/src/pages/Dashboard.jsx
import { useEffect, useState } from "react";
import api from "../lib/api";
import { useAuth } from "../store/auth";

/* utils */
function useNow(intervalMs = 1000) {
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), intervalMs);
        return () => clearInterval(id);
    }, [intervalMs]);
    return now;
}
function clamp01(x) { return Math.max(0, Math.min(1, x)); }
function fmtDHMS(ms) {
    if (ms <= 0) return "00:00:00";
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    return d > 0
        ? `${d}d ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`
        : `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

/* small stat card */
function Card({ title, value, hint }) {
    return (
        <div className="p-4 rounded-lg border bg-white">
            <div className="text-sm text-gray-500">{title}</div>
            <div className="text-2xl font-semibold mt-1">{value}</div>
            {hint && <div className="text-xs text-gray-400 mt-1">{hint}</div>}
        </div>
    );
}

/* Season card */
function SeasonCard() {
    const [data, setData] = useState(null);
    const now = useNow(1000);

    async function load() {
        const { data } = await api.get("/settings/season");
        setData(data);
    }
    useEffect(() => { load(); }, []);

    if (!data) return <div className="p-4 rounded-lg border bg-white text-sm text-gray-500">Loading season…</div>;

    const { seasonStart, seasonEnd } = data;
    const start = seasonStart;
    const end = seasonEnd;

    const before = now < start;
    const live = now >= start && now < end;
    const after = now >= end;

    let title = "Season";
    let timer = "—";
    if (before) { title = "Season Starts In"; timer = fmtDHMS(start - now); }
    if (live) { title = "Season Ends In"; timer = fmtDHMS(end - now); }
    if (after) { title = "Season Finished"; timer = "00:00:00"; }

    const pct = live
        ? clamp01((now - start) / Math.max(1, (end - start)))
        : before ? 0 : 1;

    return (
        <div className="p-4 rounded-lg border bg-white">
            <div className="text-sm text-gray-500">{title}</div>
            <div className="text-2xl font-semibold mt-1">{timer}</div>
            <div className="mt-3 h-2 w-full rounded bg-gray-100 overflow-hidden">
                <div className="h-2 bg-indigo-600" style={{ width: `${Math.round(pct * 100)}%` }} />
            </div>
            <div className="text-xs text-gray-400 mt-2">
                {new Date(seasonStart).toLocaleString()} → {new Date(seasonEnd).toLocaleString()}
            </div>
        </div>
    );
}

/* Events panel (paged or array) WITH progress bars */
function EventsPanel() {
    const [page, setPage] = useState({ total: 0, next_offset: null, items: [] });
    const [loading, setLoading] = useState(true);

    function usePulse(ms = 10000) { const n = useNow(ms); return n; }
    const pulse = usePulse(10000);
    const now = useNow(1000);

    function mmss(ms) {
        if (ms <= 0) return "00:00";
        const m = Math.floor(ms / 60000);
        const s = Math.floor((ms % 60000) / 1000);
        return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }

    function normalise(resp) {
        if (Array.isArray(resp)) return { total: resp.length, next_offset: null, items: resp };
        const { total = 0, next_offset = null, items = [] } = resp || {};
        return { total, next_offset, items };
    }

    async function fetchEvents(offset = 0) {
        const { data } = await api.get("/events", { params: { offset, limit: 50 } });
        setPage(normalise(data));
        setLoading(false);
    }
    async function loadMore() {
        if (page.next_offset == null) return;
        const { data } = await api.get("/events", { params: { offset: page.next_offset, limit: 50 } });
        const next = normalise(data);
        setPage((p) => ({
            total: next.total,
            next_offset: next.next_offset,
            items: [...p.items, ...next.items],
        }));
    }
    async function add(type, city, note, cdMins) {
        const { data } = await api.post("/events", { type, city, note, cdMins });
        setPage((p) => ({
            total: p.total + 1,
            next_offset: p.next_offset,
            items: [data, ...p.items].slice(0, 50),
        }));
    }
    async function clearAll() {
        await api.delete("/events");
        setPage({ total: 0, next_offset: null, items: [] });
    }

    useEffect(() => { fetchEvents(0); }, []);
    useEffect(() => { if (!loading) fetchEvents(0); }, [pulse]);

    if (loading) {
        return (
            <div className="p-4 rounded-lg border bg-white text-sm text-gray-500">
                Loading events…
            </div>
        );
    }

    return (
        <div className="p-4 rounded-lg border bg-white">
            <div className="mb-3 flex items-center justify-between">
                <div className="font-medium">Influence Ops — Recent Events</div>
                <div className="flex items-center gap-2">
                    <button
                        className="px-3 py-2 rounded-lg border"
                        onClick={() => add("Power Outage", "Neo London", "Blocked by Generator Upgrade", 45)}
                    >
                        + Power Outage
                    </button>
                    <button
                        className="px-3 py-2 rounded-lg border"
                        onClick={() => add("Media Scandal", "Metro York", "PR Office mitigated 60%", 55)}
                    >
                        + Media Scandal
                    </button>
                    <button className="px-3 py-2 rounded-lg border" onClick={clearAll}>
                        Clear
                    </button>
                </div>
            </div>

            {page.items.length === 0 && (
                <div className="text-sm text-gray-500 mb-3">No events yet.</div>
            )}

            <ul className="divide-y">
                {page.items.map((e) => {
                    const createdAt = e.t ?? Date.now();
                    const totalMs = Math.max(0, (e.cdMins ?? 0) * 60 * 1000);
                    const elapsed = Math.max(0, now - createdAt);
                    const remain = Math.max(0, totalMs - elapsed);
                    const pct = totalMs === 0 ? 1 : clamp01(elapsed / totalMs);
                    const showTimer = totalMs > 0 && remain > 0;

                    return (
                        <li
                            key={e.id ?? `${createdAt}-${e.type}-${e.city}`}
                            className="py-2 flex items-start justify-between gap-4"
                        >
                            <div className="min-w-0">
                                <div className="font-medium">{e.type} — {e.city || "Global"}</div>
                                {e.note && <div className="text-sm text-gray-500">{e.note}</div>}

                                {/* progress bar (only when countdown is active) */}
                                {showTimer && (
                                    <div className="mt-1 w-64 sm:w-96">
                                        <div className="h-1.5 rounded bg-gray-100 overflow-hidden">
                                            <div
                                                className="h-1.5 bg-indigo-600"
                                                style={{ width: `${Math.round(pct * 100)}%` }}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* countdown (only when active) */}
                            {showTimer && (
                                <span className="text-xs shrink-0 text-gray-600">
                                    {`CD ${mmss(remain)}`}
                                </span>
                            )}
                        </li>
                    );
                })}
            </ul>

            {page.next_offset != null && (
                <div className="mt-3 flex justify-end">
                    <button className="px-3 py-2 rounded-lg border" onClick={loadMore}>
                        Load more
                    </button>
                </div>
            )}
        </div>
    );
}


/* Balances panel (with 10s polling + interval hint) */
function BalancesPanel() {
    const [summary, setSummary] = useState({ lastTick: 0, intervalSec: 0, totals: [] });
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const pulse = useNow(10000);

    async function fetchSummary() {
        const { data } = await api.get("/economy/summary");
        setSummary(data);
        setLoading(false);
    }
    async function runTick() {
        setBusy(true);
        try {
            const { data } = await api.post("/economy/tick");
            setSummary(data);
        } finally { setBusy(false); }
    }
    useEffect(() => { fetchSummary(); }, []);
    useEffect(() => { if (!loading) fetchSummary(); }, [pulse]);

    if (loading) return <div className="p-4 rounded-lg border bg-white text-sm text-gray-500">Loading economy…</div>;

    return (
        <div className="p-4 rounded-lg border bg-white">
            <div className="mb-3 flex items-center justify-between">
                <div className="font-medium">Economy — Top Balances</div>
                <button className="px-3 py-2 rounded-lg border" onClick={runTick} disabled={busy}>
                    {busy ? "Ticking…" : "Run Tick"}
                </button>
            </div>
            {summary.totals.length === 0 ? (
                <div className="text-sm text-gray-500">No balances yet. Assign owners/types/levels to pins, then run a tick.</div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-gray-500">
                                <th className="py-2 pr-4">Owner</th>
                                <th className="py-2 pr-4">Balance</th>
                            </tr>
                        </thead>
                        <tbody>
                            {summary.totals.map((row) => (
                                <tr key={row.owner} className="border-t">
                                    <td className="py-2 pr-4">{row.owner}</td>
                                    <td className="py-2 pr-4">{row.balance}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            <div className="text-xs text-gray-400 mt-2">
                Last tick: {summary.lastTick ? new Date(summary.lastTick).toLocaleString() : "—"}
                {summary.intervalSec ? ` • Auto-ticking every ${Math.round(summary.intervalSec / 60)} min` : ""}
            </div>
        </div>
    );
}

export default function Dashboard() {
    const { token } = useAuth();
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState("");

    useEffect(() => {
        let ignore = false;
        (async () => {
            try {
                const { data } = await api.get("/stats/overview");
                if (!ignore) setStats(data);
            } catch {
                setErr("Couldn’t load stats");
            } finally {
                if (!ignore) setLoading(false);
            }
        })();
        return () => { ignore = true; };
    }, [token]);

    if (loading) return <div className="animate-pulse text-gray-500">Loading…</div>;
    if (err) return <div className="text-red-600">{err}</div>;

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <Card title="Active Users" value={stats?.users ?? "—"} />
                <Card title="Waitlist" value={stats?.waitlist ?? "—"} />
                <SeasonCard />
                <Card title="Your Token" value="Active" hint="Auto-refresh on expiry" />
            </div>

            <BalancesPanel />
            <EventsPanel />

            <div className="p-4 rounded-lg border bg-white">
                <div className="font-medium mb-2">Recent Activity</div>
                <div className="text-sm text-gray-600">Coming soon (Phase 3+)</div>
            </div>
        </div>
    );
}
