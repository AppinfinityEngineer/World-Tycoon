import { useEffect, useMemo, useState } from "react";
import api from "../lib/api";
import { useAuth } from "../store/auth";

/* small helpers */
function cls(...a) { return a.filter(Boolean).join(" "); }
function useNow(ms = 10000) { const [t, setT] = useState(Date.now()); useEffect(() => { const id = setInterval(() => setT(Date.now()), ms); return () => clearInterval(id); }, [ms]); return t; }

function StatusChip({ s }) {
    const map = {
        pending: "bg-amber-100 text-amber-800 border-amber-200",
        accepted: "bg-emerald-100 text-emerald-800 border-emerald-200",
        rejected: "bg-rose-100 text-rose-800 border-rose-200",
        cancelled: "bg-gray-100 text-gray-700 border-gray-200",
    };
    return (
        <span className={cls("px-2 py-0.5 rounded-md text-xs border", map[s] || "bg-gray-100 text-gray-700 border-gray-200")}>
            {s}
        </span>
    );
}

export default function OffersPage() {
    const { user } = useAuth();
    const me = user?.email || "Me";
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [banner, setBanner] = useState("");
    const pulse = useNow(10000);

    async function fetchOffers() {
        try {
            const { data } = await api.get("/offers", { params: { owner: me } });
            (data || []).sort((a, b) => (b.t || 0) - (a.t || 0));
            setItems(data || []);
        } finally { setLoading(false); }
    }

    useEffect(() => { fetchOffers(); /* eslint-disable-next-line */ }, [me]);
    useEffect(() => { if (!loading) fetchOffers(); /* eslint-disable-next-line */ }, [pulse, me]);

    function upsert(updated) { setItems(prev => prev.map(o => o.id === updated.id ? updated : o)); }

    async function act(id, action) {
        const idx = items.findIndex(o => o.id === id);
        if (idx < 0) return;
        const prev = items[idx];
        const optimistic = { ...prev, status: action === "accept" ? "accepted" : action === "reject" ? "rejected" : "cancelled" };
        upsert(optimistic);
        try {
            const { data } = await api.patch(`/offers/${id}`, { action });
            upsert(data);
            setBanner(action === "accept" ? "Trade accepted" : action === "reject" ? "Offer rejected" : "Offer cancelled");
            setTimeout(() => setBanner(""), 2000);
        } catch (e) {
            upsert(prev);
            console.error(e);
            setBanner("Action failed");
            setTimeout(() => setBanner(""), 2000);
        }
    }

    const counts = useMemo(() => {
        const c = { pending: 0, accepted: 0, rejected: 0, cancelled: 0 };
        for (const o of items) c[o.status] = (c[o.status] || 0) + 1;
        return c;
    }, [items]);

    if (loading) return <div className="p-4 rounded-lg border bg-white text-sm text-gray-500">Loading offers…</div>;

    return (
        <div className="space-y-4">
            {banner && <div className="p-3 rounded-lg border bg-emerald-50 text-emerald-800">{banner}</div>}

            <div className="p-4 rounded-lg border bg-white">
                <div className="flex items-center justify-between mb-3">
                    <div className="font-medium">Offers</div>
                    <div className="text-xs text-gray-500">
                        pending {counts.pending} · accepted {counts.accepted} · rejected {counts.rejected} · cancelled {counts.cancelled}
                    </div>
                </div>

                {items.length === 0 ? (
                    <div className="text-sm text-gray-500">No offers yet.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-gray-500 border-b">
                                    <th className="py-2 pr-4">When</th>
                                    <th className="py-2 pr-4">Pin</th>
                                    <th className="py-2 pr-4">From → To</th>
                                    <th className="py-2 pr-4">Amount</th>
                                    <th className="py-2 pr-4">Status</th>
                                    <th className="py-2 pr-4"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map(o => {
                                    const when = o.t ? new Date(o.t).toLocaleString() : "—";
                                    const isSender = o.fromOwner === me;
                                    const isReceiver = o.toOwner === me;
                                    const canAccept = o.status === "pending" && isReceiver;
                                    const canReject = o.status === "pending" && isReceiver;
                                    const canCancel = o.status === "pending" && isSender;
                                    return (
                                        <tr key={o.id} className="border-b">
                                            <td className="py-2 pr-4">{when}</td>
                                            <td className="py-2 pr-4 truncate">{o.pinId?.slice(0, 8)}</td>
                                            <td className="py-2 pr-4">{o.fromOwner} → {o.toOwner}</td>
                                            <td className="py-2 pr-4">{o.amount}</td>
                                            <td className="py-2 pr-4"><StatusChip s={o.status} /></td>
                                            <td className="py-2 pr-4">
                                                <div className="flex gap-2">
                                                    {canAccept && (
                                                        <button className="px-2 py-1 rounded border hover:bg-gray-50" onClick={() => act(o.id, "accept")}>
                                                            Accept
                                                        </button>
                                                    )}
                                                    {canReject && (
                                                        <button className="px-2 py-1 rounded border hover:bg-gray-50" onClick={() => act(o.id, "reject")}>
                                                            Reject
                                                        </button>
                                                    )}
                                                    {canCancel && (
                                                        <button className="px-2 py-1 rounded border hover:bg-gray-50" onClick={() => act(o.id, "cancel")}>
                                                            Cancel
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
