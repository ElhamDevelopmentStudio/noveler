import { Zap, Layers, Database } from "lucide-react";
import type { ScheduledJobInfo } from "@/services/scheduler";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";

interface ArchitectureTabsProps {
  jobs?: ScheduledJobInfo[];
  jobsLoading: boolean;
}

export function ArchitectureTabs({
  jobs,
  jobsLoading,
}: ArchitectureTabsProps) {
  return (
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
                        <Badge variant={job.is_active ? "success" : "default"}>
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
  );
}

export default ArchitectureTabs;
