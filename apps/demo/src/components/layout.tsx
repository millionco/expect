import { Link, useLocation, Outlet } from "react-router-dom";

const NAV_ITEMS = [{ path: "/", label: "Sheet" }];

export const Layout = () => {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="border-b border-zinc-200 bg-emerald-700 sticky top-0 z-20">
        <div className="px-4 flex items-center h-14">
          <div className="flex items-center gap-2 mr-8">
            <svg
              className="size-7 text-white"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="3" y1="9" x2="21" y2="9" />
              <line x1="3" y1="15" x2="21" y2="15" />
              <line x1="9" y1="3" x2="9" y2="21" />
              <line x1="15" y1="3" x2="15" y2="21" />
            </svg>
            <span className="font-bold text-white text-lg tracking-tight">Sheets</span>
          </div>
          <nav className="flex gap-1">
            {NAV_ITEMS.map((item) => {
              const isActive =
                item.path === "/"
                  ? location.pathname === "/"
                  : location.pathname.startsWith(item.path);

              const className = isActive
                ? "px-4 py-1.5 text-sm font-medium rounded transition-colors no-underline bg-white/20 text-white"
                : "px-4 py-1.5 text-sm font-medium rounded transition-colors no-underline text-emerald-200 hover:text-white hover:bg-white/10";

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={className}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="flex-1 flex flex-col">
        <Outlet />
      </main>
    </div>
  );
};
