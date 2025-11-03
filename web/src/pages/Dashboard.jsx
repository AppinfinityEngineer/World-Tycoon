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

/* events panel (backend-wired) */
function EventsPanel() {
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);

    async function fetchEvents() {
        const { data } = await api.get("/events");
        setEvents(data);
        setLoading(false);
    }
    useEffect(() => { fetchEvents(); }, []);

    async function add(type, city, note, cdMins) {
        const { data } = await api.post("/events", { type, city, note, cdMins });
        setEvents((prev) => [data, ...prev].slice(0, 200));
    }

    async function clearAll() {
        await api.delete("/events");
        setEvents([]);
    }

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

            {events.length === 0 && (
                <div className="text-sm text-gray-500 mb-3">No events yet.</div>
            )}

            <ul className="divide-y">
                {events.map((e, i) => (
                    <li key={i} className="py-2 flex items-start justify-between">
                        <div>
                            <div className="font-medium">
                                {e.type} — {e.city}
                            </div>
                            <div className="text-sm text-gray-500">{e.note}</div>
                        </div>
                        <span className="text-xs text-gray-500">CD {e.cdMins}m</span>
                    </li>
                ))}
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

            <EventsPanel />

            <div className="p-4 rounded-lg border bg-white">
                <div className="font-medium mb-2">Recent Activity</div>
                <div className="text-sm text-gray-600">Coming soon (Phase 3+)</div>
            </div>
        </div>
    );
}
