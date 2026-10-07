import { useState } from "react";
import useSWR from "swr";
import { Clock, Play, RefreshCw, AlertCircle, CheckCircle } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Button,
  Badge,
} from "@novelova/ui";
import {
  getScheduledJobs,
  triggerScheduledJob,
} from "../../services/scheduler";

export function SchedulerPage() {
  const {
    data: jobs,
    error,
    isLoading,
    mutate,
  } = useSWR("/scheduler/jobs", getScheduledJobs, { refreshInterval: 10000 });

  const [triggeringJobId, setTriggeringJobId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleTrigger = async (jobId: string) => {
    setTriggeringJobId(jobId);
    setSuccessMessage(null);
    try {
      await triggerScheduledJob(jobId);
      setSuccessMessage(`Job '${jobId}' executed successfully!`);
      mutate();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to trigger job");
    } finally {
      setTriggeringJobId(null);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            APScheduler Background Jobs
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Monitor, inspect, and trigger async background tasks in the FastAPI
            event loop.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => mutate()}>
          <RefreshCw className="h-4 w-4 mr-1.5" />
          Refresh
        </Button>
      </div>

      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 flex items-center gap-3">
          <CheckCircle className="h-5 w-5 text-emerald-600 flex-shrink-0" />
          <p className="text-sm font-medium">{successMessage}</p>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0" />
          <p className="text-sm">
            Error connecting to scheduler: {error.message}
          </p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Registered Background Tasks</CardTitle>
          <CardDescription>
            These tasks run asynchronously inside FastAPI without blocking HTTP
            requests.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-12 text-center text-sm text-slate-500">
              Querying scheduler state...
            </div>
          ) : !jobs || jobs.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500">
              No jobs registered in scheduler.
            </div>
          ) : (
            <div className="space-y-4">
              {jobs.map((job) => (
                <div
                  key={job.id}
                  className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-blue-600" />
                      <h4 className="font-semibold text-sm">{job.name}</h4>
                      <Badge variant={job.is_active ? "success" : "default"}>
                        {job.is_active ? "Active" : "Paused"}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-500 font-mono">
                      Job ID: {job.id} • Trigger: {job.trigger}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      Next Run:{" "}
                      {job.next_run_time
                        ? new Date(job.next_run_time).toLocaleString()
                        : "Immediate"}
                    </p>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleTrigger(job.id)}
                    isLoading={triggeringJobId === job.id}
                  >
                    <Play className="h-3.5 w-3.5 mr-1.5 text-emerald-600" />
                    Trigger Now
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default SchedulerPage;
