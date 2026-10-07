import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  ServerCrash,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Zap,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollFade } from "@/components/ui/scroll-fade";
import { checkHealthStatus } from "@/services/health";
import { HealthProbePanel } from "./components/health-probe-panel";

export function MaintenancePage() {
  const navigate = useNavigate();
  const [isChecking, setIsChecking] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [isRecovered, setIsRecovered] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkConnection = useCallback(async () => {
    setIsChecking(true);
    setLastChecked(new Date());

    try {
      const health = await checkHealthStatus();
      if (health && (health.status === "ok" || health.status === "degraded")) {
        setIsRecovered(true);
        setTimeout(() => {
          navigate("/");
        }, 1200);
        return;
      }
    } catch {
      // Still unreachable
    } finally {
      setIsChecking(false);
      setRetryCount((prev) => prev + 1);
    }
  }, [navigate]);

  useEffect(() => {
    checkConnection();

    const interval = setInterval(() => {
      if (!isRecovered) {
        checkConnection();
      }
    }, 3000);

    return () => {
      clearInterval(interval);
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
      }
    };
  }, [checkConnection, isRecovered]);

  return (
    <ScrollFade className="h-screen w-full flex flex-col justify-center items-center py-12 px-4 sm:px-6 lg:px-8 bg-background">
      <div className="w-full max-w-lg space-y-6">
        {/* Brand header */}
        <div className="flex items-center justify-center gap-2.5 font-bold text-xl tracking-tight text-foreground">
          <div className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center text-primary-foreground shadow">
            <Zap className="h-5 w-5" />
          </div>
          <span>Novelova Enterprise</span>
        </div>

        {/* Main Maintenance Card */}
        <Card className="border-border shadow-lg">
          <CardHeader className="text-center pb-4">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive ring-8 ring-destructive/5">
              {isRecovered ? (
                <CheckCircle2 className="h-7 w-7 text-emerald-500 animate-in zoom-in-75 duration-300" />
              ) : (
                <ServerCrash className="h-7 w-7 animate-pulse" />
              )}
            </div>

            <CardTitle className="text-2xl font-bold tracking-tight">
              {isRecovered ? "Connection Restored" : "Under Maintenance"}
            </CardTitle>

            <CardDescription className="text-sm mt-1.5">
              {isRecovered
                ? "The backend is operational. Redirecting you to the landing page..."
                : "The application is temporarily unavailable or unable to establish a connection with the backend services."}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Live Probe Panel */}
            <HealthProbePanel
              isRecovered={isRecovered}
              isChecking={isChecking}
              retryCount={retryCount}
              lastChecked={lastChecked}
            />

            {/* Diagnostic Information */}
            <div className="p-3.5 rounded-lg border border-amber-500/20 bg-amber-500/5 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
              <div className="space-y-1">
                <p className="font-medium">Why am I seeing this?</p>
                <p className="text-muted-foreground text-[11px] leading-relaxed">
                  A network request encountered a CORS failure or unreachable backend server.
                  This page will automatically return to the application the moment the API health check succeeds.
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button
                variant="default"
                className="flex-1"
                onClick={checkConnection}
                disabled={isChecking || isRecovered}
              >
                <RefreshCw
                  className={`h-4 w-4 mr-2 ${isChecking ? "animate-spin" : ""}`}
                />
                {isChecking ? "Checking Status..." : "Check Status Now"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground">
          Novelova Monorepo • Automated Resilience Monitor
        </p>
      </div>
    </ScrollFade>
  );
}

export default MaintenancePage;
