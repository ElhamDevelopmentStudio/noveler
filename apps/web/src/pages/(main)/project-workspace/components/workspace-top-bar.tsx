import { NavLink } from "react-router-dom";
import { BrandLogo } from "@/components/brand-logo";

interface WorkspaceTopBarProps {
  onHelpClick?: () => void;
}

export function WorkspaceTopBar({ onHelpClick }: WorkspaceTopBarProps) {
  return (
    <header className="h-16 border-b border-neutral-200 bg-white sticky top-0 z-30 select-none">
      <div className="w-full h-full px-6 flex items-center justify-between">
        {/* Left: Brand Logo & Navigation */}
        <div className="flex items-center gap-3">
          <NavLink
            to="/projects"
            className="flex items-center text-neutral-900 hover:opacity-80 transition-opacity"
            title="Noveler Home"
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

        {/* Right: Help / Account Actions */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onHelpClick}
            className="px-3 py-1.5 rounded-lg border border-neutral-200 text-xs font-medium text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50 transition-colors cursor-pointer"
          >
            Help
          </button>
        </div>
      </div>
    </header>
  );
}
