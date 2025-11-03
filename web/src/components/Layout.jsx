import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../store/auth";

export default function Layout() {
    const { user, logout } = useAuth();

    return (
        <div className="min-h-screen flex flex-col bg-gray-100 text-gray-800">
            <header className="sticky top-0 z-10 bg-blue-600 text-white px-4 py-3 shadow">
                <div className="max-w-6xl mx-auto flex items-center justify-between">
                    <div className="font-bold tracking-wide">World Tycoon</div>
                    <div className="text-sm">
                        <span className="opacity-90 mr-3">{user?.email}</span>
                        <button
                            onClick={logout}
                            className="bg-white text-blue-600 px-3 py-1 rounded shadow-sm"
                        >
                            Logout
                        </button>
                    </div>
                </div>
            </header>

            <main className="flex flex-1 max-w-6xl mx-auto w-full">
                <aside className="w-60 bg-white border-r p-4">
                    <nav className="space-y-1">
                        <NavLink
                            to="/"
                            end
                            className={({ isActive }) =>
                                `block px-3 py-2 rounded ${isActive ? "bg-blue-50 text-blue-700 font-medium" : "hover:bg-gray-50"}`
                            }
                        >🏠 Dashboard</NavLink>
                        <NavLink
                            to="/map"
                            className={({ isActive }) =>
                                `block px-3 py-2 rounded ${isActive ? "bg-blue-50 text-blue-700 font-medium" : "hover:bg-gray-50"}`
                            }
                        >🗺️ Map</NavLink>
                        <NavLink
                            to="/settings"
                            className={({ isActive }) =>
                                `block px-3 py-2 rounded ${isActive ? "bg-blue-50 text-blue-700 font-medium" : "hover:bg-gray-50"}`
                            }
                        >⚙️ Settings</NavLink>
                    </nav>
                </aside>

                <section className="flex-1 p-6">
                    <Outlet />
                </section>
            </main>
        </div>
    );
}
