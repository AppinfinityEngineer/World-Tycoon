import { create } from "zustand";
import axios from "axios";

export const api = axios.create({
    baseURL: "http://localhost:8000",
});

// Optional: auto-attach token for all requests
api.interceptors.request.use((config) => {
    const t = localStorage.getItem("wt_token");
    if (t) config.headers.Authorization = `Bearer ${t}`;
    return config;
});

export const useAuth = create((set, get) => ({
    token: localStorage.getItem("wt_token") || null,
    user: null,
    loading: false,
    error: null,

    me: async () => {
        try {
            set({ loading: true, error: null });
            const { data } = await api.get("/auth/me"); // token added by interceptor
            set({ user: data, loading: false, error: null });
            return data;
        } catch (e) {
            set({ user: null, token: null, loading: false, error: e?.response?.data?.detail || "Unauthorized" });
            localStorage.removeItem("wt_token");
            throw e;
        }
    },

    login: async (email, password) => {
        set({ loading: true, error: null });
        try {
            const { data } = await api.post("/auth/login", { email, password });
            localStorage.setItem("wt_token", data.access_token);
            set({ token: data.access_token });
            await get().me();
        } catch (e) {
            set({ loading: false, error: e?.response?.data?.detail || "Login failed" });
            throw e;
        } finally {
            set({ loading: false });
        }
    },

    signup: async (email, password) => {
        set({ loading: true, error: null });
        try {
            const res = await api.post("/auth/signup", { email, password });
            if (res.status === 201) {
                localStorage.setItem("wt_token", res.data.access_token);
                set({ token: res.data.access_token });
                await get().me();
                return { status: 201 };
            }
            // 202 Accepted → waitlist
            return { status: 202, ...res.data };
        } catch (e) {
            set({ error: e?.response?.data?.detail || "Signup failed" });
            throw e;
        } finally {
            set({ loading: false });
        }
    },

    logout: () => {
        localStorage.removeItem("wt_token");
        set({ token: null, user: null });
    },
}));
