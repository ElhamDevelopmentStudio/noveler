import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  RiUserLine,
  RiCpuLine,
  RiSendPlaneLine,
  RiShieldKeyholeLine,
  RiLogoutBoxRLine,
  RiArrowDownSLine,
} from "@remixicon/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { useAuth } from "@/context/auth-context";

export function NavbarUserMenu() {
  const [open, setOpen] = useState(false);
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  if (!isAuthenticated || !user) {
    return (
      <Link
        to="/login"
        className="px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-xs font-medium text-neutral-700 dark:text-neutral-300 shadow-2xs transition-colors"
      >
        Sign In
      </Link>
    );
  }

  const handleSignOut = () => {
    setOpen(false);
    logout();
    navigate("/login");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 p-1 sm:px-2 sm:py-1 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-900 transition-colors cursor-pointer select-none border border-transparent hover:border-neutral-200 dark:hover:border-neutral-800"
          title="Account & Settings"
          aria-label="User Account Menu"
        >
          <Avatar className="h-7 w-7 ring-1 ring-neutral-200 dark:ring-neutral-800 shrink-0">
            <AvatarImage
              src={user.avatar_url || undefined}
              alt={user.name}
              className="object-cover"
            />
            <AvatarFallback seed={user.handle}>
              {user.name.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <span className="hidden lg:inline-block text-xs font-medium text-neutral-700 dark:text-neutral-300 max-w-[100px] truncate">
            {user.name}
          </span>

          <RiArrowDownSLine className="h-3.5 w-3.5 text-neutral-400 dark:text-neutral-500 hidden sm:inline-block" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-60 p-1.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 shadow-lg"
      >
        {/* User Identity Header */}
        <div className="px-2.5 py-2">
          <p className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 truncate">
            {user.name}
          </p>
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
            {user.email}
          </p>
        </div>

        <div className="my-1 h-[1px] bg-neutral-100 dark:bg-neutral-800/80" />

        {/* Navigation Links */}
        <div className="space-y-0.5">
          <Link
            to="/profile?tab=personal"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-900 transition-colors"
          >
            <RiUserLine className="h-4 w-4 text-neutral-400 dark:text-neutral-500" />
            <span>Profile Settings</span>
          </Link>

          <Link
            to="/profile?tab=kaggle"
            onClick={() => setOpen(false)}
            className="flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-900 transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <RiCpuLine className="h-4 w-4 text-neutral-400 dark:text-neutral-500" />
              <span>Kaggle GPU Pool</span>
            </div>
            <span className="text-[9px] px-1.5 py-0.2 rounded font-mono font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              GPU
            </span>
          </Link>

          <Link
            to="/profile?tab=telegram"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-900 transition-colors"
          >
            <RiSendPlaneLine className="h-4 w-4 text-neutral-400 dark:text-neutral-500" />
            <span>Telegram Bot</span>
          </Link>

          <Link
            to="/profile?tab=security"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-900 transition-colors"
          >
            <RiShieldKeyholeLine className="h-4 w-4 text-neutral-400 dark:text-neutral-500" />
            <span>Security & Password</span>
          </Link>
        </div>

        <div className="my-1 h-[1px] bg-neutral-100 dark:bg-neutral-800/80" />

        {/* Sign Out */}
        <button
          type="button"
          onClick={handleSignOut}
          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
        >
          <RiLogoutBoxRLine className="h-4 w-4" />
          <span>Sign Out</span>
        </button>
      </PopoverContent>
    </Popover>
  );
}
