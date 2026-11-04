import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  RiCpuLine,
  RiLoader4Line,
  RiAlertLine,
  RiStopCircleLine,
  RiSparklingLine,
  RiExternalLinkLine,
  RiRefreshLine,
  RiBookOpenLine,
  RiArrowRightLine,
  RiUserVoiceLine,
  RiPlayFill,
  RiPauseFill,
  RiHardDrive2Line,
  RiFlashlightLine,
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
import { CharacterAvatar } from "@/components/ui/character-avatar";
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
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { ModelCacheModal } from "./model-cache-modal";

export interface GenerateAudioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  chapters: Chapter[];
  activeChapterId?: string;
  onAudioUpdated?: () => void;
}

interface TTSModelOption {
  id: string;
  name: string;
  badge: string;
  description: string;
  vram: string;
  size: string;
  isCloning: boolean;
  highlight?: string;
}

const TTS_MODELS: TTSModelOption[] = [
  {
    id: "kokoro-82m",
    name: "Kokoro-82M",
    badge: "Ultra-Fast Studio",
    description:
      "Ultra-fast neural speech synthesis at ~50x real-time speed. Crisp 24kHz clarity with curated character voice mapping.",
    vram: "1.0 GB VRAM",
    size: "360 MB",
    isCloning: false,
    highlight: "Fastest (~50x Real-time)",
  },
  {
    id: "chatterbox-turbo",
    name: "Chatterbox-Turbo",
    badge: "Zero-Shot Voice Cloning",
    description:
      "High-fidelity conversational and emotive audiobook narrator. Clones character voices from reference audio with dynamic expression.",
    vram: "3.5 GB VRAM",
    size: "1.85 GB",
    isCloning: true,
    highlight: "Recommended for Voice Cloning",
  },
  {
    id: "fish-speech-1.5",
    name: "Fish Speech 1.5",
    badge: "Prosody Voice Cloning",
    description:
      "Deep zero-shot voice cloning with natural micro-intonations, subtle pauses, and expressive prosody variance.",
    vram: "5.0 GB VRAM",
    size: "3.2 GB",
    isCloning: true,
  },
  {
    id: "orpheustts",
    name: "OrpheusTTS",
    badge: "Theatrical Narration",
    description:
      "Theatrical, character-driven storytelling engine optimized for dramatic tension and vivid dialogue exchanges.",
    vram: "2.5 GB VRAM",
    size: "1.4 GB",
    isCloning: false,
  },
  {
    id: "vibevoice",
    name: "VibeVoice",
    badge: "Conversational & Whisper",
    description:
      "Subtle conversational vocal delivery with whisper dynamics and authentic internal monologue pacing.",
    vram: "4.5 GB VRAM",
    size: "2.6 GB",
    isCloning: false,
  },
  {
    id: "omnivoice",
    name: "OmniVoice",
    badge: "Multilingual Expressive",
    description:
      "Multilingual expressive speech synthesis engine supporting diverse accents and multi-language prose.",
    vram: "4.0 GB VRAM",
    size: "2.1 GB",
    isCloning: false,
  },
  {
    id: "system-native",
    name: "System Native",
    badge: "Local Dev Fallback",
    description:
      "Local developer speech synthesis preview for rapid offline pipeline testing.",
    vram: "0 MB (CPU)",
    size: "0 MB",
    isCloning: false,
  },
];

export function GenerateAudioDialog({
  open,
  onOpenChange,
  projectId,
  chapters,
  activeChapterId,
  onAudioUpdated,
}: GenerateAudioDialogProps) {
  const { user } = useAuth();

  // Scope selection: "all" | "active" | "range"
  const [scope, setScope] = useState<"all" | "active" | "range">("all");
  const [startChapter, setStartChapter] = useState<number>(1);
  const [endChapter, setEndChapter] = useState<number>(Math.max(1, chapters.length));
  const [showUntaggedList, setShowUntaggedList] = useState(false);

  // Model & Worker Options
  const [selectedModel, setSelectedModel] = useState<string>(
    user?.preferred_tts_model || "kokoro-82m",
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

  // Check untagged chapters within selection
  const untaggedChapters = useMemo(() => {
    return targetedChapters.filter((c) => c.status === "parsed" || c.status !== "tagged");
  }, [targetedChapters]);

  const hasUntaggedChapters = untaggedChapters.length > 0;

  // Active verified Kaggle accounts
  const activeAccounts = useMemo(() => {
    return accounts.filter((a) => a.is_active && a.status !== "failed");
  }, [accounts]);

  // Load accounts, status, characters, and voices
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

  // Status Poller
  const pollStatus = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await getBatchAudioStatus(projectId);
      setStatusData(res);
      if (onAudioUpdated && res.is_active) {
        onAudioUpdated();
      }
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

  // Active polling loop while running
  useEffect(() => {
    if (!open || !statusData?.is_active) return;
    const interval = setInterval(() => {
      pollStatus();
    }, 3000);
    return () => clearInterval(interval);
  }, [open, statusData?.is_active, pollStatus]);

  // Toggle voice audition playback
  const toggleAudition = (voice: Voice) => {
    if (!voice.audio_url) return;

    if (auditioningVoiceId === voice.id) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
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

  // Quick re-assignment for characters
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
    } catch (err) {
      console.warn("Failed to assign voice:", err);
    } finally {
      setUpdatingCharacterId(null);
    }
  };

  // Launch audio synthesis
  const handleStartGeneration = async () => {
    if (targetedChapters.length === 0) return;

    // Check preflight cache decision if using non-default remote model
    if (selectedModel !== "kokoro-82m" && selectedModel !== "system-native" && targetedChapters[0]) {
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
      await generateBatchAudio(projectId, {
        chapter_ids: targetedChapters.map((c) => c.id),
        preferred_tts_model: selectedModel,
        allow_dev_offline: allowDevOffline,
        cache_to_dataset: options.cacheToDataset,
      });
      await pollStatus();
      if (onAudioUpdated) {
        onAudioUpdated();
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ||
        (err as Error)?.message ||
        "Failed to launch audio generation.";
      setErrorMessage(msg);
    } finally {
      setIsLaunching(false);
    }
  };

  // Cancel running synthesis
  const handleCancelBatch = async () => {
    setIsCancelling(true);
    setErrorMessage(null);
    try {
      await cancelBatchAudio(projectId);
      await pollStatus();
      if (onAudioUpdated) {
        onAudioUpdated();
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ||
        "Failed to cancel audio generation.";
      setErrorMessage(msg);
    } finally {
      setIsCancelling(false);
    }
  };

  const isBatchActive = Boolean(statusData?.is_active);

  return (
    <>
      <audio
        ref={audioRef}
        onEnded={() => setAuditioningVoiceId(null)}
        onError={() => setAuditioningVoiceId(null)}
        className="hidden"
      />

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl sm:max-w-3xl p-0 overflow-hidden rounded-2xl border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black shadow-2xl flex flex-col max-h-[90vh]">
          {/* Header */}
          <div className="p-6 pb-4 border-b border-neutral-100 dark:border-neutral-800 shrink-0">
            <DialogHeader className="space-y-1">
              <div className="flex items-center justify-between">
                <DialogTitle className="text-xl font-bold font-serif text-neutral-900 dark:text-neutral-100 tracking-tight flex items-center gap-2">
                  <span className="h-6 w-6 rounded-lg bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 flex items-center justify-center text-xs font-mono font-bold">
                    C
                  </span>
                  <span>Audio Generation (Stage C)</span>
                </DialogTitle>

                {isBatchActive && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-500 border border-blue-500/20 animate-pulse flex items-center gap-1.5">
                    <RiLoader4Line className="h-3 w-3 animate-spin" />
                    <span>Lanes Active</span>
                  </span>
                )}
              </div>
              <DialogDescription className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400">
                Synthesize neural speech across selected chapters with multi-GPU parallel synthesis lanes.
              </DialogDescription>
            </DialogHeader>
          </div>

          {/* Body Content */}
          <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6">
            {/* Error Message */}
            {errorMessage && (
              <div className="p-3.5 rounded-xl border border-rose-200 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-950/30 text-rose-900 dark:text-rose-200 text-xs flex items-start gap-2.5">
                <RiAlertLine className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
                <div className="flex-1 space-y-1">
                  <span className="font-semibold">Audio Generation Notice</span>
                  <p className="leading-relaxed opacity-90">{errorMessage}</p>
                </div>
              </div>
            )}

            {/* Loading initial pool state */}
            {isLoading && !statusData && accounts.length === 0 && (
              <div className="py-12 flex flex-col items-center justify-center space-y-2.5 text-xs text-neutral-400">
                <RiLoader4Line className="h-5 w-5 animate-spin" />
                <span>Loading synthesis workspace configuration...</span>
              </div>
            )}

            {/* Live Progress Banner if active */}
            {isBatchActive && statusData && (
              <div className="p-4 rounded-xl border border-blue-200 dark:border-blue-800/60 bg-blue-50/60 dark:bg-blue-950/30 space-y-3">
                <div className="flex items-center justify-between text-xs font-medium">
                  <div className="flex items-center gap-2 text-blue-900 dark:text-blue-100 font-semibold">
                    <RiLoader4Line className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400" />
                    <span>Synthesis in progress</span>
                  </div>
                  <span className="font-mono text-neutral-600 dark:text-neutral-300">
                    {statusData.completed_chapters} / {statusData.total_chapters} chapters ({statusData.progress_percent}%)
                  </span>
                </div>

                <div className="w-full bg-blue-100 dark:bg-blue-900/40 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-blue-600 dark:bg-blue-400 h-full rounded-full transition-all duration-300"
                    style={{ width: `${Math.max(5, statusData.progress_percent)}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] text-neutral-500 dark:text-neutral-400 pt-0.5">
                  <span>{statusData.lanes.length} active worker lane(s)</span>
                  <button
                    type="button"
                    onClick={handleCancelBatch}
                    disabled={isCancelling}
                    className="text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    <RiStopCircleLine className="h-3.5 w-3.5" />
                    <span>{isCancelling ? "Cancelling..." : "Cancel batch"}</span>
                  </button>
                </div>
              </div>
            )}

            {/* 1. Scope Selection (identical to TaggingConfigDialog) */}
            <div className="space-y-3">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider block">
                1. Target Scope
              </label>

              <div className="grid grid-cols-3 gap-2.5">
                {/* Option: All Chapters */}
                <button
                  type="button"
                  onClick={() => setScope("all")}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                    scope === "all"
                      ? "border-neutral-900 dark:border-neutral-100 bg-neutral-50 dark:bg-neutral-900/80 shadow-2xs"
                      : "border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50/60 dark:hover:bg-neutral-900/40"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <RiBookOpenLine className="h-4 w-4 text-neutral-500" />
                    {scope === "all" && (
                      <span className="h-2 w-2 rounded-full bg-neutral-900 dark:bg-neutral-100" />
                    )}
                  </div>
                  <div className="mt-2">
                    <div className="text-xs font-bold text-neutral-900 dark:text-neutral-100">
                      All Chapters
                    </div>
                    <div className="text-[11px] text-neutral-500 truncate">
                      {chapters.length} chapter{chapters.length === 1 ? "" : "s"}
                    </div>
                  </div>
                </button>

                {/* Option: Active Chapter */}
                <button
                  type="button"
                  onClick={() => setScope("active")}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                    scope === "active"
                      ? "border-neutral-900 dark:border-neutral-100 bg-neutral-50 dark:bg-neutral-900/80 shadow-2xs"
                      : "border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50/60 dark:hover:bg-neutral-900/40"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <RiSparklingLine className="h-4 w-4 text-neutral-500" />
                    {scope === "active" && (
                      <span className="h-2 w-2 rounded-full bg-neutral-900 dark:bg-neutral-100" />
                    )}
                  </div>
                  <div className="mt-2">
                    <div className="text-xs font-bold text-neutral-900 dark:text-neutral-100">
                      Active Chapter
                    </div>
                    <div className="text-[11px] text-neutral-500 truncate">
                      {activeChapter ? `Ch. ${activeChapter.chapter_number}` : "None"}
                    </div>
                  </div>
                </button>

                {/* Option: Range */}
                <button
                  type="button"
                  onClick={() => setScope("range")}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                    scope === "range"
                      ? "border-neutral-900 dark:border-neutral-100 bg-neutral-50 dark:bg-neutral-900/80 shadow-2xs"
                      : "border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50/60 dark:hover:bg-neutral-900/40"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-neutral-500">1..N</span>
                    {scope === "range" && (
                      <span className="h-2 w-2 rounded-full bg-neutral-900 dark:bg-neutral-100" />
                    )}
                  </div>
                  <div className="mt-2">
                    <div className="text-xs font-bold text-neutral-900 dark:text-neutral-100">
                      Custom Range
                    </div>
                    <div className="text-[11px] text-neutral-500 truncate">
                      Ch. {startChapter} - {endChapter}
                    </div>
                  </div>
                </button>
              </div>

              {/* Range Inputs */}
              {scope === "range" && (
                <div className="p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/30 flex items-center gap-3">
                  <div className="flex-1 space-y-1">
                    <label className="text-[11px] font-medium text-neutral-500">From Chapter</label>
                    <input
                      type="number"
                      min={1}
                      max={chapters.length}
                      value={startChapter}
                      onChange={(e) => setStartChapter(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black text-neutral-900 dark:text-neutral-100 outline-none"
                    />
                  </div>
                  <span className="text-neutral-400 self-end pb-2">to</span>
                  <div className="flex-1 space-y-1">
                    <label className="text-[11px] font-medium text-neutral-500">To Chapter</label>
                    <input
                      type="number"
                      min={1}
                      max={chapters.length}
                      value={endChapter}
                      onChange={(e) => setEndChapter(Math.min(chapters.length, Math.max(1, parseInt(e.target.value) || 1)))}
                      className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black text-neutral-900 dark:text-neutral-100 outline-none"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 2. Untagged Chapters Warning Alert */}
            {hasUntaggedChapters && (
              <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50/80 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 text-xs space-y-2.5">
                <div className="flex items-start gap-2.5">
                  <RiAlertLine className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div className="flex-1 space-y-1">
                    <div className="font-semibold text-amber-950 dark:text-amber-100 flex items-center justify-between">
                      <span>{untaggedChapters.length} chapter(s) in this selection are untagged</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-200/50 dark:bg-amber-900/50 font-normal">
                        Notice
                      </span>
                    </div>
                    <p className="text-[11px] text-amber-800/90 dark:text-amber-300/90 leading-relaxed">
                      Dialogue attribution (Stage B) has not been performed on these chapters yet. Any dialogue lines without tagged speakers will be read using the generic Narrator voice.
                    </p>
                    <p className="text-[11px] font-medium text-amber-900 dark:text-amber-200">
                      You can proceed with synthesis anyway, or cancel to tag dialogue first.
                    </p>

                    {/* Untagged list collapse */}
                    <div className="pt-0.5">
                      <button
                        type="button"
                        onClick={() => setShowUntaggedList(!showUntaggedList)}
                        className="text-[11px] font-semibold text-amber-800 dark:text-amber-300 underline underline-offset-2 hover:opacity-80 cursor-pointer"
                      >
                        {showUntaggedList ? "Hide untagged chapters list" : `View ${untaggedChapters.length} untagged chapters`}
                      </button>
                      {showUntaggedList && (
                        <div className="mt-2 max-h-24 overflow-y-auto space-y-1 pl-1 text-[11px] text-amber-800 dark:text-amber-300 font-mono">
                          {untaggedChapters.map((c) => (
                            <div key={c.id} className="truncate">
                              · Chapter {c.chapter_number}: {c.title}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 3. TTS Model Configuration */}
            <div className="space-y-3">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider block">
                2. TTS Engine Model
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {TTS_MODELS.map((model) => {
                  const isSelected = selectedModel === model.id;
                  return (
                    <div
                      key={model.id}
                      onClick={() => setSelectedModel(model.id)}
                      className={cn(
                        "p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between space-y-2",
                        isSelected
                          ? "border-neutral-900 dark:border-neutral-100 bg-neutral-50 dark:bg-neutral-900/80 shadow-2xs"
                          : "border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50/60 dark:hover:bg-neutral-900/40",
                      )}
                    >
                      <div className="flex items-start justify-between gap-1.5">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-neutral-900 dark:text-neutral-100">
                              {model.name}
                            </span>
                            {model.isCloning && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                                Voice Cloning
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-neutral-400 font-medium">
                            {model.badge} · {model.size}
                          </span>
                        </div>
                        {isSelected && (
                          <span className="h-2 w-2 rounded-full bg-neutral-900 dark:bg-neutral-100 shrink-0 mt-1" />
                        )}
                      </div>

                      <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-snug line-clamp-2">
                        {model.description}
                      </p>

                      <div className="flex items-center justify-between text-[10px] text-neutral-400 font-mono pt-1 border-t border-neutral-100 dark:border-neutral-800">
                        <span>{model.vram}</span>
                        {model.highlight && (
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold font-sans">
                            {model.highlight}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 4. Character Casting Review (when model.isCloning === true) */}
            {selectedModelOption.isCloning && (
              <div className="space-y-3 p-4 rounded-xl border border-purple-200/80 dark:border-purple-800/50 bg-purple-50/30 dark:bg-purple-950/20">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <RiUserVoiceLine className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                    <div>
                      <span className="text-xs font-bold text-neutral-900 dark:text-neutral-100">
                        Character Voice Casting Review
                      </span>
                      <p className="text-[11px] text-neutral-500">
                        {selectedModelOption.name} clones voices from custom audio references.
                      </p>
                    </div>
                  </div>
                  <span className="text-[11px] font-mono text-neutral-500">
                    {characters.length} character{characters.length === 1 ? "" : "s"}
                  </span>
                </div>

                {characters.length === 0 ? (
                  <div className="py-4 text-center text-xs text-neutral-500">
                    No characters detected in this project yet. Characters will default to the narrator voice.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {characters.map((char) => {
                      const assignedVoice = voices.find((v) => v.id === char.assigned_voice_id);
                      const isAuditioning = auditioningVoiceId === assignedVoice?.id;

                      return (
                        <div
                          key={char.id}
                          className="flex items-center justify-between p-2.5 rounded-lg border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-black text-xs gap-3"
                        >
                          {/* Character info */}
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <CharacterAvatar
                              name={char.name}
                              gender={char.gender}
                              className="h-6 w-6 text-[10px] shrink-0"
                            />
                            <div className="min-w-0">
                              <span className="font-semibold text-neutral-900 dark:text-neutral-100 truncate block">
                                {char.name}
                              </span>
                              <span className="text-[10px] text-neutral-400 capitalize">
                                {char.gender} · {char.dialogue_count || 0} lines
                              </span>
                            </div>
                          </div>

                          {/* Voice selector */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            {assignedVoice?.audio_url && (
                              <button
                                type="button"
                                onClick={() => toggleAudition(assignedVoice)}
                                className="p-1 rounded-md text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                                title="Audition reference voice sample"
                              >
                                {isAuditioning ? (
                                  <RiPauseFill className="h-3.5 w-3.5 text-purple-600" />
                                ) : (
                                  <RiPlayFill className="h-3.5 w-3.5" />
                                )}
                              </button>
                            )}

                            <NativeSelect
                              value={char.assigned_voice_id || ""}
                              onChange={(e) => handleAssignVoice(char.id, e.target.value || null)}
                              className="h-7 text-[11px] w-40"
                              disabled={updatingCharacterId === char.id}
                            >
                              <NativeSelectOption value="">
                                Unassigned (Narrator Default)
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

            {/* 5. Kaggle Multi-Lane Dispatch & Options */}
            <div className="space-y-3">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider block">
                3. Dispatch & Cache Configuration
              </label>

              {activeAccounts.length === 0 ? (
                <div className="p-3.5 rounded-xl border border-amber-300 dark:border-amber-700/60 bg-amber-50/60 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 text-xs space-y-2">
                  <div className="flex items-center gap-2 font-semibold">
                    <RiAlertLine className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span>No active Kaggle accounts configured</span>
                  </div>
                  <p className="text-[11px] text-amber-800/90 dark:text-amber-300/90 leading-relaxed">
                    GPU synthesis requires at least one configured Kaggle account with API credentials.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs border-amber-400 text-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/40"
                    asChild
                  >
                    <Link to="/profile?tab=kaggle" onClick={() => onOpenChange(false)}>
                      Open Kaggle Settings <RiExternalLinkLine className="h-3 w-3 ml-1" />
                    </Link>
                  </Button>
                </div>
              ) : (
                <div className="p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/30 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                      <RiCpuLine className="h-4 w-4" />
                    </div>
                    <div>
                      <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                        {activeAccounts.length} Verified Kaggle Account(s) in Pool
                      </span>
                      <p className="text-[11px] text-neutral-500">
                        Will partition across {Math.min(activeAccounts.length, targetedChapters.length)} parallel GPU synthesis lane(s).
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
                    onClick={loadInitialData}
                  >
                    <RiRefreshLine className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}

              {/* Cache to Dataset Toggle */}
              <div
                onClick={() => setCacheToDataset(!cacheToDataset)}
                className="py-2.5 px-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/30 dark:bg-neutral-900/20 flex items-center justify-between cursor-pointer hover:bg-neutral-100/50 dark:hover:bg-neutral-900/40 transition-colors"
              >
                <div>
                  <div className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
                    <RiHardDrive2Line className="h-3.5 w-3.5 text-blue-500" />
                    <span>Mount and cache model in Kaggle dataset</span>
                  </div>
                  <div className="text-[11px] text-neutral-500">
                    Saves downloaded model weights in a private dataset for instant warm restarts.
                  </div>
                </div>
                <div
                  role="switch"
                  aria-checked={cacheToDataset}
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 ${
                    cacheToDataset
                      ? "bg-neutral-900 dark:bg-neutral-100"
                      : "bg-neutral-200 dark:bg-neutral-800"
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white dark:bg-neutral-900 shadow-2xs transition-transform duration-200 ${
                      cacheToDataset ? "translate-x-4.5" : "translate-x-1"
                    }`}
                  />
                </div>
              </div>

              {/* Dev Offline Heuristic Toggle */}
              <div
                onClick={() => setAllowDevOffline(!allowDevOffline)}
                className="py-2.5 px-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/30 dark:bg-neutral-900/20 flex items-center justify-between cursor-pointer hover:bg-neutral-100/50 dark:hover:bg-neutral-900/40 transition-colors"
              >
                <div>
                  <div className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
                    <RiFlashlightLine className="h-3.5 w-3.5 text-amber-500" />
                    <span>Allow offline developer simulation</span>
                  </div>
                  <div className="text-[11px] text-neutral-500">
                    Fallback simulation for offline pipeline testing without consuming Kaggle GPU hours.
                  </div>
                </div>
                <div
                  role="switch"
                  aria-checked={allowDevOffline}
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 ${
                    allowDevOffline
                      ? "bg-neutral-900 dark:bg-neutral-100"
                      : "bg-neutral-200 dark:bg-neutral-800"
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white dark:bg-neutral-900 shadow-2xs transition-transform duration-200 ${
                      allowDevOffline ? "translate-x-4.5" : "translate-x-1"
                    }`}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Footer (identical to TaggingConfigDialog pattern) */}
          <div className="flex items-center justify-between px-6 py-4 bg-neutral-50/80 dark:bg-black border-t border-neutral-100 dark:border-neutral-800 shrink-0">
            <div className="flex items-center gap-2 text-xs text-neutral-500 font-medium">
              <span>
                {targetedChapters.length} of {chapters.length} chapters selected
              </span>
              {hasUntaggedChapters && (
                <span className="text-amber-600 dark:text-amber-400 font-semibold">
                  ({untaggedChapters.length} untagged)
                </span>
              )}
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                disabled={isLaunching}
                className="px-4 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs font-semibold text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleStartGeneration}
                disabled={isLaunching || targetedChapters.length === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-neutral-200 dark:text-neutral-900 text-white text-xs font-semibold shadow-xs cursor-pointer disabled:opacity-50"
              >
                {isLaunching ? (
                  <>
                    <RiLoader4Line className="h-3.5 w-3.5 animate-spin" />
                    <span>Launching lanes...</span>
                  </>
                ) : (
                  <>
                    <span>
                      {hasUntaggedChapters
                        ? `Proceed & Generate (${targetedChapters.length} Ch)`
                        : `Generate Audio (${targetedChapters.length} Ch)`}
                    </span>
                    <RiArrowRightLine className="h-3.5 w-3.5" />
                  </>
                )}
              </button>
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
