import { useEffect, useRef, useState } from "react";
import L from "leaflet";

const LS_KEY = "wt_map_view";

export default function MapPage() {
    const ref = useRef(null);
    const [map, setMap] = useState(null);
    const [pins, setPins] = useState([]);

    useEffect(() => {
        if (map) return;
        const root = ref.current;
        const saved = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
        const m = L.map(root).setView(saved.center || [51.5, -0.1], saved.zoom || 6);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "© OpenStreetMap",
            maxZoom: 19
        }).addTo(m);
        m.on("moveend zoomend", () => {
            localStorage.setItem(LS_KEY, JSON.stringify({ center: m.getCenter(), zoom: m.getZoom() }));
        });
        setMap(m);
    }, [map]);

    useEffect(() => {
        return () => { map?.remove(); };
    }, [map]);

    const addPin = () => {
        if (!map) return;
        const c = map.getCenter();
        const marker = L.circleMarker([c.lat, c.lng], { radius: 8, weight: 2, fillOpacity: 0.6 });
        marker.addTo(map);
        setPins(p => [...p, marker]);
    };

    const centerUK = () => map?.setView([51.5, -0.1], 6);
    const clearPins = () => { pins.forEach(p => p.remove()); setPins([]); };

    return (
        <div className="space-y-3">
            <div className="flex gap-2">
                <button onClick={centerUK} className="px-3 py-1.5 rounded bg-gray-200">Center UK</button>
                <button onClick={addPin} className="px-3 py-1.5 rounded bg-indigo-600 text-white">Add Pin</button>
                <button onClick={clearPins} className="px-3 py-1.5 rounded bg-gray-200">Clear Pins</button>
            </div>
            <div ref={ref} className="h-[70vh] rounded-lg border overflow-hidden" />
        </div>
    );
}
