import { useState } from "react";
import useSWR from "swr";
import { RefreshCw, AlertCircle, CheckCircle } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TypographyH2, TypographyMuted } from "@/components/ui/typography";
import { getScheduledJobs, triggerScheduledJob } from "@/services/scheduler";
import { JobsFilter } from "./components/jobs-filter";
import { JobsTable } from "./components/jobs-table";

export function SchedulerPage() {
  const {
    data: jobs,
    error,
    isLoading,
    mutate,
  } = useSWR("/scheduler/jobs", getScheduledJobs, { refreshInterval: 10000 });

  const [triggeringJobId, setTriggeringJobId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<string>("all");

  const handleTrigger = async (jobId: string) => {
    setTriggeringJobId(jobId);
    setSuccessMessage(null);
    try {
      await triggerScheduledJob(jobId);
      setSuccessMessage(`Job '${jobId}' triggered successfully!`);
      mutate();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to trigger job");
    } finally {
      setTriggeringJobId(null);
    }
  };

  const filteredJobs = (jobs || []).filter((job) => {
    if (filterMode === "active") return job.is_active;
    if (filterMode === "paused") return !job.is_active;
    return true;
  });

  return (
    <TooltipProvider>
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <TypographyH2 className="border-0 pb-0">
              APScheduler Background Engine
            </TypographyH2>
            <TypographyMuted>
              Monitor, filter, and trigger async jobs in the FastAPI event loop.
            </TypographyMuted>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => mutate()}>
              <RefreshCw className="h-4 w-4 mr-1.5" />
              Refresh
            </Button>
          </div>
        </div>

        {successMessage && (
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300 flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <p className="text-sm font-medium">{successMessage}</p>
          </div>
        )}

        {error && (
          <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive flex items-center gap-3">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <p className="text-sm">
              Error connecting to scheduler: {error.message}
            </p>
          </div>
        )}

        <JobsFilter
          filterMode={filterMode}
          onFilterChange={setFilterMode}
          count={filteredJobs.length}
        />

        <Card>
          <CardHeader>
            <CardTitle>Registered Background Tasks</CardTitle>
            <CardDescription>
              Tasks execute periodically without interrupting HTTP worker
              concurrency.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <JobsTable
              jobs={filteredJobs}
              isLoading={isLoading}
              triggeringJobId={triggeringJobId}
              onTrigger={handleTrigger}
            />
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}

export default SchedulerPage;
