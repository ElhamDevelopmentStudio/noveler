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
    id: "sfx",
    label: "SFX",
    icon: RiSparkling2Line,
  },
  {
    id: "voices",
    label: "Voices",
    icon: RiMicLine,
  },
];

export function WorkspaceSidebar({
  activeItem = "chapters",
  onSelectItem,
  className,
}: WorkspaceSidebarProps) {
  return (
    <aside
      className={cn(
        "w-14 shrink-0 h-full border-r border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#0c0d10] flex flex-col items-center py-3 select-none transition-colors",
        className,
      )}
      aria-label="Workspace sidebar"
    >
      <nav className="flex flex-col items-center gap-3.5 w-full">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeItem === item.id;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectItem?.(item.id)}
              className="flex flex-col items-center justify-center gap-1 cursor-pointer group w-full px-1"
              title={item.label}
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
            >
              {/* Icon Container with compact size and moderate radius */}
              <div
                className={cn(
                  "w-8.5 h-8.5 rounded-lg flex items-center justify-center transition-all duration-150",
                  isActive
                    ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-950 shadow-2xs"
                    : "text-neutral-400 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-900/60",
                )}
              >
                <Icon className="h-4.5 w-4.5 shrink-0" />
              </div>

              {/* Compact Label */}
              <span
                className={cn(
                  "text-[10px] tracking-tight text-center leading-tight transition-colors",
                  isActive
                    ? "font-semibold text-neutral-900 dark:text-white"
                    : "font-medium text-neutral-400 dark:text-neutral-400 group-hover:text-neutral-700 dark:group-hover:text-neutral-200",
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

export default WorkspaceSidebar;
