import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, Marker, Polyline, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { useEffect, useMemo, useState } from "react";
import api from "../lib/api";
import { useAuth } from "../store/auth";
import PinBuyUpgradeButtons from "../components/PinBuyUpgradeButtons";

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

/* ---------- Drawer (Property panel) ---------- */
function Drawer({
    open,
    onClose,
    pin,
    typeMap,
    onChanged,
    onDelete,
    onMakeOffer,
    me,
    allowDelete,
}) {
    if (!open || !pin) return null;

    const t =
        typeMap[pin.type || ""] || {
            name: pin.type ? pin.type : "Empty plot",
            baseIncome: 0,
            key: pin.type || "",
        };

    const level = Math.min(5, Math.max(1, Number(pin.level || 1)));
    const income = (t.baseIncome || 0) * (pin.type ? level : 0);
    const bar = pin.color || "#22c55e";

    const showKeyInBrackets =
        t?.key && t?.name && t.key.toLowerCase() !== t.name.toLowerCase();

    const isMine = (pin.owner || "").toLowerCase() === (me || "").toLowerCase();
    const canMakeOffer = pin.owner && !isMine;

    const streetName = pin.streetName || null;

    return (
        <div className="fixed inset-0 pointer-events-none z-50">
            {/* overlay */}
            <div
                className="absolute inset-0 bg-black/5"
                onClick={onClose}
                aria-hidden
                style={{ pointerEvents: "auto" }}
            />

            <aside
                className="
                    absolute right-4 top-20 w-[280px]
                    rounded-xl border bg-white shadow-xl
                    overflow-hidden pointer-events-auto
                    animate-[wtSlideIn_.18s_ease-out]
                "
                style={{ zIndex: 60 }}
            >
                {/* header bar */}
                <div
                    className="w-full h-10 flex items-center justify-center"
                    style={{ background: bar, color: "#fff" }}
                >
                    <div className="px-3 text-sm font-semibold tracking-wide drop-shadow-[0_1px_1px_rgba(0,0,0,.35)]">
                        {t.name || "Property"}
                    </div>
                </div>

                {/* top row buttons */}
                <div className="px-3 py-2 flex items-center justify-between">
                    <div className="font-semibold tracking-tight text-sm">
                        Property Details
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                        {canMakeOffer && (
                            <button
                                className="h-7 px-2 rounded border text-[11px] leading-none whitespace-nowrap hover:bg-gray-50"
                                onClick={onMakeOffer}
                            >
                                Make Offer
                            </button>
                        )}

                        {/* Buy / Upgrade (component enforces rules: only buyer / owner etc) */}
                        <PinBuyUpgradeButtons pin={pin} onChanged={onChanged} />

                        {allowDelete && (
                            <button
                                className="h-7 px-2 rounded border text-[11px] leading-none whitespace-nowrap hover:bg-gray-50"
                                onClick={onDelete}
                            >
                                Delete
                            </button>
                        )}

                        <button
                            className="h-7 px-2 rounded border text-[11px] leading-none whitespace-nowrap hover:bg-gray-50"
                            onClick={onClose}
                        >
                            Close
                        </button>
                    </div>
                </div>

                {/* body */}
                <div className="px-3 pb-3 text-[13px] leading-6">
                    <div className="flex justify-between">
                        <span className="text-gray-500">Owner</span>
                        <span className="font-medium">
                            {pin.owner || "Unowned"}
                        </span>
                    </div>

                    <div className="flex justify-between">
                        <span className="text-gray-500">Street</span>
                        <span className="font-medium">
                            {streetName || "—"}
                        </span>
                    </div>

                    <div className="flex justify-between">
                        <span className="text-gray-500">Building</span>
                        <span className="font-medium">
                            {pin.type ? t.name || t.key : "None"}
                            {pin.type && showKeyInBrackets && (
                                <span className="text-gray-400"> ({t.key})</span>
                            )}
                        </span>
                    </div>

                    <div className="flex justify-between">
                        <span className="text-gray-500">Level</span>
                        <span className="font-medium">
                            {pin.type ? level : "—"}
                        </span>
                    </div>

                    <div className="flex justify-between">
                        <span className="text-gray-500">Income</span>
                        <span className="font-medium">
                            {pin.type ? `+${income} / tick` : "—"}
                        </span>
                    </div>

                    <div className="mt-1 flex items-center justify-between">
                        <span className="text-gray-500">Marker</span>
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
                        id: {pin.id?.slice(0, 8) ?? "—"} · lat:{" "}
                        {pin.lat?.toFixed(5)} · lng: {pin.lng?.toFixed(5)}
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
    const me = (user?.email || "me").toLowerCase();

    // Dev-only tools: only true when explicitly set
    const devTools =
        import.meta.env.VITE_ENABLE_MAP_DEV_TOOLS !== "false";

    const [pins, setPins] = useState([]);
    const [streets, setStreets] = useState([]);
    const [colorIdx, setColorIdx] = useState(0);
    const [loading, setLoading] = useState(true);
    const [selectedId, setSelectedId] = useState(null);
    const [selectedStreetId, setSelectedStreetId] = useState(null);
    const [typeMap, setTypeMap] = useState({});

    const [offerOpen, setOfferOpen] = useState(false);
    const [offerAmount, setOfferAmount] = useState("");
    const [offerBusy, setOfferBusy] = useState(false);
    const [offerSent, setOfferSent] = useState(false);

    useKey("Escape", () => {
        setSelectedId(null);
        setSelectedStreetId(null);
    });

    /* ---- server sync ---- */
    async function fetchPins() {
        try {
            const { data } = await api.get("/pins");
            setPins(data ?? []);
        } finally {
            setLoading(false);
        }
    }

    async function fetchStreets() {
        try {
            const { data } = await api.get("/streets");
            setStreets(data ?? []);
        } catch (e) {
            console.error("fetchStreets failed", e);
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

    async function fetchTypes() {
        try {
            const { data } = await api.get("/types");
            const map = {};
            (data || []).forEach((t) => {
                map[t.key] = {
                    key: t.key,
                    name: t.name || t.key,
                    baseIncome: Number(t.baseIncome || 0),
                    basePrice: Number(t.basePrice || t.price || 100),
                };
            });
            setTypeMap(map);
        } catch (e) {
            console.error("types fetch failed", e);
            setTypeMap({});
        }
    }

    async function createOffer({ pinId, fromOwner, toOwner, amount }) {
        const { data } = await api.post("/offers", {
            pinId,
            fromOwner,
            toOwner,
            amount,
        });
        return data;
    }

    async function claimStreet(streetId) {
        try {
            await api.post("/streets/claim", {
                streetId,
                buyer: me,
            });
            await Promise.all([fetchStreets(), fetchPins()]);
        } catch (e) {
            console.error("claimStreet failed", e);
        }
    }

    useEffect(() => {
        fetchPins();
        fetchTypes();
        fetchStreets();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function ClickToAdd({ colorIdx }) {
        useMapEvents({
            click(e) {
                if (!devTools) return; // only for layout/dev
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
        a.download = "world-tycoon-properties.json";
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
                    const color =
                        typeof p?.color === "string" ? p.color : COLORS[0];
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
    const selectedStreet = useMemo(
        () => streets.find((s) => s.id === selectedStreetId) || null,
        [streets, selectedStreetId]
    );

    return (
        <div className="p-4">
            {/* Dev-only tools */}
            {devTools && (
                <div className="mb-4 flex items-center gap-2">
                    <button
                        className="px-3 py-2 rounded-lg border"
                        onClick={() => setColorIdx((i) => i + 1)}
                        title="Cycle marker color for next click"
                    >
                        Add Property Slot (color:{" "}
                        {["green", "blue", "amber", "red"][colorIdx % 4]})
                    </button>
                    <button
                        className="px-3 py-2 rounded-lg border"
                        onClick={clearServerPins}
                    >
                        Clear All Slots
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
            )}

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

                {/* Dev-only click to add loose slots */}
                {!loading && <ClickToAdd colorIdx={colorIdx} />}

                {/* Streets as polylines */}
                {streets.map((s) => {
                    const coords = (s.coords || [])
                        .filter(
                            (c) =>
                                Array.isArray(c) &&
                                c.length >= 2 &&
                                typeof c[0] === "number" &&
                                typeof c[1] === "number"
                        )
                        .map((c) => [c[0], c[1]]);

                    if (coords.length < 2) return null;

                    const isSel = s.id === selectedStreetId;
                    const isMine =
                        (s.owner || "").toLowerCase() === me;
                    const color = !s.owner
                        ? "#9ca3af"
                        : isMine
                            ? "#22c55e"
                            : "#3b82f6";

                    return (
                        <Polyline
                            key={s.id}
                            positions={coords}
                            pathOptions={{
                                color,
                                weight: isSel ? 6 : 4,
                                dashArray: s.owner ? undefined : "4 6",
                            }}
                            eventHandlers={{
                                click: () => {
                                    setSelectedStreetId(s.id);
                                    setSelectedId(null);
                                },
                            }}
                        />
                    );
                })}

                {/* Property pins */}
                {pins.map((p) => {
                    const isSel = p.id === selectedId;
                    const isOwner =
                        (p.owner || "").toLowerCase() === me;

                    return (
                        <Marker
                            key={p.id ?? `${p.lat},${p.lng}`}
                            position={[p.lat, p.lng]}
                            icon={squareIcon(p.color, isSel)}
                            eventHandlers={{
                                click: () => {
                                    setSelectedId(p.id || null);
                                    setSelectedStreetId(null);
                                },
                                contextmenu: () => {
                                    // Right-click delete: dev tools or owner of that slot
                                    if (!p.id) return;
                                    if (devTools || isOwner) {
                                        deletePin(p.id);
                                    }
                                },
                            }}
                        />
                    );
                })}
            </MapContainer>

            {/* Property drawer */}
            <Drawer
                open={!!selectedPin}
                pin={selectedPin}
                typeMap={typeMap}
                me={me}
                onClose={() => setSelectedId(null)}
                onDelete={async () => {
                    if (!selectedPin?.id) return;
                    const isOwner =
                        (selectedPin.owner || "").toLowerCase() === me;
                    if (!devTools && !isOwner) return;
                    await deletePin(selectedPin.id);
                }}
                onMakeOffer={() => {
                    setOfferAmount("");
                    setOfferOpen(true);
                }}
                onChanged={async () => {
                    await fetchPins(); // refresh after buy/upgrade
                }}
                allowDelete={
                    !!selectedPin &&
                    (devTools ||
                        (selectedPin.owner || "").toLowerCase() === me)
                }
            />

            {/* Street drawer */}
            {selectedStreet && (
                <div className="fixed inset-0 pointer-events-none z-40">
                    <div
                        className="absolute inset-0"
                        style={{ pointerEvents: "auto", background: "transparent" }}
                        onClick={() => setSelectedStreetId(null)}
                    />
                    <aside
                        className="
                            absolute left-4 top-20 w-[260px]
                            rounded-xl border bg-white shadow-xl
                            pointer-events-auto p-3 space-y-2
                        "
                    >
                        <div className="font-semibold text-sm">
                            {selectedStreet.name}
                        </div>
                        <div className="text-xs text-gray-500">
                            Owner:{" "}
                            <span className="font-medium">
                                {selectedStreet.owner || "Unowned"}
                            </span>
                        </div>
                        <div className="text-xs text-gray-500">
                            Price: £{selectedStreet.price}
                        </div>
                        <div className="text-xs text-gray-500">
                            Slots on claim: {selectedStreet.slots}
                        </div>
                        <div className="flex gap-2 justify-end pt-1">
                            <button
                                className="px-2 py-1 text-xs border rounded"
                                onClick={() => setSelectedStreetId(null)}
                            >
                                Close
                            </button>
                            {!selectedStreet.owner && (
                                <button
                                    className="px-2 py-1 text-xs rounded bg-indigo-600 text-white"
                                    onClick={() => claimStreet(selectedStreet.id)}
                                >
                                    Buy Street
                                </button>
                            )}
                        </div>
                    </aside>
                </div>
            )}

            {/* Make Offer Modal */}
            {offerOpen && selectedPin && (
                <div className="fixed inset-0 z-[120]">
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
                                Offer to buy{" "}
                                <span className="font-semibold">
                                    {selectedPin.owner || "this player"}
                                </span>
                                ’s property.
                            </div>
                            <input
                                type="number"
                                min={1}
                                className="w-full border rounded px-3 py-2"
                                placeholder="Amount"
                                value={offerAmount}
                                onChange={(e) =>
                                    setOfferAmount(e.target.value)
                                }
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
                                        (offerBusy
                                            ? "opacity-60 cursor-not-allowed"
                                            : "")
                                    }
                                    onClick={async () => {
                                        const amount = Number(
                                            offerAmount || 0
                                        );
                                        if (amount <= 0 || offerBusy) return;
                                        setOfferBusy(true);
                                        try {
                                            await createOffer({
                                                pinId: selectedPin.id,
                                                fromOwner: me,
                                                toOwner:
                                                    selectedPin.owner || "",
                                                amount,
                                            });
                                            setOfferSent(true);
                                            setTimeout(
                                                () => setOfferSent(false),
                                                1800
                                            );
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
