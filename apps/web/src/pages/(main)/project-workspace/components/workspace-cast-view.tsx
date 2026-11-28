import { useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import {
  RiAddLine,
  RiDeleteBinLine,
  RiGitMergeLine,
  RiLoader4Line,
  RiMagicLine,
  RiPlayFill,
  RiRefreshLine,
  RiSparklingLine,
  RiStarFill,
  RiStopFill,
} from "@remixicon/react";
import type {
  Character,
  CharacterAliasSuggestion,
  Voice,
} from "@novelova/shared-types";
import {
  getAliasSuggestions,
  resetAllCast,
  setDefaultsByGender,
  updateCharacter,
} from "@/services/character-and-pronunciation";
import { deleteVoice, getVoices, makeVoiceDefault } from "@/services/voices";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { CharacterMergeModal } from "./character-merge-modal";
import { CharacterPanel } from "./character-panel";
import { CreateVoiceDialog } from "./create-voice-dialog";
import { VoiceDesignModal } from "./voice-design-modal";
import { VoicesPanel } from "./voices-panel";

interface WorkspaceCastViewProps {
  projectId: string;
  characters: Character[];
  onRefresh: () => void;
  onCreateCharacter: (name: string, roleDescription?: string) => Promise<Character | null>;
  onUpdateCharacter: (
    characterId: string,
    payload: {
      name?: string;
      role_description?: string;
      assigned_voice_id?: string | null;
      assigned_voice_name?: string | null;
      voice_filter_id?: string | null;
    },
  ) => Promise<void>;
  onDeleteCharacter: (characterId: string) => Promise<void>;
}

export function WorkspaceCastView({
  projectId,
  characters,
  onRefresh,
  onCreateCharacter,
  onUpdateCharacter,
  onDeleteCharacter,
}: WorkspaceCastViewProps) {
  const confirm = useConfirm();
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [updatingCharId, setUpdatingCharId] = useState<string | null>(null);
  const [createVoiceOpen, setCreateVoiceOpen] = useState(false);
  const [voiceDesignOpen, setVoiceDesignOpen] = useState(false);
  const [mergeSource, setMergeSource] = useState<Character | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState<string>("");
  const [mergeOpen, setMergeOpen] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);

  const { data: voices = [], mutate: mutateVoices } = useSWR<Voice[]>(
    projectId ? `/voices?project_id=${projectId}` : null,
    () => getVoices(projectId),
    { revalidateOnFocus: false },
  );

  const { data: aliasSuggestions = [], mutate: mutateAliases } = useSWR<
    CharacterAliasSuggestion[]
  >(
    projectId ? `/projects/${projectId}/characters/alias-suggestions` : null,
    () => getAliasSuggestions(projectId),
    { revalidateOnFocus: false },
  );

  const voiceById = useMemo(
    () => new Map(voices.map((v) => [v.id, v])),
    [voices],
  );

  const assignedCount = useMemo(
    () => characters.filter((c) => Boolean(c.assigned_voice_id || c.assigned_voice_name)).length,
    [characters],
  );

  const togglePlayVoice = (voice: Voice | undefined) => {
    if (!voice?.audio_url) {
      toast.error("No audio sample available for this voice.");
      return;
    }
    if (playingVoiceId === voice.id && audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setPlayingVoiceId(null);
      return;
    }
    if (audioRef.current) {
      audioRef.current.pause();
    }
    const audio = new Audio(voice.audio_url);
    audio.onended = () => setPlayingVoiceId(null);
    audio.onerror = () => {
      setPlayingVoiceId(null);
      toast.error(`Unable to play audio sample for "${voice.name}".`);
    };
    audioRef.current = audio;
    setPlayingVoiceId(voice.id);
    audio.play().catch(() => setPlayingVoiceId(null));
  };

  const handleAssignVoice = async (char: Character, voiceId: string) => {
    setUpdatingCharId(char.id);
    try {
      const voice = voiceById.get(voiceId);
      await updateCharacter(projectId, char.id, {
        assigned_voice_id: voice ? voice.id : null,
        assigned_voice_name: voice ? voice.name : null,
      });
      onRefresh();
      toast.success(
        voice
          ? `Assigned "${voice.name}" to ${char.name}`
          : `Cleared voice for ${char.name}`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to assign voice.");
    } finally {
      setUpdatingCharId(null);
    }
  };

  const handleAutoCast = async () => {
    setBusyAction("auto");
    try {
      await setDefaultsByGender(projectId);
      onRefresh();
      toast.success("Assigned default voices by inferred gender.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to auto-cast voices.");
    } finally {
      setBusyAction(null);
    }
  };

  const handleResetAll = async () => {
    const confirmed = await confirm({
      title: "Reset all voice assignments?",
      description: "Every character in this project will be cleared back to unassigned.",
      confirmLabel: "Reset all",
      variant: "destructive",
    });
    if (!confirmed) return;

    setBusyAction("reset");
    try {
      await resetAllCast(projectId);
      onRefresh();
      toast.success("Voice assignments reset.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reset casting.");
    } finally {
      setBusyAction(null);
    }
  };

  const handleDeleteVoice = async (voice: Voice) => {
    const confirmed = await confirm({
      title: `Delete voice "${voice.name}"?`,
      description: "Characters using this voice will need a new voice assignment.",
      confirmLabel: "Delete voice",
      variant: "destructive",
    });
    if (!confirmed) return;
    try {
      await deleteVoice(voice.id);
      await mutateVoices();
      onRefresh();
      toast.success(`Deleted voice "${voice.name}".`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete voice.");
    }
  };

  const handleMakeDefault = async (voice: Voice) => {
    try {
      await makeVoiceDefault(voice.id, projectId);
      await mutateVoices();
      toast.success(`Set "${voice.name}" as default voice.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update default voice.");
    }
  };

  const openMerge = (source: Character, targetId?: string) => {
    setMergeSource(source);
    setMergeTargetId(targetId || "");
    setMergeOpen(true);
  };

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6 bg-background">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl text-foreground">
              Cast &amp; Voices
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {assignedCount} of {characters.length} characters assigned · {voices.length} voice
              {voices.length === 1 ? "" : "s"} in library
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleAutoCast}
              disabled={busyAction !== null || characters.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-secondary text-xs font-medium text-foreground transition-colors cursor-pointer disabled:opacity-50"
            >
              {busyAction === "auto" ? (
                <RiLoader4Line className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RiMagicLine className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <span>Auto-Cast</span>
            </button>
            <button
              type="button"
              onClick={() => setVoiceDesignOpen(true)}
              disabled={characters.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-secondary text-xs font-medium text-foreground transition-colors cursor-pointer disabled:opacity-50"
            >
              <RiSparklingLine className="h-3.5 w-3.5 text-violet-500" />
              <span>AI Voice Design</span>
            </button>
            <button
              type="button"
              onClick={() => setCreateVoiceOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 text-xs font-medium transition-opacity cursor-pointer"
            >
              <RiAddLine className="h-3.5 w-3.5" />
              <span>Upload Voice</span>
            </button>
            {characters.length > 0 && (
              <button
                type="button"
                onClick={handleResetAll}
                disabled={busyAction !== null}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer disabled:opacity-50"
                title="Reset all voice assignments"
              >
                <RiRefreshLine className="h-3.5 w-3.5" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>

        {/* Unified Cast & Voices Sub-Tabs (eliminates sidebar split-parity) */}
        <Tabs defaultValue="casting" className="w-full space-y-6">
          <TabsList variant="underline">
            <TabsTrigger value="casting">Casting Matrix</TabsTrigger>
            <TabsTrigger value="characters">
              Characters ({characters.length})
            </TabsTrigger>
            <TabsTrigger value="voices">
              Voice Library ({voices.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="casting" className="space-y-8 mt-0">
        {/* Inline Alias Detection Banner */}
        {aliasSuggestions.length > 0 && (
          <div className="px-4 py-3 rounded-xl bg-secondary/70 border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-foreground">
              <RiGitMergeLine className="h-4 w-4 text-amber-500 shrink-0" />
              <span>
                <strong>{aliasSuggestions.length} possible duplicate character{aliasSuggestions.length === 1 ? "" : "s"}</strong>{" "}
                detected (e.g. &ldquo;{aliasSuggestions[0].source_name}&rdquo; → &ldquo;{aliasSuggestions[0].target_name}&rdquo;).
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                const first = aliasSuggestions[0];
                const src = characters.find((c) => c.id === first.source_character_id);
                if (src) openMerge(src, first.target_character_id);
              }}
              className="px-3 py-1.5 rounded-lg bg-card border border-border hover:bg-background text-xs font-medium text-foreground shrink-0 cursor-pointer"
            >
              Review &amp; Merge
            </button>
          </div>
        )}

        {/* Character Cast Table (Flat Hairline Rows) */}
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Characters ({characters.length})
          </h2>
          {characters.length === 0 ? (
            <div className="py-12 text-center border-t border-b border-border text-xs text-muted-foreground">
              No characters detected yet. Run <strong>Detect speakers</strong> in Script mode to extract your cast.
            </div>
          ) : (
            <div className="border-t border-b border-border divide-y divide-border">
              {characters.map((char) => {
                const currentVoice = char.assigned_voice_id
                  ? voiceById.get(char.assigned_voice_id)
                  : undefined;
                const isReady = Boolean(char.assigned_voice_id || char.assigned_voice_name);
                return (
                  <div
                    key={char.id}
                    className="py-3.5 grid grid-cols-1 sm:grid-cols-12 items-center gap-3 text-xs"
                  >
                    <div className="sm:col-span-4 min-w-0">
                      <div className="font-medium text-sm text-foreground truncate">
                        {char.name}
                      </div>
                      <div className="text-muted-foreground mt-0.5">
                        {char.dialogue_count ?? 0} lines · {char.gender || "unknown"}
                      </div>
                    </div>

                    <div className="sm:col-span-5 flex items-center gap-2">
                      <NativeSelect
                        value={char.assigned_voice_id || ""}
                        disabled={updatingCharId === char.id}
                        onChange={(e) => handleAssignVoice(char, e.target.value)}
                        className="flex-1 h-8 text-xs"
                      >
                        <NativeSelectOption value="">
                          {char.assigned_voice_name && !char.assigned_voice_id
                            ? `${char.assigned_voice_name} (Built-in)`
                            : "Unassigned"}
                        </NativeSelectOption>
                        {voices.map((v) => (
                          <NativeSelectOption key={v.id} value={v.id}>
                            {v.name} ({v.gender})
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                      <button
                        type="button"
                        disabled={!currentVoice?.audio_url}
                        onClick={() => togglePlayVoice(currentVoice)}
                        className="w-8 h-8 rounded-lg border border-border bg-card hover:bg-secondary flex items-center justify-center shrink-0 disabled:opacity-40 cursor-pointer"
                        title={currentVoice ? `Audition ${currentVoice.name}` : "Assign a custom voice to audition"}
                      >
                        {playingVoiceId === currentVoice?.id ? (
                          <RiStopFill className="h-3.5 w-3.5" />
                        ) : (
                          <RiPlayFill className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>

                    <div className="sm:col-span-3 flex items-center justify-end gap-2">
                      <span
                        className={
                          isReady
                            ? "text-emerald-600 dark:text-emerald-400 font-medium"
                            : "text-amber-600 dark:text-amber-400 font-medium"
                        }
                      >
                        {isReady ? "Ready" : "Needs voice"}
                      </span>
                      {characters.length > 1 && (
                        <button
                          type="button"
                          onClick={() => openMerge(char)}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary cursor-pointer"
                          title={`Merge ${char.name} into another character`}
                        >
                          <RiGitMergeLine className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Custom Voice Library (Flat Hairline Rows) */}
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Voice Library ({voices.length})
          </h2>
          {voices.length === 0 ? (
            <div className="py-10 text-center border-t border-b border-border text-xs text-muted-foreground">
              No custom voices uploaded yet. Upload a reference clip or run AI Voice Design above.
            </div>
          ) : (
            <div className="border-t border-b border-border divide-y divide-border">
              {voices.map((voice) => (
                <div
                  key={voice.id}
                  className="py-3 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <button
                      type="button"
                      onClick={() => togglePlayVoice(voice)}
                      className="w-8 h-8 rounded-lg border border-border bg-card hover:bg-secondary flex items-center justify-center shrink-0 cursor-pointer"
                      title={`Audition ${voice.name}`}
                    >
                      {playingVoiceId === voice.id ? (
                        <RiStopFill className="h-3.5 w-3.5" />
                      ) : (
                        <RiPlayFill className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <div className="min-w-0">
                      <div className="font-medium text-sm text-foreground flex items-center gap-1.5 truncate">
                        <span>{voice.name}</span>
                        {voice.is_default && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-secondary text-foreground font-medium">
                            <RiStarFill className="h-2.5 w-2.5 text-amber-500" />
                            Default
                          </span>
                        )}
                      </div>
                      <div className="text-muted-foreground capitalize">
                        {voice.gender}
                        {voice.description ? ` · ${voice.description}` : ""}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!voice.is_default && (
                      <button
                        type="button"
                        onClick={() => handleMakeDefault(voice)}
                        className="px-2.5 py-1 rounded-lg border border-border hover:bg-secondary text-foreground cursor-pointer"
                      >
                        Set default
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDeleteVoice(voice)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"
                      title={`Delete ${voice.name}`}
                    >
                      <RiDeleteBinLine className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
          </TabsContent>

          <TabsContent value="characters" className="mt-0">
            <div className="rounded-xl border border-border overflow-hidden bg-card">
              <CharacterPanel
                projectId={projectId}
                characters={characters}
                onCreateCharacter={onCreateCharacter}
                onUpdateCharacter={onUpdateCharacter}
                onDeleteCharacter={onDeleteCharacter}
                className="w-full sm:w-full border-r-0"
              />
            </div>
          </TabsContent>

          <TabsContent value="voices" className="mt-0">
            <div className="rounded-xl border border-border overflow-hidden bg-card">
              <VoicesPanel
                projectId={projectId}
                onApplied={() => {
                  mutateVoices();
                  onRefresh();
                }}
                className="w-full sm:w-full border-r-0"
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <CreateVoiceDialog
        open={createVoiceOpen}
        onOpenChange={setCreateVoiceOpen}
        projectId={projectId}
        onVoiceCreated={() => {
          mutateVoices();
          onRefresh();
        }}
      />

      <VoiceDesignModal
        open={voiceDesignOpen}
        onClose={() => setVoiceDesignOpen(false)}
        projectId={projectId}
        characters={characters}
        onCompleted={() => {
          mutateVoices();
          onRefresh();
        }}
      />

      <CharacterMergeModal
        open={mergeOpen}
        onOpenChange={setMergeOpen}
        projectId={projectId}
        sourceCharacter={mergeSource}
        allCharacters={characters}
        initialTargetCharacterId={mergeTargetId}
        onMerged={() => {
          mutateAliases();
          onRefresh();
        }}
      />
    </div>
  );
}
