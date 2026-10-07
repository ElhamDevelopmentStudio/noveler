import { NavLink, Outlet } from "react-router-dom";
import { Zap, Layers, Server, Clock, LogIn, ExternalLink } from "lucide-react";

export function Layout() {
  const navLinkClasses = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
      isActive
        ? "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400 font-semibold"
        : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
    }`;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Top Navigation */}
      <header className="sticky top-0 z-40 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <NavLink
              to="/"
              className="flex items-center gap-2.5 font-bold text-lg tracking-tight"
            >
              <div className="h-9 w-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
                <Zap className="h-5 w-5" />
              </div>
              <span>Novelova</span>
            </NavLink>

            <nav className="hidden md:flex items-center gap-1.5">
              <NavLink to="/" className={navLinkClasses}>
                <Layers className="h-4 w-4" />
                Dashboard
              </NavLink>
              <NavLink to="/items" className={navLinkClasses}>
                <Server className="h-4 w-4" />
                Items Store
              </NavLink>
              <NavLink to="/scheduler" className={navLinkClasses}>
                <Clock className="h-4 w-4" />
                Scheduler & Jobs
              </NavLink>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="http://localhost:8000/api/v1/docs"
              target="_blank"
              rel="noreferrer"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              API Docs
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <NavLink
              to="/login"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm"
            >
              <LogIn className="h-3.5 w-3.5" />
              Sign In
            </NavLink>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 py-6 text-center text-xs text-slate-500 dark:text-slate-400">
        <p>
          Novelova Monorepo • React 19 + Tailwind v4 + FastAPI + PostgreSQL +
          APScheduler
        </p>
      </footer>
    </div>
  );
}

export default Layout;
