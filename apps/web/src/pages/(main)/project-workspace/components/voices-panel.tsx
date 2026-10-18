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
  RiMicLine,
  RiCloseLine,
  RiLoader4Line,
} from "@remixicon/react";
import type { Voice } from "@novelova/shared-types";
import { getVoices, deleteVoice } from "@/services/voices";
import { CharacterAvatar } from "@/components/ui/character-avatar";
import { ScrollFade } from "@/components/ui/scroll-fade";
import { CreateVoiceDialog } from "./create-voice-dialog";
import { EditVoiceDialog } from "./edit-voice-dialog";
import { cn } from "@/lib/utils";

export interface VoicesPanelProps {
  projectId: string;
  className?: string;
}

export function VoicesPanel({ projectId, className }: VoicesPanelProps) {
  const [search, setSearch] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingVoice, setEditingVoice] = useState<Voice | null>(null);
  const [deletingVoiceId, setDeletingVoiceId] = useState<string | null>(null);

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
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to delete voice");
    } finally {
      setDeletingVoiceId(null);
    }
  };

  return (
    <div
      className={cn(
        "w-72 sm:w-80 shrink-0 h-full border-r border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#0c0d10] flex flex-col select-none transition-colors",
        className,
      )}
    >
      {/* Hidden shared audio player */}
      <audio
        ref={audioRef}
        onEnded={() => setPlayingVoiceId(null)}
        onError={() => setPlayingVoiceId(null)}
        className="hidden"
      />

      {/* Panel Top Header */}
      <div className="p-3.5 border-b border-neutral-200/80 dark:border-neutral-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 flex items-center justify-center shadow-2xs">
            <RiMicLine className="h-3.5 w-3.5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                Voice Library
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
                {voices.length}
              </span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setCreateDialogOpen(true)}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-100 text-white dark:text-neutral-950 text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
          title="Add new voice clone"
        >
          <RiAddLine className="h-3.5 w-3.5" />
          <span>New Voice</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="p-2.5 border-b border-neutral-200/60 dark:border-neutral-800/80 shrink-0">
        <div className="relative">
          <RiSearchLine className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search voice clones..."
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

      {/* Voice List */}
      <ScrollFade className="flex-1 overflow-y-auto min-h-0 p-2 space-y-1">
        {isLoading && voices.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <span className="shimmer-text text-xs font-medium text-neutral-400 dark:text-neutral-500">
              Loading voices...
            </span>
          </div>
        ) : filteredVoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center space-y-2">
            <div className="w-10 h-10 rounded-2xl bg-neutral-100 dark:bg-neutral-800 text-neutral-400 flex items-center justify-center mx-auto">
              <RiMicLine className="h-5 w-5" />
            </div>
            <p className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
              {search ? "No voices match your search" : "No custom voice clones yet"}
            </p>
            <p className="text-[11px] text-neutral-400 dark:text-neutral-500 max-w-xs">
              {search
                ? "Try a different search query."
                : "Upload speech samples to clone voices for Chatterbox, CosyVoice, or VibeVoice."}
            </p>
            {!search && (
              <button
                type="button"
                onClick={() => setCreateDialogOpen(true)}
                className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-900 dark:text-white text-xs font-semibold transition-colors cursor-pointer"
              >
                <RiAddLine className="h-3.5 w-3.5" />
                <span>Upload First Voice</span>
              </button>
            )}
          </div>
        ) : (
          filteredVoices.map((voice) => {
            const isPlaying = playingVoiceId === voice.id;
            const isDeleting = deletingVoiceId === voice.id;

            return (
              <div
                key={voice.id}
                className={cn(
                  "group relative p-2.5 rounded-xl border transition-all duration-150 flex items-center gap-3",
                  isPlaying
                    ? "bg-neutral-100/90 dark:bg-neutral-800/90 border-neutral-300 dark:border-neutral-700 shadow-2xs"
                    : "bg-white dark:bg-[#0c0d10] hover:bg-neutral-50 dark:hover:bg-neutral-900/60 border-neutral-200/60 dark:border-neutral-800/80",
                )}
              >
                {/* Voice Avatar */}
                <div className="relative shrink-0">
                  {voice.avatar_url ? (
                    <div className="w-10 h-10 rounded-full overflow-hidden ring-1 ring-black/5 dark:ring-white/10 bg-neutral-100 dark:bg-neutral-800">
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
                    onClick={() => togglePlayVoice(voice)}
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
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                      {voice.name}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
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

                    {/* Duration badge */}
                    {voice.duration_seconds && (
                      <span className="text-[10px] text-neutral-400 font-mono">
                        ~{voice.duration_seconds}s
                      </span>
                    )}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={() => setEditingVoice(voice)}
                    className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                    title="Edit voice"
                  >
                    <RiEditLine className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(voice)}
                    disabled={isDeleting}
                    className="p-1.5 rounded-lg text-neutral-400 hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer disabled:opacity-50"
                    title="Delete voice"
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

      {/* Create Voice Modal */}
      <CreateVoiceDialog
        projectId={projectId}
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onVoiceCreated={() => mutate()}
      />

      {/* Edit Voice Modal */}
      <EditVoiceDialog
        voice={editingVoice}
        open={Boolean(editingVoice)}
        onOpenChange={(open) => !open && setEditingVoice(null)}
        onVoiceUpdated={() => mutate()}
      />
    </div>
  );
}

export default VoicesPanel;
