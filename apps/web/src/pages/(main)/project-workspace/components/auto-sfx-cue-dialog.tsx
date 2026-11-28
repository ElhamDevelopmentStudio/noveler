import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  RiAddLine,
  RiCheckLine,
  RiDeleteBinLine,
  RiLoader4Line,
  RiPauseFill,
  RiPlayFill,
  RiSparklingLine,
  RiVolumeUpLine,
} from "@remixicon/react";
import type {
  AutoSfxAtmosphereSpan,
  AutoSfxChapterPlan,
  AutoSfxCueResponse,
  AutoSfxFoleyCue,
  AutoSfxMatchedAsset,
  AutoSfxProposedAsset,
  Chapter,
  FoleyCueAction,
  SFXCategory,
  SfxCueJob,
  SfxDesignItemInput,
  SfxDesignJob,
  SFXItem,
} from "@novelova/shared-types";
import { getChapters } from "@/services/chapters";
import {
  applyReviewedSfxPlan,
  getAutoSfxCueJob,
  getSfxDesignJob,
  listProjectSfxCueJobs,
  startAutoSfxCueJob,
  startSfxDesignJob,
} from "@/services/sfx";
import { cn } from "@/lib/utils";

export interface AutoSfxCueDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplied?: () => void;
  initialRegenerateItem?: SFXItem | null;
}

interface EditableProposedAsset extends AutoSfxProposedAsset {
  approved: boolean;
  is_global: boolean;
}

interface EditableFoleyCue extends AutoSfxFoleyCue {
  cue_key: string;
  chapter_number: number;
  chapter_title: string;
  approved: boolean;
}

interface EditableAtmosphereSpan extends AutoSfxAtmosphereSpan {
  span_key: string;
  chapter_number: number;
  chapter_title: string;
  approved: boolean;
}

interface CustomPromptRow {
  row_id: string;
  name: string;
  prompt: string;
  category: SFXCategory;
  duration_seconds: number;
  is_global: boolean;
  replace_sfx_id?: string | null;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildInlineReplacePreview(text: string, targetText: string): {
  before: string;
  matched: string;
  after: string;
} {
  if (!text) return { before: "", matched: targetText, after: "" };
  const cleanTarget = (targetText || "").trim();
  if (!cleanTarget) return { before: "", matched: "", after: text };
  const re = new RegExp(`(${escapeRegex(cleanTarget)}[!?.,;:—\\-]*)`, "i");
  const match = re.exec(text);
  if (!match || match.index === undefined) {
    return { before: "", matched: cleanTarget, after: text };
  }
  const before = text.slice(0, match.index).replace(/[,;:\s—\-]+$/, "").trim();
  const after = text
    .slice(match.index + match[0].length)
    .replace(/^[,;:\s—\-]+/, "")
    .trim();
  return { before, matched: match[0], after };
}

export function AutoSfxCueDialog({
  projectId,
  open,
  onOpenChange,
  onApplied,
  initialRegenerateItem = null,
}: AutoSfxCueDialogProps) {
  const { data: chapters = [] } = useSWR<Chapter[]>(
    open ? `/projects/${projectId}/chapters-for-sfx` : null,
    () => getChapters(projectId),
    { revalidateOnFocus: false },
  );

  // Top-level mode: script scan vs manual TangoFlux prompts
  const [mode, setMode] = useState<"scan" | "custom">("scan");
  const [reviewTab, setReviewTab] = useState<"assets" | "placements">("assets");

  // Path A: Scan configuration
  const [selectedChapterIds, setSelectedChapterIds] = useState<string[]>([]);
  const [includeFoley, setIncludeFoley] = useState(true);
  const [includeAtmosphere, setIncludeAtmosphere] = useState(true);
  const [proposeMissing, setProposeMissing] = useState(true);
  const [autoApplyCues, setAutoApplyCues] = useState(true);
  const [cacheToDataset, setCacheToDataset] = useState(true);

  // Path A: Review state
  const [hasScanned, setHasScanned] = useState(false);
  const [matchedAssets, setMatchedAssets] = useState<AutoSfxMatchedAsset[]>([]);
  const [proposedAssets, setProposedAssets] = useState<EditableProposedAsset[]>([]);
  const [foleyCues, setFoleyCues] = useState<EditableFoleyCue[]>([]);
  const [atmosphereSpans, setAtmosphereSpans] = useState<EditableAtmosphereSpan[]>([]);

  // Path B: Custom TangoFlux prompt rows
  const [customRows, setCustomRows] = useState<CustomPromptRow[]>([
    {
      row_id: "row-1",
      name: "",
      prompt: "",
      category: "foley",
      duration_seconds: 3,
      is_global: false,
    },
  ]);

  // Execution & Job tracking state
  const [isScanning, setIsScanning] = useState(false);
  const [activeScanJob, setActiveScanJob] = useState<SfxCueJob | null>(null);
  const [latestCompletedScan, setLatestCompletedScan] = useState<SfxCueJob | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeJob, setActiveJob] = useState<SfxDesignJob | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hydrateReviewFromPlan = (res: AutoSfxCueResponse) => {
    setMatchedAssets(res.matched_assets || []);
    setProposedAssets(
      (res.proposed_assets || []).map((a) => ({
        ...a,
        approved: true,
        is_global: false,
      })),
    );

    const flatFoley: EditableFoleyCue[] = [];
    const flatAtmo: EditableAtmosphereSpan[] = [];
    (res.plans || []).forEach((plan: AutoSfxChapterPlan) => {
      (plan.foley_cues || []).forEach((fc, idx) => {
        flatFoley.push({
          ...fc,
          action: fc.action || "replace",
          cue_key: `${plan.chapter_id}-${fc.segment_id}-${idx}`,
          chapter_number: plan.chapter_number,
          chapter_title: plan.chapter_title,
          approved: true,
        });
      });
      (plan.atmosphere_spans || []).forEach((sp, idx) => {
        flatAtmo.push({
          ...sp,
          span_key: `${plan.chapter_id}-${sp.start_segment_id}-${idx}`,
          chapter_number: plan.chapter_number,
          chapter_title: plan.chapter_title,
          approved: true,
        });
      });
    });

    setFoleyCues(flatFoley);
    setAtmosphereSpans(flatAtmo);
    setHasScanned(true);
    setReviewTab(
      (res.proposed_assets?.length || 0) > 0 ? "assets" : "placements",
    );
    setResultMessage(res.message);
  };

  // Audition audio preview for matched assets
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!open) {
      if (audioRef.current) audioRef.current.pause();
      setPlayingUrl(null);
      return;
    }
    setError(null);
    setResultMessage(null);
    if (initialRegenerateItem) {
      setMode("custom");
      setCustomRows([
        {
          row_id: `retake-${initialRegenerateItem.id}`,
          name: initialRegenerateItem.name,
          prompt:
            initialRegenerateItem.category === "atmosphere"
              ? `Continuous ambient ${initialRegenerateItem.name.toLowerCase()}, natural spatial texture, no speech`
              : `Crisp realistic sound effect of ${initialRegenerateItem.name.toLowerCase()}, clean studio foley, no speech`,
          category: initialRegenerateItem.category,
          duration_seconds:
            initialRegenerateItem.category === "atmosphere" ? 20 : 3,
          is_global: initialRegenerateItem.is_global,
          replace_sfx_id: initialRegenerateItem.id,
        },
      ]);
    } else {
      setMode("scan");
      // Check for an in-flight or recently completed async scan job
      listProjectSfxCueJobs(projectId)
        .then((jobs) => {
          const running = jobs.find((j) => j.status === "pending" || j.status === "running");
          if (running) {
            setActiveScanJob(running);
            return;
          }
          const latestDone = jobs.find((j) => j.status === "completed" && j.result_plan);
          if (latestDone) {
            setLatestCompletedScan(latestDone);
          }
        })
        .catch(() => {
          // Non-fatal
        });
    }
  }, [open, initialRegenerateItem, projectId]);

  // Poll active async SFX script scan job while modal is open
  useEffect(() => {
    if (
      !open ||
      !activeScanJob?.id ||
      ["completed", "failed", "cancelled"].includes(activeScanJob.status)
    ) {
      return;
    }
    let cancelled = false;
    const jobId = activeScanJob.id;
    const timer = window.setInterval(async () => {
      try {
        const updated = await getAutoSfxCueJob(jobId);
        if (cancelled) return;
        setActiveScanJob(updated);
        if (updated.status === "completed" && updated.result_plan) {
          setLatestCompletedScan(updated);
          hydrateReviewFromPlan(updated.result_plan);
          toast.success("SFX script scan complete — ready for review!");
        } else if (updated.status === "failed") {
          setError(updated.error_message || "SFX script scan failed");
        }
      } catch {
        // Keep polling transiently
      }
    }, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [open, activeScanJob?.id, activeScanJob?.status]);

  // Poll active TangoFlux Kaggle job while modal is open
  useEffect(() => {
    if (
      !open ||
      !activeJob?.id ||
      ["completed", "failed", "cancelled"].includes(activeJob.status)
    ) {
      return;
    }
    let cancelled = false;
    const jobId = activeJob.id;
    const timer = window.setInterval(async () => {
      try {
        const updated = await getSfxDesignJob(jobId);
        if (cancelled) return;
        setActiveJob(updated);
        if (updated.status === "completed") {
          toast.success("TangoFlux SFX generation complete!");
          onApplied?.();
        } else if (updated.status === "failed") {
          setError(updated.error_message || "SFX generation job failed");
        }
      } catch {
        // Keep polling transiently
      }
    }, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [open, activeJob?.id, activeJob?.status, onApplied]);

  const approvedNewAssets = useMemo(
    () => proposedAssets.filter((a) => a.approved),
    [proposedAssets],
  );
  const approvedAssetKeys = useMemo(
    () => new Set(approvedNewAssets.map((a) => a.asset_key)),
    [approvedNewAssets],
  );
  const approvedFoleyCues = useMemo(
    () =>
      foleyCues.filter(
        (c) =>
          c.approved &&
          (!c.is_new_asset || (c.asset_key && approvedAssetKeys.has(c.asset_key))),
      ),
    [foleyCues, approvedAssetKeys],
  );
  const approvedAtmoSpans = useMemo(
    () =>
      atmosphereSpans.filter(
        (s) =>
          s.approved &&
          (!s.is_new_asset || (s.asset_key && approvedAssetKeys.has(s.asset_key))),
      ),
    [atmosphereSpans, approvedAssetKeys],
  );

  if (!open) return null;

  const togglePlay = (url: string) => {
    if (!url || !audioRef.current) return;
    if (playingUrl === url) {
      audioRef.current.pause();
      setPlayingUrl(null);
      return;
    }
    audioRef.current.src = url;
    audioRef.current
      .play()
      .then(() => setPlayingUrl(url))
      .catch(() => setPlayingUrl(null));
  };

  const toggleChapter = (id: string) => {
    setSelectedChapterIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleScanChapters = async () => {
    if (selectedChapterIds.length === 0) return;
    setIsScanning(true);
    setError(null);
    setResultMessage(null);
    try {
      const job = await startAutoSfxCueJob(projectId, {
        chapter_ids: selectedChapterIds,
        include_foley: includeFoley,
        include_atmosphere: includeAtmosphere,
        propose_missing_assets: proposeMissing,
      });
      setActiveScanJob(job);
      toast.success(
        `SFX scan started for ${selectedChapterIds.length} chapter(s). Safe to close — tracked in Runs View.`,
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to start SFX scan job");
    } finally {
      setIsScanning(false);
    }
  };

  const handleCommitReviewedPlan = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const pendingCues = approvedFoleyCues.map((c) => ({
        segment_id: c.segment_id,
        sfx_id: c.sfx_id || undefined,
        asset_key: c.asset_key || undefined,
        sfx_name: c.sfx_name,
        target_text: c.target_text,
        action: c.action,
        volume: c.volume,
      }));
      const pendingSpans = approvedAtmoSpans.map((s) => ({
        start_segment_id: s.start_segment_id,
        end_segment_id: s.end_segment_id,
        segment_ids: s.segment_ids,
        sfx_id: s.sfx_id || undefined,
        asset_key: s.asset_key || undefined,
        sfx_name: s.sfx_name,
        volume: s.volume,
      }));

      if (approvedNewAssets.length === 0) {
        const res = await applyReviewedSfxPlan(projectId, {
          foley_cues: pendingCues,
          atmosphere_spans: pendingSpans,
        });
        toast.success(res.message);
        setResultMessage(res.message);
        onApplied?.();
      } else {
        const items: SfxDesignItemInput[] = approvedNewAssets.map((a) => ({
          asset_key: a.asset_key,
          name: a.name,
          prompt: a.prompt,
          category: a.category,
          duration_seconds: a.duration_seconds,
          default_volume: a.default_volume,
          triggers: a.triggers,
          is_global: a.is_global,
        }));
        const job = await startSfxDesignJob({
          project_id: projectId,
          items,
          pending_cues: pendingCues,
          pending_atmosphere_spans: pendingSpans,
          auto_apply_cues: autoApplyCues,
          cache_to_dataset: cacheToDataset,
        });
        setActiveJob(job);
        toast.success(
          `Dispatched TangoFlux job for ${items.length} sound(s). Safe to close — tracked in Runs View.`,
        );
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to commit SFX plan");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLaunchCustomBatch = async () => {
    const valid = customRows.filter((r) => r.name.trim() && r.prompt.trim());
    if (valid.length === 0) {
      setError("Add at least one sound with a name and TangoFlux prompt.");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const items: SfxDesignItemInput[] = valid.map((r, idx) => ({
        asset_key: `custom_${idx}_${r.row_id}`,
        name: r.name.trim(),
        prompt: r.prompt.trim(),
        category: r.category,
        duration_seconds: r.duration_seconds,
        default_volume: r.category === "atmosphere" ? 0.2 : 0.85,
        is_global: r.is_global,
        replace_sfx_id: r.replace_sfx_id || undefined,
      }));
      const job = await startSfxDesignJob({
        project_id: projectId,
        items,
        auto_apply_cues: false,
        cache_to_dataset: cacheToDataset,
      });
      setActiveJob(job);
      toast.success(
        `TangoFlux job launched for ${items.length} sound(s). Safe to close — tracked in Runs View.`,
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to launch TangoFlux job");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 gap-0 max-h-[88vh] flex flex-col overflow-hidden bg-card border-border">
        <audio
          ref={audioRef}
          onEnded={() => setPlayingUrl(null)}
          onPause={() => setPlayingUrl(null)}
          className="hidden"
        />

        {/* Header */}
        <div className="px-5 py-4 pr-12 border-b border-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <RiSparklingLine className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle className="text-sm font-semibold text-foreground">
                AI Sound Design &amp; Review (TangoFlux 44.1kHz)
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Auto-detect Foley &amp; Atmosphere cues in your script, review inline replacements, or generate custom sounds on Kaggle GPU.
              </p>
            </div>
          </div>
        </div>

        {/* Mode Switcher */}
        <div className="px-5 pt-3 pb-2 border-b border-border/60 flex items-center justify-between gap-2 shrink-0 bg-muted/20">
          <div className="inline-flex rounded-lg border border-border bg-background p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setMode("scan")}
              className={cn(
                "px-3 py-1 rounded-md font-medium transition-colors cursor-pointer",
                mode === "scan"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Scan Script &amp; Review
            </button>
            <button
              type="button"
              onClick={() => setMode("custom")}
              className={cn(
                "px-3 py-1 rounded-md font-medium transition-colors cursor-pointer",
                mode === "custom"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Custom AI Prompts
            </button>
          </div>

          {mode === "scan" && hasScanned && (
            <button
              type="button"
              onClick={() => setHasScanned(false)}
              className="text-xs text-muted-foreground hover:text-foreground underline cursor-pointer"
            >
              Change chapters
            </button>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 px-3 py-2 text-xs text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {resultMessage && !activeJob && (
            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
              <RiCheckLine className="h-3.5 w-3.5 shrink-0" />
              <span>{resultMessage}</span>
            </div>
          )}

          {/* Active Async SFX Scan Job Progress */}
          {activeScanJob && (activeScanJob.status === "pending" || activeScanJob.status === "running") && (
            <div className="rounded-xl border border-blue-200 dark:border-blue-800/60 bg-blue-50/60 dark:bg-blue-950/30 p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-blue-900 dark:text-blue-200">
                <span className="flex items-center gap-1.5">
                  <RiLoader4Line className="h-3.5 w-3.5 animate-spin" />
                  <span>
                    AI Script Scan: <span className="uppercase">{activeScanJob.status}</span> (
                    {activeScanJob.processed_chapters}/{activeScanJob.total_chapters} chapters)
                  </span>
                </span>
                <span>{activeScanJob.progress_percentage}%</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-blue-200/70 dark:bg-blue-900/50 overflow-hidden">
                <div
                  className="h-full bg-blue-600 transition-all"
                  style={{ width: `${activeScanJob.progress_percentage}%` }}
                />
              </div>
              {activeScanJob.current_step && (
                <p className="text-[11px] text-blue-800 dark:text-blue-300">
                  {activeScanJob.current_step}
                </p>
              )}
              <p className="text-[11px] text-muted-foreground">
                Safe to close this dialog — the scan runs asynchronously and persists in Runs View.
              </p>
            </div>
          )}

          {/* Resume Latest Completed Scan Banner */}
          {mode === "scan" && !hasScanned && !activeScanJob && latestCompletedScan?.result_plan && (
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/50 dark:bg-emerald-950/20 px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs">
              <div className="min-w-0">
                <div className="font-semibold text-emerald-900 dark:text-emerald-200">
                  Previous SFX scan ready to review
                </div>
                <div className="text-[11px] text-emerald-800/80 dark:text-emerald-300/80 truncate">
                  {latestCompletedScan.result_plan.message}
                </div>
              </div>
              <button
                type="button"
                onClick={() => hydrateReviewFromPlan(latestCompletedScan.result_plan!)}
                className="px-3 py-1 rounded-lg bg-emerald-600 text-white font-semibold shrink-0 hover:bg-emerald-700 cursor-pointer"
              >
                Open Review
              </button>
            </div>
          )}

          {/* Active Kaggle TangoFlux Job Progress */}
          {activeJob && (
            <div className="rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50/60 dark:bg-amber-950/30 p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-amber-900 dark:text-amber-200">
                <span>
                  TangoFlux Job: <span className="uppercase">{activeJob.status}</span> (
                  {activeJob.completed_items}/{activeJob.total_items} sounds)
                </span>
                <span>{activeJob.progress_percentage}%</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-amber-200/70 dark:bg-amber-900/50 overflow-hidden">
                <div
                  className="h-full bg-amber-600 transition-all"
                  style={{ width: `${activeJob.progress_percentage}%` }}
                />
              </div>
              {activeJob.current_step && (
                <p className="text-[11px] text-amber-800 dark:text-amber-300">
                  {activeJob.current_step}
                </p>
              )}
              <p className="text-[11px] text-muted-foreground">
                Safe to close this dialog — progress is persisted in the Runs View and approved cues auto-apply when complete.
              </p>
            </div>
          )}

          {mode === "scan" && !hasScanned && (
            <>
              <div className="rounded-xl border border-border bg-muted/20 p-3.5 space-y-2.5 text-xs">
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeFoley}
                      onChange={(e) => setIncludeFoley(e.target.checked)}
                      className="accent-foreground"
                    />
                    <span>Foley Effects (Replace by default)</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeAtmosphere}
                      onChange={(e) => setIncludeAtmosphere(e.target.checked)}
                      className="accent-foreground"
                    />
                    <span>Atmosphere Beds</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={proposeMissing}
                      onChange={(e) => setProposeMissing(e.target.checked)}
                      className="accent-foreground"
                    />
                    <span>Propose Missing Sounds for TangoFlux</span>
                  </label>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border/60">
                  <div>
                    <div className="font-medium text-foreground">
                      Auto-apply approved cues once TangoFlux finishes
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Links newly generated WAVs directly to the approved script segments.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={autoApplyCues}
                    onChange={(e) => setAutoApplyCues(e.target.checked)}
                    className="h-4 w-4 accent-foreground cursor-pointer"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">
                    Select Chapters ({selectedChapterIds.length} selected)
                  </span>
                  <div className="flex items-center gap-2 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setSelectedChapterIds(chapters.map((c) => c.id))}
                      className="text-muted-foreground hover:text-foreground underline cursor-pointer"
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedChapterIds([])}
                      className="text-muted-foreground hover:text-foreground underline cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <div className="max-h-60 overflow-y-auto border border-border rounded-xl divide-y divide-border/60">
                  {chapters.map((ch) => (
                    <label
                      key={ch.id}
                      className="flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-muted/40 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedChapterIds.includes(ch.id)}
                        onChange={() => toggleChapter(ch.id)}
                        className="accent-foreground"
                      />
                      <span className="font-mono text-[10px] text-muted-foreground">
                        Ch.{ch.chapter_number}
                      </span>
                      <span className="truncate text-foreground">{ch.title}</span>
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}

          {mode === "scan" && hasScanned && (
            <div className="space-y-3">
              {/* Review Summary + Tabs */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-border">
                <div className="inline-flex rounded-lg border border-border p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setReviewTab("assets")}
                    className={cn(
                      "px-2.5 py-1 rounded-md font-medium cursor-pointer",
                      reviewTab === "assets"
                        ? "bg-secondary text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Sound Assets ({matchedAssets.length + proposedAssets.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setReviewTab("placements")}
                    className={cn(
                      "px-2.5 py-1 rounded-md font-medium cursor-pointer",
                      reviewTab === "placements"
                        ? "bg-secondary text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Script Placements ({foleyCues.length + atmosphereSpans.length})
                  </button>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {matchedAssets.length} matched · {approvedNewAssets.length} new AI ·{" "}
                  {approvedFoleyCues.length} foley · {approvedAtmoSpans.length} atmosphere
                </div>
              </div>

              {reviewTab === "assets" ? (
                <div className="space-y-3">
                  {/* Proposed New AI Assets */}
                  {proposedAssets.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-foreground">
                        New AI Sounds to Generate via TangoFlux ({approvedNewAssets.length}/{proposedAssets.length})
                      </div>
                      {proposedAssets.map((asset, idx) => (
                        <div
                          key={asset.asset_key}
                          className={cn(
                            "rounded-xl border p-3 space-y-2 text-xs transition-opacity",
                            asset.approved
                              ? "border-amber-500/40 bg-amber-500/[0.03]"
                              : "border-border opacity-50",
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <label className="flex items-center gap-2 font-semibold text-foreground cursor-pointer">
                              <input
                                type="checkbox"
                                checked={asset.approved}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  setProposedAssets((prev) =>
                                    prev.map((p, i) =>
                                      i === idx ? { ...p, approved: checked } : p,
                                    ),
                                  );
                                }}
                                className="accent-foreground"
                              />
                              <input
                                type="text"
                                value={asset.name}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setProposedAssets((prev) =>
                                    prev.map((p, i) => (i === idx ? { ...p, name: val } : p)),
                                  );
                                }}
                                className="bg-transparent border-b border-transparent focus:border-border outline-none font-semibold"
                              />
                            </label>
                            <div className="flex items-center gap-2 shrink-0 text-[11px]">
                              <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 font-medium">
                                {asset.category} · {asset.usage_count} cue(s)
                              </span>
                              <label className="flex items-center gap-1 text-muted-foreground">
                                <span>Dur(s):</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={30}
                                  step={0.5}
                                  value={asset.duration_seconds}
                                  onChange={(e) => {
                                    const val = Math.max(1, Math.min(30, Number(e.target.value) || 2));
                                    setProposedAssets((prev) =>
                                      prev.map((p, i) =>
                                        i === idx ? { ...p, duration_seconds: val } : p,
                                      ),
                                    );
                                  }}
                                  className="w-14 px-1.5 py-0.5 rounded border border-border bg-background text-foreground"
                                />
                              </label>
                            </div>
                          </div>
                          <textarea
                            rows={2}
                            value={asset.prompt}
                            onChange={(e) => {
                              const val = e.target.value;
                              setProposedAssets((prev) =>
                                prev.map((p, i) => (i === idx ? { ...p, prompt: val } : p)),
                              );
                            }}
                            className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-[11px] text-foreground outline-none focus:ring-1 focus:ring-ring"
                            placeholder="TangoFlux audio prompt..."
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Matched Existing Library Assets */}
                  {matchedAssets.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-foreground">
                        Matched from Your SFX Library ({matchedAssets.length})
                      </div>
                      <div className="divide-y divide-border border border-border rounded-xl">
                        {matchedAssets.map((m) => (
                          <div
                            key={m.sfx_id}
                            className="px-3 py-2 flex items-center justify-between gap-2 text-xs"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <button
                                type="button"
                                onClick={() => togglePlay(m.audio_url)}
                                className="h-6 w-6 rounded-full bg-secondary flex items-center justify-center shrink-0 cursor-pointer"
                              >
                                {playingUrl === m.audio_url ? (
                                  <RiPauseFill className="h-3.5 w-3.5" />
                                ) : (
                                  <RiPlayFill className="h-3.5 w-3.5" />
                                )}
                              </button>
                              <span className="font-medium text-foreground truncate">
                                {m.name}
                              </span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                                {m.category}
                              </span>
                            </div>
                            <span className="text-[11px] text-muted-foreground shrink-0">
                              Used in {m.usage_count} cue(s)
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {proposedAssets.length === 0 && matchedAssets.length === 0 && (
                    <div className="py-10 text-center text-xs text-muted-foreground">
                      No sound effects or atmospheres were detected in the selected chapters.
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Foley Cue Placements */}
                  {foleyCues.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-foreground">
                        Foley Placements ({approvedFoleyCues.length}/{foleyCues.length} approved)
                      </div>
                      {foleyCues.map((cue, idx) => {
                        const preview = buildInlineReplacePreview(
                          cue.segment_text,
                          cue.target_text,
                        );
                        return (
                          <div
                            key={cue.cue_key}
                            className={cn(
                              "rounded-xl border border-border p-3 space-y-2 text-xs",
                              !cue.approved && "opacity-50",
                            )}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <label className="flex items-center gap-2 cursor-pointer min-w-0">
                                <input
                                  type="checkbox"
                                  checked={cue.approved}
                                  onChange={(e) => {
                                    const checked = e.target.checked;
                                    setFoleyCues((prev) =>
                                      prev.map((c, i) =>
                                        i === idx ? { ...c, approved: checked } : c,
                                      ),
                                    );
                                  }}
                                  className="accent-foreground"
                                />
                                <span className="font-mono text-[10px] text-muted-foreground">
                                  Ch.{cue.chapter_number} #{cue.order_index}
                                </span>
                                <span className="font-semibold text-foreground truncate">
                                  {cue.sfx_name}
                                </span>
                                {cue.is_new_asset && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300">
                                    AI New
                                  </span>
                                )}
                              </label>

                              <div className="flex items-center gap-2 shrink-0">
                                <select
                                  value={cue.action}
                                  onChange={(e) => {
                                    const val = e.target.value as FoleyCueAction;
                                    setFoleyCues((prev) =>
                                      prev.map((c, i) =>
                                        i === idx ? { ...c, action: val } : c,
                                      ),
                                    );
                                  }}
                                  className="rounded-md border border-border bg-background px-2 py-0.5 text-[11px] text-foreground"
                                >
                                  <option value="replace">Replace (Inline)</option>
                                  <option value="alongside">Alongside</option>
                                  <option value="after">After Line</option>
                                </select>
                                <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                  <RiVolumeUpLine className="h-3.5 w-3.5" />
                                  <input
                                    type="range"
                                    min={0.1}
                                    max={1}
                                    step={0.05}
                                    value={cue.volume}
                                    onChange={(e) => {
                                      const val = Number(e.target.value);
                                      setFoleyCues((prev) =>
                                        prev.map((c, i) =>
                                          i === idx ? { ...c, volume: val } : c,
                                        ),
                                      );
                                    }}
                                    className="w-16 accent-foreground"
                                  />
                                </div>
                              </div>
                            </div>

                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                              {cue.segment_text}
                            </p>

                            {cue.action === "replace" && (
                              <div className="rounded-lg bg-muted/40 px-2.5 py-1.5 text-[11px] text-foreground flex flex-wrap items-center gap-1.5">
                                <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                                  TTS reads:
                                </span>
                                {preview.before && <span>“{preview.before}”</span>}
                                <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-800 dark:text-amber-300 font-medium">
                                  🔊 {cue.sfx_name}
                                </span>
                                {preview.after && <span>“{preview.after}”</span>}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Atmosphere Spans */}
                  {atmosphereSpans.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-foreground">
                        Atmosphere Spans ({approvedAtmoSpans.length}/{atmosphereSpans.length} approved)
                      </div>
                      {atmosphereSpans.map((sp, idx) => (
                        <div
                          key={sp.span_key}
                          className={cn(
                            "rounded-xl border border-border p-3 flex items-center justify-between gap-2 text-xs",
                            !sp.approved && "opacity-50",
                          )}
                        >
                          <label className="flex items-center gap-2 cursor-pointer min-w-0">
                            <input
                              type="checkbox"
                              checked={sp.approved}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setAtmosphereSpans((prev) =>
                                  prev.map((s, i) =>
                                    i === idx ? { ...s, approved: checked } : s,
                                  ),
                                );
                              }}
                              className="accent-foreground"
                            />
                            <span className="font-mono text-[10px] text-muted-foreground">
                              Ch.{sp.chapter_number} · Seg #{sp.start_order_index}→#{sp.end_order_index} ({sp.segment_count} lines)
                            </span>
                            <span className="font-semibold text-foreground truncate">
                              {sp.sfx_name}
                            </span>
                          </label>
                          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground shrink-0">
                            <span>Vol {Math.round(sp.volume * 100)}%</span>
                            <input
                              type="range"
                              min={0.05}
                              max={0.6}
                              step={0.05}
                              value={sp.volume}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                setAtmosphereSpans((prev) =>
                                  prev.map((s, i) =>
                                    i === idx ? { ...s, volume: val } : s,
                                  ),
                                );
                              }}
                              className="w-16 accent-foreground"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {mode === "custom" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">
                  TangoFlux Prompt Queue ({customRows.length})
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setCustomRows((prev) => [
                      ...prev,
                      {
                        row_id: `row-${Date.now()}`,
                        name: "",
                        prompt: "",
                        category: "foley",
                        duration_seconds: 3,
                        is_global: false,
                      },
                    ])
                  }
                  className="inline-flex items-center gap-1 text-xs font-medium text-foreground hover:underline cursor-pointer"
                >
                  <RiAddLine className="h-3.5 w-3.5" />
                  <span>Add Sound</span>
                </button>
              </div>

              {customRows.map((row, idx) => (
                <div
                  key={row.row_id}
                  className="rounded-xl border border-border p-3 space-y-2 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={row.name}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCustomRows((prev) =>
                          prev.map((r, i) => (i === idx ? { ...r, name: val } : r)),
                        );
                      }}
                      placeholder="Sound name (e.g. Iron Dungeon Gate)"
                      className="flex-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
                    />
                    <select
                      value={row.category}
                      onChange={(e) => {
                        const cat = e.target.value as SFXCategory;
                        setCustomRows((prev) =>
                          prev.map((r, i) =>
                            i === idx
                              ? {
                                  ...r,
                                  category: cat,
                                  duration_seconds: cat === "atmosphere" ? 20 : 3,
                                }
                              : r,
                          ),
                        );
                      }}
                      className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
                    >
                      <option value="foley">Foley</option>
                      <option value="atmosphere">Atmosphere</option>
                    </select>
                    <input
                      type="number"
                      min={1}
                      max={30}
                      step={0.5}
                      value={row.duration_seconds}
                      onChange={(e) => {
                        const val = Math.max(1, Math.min(30, Number(e.target.value) || 3));
                        setCustomRows((prev) =>
                          prev.map((r, i) =>
                            i === idx ? { ...r, duration_seconds: val } : r,
                          ),
                        );
                      }}
                      className="w-16 rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
                      title="Duration in seconds (1-30s)"
                    />
                    {customRows.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setCustomRows((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="p-1.5 text-muted-foreground hover:text-destructive cursor-pointer"
                      >
                        <RiDeleteBinLine className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <textarea
                    rows={2}
                    value={row.prompt}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCustomRows((prev) =>
                        prev.map((r, i) => (i === idx ? { ...r, prompt: val } : r)),
                      );
                    }}
                    placeholder="TangoFlux prompt (e.g. Heavy rusted iron gate creaking open slowly in a stone dungeon, no speech)"
                    className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
                  />
                  {row.replace_sfx_id && (
                    <div className="text-[11px] text-amber-600 dark:text-amber-400">
                      Single-sound retake: will overwrite this library sound in-place so all linked chapter cues update automatically.
                    </div>
                  )}
                </div>
              ))}

              <label className="flex items-center justify-between rounded-xl border border-border bg-muted/20 px-3.5 py-2.5 text-xs cursor-pointer">
                <span>Use Kaggle Dataset Cache (noveler-sfx-design)</span>
                <input
                  type="checkbox"
                  checked={cacheToDataset}
                  onChange={(e) => setCacheToDataset(e.target.checked)}
                  className="h-4 w-4 accent-foreground"
                />
              </label>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-border flex items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-border hover:bg-secondary cursor-pointer"
          >
            Close
          </button>

          <div className="flex items-center gap-2">
            {mode === "scan" && !hasScanned && (
              <button
                type="button"
                onClick={handleScanChapters}
                disabled={
                  selectedChapterIds.length === 0 ||
                  isScanning ||
                  Boolean(activeScanJob && (activeScanJob.status === "pending" || activeScanJob.status === "running"))
                }
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-foreground text-background disabled:opacity-50 cursor-pointer"
              >
                {(isScanning || (activeScanJob && (activeScanJob.status === "pending" || activeScanJob.status === "running"))) && (
                  <RiLoader4Line className="h-3.5 w-3.5 animate-spin" />
                )}
                <span>
                  {activeScanJob && (activeScanJob.status === "pending" || activeScanJob.status === "running")
                    ? `Scanning (${activeScanJob.progress_percentage}%)...`
                    : isScanning
                      ? "Starting Scan..."
                      : "Scan & Build Review Plan"}
                </span>
              </button>
            )}

            {mode === "scan" && hasScanned && (
              <button
                type="button"
                onClick={handleCommitReviewedPlan}
                disabled={
                  isSubmitting ||
                  (approvedNewAssets.length === 0 &&
                    approvedFoleyCues.length === 0 &&
                    approvedAtmoSpans.length === 0)
                }
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-foreground text-background disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting && <RiLoader4Line className="h-3.5 w-3.5 animate-spin" />}
                <span>
                  {approvedNewAssets.length > 0
                    ? `Generate ${approvedNewAssets.length} Sound(s) & Apply ${
                        approvedFoleyCues.length + approvedAtmoSpans.length
                      } Cue(s)`
                    : `Apply ${approvedFoleyCues.length + approvedAtmoSpans.length} Approved Cue(s)`}
                </span>
              </button>
            )}

            {mode === "custom" && (
              <button
                type="button"
                onClick={handleLaunchCustomBatch}
                disabled={isSubmitting}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-foreground text-background disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting && <RiLoader4Line className="h-3.5 w-3.5 animate-spin" />}
                <span>Generate with TangoFlux</span>
              </button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
