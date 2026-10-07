import * as React from "react";
import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export interface GlobalLoadingProps extends React.HTMLAttributes<HTMLDivElement> {
  message?: string;
  subMessage?: string;
}

export function GlobalLoading({
  className,
  message = "Loading application resources...",
  subMessage = "Synchronizing state with Novelova services",
  ...props
}: GlobalLoadingProps) {
  return (
    <div
      className={cn(
        "min-h-[60vh] flex flex-col items-center justify-center p-8 text-center",
        className,
      )}
      {...props}
    >
      <div className="relative mb-6">
        {/* Shimmering pulse halo */}
        <div className="absolute -inset-2 rounded-2xl shimmer opacity-50 blur-sm" />
        <div className="relative h-14 w-14 rounded-2xl bg-primary flex items-center justify-center text-primary-foreground shadow-lg shadow-primary/20">
          <Zap className="h-7 w-7 animate-bounce" />
        </div>
      </div>

      <h2 className="text-xl font-bold tracking-tight shimmer-text">
        {message}
      </h2>
      <p className="text-sm text-muted-foreground mt-2 max-w-sm">
        {subMessage}
      </p>

      {/* Shimmering progress bar */}
      <div className="w-48 h-1.5 rounded-full overflow-hidden mt-6 bg-muted">
        <div className="w-full h-full shimmer" />
      </div>
    </div>
  );
}

export default GlobalLoading;
