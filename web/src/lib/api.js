// src/lib/api.js
import axios from "axios";

// Keeps your current baseURL but allows override via .env
// Add VITE_API_URL=http://127.0.0.1:8000 (or prod URL) to your .env
const baseURL = import.meta.env?.VITE_API_URL ?? "http://127.0.0.1:8000";

const api = axios.create({
    baseURL,
    timeout: 15000,
    withCredentials: false, // we use Bearer tokens, not cookies
    headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
    },
});

// ✅ Preserve your Bearer token behavior
api.interceptors.request.use((config) => {
    const token = localStorage.getItem("wt_token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

// Optional: gentle 401 handler (keeps current flows; remove if not desired)
api.interceptors.response.use(
    (res) => res,
    (err) => {
        const status = err?.response?.status;
        if (status === 401) {
            try { localStorage.removeItem("wt_token"); } catch { }
            if (!location.pathname.startsWith("/login")) {
                location.assign("/login");
            }
        }
        return Promise.reject(err);
    }
);

export default api;
