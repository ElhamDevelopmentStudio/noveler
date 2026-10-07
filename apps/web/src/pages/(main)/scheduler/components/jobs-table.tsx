import { Clock, Play } from "lucide-react";
import type { ScheduledJobInfo } from "@/services/scheduler";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Empty,
  EmptyIcon,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";

interface JobsTableProps {
  jobs: ScheduledJobInfo[];
  isLoading: boolean;
  triggeringJobId: string | null;
  onTrigger: (jobId: string) => void;
}

export function JobsTable({
  jobs,
  isLoading,
  triggeringJobId,
  onTrigger,
}: JobsTableProps) {
  if (isLoading) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        Querying scheduler state...
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <Empty>
        <EmptyIcon>
          <Clock className="h-6 w-6" />
        </EmptyIcon>
        <EmptyTitle>No matching jobs</EmptyTitle>
        <EmptyDescription>
          There are no background jobs matching the selected filter criteria.
        </EmptyDescription>
      </Empty>
    );
  }

  return (
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
          {jobs.map((job) => (
            <TableRow key={job.id}>
              <TableCell className="font-semibold">{job.name}</TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {job.id}
              </TableCell>
              <TableCell className="text-xs font-mono">{job.trigger}</TableCell>
              <TableCell>
                <Badge variant={job.is_active ? "success" : "default"}>
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
                      onClick={() => onTrigger(job.id)}
                      disabled={triggeringJobId === job.id}
                    >
                      <Play className="h-3.5 w-3.5 mr-1 text-emerald-600" />
                      Trigger Now
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      Run job immediately without waiting for next scheduled
                      interval
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default JobsTable;
