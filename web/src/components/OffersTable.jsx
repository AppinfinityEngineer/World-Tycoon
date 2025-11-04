import { useEffect, useMemo, useState } from "react";
import { listMyOffers, actOnOffer } from "../api/offers";
import { fetchMe } from "../lib/auth";

export default function OffersTable() {
    const [me, setMe] = useState(null);
    const [incoming, setIncoming] = useState([]);
    const [outgoing, setOutgoing] = useState([]);
    const [tab, setTab] = useState("pending"); // "pending" | "resolved" | "all"
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    async function refresh() {
        setLoading(true);
        setError("");
        try {
            const actor = await fetchMe().catch(() => null);
            setMe(actor);

            const data = await listMyOffers();
            // Support both shapes: {incoming, outgoing} OR flat array
            if (data && typeof data === "object" && "incoming" in data && "outgoing" in data) {
                setIncoming(data.incoming || []);
                setOutgoing(data.outgoing || []);
            } else {
                const email = (actor && actor.email) || "";
                const items = (Array.isArray(data) ? data : []).filter(
                    (o) => o.fromOwner === email || o.toOwner === email
                );
                setIncoming(items.filter((o) => o.toOwner === email));
                setOutgoing(items.filter((o) => o.fromOwner === email));
            }
        } catch (e) {
            setError(String(e?.response?.data?.detail || e?.message || e));
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        refresh();
    }, []);

    const rows = useMemo(() => {
        const items = [...incoming, ...outgoing].sort((a, b) => (b.t || 0) - (a.t || 0));
        if (tab === "pending") return items.filter((o) => o.status === "pending");
        if (tab === "resolved") return items.filter((o) => o.status !== "pending");
        return items;
    }, [incoming, outgoing, tab]);

    async function onAct(id, action) {
        try {
            await actOnOffer(id, action);
            await refresh();
        } catch (e) {
            setError(String(e?.response?.data?.detail || e?.message || e));
        }
    }

    if (loading) return <div className="p-4 text-sm opacity-70">Loading offers…</div>;
    if (error) return <div className="p-4 text-sm text-red-600">Error: {error}</div>;
    if (!me) return <div className="p-4 text-sm text-red-600">Not authenticated.</div>;

    return (
        <div className="space-y-3">
            <div className="flex gap-2">
                {["pending", "resolved", "all"].map((k) => (
                    <button
                        key={k}
                        className={`px-3 py-1 rounded ${tab === k ? "bg-black text-white" : "bg-gray-200"}`}
                        onClick={() => setTab(k)}
                    >
                        {k[0].toUpperCase() + k.slice(1)}
                    </button>
                ))}
            </div>

            <div className="overflow-x-auto rounded border">
                <table className="min-w-full text-sm">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-3 py-2 text-left">When</th>
                            <th className="px-3 py-2 text-left">Pin</th>
                            <th className="px-3 py-2 text-left">From</th>
                            <th className="px-3 py-2 text-left">To</th>
                            <th className="px-3 py-2 text-left">Amount</th>
                            <th className="px-3 py-2 text-left">Status</th>
                            <th className="px-3 py-2">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((o) => (
                            <tr key={o.id} className="border-t">
                                <td className="px-3 py-2">{new Date(o.t).toLocaleString()}</td>
                                <td className="px-3 py-2">{o.pinId}</td>
                                <td className="px-3 py-2">{o.fromOwner}</td>
                                <td className="px-3 py-2">{o.toOwner}</td>
                                <td className="px-3 py-2">£{Number(o.amount || 0).toLocaleString()}</td>
                                <td className="px-3 py-2">{o.status}</td>
                                <td className="px-3 py-2 flex gap-2 justify-end">
                                    {o.status === "pending" && me && (
                                        <>
                                            <button
                                                className="px-3 py-1 rounded bg-green-600 text-white disabled:opacity-40"
                                                disabled={me.email !== o.toOwner}
                                                onClick={() => onAct(o.id, "accept")}
                                            >
                                                Accept
                                            </button>
                                            <button
                                                className="px-3 py-1 rounded bg-yellow-600 text-white disabled:opacity-40"
                                                disabled={me.email !== o.toOwner}
                                                onClick={() => onAct(o.id, "reject")}
                                            >
                                                Reject
                                            </button>
                                            <button
                                                className="px-3 py-1 rounded bg-gray-700 text-white disabled:opacity-40"
                                                disabled={me.email !== o.fromOwner}
                                                onClick={() => onAct(o.id, "cancel")}
                                            >
                                                Cancel
                                            </button>
                                        </>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {rows.length === 0 && (
                            <tr>
                                <td className="px-3 py-6 text-center text-gray-500" colSpan={7}>
                                    No offers to show.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
