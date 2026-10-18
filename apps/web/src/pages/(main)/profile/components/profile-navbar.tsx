import { Link, NavLink, useNavigate } from "react-router-dom";
import {
  RiArrowLeftLine,
  RiLogoutBoxRLine,
} from "@remixicon/react";
import { BrandLogo } from "@/components/brand-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/context/auth-context";

export function ProfileNavbar() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const handleSignOut = () => {
    logout();
    navigate("/login");
  };

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
            <span className="text-neutral-300 dark:text-neutral-700">/</span>
            <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Profile & Settings
            </span>
          </div>
        </div>

        {/* Right: Quick Links, Theme Toggle & User Info / Sign Out */}
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

          {/* User Avatar Chip */}
          {user && (
            <div className="hidden md:flex items-center gap-2 pl-1 border-l border-neutral-200 dark:border-neutral-800">
              <Avatar className="h-7 w-7 ring-1 ring-neutral-200 dark:ring-neutral-800">
                <AvatarImage
                  src={user.avatar_url || undefined}
                  alt={user.name}
                  className="object-cover"
                />
                <AvatarFallback seed={user.handle}>
                  {user.name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 max-w-[120px] truncate">
                {user.name}
              </span>
            </div>
          )}

          {/* Sign Out Button */}
          <button
            type="button"
            onClick={handleSignOut}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:bg-destructive/10 hover:border-destructive/30 hover:text-destructive text-neutral-700 dark:text-neutral-300 text-xs font-medium transition-colors shadow-2xs cursor-pointer"
            title="Sign out of your account"
          >
            <RiLogoutBoxRLine className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </div>
    </header>
  );
}
