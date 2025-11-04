// src/pages/Map.jsx
import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { useEffect, useMemo, useState } from "react";
import api from "../lib/api";
import { useAuth } from "../store/auth";

/* ---------- icons ---------- */
function squareIcon(color = "#22c55e", selected = false) {
    const size = selected ? 20 : 16;
    const radius = selected ? 5 : 4;
    const ring = selected
        ? "0 0 0 2px rgba(59,130,246,.30)"
        : "0 1px 2px rgba(0,0,0,.25)";
    return L.divIcon({
        className: "wt-square-icon",
        html: `<div style="
      width:${size}px;height:${size}px;border-radius:${radius}px;background:${color};
      box-shadow:${ring};border:1px solid rgba(0,0,0,.25);
    "></div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
    });
}

const COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444"];

/* ---------- helpers ---------- */
function useKey(key, handler) {
    useEffect(() => {
        const fn = (e) => {
            if (e.key === key) handler(e);
        };
        window.addEventListener("keydown", fn);
        return () => window.removeEventListener("keydown", fn);
    }, [key, handler]);
}

/* ---------- Drawer ---------- */
function Drawer({ open, onClose, pin, typeMap, onEdit, onDelete, onMakeOffer, me }) {
    if (!open || !pin) return null;

    const t = typeMap[pin.type || ""] || { name: "—", baseIncome: 0, key: pin.type || "" };
    const level = Math.min(5, Math.max(1, Number(pin.level || 1)));
    const income = (t.baseIncome || 0) * level;
    const bar = pin.color || "#22c55e";

    const showKeyInBrackets =
        t?.key && t?.name && t.key.toLowerCase() !== t.name.toLowerCase();

    return (
        <div className="fixed inset-0 pointer-events-none z-50">
            {/* light overlay */}
            <div
                className="absolute inset-0 bg-black/5"
                onClick={onClose}
                aria-hidden
                style={{ pointerEvents: "auto" }}
            />

            {/* compact card */}
            <aside
                className="
          absolute right-4 top-20 w-[280px]
          rounded-xl border bg-white shadow-xl
          overflow-hidden pointer-events-auto
          animate-[wtSlideIn_.18s_ease-out]
        "
                style={{ zIndex: 60 }}
            >
                {/* coloured header */}
                <div
                    className="w-full h-10 flex items-center justify-center"
                    style={{ background: bar, color: "#fff" }}
                >
                    <div className="px-3 text-sm font-semibold tracking-wide drop-shadow-[0_1px_1px_rgba(0,0,0,.35)]">
                        {t.name || "—"}
                    </div>
                </div>

                {/* header row */}
                <div className="px-3 py-2 flex items-center justify-between">
                    <div className="font-semibold tracking-tight text-sm">Pin Details</div>

                    <div className="flex items-center gap-1 shrink-0">
                        {pin.owner && pin.owner !== me && (
                            <button
                                className="h-7 px-2 rounded border text-[11px] leading-none whitespace-nowrap hover:bg-gray-50"
                                onClick={onMakeOffer}
                                title="Make Offer"
                            >
                                Make Offer
                            </button>
                        )}
                        <button
                            className="h-7 px-2 rounded border text-[11px] leading-none whitespace-nowrap hover:bg-gray-50"
                            onClick={onEdit}
                            title="Edit"
                        >
                            Edit
                        </button>
                        <button
                            className="h-7 px-2 rounded border text-[11px] leading-none whitespace-nowrap hover:bg-gray-50"
                            onClick={onDelete}
                            title="Delete"
                        >
                            Delete
                        </button>
                        <button
                            className="h-7 px-2 rounded border text-[11px] leading-none whitespace-nowrap hover:bg-gray-50"
                            onClick={onClose}
                            title="Close"
                        >
                            Close
                        </button>
                    </div>
                </div>

                {/* body */}
                <div className="px-3 pb-3 text-[13px] leading-6">
                    <div className="flex justify-between">
                        <span className="text-gray-500">Owner</span>
                        <span className="font-medium">{pin.owner || "—"}</span>
                    </div>

                    <div className="flex justify-between">
                        <span className="text-gray-500">Type</span>
                        <span className="font-medium">
                            {t.name || pin.type || "—"}
                            {showKeyInBrackets && (
                                <span className="text-gray-400"> ({t.key})</span>
                            )}
                        </span>
                    </div>

                    <div className="flex justify-between">
                        <span className="text-gray-500">Level</span>
                        <span className="font-medium">{level}</span>
                    </div>

                    <div className="flex justify-between">
                        <span className="text-gray-500">Income</span>
                        <span className="font-medium">+{income} / tick</span>
                    </div>

                    <div className="mt-1 flex items-center justify-between">
                        <span className="text-gray-500">Color</span>
                        <span
                            className="inline-block align-middle rounded border"
                            style={{
                                width: 12,
                                height: 12,
                                background: bar,
                                borderColor: "rgba(0,0,0,.15)",
                            }}
                        />
                    </div>

                    <div className="mt-2 text-[11px] text-gray-400">
                        id: {pin.id?.slice(0, 8) ?? "—"} · lat: {pin.lat?.toFixed(5)} · lng:{" "}
                        {pin.lng?.toFixed(5)}
                    </div>
                </div>
            </aside>

            <style>{`
        @keyframes wtSlideIn {
          0% { transform: translateX(12px); opacity: .0; }
          100% { transform: translateX(0); opacity: 1; }
        }
      `}</style>
        </div>
    );
}

/* ---------- Map Page ---------- */
export default function MapPage() {
    const { user } = useAuth();
    const me = user?.email || "Me";

    const [pins, setPins] = useState([]);
    const [colorIdx, setColorIdx] = useState(0);
    const [loading, setLoading] = useState(true);
    const [selectedId, setSelectedId] = useState(null);
    const [editing, setEditing] = useState(null);
    const [typeMap, setTypeMap] = useState({}); // key -> {key, name, baseIncome}

    // Offers (MVP)
    const [offerOpen, setOfferOpen] = useState(false);
    const [offerAmount, setOfferAmount] = useState("");
    const [offerBusy, setOfferBusy] = useState(false);
    const [offerSent, setOfferSent] = useState(false);

    // esc closes drawer
    useKey("Escape", () => setSelectedId(null));

    /* ---- server sync ---- */
    async function fetchPins() {
        try {
            const { data } = await api.get("/pins");
            setPins(data ?? []);
        } finally {
            setLoading(false);
        }
    }

    async function addPin(lat, lng, color) {
        try {
            const { data } = await api.post("/pins", { lat, lng, color });
            setPins((prev) => [...prev, data]);
        } catch (e) {
            console.error("addPin failed", e);
        }
    }

    async function clearServerPins() {
        try {
            await api.delete("/pins");
            setPins([]);
            setSelectedId(null);
        } catch (e) {
            console.error("clearPins failed", e);
        }
    }

    async function deletePin(id) {
        try {
            await api.delete(`/pins/${id}`);
            setPins((prev) => prev.filter((p) => p.id !== id));
            if (selectedId === id) setSelectedId(null);
        } catch (e) {
            console.error("deletePin failed", e);
        }
    }

    async function patchPin(update) {
        const { id, type, owner, level, color } = update;
        try {
            const { data } = await api.patch(`/pins/${id}`, {
                type,
                owner,
                level,
                color,
            });
            setPins((prev) => prev.map((x) => (x.id === id ? data : x)));
        } catch (e) {
            console.error("patchPin failed", e);
        }
    }

    async function fetchTypes() {
        try {
            const { data } = await api.get("/types");
            const map = {};
            (data || []).forEach((t) => {
                map[t.key] = {
                    key: t.key,
                    name: t.name || t.key,
                    baseIncome: Number(t.baseIncome || 0),
                };
            });
            setTypeMap(map);
        } catch (e) {
            console.error("types fetch failed", e);
            setTypeMap({});
        }
    }

    // Offers API
    async function createOffer({ pinId, fromOwner, toOwner, amount }) {
        const { data } = await api.post("/offers", {
            pinId,
            fromOwner,
            toOwner,
            amount,
        });
        return data;
    }

    useEffect(() => {
        fetchPins();
        fetchTypes();
    }, []);

    function ClickToAdd({ colorIdx }) {
        useMapEvents({
            click(e) {
                const c = COLORS[colorIdx % COLORS.length];
                addPin(e.latlng.lat, e.latlng.lng, c);
            },
        });
        return null;
    }

    function downloadPins(list) {
        const blob = new Blob([JSON.stringify(list, null, 2)], {
            type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "world-tycoon-pins.json";
        a.click();
        URL.revokeObjectURL(url);
    }

    async function uploadPins(e) {
        const file = e.target.files?.[0];
        if (!file) return;
        const text = await file.text();
        e.target.value = "";
        try {
            const data = JSON.parse(text);
            if (!Array.isArray(data)) return;

            await clearServerPins();
            for (const p of data) {
                if (typeof p?.lat === "number" && typeof p?.lng === "number") {
                    const color = typeof p?.color === "string" ? p.color : COLORS[0];
                    await addPin(p.lat, p.lng, color);
                }
            }
        } catch (err) {
            console.error("uploadPins failed", err);
        }
    }

    const centerUK = useMemo(() => [52.8, -2.2], []);
    const selectedPin = useMemo(
        () => pins.find((p) => p.id === selectedId) || null,
        [pins, selectedId]
    );

    return (
        <div className="p-4">
            <div className="mb-4 flex items-center gap-2">
                <button
                    className="px-3 py-2 rounded-lg border"
                    onClick={() => setColorIdx((i) => i + 1)}
                    title="Cycle pin color for next click"
                >
                    Add Pin (color: {["green", "blue", "amber", "red"][colorIdx % 4]})
                </button>
                <button className="px-3 py-2 rounded-lg border" onClick={clearServerPins}>
                    Clear Pins
                </button>
                <button
                    className="px-3 py-2 rounded-lg border"
                    onClick={() => downloadPins(pins)}
                >
                    Save Layout
                </button>
                <label className="px-3 py-2 rounded-lg border cursor-pointer">
                    Load Layout
                    <input
                        type="file"
                        accept="application/json"
                        className="hidden"
                        onChange={uploadPins}
                    />
                </label>
            </div>

            <MapContainer
                className="rounded-xl border relative z-0"
                center={centerUK}
                zoom={12}
                style={{ height: 560, width: "100%" }}
            >
                <TileLayer
                    attribution="&copy; OpenStreetMap"
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {!loading && <ClickToAdd colorIdx={colorIdx} />}

                {pins.map((p) => {
                    const isSel = p.id === selectedId;
                    return (
                        <Marker
                            key={p.id ?? `${p.lat},${p.lng}`}
                            position={[p.lat, p.lng]}
                            icon={squareIcon(p.color, isSel)}
                            eventHandlers={{
                                click: () => setSelectedId(p.id || null),
                                contextmenu: () => p.id && deletePin(p.id),
                            }}
                        />
                    );
                })}
            </MapContainer>

            {/* Drawer */}
            <Drawer
                open={!!selectedPin}
                pin={selectedPin}
                typeMap={typeMap}
                me={me}
                onClose={() => setSelectedId(null)}
                onEdit={() => selectedPin && setEditing({ ...selectedPin })}
                onDelete={() => selectedPin?.id && deletePin(selectedPin.id)}
                onMakeOffer={() => {
                    setOfferAmount("");
                    setOfferOpen(true);
                }}
            />

            {/* Simple Edit Modal */}
            {editing && (
                <div className="fixed inset-0 bg-black/30 grid place-items-center z-50">
                    <div className="w-[420px] rounded-xl border bg-white p-4 space-y-3">
                        <div className="font-medium">Edit Pin</div>

                        {/* Type dropdown from server */}
                        <label className="block text-xs text-gray-500">Type</label>
                        <select
                            className="w-full border rounded px-3 py-2 bg-white"
                            value={editing.type || ""}
                            onChange={(e) =>
                                setEditing((s) => ({ ...s, type: e.target.value }))
                            }
                        >
                            <option value="">— select type —</option>
                            {Object.values(typeMap)
                                .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
                                .map((t) => (
                                    <option key={t.key} value={t.key}>
                                        {t.name}
                                        {t.key &&
                                            t.key.toLowerCase() !== (t.name || "").toLowerCase()
                                            ? ` (${t.key})`
                                            : ""}
                                    </option>
                                ))}
                        </select>

                        {/* Owner */}
                        <label className="block text-xs text-gray-500">Owner</label>
                        <input
                            className="w-full border rounded px-3 py-2"
                            placeholder="Owner"
                            value={editing.owner || ""}
                            onChange={(e) =>
                                setEditing((s) => ({ ...s, owner: e.target.value }))
                            }
                        />

                        {/* Level + Color */}
                        <div className="flex gap-2">
                            <div className="flex-1">
                                <label className="block text-xs text-gray-500">Level (1–5)</label>
                                <input
                                    type="number"
                                    className="w-full border rounded px-3 py-2"
                                    value={editing.level ?? 1}
                                    min={1}
                                    max={5}
                                    onChange={(e) =>
                                        setEditing((s) => ({
                                            ...s,
                                            level: Math.max(1, Math.min(5, Number(e.target.value || 1))),
                                        }))
                                    }
                                />
                            </div>
                            <div className="flex-1">
                                <label className="block text-xs text-gray-500">Color (#hex)</label>
                                <input
                                    className="w-full border rounded px-3 py-2"
                                    placeholder="#22c55e"
                                    value={editing.color || "#22c55e"}
                                    onChange={(e) =>
                                        setEditing((s) => ({ ...s, color: e.target.value }))
                                    }
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-2">
                            <button
                                className="px-3 py-2 border rounded"
                                onClick={() => setEditing(null)}
                            >
                                Cancel
                            </button>
                            <button
                                className="px-3 py-2 border rounded bg-indigo-600 text-white"
                                onClick={async () => {
                                    await patchPin(editing);
                                    setEditing(null);
                                }}
                            >
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Make Offer Modal (close reliably + top-right toast) */}
            {offerOpen && selectedPin && (
                <div className="fixed inset-0 z-[120]">
                    {/* overlay */}
                    <div
                        className="absolute inset-0 bg-black/30"
                        onClick={() => {
                            if (!offerBusy) {
                                setOfferOpen(false);
                                setOfferAmount("");
                            }
                        }}
                    />
                    <div className="relative z-[121] h-full w-full grid place-items-center">
                        <div className="w-[380px] rounded-xl border bg-white p-4 space-y-3 shadow-xl">
                            <div className="font-medium">Make Offer</div>
                            <div className="text-sm text-gray-600">
                                Offer to buy <span className="font-semibold">{selectedPin.owner}</span>’s property.
                            </div>
                            <input
                                type="number"
                                min={1}
                                className="w-full border rounded px-3 py-2"
                                placeholder="Amount"
                                value={offerAmount}
                                onChange={(e) => setOfferAmount(e.target.value)}
                            />
                            <div className="flex justify-end gap-2">
                                <button
                                    className="px-3 py-2 border rounded"
                                    onClick={() => {
                                        setOfferOpen(false);
                                        setOfferAmount("");
                                    }}
                                    disabled={offerBusy}
                                >
                                    Cancel
                                </button>
                                <button
                                    className={
                                        "px-3 py-2 border rounded bg-indigo-600 text-white " +
                                        (offerBusy ? "opacity-60 cursor-not-allowed" : "")
                                    }
                                    onClick={async () => {
                                        const amount = Number(offerAmount || 0);
                                        if (amount <= 0 || offerBusy) return;
                                        setOfferBusy(true);
                                        try {
                                            await createOffer({
                                                pinId: selectedPin.id,
                                                fromOwner: me,                    // <-- use logged-in email
                                                toOwner: selectedPin.owner || "",
                                                amount,
                                            });
                                            setOfferSent(true);
                                            setTimeout(() => setOfferSent(false), 1800);
                                        } catch (e) {
                                            console.error(e);
                                        } finally {
                                            setOfferBusy(false);
                                            setOfferOpen(false);
                                            setOfferAmount("");
                                        }
                                    }}
                                >
                                    {offerBusy ? "Sending…" : "Send Offer"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Toast */}
            {offerSent && (
                <div className="fixed top-4 right-4 z-[130] rounded-md border bg-white px-3 py-2 text-sm shadow">
                    Offer sent ✅
                </div>
            )}
        </div>
    );
}
