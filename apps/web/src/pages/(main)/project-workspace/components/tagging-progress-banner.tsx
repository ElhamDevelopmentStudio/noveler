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
  RiCoinsLine,
  RiCpuLine,
  RiWallet3Line,
  RiArrowDownSLine,
  RiArrowUpSLine,
} from "@remixicon/react";
import type { TaggingJob } from "@novelova/shared-types";

interface TaggingProgressBannerProps {
  job: TaggingJob | null;
  onRetry: () => void;
  onRunHeuristic?: () => void;
  onCancel: () => void;
  onDismiss?: () => void;
}

export function TaggingProgressBanner({
  job,
  onRetry,
  onRunHeuristic,
  onCancel,
  onDismiss,
}: TaggingProgressBannerProps) {
  const [cancelling, setCancelling] = useState(false);
  const [showMetrics, setShowMetrics] = useState(true);

  if (!job) return null;

  const isRunning = job.status === "pending" || job.status === "running";
  const isFailed = job.status === "failed";
  const isCompleted = job.status === "completed";
  const isCancelled = job.status === "cancelled";

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

  if (!isRunning && !isFailed && !isCompleted && !isCancelled) return null;

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

  const report = job.llm_report;

  // Render metrics grid helper
  const renderMetricsGrid = (borderColor: string, subtextColor: string) => {
    if (!report || !showMetrics) return null;
    const cacheHitPct =
      report.tokens.prompt_tokens > 0
        ? Math.round(
            ((report.tokens.cache_hit_tokens || 0) /
              report.tokens.prompt_tokens) *
              100,
          )
        : 0;
    const avgOutPerDiag = Math.round(
      report.tokens.completion_tokens /
        Math.max(1, report.breakdown.dialogue_segments),
    );

    return (
      <div className={`pt-2.5 border-t ${borderColor} space-y-3`}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {/* Tokens Card */}
          <div className="bg-white/95 dark:bg-neutral-900/90 border border-neutral-200/80 dark:border-neutral-800 rounded-xl p-3 shadow-2xs space-y-1">
            <div className="flex items-center gap-1.5 text-[11px] text-neutral-500 dark:text-neutral-400 font-medium">
              <RiCpuLine className="h-3.5 w-3.5 text-neutral-400 dark:text-neutral-500" />
              <span>Tokens Consumed</span>
            </div>
            <div className="text-sm font-semibold font-mono text-neutral-900 dark:text-neutral-100">
              {report.tokens.total_tokens.toLocaleString()}
            </div>
            <div className="text-[10px] text-neutral-500 dark:text-neutral-400 space-x-1.5">
              <span>In: {report.tokens.prompt_tokens.toLocaleString()} ({cacheHitPct}% hit)</span>
              <span>·</span>
              <span>Out: {report.tokens.completion_tokens.toLocaleString()}</span>
            </div>
          </div>

          {/* Run Cost Card */}
          <div className="bg-white/95 dark:bg-neutral-900/90 border border-neutral-200/80 dark:border-neutral-800 rounded-xl p-3 shadow-2xs space-y-1">
            <div className="flex items-center gap-1.5 text-[11px] text-neutral-500 dark:text-neutral-400 font-medium">
              <RiCoinsLine className="h-3.5 w-3.5 text-neutral-400 dark:text-neutral-500" />
              <span>Run Cost</span>
            </div>
            <div className="text-sm font-semibold font-mono text-neutral-900 dark:text-neutral-100">
              ${report.cost.estimated_cost_usd.toFixed(4)} USD
            </div>
            <div className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate" title={report.cost.pricing_model}>
              {report.total_api_calls} calls ({report.duration_seconds}s) · {avgOutPerDiag} tok/line
            </div>
          </div>

          {/* Balance Remaining Card */}
          <div className="bg-white/95 dark:bg-neutral-900/90 border border-neutral-200/80 dark:border-neutral-800 rounded-xl p-3 shadow-2xs space-y-1">
            <div className="flex items-center gap-1.5 text-[11px] text-neutral-500 dark:text-neutral-400 font-medium">
              <RiWallet3Line className="h-3.5 w-3.5 text-neutral-400 dark:text-neutral-500" />
              <span>DeepSeek Balance</span>
            </div>
            <div className="text-sm font-semibold font-mono text-neutral-900 dark:text-neutral-100">
              {report.account.balance_remaining ? `$${report.account.balance_remaining} ${report.account.currency}` : "Active"}
            </div>
            <div className={`text-[10px] ${subtextColor}`}>
              Live account balance
            </div>
          </div>

          {/* Attributed Lines Card */}
          <div className="bg-white/95 dark:bg-neutral-900/90 border border-neutral-200/80 dark:border-neutral-800 rounded-xl p-3 shadow-2xs space-y-1">
            <div className="flex items-center gap-1.5 text-[11px] text-neutral-500 dark:text-neutral-400 font-medium">
              <RiCheckLine className="h-3.5 w-3.5 text-neutral-400 dark:text-neutral-500" />
              <span>Attributed Segments</span>
            </div>
            <div className="text-sm font-semibold font-mono text-neutral-900 dark:text-neutral-100">
              {report.breakdown.dialogue_segments.toLocaleString()} <span className="text-xs font-normal text-neutral-500 dark:text-neutral-400 font-sans">dialogue</span>
            </div>
            <div className={`text-[10px] ${subtextColor}`}>
              {report.breakdown.narration_segments
                ? `${report.breakdown.narration_segments.toLocaleString()} bypassed · `
                : ""}
              {report.breakdown.characters_synced?.length || 0} characters
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (isFailed) {
    return (
      <div className="rounded-2xl border border-red-200/90 dark:border-red-950/80 bg-red-50/70 dark:bg-red-950/30 p-4.5 shadow-2xs space-y-3 transition-all animate-in fade-in">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-red-100 dark:bg-red-900/60 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0 mt-0.5">
              <RiAlertLine className="h-4.5 w-4.5" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-semibold text-red-900 dark:text-red-200">
                  Dialogue Tagging Failed
                </h4>
                {job.error_type && (
                  <span className="text-[10px] font-mono uppercase bg-red-100 dark:bg-red-900/60 text-red-700 dark:text-red-300 px-1.5 py-0.5 rounded font-bold">
                    {job.error_type.replace(/_/g, " ")}
                  </span>
                )}
              </div>
              <p className="text-xs text-red-700 dark:text-red-300 font-medium leading-relaxed max-w-2xl">
                {job.error_message || "An unexpected error interrupted dialogue tagging."}
              </p>
              {job.current_chapter_title && (
                <p className="text-[11px] text-red-500 dark:text-red-400">
                  Last attempted at: {job.current_chapter_title} ({job.processed_segments} of {job.total_segments} segments saved)
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {report && (
              <>
                <button
                  type="button"
                  onClick={handleDownloadReport}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-neutral-900 border border-red-200 dark:border-red-900/60 text-red-900 dark:text-red-200 text-xs font-semibold hover:bg-red-100/60 dark:hover:bg-red-950/50 transition-colors shadow-2xs cursor-pointer"
                  title="Download JSON Report"
                >
                  <RiDownloadLine className="h-3.5 w-3.5" />
                  <span>Report</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowMetrics(!showMetrics)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-red-200 dark:border-red-900/60 text-red-800 dark:text-red-300 text-xs font-medium hover:bg-red-100/60 dark:hover:bg-red-950/50 transition-colors cursor-pointer"
                >
                  <span>{showMetrics ? "Hide Metrics" : "View Metrics"}</span>
                  {showMetrics ? <RiArrowUpSLine className="h-3.5 w-3.5" /> : <RiArrowDownSLine className="h-3.5 w-3.5" />}
                </button>
              </>
            )}

            {onRunHeuristic && (
              <button
                type="button"
                onClick={onRunHeuristic}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 text-neutral-800 dark:text-neutral-200 text-xs font-semibold hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors shadow-2xs cursor-pointer"
                title="Run Offline Heuristic"
              >
                <RiCpuLine className="h-3.5 w-3.5 text-neutral-500 dark:text-neutral-400" />
                <span>Run Offline Heuristic</span>
              </button>
            )}

            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-600 dark:bg-red-700 text-white text-xs font-semibold hover:bg-red-700 dark:hover:bg-red-600 transition-colors shadow-2xs cursor-pointer"
            >
              <RiRestartLine className="h-3.5 w-3.5" />
              <span>Retry DeepSeek</span>
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

        {renderMetricsGrid("border-red-200/70 dark:border-red-900/40", "text-red-500 dark:text-red-400")}
      </div>
    );
  }

  if (isCancelled) {
    return (
      <div className="rounded-2xl border border-amber-200/90 dark:border-amber-950/80 bg-amber-50/60 dark:bg-amber-950/30 p-4.5 shadow-2xs space-y-3.5 transition-all animate-in fade-in">
        {/* Top Header */}
        <div className="flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 flex items-center justify-center shrink-0">
              <RiStopLine className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-amber-950 dark:text-amber-200">
                  Dialogue Tagging Cancelled
                </span>
                <span className="px-1.5 py-0.5 rounded bg-amber-200/70 dark:bg-amber-900/60 text-amber-900 dark:text-amber-300 text-[10px] font-mono font-medium">
                  {report?.model || "deepseek-chat"}
                </span>
              </div>
              <p className="text-[11px] text-amber-800 dark:text-amber-400 font-medium">
                Stopped at {job.current_chapter_title || `Chapter ${job.processed_chapters}`} ({job.processed_segments.toLocaleString()} of {job.total_segments.toLocaleString()} segments processed).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {report && (
              <>
                <button
                  type="button"
                  onClick={handleDownloadReport}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-neutral-900 border border-amber-300/80 dark:border-amber-900/60 text-amber-950 dark:text-amber-200 text-xs font-semibold hover:bg-amber-100/60 dark:hover:bg-amber-950/50 transition-colors shadow-2xs cursor-pointer"
                  title="Download Partial JSON Report"
                >
                  <RiDownloadLine className="h-3.5 w-3.5" />
                  <span>Download Report</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowMetrics(!showMetrics)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-amber-300/80 dark:border-amber-900/60 text-amber-900 dark:text-amber-300 text-xs font-medium hover:bg-amber-100/60 dark:hover:bg-amber-950/50 transition-colors cursor-pointer"
                >
                  <span>{showMetrics ? "Hide Metrics" : "View Metrics"}</span>
                  {showMetrics ? <RiArrowUpSLine className="h-3.5 w-3.5" /> : <RiArrowDownSLine className="h-3.5 w-3.5" />}
                </button>
              </>
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

        {renderMetricsGrid("border-amber-200/80 dark:border-amber-900/40", "text-amber-700 dark:text-amber-400")}
      </div>
    );
  }

  if (isRunning) {
    const etaText = formatEta(job.eta_seconds);

    return (
      <div className="rounded-2xl border border-neutral-200/90 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4.5 shadow-2xs space-y-3.5 transition-all">
        {/* Top Header */}
        <div className="flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <RiLoader4Line className="h-4 w-4 text-neutral-900 dark:text-neutral-100 animate-spin" />
            <span className="font-semibold text-neutral-900 dark:text-neutral-100">
              Stage B Dialogue Tagging (Background Job)
            </span>
            <span className="px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 text-[10px] font-medium capitalize">
              {job.status}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {etaText && (
              <div className="flex items-center gap-1 text-[11px] text-neutral-500 dark:text-neutral-400 font-medium">
                <RiTimeLine className="h-3.5 w-3.5 text-neutral-400 dark:text-neutral-500" />
                <span>ETA: {etaText}</span>
              </div>
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

  // Completed State with LLM Report
  return (
    <div className="rounded-2xl border border-emerald-200/90 dark:border-emerald-950/80 bg-emerald-50/50 dark:bg-emerald-950/30 p-4.5 shadow-2xs space-y-3.5 transition-all animate-in fade-in">
      {/* Top Header */}
      <div className="flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
            <RiCheckLine className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-emerald-950 dark:text-emerald-200">
                Dialogue Tagging Complete (100%)
              </span>
              <span className="px-1.5 py-0.5 rounded bg-emerald-200/70 dark:bg-emerald-900/60 text-emerald-900 dark:text-emerald-300 text-[10px] font-mono font-medium">
                {report?.model || "deepseek-chat"}
              </span>
            </div>
            <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
              Processed {job.total_segments.toLocaleString()} segments across {job.total_chapters} chapters.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {report && (
            <>
              <button
                type="button"
                onClick={handleDownloadReport}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-neutral-900 border border-emerald-200 dark:border-emerald-900/60 text-emerald-900 dark:text-emerald-200 text-xs font-semibold hover:bg-emerald-100/60 dark:hover:bg-emerald-950/50 transition-colors shadow-2xs cursor-pointer"
                title="Download JSON Report"
              >
                <RiDownloadLine className="h-3.5 w-3.5" />
                <span>Download Report</span>
              </button>

              <button
                type="button"
                onClick={() => setShowMetrics(!showMetrics)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-emerald-200 dark:border-emerald-900/60 text-emerald-800 dark:text-emerald-300 text-xs font-medium hover:bg-emerald-100/60 dark:hover:bg-emerald-950/50 transition-colors cursor-pointer"
              >
                <span>{showMetrics ? "Hide Metrics" : "View Metrics"}</span>
                {showMetrics ? (
                  <RiArrowUpSLine className="h-3.5 w-3.5" />
                ) : (
                  <RiArrowDownSLine className="h-3.5 w-3.5" />
                )}
              </button>
            </>
          )}

          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="text-emerald-500 hover:text-emerald-900 dark:hover:text-emerald-300 p-1 rounded-lg transition-colors cursor-pointer"
              title="Dismiss"
            >
              <RiCloseLine className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {renderMetricsGrid("border-emerald-200/70 dark:border-emerald-900/40", "text-emerald-700 dark:text-emerald-400")}
    </div>
  );
}
