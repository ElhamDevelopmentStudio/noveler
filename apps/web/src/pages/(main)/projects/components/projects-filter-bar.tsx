import { useState, useRef, useEffect } from "react";
import { RiArrowDownSLine } from "@remixicon/react";
import type { ProjectCounts } from "@novelova/shared-types";

export type FilterStatus = "all" | "in_production" | "review" | "complete";

interface ProjectsFilterBarProps {
  currentStatus: FilterStatus;
  counts: ProjectCounts;
  onStatusChange: (status: FilterStatus) => void;
  sortLabel: string;
  onSortChange: (sortBy: string, sortOrder: "asc" | "desc", label: string) => void;
}

const SORT_OPTIONS = [
  { label: "Last updated", sortBy: "updated_at", sortOrder: "desc" as const },
  { label: "Recently created", sortBy: "created_at", sortOrder: "desc" as const },
  { label: "Title (A-Z)", sortBy: "title", sortOrder: "asc" as const },
  { label: "Author (A-Z)", sortBy: "author", sortOrder: "asc" as const },
];

export function ProjectsFilterBar({
  currentStatus,
  counts,
  onStatusChange,
  sortLabel,
  onSortChange,
}: ProjectsFilterBarProps) {
  const [isSortOpen, setIsSortOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (sortRef.current && !sortRef.current.contains(event.target as Node)) {
        setIsSortOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const tabs: Array<{ id: FilterStatus; label: string; count: number }> = [
    { id: "all", label: "All projects", count: counts.all },
    { id: "in_production", label: "In production", count: counts.in_production },
    { id: "review", label: "Needs review", count: counts.needs_review },
    { id: "complete", label: "Complete", count: counts.complete },
  ];

  return (
    <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800">
      {/* Left Filter Tabs */}
      <nav className="flex items-center gap-6 sm:gap-8 -mb-px">
        {tabs.map((tab) => {
          const isActive = currentStatus === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onStatusChange(tab.id)}
              className={`flex items-center gap-1.5 pb-3 text-sm transition-colors cursor-pointer whitespace-nowrap ${
                isActive
                  ? "border-b-2 border-neutral-900 dark:border-neutral-100 font-semibold text-neutral-900 dark:text-neutral-100"
                  : "border-b-2 border-transparent text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 font-medium"
              }`}
            >
              <span>{tab.label}</span>
              <span className={isActive ? "text-neutral-900 dark:text-neutral-100" : "text-neutral-500 dark:text-neutral-400"}>
                {tab.count}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Right Sort dropdown */}
      <div className="relative pb-3" ref={sortRef}>
        <button
          type="button"
          onClick={() => setIsSortOpen(!isSortOpen)}
          className="flex items-center gap-1 text-sm font-medium text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors cursor-pointer select-none"
        >
          <span>{sortLabel}</span>
          <RiArrowDownSLine className="h-4 w-4 text-neutral-500 dark:text-neutral-400" />
        </button>

        {isSortOpen && (
          <div className="absolute right-0 top-full mt-1 w-44 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-lg py-1 z-30">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.label}
                type="button"
                onClick={() => {
                  onSortChange(opt.sortBy, opt.sortOrder, opt.label);
                  setIsSortOpen(false);
                }}
                className={`w-full text-left px-3.5 py-2 text-xs font-medium hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors ${
                  sortLabel === opt.label
                    ? "text-neutral-900 dark:text-neutral-100 font-semibold bg-neutral-50/50 dark:bg-neutral-800/50"
                    : "text-neutral-600 dark:text-neutral-300"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
