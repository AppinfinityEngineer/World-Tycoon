// web/src/pages/Settings.jsx
import { useEffect, useState } from "react";
import api from "../lib/api";

function toInputLocal(ms) {
    if (!ms) return "";
    const d = new Date(ms);
    const pad = (n) => String(n).padStart(2, "0");
    const yyyy = d.getFullYear();
    const MM = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const mm = pad(d.getMinutes());
    return `${yyyy}-${MM}-${dd}T${hh}:${mm}`;
}
function fromInputLocal(v) {
    if (!v) return 0;
    const ms = Date.parse(v);
    return isNaN(ms) ? 0 : ms;
}

export default function Settings() {
    const [seasonStart, setSeasonStart] = useState("");
    const [seasonEnd, setSeasonEnd] = useState("");
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState("");

    async function load() {
        const { data } = await api.get("/settings/season");
        setSeasonStart(toInputLocal(data.seasonStart));
        setSeasonEnd(toInputLocal(data.seasonEnd));
    }
    useEffect(() => { load(); }, []);

    async function save() {
        setSaving(true); setMsg("");
        try {
            const startMs = fromInputLocal(seasonStart);
            const endMs = fromInputLocal(seasonEnd);
            if (!startMs || !endMs || startMs >= endMs) {
                setMsg("Start must be before end.");
                return;
            }
            await api.put("/settings/season", { seasonStart: startMs, seasonEnd: endMs });
            setMsg("Saved.");
        } catch (e) {
            setMsg("Save failed.");
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="p-4 space-y-6">
            <div className="p-4 rounded-lg border bg-white">
                <div className="font-medium mb-3">Season Window</div>
                <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                        <div className="text-sm text-gray-600 mb-1">Season Start</div>
                        <input type="datetime-local"
                            className="w-full border rounded px-3 py-2"
                            value={seasonStart}
                            onChange={(e) => setSeasonStart(e.target.value)} />
                    </label>
                    <label className="block">
                        <div className="text-sm text-gray-600 mb-1">Season End</div>
                        <input type="datetime-local"
                            className="w-full border rounded px-3 py-2"
                            value={seasonEnd}
                            onChange={(e) => setSeasonEnd(e.target.value)} />
                    </label>
                </div>
                <div className="mt-3 flex items-center gap-2">
                    <button className="px-3 py-2 rounded-lg border" disabled={saving} onClick={save}>
                        {saving ? "Saving…" : "Save"}
                    </button>
                    {msg && <div className="text-sm text-gray-500">{msg}</div>}
                </div>
            </div>
        </div>
    );
}
