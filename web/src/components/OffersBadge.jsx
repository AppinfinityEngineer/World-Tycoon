import { useEffect, useState } from "react";
import api from "../lib/api";
import { useAuth } from "../store/auth";

export default function OffersBadge() {
    const { user } = useAuth();
    const me = user?.email || "Me";
    const [n, setN] = useState(0);

    async function refresh() {
        try {
            const { data } = await api.get("/offers", { params: { owner: me } });
            setN((data || []).filter(o => o.status === "pending").length);
        } catch { }
    }

    useEffect(() => {
        let kill = false;
        (async () => { if (!kill) await refresh(); })();
        const id = setInterval(refresh, 10000);
        return () => { kill = true; clearInterval(id); };
    }, [me]);

    if (!n) return null;
    return (
        <span className="ml-2 inline-flex items-center justify-center text-xs px-1.5 h-5 rounded-full bg-indigo-600 text-white">
            {n}
        </span>
    );
}
