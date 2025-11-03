import { useEffect, useState } from "react";
import api from "../lib/api";
import { useAuth } from "../store/auth";

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

/* tiny timing hooks/utils */
function useNow(intervalMs = 1000) {
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), intervalMs);
        return () => clearInterval(id);
    }, [intervalMs]);
    return now;
}
function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
function mmss(ms) {
    if (ms <= 0) return "00:00";
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/* balances panel (unchanged) */
function BalancesPanel() {
    const [summary, setSummary] = useState({ lastTick: 0, totals: [] });
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);

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
        } finally {
            setBusy(false);
        }
    }

    useEffect(() => { fetchSummary(); }, []);

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
                <div className="text-sm text-gray-500">
                    No balances yet. Assign owners/types/levels to pins, then run a tick.
                </div>
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
            </div>
        </div>
    );
}

/* events panel — polished */
function EventsPanel() {
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const now = useNow(1000);      // drives progress bars
    const pollNow = useNow(10000); // background refresh every 10s

    function normalize(list) {
        const arr = Array.isArray(list) ? list : [];
        // remove fully expired except keep the latest 5 for context
        const withIdx = arr.map((e, i) => ({ ...e, _i: i }));
        const active = [];
        const expired = [];
        for (const e of withIdx) {
            const start = typeof e.t === "number" ? e.t : Date.now();
            const cd = typeof e.cdMins === "number" ? e.cdMins : 0;
            const endAt = start + cd * 60 * 1000;
            if (endAt > Date.now()) active.push(e); else expired.push(e);
        }
        expired.sort((a, b) => b._i - a._i);
        const keepExpired = expired.slice(0, 5);
        const out = [...active, ...keepExpired];
        // hard cap to 100 newest
        return out.slice(0, 100);
    }

    async function fetchEvents() {
        try {
            const { data } = await api.get("/events");
            setEvents(normalize(data));
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { fetchEvents(); }, []);
    useEffect(() => { if (!loading) fetchEvents(); /* poll */ }, [pollNow]); // background refresh

    async function add(type, city, note, cdMins) {
        const { data } = await api.post("/events", { type, city, note, cdMins });
        setEvents(prev => normalize([data, ...prev]));
    }

    async function clearAll() {
        await api.delete("/events");
        setEvents([]);
    }

    if (loading) {
        return <div className="p-4 rounded-lg border bg-white text-sm text-gray-500">Loading events…</div>;
    }

    return (
        <div className="p-4 rounded-lg border bg-white">
            <div className="mb-3 flex items-center justify-between">
                <div className="font-medium">Influence Ops — Recent Events</div>
                <div className="flex items-center gap-2">
                    <button className="px-3 py-2 rounded-lg border"
                        onClick={() => add("Power Outage", "Neo London", "Blocked by Generator Upgrade", 45)}>
                        + Power Outage
                    </button>
                    <button className="px-3 py-2 rounded-lg border"
                        onClick={() => add("Media Scandal", "Metro York", "PR Office mitigated 60%", 55)}>
                        + Media Scandal
                    </button>
                    <button className="px-3 py-2 rounded-lg border" onClick={clearAll}>Clear</button>
                </div>
            </div>

            {events.length === 0 && <div className="text-sm text-gray-500 mb-3">No events yet.</div>}

            <ul className="divide-y">
                {events.map((e, i) => {
                    const start = typeof e.t === "number" ? e.t : Date.now();
                    const cd = typeof e.cdMins === "number" ? e.cdMins : 0;
                    const endAt = start + cd * 60 * 1000;
                    const remain = endAt - now;
                    const expired = remain <= 0;
                    const pct = cd > 0 ? clamp01((now - start) / (cd * 60 * 1000)) : 1;

                    return (
                        <li key={i} className="py-2">
                            <div className="flex items-start justify-between">
                                <div>
                                    <div className="font-medium">{e.type} — {e.city}</div>
                                    <div className="text-sm text-gray-500">{e.note}</div>
                                </div>
                                <span className={"text-xs " + (expired ? "text-gray-400" : "text-gray-600")}>
                                    {expired ? "CD 00:00" : `CD ${mmss(remain)}`}
                                </span>
                            </div>
                            <div className="mt-2 h-1.5 rounded bg-gray-100">
                                <div className="h-1.5 rounded bg-gray-400" style={{ width: `${pct * 100}%` }} />
                            </div>
                        </li>
                    );
                })}
            </ul>
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
                <Card title="Your Token" value="Active" hint="Auto-refresh on expiry" />
                <Card title="Season Ends In" value="—" hint="Add in Phase 6" />
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
