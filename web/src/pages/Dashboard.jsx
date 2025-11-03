import { useEffect } from "react";
import { useAuth } from "../store/auth";
import { useNavigate } from "react-router-dom";

export default function Dashboard() {
    const { user, token, me, logout } = useAuth();
    const nav = useNavigate();

    useEffect(() => {
        if (!token) return nav("/login");
        me();
    }, [token]);

    return (
        <div style={{ maxWidth: 620, margin: "48px auto" }}>
            <h2>Dashboard</h2>
            {user ? (
                <>
                    <p>Welcome <b>{user.email}</b> (id: {user.id})</p>
                    <button onClick={logout}>Logout</button>
                </>
            ) : <p>Loading…</p>}
        </div>
    );
}
