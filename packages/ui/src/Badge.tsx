import * as React from "react";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "success" | "warning" | "danger" | "outline";
}

export function Badge({
  className = "",
  variant = "default",
  children,
  ...props
}: BadgeProps) {
  const variantStyles = {
    default:
      "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
    success:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800",
    warning:
      "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400 border border-amber-200 dark:border-amber-800",
    danger:
      "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-400 border border-rose-200 dark:border-rose-800",
    outline:
      "text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700",
  }[variant];

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide ${variantStyles} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}
