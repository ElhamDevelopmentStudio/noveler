import { RiSunLine, RiMoonLine } from "@remixicon/react";
import { ThemeAnimationType, useModeAnimation } from "react-theme-switch-animation";
import { useTheme } from "@/context/theme-context";
import { cn } from "@/lib/utils";

interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();

  const { ref, toggleSwitchTheme, isDarkMode } = useModeAnimation({
    animationType: ThemeAnimationType.BLUR_CIRCLE,
    blurAmount: 4,
    duration: 850,
    isDarkMode: resolvedTheme === "dark",
    onDarkModeChange: (isDark) => {
      setTheme(isDark ? "dark" : "light");
    },
  });

  return (
    <button
      ref={ref}
      type="button"
      onClick={toggleSwitchTheme}
      aria-label={`Switch to ${isDarkMode ? "light" : "dark"} mode`}
      title={`Switch to ${isDarkMode ? "light" : "dark"} mode`}
      className={cn(
        "p-2 rounded-lg border border-neutral-200 bg-white text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50",
        "dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:text-neutral-100 dark:hover:bg-neutral-800",
        "shadow-2xs transition-all duration-150 cursor-pointer flex items-center justify-center",
        className,
      )}
    >
      {isDarkMode ? (
        <RiSunLine className="h-4 w-4 text-amber-400 transition-transform hover:rotate-45" />
      ) : (
        <RiMoonLine className="h-4 w-4 text-neutral-600 transition-transform hover:-rotate-12" />
      )}
      <span className="sr-only">Toggle theme</span>
    </button>
  );
}

export default ThemeToggle;

