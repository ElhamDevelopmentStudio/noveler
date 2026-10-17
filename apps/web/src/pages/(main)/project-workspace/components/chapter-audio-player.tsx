import { useState, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  RiPlayFill,
  RiPauseFill,
  RiSkipBackLine,
  RiSkipForwardLine,
  RiVolumeUpLine,
  RiVolumeMuteLine,
  RiFocus3Line,
  RiSparklingLine,
  RiLoader4Line,
  RiErrorWarningLine,
  RiCloseLine,
  RiSettings4Line,
  RiTelegram2Line,
  RiCheckLine,
  RiExternalLinkLine,
} from "@remixicon/react";
import type { UseChapterAudioReturn } from "./use-chapter-audio";
import { sendChapterToTelegram } from "@/services/chapters";

interface ChapterAudioPlayerProps {
  audio: UseChapterAudioReturn;
  projectId?: string;
  chapterId?: string;
  chapterTitle?: string;
  chapterNumber?: number;
}

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds <= 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function ChapterAudioPlayer({
  audio,
  projectId,
  chapterId,
  chapterTitle,
  chapterNumber,
}: ChapterAudioPlayerProps) {
  const progressBarRef = useRef<HTMLDivElement>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPosition, setHoverPosition] = useState<number>(0);
  const [isSendingTelegram, setIsSendingTelegram] = useState(false);
  const [telegramStatus, setTelegramStatus] = useState<{
    type: "success" | "error" | "unconfigured";
    message: string;
  } | null>(null);

  const {
    isGenerated,
    isGenerating,
    generationError,
    audioPlaybackError,
    accountUsed,
    isPlaying,
    currentTime,
    duration,
    playbackRate,
    volume,
    isMuted,
    autoScroll,
    audioUrl,
    alignments,
    auditioningSegmentId,
    auditionTake,
    stopAudition,
    pause,
    togglePlayPause,
    seek,
    skipNext,
    skipPrev,
    cyclePlaybackRate,
    setVolume,
    toggleMute,
    toggleAutoScroll,
    startGeneration,
    resetAudio,
    clearGenerationError,
    audioRef,
  } = audio;

  const completedTakesCount = alignments.filter((a) => Boolean(a.audio_url)).length;
  const totalTakesCount = alignments.length;
  const firstPlayableTake = alignments.find((a) => Boolean(a.audio_url));

  const handleSeekFromEvent = useCallback(
    (e: React.MouseEvent<HTMLDivElement> | MouseEvent) => {
      if (!isGenerated || duration <= 0) return;
      const bar = progressBarRef.current;
      if (!bar) return;
      const rect = bar.getBoundingClientRect();
      const clickX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      const percentage = clickX / rect.width;
      const newTime = percentage * duration;
      seek(newTime);
    },
    [isGenerated, duration, seek],
  );

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isGenerated || duration <= 0) return;
    setIsScrubbing(true);
    handleSeekFromEvent(e);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      handleSeekFromEvent(moveEvent);
    };

    const handleMouseUp = () => {
      setIsScrubbing(false);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isGenerated || duration <= 0) return;
    const bar = progressBarRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const percentage = clickX / rect.width;
    setHoverPosition(clickX);
    setHoverTime(percentage * duration);
  };

  const handleMouseLeave = () => {
    setHoverTime(null);
  };

  const handleSendTelegram = async () => {
    if (!projectId || !chapterId || isSendingTelegram) return;
    setIsSendingTelegram(true);
    setTelegramStatus(null);

    try {
      const res = await sendChapterToTelegram(projectId, chapterId, !isGenerated);
      setTelegramStatus({
        type: "success",
        message: res.is_preview
          ? `Delivered Chapter ${res.chapter_number} preview to Telegram!`
          : `Delivered Chapter ${res.chapter_number} master audio to Telegram!`,
      });
      setTimeout(() => {
        setTelegramStatus((curr) => (curr?.type === "success" ? null : curr));
      }, 5000);
    } catch (err: unknown) {
      const axiosErr = err as {
        response?: { data?: { error?: { message?: string; code?: string }; message?: string } };
        message?: string;
      };
      const code = axiosErr.response?.data?.error?.code;
      const msg =
        axiosErr.response?.data?.error?.message ||
        axiosErr.response?.data?.message ||
        axiosErr.message ||
        "Failed to deliver audio to Telegram.";

      if (code === "TELEGRAM_NOT_CONFIGURED" || msg.toLowerCase().includes("not configured")) {
        setTelegramStatus({
          type: "unconfigured",
          message: "Telegram not configured. Open Profile Settings > Telegram to connect your bot.",
        });
      } else {
        setTelegramStatus({
          type: "error",
          message: msg,
        });
      }
    } finally {
      setIsSendingTelegram(false);
    }
  };

  const progressPercent =
    isGenerated && duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="w-full bg-white/95 dark:bg-[#0c0d10]/95 backdrop-blur-md border-t border-neutral-200/60 dark:border-white/[0.06] select-none z-30 transition-all relative">
      {/* Real HTML5 audio element */}
      <audio
        ref={audioRef}
        src={audioUrl || undefined}
        preload="auto"
        onTimeUpdate={() => {
          if (audioRef.current && isGenerated) {
            seek(audioRef.current.currentTime);
          }
        }}
        onEnded={() => {
          pause();
          seek(0);
        }}
        className="hidden"
      />

      {/* Floating Quota / Generation Error Notification Card */}
      {(generationError || audioPlaybackError) && (
        <div className="absolute -top-20 left-4 right-4 sm:left-12 sm:right-12 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200 pointer-events-auto">
          <div className="bg-neutral-900/95 dark:bg-neutral-100/95 backdrop-blur-md text-white dark:text-neutral-900 px-4 py-2.5 rounded-xl shadow-xl border border-neutral-700/50 dark:border-neutral-300/50 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <RiErrorWarningLine className="h-4 w-4 shrink-0 text-amber-400 dark:text-amber-600" />
              <span className="line-clamp-2 sm:line-clamp-1 font-medium select-text">
                {generationError || audioPlaybackError}
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Link
                to="/profile"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/10 dark:bg-neutral-900/10 hover:bg-white/20 dark:hover:bg-neutral-900/20 font-semibold transition-colors text-[11px]"
              >
                <RiSettings4Line className="h-3 w-3" />
                <span>Kaggle Settings</span>
              </Link>

              <button
                type="button"
                onClick={clearGenerationError}
                className="p-1 rounded-md hover:bg-white/10 dark:hover:bg-neutral-900/10 transition-colors cursor-pointer"
                title="Dismiss"
              >
                <RiCloseLine className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hairline Timeline Scrubber Bar */}
      <div
        ref={progressBarRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className={`relative ${
          isScrubbing ? "h-[5px]" : "h-[3px] hover:h-[5px]"
        } w-full transition-all ${
          isGenerated
            ? "cursor-pointer bg-neutral-200/80 dark:bg-neutral-800/80"
            : "cursor-default bg-neutral-100 dark:bg-neutral-900/60"
        }`}
        title={isGenerated ? "Click or drag to scrub audio" : "Audio not generated yet"}
      >
        {/* Progress fill */}
        {isGenerated && (
          <div
            className="absolute top-0 bottom-0 left-0 bg-neutral-900 dark:bg-neutral-100 transition-all"
            style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
          />
        )}

        {/* Hover Scrub Preview */}
        {isGenerated && hoverTime !== null && (
          <div
            className="absolute top-0 bottom-0 left-0 bg-neutral-400/20 dark:bg-white/15 pointer-events-none"
            style={{ width: `${hoverPosition}px` }}
          />
        )}

        {/* Hover Time Tooltip */}
        {isGenerated && hoverTime !== null && (
          <div
            className="absolute -top-7 -translate-x-1/2 bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 text-[10px] font-mono font-medium px-1.5 py-0.5 rounded shadow pointer-events-none z-40"
            style={{ left: `${hoverPosition}px` }}
          >
            {formatTime(hoverTime)}
          </div>
        )}
      </div>

      {/* ElevenLabs-Style Minimalist Studio Dock */}
      <div className="h-14 px-6 flex items-center justify-between gap-4">
        {/* Left Controls: Follow, Speed, Prev, Play/Generate, Next, Timecode */}
        <div className="flex items-center gap-3">
          {/* Auto-scroll toggle (quiet focus icon) */}
          <button
            type="button"
            onClick={toggleAutoScroll}
            className={`p-1.5 rounded-md transition-colors cursor-pointer ${
              autoScroll
                ? "text-neutral-900 dark:text-neutral-100 bg-neutral-100 dark:bg-neutral-800"
                : "text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300"
            }`}
            title={autoScroll ? "Follow line: ON" : "Follow line: OFF"}
          >
            <RiFocus3Line className="h-4 w-4" />
          </button>

          {/* Speed Selector (Clean Monospace Text) */}
          <button
            type="button"
            onClick={cyclePlaybackRate}
            className="px-1.5 py-0.5 rounded text-xs font-mono font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors cursor-pointer"
            title="Playback speed"
          >
            {playbackRate.toFixed(1)}x
          </button>

          {/* Previous Segment Button */}
          <button
            type="button"
            onClick={skipPrev}
            disabled={!isGenerated}
            className="p-1 rounded text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
            title="Previous segment"
          >
            <RiSkipBackLine className="h-4 w-4" />
          </button>

          {/* Central Play / Generate Button */}
          {isGenerating ? (
            <div className="flex items-center gap-1.5">
              <div
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 text-xs font-medium cursor-wait"
                title="Synthesizing audio on Kaggle GPU..."
              >
                <RiLoader4Line className="h-3.5 w-3.5 animate-spin" />
                <span>Generating...</span>
              </div>
              {firstPlayableTake && (
                <button
                  type="button"
                  onClick={() => {
                    if (auditioningSegmentId) {
                      stopAudition();
                    } else {
                      auditionTake(firstPlayableTake.segment_id, firstPlayableTake.audio_url);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-semibold cursor-pointer shadow-2xs transition-all"
                  title="Stream generated audio takes in real time while synthesis continues on Kaggle GPU"
                >
                  {auditioningSegmentId ? (
                    <>
                      <RiPauseFill className="h-3.5 w-3.5 fill-current animate-pulse" />
                      <span>Playing Live</span>
                    </>
                  ) : (
                    <>
                      <RiPlayFill className="h-3.5 w-3.5 fill-current" />
                      <span>Stream Live</span>
                    </>
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={() => resetAudio()}
                className="px-2 py-1 rounded-full text-[11px] font-medium text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                title="Cancel and reset generation"
              >
                Cancel
              </button>
            </div>
          ) : !isGenerated ? (
            <button
              type="button"
              onClick={startGeneration}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 text-xs font-semibold hover:opacity-90 active:scale-95 transition-all cursor-pointer shadow-2xs"
              title="Synthesize chapter audio on Kaggle GPU"
            >
              <RiSparklingLine className="h-3.5 w-3.5" />
              <span>Generate Audio</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={togglePlayPause}
              className="w-9 h-9 rounded-full bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-xs cursor-pointer"
              title={isPlaying ? "Pause (Spacebar)" : "Play Master Audio (Spacebar)"}
            >
              {isPlaying ? (
                <RiPauseFill className="h-4 w-4 fill-current" />
              ) : (
                <RiPlayFill className="h-4 w-4 fill-current translate-x-0.5" />
              )}
            </button>
          )}

          {/* Next Segment Button */}
          <button
            type="button"
            onClick={skipNext}
            disabled={!isGenerated}
            className="p-1 rounded text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
            title="Next segment"
          >
            <RiSkipForwardLine className="h-4 w-4" />
          </button>

          {/* Elapsed & Total Duration Readout */}
          <div className="text-xs font-mono text-neutral-600 dark:text-neutral-400 select-none ml-1">
            <span>{isGenerated ? formatTime(currentTime) : "0:00"}</span>
            <span className="text-neutral-400 mx-1">/</span>
            <span className="text-neutral-400">
              {isGenerated ? formatTime(duration) : "--:--"}
            </span>
          </div>
        </div>

        {/* Center: Quiet Status Note */}
        <div className="hidden md:flex items-center gap-2">
          {isGenerating ? (
            <span className="text-xs text-neutral-500 flex items-center gap-1.5 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              <span>
                Synthesizing on Kaggle GPU {accountUsed ? `(@${accountUsed})` : ""}
                {totalTakesCount > 0 ? ` · ${completedTakesCount}/${totalTakesCount} takes ready` : ""}
              </span>
            </span>
          ) : isGenerated ? (
            <span className="text-xs text-neutral-400 font-sans truncate max-w-xs">
              {chapterNumber ? `Chapter ${chapterNumber}` : ""}
              {chapterTitle ? ` · ${chapterTitle}` : ""}
              {" · Master Audio Ready"}
            </span>
          ) : (
            <span className="text-xs text-neutral-400 font-sans italic">
              Audio not synthesized yet
            </span>
          )}
        </div>

        {/* Right: Telegram Drop & ElevenLabs-Style Volume Control */}
        <div className="flex items-center gap-2.5 relative">
          {/* Telegram Status Bubble / Toast */}
          {telegramStatus && (
            <div className="absolute bottom-full mb-3 right-0 z-50 flex items-center gap-2 px-3 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white/95 dark:bg-[#121316]/95 backdrop-blur-md shadow-lg text-xs animate-in fade-in slide-in-from-bottom-1 whitespace-nowrap">
              {telegramStatus.type === "success" && (
                <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                  <RiCheckLine className="h-4 w-4" />
                  <span>{telegramStatus.message}</span>
                </span>
              )}
              {telegramStatus.type === "unconfigured" && (
                <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                  <RiErrorWarningLine className="h-4 w-4 shrink-0" />
                  <span>{telegramStatus.message}</span>
                  <Link
                    to="/profile"
                    className="inline-flex items-center gap-0.5 underline font-semibold hover:opacity-80 ml-1"
                  >
                    <span>Settings</span>
                    <RiExternalLinkLine className="h-3 w-3" />
                  </Link>
                </div>
              )}
              {telegramStatus.type === "error" && (
                <span className="flex items-center gap-1.5 text-red-600 dark:text-red-400 font-medium">
                  <RiErrorWarningLine className="h-4 w-4" />
                  <span>{telegramStatus.message}</span>
                </span>
              )}
              <button
                type="button"
                onClick={() => setTelegramStatus(null)}
                className="p-0.5 rounded text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors cursor-pointer ml-1"
                title="Dismiss"
              >
                <RiCloseLine className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Telegram Drop Button */}
          {projectId && chapterId && (
            <button
              type="button"
              onClick={handleSendTelegram}
              disabled={isSendingTelegram}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all cursor-pointer border shadow-2xs ${
                telegramStatus?.type === "success"
                  ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800"
                  : "bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-neutral-800 hover:border-sky-300 dark:hover:border-sky-700 hover:text-sky-600 dark:hover:text-sky-400"
              } disabled:opacity-50 disabled:cursor-not-allowed`}
              title="Deliver chapter audio directly to your Telegram"
            >
              {isSendingTelegram ? (
                <RiLoader4Line className="h-3.5 w-3.5 animate-spin text-sky-500" />
              ) : telegramStatus?.type === "success" ? (
                <RiCheckLine className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <RiTelegram2Line className="h-3.5 w-3.5 text-sky-500" />
              )}
              <span className="hidden sm:inline">
                {isSendingTelegram ? "Sending..." : "Telegram"}
              </span>
            </button>
          )}

          <div className="h-4 w-px bg-neutral-200 dark:bg-neutral-800" />

          {/* Mute Button */}
          <button
            type="button"
            onClick={toggleMute}
            className="p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors cursor-pointer"
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted || volume === 0 ? (
              <RiVolumeMuteLine className="h-4 w-4" />
            ) : (
              <RiVolumeUpLine className="h-4 w-4" />
            )}
          </button>

          {/* Volume Slider matching ElevenLabs screenshot: minus, track, plus */}
          <div className="hidden sm:flex items-center gap-1.5 w-24">
            <span className="text-[10px] text-neutral-400 select-none">−</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={isMuted ? 0 : volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="w-full h-1 bg-neutral-200 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-neutral-900 dark:accent-neutral-100"
              title={`Volume: ${Math.round((isMuted ? 0 : volume) * 100)}%`}
            />
            <span className="text-[10px] text-neutral-400 select-none">+</span>
          </div>
        </div>
      </div>
    </div>
  );
}
