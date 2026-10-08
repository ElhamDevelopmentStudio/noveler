import { RiSunLine, RiMoonLine } from "@remixicon/react";
import { useTheme } from "@/context/theme-context";
import { cn } from "@/lib/utils";

interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { resolvedTheme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
      title={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
      className={cn(
        "p-2 rounded-lg border border-neutral-200 bg-white text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50",
        "dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:text-neutral-100 dark:hover:bg-neutral-800",
        "shadow-2xs transition-all duration-150 cursor-pointer flex items-center justify-center",
        className,
      )}
    >
      {resolvedTheme === "dark" ? (
        <RiSunLine className="h-4 w-4 text-amber-400 transition-transform hover:rotate-45" />
      ) : (
        <RiMoonLine className="h-4 w-4 text-neutral-600 transition-transform hover:-rotate-12" />
      )}
      <span className="sr-only">Toggle theme</span>
    </button>
  );
}

export default ThemeToggle;
