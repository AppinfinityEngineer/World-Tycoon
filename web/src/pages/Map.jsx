import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const LS_KEY = "wt_map_view"; // { center:[lat,lng], zoom }

export default function MapPage() {
    const mapRef = useRef(null);      // Leaflet map instance
    const mapDivRef = useRef(null);   // DOM node for map
    const [marker, setMarker] = useState(null);

    useEffect(() => {
        if (!mapDivRef.current || mapRef.current) return; // already inited

        const saved = (() => {
            try { return JSON.parse(localStorage.getItem(LS_KEY) || ""); }
            catch { return null; }
        })() || { center: [51.5, -0.1], zoom: 6 };

        const m = L.map(mapDivRef.current, { zoomControl: true })
            .setView(saved.center, saved.zoom);

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution: "&copy; OpenStreetMap contributors",
        }).addTo(m);

        m.on("moveend", () => {
            const c = m.getCenter();
            localStorage.setItem(LS_KEY, JSON.stringify({
                center: [c.lat, c.lng],
                zoom: m.getZoom(),
            }));
        });

        // ensure correct size after initial layout
        m.whenReady(() => {
            requestAnimationFrame(() => m.invalidateSize());
        });

        mapRef.current = m;
        return () => { m.remove(); mapRef.current = null; };
    }, []);

    const addPin = () => {
        const m = mapRef.current;
        if (!m) return;
        const c = m.getCenter();
        if (marker) { marker.setLatLng(c); return; }
        const mk = L.marker(c).addTo(m);
        setMarker(mk);
    };

    return (
        <div className="content" style={{ height: "100%" }}>
            <div style={{ padding: 8 }}>
                <button onClick={addPin}>Add pin</button>
            </div>
            <div
                id="map"
                ref={mapDivRef}
                style={{
                    height: "calc(100vh - 56px)", // adjust to your topbar height
                    width: "100%",
                    minHeight: 420
                }}
            />
        </div>
    );
}
