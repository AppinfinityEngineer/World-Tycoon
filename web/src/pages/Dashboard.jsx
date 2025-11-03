import { useEffect, useState } from "react";
import api from "../lib/api";

function StatCard({ title, value, sub }) {
    return (
        <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-500">{title}</div>
            <div className="text-2xl font-semibold mt-1">{value}</div>
            {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
        </div>
    );
}

export default function Dashboard() {
    const [stats, setStats] = useState({ users: 0, waitlist: 0 });
    const [exp, setExp] = useState("-");

    useEffect(() => {
        let t;
        try {
            t = localStorage.getItem("wt_token");
            if (t) {
                const payload = JSON.parse(atob(t.split(".")[1]));
                if (payload?.exp) {
                    const ms = payload.exp * 1000 - Date.now();
                    setExp(ms > 0 ? Math.ceil(ms / 60000) + " min" : "expired");
                }
            }
        } catch { }

        (async () => {
            try {
                const { data } = await api.get("/stats/overview");
                setStats(data);
            } catch {
                // leave defaults
            }
        })();
    }, []);

    return (
        <>
            <h2 className="text-2xl font-semibold mb-4">Dashboard Overview</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <StatCard title="Active Users" value={stats.users} />
                <StatCard title="Waitlist" value={stats.waitlist} />
                <StatCard title="Your Token Expires In" value={exp} sub="HS256 JWT" />
            </div>
            <div className="border border-dashed border-gray-400 p-8 text-center text-gray-500 rounded-lg bg-white">
                Map or game UI will appear here.
            </div>
        </>
    );
}
