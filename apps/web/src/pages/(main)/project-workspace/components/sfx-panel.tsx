import { useState, useMemo, useRef, useEffect } from "react";
import useSWR from "swr";
import {
  RiAddLine,
  RiSearchLine,
  RiPlayFill,
  RiPauseFill,
  RiEditLine,
  RiDeleteBinLine,
  RiCloseLine,
  RiLoader4Line,
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

const DEFAULT_TEST_PROMPT =
  "System Notification: Title acquired. Spatial storage expanded to tier two.";

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
  const [filterTestText, setFilterTestText] = useState(DEFAULT_TEST_PROMPT);
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
        "w-72 sm:w-80 shrink-0 h-full border-r border-neutral-200/80 dark:border-white/[0.08] bg-white dark:bg-[#0c0d10] flex flex-col select-none transition-all",
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

      {/* Panel Top Header */}
      <div className="h-12 px-4 flex items-center justify-between shrink-0 border-b border-neutral-200/80 dark:border-white/[0.08]">
        <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          Sound Effects
        </span>

        {activeTab !== "filters" && (
          <button
            type="button"
            onClick={() => setCreateDialogOpen(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-100 text-white dark:text-neutral-950 text-xs font-medium transition-colors cursor-pointer shadow-2xs"
            title="Upload sound effect"
          >
            <RiAddLine className="h-3.5 w-3.5" />
            <span>Upload</span>
          </button>
        )}
      </div>

      {/* Segmented Navigation Tabs */}
      <div className="px-3 pt-2.5 pb-2 shrink-0 border-b border-neutral-200/60 dark:border-white/[0.06] flex items-center gap-1">
        <button
          type="button"
          onClick={() => setActiveTab("foley")}
          className={cn(
            "flex-1 py-1 px-2 rounded-md text-xs font-medium transition-all cursor-pointer flex items-center justify-center gap-1.5",
            activeTab === "foley"
              ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-950 font-semibold shadow-2xs"
              : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-white/[0.04]",
          )}
        >
          <span>Foley</span>
          <span
            className={cn(
              "text-[10px] font-mono",
              activeTab === "foley" ? "opacity-80" : "opacity-50",
            )}
          >
            {foleyItems.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("atmosphere")}
          className={cn(
            "flex-1 py-1 px-2 rounded-md text-xs font-medium transition-all cursor-pointer flex items-center justify-center gap-1.5",
            activeTab === "atmosphere"
              ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-950 font-semibold shadow-2xs"
              : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-white/[0.04]",
          )}
        >
          <span>Ambience</span>
          <span
            className={cn(
              "text-[10px] font-mono",
              activeTab === "atmosphere" ? "opacity-80" : "opacity-50",
            )}
          >
            {atmosphereItems.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("filters")}
          className={cn(
            "flex-1 py-1 px-2 rounded-md text-xs font-medium transition-all cursor-pointer flex items-center justify-center gap-1.5",
            activeTab === "filters"
              ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-950 font-semibold shadow-2xs"
              : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-white/[0.04]",
          )}
        >
          <span>Filters</span>
          <span
            className={cn(
              "text-[10px] font-mono",
              activeTab === "filters" ? "opacity-80" : "opacity-50",
            )}
          >
            {VOICE_FILTER_PRESETS.length}
          </span>
        </button>
      </div>

      {/* Main Content Area */}
      {activeTab === "filters" ? (
        /* Voice Filters Presets Tab */
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Studio Audition Scratchpad */}
          <div className="p-3 border-b border-neutral-200/60 dark:border-white/[0.06] bg-neutral-50/40 dark:bg-white/[0.02] shrink-0 space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-mono text-neutral-400 dark:text-neutral-500">
              <span className="uppercase tracking-wider">Audition Scratchpad</span>
              {playingFilterId && (
                <button
                  type="button"
                  onClick={() => togglePlayFilter(playingFilterId, "")}
                  className="text-neutral-900 dark:text-white hover:underline cursor-pointer flex items-center gap-1 font-semibold"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-neutral-900 dark:bg-white animate-pulse" />
                  Stop Audition
                </button>
              )}
            </div>

            <div className="relative">
              <input
                type="text"
                value={filterTestText}
                onChange={(e) => setFilterTestText(e.target.value)}
                placeholder="Enter sample line to audition..."
                className="w-full px-2.5 py-1.5 pr-7 rounded-lg text-xs bg-white dark:bg-neutral-900/80 border border-neutral-200/80 dark:border-white/[0.08] text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400 dark:focus:ring-neutral-600 transition-all font-mono"
              />
              {filterTestText && (
                <button
                  type="button"
                  onClick={() => setFilterTestText("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 p-0.5 cursor-pointer"
                  title="Clear phrase"
                >
                  <RiCloseLine className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          {/* Voice Presets Rack Table */}
          <ScrollFade className="flex-1 overflow-y-auto min-h-0 p-3">
            <div className="rounded-xl border border-neutral-200/80 dark:border-white/[0.06] bg-neutral-50/50 dark:bg-neutral-900/40 divide-y divide-neutral-200/60 dark:divide-white/[0.04] overflow-hidden">
              {VOICE_FILTER_PRESETS.map((preset) => {
                const isPlaying = playingFilterId === preset.id;

                return (
                  <div
                    key={preset.id}
                    onClick={() => togglePlayFilter(preset.id, preset.samplePrompt)}
                    className={cn(
                      "flex items-center justify-between p-2.5 text-xs transition-colors group cursor-pointer",
                      isPlaying
                        ? "bg-neutral-100/90 dark:bg-white/[0.08]"
                        : "hover:bg-neutral-100/60 dark:hover:bg-white/[0.04]",
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
                      {/* Audition Trigger */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePlayFilter(preset.id, preset.samplePrompt);
                        }}
                        className={cn(
                          "w-7 h-7 rounded-md flex items-center justify-center shrink-0 transition-all cursor-pointer",
                          isPlaying
                            ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-950"
                            : "bg-neutral-200/70 hover:bg-neutral-300 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300",
                        )}
                        title={isPlaying ? "Stop" : "Audition filter"}
                      >
                        {isPlaying ? (
                          <RiPauseFill className="h-3.5 w-3.5 fill-current" />
                        ) : (
                          <RiPlayFill className="h-3.5 w-3.5 fill-current ml-0.5" />
                        )}
                      </button>

                      {/* Preset Info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="font-semibold text-neutral-900 dark:text-neutral-100 truncate text-xs">
                            {preset.name}
                          </span>
                          {preset.dspSpec && (
                            <span className="text-[9.5px] font-mono text-neutral-400 dark:text-neutral-500 shrink-0">
                              {preset.dspSpec}
                            </span>
                          )}
                        </div>
                        <p className="text-[10.5px] text-neutral-400 dark:text-neutral-500 truncate mt-0.5">
                          {preset.description}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollFade>
        </div>
      ) : (
        /* Foley / Atmosphere Sounds Tab */
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Search Bar */}
          <div className="p-3 border-b border-neutral-200/60 dark:border-white/[0.06] shrink-0">
            <div className="relative">
              <RiSearchLine className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={
                  activeTab === "atmosphere"
                    ? "Filter atmosphere tracks..."
                    : "Filter foley cues..."
                }
                className="w-full pl-8 pr-7 py-1.5 rounded-lg text-xs bg-neutral-50 dark:bg-neutral-900/60 border border-neutral-200/80 dark:border-white/[0.08] text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400 dark:focus:ring-neutral-600 transition-colors"
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
          <ScrollFade className="flex-1 overflow-y-auto min-h-0 p-3">
            {isLoading && sfxList.length === 0 ? (
              <div className="h-36 flex flex-col items-center justify-center p-8 text-center">
                <span className="shimmer-text text-xs font-medium text-neutral-400 dark:text-neutral-500">
                  Loading sounds...
                </span>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="h-40 flex flex-col items-center justify-center text-center p-4">
                <p className="text-xs text-neutral-400 dark:text-neutral-500">
                  {search
                    ? "No sounds match your filter."
                    : activeTab === "atmosphere"
                      ? "No atmosphere tracks uploaded yet."
                      : "No foley cues uploaded yet."}
                </p>
                {!search && (
                  <button
                    type="button"
                    onClick={() => setCreateDialogOpen(true)}
                    className="mt-2 text-xs font-medium text-neutral-900 dark:text-neutral-100 hover:underline cursor-pointer"
                  >
                    Upload first sound
                  </button>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-neutral-200/80 dark:border-white/[0.06] bg-neutral-50/50 dark:bg-neutral-900/40 divide-y divide-neutral-200/60 dark:divide-white/[0.04] overflow-hidden">
                {filteredItems.map((item) => {
                  const isPlaying = playingSFXId === item.id;
                  const isDeleting = deletingId === item.id;

                  return (
                    <div
                      key={item.id}
                      onClick={() => togglePlaySFX(item)}
                      className={cn(
                        "flex items-center justify-between p-2.5 text-xs transition-colors group cursor-pointer",
                        isPlaying
                          ? "bg-neutral-100/90 dark:bg-white/[0.08]"
                          : "hover:bg-neutral-100/60 dark:hover:bg-white/[0.04]",
                      )}
                    >
                      {/* Left: Play Trigger */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePlaySFX(item);
                        }}
                        className={cn(
                          "w-7 h-7 rounded-md flex items-center justify-center shrink-0 transition-all cursor-pointer mr-2.5",
                          isPlaying
                            ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-950"
                            : "bg-neutral-200/70 hover:bg-neutral-300 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300",
                        )}
                        title={isPlaying ? "Pause" : "Play audition"}
                      >
                        {isPlaying ? (
                          <RiPauseFill className="h-3.5 w-3.5 fill-current" />
                        ) : (
                          <RiPlayFill className="h-3.5 w-3.5 fill-current ml-0.5" />
                        )}
                      </button>

                      {/* Center: Details */}
                      <div className="flex-1 min-w-0 mr-2">
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="font-semibold text-neutral-900 dark:text-neutral-100 truncate text-xs">
                            {item.name}
                          </span>
                          {item.duration_seconds && (
                            <span className="text-[10px] font-mono text-neutral-400 dark:text-neutral-500 shrink-0">
                              {item.duration_seconds}s
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 text-[10px] font-mono text-neutral-400 dark:text-neutral-500 mt-0.5">
                          <span>{item.is_global ? "Global" : "Project"}</span>
                          <span>•</span>
                          <span>{Math.round(item.default_volume * 100)}% vol</span>
                        </div>
                      </div>

                      {/* Right: Hover Actions */}
                      <div
                        className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => setEditingItem(item)}
                          className="p-1 rounded text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-200/60 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                          title="Edit sound"
                        >
                          <RiEditLine className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(item)}
                          disabled={isDeleting}
                          className="p-1 rounded text-neutral-400 hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer disabled:opacity-50"
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
                })}
              </div>
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
