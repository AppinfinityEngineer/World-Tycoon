import { useEffect, useState } from "react";

export default function Settings() {
    const [dark, setDark] = useState(() => localStorage.getItem("wt_dark") === "1");

    useEffect(() => {
        const root = document.documentElement;
        if (dark) { root.classList.add("dark"); localStorage.setItem("wt_dark", "1"); }
        else { root.classList.remove("dark"); localStorage.removeItem("wt_dark"); }
    }, [dark]);

    const submitPassword = (e) => {
        e.preventDefault();
        alert("Password change endpoint comes in a later phase.");
    };

    return (
        <div className="space-y-4">
            <div className="p-4 rounded-lg border bg-white dark:bg-gray-800 dark:text-gray-100">
                <div className="flex items-center justify-between">
                    <div>Dark Mode</div>
                    <label className="inline-flex items-center gap-2">
                        <input type="checkbox" checked={dark} onChange={e => setDark(e.target.checked)} />
                        <span className="text-sm text-gray-600 dark:text-gray-300">{dark ? "On" : "Off"}</span>
                    </label>
                </div>
            </div>

            <form onSubmit={submitPassword} className="p-4 rounded-lg border bg-white dark:bg-gray-800 dark:text-gray-100">
                <div className="font-medium mb-2">Change Password (stub)</div>
                <div className="grid sm:grid-cols-3 gap-2">
                    <input className="border rounded px-3 py-2" placeholder="Current password" type="password" />
                    <input className="border rounded px-3 py-2" placeholder="New password" type="password" />
                    <button className="px-3 py-2 rounded bg-gray-900 text-white">Update</button>
                </div>
            </form>
        </div>
    );
}
