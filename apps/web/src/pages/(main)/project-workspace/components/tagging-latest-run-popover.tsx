import { useState } from "react";
import {
  RiHistoryLine,
  RiArrowRightLine,
  RiRestartLine,
} from "@remixicon/react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import type { TaggingJob, TaggingJobScope } from "@novelova/shared-types";
import { cn } from "@/lib/utils";

export interface TaggingLatestRunPopoverProps {
  latestJob?: TaggingJob | null;
  totalRunsCount?: number;
  isTagging?: boolean;
  onOpenFullHistory?: () => void;
  onRetryTagging?: () => void;
  onCancelTagging?: () => Promise<void> | void;
}

export function TaggingLatestRunPopover({
  latestJob,
  totalRunsCount = 0,
  isTagging = false,
  onOpenFullHistory,
  onRetryTagging,
  onCancelTagging,
}: TaggingLatestRunPopoverProps) {
  const [open, setOpen] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  const status = latestJob?.status;
  const isRunning = isTagging || status === "running" || status === "pending";
  const isCompleted = status === "completed";
  const isFailed = status === "failed";
  const isCancelled = status === "cancelled";

  const handleCancel = async () => {
    if (!onCancelTagging) return;
    setIsCancelling(true);
    try {
      await onCancelTagging();
    } finally {
      setIsCancelling(false);
    }
  };

  const formatRunTime = (dateStr?: string | null) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000);
    if (diffSec < 60) return "Just now";
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const formatDuration = (seconds?: number | null) => {
    if (!seconds) return "0s";
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  const formatTokens = (num?: number | null) => {
    if (!num) return "0";
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(1)}k`;
    return num.toLocaleString();
  };

  const formatCost = (usd?: number | null) => {
    if (usd === undefined || usd === null) return "$0.00";
    if (usd < 0.001 && usd > 0) return "<$0.001";
    return `$${usd.toFixed(3)}`;
  };

  const formatEta = (seconds?: number | null) => {
    if (seconds === undefined || seconds === null || seconds <= 0) return "";
    if (seconds < 60) return `~${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `~${mins}m ${secs > 0 ? `${secs}s` : ""}`;
  };

  const getScopeLabel = (scope?: TaggingJobScope | null, totalChapters?: number) => {
    if (scope?.label) return scope.label;
    if (totalChapters === 1) return "Single chapter";
    return "Full manuscript";
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "relative px-2 py-1.5 text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-xs transition-colors cursor-pointer rounded-r-lg",
            open && "bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100",
          )}
          title="Tagging run stats & history"
        >
          <RiHistoryLine className="h-3.5 w-3.5" />
          {isRunning ? (
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
          ) : isFailed ? (
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-rose-500" />
          ) : isCancelled ? (
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-amber-500" />
          ) : null}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-76 p-3.5 rounded-xl border border-neutral-200/90 dark:border-neutral-800 bg-white dark:bg-neutral-950 shadow-xl overflow-hidden focus:outline-hidden"
      >
        {/* Status Header */}
        <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-neutral-100 dark:border-neutral-900">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "w-2 h-2 rounded-full shrink-0",
                isRunning && "bg-blue-500 animate-pulse",
                isCompleted && "bg-emerald-500",
                isCancelled && "bg-amber-500",
                isFailed && "bg-rose-500",
                !latestJob && "bg-neutral-300 dark:bg-neutral-700",
              )}
            />
            <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
              {isRunning
                ? "Tagging in progress"
                : isCompleted
                  ? "Tagging complete"
                  : isCancelled
                    ? "Tagging cancelled"
                    : isFailed
                      ? "Tagging failed"
                      : "Stage B tagging"}
            </span>
          </div>

          <span className="text-[11px] text-neutral-400 dark:text-neutral-500 font-normal">
            {formatRunTime(
              latestJob?.completed_at || latestJob?.updated_at || latestJob?.created_at,
            )}
          </span>
        </div>

        {/* Content */}
        {!latestJob ? (
          <div className="py-2 text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
            No tagging runs recorded yet. Click "Tag dialogue" to classify characters and dialogue.
          </div>
        ) : isRunning ? (
          /* Live Progress */
          <div className="space-y-2 py-0.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-neutral-600 dark:text-neutral-300 truncate max-w-[170px]">
                {latestJob.current_step ||
                  latestJob.current_chapter_title ||
                  "Processing segments..."}
              </span>
              <span className="font-mono text-neutral-900 dark:text-neutral-100 font-semibold shrink-0">
                {(latestJob.progress_percent || 0).toFixed(0)}%
              </span>
            </div>

            <div className="w-full bg-neutral-100 dark:bg-neutral-800 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-blue-600 dark:bg-blue-400 h-full rounded-full transition-all duration-300"
                style={{
                  width: `${Math.min(100, Math.max(3, latestJob.progress_percent || 0))}%`,
                }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-neutral-400 dark:text-neutral-500 pt-0.5">
              <span>
                {latestJob.processed_segments || 0} / {latestJob.total_segments || 0} segments
                {latestJob.eta_seconds ? ` · ETA ${formatEta(latestJob.eta_seconds)}` : ""}
              </span>
              {onCancelTagging && (
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={isCancelling}
                  className="text-neutral-400 hover:text-rose-600 dark:hover:text-rose-400 font-medium transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isCancelling ? "Cancelling..." : "Cancel"}
                </button>
              )}
            </div>
          </div>
        ) : isCancelled ? (
          /* Cancelled State */
          <div className="space-y-2.5 py-0.5 text-xs">
            <p className="text-neutral-600 dark:text-neutral-300 leading-relaxed">
              Stopped at segment {latestJob.processed_segments.toLocaleString()} of{" "}
              {latestJob.total_segments.toLocaleString()} (
              {(latestJob.progress_percent || 0).toFixed(0)}%). All processed segments were saved.
            </p>
            {onRetryTagging && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onRetryTagging();
                }}
                className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 hover:underline inline-flex items-center gap-1 cursor-pointer"
              >
                <RiRestartLine className="h-3 w-3" />
                <span>Resume tagging</span>
              </button>
            )}
          </div>
        ) : isFailed ? (
          /* Failed State */
          <div className="space-y-2.5 py-0.5 text-xs">
            <div className="space-y-1">
              {latestJob.error_type && (
                <span className="text-[10px] font-mono uppercase tracking-wider text-rose-600 dark:text-rose-400 font-bold block">
                  {latestJob.error_type.replace(/_/g, " ")}
                </span>
              )}
              <p className="text-neutral-600 dark:text-neutral-300 leading-relaxed line-clamp-3">
                {latestJob.error_message || "An unexpected error occurred during dialogue tagging."}
              </p>
            </div>
            {onRetryTagging && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onRetryTagging();
                }}
                className="text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
              >
                <RiRestartLine className="h-3 w-3" />
                <span>Retry tagging</span>
              </button>
            )}
          </div>
        ) : (
          /* Completed: Clean borderless key-value rows */
          <div className="space-y-2 text-xs py-0.5">
            <div className="flex items-center justify-between">
              <span className="text-neutral-400 dark:text-neutral-500">Scope</span>
              <span className="font-medium text-neutral-800 dark:text-neutral-200">
                {getScopeLabel(latestJob.target_scope, latestJob.total_chapters)}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-neutral-400 dark:text-neutral-500">Segments</span>
              <span className="font-medium font-mono text-neutral-800 dark:text-neutral-200">
                {latestJob.total_segments.toLocaleString()}
                {latestJob.llm_report?.breakdown && (
                  <span className="text-[11px] text-neutral-400 dark:text-neutral-500 font-sans ml-1 font-normal">
                    ({latestJob.llm_report.breakdown.dialogue_segments} dialogue)
                  </span>
                )}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-neutral-400 dark:text-neutral-500">Tokens</span>
              <span className="font-medium font-mono text-neutral-800 dark:text-neutral-200">
                {formatTokens(latestJob.llm_report?.tokens?.total_tokens)}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-neutral-400 dark:text-neutral-500">Duration</span>
              <span className="font-medium font-mono text-neutral-800 dark:text-neutral-200">
                {formatDuration(latestJob.llm_report?.duration_seconds)}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-neutral-400 dark:text-neutral-500">Est. cost</span>
              <span className="font-medium font-mono text-neutral-800 dark:text-neutral-200">
                {formatCost(latestJob.llm_report?.cost?.estimated_cost_usd)}
              </span>
            </div>

            {latestJob.llm_report?.model && (
              <div className="flex items-center justify-between pt-0.5 text-[11px]">
                <span className="text-neutral-400 dark:text-neutral-500">Model</span>
                <span className="font-mono text-neutral-400 dark:text-neutral-500 truncate max-w-[150px]">
                  {latestJob.llm_report.model}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Action Link: Show full history */}
        <div className="pt-2.5 mt-2.5 border-t border-neutral-100 dark:border-neutral-900">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onOpenFullHistory?.();
            }}
            className="w-full flex items-center justify-between text-xs font-medium text-neutral-600 hover:text-neutral-950 dark:text-neutral-400 dark:hover:text-neutral-100 transition-colors cursor-pointer group py-0.5"
          >
            <span>Show full history</span>
            <div className="flex items-center gap-1.5 text-neutral-400 group-hover:text-neutral-800 dark:group-hover:text-neutral-200">
              {totalRunsCount > 0 && (
                <span className="text-[11px] font-mono">
                  {totalRunsCount} {totalRunsCount === 1 ? "run" : "runs"}
                </span>
              )}
              <RiArrowRightLine className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default TaggingLatestRunPopover;
