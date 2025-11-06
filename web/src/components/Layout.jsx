// web/src/components/Layout.jsx
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../store/auth";
import api from "../lib/api";

function cls(...xs) {
    return xs.filter(Boolean).join(" ");
}

/**
 * Polls /offers for pending offers for the logged-in user.
 * Uses v2 API: GET /offers?owner={me}&status=PENDING
 */
function OffersNavBadge() {
    const { user } = useAuth();
    const me = (user?.email || "").toLowerCase();
    const [count, setCount] = useState(0);

    useEffect(() => {
        if (!me) {
            setCount(0);
            return;
        }

        let ignore = false;

        async function load() {
            try {
                const { data } = await api.get("/offers", {
                    params: { owner: me, status: "PENDING" },
                });
                if (ignore) return;
                const list = Array.isArray(data) ? data : [];
                setCount(list.length);
            } catch {
                if (!ignore) setCount(0);
            }
        }

        load();
        const id = setInterval(load, 15000); // light poll

        return () => {
            ignore = true;
            clearInterval(id);
        };
    }, [me]);

    if (!count) return null;

    // small pill badge
    return (
        <span className="ml-1 inline-flex items-center justify-center px-1.5 min-w-[16px] h-4 rounded-full text-[10px] font-semibold bg-rose-500 text-white">
            {count > 9 ? "9+" : count}
        </span>
    );
}

export default function Layout() {
    const { user, logout } = useAuth();
    const location = useLocation();

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900">
            {/* Top bar */}
            <header className="border-b bg-white">
                <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-xs font-bold">
                            WT
                        </div>
                        <div>
                            <div className="text-sm font-semibold tracking-tight">
                                World Tycoon
                            </div>
                            <div className="text-[10px] text-slate-500">
                                Phase 1 • Internal build
                            </div>
                        </div>
                    </div>

                    <nav className="hidden sm:flex items-center gap-4 text-sm">
                        <NavLink
                            to="/"
                            end
                            className={({ isActive }) =>
                                cls(
                                    "px-2 py-1.5 rounded-md",
                                    isActive
                                        ? "text-indigo-600 font-semibold"
                                        : "text-slate-600 hover:text-slate-900"
                                )
                            }
                        >
                            Dashboard
                        </NavLink>
                        <NavLink
                            to="/map"
                            className={({ isActive }) =>
                                cls(
                                    "px-2 py-1.5 rounded-md",
                                    isActive
                                        ? "text-indigo-600 font-semibold"
                                        : "text-slate-600 hover:text-slate-900"
                                )
                            }
                        >
                            Map
                        </NavLink>
                        <NavLink
                            to="/offers"
                            className={({ isActive }) =>
                                cls(
                                    "px-2 py-1.5 rounded-md flex items-center",
                                    isActive
                                        ? "text-indigo-600 font-semibold"
                                        : "text-slate-600 hover:text-slate-900"
                                )
                            }
                        >
                            Offers
                            <OffersNavBadge />
                        </NavLink>
                        <NavLink
                            to="/settings"
                            className={({ isActive }) =>
                                cls(
                                    "px-2 py-1.5 rounded-md",
                                    isActive
                                        ? "text-indigo-600 font-semibold"
                                        : "text-slate-600 hover:text-slate-900"
                                )
                            }
                        >
                            Settings
                        </NavLink>
                    </nav>

                    <div className="flex items-center gap-3 text-xs">
                        {user && (
                            <div className="hidden sm:flex flex-col text-right">
                                <span className="font-medium truncate max-w-[160px]">
                                    {user.email}
                                </span>
                                <span className="text-[10px] text-slate-500">
                                    Signed in
                                </span>
                            </div>
                        )}
                        <button
                            onClick={logout}
                            className="px-2 py-1.5 rounded-md border text-xs text-slate-700 hover:bg-slate-50"
                        >
                            Logout
                        </button>
                    </div>
                </div>

                {/* mobile nav */}
                <div className="sm:hidden border-t bg-white">
                    <div className="mx-auto max-w-6xl px-2 py-1 flex items-center justify-between text-[11px]">
                        <NavLink
                            to="/"
                            end
                            className={({ isActive }) =>
                                cls(
                                    "px-2 py-1 rounded",
                                    isActive
                                        ? "text-indigo-600 font-semibold"
                                        : "text-slate-600"
                                )
                            }
                        >
                            Dash
                        </NavLink>
                        <NavLink
                            to="/map"
                            className={({ isActive }) =>
                                cls(
                                    "px-2 py-1 rounded",
                                    isActive
                                        ? "text-indigo-600 font-semibold"
                                        : "text-slate-600"
                                )
                            }
                        >
                            Map
                        </NavLink>
                        <NavLink
                            to="/offers"
                            className={({ isActive }) =>
                                cls(
                                    "px-2 py-1 rounded flex items-center",
                                    isActive
                                        ? "text-indigo-600 font-semibold"
                                        : "text-slate-600"
                                )
                            }
                        >
                            Offers
                            <OffersNavBadge />
                        </NavLink>
                        <NavLink
                            to="/settings"
                            className={({ isActive }) =>
                                cls(
                                    "px-2 py-1 rounded",
                                    isActive
                                        ? "text-indigo-600 font-semibold"
                                        : "text-slate-600"
                                )
                            }
                        >
                            Settings
                        </NavLink>
                    </div>
                </div>
            </header>

            {/* Content */}
            <main className="mx-auto max-w-6xl px-4 py-4">
                <Outlet key={location.pathname} />
            </main>
        </div>
    );
}
