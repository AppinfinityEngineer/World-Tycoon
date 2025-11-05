import api from "./api";

export async function getRecentTrades(limit = 10) {
    const { data } = await api.get("/events", { params: { offset: 0, limit } });
    const items = Array.isArray(data) ? data : [];
    return items.filter(e => (e?.type || "").startsWith("Trade Accepted"));
}
