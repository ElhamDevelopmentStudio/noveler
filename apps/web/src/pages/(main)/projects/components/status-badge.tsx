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

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const displayLabel = label || DEFAULT_LABELS[status] || status;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-neutral-100 text-neutral-800 shrink-0 select-none",
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-neutral-900 shrink-0" />
      <span>{displayLabel}</span>
    </span>
  );
}
