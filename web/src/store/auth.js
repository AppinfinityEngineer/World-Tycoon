import { create } from "zustand";
import api from "../lib/api";

export const useAuth = create((set, get) => ({
    user: null,
    token: localStorage.getItem("wt_token") || null,   // <-- unified key
    loading: false,
    error: null,

    me: async () => {
        const { data } = await api.get("/auth/me");
        set({ user: data, error: null });
        return data;
    },

    login: async (email, password) => {
        set({ loading: true, error: null });
        try {
            const { data } = await api.post("/auth/login", { email, password });
            localStorage.setItem("wt_token", data.access_token);    // <-- unified key
            set({ token: data.access_token });
            await get().me();                                       // fetch user now
        } catch (e) {
            set({ error: e?.response?.data?.detail || "Login failed" });
            throw e;
        } finally {
            set({ loading: false });
        }
    },

    logout: () => {
        localStorage.removeItem("wt_token");
        set({ user: null, token: null });
    },
}));
