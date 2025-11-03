import { useState } from "react";
import { useAuth } from "../store/auth";
import { Link, useNavigate } from "react-router-dom";

export default function Login() {
    const { login, loading, error } = useAuth();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const nav = useNavigate();

    const onSubmit = async (e) => {
        e.preventDefault();
        try {
            await login(email, password);  // sets token + loads user
            nav("/");                      // go to dashboard only after success
        } catch {
            // error already set in store
        }
    };

    return (
        <form onSubmit={onSubmit} style={{ maxWidth: 360, margin: "48px auto" }}>
            <h2>Log in</h2>
            <input placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: "100%", margin: "8px 0" }} />
            <input placeholder="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ width: "100%", margin: "8px 0" }} />
            <button disabled={loading} style={{ width: "100%" }}>Log in</button>
            {error && <p style={{ color: "crimson" }}>{error}</p>}
            <p style={{ marginTop: 8 }}>No account? <Link to="/signup">Sign up</Link></p>
        </form>
    );
}
