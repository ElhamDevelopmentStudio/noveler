import { useState } from "react";
import {
  RiPulseLine,
  RiCheckLine,
  RiStopLine,
  RiRefreshLine,
  RiLoader4Line,
} from "@remixicon/react";
import type { StageBJob } from "@novelova/shared-types";
import { stopStageB, stepStageB } from "@/services/stage-b";

interface StageBStatusPopoverProps {
  job: StageBJob;
  projectId: string;
  open: boolean;
  onClose: () => void;
  onJobUpdated?: (updatedJob: StageBJob) => void;
}

export function StageBStatusPopover({
  job,
  projectId,
  open,
  onClose,
  onJobUpdated,
}: StageBStatusPopoverProps) {
  const [isStopping, setIsStopping] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  if (!open) return null;

  const handleStop = async () => {
    setIsStopping(true);
    try {
      const updated = await stopStageB(projectId);
      onJobUpdated?.(updated);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to stop job");
    } finally {
      setIsStopping(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      // Advance by 1 step on refresh to show live simulated batch activity
      const updated = await stepStageB(projectId);
      onJobUpdated?.(updated);
    } catch {
      // Ignore refresh error
    } finally {
      setIsRefreshing(false);
    }
  };

  const isRunning = job.status === "running";

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Popover Card */}
      <div className="absolute right-0 top-full mt-2 w-[380px] sm:w-[430px] rounded-2xl border border-neutral-200 bg-white shadow-xl p-5 z-50 select-none animate-in fade-in-0 zoom-in-95 duration-150">
        {/* Header Row */}
        <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-neutral-100/80 border border-neutral-200/60 flex items-center justify-center text-neutral-700 shadow-2xs shrink-0">
              <RiPulseLine className="h-4.5 w-4.5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-neutral-900 leading-tight">
                Stage B status
              </h3>
              <div className="flex items-center gap-1.5 text-xs mt-0.5">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    isRunning ? "bg-emerald-500 animate-pulse" : "bg-neutral-400"
                  }`}
                />
                <span
                  className={
                    isRunning
                      ? "text-emerald-700 font-medium"
                      : "text-neutral-500"
                  }
                >
                  {isRunning ? "Running normally" : "Stopped"}
                </span>
              </div>
            </div>
          </div>

          <span className="text-[11px] font-mono font-bold text-neutral-400 tracking-wider">
            {job.job_code}
          </span>
        </div>

        {/* 3-Column Metrics Grid */}
        <div className="py-3 my-3 grid grid-cols-3 gap-2 border-b border-neutral-100 text-left">
          <div>
            <div className="text-[10px] font-bold text-neutral-400 tracking-wider uppercase">
              ELAPSED
            </div>
            <div className="text-xs font-bold text-neutral-900 mt-0.5">
              {job.elapsed_display}
            </div>
          </div>

          <div>
            <div className="text-[10px] font-bold text-neutral-400 tracking-wider uppercase">
              STARTED
            </div>
            <div className="text-xs font-bold text-neutral-900 mt-0.5 truncate">
              {job.started_display}
            </div>
          </div>

          <div>
            <div className="text-[10px] font-bold text-neutral-400 tracking-wider uppercase">
              BATCH
            </div>
            <div className="text-xs font-bold text-neutral-900 mt-0.5">
              {job.current_batch} of {job.total_batches}
            </div>
          </div>
        </div>

        {/* Key-Value Details */}
        <div className="space-y-2 text-xs py-1">
          <div className="flex items-center justify-between">
            <span className="text-neutral-500">Records processed</span>
            <span className="font-semibold text-neutral-900">
              {job.records_processed.toLocaleString()} of ~{job.total_records.toLocaleString()} items
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-neutral-500">Current operation</span>
            <span className="font-semibold text-neutral-900 truncate max-w-[220px]">
              {job.current_operation}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-neutral-500">Recent heartbeat</span>
            <div className="flex items-center gap-1.5 font-medium text-neutral-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span>{job.heartbeat_display}</span>
            </div>
          </div>
        </div>

        {/* Progress Bar & Subtext */}
        <div className="mt-4 pt-3 border-t border-neutral-100">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="font-bold text-neutral-900">Approximate progress</span>
            <span className="font-semibold text-neutral-600">
              ~{Math.round(job.progress_percent)}%
            </span>
          </div>

          <div className="h-2 w-full bg-neutral-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-neutral-800 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(5, job.progress_percent))}%` }}
            />
          </div>

          <p className="text-[11px] text-neutral-400 mt-2 leading-tight">
            Based on completed batches. Work varies by chapter, so no completion time is estimated.
          </p>
        </div>

        {/* Most Recent Step Card */}
        <div className="mt-4 pt-3 border-t border-neutral-100">
          <div className="text-[10px] font-bold text-neutral-400 tracking-wider uppercase mb-2">
            MOST RECENT STEP
          </div>
          <div className="p-3 rounded-xl border border-neutral-100 bg-neutral-50/60 flex items-start gap-2.5">
            <div className="h-4 w-4 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
              <RiCheckLine className="h-3 w-3" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-neutral-800 leading-snug">
                {job.most_recent_step}
              </p>
              <p className="text-[10px] text-neutral-400 mt-0.5">
                {job.heartbeat_display}
              </p>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="mt-5 pt-3 border-t border-neutral-100 flex items-center justify-between">
          <button
            type="button"
            onClick={handleStop}
            disabled={!isRunning || isStopping}
            className="flex items-center gap-1.5 text-xs font-semibold text-destructive hover:text-destructive/80 disabled:opacity-40 transition-colors cursor-pointer"
          >
            {isStopping ? (
              <RiLoader4Line className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <div className="h-3.5 w-3.5 border border-current rounded-xs flex items-center justify-center">
                <RiStopLine className="h-2.5 w-2.5 fill-current" />
              </div>
            )}
            <span>Stop job</span>
          </button>

          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-neutral-200 bg-white text-xs font-semibold text-neutral-700 hover:bg-neutral-50 shadow-2xs transition-colors cursor-pointer"
          >
            <RiRefreshLine
              className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`}
            />
            <span>Refresh</span>
          </button>
        </div>
      </div>
    </>
  );
}
