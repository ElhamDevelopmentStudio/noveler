import * as React from "react";
import { Link } from "react-router-dom";
import { BrandLogo } from "@/components/brand-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { NavbarUserMenu } from "@/components/navbar-user-menu";
import { cn } from "@/lib/utils";

export interface AppHeaderCrumb {
  label: string;
  to?: string;
}

export interface AppHeaderProps {
  breadcrumbs?: AppHeaderCrumb[];
  center?: React.ReactNode;
  actions?: React.ReactNode;
  showThemeToggle?: boolean;
  className?: string;
}

export function AppHeader({
  breadcrumbs = [],
  center,
  actions,
  showThemeToggle = true,
  className,
}: AppHeaderProps) {
  return (
    <header
      className={cn(
        "h-14 shrink-0 sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border px-4 sm:px-6 flex items-center justify-between gap-4",
        className,
      )}
    >
      {/* Left: Brand + Breadcrumb Trail */}
      <div className="flex items-center gap-2.5 min-w-0">
        <Link
          to="/projects"
          title="Novelova Home"
          className="flex items-center gap-2 text-foreground hover:opacity-80 transition-opacity shrink-0"
        >
          <BrandLogo className="h-6 w-auto" />
        </Link>

        {breadcrumbs.length > 0 && (
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-2 text-xs text-muted-foreground min-w-0"
          >
            {breadcrumbs.map((crumb, idx) => (
              <React.Fragment key={`${crumb.label}-${idx}`}>
                <span className="text-border select-none">/</span>
                {crumb.to ? (
                  <Link
                    to={crumb.to}
                    className="hover:text-foreground transition-colors truncate"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="text-foreground font-medium truncate">
                    {crumb.label}
                  </span>
                )}
              </React.Fragment>
            ))}
          </nav>
        )}
      </div>

      {/* Center: Optional Contextual Slot */}
      {center && (
        <div className="hidden lg:flex items-center justify-center min-w-0">
          {center}
        </div>
      )}

      {/* Right: Actions + Theme + User Menu */}
      <div className="flex items-center gap-2 shrink-0">
        {actions}
        {showThemeToggle && <ThemeToggle />}
        <NavbarUserMenu />
      </div>
    </header>
  );
}
