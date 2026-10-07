import { useState } from "react";
import useSWR from "swr";
import {
  Server,
  Database,
  Clock,
  Layers,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Zap,
  Sparkles,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyH2, TypographyMuted } from "@/components/ui/typography";
import { GlobalLoading } from "@/components/ui/global-loading";
import { getHealth } from "@/services/health";
import { getScheduledJobs } from "@/services/scheduler";

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
    return (
      <div className="space-y-4">
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowShimmerDemo(false)}
          >
            Close Shimmer Preview
          </Button>
        </div>
        <Card className="p-8">
          <GlobalLoading
            message="Demonstrating shadcn shimmer animation"
            subMessage="Built-in CSS shimmer utility sweep for global loading states without skeletons"
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8 scroll-fade">
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Frontend Stack
            </CardTitle>
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
            <CardTitle className="text-sm font-medium">
              Background Jobs
            </CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">APScheduler</div>
            <p className="text-xs text-muted-foreground mt-1">
              {jobsLoading ? (
                <Skeleton className="h-4 w-20" />
              ) : (
                `${jobs?.length ?? 0} active jobs`
              )}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs Section for Deep Dive */}
      <Tabs defaultValue="architecture" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="architecture">Architecture Details</TabsTrigger>
          <TabsTrigger value="jobs">Scheduler Status</TabsTrigger>
        </TabsList>

        <TabsContent value="architecture" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Professional Monorepo Architecture</CardTitle>
              <CardDescription>
                Clean separation of shared libraries and polyglot runtimes.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-lg border bg-card">
                  <div className="flex items-center gap-2 mb-2 font-semibold text-sm">
                    <Zap className="h-4 w-4 text-primary" />
                    <span>Shared TypeScript</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    <code>@novelova/shared-types</code> provides static type
                    contracts shared across Vite and API.
                  </p>
                </div>

                <div className="p-4 rounded-lg border bg-card">
                  <div className="flex items-center gap-2 mb-2 font-semibold text-sm">
                    <Layers className="h-4 w-4 text-primary" />
                    <span>Design System</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Radix UI primitives wrapped in accessible shadcn components
                    styled with Tailwind v4.
                  </p>
                </div>

                <div className="p-4 rounded-lg border bg-card">
                  <div className="flex items-center gap-2 mb-2 font-semibold text-sm">
                    <Database className="h-4 w-4 text-primary" />
                    <span>Shared Python Core</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    <code>packages/python-core</code> provides base models,
                    exceptions, and structured loggers.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="jobs" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>In-App Task Scheduler</CardTitle>
              <CardDescription>
                Telemetry from the AsyncIOScheduler running in FastAPI lifespan.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {jobsLoading ? (
                <div className="space-y-2 py-4">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : jobs && jobs.length > 0 ? (
                <div className="space-y-3">
                  {jobs.map((job) => (
                    <div
                      key={job.id}
                      className="p-4 rounded-lg border flex items-center justify-between"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-semibold">{job.name}</h4>
                          <Badge
                            variant={job.is_active ? "success" : "default"}
                          >
                            {job.is_active ? "Active" : "Paused"}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground font-mono mt-0.5">
                          Trigger: {job.trigger}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Next:{" "}
                        {job.next_run_time
                          ? new Date(job.next_run_time).toLocaleTimeString()
                          : "Immediate"}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No active jobs found.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default DashboardPage;
