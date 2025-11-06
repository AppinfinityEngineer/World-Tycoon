// web/src/components/PinBuyUpgradeButtons.jsx
import { useEffect, useMemo, useState } from "react";
import api from "../lib/api";
import { useAuth } from "../store/auth";

function fmtMoney(v) {
    return `£${Number(v || 0).toLocaleString()}`;
}

export default function PinBuyUpgradeButtons({ pin, onChanged }) {
    const { user } = useAuth();
    const me = (user?.email || "").toLowerCase();

    const [types, setTypes] = useState([]);
    const [balance, setBalance] = useState(0);
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");
    const [selectedType, setSelectedType] = useState("");

    const isMine = (pin?.owner || "").toLowerCase() === me;
    const isUnowned = !pin?.owner;
    const maxLevel = 5;
    const level = Number(pin?.level || 1);

    // ---- load building types + my balance ----
    useEffect(() => {
        let ignore = false;
        (async () => {
            try {
                const [typesRes, ecoRes] = await Promise.all([
                    api.get("/types"),
                    api.get("/economy/summary"),
                ]);

                if (!ignore) {
                    setTypes(typesRes.data || []);

                    const email = me;
                    const row = (ecoRes.data?.totals || []).find(
                        (r) => (r.owner || "").toLowerCase() === email
                    );
                    setBalance(Number(row?.balance || 0));
                }
            } catch (e) {
                if (!ignore) {
                    console.error(e);
                }
            }
        })();
        return () => {
            ignore = true;
        };
    }, [me]);

    // ---- price helpers ----
    const typeOptions = useMemo(() => {
        return (types || []).map((t) => ({
            key: t.key,
            label: `${t.name || t.key} — ${fmtMoney(
                t.basePrice || t.price || 100
            )} ( +${t.baseIncome || 0}/tick )`,
            basePrice: Number(t.basePrice || t.price || 100),
        }));
    }, [types]);

    const chosen = typeOptions.find((t) => t.key === selectedType);

    // For unowned: pay base price.
    // For upgrade: pay basePrice * newLevel.
    const currentTypeKey = pin?.type || selectedType || typeOptions[0]?.key;
    const currentType =
        typeOptions.find((t) => t.key === currentTypeKey) || typeOptions[0];

    const price = useMemo(() => {
        if (!currentType) return 0;
        if (isUnowned) {
            return currentType.basePrice;
        }
        // upgrade price
        const nextLevel = Math.min(maxLevel, level + 1);
        return currentType.basePrice * nextLevel;
    }, [currentType, isUnowned, level]);

    const canAfford = balance >= price && price > 0;

    // ---- visibility rules ----
    // Only show controls when:
    // - Unowned: any player can buy
    // - Owned by me: can upgrade (if not max)
    // - Owned by others: NO buy/upgrade
    const showBuy =
        isUnowned && !!pin?.id; // empty slot, can place first building

    const showUpgrade =
        isMine && !!pin?.id && !!pin?.type && level < maxLevel; // my property, has building

    if (!showBuy && !showUpgrade) {
        // Someone else's property or maxed-out; nothing to render.
        return null;
    }

    async function submit() {
        if (!pin?.id || !currentType) return;
        setBusy(true);
        setErr("");
        try {
            const { data } = await api.post("/pins/buy", {
                pinId: pin.id,
                buildingType: currentType.key,
                buyer: me,
            });

            // refresh caller state
            if (onChanged) onChanged(data);
            // close modal + update balance locally
            const delta = price || 0;
            setBalance((b) => Math.max(0, b - delta));
            setOpen(false);
        } catch (e) {
            console.error(e);
            const msg =
                e?.response?.data?.detail ||
                e?.message ||
                "Purchase/upgrade failed";
            setErr(String(msg));
        } finally {
            setBusy(false);
        }
    }

    const title = isUnowned ? "Buy Building" : "Upgrade Building";

    return (
        <>
            <button
                className="h-7 px-2 rounded border text-[11px] leading-none whitespace-nowrap hover:bg-gray-50"
                onClick={() => {
                    setErr("");
                    // default select first type on fresh open when unowned
                    if (isUnowned && typeOptions[0]) {
                        setSelectedType(typeOptions[0].key);
                    }
                    setOpen(true);
                }}
            >
                {isUnowned ? "Buy" : `Upgrade (L${level})`}
            </button>

            {open && (
                <div className="fixed inset-0 z-[120]">
                    <div
                        className="absolute inset-0 bg-black/30"
                        onClick={() => !busy && setOpen(false)}
                    />
                    <div className="relative z-[121] h-full w-full grid place-items-center">
                        <div className="w-[420px] rounded-xl border bg-white p-4 space-y-3 shadow-xl">
                            <div className="flex items-center justify-between">
                                <div className="font-medium">{title}</div>
                                <button
                                    className="px-2 py-1 text-xs border rounded"
                                    onClick={() => !busy && setOpen(false)}
                                    disabled={busy}
                                >
                                    Close
                                </button>
                            </div>

                            <div className="text-sm">
                                <div className="text-gray-500">Balance</div>
                                <div className="font-semibold">{fmtMoney(balance)}</div>
                            </div>

                            {isUnowned && (
                                <>
                                    <div className="text-xs text-gray-500">Select Type</div>
                                    <select
                                        className="w-full border rounded px-3 py-2 bg-white text-sm"
                                        value={selectedType || currentType?.key || ""}
                                        onChange={(e) => setSelectedType(e.target.value)}
                                        disabled={busy}
                                    >
                                        {typeOptions.map((t) => (
                                            <option key={t.key} value={t.key}>
                                                {t.label}
                                            </option>
                                        ))}
                                    </select>
                                </>
                            )}

                            <div className="text-sm">
                                <div className="text-gray-500">Price</div>
                                <div className="font-semibold">
                                    {price > 0 ? fmtMoney(price) : "—"}
                                </div>
                                {!canAfford && (
                                    <div className="text-xs text-rose-600">
                                        Insufficient funds
                                    </div>
                                )}
                            </div>

                            {err && (
                                <div className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded px-2 py-1">
                                    {err}
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
                                        "px-3 py-2 border rounded text-sm text-white " +
                                        (canAfford && !busy
                                            ? "bg-indigo-600 hover:bg-indigo-700"
                                            : "bg-gray-400 cursor-not-allowed")
                                    }
                                    onClick={canAfford && !busy ? submit : undefined}
                                    disabled={!canAfford || busy}
                                    title={
                                        !canAfford
                                            ? "Insufficient funds"
                                            : isUnowned
                                                ? "Buy property"
                                                : "Upgrade building"
                                    }
                                >
                                    {busy
                                        ? "Working…"
                                        : isUnowned
                                            ? "Buy"
                                            : `Upgrade to L${Math.min(maxLevel, level + 1)}`}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
