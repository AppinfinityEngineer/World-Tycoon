import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { useEffect, useMemo, useState } from "react";

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

function ClickToAdd({ colorIdx, onAdd }) {
    useMapEvents({
        click(e) {
            const c = COLORS[colorIdx % COLORS.length];
            onAdd({ lat: e.latlng.lat, lng: e.latlng.lng, color: c });
        },
    });
    return null;
}

export default function MapPage() {
    const [pins, setPins] = useState(() => {
        try { return JSON.parse(localStorage.getItem("wt_pins") || "[]"); }
        catch { return []; }
    });
    const [colorIdx, setColorIdx] = useState(0);

    useEffect(() => {
        localStorage.setItem("wt_pins", JSON.stringify(pins));
    }, [pins]);

    function downloadPins(list) {
        const blob = new Blob([JSON.stringify(list, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = "world-tycoon-pins.json"; a.click();
        URL.revokeObjectURL(url);
    }

    function uploadPins(e) {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const data = JSON.parse(reader.result);
                if (Array.isArray(data)) setPins(data);
            } catch { }
        };
        reader.readAsText(file);
        e.target.value = "";
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
                <button className="px-3 py-2 rounded-lg border" onClick={() => setPins([])}>
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
                <ClickToAdd colorIdx={colorIdx} onAdd={(p) => setPins((prev) => [...prev, p])} />
                {pins.map((p, i) => (
                    <Marker key={i} position={[p.lat, p.lng]} icon={squareIcon(p.color)} />
                ))}
            </MapContainer>
        </div>
    );
}
