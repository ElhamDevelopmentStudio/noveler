import {
  RiMenuLine,
  RiGroupLine,
  RiSparkling2Line,
  RiMicLine,
} from "@remixicon/react";
import { cn } from "@/lib/utils";

export type WorkspaceSidebarItem = "chapters" | "characters" | "sfx" | "voices";

export interface WorkspaceSidebarProps {
  activeItem?: WorkspaceSidebarItem;
  isDrawerOpen?: boolean;
  onSelectItem?: (item: WorkspaceSidebarItem) => void;
  className?: string;
}

interface NavItemConfig {
  id: WorkspaceSidebarItem;
  label: string;
  icon: typeof RiMenuLine;
}

const NAV_ITEMS: NavItemConfig[] = [
  {
    id: "chapters",
    label: "Chapters",
    icon: RiMenuLine,
  },
  {
    id: "characters",
    label: "Characters",
    icon: RiGroupLine,
  },
  {
    id: "voices",
    label: "Voices",
    icon: RiMicLine,
  },
  {
    id: "sfx",
    label: "SFX",
    icon: RiSparkling2Line,
  },
];

export function WorkspaceSidebar({
  activeItem = "chapters",
  isDrawerOpen = true,
  onSelectItem,
  className,
}: WorkspaceSidebarProps) {
  return (
    <aside
      className={cn(
        "hidden md:flex w-16 shrink-0 h-full border-r border-border/80 bg-[#fafafa] dark:bg-[#0c0a09] flex-col items-center py-3 select-none transition-colors",
        className,
      )}
      aria-label="Workspace sidebar"
    >
      <nav className="flex flex-col items-center gap-3 w-full">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeItem === item.id && isDrawerOpen;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectItem?.(item.id)}
              className="flex flex-col items-center justify-center gap-1 cursor-pointer group w-full px-1 focus-visible:outline-none"
              title={isActive ? `Collapse ${item.label}` : `Open ${item.label}`}
              aria-label={item.label}
              aria-pressed={isActive}
            >
              <div
                className={cn(
                  "w-9 h-9 rounded-lg flex items-center justify-center transition-[background-color,color,transform] duration-150 active:scale-95",
                  isActive
                    ? "bg-neutral-950 text-white dark:bg-white dark:text-neutral-950 shadow-2xs"
                    : "text-neutral-500 dark:text-neutral-400 group-hover:text-neutral-900 dark:group-hover:text-neutral-100 group-hover:bg-neutral-200/60 dark:group-hover:bg-neutral-800/70",
                )}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
              </div>

              <span
                className={cn(
                  "text-[10.5px] tracking-tight text-center leading-tight transition-colors duration-150",
                  isActive
                    ? "font-semibold text-neutral-950 dark:text-white"
                    : "font-medium text-neutral-500 dark:text-neutral-400 group-hover:text-neutral-800 dark:group-hover:text-neutral-200",
                )}
              >
                {item.label}
              </span>
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
  activeItem = "chapters",
  isDrawerOpen = false,
  onSelectItem,
}: WorkspaceSidebarProps) {
  return (
    <nav
      className="md:hidden h-13 shrink-0 w-full border-t border-border/80 bg-white dark:bg-[#0c0a09] px-2 flex items-center justify-around gap-1 overflow-x-auto select-none z-30"
      aria-label="Workspace mobile navigation"
    >
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = activeItem === item.id && isDrawerOpen;

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelectItem?.(item.id)}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors duration-150 cursor-pointer shrink-0",
              isActive
                ? "bg-neutral-950 text-white dark:bg-white dark:text-neutral-950"
                : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-900",
            )}
            aria-pressed={isActive}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export default WorkspaceSidebar;
