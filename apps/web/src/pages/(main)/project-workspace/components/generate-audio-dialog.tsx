import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  RiCpuLine,
  RiLoader4Line,
  RiAlertLine,
  RiStopCircleLine,
  RiSparklingLine,
  RiExternalLinkLine,
  RiRefreshLine,
  RiArrowRightLine,
  RiPlayFill,
  RiPauseFill,
  RiCheckLine,
  RiArrowDownSLine,
  RiUserVoiceLine,
  RiVolumeUpLine,
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
import { Switch } from "@/components/ui/switch";
import { CharacterAvatar } from "@/components/ui/character-avatar";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type {
  Chapter,
  Character,
  Voice,
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
import {
  getCharacters,
  updateCharacter,
} from "@/services/character-and-pronunciation";
import { getVoices } from "@/services/voices";
import { getKaggleAccounts } from "@/services/kaggle";
import { useAuth } from "@/context/auth-context";
import { TTS_MODELS } from "@/lib/tts-models";
import { cn } from "@/lib/utils";
import { ModelCacheModal } from "./model-cache-modal";

export interface GenerateAudioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  chapters: Chapter[];
  activeChapterId?: string;
  initialScope?: "all" | "active" | "range";
  onAudioUpdated?: () => void;
  onSingleChapterGenerate?: (options: {
    ttsModel: string;
    cacheToDataset: boolean;
    allowDevOffline: boolean;
  }) => Promise<void> | void;
  onCharactersMutate?: () => void;
}

type ModalTab = "setup" | "cast" | "compute";

export function GenerateAudioDialog({
  open,
  onOpenChange,
  projectId,
  chapters,
  activeChapterId,
  initialScope,
  onAudioUpdated,
  onSingleChapterGenerate,
  onCharactersMutate,
}: GenerateAudioDialogProps) {
  const { user } = useAuth();
  const confirm = useConfirm();

  const resolvedDefaultScope: "all" | "active" | "range" =
    initialScope ?? (activeChapterId ? "active" : "all");

  // Modal tab & scope state
  const [activeTab, setActiveTab] = useState<ModalTab>("setup");
  const [scope, setScope] = useState<"all" | "active" | "range">(resolvedDefaultScope);
  const [startChapter, setStartChapter] = useState<number>(1);
  const [endChapter, setEndChapter] = useState<number>(Math.max(1, chapters.length));
  const [showUntaggedList, setShowUntaggedList] = useState(false);

  useEffect(() => {
    if (open) {
      setScope(initialScope ?? (activeChapterId ? "active" : "all"));
      setActiveTab("setup");
      setShowUntaggedList(false);
    }
  }, [open, initialScope, activeChapterId]);

  useEffect(() => {
    setEndChapter((prev) => Math.min(Math.max(1, chapters.length), Math.max(1, prev)));
  }, [chapters.length]);

  // Model & compute options
  const [selectedModel, setSelectedModel] = useState<string>(
    user?.preferred_tts_model || TTS_MODELS[0]?.id || "cosyvoice-3",
  );
  const [cacheToDataset, setCacheToDataset] = useState<boolean>(true);
  const [allowDevOffline, setAllowDevOffline] = useState<boolean>(false);

  // Live pool & status state
  const [accounts, setAccounts] = useState<KaggleAccount[]>([]);
  const [statusData, setStatusData] = useState<BatchAudioStatusResponse | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [updatingCharacterId, setUpdatingCharacterId] = useState<string | null>(null);

  // UI status
  const [isLoading, setIsLoading] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Preflight Cache Modal
  const [modelCacheModalOpen, setModelCacheModalOpen] = useState(false);
  const [pendingPreflight, setPendingPreflight] = useState<ChapterPreflightAudioResponse | null>(null);

  // Reference voice audition state
  const [auditioningVoiceId, setAuditioningVoiceId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const activeChapter = useMemo(
    () => chapters.find((c) => c.id === activeChapterId) || chapters[0],
    [chapters, activeChapterId],
  );

  const selectedModelOption = useMemo(
    () => TTS_MODELS.find((m) => m.id === selectedModel) || TTS_MODELS[0],
    [selectedModel],
  );

  const visibleModels = useMemo(
    () =>
      TTS_MODELS.filter(
        (m) => m.id !== "system-native" || import.meta.env.DEV || selectedModel === "system-native",
      ),
    [selectedModel],
  );

  // Targeted chapters based on scope
  const targetedChapters = useMemo(() => {
    if (scope === "all") return chapters;
    if (scope === "active") return activeChapter ? [activeChapter] : [];
    if (scope === "range") {
      const minNum = Math.min(startChapter, endChapter);
      const maxNum = Math.max(startChapter, endChapter);
      return chapters.filter(
        (c) => c.chapter_number >= minNum && c.chapter_number <= maxNum,
      );
    }
    return chapters;
  }, [scope, chapters, activeChapter, startChapter, endChapter]);

  const untaggedChapters = useMemo(() => {
    return targetedChapters.filter(
      (c) => c.status !== "tagged" && c.status !== "complete" && c.audio_job_status !== "complete",
    );
  }, [targetedChapters]);

  const hasUntaggedChapters = untaggedChapters.length > 0;

  const activeAccounts = useMemo(() => {
    return accounts.filter((a) => a.is_active && a.status !== "failed");
  }, [accounts]);

  const assignedCharactersCount = useMemo(
    () => characters.filter((c) => Boolean(c.assigned_voice_id || c.assigned_voice_name)).length,
    [characters],
  );

  const loadInitialData = useCallback(async () => {
    if (!projectId) return;
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const [accs, batchStatus, charRes, voiceList] = await Promise.all([
        getKaggleAccounts().catch(() => [] as KaggleAccount[]),
        getBatchAudioStatus(projectId).catch(() => null),
        getCharacters(projectId).catch(() => ({ characters: [] })),
        getVoices(projectId).catch(() => [] as Voice[]),
      ]);

      setAccounts(accs);
      setStatusData(batchStatus);
      setCharacters(charRes.characters || []);
      setVoices(voiceList || []);
    } catch (err: unknown) {
      console.warn("Could not load synthesis workspace data:", err);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  const pollStatus = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await getBatchAudioStatus(projectId);
      setStatusData(res);
      onAudioUpdated?.();
    } catch (err) {
      console.warn("Could not poll batch status:", err);
    }
  }, [projectId, onAudioUpdated]);

  useEffect(() => {
    if (open) {
      loadInitialData();
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setAuditioningVoiceId(null);
    }
  }, [open, loadInitialData]);

  useEffect(() => {
    if (!open || !statusData?.is_active) return;
    const interval = setInterval(() => {
      pollStatus();
    }, 3000);
    return () => clearInterval(interval);
  }, [open, statusData?.is_active, pollStatus]);

  const toggleAudition = (voice: Voice) => {
    if (!voice.audio_url) return;

    if (auditioningVoiceId === voice.id) {
      audioRef.current?.pause();
      setAuditioningVoiceId(null);
    } else {
      setAuditioningVoiceId(voice.id);
      if (audioRef.current) {
        audioRef.current.src = voice.audio_url;
        audioRef.current.play().catch(() => {
          setAuditioningVoiceId(null);
        });
      }
    }
  };

  const handleAssignVoice = async (characterId: string, voiceId: string | null) => {
    setUpdatingCharacterId(characterId);
    const chosenVoice = voices.find((v) => v.id === voiceId) || null;

    try {
      const updated = await updateCharacter(projectId, characterId, {
        assigned_voice_id: chosenVoice ? chosenVoice.id : null,
        assigned_voice_name: chosenVoice ? chosenVoice.name : null,
      });

      setCharacters((prev) =>
        prev.map((c) => (c.id === characterId ? { ...c, ...updated } : c)),
      );
      onCharactersMutate?.();
    } catch (err) {
      console.warn("Failed to assign voice:", err);
    } finally {
      setUpdatingCharacterId(null);
    }
  };

  const handleStartGeneration = async () => {
    if (targetedChapters.length === 0) return;

    if (
      selectedModel !== "kokoro-82m" &&
      selectedModel !== "system-native" &&
      targetedChapters[0]
    ) {
      try {
        const pf = await preflightChapterAudio(projectId, targetedChapters[0].id, {
          preferred_tts_model: selectedModel,
        });
        if (pf && pf.requires_decision) {
          setPendingPreflight(pf);
          setModelCacheModalOpen(true);
          return;
        }
      } catch (err) {
        console.warn("Preflight cache check warning:", err);
      }
    }

    await executeGenerationLaunch({ cacheToDataset });
  };

  const executeGenerationLaunch = async (options: { cacheToDataset: boolean }) => {
    setIsLaunching(true);
    setErrorMessage(null);
    try {
      if (scope === "active" && onSingleChapterGenerate) {
        await onSingleChapterGenerate({
          ttsModel: selectedModel,
          cacheToDataset: options.cacheToDataset,
          allowDevOffline,
        });
        onAudioUpdated?.();
        onOpenChange(false);
        return;
      }

      await generateBatchAudio(projectId, {
        chapter_ids: targetedChapters.map((c) => c.id),
        preferred_tts_model: selectedModel,
        allow_dev_offline: allowDevOffline,
        cache_to_dataset: options.cacheToDataset,
      });
      await pollStatus();
      onAudioUpdated?.();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ||
        (err as Error)?.message ||
        "Failed to launch audio generation.";
      setErrorMessage(msg);
    } finally {
      setIsLaunching(false);
    }
  };

  const handleCancelBatch = async () => {
    const confirmed = await confirm({
      title: "Stop audio synthesis?",
      description: "All queued and in-progress chapter audio jobs in this batch will be stopped.",
      confirmLabel: "Stop synthesis",
      variant: "destructive",
    });
    if (!confirmed) return;

    setIsCancelling(true);
    setErrorMessage(null);
    try {
      await cancelBatchAudio(projectId);
      await pollStatus();
      onAudioUpdated?.();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message || "Failed to cancel audio generation.";
      setErrorMessage(msg);
    } finally {
      setIsCancelling(false);
    }
  };

  const hasActiveChapters = useMemo(
    () =>
      chapters.some(
        (c) => c.audio_job_status === "generating" || c.audio_job_status === "queued",
      ),
    [chapters],
  );
  const isBatchActive = Boolean(statusData?.is_active || hasActiveChapters);

  const needsKaggleAccount =
    activeAccounts.length === 0 && !allowDevOffline && selectedModel !== "system-native";

  const scopeSummaryLabel =
    scope === "active" && activeChapter
      ? `Ch. ${activeChapter.chapter_number}`
      : `${targetedChapters.length.toLocaleString()} chapter${targetedChapters.length === 1 ? "" : "s"}`;

  return (
    <>
      <audio
        ref={audioRef}
        onEnded={() => setAuditioningVoiceId(null)}
        onError={() => setAuditioningVoiceId(null)}
        className="hidden"
      />

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[560px] p-0 gap-0 overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl flex flex-col max-h-[88vh]">
          {/* Compact Studio Header */}
          <div className="px-5 pt-5 pb-4 border-b border-border/80 shrink-0 space-y-3.5">
            <DialogHeader className="space-y-1 text-left">
              <div className="flex items-center justify-between gap-3 pr-6">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-lg bg-secondary border border-border flex items-center justify-center text-foreground shrink-0">
                    <RiVolumeUpLine className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <div>
                    <DialogTitle className="font-display text-base font-semibold text-foreground tracking-tight">
                      Generate Audio
                    </DialogTitle>
                    <DialogDescription className="text-xs text-muted-foreground">
                      Choose chapters, voice engine, and compute settings.
                    </DialogDescription>
                  </div>
                </div>

                {isBatchActive && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 shrink-0">
                    <RiLoader4Line className="h-3 w-3 animate-spin" aria-hidden="true" />
                    <span>Running</span>
                  </span>
                )}
              </div>
            </DialogHeader>

            {/* Higgsfield-style Segmented Tab Bar */}
            <div
              role="tablist"
              aria-label="Audio generation sections"
              className="grid grid-cols-3 p-1 rounded-xl bg-secondary/80 border border-border/60"
            >
              {(
                [
                  { id: "setup", label: "Setup" },
                  {
                    id: "cast",
                    label: characters.length > 0 ? `Cast (${assignedCharactersCount}/${characters.length})` : "Cast",
                  },
                  {
                    id: "compute",
                    label: "Compute",
                    alert: needsKaggleAccount,
                  },
                ] as const
              ).map((tab) => {
                const isSelected = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "relative flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      isSelected
                        ? "bg-card text-foreground shadow-2xs border border-border/60"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <span className="tabular-nums">{tab.label}</span>
                    {"alert" in tab && tab.alert && (
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Body Content */}
          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
            {/* Error Banner */}
            {errorMessage && (
              <div
                role="alert"
                className="p-3 rounded-xl border border-destructive/25 bg-destructive/10 text-destructive text-xs flex items-start gap-2.5"
              >
                <RiAlertLine className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                <p className="leading-relaxed">{errorMessage}</p>
              </div>
            )}

            {/* Live Progress Banner (when synthesis is running) */}
            {isBatchActive && (
              <div className="p-3.5 rounded-xl border border-blue-500/25 bg-blue-500/5 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 font-medium text-foreground">
                    <RiLoader4Line className="h-3.5 w-3.5 animate-spin text-blue-500" aria-hidden="true" />
                    <span>Synthesis in progress</span>
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                    {statusData
                      ? `${statusData.completed_chapters}/${statusData.total_chapters} (${statusData.progress_percent}%)`
                      : `${chapters.filter((c) => c.audio_job_status === "complete").length}/${chapters.length}`}
                  </span>
                </div>

                <div className="w-full bg-secondary h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-blue-500 h-full rounded-full transition-[width] duration-300"
                    style={{ width: `${Math.max(5, statusData?.progress_percent ?? 5)}%` }}
                  />
                </div>

                {statusData && statusData.lanes.length > 0 && (
                  <div className="pt-1 space-y-1">
                    {statusData.lanes.map((lane) => (
                      <div
                        key={lane.job_id}
                        className="flex items-center justify-between gap-2 text-[11px]"
                      >
                        <span className="truncate text-muted-foreground">
                          Lane {lane.lane_index + 1} · @{lane.account_username}
                          {lane.current_chapter_title ? ` · ${lane.current_chapter_title}` : ""}
                        </span>
                        <span className="flex items-center gap-2 shrink-0 font-mono tabular-nums">
                          <span
                            className={
                              lane.status === "failed"
                                ? "text-destructive font-medium"
                                : lane.status === "complete"
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : "text-blue-600 dark:text-blue-400"
                            }
                          >
                            {lane.completed_chapters}/{lane.total_chapters}
                          </span>
                          {lane.status === "failed" && lane.chapter_ids.length > 0 && (
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  setIsLaunching(true);
                                  await generateBatchAudio(projectId, {
                                    chapter_ids: lane.chapter_ids,
                                    allow_dev_offline: allowDevOffline,
                                    preferred_tts_model: selectedModel,
                                    cache_to_dataset: cacheToDataset,
                                  });
                                  await loadInitialData();
                                  onAudioUpdated?.();
                                } catch (err) {
                                  setErrorMessage(
                                    err instanceof Error ? err.message : "Failed to retry lane",
                                  );
                                } finally {
                                  setIsLaunching(false);
                                }
                              }}
                              disabled={isLaunching}
                              className="px-1.5 py-0.5 rounded border border-border bg-card text-foreground hover:bg-secondary cursor-pointer font-sans text-[10px] font-medium"
                            >
                              Retry
                            </button>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 1: SETUP */}
            {activeTab === "setup" && (
              <div className="space-y-4">
                {/* Chapter Scope Selector */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-foreground">Chapters</span>
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      {targetedChapters.length.toLocaleString()} of {chapters.length.toLocaleString()} selected
                    </span>
                  </div>

                  <div
                    role="radiogroup"
                    aria-label="Chapter selection scope"
                    className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-secondary/60 border border-border/60"
                  >
                    {(
                      [
                        {
                          id: "active",
                          title: "This Chapter",
                          sub: activeChapter ? `Ch. ${activeChapter.chapter_number}` : "None",
                          disabled: !activeChapter,
                        },
                        {
                          id: "range",
                          title: "Range",
                          sub: `${startChapter}–${endChapter}`,
                          disabled: chapters.length <= 1,
                        },
                        {
                          id: "all",
                          title: "All Chapters",
                          sub: `${chapters.length.toLocaleString()} total`,
                          disabled: chapters.length === 0,
                        },
                      ] as const
                    ).map((opt) => {
                      const active = scope === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          disabled={opt.disabled}
                          onClick={() => setScope(opt.id)}
                          className={cn(
                            "px-2.5 py-2 rounded-lg text-left transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            active
                              ? "bg-card text-foreground shadow-2xs border border-border/80"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          <div className="text-xs font-medium leading-tight">{opt.title}</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5 tabular-nums truncate">
                            {opt.sub}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {scope === "range" && (
                    <div className="flex items-center gap-2.5 pt-1">
                      <div className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-background">
                        <label
                          htmlFor="audio-range-from"
                          className="text-[11px] text-muted-foreground shrink-0"
                        >
                          From
                        </label>
                        <input
                          id="audio-range-from"
                          type="number"
                          min={1}
                          max={chapters.length}
                          value={startChapter}
                          onChange={(e) =>
                            setStartChapter(Math.max(1, parseInt(e.target.value, 10) || 1))
                          }
                          className="w-full bg-transparent text-xs font-mono text-foreground focus-visible:outline-none tabular-nums"
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">to</span>
                      <div className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-background">
                        <label
                          htmlFor="audio-range-to"
                          className="text-[11px] text-muted-foreground shrink-0"
                        >
                          To
                        </label>
                        <input
                          id="audio-range-to"
                          type="number"
                          min={1}
                          max={chapters.length}
                          value={endChapter}
                          onChange={(e) =>
                            setEndChapter(
                              Math.min(chapters.length, Math.max(1, parseInt(e.target.value, 10) || 1)),
                            )
                          }
                          className="w-full bg-transparent text-xs font-mono text-foreground focus-visible:outline-none tabular-nums"
                        />
                      </div>
                    </div>
                  )}

                  {/* Calm, Compact Untagged Notice */}
                  {hasUntaggedChapters && (
                    <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0 text-amber-700 dark:text-amber-300">
                          <RiAlertLine className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          <span className="truncate">
                            <strong className="font-medium tabular-nums">
                              {untaggedChapters.length.toLocaleString()}
                            </strong>{" "}
                            untagged chapter{untaggedChapters.length === 1 ? "" : "s"} will use the default narrator voice.
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowUntaggedList((v) => !v)}
                          aria-expanded={showUntaggedList}
                          className="inline-flex items-center gap-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300 hover:underline shrink-0 cursor-pointer"
                        >
                          <span>{showUntaggedList ? "Hide" : "View"}</span>
                          <RiArrowDownSLine
                            aria-hidden="true"
                            className={cn(
                              "h-3.5 w-3.5 transition-transform",
                              showUntaggedList && "rotate-180",
                            )}
                          />
                        </button>
                      </div>

                      {showUntaggedList && (
                        <div className="mt-2 pt-2 border-t border-amber-500/15 max-h-24 overflow-y-auto space-y-1 text-[11px] text-amber-800/90 dark:text-amber-300/80 font-mono">
                          {untaggedChapters.slice(0, 100).map((c) => (
                            <div key={c.id} className="truncate">
                              Ch. {c.chapter_number}: {c.title}
                            </div>
                          ))}
                          {untaggedChapters.length > 100 && (
                            <div className="text-muted-foreground font-sans">
                              +{untaggedChapters.length - 100} more chapters
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Voice Engine Radio List (Zero orphan cards, high scannability) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-foreground">Voice Engine</span>
                    <span className="text-[11px] text-muted-foreground">
                      {selectedModelOption.size} · {selectedModelOption.vram}
                    </span>
                  </div>

                  <div
                    role="radiogroup"
                    aria-label="Voice engine model"
                    className="rounded-xl border border-border divide-y divide-border overflow-hidden bg-background/40"
                  >
                    {visibleModels.map((model) => {
                      const isSelected = selectedModel === model.id;
                      return (
                        <button
                          key={model.id}
                          type="button"
                          role="radio"
                          aria-checked={isSelected}
                          onClick={() => setSelectedModel(model.id)}
                          className={cn(
                            "w-full px-3.5 py-2.5 text-left transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                            isSelected ? "bg-secondary/80" : "hover:bg-secondary/40",
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span
                                className={cn(
                                  "h-4 w-4 rounded-full border flex items-center justify-center shrink-0 transition-colors",
                                  isSelected
                                    ? "border-primary bg-primary text-primary-foreground"
                                    : "border-muted-foreground/40",
                                )}
                                aria-hidden="true"
                              >
                                {isSelected && <RiCheckLine className="h-2.5 w-2.5" />}
                              </span>
                              <span className="text-xs font-medium text-foreground truncate">
                                {model.name}
                              </span>
                              {model.isCloning && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-secondary text-muted-foreground border border-border shrink-0">
                                  Voice Cloning
                                </span>
                              )}
                            </div>

                            {model.highlight && (
                              <span
                                className={cn(
                                  "text-[11px] shrink-0",
                                  isSelected
                                    ? "text-emerald-600 dark:text-emerald-400 font-medium"
                                    : "text-muted-foreground",
                                )}
                              >
                                {model.highlight}
                              </span>
                            )}
                          </div>

                          {isSelected && (
                            <p className="mt-1.5 pl-6.5 text-[11px] text-muted-foreground leading-relaxed">
                              {model.description}
                            </p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Quick Readiness Summary Bar (Links directly to Cast & Compute tabs) */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab("cast")}
                    className="px-3 py-2 rounded-xl border border-border bg-background/50 hover:bg-secondary/60 transition-colors text-left flex items-center justify-between gap-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <RiUserVoiceLine className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
                      <div className="min-w-0">
                        <div className="text-[11px] font-medium text-foreground truncate">
                          {selectedModelOption.isCloning
                            ? characters.length > 0
                              ? `${assignedCharactersCount}/${characters.length} cast assigned`
                              : "Narrator default"
                            : "Built-in studio voices"}
                        </div>
                        <div className="text-[10px] text-muted-foreground">Review voice cast</div>
                      </div>
                    </div>
                    <RiArrowRightLine className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("compute")}
                    className={cn(
                      "px-3 py-2 rounded-xl border transition-colors text-left flex items-center justify-between gap-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      needsKaggleAccount
                        ? "border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10"
                        : "border-border bg-background/50 hover:bg-secondary/60",
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={cn(
                          "h-2 w-2 rounded-full shrink-0",
                          needsKaggleAccount ? "bg-amber-500" : "bg-emerald-500",
                        )}
                        aria-hidden="true"
                      />
                      <div className="min-w-0">
                        <div className="text-[11px] font-medium text-foreground truncate tabular-nums">
                          {isLoading && accounts.length === 0
                            ? "Checking GPUs…"
                            : selectedModel === "system-native" || allowDevOffline
                              ? "Local synthesis"
                              : activeAccounts.length > 0
                                ? `${activeAccounts.length} Kaggle GPU${activeAccounts.length === 1 ? "" : "s"} ready`
                                : "No GPU connected"}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {needsKaggleAccount ? "Connect Kaggle" : "Compute & cache"}
                        </div>
                      </div>
                    </div>
                    <RiArrowRightLine className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
                  </button>
                </div>
              </div>
            )}

            {/* TAB 2: VOICE CASTING */}
            {activeTab === "cast" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-medium text-foreground">Character Voice Cast</h3>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {selectedModelOption.isCloning
                        ? `${selectedModelOption.name} clones each character's assigned reference audio.`
                        : `${selectedModelOption.name} uses built-in studio voices (custom cloning not required).`}
                    </p>
                  </div>
                  <span className="text-[11px] font-mono text-muted-foreground tabular-nums shrink-0">
                    {assignedCharactersCount}/{characters.length}
                  </span>
                </div>

                {characters.length === 0 ? (
                  <div className="py-10 px-4 text-center rounded-xl border border-dashed border-border text-xs text-muted-foreground space-y-1">
                    <p className="font-medium text-foreground">No characters detected yet</p>
                    <p className="text-[11px]">
                      Dialogue will use your default narrator voice until speaker detection runs.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-border divide-y divide-border overflow-hidden bg-background/40">
                    {characters.map((char) => {
                      const assignedVoice = voices.find((v) => v.id === char.assigned_voice_id);
                      const isAuditioning = auditioningVoiceId === assignedVoice?.id;

                      return (
                        <div
                          key={char.id}
                          className="flex items-center justify-between px-3 py-2.5 text-xs gap-3"
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <CharacterAvatar
                              name={char.name}
                              gender={char.gender}
                              className="h-7 w-7 text-[10px] shrink-0"
                            />
                            <div className="min-w-0">
                              <div className="font-medium text-foreground truncate">
                                {char.name}
                              </div>
                              <div className="text-[11px] text-muted-foreground capitalize tabular-nums">
                                {char.gender} · {(char.dialogue_count || 0).toLocaleString()} lines
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {assignedVoice?.audio_url && (
                              <button
                                type="button"
                                onClick={() => toggleAudition(assignedVoice)}
                                aria-label={
                                  isAuditioning
                                    ? `Stop ${assignedVoice.name} preview`
                                    : `Preview ${assignedVoice.name}`
                                }
                                className="h-8 w-8 rounded-lg border border-border bg-card hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                                title="Preview reference voice"
                              >
                                {isAuditioning ? (
                                  <RiPauseFill className="h-3.5 w-3.5 text-foreground" aria-hidden="true" />
                                ) : (
                                  <RiPlayFill className="h-3.5 w-3.5" aria-hidden="true" />
                                )}
                              </button>
                            )}

                            <NativeSelect
                              value={char.assigned_voice_id || ""}
                              onChange={(e) => handleAssignVoice(char.id, e.target.value || null)}
                              aria-label={`Voice for ${char.name}`}
                              className="h-8 text-xs w-48 sm:w-56"
                              disabled={updatingCharacterId === char.id}
                            >
                              <NativeSelectOption value="">
                                Default Narrator
                              </NativeSelectOption>
                              {voices.map((v) => (
                                <NativeSelectOption key={v.id} value={v.id}>
                                  {v.name} ({v.gender})
                                </NativeSelectOption>
                              ))}
                            </NativeSelect>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: COMPUTE & WORKER SETTINGS */}
            {activeTab === "compute" && (
              <div className="space-y-4">
                {/* Kaggle GPU Pool Status */}
                {activeAccounts.length === 0 ? (
                  <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/5 text-xs space-y-2.5">
                    <div className="flex items-start gap-2.5">
                      <RiAlertLine className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
                      <div className="space-y-1">
                        <div className="font-medium text-foreground">
                          No active Kaggle GPU accounts
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          Cloud neural synthesis runs on your connected Kaggle GPU pool. Add at least one account to generate chapter audio.
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      asChild
                    >
                      <Link to="/profile?tab=kaggle" onClick={() => onOpenChange(false)}>
                        Open Kaggle Settings
                        <RiExternalLinkLine className="h-3.5 w-3.5 ml-1.5" aria-hidden="true" />
                      </Link>
                    </Button>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-xl border border-border bg-background/40 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0">
                        <RiCpuLine className="h-4 w-4" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-foreground tabular-nums">
                          {activeAccounts.length} Kaggle GPU account{activeAccounts.length === 1 ? "" : "s"} active
                        </div>
                        <p className="text-[11px] text-muted-foreground tabular-nums">
                          Using {Math.max(1, Math.min(activeAccounts.length, targetedChapters.length))} parallel synthesis lane
                          {Math.min(activeAccounts.length, targetedChapters.length) === 1 ? "" : "s"}.
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label="Refresh GPU pool status"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground shrink-0"
                      onClick={loadInitialData}
                      disabled={isLoading}
                    >
                      <RiRefreshLine
                        className={cn("h-3.5 w-3.5", isLoading && "animate-spin")}
                        aria-hidden="true"
                      />
                    </Button>
                  </div>
                )}

                {/* Row-based Worker Toggles (Notion / Higgsfield pattern) */}
                <div className="rounded-xl border border-border divide-y divide-border bg-background/40">
                  <div className="px-3.5 py-3 flex items-center justify-between gap-4">
                    <div className="space-y-0.5">
                      <label
                        htmlFor="toggle-cache-dataset"
                        className="text-xs font-medium text-foreground block cursor-pointer"
                      >
                        Cache model weights in Kaggle dataset
                      </label>
                      <p className="text-[11px] text-muted-foreground">
                        Skips re-downloading model files on subsequent chapters. Recommended.
                      </p>
                    </div>
                    <Switch
                      id="toggle-cache-dataset"
                      checked={cacheToDataset}
                      onCheckedChange={setCacheToDataset}
                    />
                  </div>

                  {import.meta.env.DEV && (
                    <div className="px-3.5 py-3 flex items-center justify-between gap-4">
                      <div className="space-y-0.5">
                        <label
                          htmlFor="toggle-dev-offline"
                          className="text-xs font-medium text-foreground block cursor-pointer"
                        >
                          Offline developer simulation
                        </label>
                        <p className="text-[11px] text-muted-foreground">
                          Test synthesis locally without using Kaggle GPU quota.
                        </p>
                      </div>
                      <Switch
                        id="toggle-dev-offline"
                        checked={allowDevOffline}
                        onCheckedChange={setAllowDevOffline}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Calm Studio Footer */}
          <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-t border-border/80 bg-secondary/30 shrink-0">
            <div className="text-xs text-muted-foreground min-w-0 truncate tabular-nums">
              <span className="font-medium text-foreground">{scopeSummaryLabel}</span>
              <span className="mx-1.5 opacity-40">·</span>
              <span>{selectedModelOption.name}</span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {isBatchActive && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCancelBatch}
                  disabled={isCancelling}
                  className="h-8 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                >
                  <RiStopCircleLine className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                  {isCancelling ? "Stopping…" : "Stop"}
                </Button>
              )}

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={isLaunching}
                className="h-8 text-xs"
              >
                Cancel
              </Button>

              <Button
                type="button"
                size="sm"
                onClick={handleStartGeneration}
                disabled={isLaunching || targetedChapters.length === 0 || needsKaggleAccount}
                className="h-8 px-3.5 text-xs font-medium gap-1.5"
              >
                {isLaunching ? (
                  <>
                    <RiLoader4Line className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    <span>Starting…</span>
                  </>
                ) : (
                  <>
                    <RiSparklingLine className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Generate Audio</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Model Cache Preflight Decision Modal */}
      {pendingPreflight && (
        <ModelCacheModal
          open={modelCacheModalOpen}
          onOpenChange={setModelCacheModalOpen}
          modelId={pendingPreflight.model_id}
          modelName={pendingPreflight.model_name}
          sizeMb={pendingPreflight.size_mb}
          kaggleAccountUsername={pendingPreflight.kaggle_account_username}
          onConfirm={async (options) => {
            setModelCacheModalOpen(false);
            await executeGenerationLaunch({ cacheToDataset: options.cacheToDataset });
          }}
        />
      )}
    </>
  );
}

export default GenerateAudioDialog;
