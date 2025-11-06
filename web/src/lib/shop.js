import api from "./api";

export async function fetchTypes() {
    const { data } = await api.get("/shop/types");
    return data?.items ?? [];
}

export async function buyPin({ pinId, type, level = 1 }) {
    const { data } = await api.post("/shop/buy", { pinId, type, level });
    return data;
}

export async function upgradePin({ pinId }) {
    const { data } = await api.post("/shop/upgrade", { pinId });
    return data;
}
