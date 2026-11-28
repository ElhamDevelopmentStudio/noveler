import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import {
  RiCheckboxCircleLine,
  RiErrorWarningLine,
  RiExternalLinkLine,
  RiLoader4Line,
  RiRefreshLine,
  RiStopCircleLine,
} from "@remixicon/react";
import type {
  BatchAudioStatusResponse,
  ParseJob,
  SfxCueJob,
  SfxDesignJob,
  TaggingJob,
  VoiceDesignJob,
} from "@novelova/shared-types";
import {
  cancelBatchAudio,
  generateBatchAudio,
  getBatchAudioStatus,
} from "@/services/chapters";
import { listProjectSfxCueJobs, listProjectSfxDesignJobs } from "@/services/sfx";
import { listProjectVoiceDesignJobs } from "@/services/voice-design";
import { useConfirm } from "@/components/ui/confirm-dialog";

interface WorkspaceRunsViewProps {
  projectId: string;
  parseJob: ParseJob | null | undefined;
  formatJob: ParseJob | null | undefined;
  taggingHistory: TaggingJob[];
  onOpenTaggingHistory: () => void;
  onRefreshChapters: () => void;
}

export function WorkspaceRunsView({
  projectId,
  parseJob,
  formatJob,
  taggingHistory,
  onOpenTaggingHistory,
  onRefreshChapters,
}: WorkspaceRunsViewProps) {
  const [retryingLaneId, setRetryingLaneId] = useState<string | null>(null);
  const [cancellingBatch, setCancellingBatch] = useState(false);

  const {
    data: batchStatus,
    mutate: mutateBatchStatus,
  } = useSWR<BatchAudioStatusResponse>(
    projectId ? `/projects/${projectId}/batch-audio/status` : null,
    () => getBatchAudioStatus(projectId),
    {
      refreshInterval: (data) => (data?.is_active ? 4000 : 0),
      revalidateOnFocus: false,
    },
  );

  const {
    data: voiceDesignJobs = [],
    mutate: mutateVoiceDesignJobs,
  } = useSWR<VoiceDesignJob[]>(
    projectId ? `/projects/${projectId}/voice-design/jobs` : null,
    () => listProjectVoiceDesignJobs(projectId),
    {
      refreshInterval: (jobs) =>
        jobs?.some((j) => j.status === "pending" || j.status === "running") ? 5000 : 0,
      revalidateOnFocus: false,
    },
  );

  const {
    data: sfxDesignJobs = [],
    mutate: mutateSfxDesignJobs,
  } = useSWR<SfxDesignJob[]>(
    projectId ? `/projects/${projectId}/sfx-design/jobs` : null,
    () => listProjectSfxDesignJobs(projectId),
    {
      refreshInterval: (jobs) =>
        jobs?.some((j) => j.status === "pending" || j.status === "running") ? 5000 : 0,
      revalidateOnFocus: false,
    },
  );

  const {
    data: sfxCueJobs = [],
    mutate: mutateSfxCueJobs,
  } = useSWR<SfxCueJob[]>(
    projectId ? `/sfx/projects/${projectId}/auto-cue/jobs` : null,
    () => listProjectSfxCueJobs(projectId),
    {
      refreshInterval: (jobs) =>
        jobs?.some((j) => j.status === "pending" || j.status === "running") ? 4000 : 0,
      revalidateOnFocus: false,
    },
  );

  const handleRetryLane = async (jobId: string, chapterIds: string[]) => {
    setRetryingLaneId(jobId);
    try {
      await generateBatchAudio(projectId, { chapter_ids: chapterIds });
      await mutateBatchStatus();
      onRefreshChapters();
      toast.success(`Re-dispatched ${chapterIds.length} chapter(s) to Kaggle GPU.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to retry lane.");
    } finally {
      setRetryingLaneId(null);
    }
  };

  const confirm = useConfirm();

  const handleCancelBatch = async () => {
    const confirmed = await confirm({
      title: "Cancel batch audio synthesis?",
      description:
        "All queued and in-progress chapter audio jobs in this batch will be stopped.",
      confirmLabel: "Cancel batch",
      variant: "destructive",
    });
    if (!confirmed) return;
    setCancellingBatch(true);
    try {
      await cancelBatchAudio(projectId);
      await mutateBatchStatus();
      onRefreshChapters();
      toast.success("Batch audio synthesis cancelled.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to cancel batch.");
    } finally {
      setCancellingBatch(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6 bg-background">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl text-foreground">
              Runs &amp; History
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Unified live status and history across Audio Synthesis, Voice Design, Tagging, and Parsing.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              mutateBatchStatus();
              mutateVoiceDesignJobs();
              mutateSfxDesignJobs();
              mutateSfxCueJobs();
              onRefreshChapters();
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-secondary text-xs font-medium text-foreground cursor-pointer"
          >
            <RiRefreshLine className="h-3.5 w-3.5" />
            <span>Refresh</span>
          </button>
        </div>

        {/* 1. Audio Synthesis Lanes */}
        <section className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Audio Synthesis Lanes
            </h2>
            {batchStatus?.is_active && (
              <button
                type="button"
                onClick={handleCancelBatch}
                disabled={cancellingBatch}
                className="inline-flex items-center gap-1 text-xs font-medium text-destructive hover:underline cursor-pointer disabled:opacity-50"
              >
                <RiStopCircleLine className="h-3.5 w-3.5" />
                <span>{cancellingBatch ? "Cancelling..." : "Cancel batch"}</span>
              </button>
            )}
          </div>
          {!batchStatus || batchStatus.lanes.length === 0 ? (
            <div className="py-8 text-center border-t border-b border-border text-xs text-muted-foreground">
              No audio synthesis lanes recorded yet.
            </div>
          ) : (
            <div className="border-t border-b border-border divide-y divide-border text-xs">
              {batchStatus.lanes.map((lane) => (
                <div
                  key={lane.job_id}
                  className="py-3 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-sm text-foreground flex items-center gap-2">
                      <span>Lane {lane.lane_index + 1}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        @{lane.account_username}
                      </span>
                    </div>
                    <div className="text-muted-foreground mt-0.5 truncate">
                      {lane.current_chapter_title
                        ? `Current: ${lane.current_chapter_title}`
                        : `${lane.completed_chapters} of ${lane.total_chapters} chapters completed`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <span
                      className={
                        lane.status === "failed"
                          ? "text-destructive font-medium"
                          : lane.status === "complete"
                            ? "text-emerald-600 dark:text-emerald-400 font-medium"
                            : "text-blue-600 dark:text-blue-400 font-medium flex items-center gap-1"
                      }
                    >
                      {lane.status === "running" && (
                        <RiLoader4Line className="h-3.5 w-3.5 animate-spin" />
                      )}
                      {lane.completed_chapters}/{lane.total_chapters} · {lane.status}
                    </span>
                    {lane.status === "failed" && lane.chapter_ids.length > 0 && (
                      <button
                        type="button"
                        disabled={retryingLaneId === lane.job_id}
                        onClick={() => handleRetryLane(lane.job_id, lane.chapter_ids)}
                        className="px-2.5 py-1 rounded-lg border border-border bg-card hover:bg-secondary text-foreground font-medium cursor-pointer disabled:opacity-50"
                      >
                        {retryingLaneId === lane.job_id ? "Retrying..." : "Retry"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 2. AI Voice Design Jobs (Persisted across modal close) */}
        <section className="space-y-2.5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            AI Voice Design Jobs ({voiceDesignJobs.length})
          </h2>
          {voiceDesignJobs.length === 0 ? (
            <div className="py-8 text-center border-t border-b border-border text-xs text-muted-foreground">
              No AI Voice Design runs yet.
            </div>
          ) : (
            <div className="border-t border-b border-border divide-y divide-border text-xs">
              {voiceDesignJobs.map((job) => (
                <div
                  key={job.id}
                  className="py-3 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-sm text-foreground">
                      Voice Design ({job.completed_characters}/{job.total_characters} characters)
                    </div>
                    <div className="text-muted-foreground mt-0.5 truncate">
                      {job.error_message || job.current_step || `Status: ${job.status}`}
                    </div>
                  </div>
                  <span
                    className={
                      job.status === "failed"
                        ? "text-destructive font-medium shrink-0"
                        : job.status === "completed"
                          ? "text-emerald-600 dark:text-emerald-400 font-medium shrink-0"
                          : "text-blue-600 dark:text-blue-400 font-medium shrink-0"
                    }
                  >
                    {job.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 2.5. AI SFX Design Jobs (TangoFlux — Persisted across modal close) */}
        <section className="space-y-2.5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            AI SFX Design Jobs ({sfxDesignJobs.length})
          </h2>
          {sfxDesignJobs.length === 0 ? (
            <div className="py-8 text-center border-t border-b border-border text-xs text-muted-foreground">
              No AI SFX Design runs yet.
            </div>
          ) : (
            <div className="border-t border-b border-border divide-y divide-border text-xs">
              {sfxDesignJobs.map((job) => (
                <div
                  key={job.id}
                  className="py-3 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-sm text-foreground">
                      TangoFlux SFX ({job.completed_items}/{job.total_items} sounds)
                    </div>
                    <div className="text-muted-foreground mt-0.5 truncate">
                      {job.error_message || job.current_step || `Status: ${job.status}`}
                    </div>
                  </div>
                  <span
                    className={
                      job.status === "failed"
                        ? "text-destructive font-medium shrink-0"
                        : job.status === "completed"
                          ? "text-emerald-600 dark:text-emerald-400 font-medium shrink-0"
                          : "text-blue-600 dark:text-blue-400 font-medium shrink-0"
                    }
                  >
                    {job.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 2.6. AI SFX Script Scan Jobs (Async) */}
        <section className="space-y-2.5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            AI SFX Script Scan Jobs ({sfxCueJobs.length})
          </h2>
          {sfxCueJobs.length === 0 ? (
            <div className="py-8 text-center border-t border-b border-border text-xs text-muted-foreground">
              No AI SFX script scan runs yet.
            </div>
          ) : (
            <div className="border-t border-b border-border divide-y divide-border text-xs">
              {sfxCueJobs.map((job) => (
                <div
                  key={job.id}
                  className="py-3 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-sm text-foreground">
                      SFX Script Scan ({job.processed_chapters}/{job.total_chapters} chapters · {job.progress_percentage}%)
                    </div>
                    <div className="text-muted-foreground mt-0.5 truncate">
                      {job.error_message || job.current_step || `Status: ${job.status}`}
                    </div>
                  </div>
                  <span
                    className={
                      job.status === "failed"
                        ? "text-destructive font-medium shrink-0"
                        : job.status === "completed"
                          ? "text-emerald-600 dark:text-emerald-400 font-medium shrink-0"
                          : "text-blue-600 dark:text-blue-400 font-medium shrink-0"
                    }
                  >
                    {job.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 3. Dialogue Tagging Runs */}
        <section className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Speaker Detection Runs ({taggingHistory.length})
            </h2>
            {taggingHistory.length > 0 && (
              <button
                type="button"
                onClick={onOpenTaggingHistory}
                className="inline-flex items-center gap-1 text-xs font-medium text-foreground hover:underline cursor-pointer"
              >
                <span>Open Full Economics &amp; JSON Trace</span>
                <RiExternalLinkLine className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {taggingHistory.length === 0 ? (
            <div className="py-8 text-center border-t border-b border-border text-xs text-muted-foreground">
              No speaker detection runs yet.
            </div>
          ) : (
            <div className="border-t border-b border-border divide-y divide-border text-xs">
              {taggingHistory.slice(0, 8).map((run) => (
                <div
                  key={run.id}
                  className="py-3 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-sm text-foreground flex items-center gap-1.5">
                      {run.status === "completed" ? (
                        <RiCheckboxCircleLine className="h-4 w-4 text-emerald-500 shrink-0" />
                      ) : run.status === "failed" ? (
                        <RiErrorWarningLine className="h-4 w-4 text-destructive shrink-0" />
                      ) : (
                        <RiLoader4Line className="h-4 w-4 animate-spin text-blue-500 shrink-0" />
                      )}
                      <span>
                        {run.processed_chapters}/{run.total_chapters} chapters ·{" "}
                        {run.processed_segments} segments
                      </span>
                    </div>
                    {run.error_message && (
                      <div className="text-destructive mt-0.5 truncate">
                        {run.error_message}
                      </div>
                    )}
                  </div>
                  <span className="text-muted-foreground capitalize shrink-0">
                    {run.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 4. Latest Parse / Format Jobs */}
        {(parseJob || formatJob) && (
          <section className="space-y-2.5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Manuscript Parse &amp; Format
            </h2>
            <div className="border-t border-b border-border divide-y divide-border text-xs">
              {parseJob && (
                <div className="py-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium text-foreground">Parse Manuscript</div>
                    <div className="text-muted-foreground">
                      {parseJob.error_message || parseJob.current_step || `${parseJob.processed_chapters} chapters`}
                    </div>
                  </div>
                  <span className="capitalize text-muted-foreground">{parseJob.status}</span>
                </div>
              )}
              {formatJob && (
                <div className="py-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium text-foreground">Format Script</div>
                    <div className="text-muted-foreground">
                      {formatJob.error_message || formatJob.current_step || `${formatJob.processed_segments} segments`}
                    </div>
                  </div>
                  <span className="capitalize text-muted-foreground">{formatJob.status}</span>
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
