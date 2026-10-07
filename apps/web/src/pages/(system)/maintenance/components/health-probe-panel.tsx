import { RiBroadcastLine } from "@remixicon/react";
import { Badge } from "@/components/ui/badge";
import { API_BASE_URL } from "@/services/api-client";

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
            className={`h-3.5 w-3.5 ${
              isRecovered
                ? "text-emerald-500"
                : "text-amber-500 animate-pulse"
            }`}
          />
          Live Health Probe
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
            Offline
          </Badge>
        )}
      </div>

      {/* Shimmer loading text during active polling */}
      <div className="py-2 text-center">
        {isRecovered ? (
          <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
            System ready. Returning to workspace...
          </p>
        ) : isChecking ? (
          <p className="text-sm font-medium shimmer-text">
            Probing {API_BASE_URL}/health....
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Auto-polling active (attempt #{retryCount})
          </p>
        )}
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/50">
        <span>API Endpoint:</span>
        <code className="font-mono text-foreground/80 bg-background px-1.5 py-0.5 rounded border text-[11px]">
          {API_BASE_URL}/health
        </code>
      </div>

      {lastChecked && (
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>Last Probed:</span>
          <span>{lastChecked.toLocaleTimeString()}</span>
        </div>
      )}
    </div>
  );
}

export default HealthProbePanel;
