import api from "./api";

export async function getEconomyHealth() {
    const { data } = await api.get("/economy/health");
    return data;
}
