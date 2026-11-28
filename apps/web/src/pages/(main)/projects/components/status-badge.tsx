import { cn } from "@/lib/utils";
import type { ProjectStatus } from "@novelova/shared-types";

interface StatusBadgeProps {
  status: ProjectStatus | string;
  label?: string;
  className?: string;
}

const DEFAULT_LABELS: Record<string, string> = {
  in_production: "In production",
  review: "Review",
  ready_to_parse: "Ready to parse",
  complete: "Complete",
};

const STATUS_STYLES: Record<string, { pill: string; dot: string }> = {
  in_production: {
    pill: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20",
    dot: "bg-blue-600 dark:bg-blue-400",
  },
  review: {
    pill: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20",
    dot: "bg-amber-600 dark:bg-amber-400",
  },
  ready_to_parse: {
    pill: "bg-violet-500/10 text-violet-700 dark:text-violet-300 border border-violet-500/20",
    dot: "bg-violet-600 dark:bg-violet-400",
  },
  complete: {
    pill: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20",
    dot: "bg-emerald-600 dark:bg-emerald-400",
  },
};

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const displayLabel = label || DEFAULT_LABELS[status] || status;
  const style = STATUS_STYLES[status] || {
    pill: "bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 border border-border/60",
    dot: "bg-neutral-600 dark:bg-neutral-300",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium shrink-0 select-none",
        style.pill,
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", style.dot)} aria-hidden="true" />
      <span>{displayLabel}</span>
    </span>
  );
}
