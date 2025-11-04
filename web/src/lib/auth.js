import api from "../lib/api";

export async function fetchMe() {
    const res = await api.get("/auth/me");
    return res.data; // { sub, email, is_admin }
}
