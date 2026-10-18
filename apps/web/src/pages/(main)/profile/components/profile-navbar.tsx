import { Link, NavLink } from "react-router-dom";
import { RiArrowLeftLine } from "@remixicon/react";
import { BrandLogo } from "@/components/brand-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { NavbarUserMenu } from "@/components/navbar-user-menu";

export function ProfileNavbar() {
  return (
    <header className="h-16 shrink-0 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black sticky top-0 z-30 select-none transition-colors">
      <div className="w-full h-full px-6 flex items-center justify-between">
        {/* Left: Back Button, Brand Logo & Breadcrumbs */}
        <div className="flex items-center gap-3">
          {/* Back Navigation Button */}
          <Link
            to="/projects"
            className="p-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors shadow-2xs"
            title="Back to projects"
          >
            <RiArrowLeftLine className="h-4 w-4" />
          </Link>

          {/* Brand Logo */}
          <NavLink
            to="/projects"
            className="flex items-center text-neutral-900 dark:text-neutral-100 hover:opacity-80 transition-opacity"
            title="Noveler Home"
          >
            <BrandLogo className="h-7 w-7 text-neutral-900 dark:text-neutral-100" />
          </NavLink>

          {/* Divider */}
          <div className="h-4.5 w-[1px] bg-neutral-200 dark:bg-neutral-800" />

          {/* Breadcrumb Path */}
          <div className="flex items-center gap-2">
            <NavLink
              to="/projects"
              className="text-sm font-medium text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
            >
              Projects
            </NavLink>
            <span className="text-neutral-300 dark:text-neutral-700 select-none">/</span>
            <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Profile & Settings
            </span>
          </div>
        </div>

        {/* Right: Quick Links, Theme Toggle & User Menu */}
        <div className="flex items-center gap-3">
          {/* Projects Quick NavLink */}
          <NavLink
            to="/projects"
            className="hidden sm:inline-flex px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-xs font-medium text-neutral-700 dark:text-neutral-300 shadow-2xs transition-colors"
          >
            Projects
          </NavLink>

          {/* Theme Toggle */}
          <ThemeToggle />

          <div className="h-4.5 w-[1px] bg-neutral-200 dark:bg-neutral-800" />

          {/* User Profile Menu */}
          <NavbarUserMenu />
        </div>
      </div>
    </header>
  );
}
