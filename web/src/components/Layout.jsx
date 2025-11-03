import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../store/auth";

export default function Layout() {
    const { user, logout } = useAuth();
    return (
        <div className="min-h-screen flex bg-gray-50 text-gray-900">
            <aside className="w-56 border-r bg-white">
                <div className="px-4 py-4 font-bold">World Tycoon</div>
                <nav className="px-2 flex flex-col gap-1">
                    {[
                        { to: "/", label: "Dashboard", icon: "🏠" },
                        { to: "/map", label: "Map", icon: "🗺️" },
                        { to: "/settings", label: "Settings", icon: "⚙️" },
                    ].map(x => (
                        <NavLink key={x.to}
                            to={x.to}
                            className={({ isActive }) =>
                                "px-3 py-2 rounded-md flex items-center gap-2 " +
                                (isActive ? "bg-indigo-100 text-indigo-700" : "hover:bg-gray-100")
                            }>
                            <span>{x.icon}</span>{x.label}
                        </NavLink>
                    ))}
                </nav>
            </aside>

            <main className="flex-1">
                <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b">
                    <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
                        <div className="font-medium">Dashboard</div>
                        <div className="flex items-center gap-3">
                            <span className="text-sm text-gray-600">{user?.email}</span>
                            <button onClick={logout} className="text-sm px-3 py-1.5 rounded bg-gray-900 text-white">
                                Logout
                            </button>
                        </div>
                    </div>
                </header>
                <div className="max-w-6xl mx-auto p-4">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}
