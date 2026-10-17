import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import useSWR from "swr";
import type { ScriptSegment, SegmentAlignment } from "@novelova/shared-types";
import {
  getChapterAudioStream,
  generateChapterAudio,
  resetChapterAudio,
} from "@/services/chapters";

export interface UseChapterAudioReturn {
  isGenerated: boolean;
  isGenerating: boolean;
  generationError: string | null;
  audioPlaybackError: string | null;
  accountUsed: string | null;
  isPlaying: boolean;
  auditioningSegmentId: string | null;
  currentTime: number;
  duration: number;
  playbackRate: number;
  volume: number;
  isMuted: boolean;
  autoScroll: boolean;
  activeSegmentId: string | null;
  activeSegmentIndex: number;
  audioUrl: string | null;
  alignments: SegmentAlignment[];
  play: () => void;
  pause: () => void;
  togglePlayPause: () => void;
  seek: (seconds: number) => void;
  seekToSegment: (segmentId: string) => void;
  auditionTake: (segmentId: string, takeUrl?: string | null) => void;
  stopAudition: () => void;
  skipNext: () => void;
  skipPrev: () => void;
  setPlaybackRate: (rate: number) => void;
  cyclePlaybackRate: () => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  toggleAutoScroll: () => void;
  startGeneration: () => Promise<void>;
  resetAudio: () => Promise<void>;
  clearGenerationError: () => void;
  mutateAudioStream: () => Promise<unknown>;
  audioRef: React.RefObject<HTMLAudioElement | null>;
}

const PLAYBACK_RATES = [0.8, 1.0, 1.25, 1.5, 2.0];

/**
 * Binary search to efficiently find the segment active at the given millisecond timestamp.
 */
function findActiveSegmentIndex(alignments: SegmentAlignment[], timeMs: number): number {
  if (alignments.length === 0) return -1;
  let low = 0;
  let high = alignments.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const seg = alignments[mid];
    if (timeMs >= seg.start_ms && timeMs < seg.end_ms) {
      return mid;
    } else if (timeMs < seg.start_ms) {
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  if (low > 0 && low < alignments.length && timeMs < alignments[low].start_ms) {
    return low - 1;
  }
  if (low < alignments.length) {
    return low;
  }
  return alignments.length - 1;
}

export function useChapterAudio(
  projectId: string | null,
  chapterId: string | null,
  segments: ScriptSegment[] = [],
): UseChapterAudioReturn {
  const segmentsRef = useRef(segments);
  useEffect(() => {
    segmentsRef.current = segments;
  }, [segments]);

  const [isPlaying, setIsPlaying] = useState(false);
  const [auditioningSegmentId, setAuditioningSegmentId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRateState] = useState(1.0);
  const [volume, setVolumeState] = useState(1.0);
  const [isMuted, setIsMuted] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);

  const [isLocallyGenerating, setIsLocallyGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [audioPlaybackError, setAudioPlaybackError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const takeAudioRef = useRef<HTMLAudioElement | null>(null);
  const auditionEndMsRef = useRef<number | null>(null);

  // Fetch real audio stream & precomputed alignments from backend
  const { data: audioStream, mutate: mutateAudioStream } = useSWR(
    projectId && chapterId
      ? `/projects/${projectId}/chapters/${chapterId}/audio-stream`
      : null,
    () => getChapterAudioStream(projectId!, chapterId!),
    {
      revalidateOnFocus: false,
      // If currently generating on Kaggle, poll status every 4 seconds
      refreshInterval: (latestData) => {
        return latestData?.audio_job_status === "generating" ||
          latestData?.audio_job_status === "queued"
          ? 4000
          : 0;
      },
    },
  );

  const isGenerated = Boolean(audioStream?.is_synthesized && audioStream.audio_url);
  const audioUrl = isGenerated ? audioStream?.audio_url || null : null;

  const isGenerating =
    isLocallyGenerating ||
    audioStream?.audio_job_status === "generating" ||
    audioStream?.audio_job_status === "queued";

  const accountUsed = audioStream?.audio_account_used || null;

  // Sync server error into local error state if present
  useEffect(() => {
    if (audioStream?.audio_job_error && !generationError) {
      setGenerationError(audioStream.audio_job_error);
    }
  }, [audioStream?.audio_job_error, generationError]);

  const alignments = useMemo<SegmentAlignment[]>(() => {
    if (audioStream?.alignments && audioStream.alignments.length > 0) {
      return audioStream.alignments;
    }
    return [];
  }, [audioStream?.alignments]);

  const totalDuration = useMemo(() => {
    if (audioStream?.total_duration_seconds) {
      return audioStream.total_duration_seconds;
    }
    if (alignments.length > 0) {
      return alignments[alignments.length - 1].end_ms / 1000;
    }
    return 0;
  }, [audioStream?.total_duration_seconds, alignments]);

  // Active segment index and ID via binary search (only active when audio exists)
  const activeSegmentIndex = useMemo(() => {
    if (!isGenerated || alignments.length === 0) return -1;
    return findActiveSegmentIndex(alignments, Math.round(currentTime * 1000));
  }, [isGenerated, alignments, currentTime]);

  const activeSegmentId = useMemo(() => {
    if (auditioningSegmentId) return auditioningSegmentId;
    if (activeSegmentIndex >= 0 && activeSegmentIndex < alignments.length) {
      return alignments[activeSegmentIndex].segment_id;
    }
    return null;
  }, [alignments, activeSegmentIndex, auditioningSegmentId]);

  // Keep HTML5 audio in sync if real audio exists
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audioUrl) {
      if (audio.src !== audioUrl) {
        audio.src = audioUrl;
        audio.load();
      }
    } else {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
  }, [audioUrl]);

  // Control playback rate on audio elements
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
    if (takeAudioRef.current) {
      takeAudioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  // Control volume & mute on audio elements
  useEffect(() => {
    const vol = isMuted ? 0 : volume;
    if (audioRef.current) {
      audioRef.current.volume = vol;
    }
    if (takeAudioRef.current) {
      takeAudioRef.current.volume = vol;
    }
  }, [volume, isMuted]);

  // Reset playback position on chapter change
  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setAudioPlaybackError(null);
    setGenerationError(null);
    setAuditioningSegmentId(null);
    auditionEndMsRef.current = null;
    if (takeAudioRef.current) {
      takeAudioRef.current.pause();
      takeAudioRef.current.removeAttribute("src");
      takeAudioRef.current.load();
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, [chapterId]);

  // Trigger real Kaggle audio generation
  const startGeneration = useCallback(async () => {
    if (!projectId || !chapterId || isGenerating) return;
    setGenerationError(null);
    setIsLocallyGenerating(true);

    try {
      await generateChapterAudio(projectId, chapterId);
      await mutateAudioStream();
    } catch (err: unknown) {
      const axiosErr = err as {
        response?: { data?: { error?: { message?: string }; message?: string } };
        message?: string;
      };
      const message =
        axiosErr.response?.data?.error?.message ||
        axiosErr.response?.data?.message ||
        axiosErr.message ||
        "Failed to dispatch audio synthesis job to Kaggle.";
      setGenerationError(message);
    } finally {
      setIsLocallyGenerating(false);
    }
  }, [projectId, chapterId, isGenerating, mutateAudioStream]);

  // Reset chapter audio
  const resetAudio = useCallback(async () => {
    if (!projectId || !chapterId) return;
    try {
      await resetChapterAudio(projectId, chapterId);
      setIsPlaying(false);
      setCurrentTime(0);
      setGenerationError(null);
      setAudioPlaybackError(null);
      await mutateAudioStream();
    } catch (err: unknown) {
      const axiosErr = err as { message?: string };
      setGenerationError(axiosErr.message || "Failed to reset audio.");
    }
  }, [projectId, chapterId, mutateAudioStream]);

  // Play / Pause Controls
  const stopAudition = useCallback(() => {
    if (takeAudioRef.current) {
      takeAudioRef.current.pause();
      takeAudioRef.current.currentTime = 0;
    }
    if (auditionEndMsRef.current !== null && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
    auditionEndMsRef.current = null;
    setAuditioningSegmentId(null);
  }, []);

  const play = useCallback(() => {
    if (!isGenerated) {
      // If audio is not generated, do NOT fake play! Trigger generation instead.
      startGeneration();
      return;
    }

    if (takeAudioRef.current) {
      takeAudioRef.current.pause();
    }
    setAuditioningSegmentId(null);
    auditionEndMsRef.current = null;

    if (audioRef.current) {
      setAudioPlaybackError(null);
      audioRef.current
        .play()
        .then(() => {
          setIsPlaying(true);
        })
        .catch((err: Error) => {
          setIsPlaying(false);
          setAudioPlaybackError(err.message || "Unable to start audio playback.");
        });
    }
  }, [isGenerated, startGeneration]);

  const pause = useCallback(() => {
    setIsPlaying(false);
    if (audioRef.current) {
      audioRef.current.pause();
    }
    if (auditionEndMsRef.current !== null) {
      auditionEndMsRef.current = null;
      setAuditioningSegmentId(null);
    }
    if (takeAudioRef.current) {
      takeAudioRef.current.pause();
      setAuditioningSegmentId(null);
    }
  }, []);

  const togglePlayPause = useCallback(() => {
    if (!isGenerated) {
      startGeneration();
      return;
    }

    if (isPlaying) {
      pause();
    } else {
      play();
    }
  }, [isGenerated, isPlaying, pause, play, startGeneration]);

  const seek = useCallback(
    (seconds: number) => {
      if (!isGenerated) return;
      const clamped = Math.max(0, Math.min(seconds, totalDuration));
      setCurrentTime(clamped);
      if (audioRef.current && Math.abs(audioRef.current.currentTime - clamped) > 0.1) {
        audioRef.current.currentTime = clamped;
      }
      if (auditioningSegmentId && auditionEndMsRef.current !== null) {
        if (clamped * 1000 >= auditionEndMsRef.current) {
          if (audioRef.current) audioRef.current.pause();
          setIsPlaying(false);
          setAuditioningSegmentId(null);
          auditionEndMsRef.current = null;
        }
      }
    },
    [isGenerated, totalDuration, auditioningSegmentId],
  );

  const auditionTake = useCallback(
    (segmentId: string, takeUrl?: string | null) => {
      // Toggle off if currently auditioning the same segment
      if (auditioningSegmentId === segmentId) {
        stopAudition();
        return;
      }

      // Stop any running playback
      if (audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
        setIsPlaying(false);
      }
      if (takeAudioRef.current) {
        takeAudioRef.current.pause();
      }
      auditionEndMsRef.current = null;

      // 1. If explicit segment take audio URL exists, play isolated take
      if (takeUrl) {
        if (!takeAudioRef.current) {
          takeAudioRef.current = new Audio();
        }
        const take = takeAudioRef.current;
        take.src = takeUrl;
        take.playbackRate = playbackRate;
        take.onended = () => {
          // If master audio is not ready yet, auto-advance to next ready take for continuous live auditioning
          const curSegs = segmentsRef.current;
          const curIdx = curSegs.findIndex((s) => s.id === segmentId);
          if (curIdx >= 0 && curIdx < curSegs.length - 1) {
            const nextSeg = curSegs[curIdx + 1];
            if (nextSeg && nextSeg.audio_url) {
              auditionTake(nextSeg.id, nextSeg.audio_url);
              return;
            }
          }
          setAuditioningSegmentId(null);
        };
        take.onerror = () => {
          setAuditioningSegmentId(null);
        };
        setAuditioningSegmentId(segmentId);
        take.play().catch(() => {
          setAuditioningSegmentId(null);
        });
        return;
      }

      // 2. Fallback to master chapter audio if generated
      const match = alignments.find((a) => a.segment_id === segmentId);
      if (match && isGenerated && audioRef.current) {
        setAuditioningSegmentId(segmentId);
        auditionEndMsRef.current = match.end_ms;
        audioRef.current.currentTime = match.start_ms / 1000;
        audioRef.current.volume = isMuted ? 0 : volume;
        audioRef.current.playbackRate = playbackRate;
        audioRef.current
          .play()
          .then(() => {
            setIsPlaying(true);
          })
          .catch(() => {
            setAuditioningSegmentId(null);
            auditionEndMsRef.current = null;
          });
        return;
      }

      // 3. Audio not generated yet: trigger chapter generation
      startGeneration();
    },
    [
      auditioningSegmentId,
      stopAudition,
      alignments,
      isGenerated,
      playbackRate,
      isMuted,
      volume,
      startGeneration,
    ],
  );

  const seekToSegment = useCallback(
    (segmentId: string) => {
      if (!isGenerated) {
        // Prompt to generate audio
        startGeneration();
        return;
      }

      const match = alignments.find((a) => a.segment_id === segmentId);
      if (!match) return;

      const targetSec = match.start_ms / 1000;
      seek(targetSec);
      if (audioRef.current && !isPlaying) {
        audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
      }
    },
    [isGenerated, alignments, seek, isPlaying, startGeneration],
  );

  const skipNext = useCallback(() => {
    if (!isGenerated) return;
    if (activeSegmentIndex < alignments.length - 1) {
      const next = alignments[activeSegmentIndex + 1];
      seek(next.start_ms / 1000);
    }
  }, [isGenerated, activeSegmentIndex, alignments, seek]);

  const skipPrev = useCallback(() => {
    if (!isGenerated) return;
    if (activeSegmentIndex <= 0) {
      seek(0);
      return;
    }
    const currentSeg = alignments[activeSegmentIndex];
    if (currentTime - currentSeg.start_ms / 1000 > 2.0) {
      seek(currentSeg.start_ms / 1000);
    } else {
      const prevSeg = alignments[activeSegmentIndex - 1];
      seek(prevSeg.start_ms / 1000);
    }
  }, [isGenerated, activeSegmentIndex, alignments, currentTime, seek]);

  const cyclePlaybackRate = useCallback(() => {
    setPlaybackRateState((prev) => {
      const idx = PLAYBACK_RATES.indexOf(prev);
      const nextIdx = (idx + 1) % PLAYBACK_RATES.length;
      return PLAYBACK_RATES[nextIdx];
    });
  }, []);

  const setPlaybackRate = useCallback((rate: number) => {
    setPlaybackRateState(rate);
  }, []);

  const setVolume = useCallback((vol: number) => {
    const clamped = Math.max(0, Math.min(1, vol));
    setVolumeState(clamped);
    if (clamped > 0 && isMuted) {
      setIsMuted(false);
    }
  }, [isMuted]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  const toggleAutoScroll = useCallback(() => {
    setAutoScroll((prev) => !prev);
  }, []);

  const clearGenerationError = useCallback(() => {
    setGenerationError(null);
  }, []);

  // Keyboard shortcut listener: Spacebar toggles playback when not typing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        const target = e.target as HTMLElement | null;
        if (
          target &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.isContentEditable)
        ) {
          return;
        }
        e.preventDefault();
        togglePlayPause();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [togglePlayPause]);

  return {
    isGenerated,
    isGenerating,
    generationError,
    audioPlaybackError,
    accountUsed,
    isPlaying,
    auditioningSegmentId,
    currentTime,
    duration: totalDuration,
    playbackRate,
    volume,
    isMuted,
    autoScroll,
    activeSegmentId,
    activeSegmentIndex,
    audioUrl,
    alignments,
    play,
    pause,
    togglePlayPause,
    seek,
    seekToSegment,
    auditionTake,
    stopAudition,
    skipNext,
    skipPrev,
    setPlaybackRate,
    cyclePlaybackRate,
    setVolume,
    toggleMute,
    toggleAutoScroll,
    startGeneration,
    resetAudio,
    clearGenerationError,
    mutateAudioStream,
    audioRef,
  };
}
