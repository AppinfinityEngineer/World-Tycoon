import axios from "../lib/api";
import { useState } from "react";

export default function Signup() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [msg, setMsg] = useState("");

    const onSubmit = async (e) => {
        e.preventDefault();
        setMsg("");

        try {
            const res = await axios.post("/auth/signup", { email, password });
            if (res.status === 201) {
                setMsg("Account created! You can now log in.");
            } else if (res.status === 202) {
                const { position } = res.data;
                setMsg(`You're on the waitlist! Position: ${position}`);
            } else {
                setMsg("Unexpected response.");
            }
        } catch (err) {
            const detail =
                err?.response?.data?.detail ||
                err?.response?.data?.message ||
                err.message;
            setMsg(`Signup failed: ${detail}`);
        }
    };

    return (
        <form onSubmit={onSubmit}>
            <h1>Sign up</h1>
            <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                type="email"
            />
            <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="password"
                type="password"
            />
            <button type="submit">Create account</button>
            {msg && <p>{msg}</p>}
        </form>
    );
}
