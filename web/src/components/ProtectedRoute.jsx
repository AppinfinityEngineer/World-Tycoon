import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../store/auth";

export default function ProtectedRoute({ children }) {
    const { token, user, me, loading } = useAuth();

    useEffect(() => {
        if (token && !user) me();
    }, [token, user, me]);

    if (!token) return <Navigate to="/login" replace />;

    if (loading && !user) return <div style={{ padding: 24 }}>Loading…</div>;

    return children;
}
