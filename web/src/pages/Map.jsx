// src/pages/Map.jsx
import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { useEffect, useMemo, useState } from "react";
import api from "../lib/api";
import { createPortal } from "react-dom";

function squareIcon(color = "#22c55e") {
    return L.divIcon({
        className: "wt-square-icon",
        html: `<div style="
      width:16px;height:16px;border-radius:4px;background:${color};
      box-shadow:0 1px 2px rgba(0,0,0,.25);border:1px solid rgba(0,0,0,.2);
    "></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
    });
}

const COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444"];

function Modal({ children, onClose }) {
    // portal ensures we're above everything (Leaflet panes, headers, etc.)
    return createPortal(
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose?.();
            }}
            onKeyDown={(e) => e.key === "Escape" && onClose?.()}
            role="dialog"
            aria-modal="true"
        >
            {/* backdrop */}
            <div className="absolute inset-0 bg-black/40" />
            {/* dialog */}
            <div className="relative w-full max-w-md bg-white rounded-xl border shadow-lg p-4 space-y-3">
                {children}
            </div>
        </div>,
        document.body
    );
}

export default function MapPage() {
    const [pins, setPins] = useState([]);
    const [colorIdx, setColorIdx] = useState(0);
    const [loading, setLoading] = useState(true);

    // edit state: { id,type,owner,level,color,lat,lng,createdAt }
    const [editing, setEditing] = useState(null);

    // ---- server sync ----
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
        } catch (e) {
            console.error("clearPins failed", e);
        }
    }

    async function deletePin(id) {
        try {
            await api.delete(`/pins/${id}`);
            setPins((prev) => prev.filter((p) => p.id !== id));
            if (editing?.id === id) setEditing(null);
        } catch (e) {
            console.error("deletePin failed", e);
        }
    }

    async function saveEdit() {
        if (!editing?.id) return;
        const { id, type, owner, level, color } = editing;
        try {
            const { data } = await api.patch(`/pins/${id}`, {
                type: type ?? "",
                owner: owner ?? "",
                level: typeof level === "number" ? level : 1,
                color: color ?? COLORS[0],
            });
            setPins((prev) => prev.map((x) => (x.id === id ? data : x)));
            setEditing(null);
        } catch (e) {
            console.error("saveEdit failed", e);
        }
    }

    useEffect(() => {
        fetchPins();
    }, []);

    // click-to-add using server
    function ClickToAdd({ colorIdx }) {
        useMapEvents({
            click(e) {
                const c = COLORS[colorIdx % COLORS.length];
                addPin(e.latlng.lat, e.latlng.lng, c);
            },
        });
        return null;
    }

    // ---- dev helpers: save/load JSON ----
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

            // Replace server state with uploaded layout
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
                <button className="px-3 py-2 rounded-lg border" onClick={() => downloadPins(pins)}>
                    Save Layout
                </button>
                <label className="px-3 py-2 rounded-lg border cursor-pointer">
                    Load Layout
                    <input type="file" accept="application/json" className="hidden" onChange={uploadPins} />
                </label>
            </div>

            <MapContainer
                center={centerUK}
                zoom={12}
                style={{ height: 560, width: "100%" }}
                className="rounded-xl border"
            >
                <TileLayer
                    attribution="&copy; OpenStreetMap"
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {!loading && <ClickToAdd colorIdx={colorIdx} />}

                {pins.map((p) => (
                    <Marker
                        key={p.id ?? `${p.lat},${p.lng}`}
                        position={[p.lat, p.lng]}
                        icon={squareIcon(p.color)}
                        eventHandlers={{
                            click: () => setEditing({ ...p }),            // open edit
                            contextmenu: () => p.id && deletePin(p.id),   // right-click delete
                        }}
                    />
                ))}
            </MapContainer>

            {/* Edit modal */}
            {editing && (
                <Modal onClose={() => setEditing(null)}>
                    <div className="font-medium">Edit Pin</div>

                    <input
                        className="w-full border rounded px-3 py-2"
                        placeholder="Type (e.g., Data Center)"
                        value={editing.type ?? ""}
                        onChange={(e) => setEditing((s) => ({ ...s, type: e.target.value }))}
                    />
                    <input
                        className="w-full border rounded px-3 py-2"
                        placeholder="Owner"
                        value={editing.owner ?? ""}
                        onChange={(e) => setEditing((s) => ({ ...s, owner: e.target.value }))}
                    />

                    <div className="flex gap-2">
                        <input
                            type="number"
                            className="flex-1 border rounded px-3 py-2"
                            placeholder="Level"
                            value={Number.isFinite(editing.level) ? editing.level : 1}
                            onChange={(e) =>
                                setEditing((s) => ({ ...s, level: Number(e.target.value || 1) }))
                            }
                        />
                        <input
                            className="flex-1 border rounded px-3 py-2"
                            placeholder="#hex color"
                            value={editing.color ?? "#22c55e"}
                            onChange={(e) => setEditing((s) => ({ ...s, color: e.target.value }))}
                        />
                    </div>

                    <div className="flex justify-end gap-2">
                        <button className="px-3 py-2 border rounded" onClick={() => setEditing(null)}>
                            Cancel
                        </button>
                        <button
                            className="px-3 py-2 border rounded bg-indigo-600 text-white"
                            onClick={saveEdit}
                        >
                            Save
                        </button>
                    </div>
                </Modal>
            )}
        </div>
    );
}
