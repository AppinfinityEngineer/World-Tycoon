import { useEffect, useMemo, useState } from "react";
import { fetchTypes, buyPin } from "../lib/shop";
import api from "../lib/api";

export default function BuyModal({ pinId, onClose, onPurchased }) {
    const [types, setTypes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [me, setMe] = useState(null);
    const [balances, setBalances] = useState({});
    const [busyKey, setBusyKey] = useState("");

    useEffect(() => {
        let ignore = false;
        (async () => {
            try {
                const [ts, actor, health] = await Promise.all([
                    fetchTypes(),
                    api.get("/auth/me").then(r => r.data).catch(() => null),
                    api.get("/economy/health").then(r => r.data).catch(() => ({ balances: {} })),
                ]);
                if (!ignore) {
                    setTypes(ts);
                    setMe(actor);
                    setBalances(health?.balances || {});
                }
            } finally {
                if (!ignore) setLoading(false);
            }
        })();
        return () => { ignore = true; };
    }, []);

    const myEmail = (me?.email || "").toLowerCase();
    const myBalance = Number(balances[myEmail] ?? 0);

    async function handleBuy(t) {
        setBusyKey(t.key);
        try {
            const res = await buyPin({ pinId, type: t.key, level: 1 });
            onPurchased?.(res);
            onClose?.();
        } catch (e) {
            alert(e?.response?.data?.detail || "Purchase failed");
        } finally {
            setBusyKey("");
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
            <div className="w-[560px] max-w-[92vw] rounded-xl bg-white shadow p-4">
                <div className="flex items-center justify-between mb-2">
                    <div className="text-lg font-semibold">Buy Building</div>
                    <button className="text-sm px-2 py-1 rounded border" onClick={onClose}>Close</button>
                </div>

                {loading ? (
                    <div className="text-gray-500 text-sm">Loading…</div>
                ) : (
                    <>
                        <div className="text-sm text-gray-600 mb-3">
                            Balance: <span className="font-medium">£{myBalance.toLocaleString()}</span>
                        </div>

                        <div className="divide-y max-h-[60vh] overflow-y-auto">
                            {types.map((t) => {
                                const affordable = myBalance >= Number(t.price || 0);
                                return (
                                    <div key={t.key} className="py-2 flex items-center justify-between gap-4">
                                        <div className="min-w-0">
                                            <div className="font-medium">{t.label}</div>
                                            <div className="text-xs text-gray-500">
                                                Income +{t.baseIncome}/tick • Price £{Number(t.price).toLocaleString()}
                                            </div>
                                        </div>
                                        <button
                                            className="px-3 py-1.5 rounded-lg border disabled:opacity-50 disabled:cursor-not-allowed"
                                            disabled={!affordable || busyKey === t.key}
                                            onClick={() => handleBuy(t)}
                                        >
                                            {busyKey === t.key ? "Buying…" : "Buy"}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
