import { useState, useEffect, useRef, useMemo } from "react";
import useSWR from "swr";
import {
  RiCloseLine,
  RiSearchLine,
  RiPlayFill,
  RiPauseFill,
  RiCheckLine,
  RiDeleteBinLine,
  RiAddLine,
  RiVolumeUpLine,
  RiGlobalLine,
  RiFolderLine,
  RiLoader4Line,
} from "@remixicon/react";
import type { ScriptSegment, SFXItem } from "@novelova/shared-types";
import { getSFXItems } from "@/services/sfx";
import { batchSetAtmosphere } from "@/services/chapters";

interface SegmentAtmospherePopoverProps {
  projectId: string;
  currentSegment: ScriptSegment;
  allSegments: ScriptSegment[];
  isOpen: boolean;
  onClose: () => void;
  onApplied: () => void;
  onCreateNewSFX?: () => void;
}

export function SegmentAtmospherePopover({
  projectId,
  currentSegment,
  allSegments,
  isOpen,
  onClose,
  onApplied,
  onCreateNewSFX,
}: SegmentAtmospherePopoverProps) {
  const [selectedSFXId, setSelectedSFXId] = useState<string>("");
  const [volume, setVolume] = useState<number>(0.15);
  const [searchQuery, setSearchQuery] = useState("");
  const [playingSFXId, setPlayingSFXId] = useState<string | null>(null);
  const [rangeMode, setRangeMode] = useState<"single" | "range">("single");
  const [endSegmentId, setEndSegmentId] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Fetch Atmosphere SFX items
  const { data: sfxData, isLoading } = useSWR(
    isOpen ? `/api/v1/sfx?project_id=${projectId}&category=atmosphere` : null,
    () => getSFXItems(projectId, "atmosphere"),
    { revalidateOnFocus: false },
  );

  const sfxList: SFXItem[] = Array.isArray(sfxData) ? sfxData : [];

  // Downstream segments starting from current segment
  const downstreamSegments = useMemo(() => {
    const currentIndex = allSegments.findIndex((s) => s.id === currentSegment.id);
    if (currentIndex === -1) return [];
    return allSegments.slice(currentIndex);
  }, [allSegments, currentSegment.id]);

  // Initialize or reset state when popover opens
  useEffect(() => {
    if (isOpen) {
      if (currentSegment.atmosphere_id) {
        setSelectedSFXId(currentSegment.atmosphere_id);
        setVolume(currentSegment.atmosphere_volume ?? 0.15);

        // Detect if adjacent segments share this atmosphere to pre-select range
        const currentIndex = allSegments.findIndex((s) => s.id === currentSegment.id);
        let lastMatchingIndex = currentIndex;
        for (let i = currentIndex + 1; i < allSegments.length; i++) {
          if (allSegments[i].atmosphere_id === currentSegment.atmosphere_id) {
            lastMatchingIndex = i;
          } else {
            break;
          }
        }
        if (lastMatchingIndex > currentIndex) {
          setRangeMode("range");
          setEndSegmentId(allSegments[lastMatchingIndex].id);
        } else {
          setRangeMode("single");
          setEndSegmentId(
            downstreamSegments.length > 1 ? downstreamSegments[1].id : currentSegment.id,
          );
        }
      } else {
        setSelectedSFXId(sfxList[0]?.id || "");
        setVolume(sfxList[0]?.default_volume ?? 0.15);
        setRangeMode("single");
        setEndSegmentId(
          downstreamSegments.length > 1 ? downstreamSegments[1].id : currentSegment.id,
        );
      }
      setSearchQuery("");
      stopAudio();
    } else {
      stopAudio();
    }
  }, [isOpen, currentSegment, allSegments, downstreamSegments, sfxList.length]);

  // Select first SFX if none selected yet
  useEffect(() => {
    if (isOpen && !selectedSFXId && sfxList.length > 0) {
      setSelectedSFXId(sfxList[0].id);
      setVolume(sfxList[0].default_volume ?? 0.15);
    }
  }, [isOpen, selectedSFXId, sfxList]);

  // Audio preview playback
  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setPlayingSFXId(null);
  };

  const togglePlayPreview = (sfx: SFXItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (playingSFXId === sfx.id) {
      stopAudio();
      return;
    }

    stopAudio();
    const audio = new Audio(sfx.audio_url);
    audio.loop = true;
    audio.volume = Math.max(0, Math.min(1, volume));
    audioRef.current = audio;
    audio.play().catch(() => setPlayingSFXId(null));
    setPlayingSFXId(sfx.id);
  };

  // Dynamically update audio volume if previewing while adjusting slider
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = Math.max(0, Math.min(1, volume));
    }
  }, [volume]);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        isOpen &&
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  const filteredSFX = sfxList.filter((item) =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase().trim()),
  );

  const selectedSFX = sfxList.find((s) => s.id === selectedSFXId);

  // Compute targeted segment IDs
  const targetSegmentIds = useMemo(() => {
    if (rangeMode === "single") {
      return [currentSegment.id];
    }
    const startIndex = allSegments.findIndex((s) => s.id === currentSegment.id);
    const endIndex = allSegments.findIndex((s) => s.id === endSegmentId);
    if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
      return [currentSegment.id];
    }
    return allSegments.slice(startIndex, endIndex + 1).map((s) => s.id);
  }, [rangeMode, currentSegment.id, endSegmentId, allSegments]);

  const handleApply = async () => {
    if (!selectedSFX) return;
    setIsSubmitting(true);
    try {
      await batchSetAtmosphere(projectId, {
        segment_ids: targetSegmentIds,
        atmosphere_id: selectedSFX.id,
        atmosphere_name: selectedSFX.name,
        atmosphere_volume: volume,
      });
      stopAudio();
      onApplied();
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClear = async () => {
    setIsSubmitting(true);
    try {
      await batchSetAtmosphere(projectId, {
        segment_ids: targetSegmentIds,
        atmosphere_id: null,
      });
      stopAudio();
      onApplied();
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in">
      <div
        ref={popoverRef}
        className="w-[420px] max-w-[94vw] bg-white dark:bg-[#15161a] border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-2xl p-5 flex flex-col gap-4 animate-in zoom-in-95 select-none"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-neutral-100 dark:border-neutral-800/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 flex items-center justify-center font-bold text-base">
              🌊
            </div>
            <div>
              <h4 className="text-xs font-bold text-neutral-900 dark:text-neutral-100">
                Atmosphere & Background Noise
              </h4>
              <p className="text-[10px] text-neutral-500">
                Layer continuous ambient sounds to specific lines or scenes
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <RiCloseLine className="w-4 h-4" />
          </button>
        </div>

        {/* Scope Selector */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
            Target Lines & Scope
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setRangeMode("single")}
              className={`p-2.5 rounded-xl text-left border text-xs transition-all flex flex-col gap-0.5 cursor-pointer ${
                rangeMode === "single"
                  ? "border-cyan-500/50 bg-cyan-50/50 dark:bg-cyan-950/20 text-cyan-950 dark:text-cyan-200 font-semibold"
                  : "border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700 text-neutral-600 dark:text-neutral-400"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-[11px]">This Line Only</span>
                {rangeMode === "single" && (
                  <RiCheckLine className="w-3.5 h-3.5 text-cyan-500" />
                )}
              </div>
              <span className="text-[10px] opacity-75 font-normal leading-tight">
                Line #{currentSegment.order_index + 1}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setRangeMode("range")}
              className={`p-2.5 rounded-xl text-left border text-xs transition-all flex flex-col gap-0.5 cursor-pointer ${
                rangeMode === "range"
                  ? "border-cyan-500/50 bg-cyan-50/50 dark:bg-cyan-950/20 text-cyan-950 dark:text-cyan-200 font-semibold"
                  : "border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700 text-neutral-600 dark:text-neutral-400"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-[11px]">Scene Line Range</span>
                {rangeMode === "range" && (
                  <RiCheckLine className="w-3.5 h-3.5 text-cyan-500" />
                )}
              </div>
              <span className="text-[10px] opacity-75 font-normal leading-tight">
                From Line #{currentSegment.order_index + 1} to end of scene
              </span>
            </button>
          </div>

          {rangeMode === "range" && downstreamSegments.length > 1 && (
            <div className="flex items-center gap-2 mt-1 px-1">
              <span className="text-[11px] text-neutral-500 font-medium shrink-0">
                Through:
              </span>
              <select
                value={endSegmentId}
                onChange={(e) => setEndSegmentId(e.target.value)}
                className="w-full text-xs py-1 px-2 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 cursor-pointer"
              >
                {downstreamSegments.map((seg, idx) => (
                  <option key={seg.id} value={seg.id}>
                    Line #{seg.order_index + 1}: {seg.text.slice(0, 42)}... ({idx + 1} lines total)
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Ambient SFX Library Chooser */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
              Atmosphere Bed Sound
            </label>
            {onCreateNewSFX && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onCreateNewSFX();
                }}
                className="text-[10px] font-semibold text-primary hover:underline flex items-center gap-0.5 cursor-pointer"
              >
                <RiAddLine className="w-3 h-3" />
                <span>Upload Ambience</span>
              </button>
            )}
          </div>

          {/* Search */}
          <div className="relative">
            <RiSearchLine className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search ambience (e.g. Waves, Rain, Tavern, Wind)..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/50 focus:outline-none focus:ring-1 focus:ring-cyan-500 text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400"
            />
          </div>

          {/* Sound List */}
          <div className="max-h-[140px] overflow-y-auto space-y-1 pr-1 border border-neutral-100 dark:border-neutral-800/80 rounded-xl p-1 bg-neutral-50/30 dark:bg-neutral-900/20">
            {isLoading ? (
              <div className="py-4 text-center text-[11px] text-neutral-400">
                Loading atmosphere library...
              </div>
            ) : filteredSFX.length === 0 ? (
              <div className="py-4 text-center text-[11px] text-neutral-400 flex flex-col items-center gap-1">
                <span>No atmosphere sounds found</span>
                {onCreateNewSFX && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onCreateNewSFX();
                    }}
                    className="text-primary hover:underline font-semibold"
                  >
                    Upload ambience sound
                  </button>
                )}
              </div>
            ) : (
              filteredSFX.map((sfx) => {
                const isSelected = selectedSFXId === sfx.id;
                const isPlaying = playingSFXId === sfx.id;
                return (
                  <div
                    key={sfx.id}
                    onClick={() => {
                      setSelectedSFXId(sfx.id);
                      if (!currentSegment.atmosphere_id) {
                        setVolume(sfx.default_volume ?? 0.15);
                      }
                    }}
                    className={`w-full px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-cyan-500/10 dark:bg-cyan-500/20 text-neutral-900 dark:text-neutral-100 font-semibold"
                        : "hover:bg-neutral-100/70 dark:hover:bg-neutral-800/50 text-neutral-700 dark:text-neutral-300"
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate flex-1 min-w-0">
                      <button
                        type="button"
                        onClick={(e) => togglePlayPreview(sfx, e)}
                        className={`w-5 h-5 rounded-full flex items-center justify-center transition-transform hover:scale-110 active:scale-95 shrink-0 ${
                          isPlaying
                            ? "bg-cyan-500 text-white"
                            : "bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200"
                        }`}
                        title={isPlaying ? "Stop audition" : "Audition ambience loop"}
                      >
                        {isPlaying ? (
                          <RiPauseFill className="w-3 h-3 fill-current" />
                        ) : (
                          <RiPlayFill className="w-3 h-3 fill-current ml-0.5" />
                        )}
                      </button>

                      <span className="truncate text-[11px]">{sfx.name}</span>

                      {sfx.is_global ? (
                        <span className="px-1 py-0.2 rounded text-[9px] bg-neutral-200/60 dark:bg-neutral-700/60 text-neutral-600 dark:text-neutral-300 flex items-center gap-0.5 shrink-0">
                          <RiGlobalLine className="w-2.5 h-2.5" />
                          Global
                        </span>
                      ) : (
                        <span className="px-1 py-0.2 rounded text-[9px] bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 flex items-center gap-0.5 shrink-0">
                          <RiFolderLine className="w-2.5 h-2.5" />
                          Project
                        </span>
                      )}
                    </div>

                    {isSelected && (
                      <RiCheckLine className="w-4 h-4 text-cyan-500 shrink-0 ml-1.5" />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Volume Slider */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-semibold text-neutral-700 dark:text-neutral-300 flex items-center gap-1">
              <RiVolumeUpLine className="w-3.5 h-3.5 text-neutral-400" />
              Ambience Volume (Duck behind voice)
            </span>
            <span className="font-mono text-cyan-600 dark:text-cyan-400 font-semibold">
              {Math.round(volume * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.02}
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="w-full accent-cyan-500 h-1.5 bg-neutral-200 dark:bg-neutral-700 rounded-lg cursor-pointer"
          />
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-neutral-100 dark:border-neutral-800/80">
          {currentSegment.atmosphere_id ? (
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleClear}
              className="px-2.5 py-1.5 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
            >
              <RiDeleteBinLine className="w-3.5 h-3.5" />
              <span>Clear Ambience</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-xs font-semibold transition-colors cursor-pointer"
            >
              Cancel
            </button>
          )}

          <button
            type="button"
            disabled={!selectedSFXId || isSubmitting}
            onClick={handleApply}
            className="px-4 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-700 active:scale-95 text-white text-xs font-bold shadow-sm transition-all disabled:opacity-40 cursor-pointer flex items-center gap-1.5"
          >
            {isSubmitting ? (
              <RiLoader4Line className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RiCheckLine className="w-3.5 h-3.5 stroke-[2.5]" />
            )}
            <span>
              {isSubmitting
                ? "Applying..."
                : `Apply to ${targetSegmentIds.length} line${targetSegmentIds.length > 1 ? "s" : ""}`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
