import { NavLink, useNavigate } from "react-router-dom";
import { RiSearchLine, RiCloseLine } from "@remixicon/react";
import { BrandLogo } from "@/components/brand-logo";

interface ProjectsHeaderProps {
  viewMode: "card" | "table";
  onViewModeChange: (mode: "card" | "table") => void;
  search: string;
  onSearchChange: (query: string) => void;
}

export function ProjectsHeader({
  viewMode,
  onViewModeChange,
  search,
  onSearchChange,
}: ProjectsHeaderProps) {
  const navigate = useNavigate();

  return (
    <header className="h-16 border-b border-neutral-200 bg-white sticky top-0 z-30">
      <div className="w-full h-full px-6 flex items-center justify-between">
        {/* Left: Brand Logo & Section Title */}
        <div className="flex items-center gap-3 select-none">
          <NavLink
            to="/projects"
            className="flex items-center text-neutral-900 hover:opacity-80 transition-opacity"
          >
            <BrandLogo className="h-7 w-7 text-neutral-900" />
          </NavLink>
          <div className="h-4.5 w-[1px] bg-neutral-200" />
          <NavLink
            to="/projects"
            className="text-sm font-semibold text-neutral-900 hover:text-neutral-700 transition-colors"
          >
            Projects
          </NavLink>
        </div>

        {/* Right: Search, View Switcher, New project button */}
        <div className="flex items-center gap-3">
          {/* Search Input */}
          <div className="relative w-64 sm:w-72">
            <RiSearchLine className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search projects"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-9 pr-8 py-1.5 text-sm rounded-lg border border-neutral-200 bg-white placeholder:text-neutral-400 text-neutral-900 focus:outline-hidden focus:border-neutral-900 shadow-2xs transition-colors"
            />
            {search && (
              <button
                type="button"
                onClick={() => onSearchChange("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 p-0.5 rounded-full cursor-pointer transition-colors"
                title="Clear search"
              >
                <RiCloseLine className="h-3.5 w-3.5" />
              </button>
            )}
          </div>


          {/* View Mode Toggle: Card vs Table */}
          <div className="flex items-center rounded-lg border border-neutral-200 bg-neutral-50/70 p-0.5 shadow-2xs">
            {/* Card View Button */}
            <button
              type="button"
              onClick={() => onViewModeChange("card")}
              title="Card view"
              className={`p-1.5 rounded-md transition-all cursor-pointer ${
                viewMode === "card"
                  ? "bg-white text-neutral-900 shadow-2xs border border-neutral-200/80"
                  : "text-neutral-400 hover:text-neutral-700 border border-transparent"
              }`}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
              >
                <rect x="2" y="2" width="5" height="5" rx="1" fill="currentColor" />
                <rect x="9" y="2" width="5" height="5" rx="1" fill="currentColor" />
                <rect x="2" y="9" width="5" height="5" rx="1" fill="currentColor" />
                <rect x="9" y="9" width="5" height="5" rx="1" fill="currentColor" />
              </svg>
            </button>

            {/* Table View Button */}
            <button
              type="button"
              onClick={() => onViewModeChange("table")}
              title="Table view"
              className={`p-1.5 rounded-md transition-all cursor-pointer ${
                viewMode === "table"
                  ? "bg-white text-neutral-900 shadow-2xs border border-neutral-200/80"
                  : "text-neutral-400 hover:text-neutral-700 border border-transparent"
              }`}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
              >
                <rect x="2" y="3" width="12" height="2" rx="0.5" fill="currentColor" />
                <rect x="2" y="7" width="12" height="2" rx="0.5" fill="currentColor" />
                <rect x="2" y="11" width="12" height="2" rx="0.5" fill="currentColor" />
              </svg>
            </button>
          </div>

          {/* New Project Button */}
          <button
            type="button"
            onClick={() => navigate("/projects/new")}
            className="flex items-center justify-center px-4 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white font-medium text-sm transition-colors shadow-2xs cursor-pointer"
          >
            New project
          </button>
        </div>
      </div>
    </header>
  );
}
