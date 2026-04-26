import { Link, Outlet } from "@tanstack/react-router";

export function RootLayout() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-4 shrink-0">
        <Link to="/" className="font-semibold text-lg text-gray-900 hover:text-indigo-600">
          AI Pipeline Board
        </Link>
      </header>
      <main className="flex-1 flex flex-col">
        <Outlet />
      </main>
    </div>
  );
}
