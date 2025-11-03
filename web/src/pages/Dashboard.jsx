import { useEffect, useState } from "react";
import api from "../lib/api";
import { useAuth } from "../store/auth";

/* ---------- small stat card ---------- */
function Card({ title, value, hint }) {
    return (
        <div className="p-4 rounded-lg border bg-white">
            <div className="text-sm text-gray-500">{title}</div>
            <div className="text-2xl font-semibold mt-1">{value}</div>
            {hint && <div className="text-xs text-gray-400 mt-1">{hint}</div>}
        </div>
    );
}

/* ---------- events panel (in-memory + localStorage) ---------- */
function Cooldown({ mins }) {
    return <span className="text-xs text-gray-500">CD {mins}m</span>;
}

function EventsPanel() {
    const [events, setEvents] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem("wt_events") || "[]");
        } catch {
            return [];
        }
    });

    useEffect(() => {
        localStorage.setItem("wt_events", JSON.stringify(events));
    }, [events]);

    function addEvent(e) {
        setEvents((prev) => [{ t: Date.now(), ...e }, ...prev].slice(0, 50));
    }

    function addPowerOutage() {
        addEvent({
            type: "Power Outage",
            city: "Neo London",
            note: "Blocked by Generator Upgrade",
            cdMins: 45,
        });
    }

    function addMediaScandal() {
        addEvent({
            type: "Media Scandal",
            city: "Metro York",
            note: "PR Office mitigated 60%",
            cdMins: 55,
        });
    }

    function clearEvents() {
        setEvents([]);
    }

    return (
        <div className="p-4 rounded-lg border bg-white">
            <div className="mb-3 flex items-center justify-between">
                <div className="font-medium">Influence Ops — Recent Events</div>
                <div className="flex items-center gap-2">
                    <button className="px-3 py-2 rounded-lg border" onClick={addPowerOutage}>
                        + Power Outage
                    </button>
                    <button className="px-3 py-2 rounded-lg border" onClick={addMediaScandal}>
                        + Media Scandal
                    </button>
                    <button className="px-3 py-2 rounded-lg border" onClick={clearEvents}>
                        Clear
                    </button>
                </div>
            </div>

            {/* initial seeded items */}
            {events.length === 0 && (
                <div className="text-sm text-gray-500 mb-3">
                    No events yet. Use the buttons above to add test events.
                </div>
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
                        <Cooldown mins={e.cdMins} />
                    </li>
                ))}
            </ul>
        </div>
    );
}

/* ---------- page ---------- */
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
        return () => {
            ignore = true;
        };
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

            {/* Events panel */}
            <EventsPanel />

            {/* Placeholder for future activity feed */}
            <div className="p-4 rounded-lg border bg-white">
                <div className="font-medium mb-2">Recent Activity</div>
                <div className="text-sm text-gray-600">Coming soon (Phase 3+)</div>
            </div>
        </div>
    );
}
