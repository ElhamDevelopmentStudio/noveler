import { useState, useEffect, useCallback, useMemo } from "react";
import {
  RiCpuLine,
  RiLoader4Line,
  RiCheckLine,
  RiAlertLine,
  RiStopCircleLine,
  RiSparklingLine,
  RiExternalLinkLine,
  RiRefreshLine,
} from "@remixicon/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type {
  Chapter,
  KaggleAccount,
  BatchAudioStatusResponse,
  ChapterPreflightAudioResponse,
} from "@novelova/shared-types";
import {
  generateBatchAudio,
  getBatchAudioStatus,
  cancelBatchAudio,
  preflightChapterAudio,
} from "@/services/chapters";
import { getKaggleAccounts } from "@/services/kaggle";
import { useAuth } from "@/context/auth-context";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { ModelCacheModal } from "./model-cache-modal";

export interface BatchAudioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  chapters: Chapter[];
  onBatchUpdated?: () => void;
}

export function BatchAudioDialog({
  open,
  onOpenChange,
  projectId,
  chapters,
  onBatchUpdated,
}: BatchAudioDialogProps) {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<KaggleAccount[]>([]);
  const [statusData, setStatusData] = useState<BatchAudioStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [modelCacheModalOpen, setModelCacheModalOpen] = useState(false);
  const [pendingPreflight, setPendingPreflight] = useState<ChapterPreflightAudioResponse | null>(null);

  // Configuration options
  const [scope, setScope] = useState<"unsynthesized" | "all">("unsynthesized");
  const [ttsModel, setTtsModel] = useState<string>(
    user?.preferred_tts_model || "kokoro-82m",
  );

  // Load Kaggle accounts pool
  const loadAccounts = useCallback(async () => {
    try {
      const data = await getKaggleAccounts();
      setAccounts(data);
    } catch (err) {
      console.warn("Could not load Kaggle accounts:", err);
    }
  }, []);

  // Poll batch status
  const pollStatus = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await getBatchAudioStatus(projectId);
      setStatusData(res);
      if (onBatchUpdated && res.is_active) {
        onBatchUpdated();
      }
    } catch (err) {
      console.warn("Could not poll batch audio status:", err);
    }
  }, [projectId, onBatchUpdated]);

  // Initial load when dialog opens
  useEffect(() => {
    if (open) {
      setIsLoading(true);
      setErrorMessage(null);
      Promise.all([loadAccounts(), pollStatus()]).finally(() => {
        setIsLoading(false);
      });
    }
  }, [open, loadAccounts, pollStatus]);

  // Active polling loop while running
  useEffect(() => {
    if (!open || !statusData?.is_active) return;
    const interval = setInterval(() => {
      pollStatus();
    }, 3000);
    return () => clearInterval(interval);
  }, [open, statusData?.is_active, pollStatus]);

  // Available active accounts
  const activeAccounts = useMemo(() => {
    return accounts.filter((a) => a.is_active && a.status !== "failed");
  }, [accounts]);

  // Target chapters based on selected scope
  const targetChapters = useMemo(() => {
    if (scope === "unsynthesized") {
      const unComplete = chapters.filter((c) => c.audio_job_status !== "complete");
      return unComplete.length > 0 ? unComplete : chapters;
    }
    return chapters;
  }, [chapters, scope]);

  // Lane partition preview
  const lanePreview = useMemo(() => {
    if (activeAccounts.length === 0 || targetChapters.length === 0) return [];
    const numLanes = Math.min(activeAccounts.length, targetChapters.length);
    const lanes: { account: KaggleAccount; chapters: Chapter[] }[] = [];
    for (let i = 0; i < numLanes; i++) {
      lanes.push({ account: activeAccounts[i], chapters: [] });
    }
    targetChapters.forEach((ch, idx) => {
      lanes[idx % numLanes].chapters.push(ch);
    });
    return lanes;
  }, [activeAccounts, targetChapters]);

  // Launch batch synthesis with preflight cache decision check
  const handleStartBatch = async () => {
    if (targetChapters.length === 0 || activeAccounts.length === 0) return;

    if (ttsModel !== "kokoro-82m" && ttsModel !== "system-native" && targetChapters[0]) {
      try {
        const pf = await preflightChapterAudio(projectId, targetChapters[0].id, {
          preferred_tts_model: ttsModel,
        });
        if (pf && pf.requires_decision) {
          setPendingPreflight(pf);
          setModelCacheModalOpen(true);
          return;
        }
      } catch (err) {
        console.warn("Batch preflight check warning:", err);
      }
    }

    await executeBatchLaunch({ cacheToDataset: true });
  };

  const executeBatchLaunch = async (options: { cacheToDataset: boolean }) => {
    setIsLaunching(true);
    setErrorMessage(null);
    try {
      await generateBatchAudio(projectId, {
        chapter_ids: targetChapters.map((c) => c.id),
        preferred_tts_model: ttsModel,
        allow_dev_offline: false,
        cache_to_dataset: options.cacheToDataset,
      });
      await pollStatus();
      if (onBatchUpdated) {
        onBatchUpdated();
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ||
        (err as Error)?.message ||
        "Failed to launch batch synthesis.";
      setErrorMessage(msg);
    } finally {
      setIsLaunching(false);
    }
  };

  // Cancel running batch
  const handleCancelBatch = async () => {
    setIsCancelling(true);
    setErrorMessage(null);
    try {
      await cancelBatchAudio(projectId);
      await pollStatus();
      if (onBatchUpdated) {
        onBatchUpdated();
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ||
        "Failed to cancel batch audio.";
      setErrorMessage(msg);
    } finally {
      setIsCancelling(false);
    }
  };

  const isBatchActive = Boolean(statusData?.is_active);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden border-border bg-card">
        {/* Header */}
        <div className="p-5 border-b border-border bg-muted/20">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20">
                  <RiCpuLine className="h-5 w-5" />
                </div>
                <div>
                  <DialogTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                    Multi-Account Batch Lane Dispatcher
                    {isBatchActive && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-500/10 text-blue-500 border border-blue-500/20 animate-pulse">
                        Lanes Active
                      </span>
                    )}
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                    Synthesize chapters concurrently across pooled Kaggle accounts with hot VRAM reuse.
                  </DialogDescription>
                </div>
              </div>
            </div>
          </DialogHeader>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Error Message Callout */}
          {errorMessage && (
            <div className="p-3.5 rounded-lg border border-destructive/20 bg-destructive/10 text-destructive text-xs flex items-start gap-2.5">
              <RiAlertLine className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="flex-1 space-y-1">
                <span className="font-semibold">Batch Synthesis Notice</span>
                <p className="leading-relaxed opacity-90">{errorMessage}</p>
              </div>
            </div>
          )}

          {/* Loading initial pool state */}
          {isLoading && !statusData ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-2.5 text-xs text-muted-foreground">
              <RiLoader4Line className="h-6 w-6 animate-spin text-primary" />
              <span>Querying Kaggle account pool & active lanes...</span>
            </div>
          ) : isBatchActive && statusData ? (
            <div className="space-y-5">
              {/* Overall Progress Banner */}
              <div className="p-4 rounded-xl border border-border bg-muted/40 space-y-3">
                <div className="flex items-center justify-between text-xs font-medium">
                  <div className="flex items-center gap-2">
                    <RiLoader4Line className="h-4 w-4 animate-spin text-primary" />
                    <span className="font-semibold text-foreground">
                      Batch Synthesis in Progress
                    </span>
                  </div>
                  <span className="text-muted-foreground font-mono">
                    {statusData.completed_chapters} / {statusData.total_chapters} Chapters ({statusData.progress_percent}%)
                  </span>
                </div>

                {/* Progress bar */}
                <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300 rounded-full"
                    style={{ width: `${Math.max(5, statusData.progress_percent)}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{statusData.lanes.length} Active Dispatch Lane(s)</span>
                  <span className="text-emerald-500 font-medium">
                    Real-time progressive receipts streaming to canvas
                  </span>
                </div>
              </div>

              {/* Concurrent Lanes Grid */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Concurrent Worker Lanes ({statusData.lanes.length})
                </h4>

                <div className="grid grid-cols-1 gap-3">
                  {statusData.lanes.map((lane) => {
                    const isLaneRunning = lane.status === "running";
                    const isLaneComplete = lane.status === "complete";
                    const laneProgressPct =
                      lane.total_chapters > 0
                        ? Math.round((lane.completed_chapters / lane.total_chapters) * 100)
                        : 0;

                    return (
                      <div
                        key={lane.job_id}
                        className={cn(
                          "p-4 rounded-xl border transition-all space-y-3 bg-card",
                          isLaneRunning ? "border-primary/40 shadow-sm" : "border-border/60",
                        )}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          {/* Lane Identity */}
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-primary/10 text-primary border border-primary/20">
                              Lane {lane.lane_index + 1}
                            </span>
                            <span className="text-xs font-mono font-semibold text-foreground">
                              @{lane.account_username}
                            </span>
                            <span className="text-[10px] text-muted-foreground font-mono">
                              ({lane.completed_chapters}/{lane.total_chapters} ch)
                            </span>
                          </div>

                          {/* Lane Status Badge */}
                          {isLaneRunning && (
                            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-500/10 text-blue-500 border border-blue-500/20">
                              <RiLoader4Line className="h-3 w-3 animate-spin" />
                              Active Synthesizing
                            </span>
                          )}
                          {isLaneComplete && (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                              <RiCheckLine className="h-3 w-3" />
                              Completed
                            </span>
                          )}
                        </div>

                        {/* Lane progress bar */}
                        <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className={cn(
                              "h-full transition-all duration-300 rounded-full",
                              isLaneComplete ? "bg-emerald-500" : "bg-primary",
                            )}
                            style={{ width: `${Math.max(4, laneProgressPct)}%` }}
                          />
                        </div>

                        {/* Current Chapter in Lane */}
                        <div className="flex items-center justify-between text-xs">
                          {lane.current_chapter_title ? (
                            <div className="flex items-center gap-1.5 text-muted-foreground truncate">
                              <span className="text-foreground font-medium">Currently:</span>
                              <span className="truncate">
                                Ch. {lane.current_chapter_number} · {lane.current_chapter_title}
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">
                              {isLaneComplete ? "All assigned chapters finished" : "Worker queue initializing..."}
                            </span>
                          )}
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {laneProgressPct}%
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            /* Mode B: Pre-launch Configuration & Lane Preview */
            <div className="space-y-5">
              {/* Active Accounts Pool Check */}
              {activeAccounts.length === 0 ? (
                <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-500 space-y-2 text-xs">
                  <div className="flex items-center gap-2 font-semibold">
                    <RiAlertLine className="h-4 w-4" />
                    <span>No Active Kaggle Accounts Configured</span>
                  </div>
                  <p className="text-amber-500/90 leading-relaxed text-[11px]">
                    To synthesize chapters with GPU acceleration and automatic multi-account lane pooling, please add your Kaggle username and API key in Profile Settings.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs border-amber-500/40 text-amber-500 hover:bg-amber-500/20"
                    asChild
                  >
                    <Link to="/profile?tab=kaggle" onClick={() => onOpenChange(false)}>
                      Open Kaggle Settings <RiExternalLinkLine className="h-3 w-3 ml-1" />
                    </Link>
                  </Button>
                </div>
              ) : (
                <div className="p-3.5 rounded-xl border border-border bg-muted/30 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                      <RiCpuLine className="h-4 w-4" />
                    </div>
                    <div>
                      <span className="font-semibold text-foreground">
                        {activeAccounts.length} Verified Kaggle Account(s) in Pool
                      </span>
                      <p className="text-[11px] text-muted-foreground">
                        Ready to establish {Math.min(activeAccounts.length, targetChapters.length)} parallel synthesis lane(s).
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-muted-foreground hover:text-foreground"
                    onClick={loadAccounts}
                  >
                    <RiRefreshLine className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}

              {/* Controls Grid: Scope & TTS Model */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                {/* Target Scope */}
                <div className="space-y-1.5">
                  <label className="font-medium text-foreground">Target Chapters</label>
                  <NativeSelect
                    value={scope}
                    onChange={(e) => setScope(e.target.value as "unsynthesized" | "all")}
                  >
                    <NativeSelectOption value="unsynthesized">
                      Un-synthesized Only ({chapters.filter((c) => c.audio_job_status !== "complete").length} chapters)
                    </NativeSelectOption>
                    <NativeSelectOption value="all">
                      All Chapters ({chapters.length} chapters)
                    </NativeSelectOption>
                  </NativeSelect>
                  <p className="text-[11px] text-muted-foreground">
                    Chapters to include in this parallel synthesis run.
                  </p>
                </div>

                {/* Stage C TTS Engine */}
                <div className="space-y-1.5">
                  <label className="font-medium text-foreground">TTS Model Engine</label>
                  <NativeSelect
                    value={ttsModel}
                    onChange={(e) => setTtsModel(e.target.value)}
                  >
                    <NativeSelectOption value="kokoro-82m">
                      Kokoro-82M (Fast · 24kHz · Default)
                    </NativeSelectOption>
                    <NativeSelectOption value="chatterbox-turbo">
                      Chatterbox-Turbo (Expressive Flow)
                    </NativeSelectOption>
                    <NativeSelectOption value="fish-speech-1.5">
                      Fish Speech 1.5 (Zero-Shot Expressive)
                    </NativeSelectOption>
                    <NativeSelectOption value="omnivoice">
                      OmniVoice (Multilingual Expressive)
                    </NativeSelectOption>
                    <NativeSelectOption value="orpheustts">
                      OrpheusTTS (Dramatic Prose)
                    </NativeSelectOption>
                    <NativeSelectOption value="vibevoice">
                      VibeVoice (Conversational Pacing)
                    </NativeSelectOption>
                    <NativeSelectOption value="system-native">
                      System-Native (Local Dev Fallback)
                    </NativeSelectOption>
                  </NativeSelect>
                  <p className="text-[11px] text-muted-foreground">
                    Loaded into GPU VRAM for the entire batch.
                  </p>
                </div>
              </div>

              {/* Lane Distribution Preview */}
              {lanePreview.length > 0 && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Lane Distribution Preview ({lanePreview.length} Lanes)
                    </h4>
                    <span className="text-[11px] text-muted-foreground">
                      {targetChapters.length} Total Chapters
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {lanePreview.map((lane, idx) => (
                      <div
                        key={lane.account.id}
                        className="p-3 rounded-lg border border-border bg-card/60 space-y-2"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold font-mono text-primary flex items-center gap-1.5">
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-primary/10 border border-primary/20">
                              Lane {idx + 1}
                            </span>
                            @{lane.account.username}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {lane.chapters.length} chapters
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                          {lane.chapters.map((c) => (
                            <span
                              key={c.id}
                              className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono text-muted-foreground border border-border/60"
                              title={c.title}
                            >
                              Ch. {c.chapter_number}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-border bg-muted/20 flex flex-wrap items-center justify-between gap-3">
          {isBatchActive ? (
            <>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleCancelBatch}
                disabled={isCancelling}
                className="h-9 px-4 text-xs font-medium"
              >
                {isCancelling ? (
                  <RiLoader4Line className="h-4 w-4 animate-spin mr-1.5" />
                ) : (
                  <RiStopCircleLine className="h-4 w-4 mr-1.5" />
                )}
                Cancel Batch Synthesis
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                className="h-9 px-4 text-xs font-medium ml-auto"
              >
                Run in Background
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
                className="h-9 px-4 text-xs font-medium text-muted-foreground"
              >
                Close
              </Button>

              <Button
                type="button"
                size="sm"
                onClick={handleStartBatch}
                disabled={isLaunching || activeAccounts.length === 0 || targetChapters.length === 0}
                className="h-9 px-5 text-xs font-medium bg-primary text-primary-foreground ml-auto"
              >
                {isLaunching ? (
                  <>
                    <RiLoader4Line className="h-4 w-4 animate-spin mr-1.5" />
                    Dispatching Lanes...
                  </>
                ) : (
                  <>
                    <RiSparklingLine className="h-4 w-4 mr-1.5" />
                    Launch Batch Synthesis ({targetChapters.length} Chapters)
                  </>
                )}
              </Button>
            </>
          )}
        </div>

        {pendingPreflight && (
          <ModelCacheModal
            open={modelCacheModalOpen}
            onOpenChange={setModelCacheModalOpen}
            modelId={pendingPreflight.model_id}
            modelName={pendingPreflight.model_name}
            sizeMb={pendingPreflight.size_mb}
            kaggleAccountUsername={pendingPreflight.kaggle_account_username}
            onConfirm={(opts) => executeBatchLaunch(opts)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

export default BatchAudioDialog;
