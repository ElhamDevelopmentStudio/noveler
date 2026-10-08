import { useState } from "react";
import {
  RiLoader4Line,
  RiCheckLine,
  RiAlertLine,
  RiCloseLine,
  RiRestartLine,
  RiTimeLine,
  RiStopLine,
} from "@remixicon/react";
import type { TaggingJob } from "@novelova/shared-types";

interface TaggingProgressBannerProps {
  job: TaggingJob | null;
  onRetry: () => void;
  onCancel: () => void;
  onDismiss?: () => void;
}

export function TaggingProgressBanner({
  job,
  onRetry,
  onCancel,
  onDismiss,
}: TaggingProgressBannerProps) {
  const [cancelling, setCancelling] = useState(false);

  if (!job) return null;

  const isRunning = job.status === "pending" || job.status === "running";
  const isFailed = job.status === "failed";
  const isCompleted = job.status === "completed";

  if (!isRunning && !isFailed && !isCompleted) return null;

  // Format ETA seconds into human-readable string
  const formatEta = (seconds?: number | null) => {
    if (seconds === undefined || seconds === null || seconds <= 0) return null;
    if (seconds < 60) return `~${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins < 60) return `~${mins}m ${secs > 0 ? `${secs}s` : ""}`;
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `~${hours}h ${remMins > 0 ? `${remMins}m` : ""}`;
  };

  const handleCancelClick = async () => {
    setCancelling(true);
    try {
      await onCancel();
    } finally {
      setCancelling(false);
    }
  };

  if (isFailed) {
    return (
      <div className="rounded-2xl border border-red-200/90 bg-red-50/70 p-4.5 shadow-2xs space-y-3 transition-all animate-in fade-in">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shrink-0 mt-0.5">
              <RiAlertLine className="h-4.5 w-4.5" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-semibold text-red-900">
                  Dialogue Tagging Failed
                </h4>
                {job.error_type && (
                  <span className="text-[10px] font-mono uppercase bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold">
                    {job.error_type.replace(/_/g, " ")}
                  </span>
                )}
              </div>
              <p className="text-xs text-red-700 font-medium leading-relaxed max-w-2xl">
                {job.error_message || "An unexpected error interrupted dialogue tagging."}
              </p>
              {job.current_chapter_title && (
                <p className="text-[11px] text-red-500">
                  Last attempted at: {job.current_chapter_title} ({job.processed_segments} of {job.total_segments} segments saved)
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-600 text-white text-xs font-semibold hover:bg-red-700 transition-colors shadow-2xs cursor-pointer"
            >
              <RiRestartLine className="h-3.5 w-3.5" />
              <span>Resume Tagging</span>
            </button>
            {onDismiss && (
              <button
                type="button"
                onClick={onDismiss}
                className="p-1 rounded-lg text-red-400 hover:text-red-700 transition-colors cursor-pointer"
                title="Dismiss"
              >
                <RiCloseLine className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (isRunning) {
    const etaText = formatEta(job.eta_seconds);

    return (
      <div className="rounded-2xl border border-neutral-200/90 bg-white p-4.5 shadow-2xs space-y-3.5 transition-all">
        {/* Top Header */}
        <div className="flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <RiLoader4Line className="h-4 w-4 text-neutral-900 animate-spin" />
            <span className="font-semibold text-neutral-900">
              Stage B Dialogue Tagging (Background Job)
            </span>
            <span className="px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-700 text-[10px] font-medium capitalize">
              {job.status}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {etaText && (
              <div className="flex items-center gap-1 text-[11px] text-neutral-500 font-medium">
                <RiTimeLine className="h-3.5 w-3.5 text-neutral-400" />
                <span>ETA: {etaText}</span>
              </div>
            )}
            <button
              type="button"
              onClick={handleCancelClick}
              disabled={cancelling}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-neutral-200 text-[11px] font-medium text-neutral-600 hover:bg-neutral-50 hover:text-destructive hover:border-destructive/30 transition-colors cursor-pointer disabled:opacity-50"
            >
              <RiStopLine className="h-3 w-3" />
              <span>{cancelling ? "Cancelling..." : "Cancel"}</span>
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-1.5">
          <div className="w-full bg-neutral-100 h-2 rounded-full overflow-hidden">
            <div
              className="bg-neutral-900 h-full rounded-full transition-all duration-300 ease-out"
              style={{ width: `${Math.min(100, Math.max(2, job.progress_percent))}%` }}
            />
          </div>

          {/* Subtext info */}
          <div className="flex items-center justify-between text-[11px] text-neutral-500">
            <span className="truncate max-w-lg">
              {job.current_step || job.current_chapter_title || "Processing segments..."}
            </span>
            <span className="font-mono font-medium text-neutral-800 shrink-0">
              {job.progress_percent.toFixed(1)}% ({job.processed_segments.toLocaleString()} / {job.total_segments.toLocaleString()} segments)
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Completed State
  return (
    <div className="rounded-2xl border border-emerald-200/90 bg-emerald-50/60 p-3.5 shadow-2xs flex items-center justify-between gap-3 text-xs">
      <div className="flex items-center gap-2 text-emerald-800">
        <RiCheckLine className="h-4 w-4 text-emerald-600 shrink-0" />
        <span className="font-semibold">
          Stage B Tagging Complete:
        </span>
        <span className="text-emerald-700">
          {job.current_step || `Processed ${job.total_segments} segments across ${job.total_chapters} chapters.`}
        </span>
      </div>

      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="text-emerald-600 hover:text-emerald-900 p-1 rounded transition-colors cursor-pointer"
        >
          <RiCloseLine className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
