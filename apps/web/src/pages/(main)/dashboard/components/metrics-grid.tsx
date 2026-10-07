import { Layers, Server, Database, Clock } from "lucide-react";
import type { HealthResponse } from "@novelova/shared-types";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface MetricsGridProps {
  health?: HealthResponse;
  healthLoading: boolean;
  jobCount?: number;
  jobsLoading: boolean;
}

export function MetricsGrid({
  health,
  healthLoading,
  jobCount,
  jobsLoading,
}: MetricsGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Frontend Stack</CardTitle>
          <Layers className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">React 19</div>
          <p className="text-xs text-muted-foreground mt-1">
            Tailwind CSS v4 + shadcn/ui
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Backend API</CardTitle>
          <Server className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">FastAPI</div>
          <p className="text-xs text-muted-foreground mt-1">
            {healthLoading ? (
              <Skeleton className="h-4 w-20" />
            ) : (
              `Uptime: ${health?.uptimeSeconds ?? 0}s`
            )}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Database</CardTitle>
          <Database className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">PostgreSQL</div>
          <p className="text-xs text-muted-foreground mt-1">
            SQLAlchemy 2.0 Async + asyncpg
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Background Jobs</CardTitle>
          <Clock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">APScheduler</div>
          <p className="text-xs text-muted-foreground mt-1">
            {jobsLoading ? (
              <Skeleton className="h-4 w-20" />
            ) : (
              `${jobCount ?? 0} active jobs`
            )}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default MetricsGrid;
