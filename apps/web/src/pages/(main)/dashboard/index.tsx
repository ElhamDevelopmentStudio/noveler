import useSWR from "swr";
import { Zap, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { TypographyH2, TypographyMuted } from "@/components/ui/typography";
import { getHealth } from "@/services/health";

export function DashboardPage() {
  const {
    data: health,
    error: healthError,
    mutate: mutateHealth,
  } = useSWR("/health", getHealth, { refreshInterval: 15000 });

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <TypographyH2 className="border-0 pb-0">Dashboard</TypographyH2>
          <TypographyMuted>
            Welcome to your Novelova workspace.
          </TypographyMuted>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => mutateHealth()}
          >
            <RefreshCw className="h-4 w-4 mr-1.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Backend Status Banner */}
      {healthError ? (
        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive flex items-start gap-3">
          <AlertCircle className="h-5 w-5 mt-0.5 shrink-0" />
          <div>
            <h4 className="font-semibold text-sm">Backend Unreachable</h4>
            <p className="text-xs mt-1 text-muted-foreground">
              FastAPI services are not responding.
            </p>
          </div>
        </div>
      ) : (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div>
              <h4 className="font-semibold text-sm">
                System Online
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                {health?.service || "Novelova API"} v{health?.version || "0.1.0"}{" "}
                • {health?.environment || "development"}
              </p>
            </div>
          </div>
          <Badge variant="success">Connected</Badge>
        </div>
      )}

      {/* Clean Starting Canvas */}
      <Card className="border-dashed">
        <CardHeader className="text-center py-16">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Zap className="h-6 w-6" />
          </div>
          <CardTitle className="text-xl">Clean Slate Ready</CardTitle>
          <CardDescription className="max-w-md mx-auto mt-2">
            Architecture and foundational libraries are primed. Start building
            your application features and domain components here.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}

export default DashboardPage;
