import { useEffect, useState } from "react";
import api from "../lib/api";

const DM_KEY = "wt_dark";

export default function Settings() {
    const [dark, setDark] = useState(false);
    const [pw1, setPw1] = useState("");
    const [pw2, setPw2] = useState("");
    const [msg, setMsg] = useState("");

    useEffect(() => {
        const v = localStorage.getItem(DM_KEY) === "1";
        setDark(v);
        document.documentElement.classList.toggle("dark", v);
    }, []);

    const toggleDark = () => {
        const v = !dark;
        setDark(v);
        localStorage.setItem(DM_KEY, v ? "1" : "0");
        document.documentElement.classList.toggle("dark", v);
    };

    const changePassword = async () => {
        if (!pw1 || pw1 !== pw2) { setMsg("Passwords do not match"); return; }
        // stub: pretend success
        try {
            // await api.post("/auth/change-password", { new_password: pw1 }) // future
            setMsg("Password change submitted (stub).");
            setPw1(""); setPw2("");
        } catch {
            setMsg("Failed (stub).");
        }
    };

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-semibold">Settings</h2>

            <div className="bg-white rounded-lg p-4 shadow space-y-3">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="font-medium">Dark Mode</div>
                        <div className="text-sm text-gray-500">Persisted to localStorage</div>
                    </div>
                    <button onClick={toggleDark} className="bg-gray-800 text-white px-3 py-1 rounded">
                        {dark ? "Disable" : "Enable"}
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-lg p-4 shadow space-y-3">
                <div className="font-medium">Change password (stub)</div>
                <input
                    type="password"
                    value={pw1}
                    onChange={(e) => setPw1(e.target.value)}
                    placeholder="New password"
                    className="border rounded px-3 py-2 w-full"
                />
                <input
                    type="password"
                    value={pw2}
                    onChange={(e) => setPw2(e.target.value)}
                    placeholder="Confirm new password"
                    className="border rounded px-3 py-2 w-full"
                />
                <button onClick={changePassword} className="bg-blue-600 text-white px-3 py-1 rounded">
                    Save
                </button>
                {!!msg && <div className="text-sm text-gray-600">{msg}</div>}
            </div>
        </div>
    );
}
