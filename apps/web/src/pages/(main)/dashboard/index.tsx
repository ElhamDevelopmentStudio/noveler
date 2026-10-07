import { useState } from "react";
import { Link } from "react-router-dom";
import useSWR from "swr";
import {
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Sparkles,
  ServerCrash,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TypographyH2, TypographyMuted } from "@/components/ui/typography";
import { getHealth } from "@/services/health";
import { getScheduledJobs } from "@/services/scheduler";
import { MetricsGrid } from "./components/metrics-grid";
import { ArchitectureTabs } from "./components/architecture-tabs";
import { ShimmerPreview } from "./components/shimmer-preview";

export function DashboardPage() {
  const [showShimmerDemo, setShowShimmerDemo] = useState(false);

  const {
    data: health,
    error: healthError,
    isLoading: healthLoading,
    mutate: mutateHealth,
  } = useSWR("/health", getHealth, { refreshInterval: 15000 });

  const {
    data: jobs,
    isLoading: jobsLoading,
    mutate: mutateJobs,
  } = useSWR("/scheduler/jobs", getScheduledJobs, { refreshInterval: 15000 });

  const handleRefresh = () => {
    mutateHealth();
    mutateJobs();
  };

  if (showShimmerDemo) {
    return <ShimmerPreview onClose={() => setShowShimmerDemo(false)} />;
  }

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <TypographyH2 className="border-0 pb-0">
            System Dashboard
          </TypographyH2>
          <TypographyMuted>
            Real-time telemetry, PostgreSQL status, and APScheduler background
            jobs.
          </TypographyMuted>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/maintenance">
            <Button variant="outline" size="sm">
              <ServerCrash className="h-4 w-4 mr-1.5 text-muted-foreground" />
              Maintenance View
            </Button>
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowShimmerDemo(true)}
          >
            <Sparkles className="h-4 w-4 mr-1.5 text-amber-500" />
            Shimmer Loading
          </Button>
          <Button variant="default" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-1.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Status Alert Banner */}
      {healthError ? (
        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive flex items-start gap-3">
          <AlertCircle className="h-5 w-5 mt-0.5 shrink-0" />
          <div>
            <h4 className="font-semibold text-sm">Backend Not Reachable</h4>
            <p className="text-xs mt-1 text-muted-foreground">
              Ensure FastAPI backend is running via{" "}
              <code className="font-mono bg-muted px-1 py-0.5 rounded">
                pnpm dev
              </code>
              .
            </p>
            <p className="text-xs mt-1 font-mono">{healthError.message}</p>
          </div>
        </div>
      ) : (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div>
              <h4 className="font-semibold text-sm">
                All Services Operating Normally
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                {health?.service || "FastAPI API"} v{health?.version || "0.1.0"}{" "}
                • Env: {health?.environment || "development"}
              </p>
            </div>
          </div>
          <Badge variant="success">Online</Badge>
        </div>
      )}

      {/* Metrics Grid */}
      <MetricsGrid
        health={health}
        healthLoading={healthLoading}
        jobCount={jobs?.length}
        jobsLoading={jobsLoading}
      />

      {/* Tabs Section for Deep Dive */}
      <ArchitectureTabs jobs={jobs} jobsLoading={jobsLoading} />
    </div>
  );
}

export default DashboardPage;
