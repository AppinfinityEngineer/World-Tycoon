// web/src/components/PinBuyUpgradeButtons.jsx
import { useEffect, useMemo, useState } from "react";
import api from "../lib/api";
import { useAuth } from "../store/auth";

export default function PinBuyUpgradeButtons({ pin, onChanged }) {
    const { user } = useAuth();
    const me = (user?.email || "").toLowerCase();

    const [types, setTypes] = useState([]);
    const [selectedKey, setSelectedKey] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    // --- load building types once ---
    useEffect(() => {
        let ignore = false;
        (async () => {
            try {
                const { data } = await api.get("/types");
                if (ignore) return;
                setTypes(Array.isArray(data) ? data : []);
            } catch (e) {
                console.error("Failed to load building types", e);
            }
        })();
        return () => {
            ignore = true;
        };
    }, []);

    // Reset local state on pin change
    useEffect(() => {
        setError("");
        if (!pin) return;

        if (pin.type) {
            setSelectedKey(pin.type);
        } else if (types.length > 0) {
            setSelectedKey(types[0].key);
        }
    }, [pin, types]);

    const typeMap = useMemo(() => {
        const m = {};
        for (const t of types) {
            if (!t?.key) continue;
            m[t.key] = {
                key: t.key,
                name: t.name || t.key,
                basePrice: Number(t.basePrice || t.price || 100),
            };
        }
        return m;
    }, [types]);

    if (!pin) return null;

    const isOwned = !!pin.owner;
    const isMine =
        (pin.owner || "").toLowerCase() === me && !!me;

    // Street ownership hint (if backend sets these fields)
    const streetOwner = (pin.streetOwner || "").toLowerCase();
    const hasStreetLock = !!pin.streetId && !!streetOwner;
    const isStreetMine = hasStreetLock && streetOwner === me;

    // Buy allowed when:
    // - pin is unowned
    // - AND (no street lock OR street owned by buyer)
    const canBuy =
        !isOwned &&
        !!me &&
        (!hasStreetLock || isStreetMine);

    // Upgrade allowed when I already own it
    const canUpgrade = isMine;

    const selectedType =
        (pin.type && typeMap[pin.type]) ||
        (selectedKey && typeMap[selectedKey]) ||
        null;

    const nextLevel = (() => {
        if (!pin.level || pin.level < 1) return 1;
        if (pin.level >= 5) return 5;
        return pin.level + (canUpgrade ? 1 : 0);
    })();

    const buyPrice = selectedType?.basePrice ?? 0;
    const upgradePrice =
        selectedType?.basePrice && nextLevel
            ? selectedType.basePrice * nextLevel
            : 0;

    async function handleClick() {
        setError("");
        if (!pin?.id || !selectedType?.key || busy) return;

        const buildingType = pin.type || selectedType.key; // for upgrade use existing
        setBusy(true);
        try {
            await api.post("/pins/buy", {
                pinId: pin.id,
                buildingType,
                buyer: me,
            });
            onChanged && (await onChanged());
        } catch (e) {
            console.error(e);
            const msg =
                e?.response?.data?.detail ||
                e?.message ||
                "Something went wrong";
            setError(String(msg));
        } finally {
            setBusy(false);
        }
    }

    const buttonLabel = (() => {
        if (!isOwned) {
            if (!selectedType) return "Buy";
            return `Buy (£${buyPrice})`;
        }
        if (pin.level >= 5) return "Max level";
        if (!selectedType) return "Upgrade";
        return `Upgrade (£${upgradePrice})`;
    })();

    const disabled =
        busy ||
        (!canBuy && !canUpgrade) ||
        (isOwned && !isMine) ||
        (isOwned && pin.level >= 5) ||
        !selectedType;

    return (
        <div className="flex flex-col items-end gap-1">
            {/* Top row: select + button */}
            <div className="flex items-center gap-1">
                {/* Only show selector when slot empty; for owned property we keep type fixed */}
                {!isOwned && (
                    <select
                        className="h-7 px-2 rounded border text-[11px] leading-none"
                        value={selectedType?.key || ""}
                        onChange={(e) => {
                            setSelectedKey(e.target.value);
                            setError("");
                        }}
                    >
                        {types.map((t) => (
                            <option key={t.key} value={t.key}>
                                {t.name || t.key} (£
                                {t.basePrice || t.price || 100})
                            </option>
                        ))}
                    </select>
                )}

                <button
                    className={
                        "h-7 px-3 rounded text-[11px] leading-none whitespace-nowrap " +
                        (disabled
                            ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                            : isOwned
                                ? "bg-indigo-600 text-white hover:bg-indigo-500"
                                : "bg-emerald-600 text-white hover:bg-emerald-500")
                    }
                    onClick={handleClick}
                    disabled={disabled}
                >
                    {busy ? "Working…" : buttonLabel}
                </button>
            </div>

            {/* Street ownership hint */}
            {hasStreetLock && !isStreetMine && !isOwned && (
                <div className="text-[10px] text-red-500 leading-tight">
                    Street owned by {pin.streetOwner || "another player"}
                </div>
            )}

            {/* Error message */}
            {error && (
                <div className="text-[10px] text-red-500 leading-tight max-w-[180px] text-right">
                    {error}
                </div>
            )}
        </div>
    );
}
