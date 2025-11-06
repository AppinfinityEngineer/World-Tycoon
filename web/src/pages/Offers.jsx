// web/src/pages/Offers.jsx
import { useEffect, useMemo, useState } from "react";
import api from "../lib/api";
import { useAuth } from "../store/auth";

/* helpers */
function cls(...a) {
    return a.filter(Boolean).join(" ");
}
function useNow(ms = 10000) {
    const [t, setT] = useState(Date.now());
    useEffect(() => {
        const id = setInterval(() => setT(Date.now()), ms);
        return () => clearInterval(id);
    }, [ms]);
    return t;
}
function fmtExpires(expiresAt) {
    if (!expiresAt) return "—";
    const d = new Date(expiresAt);
    return d.toLocaleString();
}
function fmtWhen(createdAt) {
    if (!createdAt) return "—";
    return new Date(createdAt).toLocaleString();
}
function normaliseStatus(s) {
    if (!s) return "PENDING";
    const up = String(s).toUpperCase();
    if (up === "CANCELLED") return "CANCELED";
    return up;
}

function StatusChip({ s }) {
    const st = normaliseStatus(s);
    const map = {
        PENDING: "bg-amber-100 text-amber-800 border-amber-200",
        ACCEPTED: "bg-emerald-100 text-emerald-800 border-emerald-200",
        REJECTED: "bg-rose-100 text-rose-800 border-rose-200",
        CANCELED: "bg-gray-100 text-gray-700 border-gray-200",
        EXPIRED: "bg-gray-100 text-gray-500 border-gray-200",
    };
    const label = {
        PENDING: "Pending",
        ACCEPTED: "Accepted",
        REJECTED: "Rejected",
        CANCELED: "Cancelled",
        EXPIRED: "Expired",
    }[st] || st;
    return (
        <span
            className={cls(
                "px-2 py-0.5 rounded-md text-xs border",
                map[st] || "bg-gray-100 text-gray-700 border-gray-200"
            )}
        >
            {label}
        </span>
    );
}

export default function OffersPage() {
    const { user } = useAuth();
    const me = (user?.email || "").toLowerCase();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [banner, setBanner] = useState("");
    const [bannerTone, setBannerTone] = useState("ok");
    const pulse = useNow(10000);

    async function fetchOffers() {
        if (!me) return;
        try {
            const { data } = await api.get("/offers", { params: { owner: me } });
            const list = Array.isArray(data) ? data.slice() : [];
            list.sort((a, b) => (b.createdAt || b.t || 0) - (a.createdAt || a.t || 0));
            setItems(list);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        fetchOffers();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [me]);

    useEffect(() => {
        if (!loading) fetchOffers();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pulse, me]);

    function showBanner(msg, tone = "ok") {
        setBanner(msg);
        setBannerTone(tone);
        setTimeout(() => setBanner(""), 2200);
    }

    function updateOne(updated) {
        setItems((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
    }

    async function doAction(id, kind) {
        const o = items.find((x) => x.id === id);
        if (!o) return;
        const st = normaliseStatus(o.status);

        // optimistic state
        const optimistic = { ...o };
        if (kind === "accept") optimistic.status = "ACCEPTED";
        if (kind === "reject") optimistic.status = "REJECTED";
        if (kind === "cancel") optimistic.status = "CANCELED";
        updateOne(optimistic);

        try {
            const { data } = await api.post(`/offers/${id}/${kind}`);
            updateOne(data);
            if (kind === "accept") showBanner("Trade accepted ✅", "ok");
            if (kind === "reject") showBanner("Offer rejected", "ok");
            if (kind === "cancel") showBanner("Offer cancelled", "ok");
        } catch (err) {
            console.error(err);
            // rollback
            updateOne(o);
            const detail = err?.response?.data?.detail;
            if (detail) {
                showBanner(String(detail), "err");
            } else {
                showBanner("Action failed", "err");
            }
        }
    }

    const counts = useMemo(() => {
        const c = { PENDING: 0, ACCEPTED: 0, REJECTED: 0, CANCELED: 0, EXPIRED: 0 };
        for (const o of items) {
            const st = normaliseStatus(o.status);
            c[st] = (c[st] || 0) + 1;
        }
        return c;
    }, [items]);

    if (loading) {
        return (
            <div className="p-4 rounded-lg border bg-white text-sm text-gray-500">
                Loading offers…
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {banner && (
                <div
                    className={cls(
                        "p-3 rounded-lg border text-sm",
                        bannerTone === "ok"
                            ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                            : "bg-rose-50 text-rose-800 border-rose-200"
                    )}
                >
                    {banner}
                </div>
            )}

            <div className="p-4 rounded-lg border bg-white">
                <div className="flex items-center justify-between mb-3">
                    <div className="font-medium">Offers &amp; Trades</div>
                    <div className="text-xs text-gray-500">
                        pending {counts.PENDING} · accepted {counts.ACCEPTED} · rejected{" "}
                        {counts.REJECTED} · cancelled {counts.CANCELED} · expired{" "}
                        {counts.EXPIRED}
                    </div>
                </div>

                {items.length === 0 ? (
                    <div className="text-sm text-gray-500">
                        No offers yet. Make an offer from the map by selecting someone
                        else&apos;s pin.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-gray-500 border-b">
                                    <th className="py-2 pr-4">When</th>
                                    <th className="py-2 pr-4">Pin</th>
                                    <th className="py-2 pr-4">From → To</th>
                                    <th className="py-2 pr-4">Amount</th>
                                    <th className="py-2 pr-4">Expires</th>
                                    <th className="py-2 pr-4">Status</th>
                                    <th className="py-2 pr-4"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((o) => {
                                    const st = normaliseStatus(o.status);
                                    const isSender =
                                        (o.fromOwner || "").toLowerCase() === me;
                                    const isReceiver =
                                        (o.toOwner || "").toLowerCase() === me;

                                    const canAccept = st === "PENDING" && isReceiver;
                                    const canReject = st === "PENDING" && isReceiver;
                                    const canCancel = st === "PENDING" && isSender;

                                    return (
                                        <tr key={o.id} className="border-b">
                                            <td className="py-2 pr-4">
                                                {fmtWhen(o.createdAt || o.t)}
                                            </td>
                                            <td className="py-2 pr-4 truncate">
                                                {o.pinId?.slice(0, 8) || "—"}
                                            </td>
                                            <td className="py-2 pr-4">
                                                {o.fromOwner} → {o.toOwner}
                                            </td>
                                            <td className="py-2 pr-4">£{o.amount}</td>
                                            <td className="py-2 pr-4">
                                                {fmtExpires(o.expiresAt)}
                                            </td>
                                            <td className="py-2 pr-4">
                                                <StatusChip s={st} />
                                            </td>
                                            <td className="py-2 pr-4">
                                                <div className="flex gap-2">
                                                    {canAccept && (
                                                        <button
                                                            className="px-2 py-1 rounded border hover:bg-gray-50"
                                                            onClick={() => doAction(o.id, "accept")}
                                                        >
                                                            Accept
                                                        </button>
                                                    )}
                                                    {canReject && (
                                                        <button
                                                            className="px-2 py-1 rounded border hover:bg-gray-50"
                                                            onClick={() => doAction(o.id, "reject")}
                                                        >
                                                            Reject
                                                        </button>
                                                    )}
                                                    {canCancel && (
                                                        <button
                                                            className="px-2 py-1 rounded border hover:bg-gray-50"
                                                            onClick={() => doAction(o.id, "cancel")}
                                                        >
                                                            Cancel
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
