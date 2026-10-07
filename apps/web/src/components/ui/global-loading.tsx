import * as React from "react";
import { cn } from "@/lib/utils";

export interface GlobalLoadingProps extends React.HTMLAttributes<HTMLDivElement> {
  text?: string;
}

export function GlobalLoading({
  className,
  text = "Loading....",
  ...props
}: GlobalLoadingProps) {
  return (
    <div
      className={cn(
        "min-h-[50vh] w-full flex items-center justify-center p-4",
        className,
      )}
      {...props}
    >
      <span className="text-xl sm:text-2xl font-semibold tracking-tight shimmer-text select-none">
        {text}
      </span>
    </div>
  );
}

export default GlobalLoading;
