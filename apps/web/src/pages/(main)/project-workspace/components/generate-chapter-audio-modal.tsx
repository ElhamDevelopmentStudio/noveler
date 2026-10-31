import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  RiSparklingLine,
  RiPlayFill,
  RiPauseFill,
  RiCpuLine,
  RiHardDrive2Line,
  RiCheckLine,
  RiAlertLine,
  RiLoader4Line,
  RiUserVoiceLine,
  RiInformationLine,
} from "@remixicon/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CharacterAvatar } from "@/components/ui/character-avatar";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type {
  Chapter,
  ScriptSegment,
  Character,
  Voice,
  KaggleAccount,
  ChapterPreflightAudioResponse,
} from "@novelova/shared-types";
import { getVoices } from "@/services/voices";
import {
  getCharacters,
  updateCharacter,
} from "@/services/character-and-pronunciation";
import { getKaggleAccounts } from "@/services/kaggle";
import { preflightChapterAudio } from "@/services/chapters";
import { useAuth } from "@/context/auth-context";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";

export interface GenerateChapterAudioModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  chapter: Chapter | null;
  segments?: ScriptSegment[];
  onConfirmGenerate: (options: {
    ttsModel: string;
    cacheToDataset: boolean;
    kaggleAccountId?: string;
  }) => Promise<void> | void;
  onCharactersMutate?: () => void;
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

interface SpeakerCastItem {
  speakerName: string;
  character: Character | null;
  gender: "male" | "female" | "neutral";
  linesCount: number;
  wordCount: number;
  assignedVoice: Voice | null;
  assignmentSource: "direct" | "default-male" | "default-female" | "unassigned";
}

export function GenerateChapterAudioModal({
  open,
  onOpenChange,
  projectId,
  chapter,
  segments = [],
  onConfirmGenerate,
  onCharactersMutate,
}: GenerateChapterAudioModalProps) {
  const { user } = useAuth();

  // Model & Execution Config
  const [selectedModel, setSelectedModel] = useState<string>(
    user?.preferred_tts_model || "chatterbox-turbo",
  );
  const [cacheToDataset, setCacheToDataset] = useState<boolean>(true);
  const [selectedKaggleAccountId, setSelectedKaggleAccountId] = useState<string>("");

  // Data State
  const [characters, setCharacters] = useState<Character[]>([]);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [kaggleAccounts, setKaggleAccounts] = useState<KaggleAccount[]>([]);
  const [preflightData, setPreflightData] = useState<ChapterPreflightAudioResponse | null>(null);

  // UI state
  const [isLoadingData, setIsLoadingData] = useState<boolean>(false);
  const [isPreflighting, setIsPreflighting] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [updatingCharacterId, setUpdatingCharacterId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // In-modal reference audio audition state
  const [auditioningVoiceId, setAuditioningVoiceId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Stop audition audio when closing or unmounting
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  useEffect(() => {
    if (!open && audioRef.current) {
      audioRef.current.pause();
      setAuditioningVoiceId(null);
    }
  }, [open]);

  // Load project characters, custom voices, and Kaggle accounts
  const loadWorkspaceData = useCallback(async () => {
    if (!projectId) return;
    setIsLoadingData(true);
    setErrorMessage(null);

    try {
      const [charRes, voiceList, accounts] = await Promise.all([
        getCharacters(projectId),
        getVoices(projectId).catch(() => [] as Voice[]),
        getKaggleAccounts().catch(() => [] as KaggleAccount[]),
      ]);

      setCharacters(charRes.characters || []);
      setVoices(voiceList || []);
      setKaggleAccounts(accounts || []);

      // Auto-select first available Kaggle account if not set
      const firstAvailable = accounts.find((a) => a.is_active && a.status !== "failed");
      if (firstAvailable && !selectedKaggleAccountId) {
        setSelectedKaggleAccountId(firstAvailable.id);
      }
    } catch (err: unknown) {
      console.warn("Failed to load workspace synthesis data:", err);
    } finally {
      setIsLoadingData(false);
    }
  }, [projectId, selectedKaggleAccountId]);

  useEffect(() => {
    if (open) {
      loadWorkspaceData();
    }
  }, [open, loadWorkspaceData]);

  // Preflight check for chosen model
  useEffect(() => {
    if (!open || !chapter?.id || !projectId) return;

    let isMounted = true;
    setIsPreflighting(true);

    preflightChapterAudio(projectId, chapter.id, {
      preferred_tts_model: selectedModel,
    })
      .then((res) => {
        if (isMounted) {
          setPreflightData(res);
        }
      })
      .catch((err) => {
        console.warn("Preflight audio check notice:", err);
      })
      .finally(() => {
        if (isMounted) setIsPreflighting(false);
      });

    return () => {
      isMounted = false;
    };
  }, [open, projectId, chapter?.id, selectedModel]);

  // Resolve default voices
  const defaultMaleVoice = useMemo(() => {
    return (
      voices.find((v) => v.default_for_gender === "male") ||
      voices.find((v) => v.is_default && v.gender === "male") ||
      null
    );
  }, [voices]);

  const defaultFemaleVoice = useMemo(() => {
    return (
      voices.find((v) => v.default_for_gender === "female") ||
      voices.find((v) => v.is_default && v.gender === "female") ||
      null
    );
  }, [voices]);

  // Segments resolution (from prop or chapter)
  const activeSegments = useMemo(() => {
    return segments.length > 0 ? segments : chapter?.segments || [];
  }, [segments, chapter?.segments]);

  // Compute stats
  const stats = useMemo(() => {
    let dialogueCount = 0;
    let narratorCount = 0;
    let totalWords = 0;

    for (const seg of activeSegments) {
      const words = seg.text ? seg.text.trim().split(/\s+/).filter(Boolean).length : 0;
      totalWords += words;

      const isNarrator =
        !seg.is_dialogue ||
        !seg.speaker ||
        seg.speaker.trim() === "" ||
        seg.speaker.toLowerCase() === "narrator";

      if (isNarrator) {
        narratorCount++;
      } else {
        dialogueCount++;
      }
    }

    const estimatedDurationSeconds = Math.round((totalWords / 150) * 60);
    const mins = Math.floor(estimatedDurationSeconds / 60);
    const secs = estimatedDurationSeconds % 60;

    return {
      totalSegments: activeSegments.length,
      dialogueCount,
      narratorCount,
      totalWords,
      formattedDuration: mins > 0 ? `${mins}m ${secs}s` : `${secs}s`,
    };
  }, [activeSegments]);

  // Group and compute distinct speakers in this chapter
  const speakerCast = useMemo<SpeakerCastItem[]>(() => {
    const speakerMap = new Map<
      string,
      { count: number; words: number }
    >();

    for (const seg of activeSegments) {
      const isNarrator =
        !seg.is_dialogue ||
        !seg.speaker ||
        seg.speaker.trim() === "" ||
        seg.speaker.toLowerCase() === "narrator";

      const name = isNarrator ? "Narrator" : seg.speaker!.trim();
      const wordCount = seg.text
        ? seg.text.trim().split(/\s+/).filter(Boolean).length
        : 0;

      const existing = speakerMap.get(name) || { count: 0, words: 0 };
      existing.count += 1;
      existing.words += wordCount;
      speakerMap.set(name, existing);
    }

    const items: SpeakerCastItem[] = [];

    speakerMap.forEach(({ count, words }, speakerName) => {
      const lower = speakerName.toLowerCase();
      const matchedChar =
        characters.find((c) => c.name.toLowerCase() === lower) || null;

      let gender: "male" | "female" | "neutral" = "neutral";
      if (matchedChar?.gender) {
        const g = matchedChar.gender.toLowerCase();
        if (g === "male" || g === "female") gender = g;
      } else if (lower.includes("female")) {
        gender = "female";
      } else if (lower.includes("male") || lower === "narrator") {
        gender = "male";
      }

      let assignedVoice: Voice | null = null;
      let assignmentSource: "direct" | "default-male" | "default-female" | "unassigned" =
        "unassigned";

      // 1. Check direct voice assignment
      if (matchedChar?.assigned_voice_id) {
        const direct = voices.find((v) => v.id === matchedChar.assigned_voice_id);
        if (direct) {
          assignedVoice = direct;
          assignmentSource = "direct";
        }
      }

      // 2. If unassigned, check gender default
      if (!assignedVoice) {
        if (gender === "female" && defaultFemaleVoice) {
          assignedVoice = defaultFemaleVoice;
          assignmentSource = "default-female";
        } else if (gender === "male" && defaultMaleVoice) {
          assignedVoice = defaultMaleVoice;
          assignmentSource = "default-male";
        } else if (lower === "narrator" && defaultMaleVoice) {
          assignedVoice = defaultMaleVoice;
          assignmentSource = "default-male";
        }
      }

      items.push({
        speakerName,
        character: matchedChar,
        gender,
        linesCount: count,
        wordCount: words,
        assignedVoice,
        assignmentSource,
      });
    });

    // Sort: Narrator first, then by line count descending
    return items.sort((a, b) => {
      if (a.speakerName.toLowerCase() === "narrator") return -1;
      if (b.speakerName.toLowerCase() === "narrator") return 1;
      return b.linesCount - a.linesCount;
    });
  }, [activeSegments, characters, voices, defaultMaleVoice, defaultFemaleVoice]);

  // Audio audition player toggle
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

  // In-modal quick re-assignment
  const handleAssignVoice = async (
    speakerItem: SpeakerCastItem,
    newVoiceId: string,
  ) => {
    if (!speakerItem.character) return;
    const charId = speakerItem.character.id;
    setUpdatingCharacterId(charId);

    const chosenVoice = voices.find((v) => v.id === newVoiceId) || null;

    try {
      const updated = await updateCharacter(projectId, charId, {
        assigned_voice_id: chosenVoice ? chosenVoice.id : null,
        assigned_voice_name: chosenVoice ? chosenVoice.name : null,
      });

      // Update local character state
      setCharacters((prev) =>
        prev.map((c) => (c.id === charId ? { ...c, ...updated } : c)),
      );

      if (onCharactersMutate) {
        onCharactersMutate();
      }
    } catch (err: unknown) {
      console.warn("Could not update character voice assignment:", err);
    } finally {
      setUpdatingCharacterId(null);
    }
  };

  // Active Kaggle accounts
  const activeKaggleAccounts = useMemo(() => {
    return kaggleAccounts.filter((a) => a.is_active && a.status !== "failed");
  }, [kaggleAccounts]);

  const selectedModelSpec = useMemo(() => {
    return TTS_MODELS.find((m) => m.id === selectedModel) || TTS_MODELS[0];
  }, [selectedModel]);

  const handleStartGeneration = async () => {
    if (!chapter?.id || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await onConfirmGenerate({
        ttsModel: selectedModel,
        cacheToDataset,
        kaggleAccountId: selectedKaggleAccountId || undefined,
      });
      onOpenChange(false);
    } catch (err: unknown) {
      const axiosErr = err as {
        response?: { data?: { error?: { message?: string }; message?: string } };
        message?: string;
      };
      const message =
        axiosErr.response?.data?.error?.message ||
        axiosErr.response?.data?.message ||
        axiosErr.message ||
        "Failed to dispatch synthesis job to Kaggle.";
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden rounded-2xl border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#0c0d10] shadow-2xl flex flex-col max-h-[90vh]">
        {/* Hidden Audio Element for reference voice auditions */}
        <audio
          ref={audioRef}
          onEnded={() => setAuditioningVoiceId(null)}
          onError={() => setAuditioningVoiceId(null)}
          className="hidden"
        />

        {/* Modal Header */}
        <div className="p-5 sm:p-6 pb-4 border-b border-neutral-100 dark:border-white/[0.06] bg-neutral-50/50 dark:bg-neutral-900/40">
          <DialogHeader className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="h-7 w-7 rounded-lg flex items-center justify-center bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                <RiSparklingLine className="h-4 w-4" />
              </span>
              <DialogTitle className="text-lg font-bold font-serif text-neutral-900 dark:text-neutral-100 tracking-tight">
                Synthesize Chapter Audio
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-neutral-500 dark:text-neutral-400">
              Select your neural speech engine, review cloned character casting, and configure Kaggle GPU execution.
            </DialogDescription>
          </DialogHeader>

          {/* Chapter Overview Card */}
          <div className="mt-4 p-3 rounded-xl bg-white dark:bg-[#121317] border border-neutral-200/80 dark:border-white/[0.08] flex flex-wrap items-center justify-between gap-3 shadow-2xs">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 flex items-center justify-center font-mono font-bold text-xs shrink-0">
                Ch.{chapter?.chapter_number ?? 1}
              </div>
              <div className="min-w-0">
                <h4 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                  {chapter?.title || "Untitled Chapter"}
                </h4>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  {stats.totalSegments} segments ({stats.dialogueCount} dialogue · {stats.narratorCount} narration)
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs font-medium text-neutral-600 dark:text-neutral-300">
              <div className="flex items-center gap-1.5">
                <span className="text-neutral-400">Words:</span>
                <span className="font-semibold text-neutral-900 dark:text-neutral-100 font-mono">
                  {stats.totalWords.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-neutral-400">Runtime:</span>
                <span className="font-semibold text-neutral-900 dark:text-neutral-100 font-mono">
                  ~{stats.formattedDuration}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {/* Section 1: TTS Model Engine Selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-5 w-5 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-xs font-bold text-neutral-700 dark:text-neutral-300">
                  1
                </span>
                <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  Neural TTS Engine
                </h3>
              </div>
              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                {selectedModelSpec.isCloning ? "Cloning Engine Active" : "Preset Timbre Engine"}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {TTS_MODELS.map((model) => {
                const isSelected = selectedModel === model.id;
                return (
                  <div
                    key={model.id}
                    onClick={() => setSelectedModel(model.id)}
                    className={cn(
                      "p-3 rounded-xl border text-left transition-all cursor-pointer relative flex flex-col justify-between",
                      isSelected
                        ? "border-indigo-600 dark:border-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/20 shadow-2xs ring-1 ring-indigo-500/20"
                        : "border-neutral-200/80 dark:border-white/[0.08] hover:border-neutral-300 dark:hover:border-white/[0.15] bg-white dark:bg-neutral-900/50",
                    )}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-1.5 mb-1">
                        <div className="font-semibold text-xs sm:text-sm text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
                          <span>{model.name}</span>
                          {model.highlight && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-300">
                              {model.highlight}
                            </span>
                          )}
                        </div>
                        {isSelected && (
                          <RiCheckLine className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                        )}
                      </div>
                      <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-relaxed line-clamp-2">
                        {model.description}
                      </p>
                    </div>

                    <div className="mt-2.5 pt-2 border-t border-neutral-100 dark:border-white/[0.05] flex items-center justify-between text-[10px] text-neutral-400">
                      <span className="font-mono">{model.size} · {model.vram}</span>
                      <span
                        className={cn(
                          "px-1.5 py-0.5 rounded font-medium",
                          model.isCloning
                            ? "bg-purple-500/10 text-purple-600 dark:text-purple-400"
                            : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400",
                        )}
                      >
                        {model.badge}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 2: Voice Cloning Cast Overview */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-5 w-5 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-xs font-bold text-neutral-700 dark:text-neutral-300">
                  2
                </span>
                <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  Voice Cloning Cast Overview
                </h3>
              </div>
              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                {speakerCast.length} speaker{speakerCast.length !== 1 ? "s" : ""} in chapter
              </span>
            </div>

            {selectedModelSpec.isCloning && (
              <div className="p-3 rounded-xl bg-purple-50/70 dark:bg-purple-950/20 border border-purple-200/60 dark:border-purple-900/40 text-xs text-purple-900 dark:text-purple-200 flex items-start gap-2.5">
                <RiUserVoiceLine className="h-4 w-4 text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">Zero-Shot Voice Cloning Active:</span> Each speaker will be synthesized using their assigned reference audio sample. You can audition voice samples or customize assignments below before running.
                </div>
              </div>
            )}

            {/* Cast List */}
            <div className="rounded-xl border border-neutral-200/80 dark:border-white/[0.08] divide-y divide-neutral-100 dark:divide-white/[0.06] overflow-hidden bg-white dark:bg-neutral-900/30">
              {isLoadingData ? (
                <div className="p-6 flex items-center justify-center gap-2 text-xs text-neutral-400">
                  <RiLoader4Line className="h-4 w-4 animate-spin text-neutral-500" />
                  <span>Loading characters and custom voices...</span>
                </div>
              ) : speakerCast.length === 0 ? (
                <div className="p-6 text-center text-xs text-neutral-400">
                  No script segments found in this chapter.
                </div>
              ) : (
                speakerCast.map((item) => {
                  const isAuditioning = auditioningVoiceId === item.assignedVoice?.id;
                  const isUpdating = updatingCharacterId === item.character?.id;

                  return (
                    <div
                      key={item.speakerName}
                      className="p-3 sm:p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-neutral-50/50 dark:hover:bg-white/[0.02] transition-colors"
                    >
                      {/* Character Info */}
                      <div className="flex items-center gap-2.5 min-w-[160px]">
                        <CharacterAvatar
                          name={item.speakerName}
                          gender={item.gender}
                          className="h-8 w-8 ring-1 ring-neutral-200 dark:ring-neutral-700"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                              {item.speakerName}
                            </span>
                            <span
                              className={cn(
                                "text-[9px] uppercase px-1 py-0.2 rounded font-semibold",
                                item.gender === "female"
                                  ? "bg-pink-500/10 text-pink-600 dark:text-pink-400"
                                  : item.gender === "male"
                                    ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                                    : "bg-neutral-200/60 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400",
                              )}
                            >
                              {item.gender}
                            </span>
                          </div>
                          <p className="text-[11px] text-neutral-400">
                            {item.linesCount} lines · {item.wordCount} words
                          </p>
                        </div>
                      </div>

                      {/* Voice Assignment & Audition Player */}
                      <div className="flex items-center gap-2.5 flex-1 justify-end">
                        {/* Status Source Badge */}
                        <div className="flex items-center gap-1.5">
                          {item.assignmentSource === "direct" && (
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                              Custom Voice
                            </span>
                          )}
                          {item.assignmentSource === "default-male" && (
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20">
                              Default Male
                            </span>
                          )}
                          {item.assignmentSource === "default-female" && (
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20">
                              Default Female
                            </span>
                          )}
                          {item.assignmentSource === "unassigned" && (
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                              Unassigned
                            </span>
                          )}
                        </div>

                        {/* Audition Play Button */}
                        {item.assignedVoice?.audio_url && (
                          <button
                            type="button"
                            onClick={() => toggleAudition(item.assignedVoice!)}
                            className={cn(
                              "h-7 px-2 rounded-lg text-[11px] font-medium flex items-center gap-1 transition-all cursor-pointer shrink-0",
                              isAuditioning
                                ? "bg-indigo-600 text-white shadow-2xs"
                                : "bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200",
                            )}
                            title="Audition reference audio sample"
                          >
                            {isAuditioning ? (
                              <>
                                <RiPauseFill className="h-3.5 w-3.5 animate-pulse" />
                                <span>Auditioning</span>
                              </>
                            ) : (
                              <>
                                <RiPlayFill className="h-3.5 w-3.5" />
                                <span>Sample</span>
                              </>
                            )}
                          </button>
                        )}

                        {/* Quick Assignment Selector */}
                        {item.character ? (
                          <div className="w-40 sm:w-48 shrink-0">
                            <NativeSelect
                              disabled={isUpdating}
                              value={item.character.assigned_voice_id || ""}
                              onChange={(e) =>
                                handleAssignVoice(item, e.target.value)
                              }
                              className="text-xs py-1 h-7 rounded-lg"
                            >
                              <NativeSelectOption value="">
                                {item.gender === "female" && defaultFemaleVoice
                                  ? `(Default: ${defaultFemaleVoice.name})`
                                  : defaultMaleVoice
                                    ? `(Default: ${defaultMaleVoice.name})`
                                    : "No voice assigned"}
                              </NativeSelectOption>
                              {voices.map((v) => (
                                <NativeSelectOption key={v.id} value={v.id}>
                                  {v.name} ({v.gender})
                                </NativeSelectOption>
                              ))}
                            </NativeSelect>
                          </div>
                        ) : (
                          <span className="text-[11px] text-neutral-400 italic">
                            {item.assignedVoice?.name || "Auto System Voice"}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Section 3: Kaggle GPU Worker & Dataset Storage */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-5 w-5 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-xs font-bold text-neutral-700 dark:text-neutral-300">
                  3
                </span>
                <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  Kaggle GPU Execution & Storage
                </h3>
              </div>
              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                Dual GPU T4 x2 Cluster
              </span>
            </div>

            <div className="p-4 rounded-xl border border-neutral-200/80 dark:border-white/[0.08] bg-white dark:bg-neutral-900/30 space-y-4">
              {/* Kaggle Account Pool Status */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <RiCpuLine className="h-4 w-4 text-emerald-500" />
                    <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                      Kaggle Accelerator Environment
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                    {activeKaggleAccounts.length > 0
                      ? `${activeKaggleAccounts.length} GPU Account${activeKaggleAccounts.length !== 1 ? "s" : ""} Available (GPU T4 x2)`
                      : "No active Kaggle GPU accounts found."}
                  </p>
                </div>

                {activeKaggleAccounts.length > 0 ? (
                  <div className="w-full sm:w-56 shrink-0">
                    <NativeSelect
                      value={selectedKaggleAccountId}
                      onChange={(e) => setSelectedKaggleAccountId(e.target.value)}
                      className="text-xs h-8 rounded-lg"
                    >
                      <NativeSelectOption value="">
                        Auto-select best available GPU
                      </NativeSelectOption>
                      {activeKaggleAccounts.map((acc) => (
                        <NativeSelectOption key={acc.id} value={acc.id}>
                          @{acc.username} ({acc.status})
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </div>
                ) : (
                  <Link
                    to="/profile?tab=kaggle"
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                  >
                    Configure Kaggle Account →
                  </Link>
                )}
              </div>

              {/* Cache to Dataset Option */}
              <div className="pt-3 border-t border-neutral-100 dark:border-white/[0.06] flex items-start gap-3">
                <input
                  type="checkbox"
                  id="cache-dataset-opt"
                  checked={cacheToDataset}
                  onChange={(e) => setCacheToDataset(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <label
                  htmlFor="cache-dataset-opt"
                  className="text-xs cursor-pointer select-none space-y-0.5"
                >
                  <div className="font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
                    <RiHardDrive2Line className="h-3.5 w-3.5 text-indigo-500" />
                    <span>Cache model weights in Kaggle Dataset</span>
                    <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      Recommended
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
                    Stores {selectedModelSpec.name} ({selectedModelSpec.size}) in your private Kaggle dataset. Subsequent chapter runs warm-boot in ~15 seconds without re-downloading weights.
                  </p>
                </label>
              </div>

              {/* Preflight Cache Info Notice */}
              {isPreflighting ? (
                <div className="p-2.5 rounded-lg bg-neutral-50 dark:bg-white/[0.03] text-[11px] flex items-center gap-2 text-neutral-400">
                  <RiLoader4Line className="h-3.5 w-3.5 animate-spin" />
                  <span>Checking Kaggle dataset cache status...</span>
                </div>
              ) : preflightData ? (
                <div className="p-2.5 rounded-lg bg-neutral-50 dark:bg-white/[0.03] text-[11px] flex items-center justify-between text-neutral-600 dark:text-neutral-400">
                  <span className="flex items-center gap-1.5">
                    <RiInformationLine className="h-3.5 w-3.5 text-neutral-400" />
                    Dataset status: {preflightData.is_cached ? "Weights Cached" : "Requires Initial Download"}
                  </span>
                  {preflightData.kaggle_account_username && (
                    <span className="font-mono text-[10px]">
                      @{preflightData.kaggle_account_username}
                    </span>
                  )}
                </div>
              ) : null}
            </div>
          </div>

          {/* Error Banner */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
              <RiAlertLine className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1">{errorMessage}</div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 border-t border-neutral-100 dark:border-white/[0.06] bg-neutral-50/50 dark:bg-neutral-900/40 flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
            className="text-xs h-9 cursor-pointer"
          >
            Cancel
          </Button>

          <Button
            type="button"
            onClick={handleStartGeneration}
            disabled={isSubmitting}
            className="text-xs h-9 font-semibold gap-1.5 bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 hover:opacity-90 active:scale-95 transition-all shadow-xs cursor-pointer px-4"
          >
            {isSubmitting ? (
              <>
                <RiLoader4Line className="h-4 w-4 animate-spin" />
                <span>Dispatching to Kaggle GPU...</span>
              </>
            ) : (
              <>
                <RiSparklingLine className="h-4 w-4" />
                <span>Start Kaggle Generation</span>
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
