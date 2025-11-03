import { useEffect, useState } from "react";
import api from "../lib/api";
import { useAuth } from "../store/auth";

function Card({ title, value, hint }) {
    return (
        <div className="p-4 rounded-lg border bg-white">
            <div className="text-sm text-gray-500">{title}</div>
            <div className="text-2xl font-semibold mt-1">{value}</div>
            {hint && <div className="text-xs text-gray-400 mt-1">{hint}</div>}
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
                if (!ignore) { setStats(data); }
            } catch (e) {
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

            <div className="p-4 rounded-lg border bg-white">
                <div className="font-medium mb-2">Recent Activity</div>
                <div className="text-sm text-gray-600">Coming soon (Phase 3+)</div>
            </div>
        </div>
    );
}
