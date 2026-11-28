import {
  RiBookOpenLine,
  RiGroupLine,
  RiSparkling2Line,
  RiHistoryLine,
} from "@remixicon/react";
import { cn } from "@/lib/utils";

export type WorkspaceMode = "script" | "cast" | "prep" | "runs";
export type WorkspaceSidebarItem = WorkspaceMode;

export interface WorkspaceSidebarProps {
  activeMode: WorkspaceMode;
  isChaptersDrawerOpen?: boolean;
  onSelectMode: (mode: WorkspaceMode) => void;
  castBadge?: string;
  runsBadge?: number;
  className?: string;
}

interface NavItemConfig {
  id: WorkspaceMode;
  label: string;
  icon: typeof RiBookOpenLine;
}

const NAV_ITEMS: NavItemConfig[] = [
  {
    id: "script",
    label: "Script",
    icon: RiBookOpenLine,
  },
  {
    id: "cast",
    label: "Cast",
    icon: RiGroupLine,
  },
  {
    id: "prep",
    label: "Prep & SFX",
    icon: RiSparkling2Line,
  },
  {
    id: "runs",
    label: "Runs",
    icon: RiHistoryLine,
  },
];

export function WorkspaceSidebar({
  activeMode,
  isChaptersDrawerOpen = true,
  onSelectMode,
  castBadge,
  runsBadge,
  className,
}: WorkspaceSidebarProps) {
  return (
    <aside
      className={cn(
        "hidden md:flex w-14 shrink-0 h-full border-r border-border/80 bg-[#fafafa] dark:bg-[#0c0a09] flex-col items-center py-2.5 select-none transition-colors",
        className,
      )}
      aria-label="Workspace navigation"
    >
      <nav className="flex flex-col items-center gap-2.5 w-full">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeMode === item.id;
          const title =
            item.id === "script" && isActive
              ? isChaptersDrawerOpen
                ? "Collapse chapters drawer"
                : "Open chapters drawer"
              : item.label;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectMode(item.id)}
              className="relative flex flex-col items-center justify-center gap-0.5 cursor-pointer group w-full px-1 focus-visible:outline-none"
              title={title}
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
            >
              <div
                className={cn(
                  "relative w-8 h-8 rounded-[7px] flex items-center justify-center transition-[background-color,color,transform] duration-150 active:scale-95 group-focus-visible:ring-2 group-focus-visible:ring-ring",
                  isActive
                    ? "bg-neutral-950 text-white dark:bg-white dark:text-neutral-950 shadow-2xs"
                    : "text-neutral-500 dark:text-neutral-400 group-hover:text-neutral-900 dark:group-hover:text-neutral-100 group-hover:bg-neutral-200/60 dark:group-hover:bg-neutral-800/70",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {item.id === "runs" && runsBadge !== undefined && runsBadge > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-3.5 h-3.5 px-1 rounded-full bg-secondary text-foreground border border-border text-[8.5px] font-semibold flex items-center justify-center tabular-nums">
                    {runsBadge > 99 ? "99+" : runsBadge}
                  </span>
                )}
              </div>

              <span
                className={cn(
                  "text-[10px] tracking-tight text-center leading-tight transition-colors duration-150",
                  isActive
                    ? "font-semibold text-neutral-950 dark:text-white"
                    : "font-medium text-neutral-500 dark:text-neutral-400 group-hover:text-neutral-800 dark:group-hover:text-neutral-200",
                )}
              >
                {item.label}
              </span>
              {item.id === "cast" && castBadge && (
                <span className="text-[8.5px] text-muted-foreground tabular-nums leading-none">
                  {castBadge}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

/**
 * ElevenLabs-style horizontal bottom navigation bar for mobile viewports (< md).
 */
export function WorkspaceMobileTabBar({
  activeMode,
  onSelectMode,
}: WorkspaceSidebarProps) {
  return (
    <nav
      className="md:hidden h-12 shrink-0 w-full border-t border-border/80 bg-white dark:bg-[#0c0a09] px-2 flex items-center justify-around gap-1 overflow-x-auto select-none z-30"
      aria-label="Workspace mobile navigation"
    >
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = activeMode === item.id;

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelectMode(item.id)}
            className={cn(
              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[7px] text-xs font-medium transition-colors duration-150 cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isActive
                ? "bg-neutral-950 text-white dark:bg-white dark:text-neutral-950"
                : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-900",
            )}
            aria-current={isActive ? "page" : undefined}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export default WorkspaceSidebar;
