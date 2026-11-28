import { RiBroadcastLine } from "@remixicon/react";
import { Badge } from "@/components/ui/badge";

interface HealthProbePanelProps {
  isRecovered: boolean;
  isChecking: boolean;
  retryCount: number;
  lastChecked: Date | null;
}

export function HealthProbePanel({
  isRecovered,
  isChecking,
  retryCount,
  lastChecked,
}: HealthProbePanelProps) {
  return (
    <div className="rounded-xl border bg-muted/40 p-4 space-y-3">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground font-medium flex items-center gap-1.5">
          <RiBroadcastLine
            aria-hidden="true"
            className={`h-3.5 w-3.5 ${
              isRecovered
                ? "text-emerald-500"
                : "text-amber-500 animate-pulse"
            }`}
          />
          Connection Status
        </span>
        {isRecovered ? (
          <Badge
            variant="default"
            className="bg-emerald-600 hover:bg-emerald-600 text-xs"
          >
            Connected
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="border-destructive/30 text-destructive text-xs"
          >
            Reconnecting
          </Badge>
        )}
      </div>

      {/* Shimmer loading text during active polling */}
      <div className="py-2 text-center" aria-live="polite" role="status">
        {isRecovered ? (
          <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
            System ready. Returning to workspace…
          </p>
        ) : isChecking ? (
          <p className="text-sm font-medium shimmer-text">
            Checking service availability….
          </p>
        ) : (
          <p className="text-xs text-muted-foreground tabular-nums">
            Auto-reconnecting (check #{Math.max(1, retryCount)})
          </p>
        )}
      </div>

      {lastChecked && (
        <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-2 border-t border-border/50 tabular-nums">
          <span>Last Checked:</span>
          <span>{lastChecked.toLocaleTimeString()}</span>
        </div>
      )}
    </div>
  );
}

export default HealthProbePanel;
