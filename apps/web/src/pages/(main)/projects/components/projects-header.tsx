import { Link } from "react-router-dom";
import {
  RiSearchLine,
  RiCloseLine,
  RiFileZipLine,
  RiDownload2Line,
} from "@remixicon/react";
import { AppHeader } from "@/components/app-header";

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
  return (
    <AppHeader
      breadcrumbs={[{ label: "Studio" }]}
      actions={
        <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
          {/* Search Input */}
          <div className="relative w-36 sm:w-56 lg:w-72">
            <RiSearchLine
              className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="search"
              aria-label="Search projects"
              placeholder="Search projects…"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-8 pr-7 py-1.5 text-xs sm:text-sm rounded-lg border border-border bg-card placeholder:text-muted-foreground text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
            />
            {search && (
              <button
                type="button"
                onClick={() => onSearchChange("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 rounded-full cursor-pointer transition-colors"
                title="Clear search"
              >
                <RiCloseLine className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>

          {/* View Mode Toggle: Card vs Table */}
          <div
            role="group"
            aria-label="Project view mode"
            className="flex items-center rounded-lg border border-border bg-muted/60 p-0.5 shrink-0"
          >
            <button
              type="button"
              onClick={() => onViewModeChange("card")}
              aria-label="Grid view"
              aria-pressed={viewMode === "card"}
              title="Grid view"
              className={`p-1.5 rounded-md transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                viewMode === "card"
                  ? "bg-card text-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
                <rect x="2" y="2" width="5" height="5" rx="1" fill="currentColor" />
                <rect x="9" y="2" width="5" height="5" rx="1" fill="currentColor" />
                <rect x="2" y="9" width="5" height="5" rx="1" fill="currentColor" />
                <rect x="9" y="9" width="5" height="5" rx="1" fill="currentColor" />
              </svg>
            </button>

            <button
              type="button"
              onClick={() => onViewModeChange("table")}
              aria-label="List view"
              aria-pressed={viewMode === "table"}
              title="List view"
              className={`p-1.5 rounded-md transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                viewMode === "table"
                  ? "bg-card text-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
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
              aria-label="Export tagged chapters dataset"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-card text-foreground hover:bg-secondary font-medium text-xs transition-colors cursor-pointer shrink-0"
              title="Export tagged chapters dataset"
            >
              <RiDownload2Line className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              <span className="hidden lg:inline">Export tagged</span>
            </button>
          )}

          {/* Import Archive Button */}
          {onOpenImportModal && (
            <button
              type="button"
              onClick={onOpenImportModal}
              aria-label="Import project archive"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-card text-foreground hover:bg-secondary font-medium text-xs transition-colors cursor-pointer shrink-0"
              title="Import project from .zip archive"
            >
              <RiFileZipLine className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              <span className="hidden lg:inline">Import</span>
            </button>
          )}

          {/* New Project Primary Ink CTA */}
          <Link
            to="/projects/new"
            className="flex items-center justify-center gap-1 px-3 sm:px-3.5 py-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 active:scale-[0.98] font-medium text-xs transition-[opacity,transform] duration-150 shrink-0"
          >
            <span>+ New</span>
            <span className="hidden sm:inline">project</span>
          </Link>

          <div className="h-4 w-[1px] bg-border hidden sm:block" />
        </div>
      }
    />
  );
}
