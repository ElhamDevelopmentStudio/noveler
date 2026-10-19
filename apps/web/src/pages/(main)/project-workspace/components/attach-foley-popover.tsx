import { useState, useEffect, useRef } from "react";
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
} from "@remixicon/react";
import type { FoleyCue, SFXItem } from "@novelova/shared-types";
import { getSFXItems } from "@/services/sfx";

interface AttachFoleyPopoverProps {
  projectId: string;
  targetPhrase: string;
  initialCue?: FoleyCue | null;
  position: { top: number; left: number } | null;
  isOpen: boolean;
  onClose: () => void;
  onAttach: (cue: FoleyCue) => void;
  onRemove?: () => void;
  onCreateNewSFX?: () => void;
}

export function AttachFoleyPopover({
  projectId,
  targetPhrase,
  initialCue,
  position,
  isOpen,
  onClose,
  onAttach,
  onRemove,
  onCreateNewSFX,
}: AttachFoleyPopoverProps) {
  const [selectedSFXId, setSelectedSFXId] = useState<string>("");
  const [action, setAction] = useState<"replace" | "after">("replace");
  const [volume, setVolume] = useState<number>(1.0);
  const [searchQuery, setSearchQuery] = useState("");
  const [playingSFXId, setPlayingSFXId] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Fetch Foley SFX items for this project + global
  const { data: sfxData, isLoading } = useSWR(
    isOpen ? `/api/v1/sfx?project_id=${projectId}&category=foley` : null,
    () => getSFXItems(projectId, "foley"),
    { revalidateOnFocus: false },
  );

  const sfxList: SFXItem[] = Array.isArray(sfxData) ? sfxData : [];

  // Reset or initialize state when opening
  useEffect(() => {
    if (isOpen) {
      if (initialCue) {
        setSelectedSFXId(initialCue.sfx_id);
        setAction(initialCue.action);
        setVolume(initialCue.volume ?? 1.0);
      } else {
        setSelectedSFXId(sfxList[0]?.id || "");
        setAction("replace");
        setVolume(sfxList[0]?.default_volume ?? 1.0);
      }
      setSearchQuery("");
      stopAudio();
    } else {
      stopAudio();
    }
  }, [isOpen, initialCue, sfxList.length]);

  // If initial cue wasn't set yet and list loads, select first item if nothing selected
  useEffect(() => {
    if (isOpen && !selectedSFXId && sfxList.length > 0) {
      setSelectedSFXId(sfxList[0].id);
      setVolume(sfxList[0].default_volume ?? 1.0);
    }
  }, [isOpen, selectedSFXId, sfxList]);

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
    audio.volume = Math.max(0, Math.min(1, volume));
    audio.onended = () => {
      setPlayingSFXId(null);
    };
    audio.onerror = () => {
      setPlayingSFXId(null);
    };
    audioRef.current = audio;
    audio.play().catch(() => setPlayingSFXId(null));
    setPlayingSFXId(sfx.id);
  };

  const filteredSFX = sfxList.filter((item) =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase().trim()),
  );

  const selectedSFX = sfxList.find((s) => s.id === selectedSFXId);

  const handleSelectSFX = (sfx: SFXItem) => {
    setSelectedSFXId(sfx.id);
    if (!initialCue) {
      setVolume(sfx.default_volume ?? 1.0);
    }
  };

  const handleAttach = () => {
    if (!selectedSFX) return;
    const cue: FoleyCue = {
      id: initialCue?.id || `cue-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      sfx_id: selectedSFX.id,
      sfx_name: selectedSFX.name,
      audio_url: selectedSFX.audio_url,
      target_text: targetPhrase.trim(),
      action,
      volume,
    };
    onAttach(cue);
    onClose();
  };

  if (!isOpen) return null;

  // Compute position (floating centered above or below selection)
  const popoverStyle: React.CSSProperties = position
    ? {
        position: "fixed",
        top: `${Math.min(window.innerHeight - 440, Math.max(20, position.top + 28))}px`,
        left: `${Math.min(window.innerWidth - 380, Math.max(20, position.left - 180))}px`,
        zIndex: 60,
      }
    : {
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 60,
      };

  return (
    <div
      ref={popoverRef}
      style={popoverStyle}
      className="w-[360px] bg-white dark:bg-[#15161a] border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-2xl p-4 flex flex-col gap-3.5 animate-in fade-in zoom-in-95 select-none"
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-neutral-100 dark:border-neutral-800/80">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold text-sm">
            💥
          </div>
          <div>
            <h4 className="text-xs font-bold text-neutral-900 dark:text-neutral-100">
              Attach Foley SFX
            </h4>
            <p className="text-[10px] text-neutral-500 truncate max-w-[200px]">
              Word: <span className="font-semibold text-neutral-800 dark:text-neutral-200 font-mono">"{targetPhrase}"</span>
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

      {/* Action Mode Selection */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
          Playback Action
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setAction("replace")}
            className={`p-2 rounded-xl text-left border text-xs transition-all flex flex-col gap-0.5 cursor-pointer ${
              action === "replace"
                ? "border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20 text-amber-950 dark:text-amber-200 font-semibold"
                : "border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700 text-neutral-600 dark:text-neutral-400"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-[11px]">Replace Word</span>
              {action === "replace" && <RiCheckLine className="w-3.5 h-3.5 text-amber-500" />}
            </div>
            <span className="text-[10px] opacity-75 font-normal leading-tight">
              TTS skips reading word, plays SFX instead
            </span>
          </button>

          <button
            type="button"
            onClick={() => setAction("after")}
            className={`p-2 rounded-xl text-left border text-xs transition-all flex flex-col gap-0.5 cursor-pointer ${
              action === "after"
                ? "border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20 text-amber-950 dark:text-amber-200 font-semibold"
                : "border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700 text-neutral-600 dark:text-neutral-400"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-[11px]">Play After</span>
              {action === "after" && <RiCheckLine className="w-3.5 h-3.5 text-amber-500" />}
            </div>
            <span className="text-[10px] opacity-75 font-normal leading-tight">
              Speaks word, then plays SFX cue immediately
            </span>
          </button>
        </div>
      </div>

      {/* SFX Sound Chooser */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
            Foley Sound Sample
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
              <span>Upload New</span>
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
            placeholder="Search sounds (e.g. Explosion, Door, Clank)..."
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/50 focus:outline-none focus:ring-1 focus:ring-primary text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400"
          />
        </div>

        {/* Sound List */}
        <div className="max-h-[140px] overflow-y-auto space-y-1 pr-1 border border-neutral-100 dark:border-neutral-800/80 rounded-xl p-1 bg-neutral-50/30 dark:bg-neutral-900/20">
          {isLoading ? (
            <div className="py-4 text-center text-[11px] text-neutral-400">
              Loading Foley library...
            </div>
          ) : filteredSFX.length === 0 ? (
            <div className="py-4 text-center text-[11px] text-neutral-400 flex flex-col items-center gap-1">
              <span>No Foley sounds found</span>
              {onCreateNewSFX && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onCreateNewSFX();
                  }}
                  className="text-primary hover:underline font-semibold"
                >
                  Upload a sound effect
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
                  onClick={() => handleSelectSFX(sfx)}
                  className={`w-full px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-amber-500/10 dark:bg-amber-500/20 text-neutral-900 dark:text-neutral-100 font-semibold"
                      : "hover:bg-neutral-100/70 dark:hover:bg-neutral-800/50 text-neutral-700 dark:text-neutral-300"
                  }`}
                >
                  <div className="flex items-center gap-2 truncate flex-1 min-w-0">
                    <button
                      type="button"
                      onClick={(e) => togglePlayPreview(sfx, e)}
                      className={`w-5 h-5 rounded-full flex items-center justify-center transition-transform hover:scale-110 active:scale-95 shrink-0 ${
                        isPlaying
                          ? "bg-amber-500 text-white"
                          : "bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200"
                      }`}
                      title={isPlaying ? "Stop audition" : "Audition sound"}
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
                      <span className="px-1 py-0.2 rounded text-[9px] bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center gap-0.5 shrink-0">
                        <RiFolderLine className="w-2.5 h-2.5" />
                        Project
                      </span>
                    )}
                  </div>

                  {isSelected && (
                    <RiCheckLine className="w-4 h-4 text-amber-500 shrink-0 ml-1.5" />
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
            Volume Level
          </span>
          <span className="font-mono text-neutral-600 dark:text-neutral-400 font-semibold">
            {Math.round(volume * 100)}%
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          onChange={(e) => setVolume(parseFloat(e.target.value))}
          className="w-full accent-amber-500 h-1.5 bg-neutral-200 dark:bg-neutral-700 rounded-lg cursor-pointer"
        />
      </div>

      {/* Footer Controls */}
      <div className="flex items-center justify-between pt-2 border-t border-neutral-100 dark:border-neutral-800/80">
        {initialCue && onRemove ? (
          <button
            type="button"
            onClick={() => {
              onRemove();
              onClose();
            }}
            className="px-2.5 py-1.5 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
          >
            <RiDeleteBinLine className="w-3.5 h-3.5" />
            <span>Remove Cue</span>
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
          onClick={handleAttach}
          disabled={!selectedSFXId}
          className="px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 active:scale-95 text-white text-xs font-bold shadow-sm transition-all disabled:opacity-40 cursor-pointer flex items-center gap-1.5"
        >
          <RiCheckLine className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>{initialCue ? "Update Cue" : "Attach SFX"}</span>
        </button>
      </div>
    </div>
  );
}
