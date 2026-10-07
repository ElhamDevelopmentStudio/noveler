import useSWR from "swr";
import {
  Server,
  Database,
  Clock,
  Layers,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  Zap,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Button,
  Badge,
} from "@novelova/ui";
import { getHealth } from "../../services/health";
import { getScheduledJobs } from "../../services/scheduler";

export function DashboardPage() {
  const {
    data: health,
    error: healthError,
    isLoading: healthLoading,
    mutate: mutateHealth,
  } = useSWR("/health", getHealth, { refreshInterval: 15000 });

  const {
    data: jobs,
    error: jobsError,
    isLoading: jobsLoading,
    mutate: mutateJobs,
  } = useSWR("/scheduler/jobs", getScheduledJobs, { refreshInterval: 15000 });

  const handleRefresh = () => {
    mutateHealth();
    mutateJobs();
  };

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            System Dashboard
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Real-time health, database status, and background job telemetry.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh}>
          <RefreshCw className="h-4 w-4 mr-1.5" />
          Refresh Stats
        </Button>
      </div>

      {/* Status Alert Banner */}
      {healthError ? (
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 mt-0.5 text-amber-600 flex-shrink-0" />
          <div>
            <h4 className="font-semibold text-sm">Backend Not Reachable</h4>
            <p className="text-xs mt-1 text-amber-700 dark:text-amber-300">
              Ensure FastAPI backend is running via{" "}
              <code className="font-mono bg-amber-100 dark:bg-amber-900 px-1 py-0.5 rounded">
                pnpm dev
              </code>{" "}
              or docker-compose.
            </p>
            <p className="text-xs mt-1 font-mono text-amber-600 dark:text-amber-400">
              {healthError.message}
            </p>
          </div>
        </div>
      ) : (
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" />
            <div>
              <h4 className="font-semibold text-sm">
                All Services Operating Normally
              </h4>
              <p className="text-xs text-emerald-700 dark:text-emerald-300">
                {health?.service || "FastAPI API"} v{health?.version || "0.1.0"}{" "}
                • Environment: {health?.environment || "development"}
              </p>
            </div>
          </div>
          <Badge variant="success">Online</Badge>
        </div>
      )}

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Frontend
              </p>
              <h3 className="text-xl font-bold mt-1">React 19</h3>
              <p className="text-xs text-slate-500 mt-1">
                Tailwind CSS v4.3 + Vite
              </p>
            </div>
            <div className="h-8 w-8 rounded-lg bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Layers className="h-4 w-4" />
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Backend API
              </p>
              <h3 className="text-xl font-bold mt-1">FastAPI</h3>
              <p className="text-xs text-slate-500 mt-1">
                {healthLoading
                  ? "Checking..."
                  : `Uptime: ${health?.uptimeSeconds ?? 0}s`}
              </p>
            </div>
            <div className="h-8 w-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Server className="h-4 w-4" />
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Database
              </p>
              <h3 className="text-xl font-bold mt-1">PostgreSQL</h3>
              <p className="text-xs text-slate-500 mt-1">
                SQLAlchemy 2.0 Async + asyncpg
              </p>
            </div>
            <div className="h-8 w-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Database className="h-4 w-4" />
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Scheduler
              </p>
              <h3 className="text-xl font-bold mt-1">APScheduler</h3>
              <p className="text-xs text-slate-500 mt-1">
                {jobsLoading
                  ? "Loading..."
                  : `${jobs?.length ?? 0} Active Background Jobs`}
              </p>
            </div>
            <div className="h-8 w-8 rounded-lg bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Clock className="h-4 w-4" />
            </div>
          </div>
        </Card>
      </div>

      {/* Architecture Highlights & Active Jobs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Architecture Details */}
        <Card>
          <CardHeader>
            <CardTitle>Monorepo Architecture</CardTitle>
            <CardDescription>
              Engineered with modern polyglot separation and shared packages.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                <div className="h-8 w-8 rounded-md bg-blue-500/10 text-blue-600 flex items-center justify-center flex-shrink-0">
                  <Zap className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold">Shared Packages</h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    <code className="text-blue-600 dark:text-blue-400 font-mono">
                      @novelova/shared-types
                    </code>
                    ,{" "}
                    <code className="text-blue-600 dark:text-blue-400 font-mono">
                      @novelova/ui
                    </code>
                    , and{" "}
                    <code className="text-blue-600 dark:text-blue-400 font-mono">
                      novelova-core
                    </code>
                    .
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                <div className="h-8 w-8 rounded-md bg-emerald-500/10 text-emerald-600 flex items-center justify-center flex-shrink-0">
                  <Database className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold">
                    PostgreSQL & Async ORM
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    FastAPI backend with connection pooling, declarative models,
                    and auto-seeding.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                <div className="h-8 w-8 rounded-md bg-purple-500/10 text-purple-600 flex items-center justify-center flex-shrink-0">
                  <Clock className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold">
                    APScheduler In-App Queue
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Runs async periodic intervals, cron schedules, and manual
                    triggers directly within FastAPI.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Live Scheduler Overview */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Active Scheduler Jobs</CardTitle>
              <CardDescription>
                Telemetry from the background APScheduler engine.
              </CardDescription>
            </div>
            <a
              href="/scheduler"
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
            >
              Manage
              <ExternalLink className="h-3 w-3" />
            </a>
          </CardHeader>
          <CardContent>
            {jobsLoading ? (
              <div className="py-8 text-center text-sm text-slate-500">
                Loading jobs...
              </div>
            ) : jobsError ? (
              <div className="py-8 text-center text-sm text-rose-500">
                Unable to load background jobs
              </div>
            ) : jobs && jobs.length > 0 ? (
              <div className="space-y-3">
                {jobs.map((job) => (
                  <div
                    key={job.id}
                    className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center justify-between"
                  >
                    <div>
                      <h4 className="text-sm font-semibold">{job.name}</h4>
                      <p className="text-xs text-slate-500 font-mono mt-0.5">
                        Trigger: {job.trigger}
                      </p>
                    </div>
                    <Badge variant="success">Active</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-sm text-slate-500">
                No active scheduled jobs
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default DashboardPage;
