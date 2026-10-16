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
} from "@remixicon/react";
import type { UseChapterAudioReturn } from "./use-chapter-audio";

interface ChapterAudioPlayerProps {
  audio: UseChapterAudioReturn;
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
  chapterTitle,
  chapterNumber,
}: ChapterAudioPlayerProps) {
  const progressBarRef = useRef<HTMLDivElement>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPosition, setHoverPosition] = useState<number>(0);

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
              <span>Synthesizing on Kaggle GPU {accountUsed ? `(@${accountUsed})` : ""}</span>
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

        {/* Right: Clean ElevenLabs-Style Volume Control */}
        <div className="flex items-center gap-2">
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
