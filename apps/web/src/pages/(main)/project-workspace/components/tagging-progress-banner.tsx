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
    return (
      <div className={`pt-2.5 border-t ${borderColor} space-y-3`}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {/* Tokens Card */}
          <div className="bg-white/95 border border-neutral-200/80 rounded-xl p-3 shadow-2xs space-y-1">
            <div className="flex items-center gap-1.5 text-[11px] text-neutral-500 font-medium">
              <RiCpuLine className="h-3.5 w-3.5 text-neutral-400" />
              <span>Tokens Consumed</span>
            </div>
            <div className="text-sm font-semibold font-mono text-neutral-900">
              {report.tokens.total_tokens.toLocaleString()}
            </div>
            <div className="text-[10px] text-neutral-500 space-x-1.5">
              <span>In: {report.tokens.prompt_tokens.toLocaleString()}</span>
              <span>·</span>
              <span>Out: {report.tokens.completion_tokens.toLocaleString()}</span>
            </div>
          </div>

          {/* Run Cost Card */}
          <div className="bg-white/95 border border-neutral-200/80 rounded-xl p-3 shadow-2xs space-y-1">
            <div className="flex items-center gap-1.5 text-[11px] text-neutral-500 font-medium">
              <RiCoinsLine className="h-3.5 w-3.5 text-neutral-400" />
              <span>Run Cost</span>
            </div>
            <div className="text-sm font-semibold font-mono text-neutral-900">
              ${report.cost.estimated_cost_usd.toFixed(4)} USD
            </div>
            <div className="text-[10px] text-neutral-500 truncate" title={report.cost.pricing_model}>
              {report.total_api_calls} API calls ({report.duration_seconds}s)
            </div>
          </div>

          {/* Balance Remaining Card */}
          <div className="bg-white/95 border border-neutral-200/80 rounded-xl p-3 shadow-2xs space-y-1">
            <div className="flex items-center gap-1.5 text-[11px] text-neutral-500 font-medium">
              <RiWallet3Line className="h-3.5 w-3.5 text-neutral-400" />
              <span>DeepSeek Balance</span>
            </div>
            <div className="text-sm font-semibold font-mono text-neutral-900">
              {report.account.balance_remaining ? `$${report.account.balance_remaining} ${report.account.currency}` : "Active"}
            </div>
            <div className={`text-[10px] ${subtextColor}`}>
              Live account balance
            </div>
          </div>

          {/* Attributed Lines Card */}
          <div className="bg-white/95 border border-neutral-200/80 rounded-xl p-3 shadow-2xs space-y-1">
            <div className="flex items-center gap-1.5 text-[11px] text-neutral-500 font-medium">
              <RiCheckLine className="h-3.5 w-3.5 text-neutral-400" />
              <span>Attributed Lines</span>
            </div>
            <div className="text-sm font-semibold font-mono text-neutral-900">
              {report.breakdown.dialogue_segments.toLocaleString()} <span className="text-xs font-normal text-neutral-500 font-sans">dialogue</span>
            </div>
            <div className={`text-[10px] ${subtextColor}`}>
              {report.breakdown.characters_synced?.length || 0} characters synced
            </div>
          </div>
        </div>
      </div>
    );
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
            {report && (
              <>
                <button
                  type="button"
                  onClick={handleDownloadReport}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-red-200 text-red-900 text-xs font-semibold hover:bg-red-100/60 transition-colors shadow-2xs cursor-pointer"
                  title="Download JSON Report"
                >
                  <RiDownloadLine className="h-3.5 w-3.5" />
                  <span>Report</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowMetrics(!showMetrics)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-red-200 text-red-800 text-xs font-medium hover:bg-red-100/60 transition-colors cursor-pointer"
                >
                  <span>{showMetrics ? "Hide Metrics" : "View Metrics"}</span>
                  {showMetrics ? <RiArrowUpSLine className="h-3.5 w-3.5" /> : <RiArrowDownSLine className="h-3.5 w-3.5" />}
                </button>
              </>
            )}

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

        {renderMetricsGrid("border-red-200/70", "text-red-500")}
      </div>
    );
  }

  if (isCancelled) {
    return (
      <div className="rounded-2xl border border-amber-200/90 bg-amber-50/60 p-4.5 shadow-2xs space-y-3.5 transition-all animate-in fade-in">
        {/* Top Header */}
        <div className="flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
              <RiStopLine className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-amber-950">
                  Dialogue Tagging Cancelled
                </span>
                <span className="px-1.5 py-0.5 rounded bg-amber-200/70 text-amber-900 text-[10px] font-mono font-medium">
                  {report?.model || "deepseek-chat"}
                </span>
              </div>
              <p className="text-[11px] text-amber-800 font-medium">
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
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-amber-300/80 text-amber-950 text-xs font-semibold hover:bg-amber-100/60 transition-colors shadow-2xs cursor-pointer"
                  title="Download Partial JSON Report"
                >
                  <RiDownloadLine className="h-3.5 w-3.5" />
                  <span>Download Report</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowMetrics(!showMetrics)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-amber-300/80 text-amber-900 text-xs font-medium hover:bg-amber-100/60 transition-colors cursor-pointer"
                >
                  <span>{showMetrics ? "Hide Metrics" : "View Metrics"}</span>
                  {showMetrics ? <RiArrowUpSLine className="h-3.5 w-3.5" /> : <RiArrowDownSLine className="h-3.5 w-3.5" />}
                </button>
              </>
            )}

            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-900 text-white text-xs font-semibold hover:bg-neutral-800 transition-colors shadow-2xs cursor-pointer"
            >
              <RiRestartLine className="h-3.5 w-3.5" />
              <span>Resume Tagging</span>
            </button>

            {onDismiss && (
              <button
                type="button"
                onClick={onDismiss}
                className="text-amber-500 hover:text-amber-900 p-1 rounded-lg transition-colors cursor-pointer"
                title="Dismiss"
              >
                <RiCloseLine className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {renderMetricsGrid("border-amber-200/80", "text-amber-700")}
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

  // Completed State with LLM Report
  return (
    <div className="rounded-2xl border border-emerald-200/90 bg-emerald-50/50 p-4.5 shadow-2xs space-y-3.5 transition-all animate-in fade-in">
      {/* Top Header */}
      <div className="flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
            <RiCheckLine className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-emerald-950">
                Dialogue Tagging Complete (100%)
              </span>
              <span className="px-1.5 py-0.5 rounded bg-emerald-200/70 text-emerald-900 text-[10px] font-mono font-medium">
                {report?.model || "deepseek-chat"}
              </span>
            </div>
            <p className="text-[11px] text-emerald-700 font-medium">
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
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-emerald-200 text-emerald-900 text-xs font-semibold hover:bg-emerald-100/60 transition-colors shadow-2xs cursor-pointer"
                title="Download JSON Report"
              >
                <RiDownloadLine className="h-3.5 w-3.5" />
                <span>Download Report</span>
              </button>

              <button
                type="button"
                onClick={() => setShowMetrics(!showMetrics)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-emerald-200 text-emerald-800 text-xs font-medium hover:bg-emerald-100/60 transition-colors cursor-pointer"
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
              className="text-emerald-500 hover:text-emerald-900 p-1 rounded-lg transition-colors cursor-pointer"
              title="Dismiss"
            >
              <RiCloseLine className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {renderMetricsGrid("border-emerald-200/70", "text-emerald-700")}
    </div>
  );
}
