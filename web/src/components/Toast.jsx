import { useEffect, useState } from "react";
export default function Toast({ msg, onDone }) {
    const [show, setShow] = useState(true);
    useEffect(() => { const t = setTimeout(() => { setShow(false); onDone?.(); }, 2500); return () => clearTimeout(t); }, []);
    if (!show) return null;
    return (
        <div className="fixed bottom-4 right-4 bg-black text-white px-3 py-2 rounded shadow">
            {msg}
        </div>
    );
}
