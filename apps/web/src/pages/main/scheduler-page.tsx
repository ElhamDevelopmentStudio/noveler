import { useState } from "react";
import useSWR from "swr";
import { Clock, Play, RefreshCw, AlertCircle, CheckCircle } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Empty,
  EmptyIcon,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { TypographyH2, TypographyMuted } from "@/components/ui/typography";
import { getScheduledJobs, triggerScheduledJob } from "@/services/scheduler";

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
      <div className="space-y-8 scroll-fade">
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

        <div className="flex items-center justify-between gap-4">
          <ToggleGroup
            type="single"
            value={filterMode}
            onValueChange={(val) => val && setFilterMode(val)}
            className="justify-start"
          >
            <ToggleGroupItem value="all" aria-label="Show all jobs">
              All Jobs
            </ToggleGroupItem>
            <ToggleGroupItem value="active" aria-label="Show active jobs">
              Active Only
            </ToggleGroupItem>
            <ToggleGroupItem value="paused" aria-label="Show paused jobs">
              Paused
            </ToggleGroupItem>
          </ToggleGroup>

          <Badge variant="outline">{filteredJobs.length} configured</Badge>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Registered Background Tasks</CardTitle>
            <CardDescription>
              Tasks execute periodically without interrupting HTTP worker
              concurrency.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                Querying scheduler state...
              </div>
            ) : filteredJobs.length === 0 ? (
              <Empty>
                <EmptyIcon>
                  <Clock className="h-6 w-6" />
                </EmptyIcon>
                <EmptyTitle>No matching jobs</EmptyTitle>
                <EmptyDescription>
                  There are no background jobs matching the selected filter
                  criteria.
                </EmptyDescription>
              </Empty>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Job Name</TableHead>
                      <TableHead>Job ID</TableHead>
                      <TableHead>Trigger</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Next Run</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredJobs.map((job) => (
                      <TableRow key={job.id}>
                        <TableCell className="font-semibold">
                          {job.name}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {job.id}
                        </TableCell>
                        <TableCell className="text-xs font-mono">
                          {job.trigger}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={job.is_active ? "success" : "default"}
                          >
                            {job.is_active ? "Active" : "Paused"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {job.next_run_time
                            ? new Date(job.next_run_time).toLocaleString()
                            : "Immediate"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleTrigger(job.id)}
                                disabled={triggeringJobId === job.id}
                              >
                                <Play className="h-3.5 w-3.5 mr-1 text-emerald-600" />
                                Trigger Now
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>
                                Run job immediately without waiting for next
                                scheduled interval
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}

export default SchedulerPage;
