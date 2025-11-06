// web/src/components/PinBuyUpgradeButtons.jsx
import { useEffect, useState } from "react";
import api from "../lib/api";
import { useAuth } from "../store/auth";

function getMyBalance(summary, email) {
    if (!summary || !email) return 0;
    const row = (summary.totals || []).find(
        (r) => (r.owner || "").toLowerCase() === email.toLowerCase()
    );
    return Number(row?.balance || 0);
}

export default function PinBuyUpgradeButtons({ pin, onChanged }) {
    const { user } = useAuth();
    const me = (user?.email || "").toLowerCase();

    const [open, setOpen] = useState(false);
    const [types, setTypes] = useState([]);
    const [summary, setSummary] = useState(null);
    const [selectedKey, setSelectedKey] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    if (!pin?.id) return null;

    const owner = (pin.owner || "").toLowerCase();
    const unowned = !owner;
    const isMine = owner === me;

    // If owned by someone else, no buy/upgrade (trade only)
    if (!unowned && !isMine) return null;

    const mode = unowned ? "buy" : "upgrade";

    useEffect(() => {
        if (!open) return;
        (async () => {
            try {
                const [typesRes, sumRes] = await Promise.all([
                    api.get("/types"),
                    api.get("/economy/summary"),
                ]);
                setTypes(typesRes.data || []);
                setSummary(sumRes.data || null);

                if (mode === "upgrade" && pin.type) {
                    setSelectedKey(pin.type);
                } else if (!selectedKey && (typesRes.data || []).length) {
                    setSelectedKey(typesRes.data[0].key);
                }
            } catch (e) {
                console.error(e);
                setError("Failed to load prices");
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, pin.id]);

    const myBalance = getMyBalance(summary, me);

    const currentType = types.find((t) => t.key === selectedKey);
    const basePrice = currentType
        ? Number(currentType.basePrice || currentType.price || 100)
        : 0;

    let price = 0;
    if (mode === "buy") {
        price = basePrice;
    } else if (mode === "upgrade") {
        const lvl = Number(pin.level || 1) + 1;
        price = basePrice * lvl;
    }

    const cannotAfford = price > 0 && myBalance < price;

    async function confirm() {
        if (!selectedKey || !price || cannotAfford || busy) return;
        setBusy(true);
        setError("");
        try {
            const { data } = await api.post("/pins/buy", {
                pinId: pin.id,
                buildingType: selectedKey,
                buyer: me,
            });
            setOpen(false);
            if (onChanged) onChanged(data);
        } catch (e) {
            console.error(e);
            const msg = e?.response?.data?.detail || "Purchase failed";
            setError(String(msg));
        } finally {
            setBusy(false);
        }
    }

    return (
        <>
            <button
                className="h-7 px-2 rounded border text-[11px] leading-none whitespace-nowrap hover:bg-gray-50"
                onClick={() => {
                    setError("");
                    setOpen(true);
                }}
            >
                {mode === "buy" ? "Buy" : "Upgrade"}
            </button>

            {open && (
                <div className="fixed inset-0 z-[200]">
                    <div
                        className="absolute inset-0 bg-black/30"
                        onClick={() => !busy && setOpen(false)}
                    />
                    <div className="relative z-[201] h-full w-full grid place-items-center">
                        <div className="w-[420px] rounded-xl border bg-white p-4 space-y-3 shadow-xl">
                            <div className="flex items-center justify-between">
                                <div className="font-medium">
                                    {mode === "buy"
                                        ? "Buy Building"
                                        : "Upgrade Building"}
                                </div>
                                <button
                                    className="px-2 py-1 text-xs border rounded"
                                    onClick={() => !busy && setOpen(false)}
                                >
                                    Close
                                </button>
                            </div>

                            <div className="text-sm">
                                <div className="text-gray-500">Balance</div>
                                <div className="font-semibold">
                                    £{myBalance.toLocaleString()}
                                </div>
                            </div>

                            <div className="text-sm">
                                <div className="text-gray-500 mb-1">
                                    Select Type
                                </div>
                                <select
                                    className="w-full border rounded px-3 py-2 bg-white text-sm"
                                    value={selectedKey}
                                    onChange={(e) =>
                                        setSelectedKey(e.target.value)
                                    }
                                    disabled={mode === "upgrade" && !!pin.type}
                                >
                                    <option value="">
                                        — select building —
                                    </option>
                                    {types.map((t) => (
                                        <option key={t.key} value={t.key}>
                                            {t.name || t.key} — £
                                            {Number(
                                                t.basePrice || t.price || 100
                                            ).toLocaleString()}{" "}
                                            (
                                            +
                                            {Number(
                                                t.baseIncome || 0
                                            ).toLocaleString()}
                                            /tick)
                                        </option>
                                    ))}
                                </select>
                                {mode === "upgrade" && pin.type && (
                                    <div className="mt-1 text-[10px] text-gray-500">
                                        Upgrading keeps the same building type.
                                    </div>
                                )}
                            </div>

                            <div className="text-sm">
                                <div className="text-gray-500">Price</div>
                                <div className="font-semibold">
                                    {price
                                        ? `£${price.toLocaleString()}`
                                        : "—"}
                                </div>
                                {cannotAfford && (
                                    <div className="text-xs text-rose-600">
                                        Insufficient funds
                                    </div>
                                )}
                            </div>

                            {error && (
                                <div className="text-xs text-rose-600">
                                    {error}
                                </div>
                            )}

                            <div className="flex justify-end gap-2 pt-1">
                                <button
                                    className="px-3 py-2 border rounded text-sm"
                                    onClick={() => !busy && setOpen(false)}
                                    disabled={busy}
                                >
                                    Cancel
                                </button>
                                <button
                                    className={
                                        "px-3 py-2 rounded text-sm text-white " +
                                        (cannotAfford || !selectedKey || busy
                                            ? "bg-indigo-400/40 cursor-not-allowed"
                                            : "bg-indigo-600 hover:bg-indigo-700")
                                    }
                                    onClick={confirm}
                                    disabled={
                                        cannotAfford ||
                                        !selectedKey ||
                                        busy
                                    }
                                >
                                    {busy
                                        ? "Processing..."
                                        : mode === "buy"
                                            ? "Buy"
                                            : "Upgrade"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
