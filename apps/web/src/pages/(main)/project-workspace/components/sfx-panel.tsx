import { useState, useMemo, useRef, useEffect } from "react";
import useSWR from "swr";
import {
  RiAddLine,
  RiSearchLine,
  RiPlayFill,
  RiPauseFill,
  RiEditLine,
  RiDeleteBinLine,
  RiGlobalLine,
  RiFolderLine,
  RiSparkling2Line,
  RiCloseLine,
  RiLoader4Line,
  RiVolumeUpLine,
  RiRobotLine,
  RiRadio2Line,
  RiSparklingLine,
  RiPhoneLine,
  RiMegaphoneLine,
  RiSoundModuleLine,
} from "@remixicon/react";
import type { SFXItem } from "@novelova/shared-types";
import { getSFXItems, deleteSFXItem } from "@/services/sfx";
import {
  VOICE_FILTER_PRESETS,
  playAuditionVoiceFilter,
} from "@/lib/voice-filters-data";
import { ScrollFade } from "@/components/ui/scroll-fade";
import { CreateSFXDialog } from "./create-sfx-dialog";
import { EditSFXDialog } from "./edit-sfx-dialog";
import { cn } from "@/lib/utils";

export interface SFXPanelProps {
  projectId: string;
  className?: string;
}

type SFXPanelTab = "foley" | "atmosphere" | "filters";

const FILTER_ICONS: Record<string, typeof RiRobotLine> = {
  robotic: RiRobotLine,
  radio: RiRadio2Line,
  reverb: RiSparklingLine,
  telepathic: RiSparklingLine,
  telephone: RiPhoneLine,
  megaphone: RiMegaphoneLine,
  whisper: RiSoundModuleLine,
};

export function SFXPanel({ projectId, className }: SFXPanelProps) {
  const [activeTab, setActiveTab] = useState<SFXPanelTab>("foley");
  const [search, setSearch] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<SFXItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Audio preview state for Foley & Atmosphere
  const [playingSFXId, setPlayingSFXId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Voice filter audition state
  const [playingFilterId, setPlayingFilterId] = useState<string | null>(null);
  const [filterTestText, setFilterTestText] = useState(
    "System Notification: Title acquired. Spatial storage expanded.",
  );
  const stopFilterRef = useRef<(() => void) | null>(null);

  const swrKey = `/sfx?project_id=${projectId}`;
  const { data: sfxList = [], isLoading, mutate } = useSWR<SFXItem[]>(
    swrKey,
    () => getSFXItems(projectId),
    { revalidateOnFocus: false },
  );

  // Clean up audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) audioRef.current.pause();
      if (stopFilterRef.current) stopFilterRef.current();
    };
  }, []);

  const foleyItems = useMemo(
    () => sfxList.filter((item) => item.category === "foley"),
    [sfxList],
  );

  const atmosphereItems = useMemo(
    () => sfxList.filter((item) => item.category === "atmosphere"),
    [sfxList],
  );

  const currentCategoryItems = activeTab === "atmosphere" ? atmosphereItems : foleyItems;

  const filteredItems = useMemo(() => {
    if (!search.trim()) return currentCategoryItems;
    const q = search.toLowerCase();
    return currentCategoryItems.filter((i) => i.name.toLowerCase().includes(q));
  }, [currentCategoryItems, search]);

  const togglePlaySFX = (item: SFXItem) => {
    if (stopFilterRef.current) {
      stopFilterRef.current();
      setPlayingFilterId(null);
    }

    if (playingSFXId === item.id) {
      if (audioRef.current) audioRef.current.pause();
      setPlayingSFXId(null);
    } else {
      setPlayingSFXId(item.id);
      if (audioRef.current) {
        audioRef.current.src = item.audio_url;
        audioRef.current.volume = item.default_volume;
        audioRef.current.play().catch(() => setPlayingSFXId(null));
      }
    }
  };

  const togglePlayFilter = async (filterId: string, samplePrompt: string) => {
    if (audioRef.current) {
      audioRef.current.pause();
      setPlayingSFXId(null);
    }

    if (playingFilterId === filterId) {
      if (stopFilterRef.current) stopFilterRef.current();
      setPlayingFilterId(null);
    } else {
      if (stopFilterRef.current) stopFilterRef.current();
      setPlayingFilterId(filterId);
      const textToPlay = filterTestText.trim() || samplePrompt;
      const stop = await playAuditionVoiceFilter(filterId, textToPlay, () => {
        setPlayingFilterId(null);
      });
      stopFilterRef.current = stop;
    }
  };

  const handleDelete = async (item: SFXItem) => {
    if (!window.confirm(`Are you sure you want to delete sound "${item.name}"?`)) {
      return;
    }

    setDeletingId(item.id);
    if (playingSFXId === item.id && audioRef.current) {
      audioRef.current.pause();
      setPlayingSFXId(null);
    }

    try {
      await deleteSFXItem(item.id);
      await mutate();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to delete sound effect");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div
      className={cn(
        "w-72 sm:w-80 shrink-0 h-full border-r border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#0c0d10] flex flex-col select-none transition-colors",
        className,
      )}
    >
      {/* Hidden audio player */}
      <audio
        ref={audioRef}
        onEnded={() => setPlayingSFXId(null)}
        onError={() => setPlayingSFXId(null)}
        className="hidden"
      />

      {/* Top Header */}
      <div className="p-3.5 border-b border-neutral-200/80 dark:border-neutral-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 flex items-center justify-center shadow-2xs">
            <RiSparkling2Line className="h-3.5 w-3.5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                Sound Effects
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
                {sfxList.length}
              </span>
            </div>
          </div>
        </div>

        {activeTab !== "filters" && (
          <button
            type="button"
            onClick={() => setCreateDialogOpen(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-100 text-white dark:text-neutral-950 text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
            title="Add sound effect"
          >
            <RiAddLine className="h-3.5 w-3.5" />
            <span>New SFX</span>
          </button>
        )}
      </div>

      {/* Sub Tabs */}
      <div className="flex items-center border-b border-neutral-200/80 dark:border-neutral-800 shrink-0 px-2 pt-1 gap-1">
        <button
          type="button"
          onClick={() => setActiveTab("foley")}
          className={cn(
            "flex-1 py-1.5 text-xs font-semibold flex items-center justify-center gap-1 border-b-2 -mb-px transition-colors cursor-pointer",
            activeTab === "foley"
              ? "border-neutral-900 dark:border-white text-neutral-900 dark:text-white"
              : "border-transparent text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300",
          )}
        >
          <span>💥 Foley</span>
          <span className="text-[10px] font-mono text-neutral-400">
            ({foleyItems.length})
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("atmosphere")}
          className={cn(
            "flex-1 py-1.5 text-xs font-semibold flex items-center justify-center gap-1 border-b-2 -mb-px transition-colors cursor-pointer",
            activeTab === "atmosphere"
              ? "border-neutral-900 dark:border-white text-neutral-900 dark:text-white"
              : "border-transparent text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300",
          )}
        >
          <span>🌊 Atmosphere</span>
          <span className="text-[10px] font-mono text-neutral-400">
            ({atmosphereItems.length})
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("filters")}
          className={cn(
            "flex-1 py-1.5 text-xs font-semibold flex items-center justify-center gap-1 border-b-2 -mb-px transition-colors cursor-pointer",
            activeTab === "filters"
              ? "border-neutral-900 dark:border-white text-neutral-900 dark:text-white"
              : "border-transparent text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300",
          )}
        >
          <span>🎛️ Filters</span>
        </button>
      </div>

      {/* Main Content Area */}
      {activeTab === "filters" ? (
        /* Voice Filters Presets Tab */
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Quick Audition Test Box */}
          <div className="p-3 border-b border-neutral-200/60 dark:border-neutral-800/80 bg-neutral-50/50 dark:bg-neutral-900/30 shrink-0 space-y-1.5">
            <label className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-400 block">
              Audition Test Phrase
            </label>
            <div className="relative">
              <input
                type="text"
                value={filterTestText}
                onChange={(e) => setFilterTestText(e.target.value)}
                placeholder="Type phrase to test filter..."
                className="w-full px-2.5 py-1.5 rounded-xl text-xs bg-white dark:bg-[#121316] border border-neutral-200/80 dark:border-neutral-800 text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-white transition-colors"
              />
            </div>
            <p className="text-[10px] text-neutral-400 dark:text-neutral-500">
              Click play on any filter below to hear this phrase transformed live.
            </p>
          </div>

          {/* Filter Cards List */}
          <ScrollFade className="flex-1 overflow-y-auto p-2 space-y-2">
            {VOICE_FILTER_PRESETS.map((preset) => {
              const Icon = FILTER_ICONS[preset.id] || RiRobotLine;
              const isPlaying = playingFilterId === preset.id;

              return (
                <div
                  key={preset.id}
                  className={cn(
                    "p-3 rounded-xl border transition-all duration-150 flex flex-col gap-2",
                    isPlaying
                      ? "bg-neutral-100/90 dark:bg-neutral-800/90 border-neutral-300 dark:border-neutral-700 shadow-2xs"
                      : "bg-white dark:bg-[#0c0d10] hover:bg-neutral-50 dark:hover:bg-neutral-900/60 border-neutral-200/60 dark:border-neutral-800/80",
                  )}
                >
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 flex items-center justify-center shrink-0 shadow-2xs">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                            {preset.name}
                          </span>
                        </div>
                        <span className="text-[10px] text-neutral-400 font-medium block">
                          {preset.category}
                        </span>
                      </div>
                    </div>

                    {/* Play Audition Button */}
                    <button
                      type="button"
                      onClick={() => togglePlayFilter(preset.id, preset.samplePrompt)}
                      className={cn(
                        "w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-opacity cursor-pointer shadow-2xs",
                        isPlaying
                          ? "bg-black text-white dark:bg-white dark:text-black animate-pulse"
                          : "bg-neutral-900 text-white dark:bg-white dark:text-neutral-950 hover:opacity-90",
                      )}
                      title={isPlaying ? "Stop test" : "Audition filter"}
                    >
                      {isPlaying ? (
                        <RiPauseFill className="h-4 w-4" />
                      ) : (
                        <RiPlayFill className="h-4 w-4 translate-x-0.5" />
                      )}
                    </button>
                  </div>

                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-normal">
                    {preset.description}
                  </p>
                </div>
              );
            })}
          </ScrollFade>
        </div>
      ) : (
        /* Foley / Atmosphere Sounds Tab */
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Search Bar */}
          <div className="p-2.5 border-b border-neutral-200/60 dark:border-neutral-800/80 shrink-0">
            <div className="relative">
              <RiSearchLine className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={
                  activeTab === "atmosphere"
                    ? "Search atmosphere sounds..."
                    : "Search foley cues..."
                }
                className="w-full pl-8 pr-7 py-1.5 rounded-xl text-xs bg-neutral-50 dark:bg-neutral-900/60 border border-neutral-200/80 dark:border-neutral-800 text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-white transition-colors"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 cursor-pointer"
                >
                  <RiCloseLine className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          {/* Sound Items List */}
          <ScrollFade className="flex-1 overflow-y-auto min-h-0 p-2 space-y-1">
            {isLoading && sfxList.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 text-center">
                <span className="shimmer-text text-xs font-medium text-neutral-400 dark:text-neutral-500">
                  Loading sounds...
                </span>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 text-center space-y-2">
                <div className="w-10 h-10 rounded-2xl bg-neutral-100 dark:bg-neutral-800 text-neutral-400 flex items-center justify-center mx-auto text-base">
                  {activeTab === "atmosphere" ? "🌊" : "💥"}
                </div>
                <p className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                  {search
                    ? "No sounds match your search"
                    : activeTab === "atmosphere"
                      ? "No atmosphere tracks yet"
                      : "No foley cues yet"}
                </p>
                <p className="text-[11px] text-neutral-400 dark:text-neutral-500 max-w-xs">
                  {search
                    ? "Try a different search query."
                    : activeTab === "atmosphere"
                      ? "Upload environmental beds like ocean waves, rain, or tavern chatter for scene ambiance."
                      : "Upload action sounds for words like BOOOOM, clank, footsteps, or door slams."}
                </p>
                {!search && (
                  <button
                    type="button"
                    onClick={() => setCreateDialogOpen(true)}
                    className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-900 dark:text-white text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <RiAddLine className="h-3.5 w-3.5" />
                    <span>Upload Sound</span>
                  </button>
                )}
              </div>
            ) : (
              filteredItems.map((item) => {
                const isPlaying = playingSFXId === item.id;
                const isDeleting = deletingId === item.id;

                return (
                  <div
                    key={item.id}
                    className={cn(
                      "group relative p-2.5 rounded-xl border transition-all duration-150 flex items-center gap-3",
                      isPlaying
                        ? "bg-neutral-100/90 dark:bg-neutral-800/90 border-neutral-300 dark:border-neutral-700 shadow-2xs"
                        : "bg-white dark:bg-[#0c0d10] hover:bg-neutral-50 dark:hover:bg-neutral-900/60 border-neutral-200/60 dark:border-neutral-800/80",
                    )}
                  >
                    {/* Play Button */}
                    <button
                      type="button"
                      onClick={() => togglePlaySFX(item)}
                      className={cn(
                        "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-opacity cursor-pointer shadow-2xs",
                        isPlaying
                          ? "bg-black text-white dark:bg-white dark:text-black animate-pulse"
                          : "bg-neutral-900 text-white dark:bg-white dark:text-neutral-950 hover:opacity-90",
                      )}
                      title={isPlaying ? "Pause" : "Play audition"}
                    >
                      {isPlaying ? (
                        <RiPauseFill className="h-4.5 w-4.5" />
                      ) : (
                        <RiPlayFill className="h-4.5 w-4.5 translate-x-0.5" />
                      )}
                    </button>

                    {/* Sound Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                          {item.name}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {/* Scope Badge */}
                        {item.is_global ? (
                          <span
                            className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.2 rounded bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300"
                            title="Available across all projects"
                          >
                            <RiGlobalLine className="h-2.5 w-2.5" />
                            Global
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.2 rounded bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
                            title="Scoped to this project only"
                          >
                            <RiFolderLine className="h-2.5 w-2.5" />
                            Project
                          </span>
                        )}

                        {/* Duration */}
                        {item.duration_seconds && (
                          <span className="text-[10px] text-neutral-400 font-mono">
                            ~{item.duration_seconds}s
                          </span>
                        )}

                        {/* Volume */}
                        <span className="text-[10px] text-neutral-500 font-mono flex items-center gap-0.5">
                          <RiVolumeUpLine className="h-2.5 w-2.5" />
                          {Math.round(item.default_volume * 100)}%
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => setEditingItem(item)}
                        className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                        title="Edit sound"
                      >
                        <RiEditLine className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(item)}
                        disabled={isDeleting}
                        className="p-1.5 rounded-lg text-neutral-400 hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer disabled:opacity-50"
                        title="Delete sound"
                      >
                        {isDeleting ? (
                          <RiLoader4Line className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RiDeleteBinLine className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </ScrollFade>
        </div>
      )}

      {/* Create SFX Modal */}
      <CreateSFXDialog
        projectId={projectId}
        defaultCategory={activeTab === "atmosphere" ? "atmosphere" : "foley"}
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSFXCreated={() => mutate()}
      />

      {/* Edit SFX Modal */}
      <EditSFXDialog
        item={editingItem}
        open={Boolean(editingItem)}
        onOpenChange={(open) => !open && setEditingItem(null)}
        onSFXUpdated={() => mutate()}
      />
    </div>
  );
}

export default SFXPanel;
