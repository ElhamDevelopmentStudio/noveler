import { NavLink, useNavigate } from "react-router-dom";
import {
  RiSearchLine,
  RiCloseLine,
  RiFileZipLine,
  RiDownload2Line,
} from "@remixicon/react";
import { BrandLogo } from "@/components/brand-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { NavbarUserMenu } from "@/components/navbar-user-menu";

interface ProjectsHeaderProps {
  viewMode: "card" | "table";
  onViewModeChange: (mode: "card" | "table") => void;
  search: string;
  onSearchChange: (query: string) => void;
  onOpenImportModal?: () => void;
  onOpenExportTaggedModal?: () => void;
}

export function ProjectsHeader({
  viewMode,
  onViewModeChange,
  search,
  onSearchChange,
  onOpenImportModal,
  onOpenExportTaggedModal,
}: ProjectsHeaderProps) {
  const navigate = useNavigate();

  return (
    <header className="h-14 border-b border-border/80 bg-white dark:bg-[#0c0a09] sticky top-0 z-30 transition-colors">
      <div className="w-full h-full px-4 sm:px-6 flex items-center justify-between gap-3">
        {/* Left: Brand Logo & Section Title */}
        <div className="flex items-center gap-2.5 select-none shrink-0">
          <NavLink
            to="/projects"
            className="flex items-center text-neutral-950 dark:text-neutral-100 hover:opacity-80 transition-opacity"
            title="Novelova Studio"
          >
            <BrandLogo className="h-6 w-6 text-neutral-950 dark:text-neutral-100" />
          </NavLink>
          <div className="h-4 w-[1px] bg-border hidden sm:block" />
          <NavLink
            to="/projects"
            className="text-sm font-medium tracking-tight text-foreground hover:text-muted-foreground transition-colors hidden sm:block"
          >
            Studio
          </NavLink>
        </div>

        {/* Right: Search, View Switcher, Actions, User */}
        <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
          {/* Search Input */}
          <div className="relative w-36 sm:w-56 lg:w-72">
            <RiSearchLine className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Search projects..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-8 pr-7 py-1.5 text-xs sm:text-sm rounded-lg border border-border bg-white dark:bg-neutral-950 placeholder:text-muted-foreground text-foreground focus:outline-hidden focus:border-neutral-950 dark:focus:border-white transition-colors"
            />
            {search && (
              <button
                type="button"
                onClick={() => onSearchChange("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 rounded-full cursor-pointer transition-colors"
                title="Clear search"
              >
                <RiCloseLine className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* View Mode Toggle: Card vs Table */}
          <div className="flex items-center rounded-lg border border-border bg-neutral-50/80 dark:bg-neutral-950 p-0.5 shrink-0">
            <button
              type="button"
              onClick={() => onViewModeChange("card")}
              title="Grid view"
              className={`p-1.5 rounded-md transition-colors duration-150 cursor-pointer ${
                viewMode === "card"
                  ? "bg-white dark:bg-neutral-800 text-neutral-950 dark:text-white shadow-2xs"
                  : "text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
              }`}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5">
                <rect x="2" y="2" width="5" height="5" rx="1" fill="currentColor" />
                <rect x="9" y="2" width="5" height="5" rx="1" fill="currentColor" />
                <rect x="2" y="9" width="5" height="5" rx="1" fill="currentColor" />
                <rect x="9" y="9" width="5" height="5" rx="1" fill="currentColor" />
              </svg>
            </button>

            <button
              type="button"
              onClick={() => onViewModeChange("table")}
              title="List view"
              className={`p-1.5 rounded-md transition-colors duration-150 cursor-pointer ${
                viewMode === "table"
                  ? "bg-white dark:bg-neutral-800 text-neutral-950 dark:text-white shadow-2xs"
                  : "text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
              }`}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5">
                <rect x="2" y="3" width="12" height="2" rx="0.5" fill="currentColor" />
                <rect x="2" y="7" width="12" height="2" rx="0.5" fill="currentColor" />
                <rect x="2" y="11" width="12" height="2" rx="0.5" fill="currentColor" />
              </svg>
            </button>
          </div>

          {/* Export Tagged Button */}
          {onOpenExportTaggedModal && (
            <button
              type="button"
              onClick={onOpenExportTaggedModal}
              className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-white dark:bg-neutral-900 text-foreground hover:bg-neutral-50 dark:hover:bg-neutral-800 font-medium text-xs transition-colors cursor-pointer shrink-0"
              title="Export tagged chapters dataset"
            >
              <RiDownload2Line className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              <span className="hidden lg:inline">Export tagged</span>
            </button>
          )}

          {/* Import Archive Button */}
          {onOpenImportModal && (
            <button
              type="button"
              onClick={onOpenImportModal}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-white dark:bg-neutral-900 text-foreground hover:bg-neutral-50 dark:hover:bg-neutral-800 font-medium text-xs transition-colors cursor-pointer shrink-0"
              title="Import project from .zip archive"
            >
              <RiFileZipLine className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="hidden lg:inline">Import</span>
            </button>
          )}

          {/* New Project Primary Ink CTA */}
          <button
            type="button"
            onClick={() => navigate("/projects/new")}
            className="flex items-center justify-center gap-1 px-3 sm:px-3.5 py-1.5 rounded-lg bg-neutral-950 hover:opacity-90 active:scale-[0.98] dark:bg-white text-white dark:text-neutral-950 font-medium text-xs transition-[opacity,transform] duration-150 cursor-pointer shrink-0"
          >
            <span>+ New</span>
            <span className="hidden sm:inline">project</span>
          </button>

          <div className="h-4 w-[1px] bg-border hidden sm:block" />

          <div className="hidden sm:block">
            <ThemeToggle />
          </div>

          <NavbarUserMenu />
        </div>
      </div>
    </header>
  );
}
