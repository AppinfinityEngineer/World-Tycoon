import api from "../lib/api";

export async function listMyOffers() {
    const res = await api.get("/offers", { params: { mine: 1 } });
    return res.data; // server may return flat list or split
}

export async function listOffersForOwner(owner) {
    const res = await api.get("/offers", { params: { owner } });
    return res.data;
}

export async function createOffer(toOwner, pinId, amount) {
    const res = await api.post("/offers", { toOwner, pinId, amount });
    return res.data;
}

export async function actOnOffer(id, action) {
    const res = await api.patch(`/offers/${id}`, { action });
    return res.data;
}
