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
  RiCloseLine,
  RiLoader4Line,
  RiMoreFill,
  RiStarLine,
  RiStarFill,
  RiCheckLine,
} from "@remixicon/react";
import type { Voice } from "@novelova/shared-types";
import { getVoices, deleteVoice, makeVoiceDefault } from "@/services/voices";
import { CharacterAvatar } from "@/components/ui/character-avatar";
import { ScrollFade } from "@/components/ui/scroll-fade";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { CreateVoiceDialog } from "./create-voice-dialog";
import { EditVoiceDialog } from "./edit-voice-dialog";
import { cn } from "@/lib/utils";

export interface VoicesPanelProps {
  projectId: string;
  className?: string;
  onApplied?: () => void;
}

export function VoicesPanel({ projectId, className, onApplied }: VoicesPanelProps) {
  const [search, setSearch] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingVoice, setEditingVoice] = useState<Voice | null>(null);
  const [deletingVoiceId, setDeletingVoiceId] = useState<string | null>(null);
  const [settingDefaultId, setSettingDefaultId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  // Audio player state
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const swrKey = `/voices?project_id=${projectId}`;
  const { data: voices = [], isLoading, mutate } = useSWR<Voice[]>(
    swrKey,
    () => getVoices(projectId),
    { revalidateOnFocus: false },
  );

  // Pause audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  const filteredVoices = useMemo(() => {
    if (!search.trim()) return voices;
    const query = search.toLowerCase();
    return voices.filter(
      (v) =>
        v.name.toLowerCase().includes(query) ||
        (v.reference_text && v.reference_text.toLowerCase().includes(query)) ||
        v.gender.toLowerCase().includes(query),
    );
  }, [voices, search]);

  const togglePlayVoice = (voice: Voice) => {
    if (playingVoiceId === voice.id) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setPlayingVoiceId(null);
    } else {
      setPlayingVoiceId(voice.id);
      if (audioRef.current) {
        audioRef.current.src = voice.audio_url;
        audioRef.current.play().catch(() => setPlayingVoiceId(null));
      }
    }
  };

  const handleMakeDefault = async (voice: Voice) => {
    setSettingDefaultId(voice.id);
    try {
      await makeVoiceDefault(voice.id, projectId);
      await mutate();
      if (onApplied) onApplied();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to update default voice");
    } finally {
      setSettingDefaultId(null);
    }
  };

  const handleDelete = async (voice: Voice) => {
    if (!window.confirm(`Are you sure you want to delete voice "${voice.name}"?`)) {
      return;
    }

    setDeletingVoiceId(voice.id);
    if (playingVoiceId === voice.id && audioRef.current) {
      audioRef.current.pause();
      setPlayingVoiceId(null);
    }

    try {
      await deleteVoice(voice.id);
      await mutate();
      if (onApplied) onApplied();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to delete voice");
    } finally {
      setDeletingVoiceId(null);
    }
  };

  return (
    <div
      className={cn(
        "w-72 sm:w-80 shrink-0 h-full border-r border-neutral-200/80 dark:border-white/[0.08] bg-white dark:bg-[#0c0d10] flex flex-col select-none transition-all",
        className,
      )}
    >
      {/* Audio player element */}
      <audio
        ref={audioRef}
        onEnded={() => setPlayingVoiceId(null)}
        onError={() => setPlayingVoiceId(null)}
        className="hidden"
      />

      {/* Header */}
      <div className="h-12 px-4 flex items-center justify-between shrink-0 border-b border-neutral-200/80 dark:border-white/[0.08]">
        <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          Voice library
        </span>

        <button
          type="button"
          onClick={() => setCreateDialogOpen(true)}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-100 text-white dark:text-neutral-950 text-xs font-medium transition-colors cursor-pointer shadow-2xs"
          title="Add a custom voice reference"
        >
          <RiAddLine className="h-3.5 w-3.5" />
          <span>New voice</span>
        </button>
      </div>

      {/* Search Input */}
      <div className="p-3 border-b border-neutral-200/60 dark:border-white/[0.06] shrink-0">
        <div className="relative">
          <RiSearchLine className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search voices by name or gender..."
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

      {/* Voice List */}
      <ScrollFade className="flex-1 overflow-y-auto p-3 space-y-2">
        {isLoading && voices.length === 0 ? (
          <div className="h-36 flex flex-col items-center justify-center p-8 text-center">
            <span className="shimmer-text text-xs font-medium text-neutral-400 dark:text-neutral-500">
              Loading voices...
            </span>
          </div>
        ) : filteredVoices.length === 0 ? (
          <div className="h-40 flex flex-col items-center justify-center text-center p-4">
            <p className="text-xs text-neutral-400 dark:text-neutral-500">
              {search ? "No voices match your filter." : "No custom voices uploaded yet."}
            </p>
            {!search && (
              <button
                type="button"
                onClick={() => setCreateDialogOpen(true)}
                className="mt-2 text-xs font-medium text-neutral-900 dark:text-neutral-100 hover:underline cursor-pointer"
              >
                Upload reference voice
              </button>
            )}
          </div>
        ) : (
          filteredVoices.map((voice) => {
            const isPlaying = playingVoiceId === voice.id;

            return (
              <div
                key={voice.id}
                onClick={() => togglePlayVoice(voice)}
                className={cn(
                  "p-2.5 rounded-xl border border-neutral-200/80 dark:border-white/[0.06] bg-neutral-50/50 dark:bg-neutral-900/40 hover:bg-neutral-100/60 dark:hover:bg-white/[0.04] transition-all flex items-center gap-3 group cursor-pointer relative",
                  isPlaying && "ring-1 ring-neutral-400 dark:ring-neutral-600 bg-neutral-100/90 dark:bg-white/[0.06]",
                  voice.is_default && "border-emerald-500/40 dark:border-emerald-500/30 bg-emerald-50/20 dark:bg-emerald-950/10",
                )}
              >
                {/* Avatar with Play Button Overlay */}
                <div className="relative shrink-0 w-10 h-10">
                  {voice.avatar_url ? (
                    <div className="w-10 h-10 rounded-full overflow-hidden border border-neutral-200/60 dark:border-neutral-700/60 bg-neutral-100 dark:bg-neutral-800">
                      <img
                        src={voice.avatar_url}
                        alt={voice.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>
                  ) : (
                    <CharacterAvatar
                      name={voice.name}
                      gender={voice.gender}
                      size={40}
                      className="w-10 h-10"
                    />
                  )}

                  {/* Play button overlay / indicator */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePlayVoice(voice);
                    }}
                    className={cn(
                      "absolute inset-0 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-xs",
                      isPlaying
                        ? "bg-black/60 text-white opacity-100"
                        : "bg-black/40 text-white opacity-0 group-hover:opacity-100",
                    )}
                    title={isPlaying ? "Pause sample" : "Audition voice"}
                  >
                    {isPlaying ? (
                      <RiPauseFill className="h-4 w-4" />
                    ) : (
                      <RiPlayFill className="h-4 w-4 translate-x-0.5" />
                    )}
                  </button>
                </div>

                {/* Voice Metadata */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 justify-between">
                    <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                      {voice.name}
                    </span>
                    {voice.duration_seconds && (
                      <span className="text-[10px] text-neutral-400 font-mono shrink-0">
                        ~{voice.duration_seconds}s
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    {/* Default Voice Badge */}
                    {voice.is_default && (
                      <span
                        className="inline-flex items-center gap-1 text-[9.5px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-300/80 dark:border-emerald-800 shadow-2xs"
                        title={`Default voice for all unassigned ${voice.gender === "female" ? "female" : "male"} characters`}
                      >
                        <RiCheckLine className="h-2.5 w-2.5" />
                        <span>Default {voice.gender === "female" ? "Female" : "Male"}</span>
                      </span>
                    )}

                    {/* Gender badge */}
                    <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 capitalize">
                      {voice.gender}
                    </span>

                    {/* Scope Badge */}
                    {voice.is_global ? (
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
                  </div>
                </div>

                {/* Right: Three-Dot Menu (Dropdown) */}
                <div
                  className="flex items-center shrink-0 ml-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Popover
                    open={menuOpenId === voice.id}
                    onOpenChange={(open) => setMenuOpenId(open ? voice.id : null)}
                  >
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        onClick={(e) => e.stopPropagation()}
                        className="p-1.5 rounded-lg border border-transparent hover:border-neutral-200 dark:hover:border-neutral-700 bg-neutral-100/60 hover:bg-neutral-200/80 dark:bg-white/[0.04] dark:hover:bg-white/[0.1] text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white transition-colors cursor-pointer"
                        title="Voice options"
                      >
                        {settingDefaultId === voice.id ? (
                          <RiLoader4Line className="h-4 w-4 animate-spin text-neutral-500" />
                        ) : (
                          <RiMoreFill className="h-4 w-4" />
                        )}
                      </button>
                    </PopoverTrigger>

                    <PopoverContent
                      align="end"
                      sideOffset={4}
                      className="w-52 p-1 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 shadow-xl z-50"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpenId(null);
                          handleMakeDefault(voice);
                        }}
                        disabled={settingDefaultId === voice.id}
                        className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-900 flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {voice.is_default ? (
                          <>
                            <RiStarFill className="h-3.5 w-3.5 text-amber-500 fill-current" />
                            <span>Remove Default ({voice.gender === "female" ? "Female" : "Male"})</span>
                          </>
                        ) : (
                          <>
                            <RiStarLine className="h-3.5 w-3.5 text-amber-500" />
                            <span>Make Default ({voice.gender === "female" ? "Female" : "Male"})</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpenId(null);
                          setEditingVoice(voice);
                        }}
                        className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-900 flex items-center gap-2 transition-colors cursor-pointer"
                      >
                        <RiEditLine className="h-3.5 w-3.5 text-neutral-400" />
                        <span>Edit Details</span>
                      </button>

                      <div className="h-px my-1 bg-neutral-200/60 dark:bg-neutral-800/60" />

                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpenId(null);
                          handleDelete(voice);
                        }}
                        disabled={deletingVoiceId === voice.id}
                        className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium text-destructive hover:bg-destructive/10 flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {deletingVoiceId === voice.id ? (
                          <RiLoader4Line className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RiDeleteBinLine className="h-3.5 w-3.5" />
                        )}
                        <span>Delete Voice</span>
                      </button>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            );
          })
        )}
      </ScrollFade>

      {/* Create Voice Modal */}
      <CreateVoiceDialog
        projectId={projectId}
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onVoiceCreated={() => {
          mutate();
          if (onApplied) onApplied();
        }}
      />

      {/* Edit Voice Modal */}
      <EditVoiceDialog
        voice={editingVoice}
        open={Boolean(editingVoice)}
        onOpenChange={(open) => !open && setEditingVoice(null)}
        onVoiceUpdated={() => {
          mutate();
          if (onApplied) onApplied();
        }}
      />
    </div>
  );
}

export default VoicesPanel;
