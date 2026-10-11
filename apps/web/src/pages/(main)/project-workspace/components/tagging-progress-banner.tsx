import { useState } from "react";
import {
  RiLoader4Line,
  RiCheckLine,
  RiAlertLine,
  RiCloseLine,
  RiRestartLine,
  RiTimeLine,
  RiStopLine,
  RiDownloadLine,
  RiHistoryLine,
  RiCoinsLine,
  RiCpuLine,
  RiGlobalLine,
  RiBookOpenLine,
  RiFileList3Line,
} from "@remixicon/react";
import type { TaggingJob, TaggingJobScope } from "@novelova/shared-types";

interface TaggingProgressBannerProps {
  job: TaggingJob | null;
  onRetry: () => void;
  onRunHeuristic?: () => void;
  onCancel: () => void;
  onDismiss?: () => void;
  onOpenHistory?: () => void;
  runsCount?: number;
}

export function TaggingProgressBanner({
  job,
  onRetry,
  onRunHeuristic,
  onCancel,
  onDismiss,
  onOpenHistory,
  runsCount = 1,
}: TaggingProgressBannerProps) {
  const [cancelling, setCancelling] = useState(false);

  if (!job) return null;

  const isRunning = job.status === "pending" || job.status === "running";
  const isFailed = job.status === "failed";
  const isCompleted = job.status === "completed";
  const isCancelled = job.status === "cancelled";

  if (!isRunning && !isFailed && !isCompleted && !isCancelled) return null;

  const handleDownloadReport = () => {
    if (!job.llm_report) return;
    const blob = new Blob([JSON.stringify(job.llm_report, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `novelova_tagging_report_${job.project_id.slice(0, 8)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

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

  const report = job.llm_report;

  // Render scope pill
  const renderScopePill = (scope?: TaggingJobScope | null) => {
    const type = scope?.type || (job.total_chapters === 1 ? "single" : "full");
    const label = scope?.label || (job.total_chapters === 1 ? "Single Chapter" : "Full Novel");

    if (type === "single") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100/80 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 text-[10px] font-medium font-sans">
          <RiBookOpenLine className="h-3 w-3" />
          <span className="truncate max-w-[120px]">{label}</span>
        </span>
      );
    }

    if (type === "range") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-100/80 dark:bg-purple-900/50 text-purple-800 dark:text-purple-300 text-[10px] font-medium font-sans">
          <RiFileList3Line className="h-3 w-3" />
          <span>{label}</span>
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100/80 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300 text-[10px] font-medium font-sans">
        <RiGlobalLine className="h-3 w-3" />
        <span>{label}</span>
      </span>
    );
  };

  // 1. Running State: Clean live progress
  if (isRunning) {
    const etaText = formatEta(job.eta_seconds);

    return (
      <div className="rounded-2xl border border-neutral-200/90 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 shadow-2xs space-y-3 transition-all animate-in fade-in">
        {/* Top Header */}
        <div className="flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <RiLoader4Line className="h-4 w-4 text-neutral-900 dark:text-neutral-100 animate-spin" />
            <span className="font-semibold text-neutral-900 dark:text-neutral-100">
              Stage B Dialogue Tagging (In Progress)
            </span>
            {renderScopePill(job.target_scope)}
          </div>

          <div className="flex items-center gap-2.5">
            {etaText && (
              <div className="flex items-center gap-1 text-[11px] text-neutral-500 dark:text-neutral-400 font-medium">
                <RiTimeLine className="h-3.5 w-3.5 text-neutral-400 dark:text-neutral-500" />
                <span>ETA: {etaText}</span>
              </div>
            )}

            {onOpenHistory && (
              <button
                type="button"
                onClick={onOpenHistory}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-neutral-200 dark:border-neutral-700 text-[11px] font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                title="View Past Runs History"
              >
                <RiHistoryLine className="h-3 w-3" />
                <span>Runs History</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleCancelClick}
              disabled={cancelling}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-neutral-200 dark:border-neutral-700 text-[11px] font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 hover:text-destructive hover:border-destructive/30 transition-colors cursor-pointer disabled:opacity-50"
            >
              <RiStopLine className="h-3 w-3" />
              <span>{cancelling ? "Cancelling..." : "Cancel"}</span>
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-1.5">
          <div className="w-full bg-neutral-100 dark:bg-neutral-800 h-2 rounded-full overflow-hidden">
            <div
              className="bg-neutral-900 dark:bg-neutral-100 h-full rounded-full transition-all duration-300 ease-out"
              style={{ width: `${Math.min(100, Math.max(2, job.progress_percent))}%` }}
            />
          </div>

          {/* Subtext info */}
          <div className="flex items-center justify-between text-[11px] text-neutral-500 dark:text-neutral-400">
            <span className="truncate max-w-lg">
              {job.current_step || job.current_chapter_title || "Processing segments..."}
            </span>
            <span className="font-mono font-medium text-neutral-800 dark:text-neutral-200 shrink-0">
              {job.progress_percent.toFixed(1)}% ({job.processed_segments.toLocaleString()} / {job.total_segments.toLocaleString()} segments)
            </span>
          </div>
        </div>
      </div>
    );
  }

  // 2. Failed State: Compact alert with history trigger
  if (isFailed) {
    return (
      <div className="rounded-2xl border border-red-200/90 dark:border-red-950/80 bg-red-50/70 dark:bg-red-950/30 p-3.5 sm:p-4 shadow-2xs transition-all animate-in fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-xl bg-red-100 dark:bg-red-900/60 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
              <RiAlertLine className="h-4 w-4" />
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-red-900 dark:text-red-200">
                  Dialogue Tagging Failed
                </span>
                {renderScopePill(job.target_scope)}
                {job.error_type && (
                  <span className="text-[10px] font-mono uppercase bg-red-100 dark:bg-red-900/60 text-red-700 dark:text-red-300 px-1.5 py-0.2 rounded font-bold">
                    {job.error_type.replace(/_/g, " ")}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-red-700 dark:text-red-300 truncate max-w-md">
                {job.error_message || "An error occurred during dialogue tagging."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onOpenHistory && (
              <button
                type="button"
                onClick={onOpenHistory}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-neutral-900 border border-red-200 dark:border-red-900/60 text-red-900 dark:text-red-200 text-xs font-semibold hover:bg-red-100/60 dark:hover:bg-red-950/50 transition-colors shadow-2xs cursor-pointer"
              >
                <RiHistoryLine className="h-3.5 w-3.5" />
                <span>View Runs & History</span>
              </button>
            )}

            {onRunHeuristic && (
              <button
                type="button"
                onClick={onRunHeuristic}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 text-neutral-800 dark:text-neutral-200 text-xs font-medium hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors shadow-2xs cursor-pointer"
              >
                <span>Offline Fallback</span>
              </button>
            )}

            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-600 dark:bg-red-700 text-white text-xs font-semibold hover:bg-red-700 dark:hover:bg-red-600 transition-colors shadow-2xs cursor-pointer"
            >
              <RiRestartLine className="h-3.5 w-3.5" />
              <span>Retry</span>
            </button>

            {onDismiss && (
              <button
                type="button"
                onClick={onDismiss}
                className="p-1 rounded-lg text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors cursor-pointer"
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

  // 3. Cancelled State: Compact banner with history trigger
  if (isCancelled) {
    return (
      <div className="rounded-2xl border border-amber-200/90 dark:border-amber-950/80 bg-amber-50/60 dark:bg-amber-950/30 p-3.5 sm:p-4 shadow-2xs transition-all animate-in fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-xl bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 flex items-center justify-center shrink-0">
              <RiStopLine className="h-4 w-4" />
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-amber-950 dark:text-amber-200">
                  Dialogue Tagging Cancelled
                </span>
                {renderScopePill(job.target_scope)}
              </div>
              <p className="text-[11px] text-amber-800 dark:text-amber-400 font-medium">
                Stopped at {job.current_chapter_title || `Chapter ${job.processed_chapters}`} ({job.processed_segments.toLocaleString()} of {job.total_segments.toLocaleString()} segments saved).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onOpenHistory && (
              <button
                type="button"
                onClick={onOpenHistory}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-neutral-900 border border-amber-300/80 dark:border-amber-900/60 text-amber-950 dark:text-amber-200 text-xs font-semibold hover:bg-amber-100/60 dark:hover:bg-amber-950/50 transition-colors shadow-2xs cursor-pointer"
              >
                <RiHistoryLine className="h-3.5 w-3.5" />
                <span>View Runs & History</span>
              </button>
            )}

            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-neutral-200 text-white dark:text-neutral-900 text-xs font-semibold transition-colors shadow-2xs cursor-pointer"
            >
              <RiRestartLine className="h-3.5 w-3.5" />
              <span>Resume Tagging</span>
            </button>

            {onDismiss && (
              <button
                type="button"
                onClick={onDismiss}
                className="text-amber-500 hover:text-amber-900 dark:hover:text-amber-300 p-1 rounded-lg transition-colors cursor-pointer"
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

  // 4. Completed State: Compact, elegant trigger bar for the full runs modal
  return (
    <div className="rounded-2xl border border-emerald-200/90 dark:border-emerald-950/80 bg-emerald-50/60 dark:bg-emerald-950/25 p-3.5 sm:p-4 shadow-2xs transition-all animate-in fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        {/* Left: Checkmark + Scope + Counts */}
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-xl bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0 shadow-2xs">
            <RiCheckLine className="h-4 w-4" />
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-emerald-950 dark:text-emerald-200">
                Dialogue Tagging Complete
              </span>
              {renderScopePill(job.target_scope)}
              {runsCount > 1 && (
                <span className="px-1.5 py-0.2 rounded-full bg-emerald-100/90 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 text-[10px] font-mono font-medium">
                  {runsCount} runs recorded
                </span>
              )}
            </div>
            <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
              Processed {job.total_segments.toLocaleString()} segments across {job.total_chapters} {job.total_chapters === 1 ? "chapter" : "chapters"}.
            </p>
          </div>
        </div>

        {/* Middle: Micro-metrics Pills */}
        {report && (
          <div className="hidden lg:flex items-center gap-2 text-[11px] font-mono">
            {report.cost && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/90 dark:bg-neutral-900/80 border border-emerald-200/70 dark:border-emerald-900/60 text-emerald-950 dark:text-emerald-200 shadow-2xs">
                <RiCoinsLine className="h-3 w-3 text-amber-500" />
                <span>${report.cost.estimated_cost_usd.toFixed(4)} USD</span>
              </span>
            )}
            {report.tokens && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/90 dark:bg-neutral-900/80 border border-emerald-200/70 dark:border-emerald-900/60 text-emerald-950 dark:text-emerald-200 shadow-2xs">
                <RiCpuLine className="h-3 w-3 text-blue-500" />
                <span>{(report.tokens.total_tokens / 1000).toFixed(1)}k tok</span>
              </span>
            )}
            {report.duration_seconds ? (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/90 dark:bg-neutral-900/80 border border-emerald-200/70 dark:border-emerald-900/60 text-emerald-950 dark:text-emerald-200 shadow-2xs">
                <RiTimeLine className="h-3 w-3 text-neutral-400" />
                <span>{report.duration_seconds}s</span>
              </span>
            ) : null}
          </div>
        )}

        {/* Right: History Trigger & Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {onOpenHistory && (
            <button
              type="button"
              onClick={onOpenHistory}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600 text-white text-xs font-semibold shadow-2xs transition-all cursor-pointer hover:shadow-xs active:scale-98"
            >
              <RiHistoryLine className="h-3.5 w-3.5" />
              <span>View Run History & Metrics</span>
            </button>
          )}

          {report && (
            <button
              type="button"
              onClick={handleDownloadReport}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-neutral-900 border border-emerald-200 dark:border-emerald-900/60 text-emerald-900 dark:text-emerald-200 text-xs font-semibold hover:bg-emerald-100/60 dark:hover:bg-emerald-950/50 transition-colors shadow-2xs cursor-pointer"
              title="Download JSON Report"
            >
              <RiDownloadLine className="h-3.5 w-3.5" />
              <span>Report</span>
            </button>
          )}

          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="text-emerald-500 hover:text-emerald-900 dark:hover:text-emerald-300 p-1.5 rounded-lg transition-colors cursor-pointer"
              title="Dismiss banner"
            >
              <RiCloseLine className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
