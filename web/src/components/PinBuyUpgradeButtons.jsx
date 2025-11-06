// src/components/PinBuyUpgradeButtons.jsx
import { useEffect, useMemo, useState } from "react";
import api from "../lib/api";
import { useAuth } from "../store/auth";

/* Price rules:
   - Use explicit type.price if present
   - Else derive from baseIncome: max(100, baseIncome * 10)
*/
function derivePrice(t) {
    if (!t) return 0;
    const explicit = Number(t.price ?? 0);
    if (explicit > 0) return explicit;
    const bi = Number(t.baseIncome ?? 0);
    return Math.max(100, bi * 10);
}

export default function PinBuyUpgradeButtons({ pin, typeMap, onChanged }) {
    const { user } = useAuth();
    const me = (user?.email || "me").toLowerCase();

    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");
    const [selectedTypeKey, setSelectedTypeKey] = useState("");

    // live balance
    const [balance, setBalance] = useState(0);

    // Load balance when dialog opens (and when pin changes)
    useEffect(() => {
        if (!open) return;

        let ignore = false;

        (async () => {
            try {
                const [health, summary, meResp] = await Promise.all([
                    api.get("/economy/health").then(r => r.data).catch(() => null),
                    api.get("/economy/summary").then(r => r.data).catch(() => null),
                    api.get("/auth/me").then(r => r.data).catch(() => null),
                ]);

                const email = (meResp?.email || me).toLowerCase();

                // 1) Try health map (case-insensitive)
                const map = health?.balances || {};
                const fromMap =
                    map[email] ??
                    map[me] ??
                    // in case keys weren't normalized:
                    Object.entries(map).find(([k]) => String(k).toLowerCase() === email)?.[1];

                // 2) Fallback: scan summary.totals list
                const fromTotals = (() => {
                    const row = (summary?.totals || []).find(
                        (r) => String(r.owner || "").toLowerCase() === email
                    );
                    return row?.balance;
                })();

                const val = Number(
                    Number.isFinite(fromMap) ? fromMap :
                        Number.isFinite(fromTotals) ? fromTotals : 0
                );

                if (!ignore) setBalance(val);
            } catch {
                if (!ignore) setBalance(0);
            }
        })();

        return () => { ignore = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, pin?.id]);

    // type for current pin (can be empty)
    const currentType = useMemo(() => {
        const key = pin?.type || "";
        return key ? typeMap?.[key] : null;
    }, [pin?.type, typeMap]);

    // price shown in dialog
    const price = useMemo(() => {
        const t = currentType || (selectedTypeKey ? typeMap?.[selectedTypeKey] : null);
        return derivePrice(t);
    }, [currentType, selectedTypeKey, typeMap]);

    // permissions / state
    const isMine = (pin?.owner || "").toLowerCase() === me;
    const canUpgrade = isMine && pin?.level < 5 && currentType;

    const canBuy = useMemo(() => {
        const resolvedType = currentType || (selectedTypeKey ? typeMap?.[selectedTypeKey] : null);
        if (!resolvedType) return false;
        if (balance < price) return false;
        // Allow buy if unowned or owned by someone else
        const ownedByOther = (pin?.owner || "").toLowerCase() !== me;
        return ownedByOther;
    }, [balance, currentType, selectedTypeKey, typeMap, price, pin?.owner, me]);

    // actions
    async function handleBuy() {
        setErr("");
        setBusy(true);
        try {
            const payload = {
                pinId: pin.id,
                owner: me,
                type: currentType ? currentType.key : selectedTypeKey, // must send if pin has no type
            };
            const { data } = await api.post("/pins/buy", payload);
            setOpen(false);
            onChanged?.(data);
        } catch (e) {
            const msg = e?.response?.data?.detail || "Buy failed";
            setErr(String(msg));
        } finally {
            setBusy(false);
        }
    }

    async function handleUpgrade() {
        setErr("");
        setBusy(true);
        try {
            const payload = { pinId: pin.id, owner: me };
            const { data } = await api.post("/pins/upgrade", payload);
            onChanged?.(data);
        } catch (e) {
            const msg = e?.response?.data?.detail || "Upgrade failed";
            setErr(String(msg));
        } finally {
            setBusy(false);
        }
    }

    return (
        <>
            {/* Drawer header buttons */}
            {(pin?.owner || "").toLowerCase() !== me && (
                <button
                    className="h-7 px-3 rounded border text-[11px] leading-none whitespace-nowrap hover:bg-gray-50"
                    onClick={() => { setSelectedTypeKey(""); setOpen(true); }}
                    title="Buy"
                >
                    Buy
                </button>
            )}
            {canUpgrade && (
                <button
                    className="h-7 px-3 rounded border text-[11px] leading-none whitespace-nowrap hover:bg-gray-50"
                    onClick={handleUpgrade}
                    title="Upgrade"
                    disabled={busy}
                >
                    {busy ? "Upgrading…" : `Upgrade (→ L${(pin?.level || 1) + 1})`}
                </button>
            )}

            {/* Buy dialog */}
            {open && (
                <div className="fixed inset-0 z-[120]">
                    <div
                        className="absolute inset-0 bg-black/30"
                        onClick={() => (!busy ? setOpen(false) : null)}
                    />
                    <div className="relative z-[121] h-full w-full grid place-items-center">
                        <div className="w-[440px] max-w-[92vw] rounded-xl border bg-white p-4 shadow-xl">
                            <div className="flex items-center justify-between mb-2">
                                <div className="font-medium">Buy Building</div>
                                <button
                                    className="px-2 py-1 border rounded text-sm"
                                    onClick={() => setOpen(false)}
                                    disabled={busy}
                                >
                                    Close
                                </button>
                            </div>

                            <div className="text-sm text-gray-600 space-y-2">
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Balance</span>
                                    <span className="font-semibold">£{Number(balance).toLocaleString()}</span>
                                </div>

                                {!currentType && (
                                    <div>
                                        <label className="block text-xs text-gray-500 mb-1">Select Type</label>
                                        <select
                                            className="w-full border rounded px-3 py-2 bg-white"
                                            value={selectedTypeKey}
                                            onChange={(e) => setSelectedTypeKey(e.target.value)}
                                        >
                                            <option value="">— choose a type —</option>
                                            {Object.values(typeMap || {})
                                                .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
                                                .map((t) => {
                                                    const p = derivePrice(t);
                                                    return (
                                                        <option key={t.key} value={t.key}>
                                                            {t.name} — £{p.toLocaleString()} ( +{t.baseIncome}/tick )
                                                        </option>
                                                    );
                                                })}
                                        </select>
                                    </div>
                                )}

                                <div className="flex justify-between">
                                    <span className="text-gray-500">Price</span>
                                    <span className="font-semibold">
                                        {price > 0 ? `£${price.toLocaleString()}` : "—"}
                                    </span>
                                </div>

                                {err && <div className="text-red-600 text-sm">{err}</div>}
                            </div>

                            <div className="mt-3 flex justify-end gap-2">
                                <button
                                    className="px-3 py-2 border rounded"
                                    onClick={() => setOpen(false)}
                                    disabled={busy}
                                >
                                    Cancel
                                </button>
                                <button
                                    className={`px-3 py-2 border rounded bg-indigo-600 text-white ${(!canBuy || busy) ? "opacity-60 cursor-not-allowed" : ""
                                        }`}
                                    onClick={handleBuy}
                                    disabled={!canBuy || busy}
                                    title={
                                        balance < price
                                            ? "Insufficient funds"
                                            : !currentType && !selectedTypeKey
                                                ? "Choose a type"
                                                : "Buy"
                                    }
                                >
                                    {busy ? "Buying…" : "Buy"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
