import { useAuth } from "../store/auth";

export default function Dashboard() {
    const { user, logout } = useAuth();
    return (
        <div className="min-h-screen flex flex-col bg-gray-100 text-gray-800">
            <header className="bg-blue-600 text-white p-4 flex justify-between items-center">
                <h1 className="font-bold">World Tycoon</h1>
                <div>
                    <span className="mr-4">Welcome {user?.email} (id: {user?.id})</span>
                    <button onClick={logout} className="bg-white text-blue-600 px-3 py-1 rounded">Logout</button>
                </div>
            </header>
            <main className="flex flex-1">
                <aside className="w-60 bg-white border-r p-4">
                    <ul className="space-y-2">
                        <li>🏠 Dashboard</li>
                        <li>🗺️ Map</li>
                        <li>⚙️ Settings</li>
                    </ul>
                </aside>
                <section className="flex-1 p-6">
                    <h2 className="text-2xl font-semibold mb-4">Dashboard Overview</h2>
                    <div className="border border-dashed border-gray-400 p-8 text-center">Map/UI goes here</div>
                </section>
            </main>
        </div>
    );
}
