import { NavLink } from "react-router-dom";
import { BrandLogo } from "@/components/brand-logo";

export function CreateProjectHeader() {
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

        {/* Right: Help button */}
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => {
              window.open("https://github.com", "_blank");
            }}
            className="px-4 py-1.5 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 text-sm font-medium text-neutral-700 shadow-2xs transition-colors cursor-pointer"
          >
            Help
          </button>
        </div>
      </div>
    </header>
  );
}
