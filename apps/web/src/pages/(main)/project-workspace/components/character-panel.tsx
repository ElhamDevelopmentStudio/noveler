import { useState, useMemo, useEffect, useRef } from "react";
import useSWR from "swr";
import {
  RiAddLine,
  RiSearchLine,
  RiCheckboxCircleFill,
  RiArrowRightSLine,
  RiPlayFill,
  RiPauseFill,
  RiSparklingLine,
  RiMoreFill,
  RiVolumeUpLine,
  RiEqualizerLine,
  RiCheckLine,
  RiCloseLine,
  RiDeleteBinLine,
  RiLoader4Line,
} from "@remixicon/react";
import type { Character, Voice } from "@novelova/shared-types";
import {
  VOICES_CATALOG,
  findVoiceByIdOrName,
  type VoiceOption,
} from "@/lib/voices-data";
import {
  VOICE_FILTER_PRESETS,
  findVoiceFilterById,
  playAuditionVoiceFilter,
} from "@/lib/voice-filters-data";
import { getVoices } from "@/services/voices";
import { cn } from "@/lib/utils";
import { CharacterAvatar } from "@/components/ui/character-avatar";

import { SoundAvatar } from "@/components/ui/sound-avatar";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

export interface CharacterPanelProps {
  projectId: string;
  characters: Character[];
  onSelectCharacter?: (characterId: string) => void;
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
  onDeleteCharacter?: (characterId: string) => Promise<void>;
  className?: string;
}

type PanelView = "list" | "detail" | "casting";

export function CharacterPanel({
  projectId,
  characters,
  onSelectCharacter,
  onCreateCharacter,
  onUpdateCharacter,
  onDeleteCharacter,
  className,
}: CharacterPanelProps) {

  const [currentView, setCurrentView] = useState<PanelView>("list");
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);

  // Search state for character list
  const [characterSearch, setCharacterSearch] = useState("");

  // Character Detail form state
  const [detailName, setDetailName] = useState("");
  const [detailDescription, setDetailDescription] = useState("");
  // TODO: Voice volume functionality to be implemented
  const [voiceVolume, setVoiceVolume] = useState(100);
  // TODO: Generation settings functionality to be implemented
  const [speed, setSpeed] = useState(1.0);
  const [stability, setStability] = useState(0.5);
  const [similarity, setSimilarity] = useState(0.75);

  // Voice Casting state
  const [castingTab, setCastingTab] = useState<"explore" | "my_voices">("explore");
  const [castingSearch, setCastingSearch] = useState("");
  const [previewLine, setPreviewLine] = useState("");
  const [selectedCollection, setSelectedCollection] = useState<string>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [sortOrder, setSortOrder] = useState<"alpha_asc" | "alpha_desc" | "latest">("latest");
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);

  // New Character modal / inline state
  const [isCreating, setIsCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Resolve currently active character
  const activeCharacter = useMemo(() => {
    return characters.find((c) => c.id === selectedCharacterId) || null;
  }, [characters, selectedCharacterId]);

  // Sync details when selecting character
  useEffect(() => {
    if (activeCharacter) {
      setDetailName(activeCharacter.name);
      setDetailDescription(activeCharacter.role_description || "");
    }
  }, [activeCharacter]);

  const showNotification = (msg: string) => {
    setNotice(msg);
    setTimeout(() => {
      setNotice(null);
    }, 2400);
  };

  const handleOpenDetail = (char: Character) => {
    setSelectedCharacterId(char.id);
    onSelectCharacter?.(char.id);
    setCurrentView("detail");
  };

  const handleCreate = async () => {
    if (isCreating) return;
    setIsCreating(true);
    try {
      const nextNumber = characters.length + 1;
      const defaultName = `Character ${nextNumber}`;
      const newChar = await onCreateCharacter(defaultName, "");
      if (newChar) {
        setSelectedCharacterId(newChar.id);
        onSelectCharacter?.(newChar.id);
        setCurrentView("detail");
        showNotification(`Created ${newChar.name}`);
      }
    } finally {
      setIsCreating(false);
    }
  };

  const handleCommitNameChange = async () => {
    if (!activeCharacter) return;
    const trimmed = detailName.trim();
    if (trimmed && trimmed !== activeCharacter.name) {
      await onUpdateCharacter(activeCharacter.id, { name: trimmed });
      showNotification(`Updated name to ${trimmed}`);
    }
  };

  const handleCommitDescriptionChange = async () => {
    if (!activeCharacter) return;
    const trimmed = detailDescription.trim();
    if (trimmed !== (activeCharacter.role_description || "")) {
      await onUpdateCharacter(activeCharacter.id, { role_description: trimmed });
      showNotification("Character description updated");
    }
  };

  const handleAssignVoice = async (voice: VoiceOption) => {
    if (!activeCharacter) return;
    await onUpdateCharacter(activeCharacter.id, {
      assigned_voice_id: voice.id,
      assigned_voice_name: voice.title,
    });
    showNotification(`Assigned ${voice.name} to ${activeCharacter.name}`);
  };

  // Fetch custom voice clones for project/user
  const { data: customVoices = [] } = useSWR<Voice[]>(
    projectId ? `/voices?project_id=${projectId}` : null,
    () => getVoices(projectId),
    { revalidateOnFocus: false },
  );
  const customAudioRef = useRef<HTMLAudioElement | null>(null);

  const customVoiceOptions: VoiceOption[] = useMemo(() => {
    return customVoices.map((v) => ({
      id: v.id,
      name: v.name,
      title: `${v.name} (${v.is_global ? "Global" : "Project"})`,
      description: v.reference_text || `Custom voice clone (${v.gender})`,
      gender: v.gender,
      category: "Characters",
      collection: "Community",
      created_by: "Community",
      accent: "Neutral",
      gradient: "from-blue-500 via-indigo-500 to-purple-600",
    }));
  }, [customVoices]);

  // Preview Line Voice Playback
  const handleTogglePlayVoice = (voice: VoiceOption) => {
    if (playingVoiceId === voice.id) {
      if (customAudioRef.current) {
        customAudioRef.current.pause();
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      setPlayingVoiceId(null);
      return;
    }

    // Check if custom voice clone with audio file
    const customVoice = customVoices.find((cv) => cv.id === voice.id);
    if (customVoice && customVoice.audio_url) {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      setPlayingVoiceId(voice.id);
      if (customAudioRef.current) {
        customAudioRef.current.src = customVoice.audio_url;
        customAudioRef.current.play().catch(() => setPlayingVoiceId(null));
      }
      return;
    }

    // Built-in speech synthesis fallback
    setPlayingVoiceId(voice.id);
    const textToSay =
      previewLine.trim() ||
      `Hello! I am ${voice.name}. ${voice.description}`;

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(textToSay);
      const synthVoices = window.speechSynthesis.getVoices();
      const matched = synthVoices.find(
        (v) =>
          (voice.gender === "female" &&
            (v.name.includes("Female") ||
              v.name.includes("Samantha") ||
              v.name.includes("Victoria") ||
              v.name.includes("Zira"))) ||
          (voice.gender === "male" &&
            (v.name.includes("Male") ||
              v.name.includes("Alex") ||
              v.name.includes("Daniel") ||
              v.name.includes("David"))),
      );
      if (matched) utterance.voice = matched;
      utterance.rate = 1.0;
      utterance.onend = () => setPlayingVoiceId(null);
      utterance.onerror = () => setPlayingVoiceId(null);
      window.speechSynthesis.speak(utterance);
    } else {
      setTimeout(() => setPlayingVoiceId(null), 2500);
    }
  };

  // Filtered Characters for List view
  const filteredCharacters = useMemo(() => {
    const q = characterSearch.trim().toLowerCase();
    if (!q) return characters;
    return characters.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.role_description && c.role_description.toLowerCase().includes(q)) ||
        (c.assigned_voice_name && c.assigned_voice_name.toLowerCase().includes(q)),
    );
  }, [characters, characterSearch]);

  // Filtered Voices for Casting view
  const filteredVoices = useMemo(() => {
    let list = [...VOICES_CATALOG, ...customVoiceOptions];

    if (castingTab === "my_voices") {
      list = customVoiceOptions.length > 0
        ? customVoiceOptions
        : list.filter((v) => v.collection === "Standard" || v.created_by === "Community");
    }

    if (selectedCollection !== "all") {
      list = list.filter((v) => v.collection.toLowerCase() === selectedCollection.toLowerCase());
    }

    if (selectedCategory !== "all") {
      list = list.filter((v) => v.category.toLowerCase() === selectedCategory.toLowerCase());
    }

    const q = castingSearch.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (v) =>
          v.name.toLowerCase().includes(q) ||
          v.title.toLowerCase().includes(q) ||
          v.description.toLowerCase().includes(q) ||
          v.accent.toLowerCase().includes(q),
      );
    }

    if (sortOrder === "alpha_asc") {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortOrder === "alpha_desc") {
      list.sort((a, b) => b.name.localeCompare(a.name));
    }

    return list;
  }, [customVoiceOptions, castingTab, selectedCollection, selectedCategory, castingSearch, sortOrder]);


  return (
    <div
      className={cn(
        "w-72 sm:w-80 shrink-0 h-full border-r border-neutral-200/80 dark:border-white/[0.08] bg-white dark:bg-[#0c0d10] flex flex-col select-none transition-all relative overflow-hidden",
        className,
      )}
    >
      <audio
        ref={customAudioRef}
        onEnded={() => setPlayingVoiceId(null)}
        onError={() => setPlayingVoiceId(null)}
        className="hidden"
      />

      {/* Toast Notice */}
      {notice && (

        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-3 py-1 rounded-full text-xs font-semibold shadow-lg flex items-center gap-1.5 animate-in fade-in zoom-in-95 pointer-events-none">
          <RiCheckLine className="h-3.5 w-3.5" />
          <span>{notice}</span>
        </div>
      )}

      {/* ========================================================= */}
      {/* VIEW 1: CHARACTERS LIST VIEW                             */}
      {/* ========================================================= */}
      {currentView === "list" && (
        <>
          {/* Header */}
          <div className="h-12 px-4 flex items-center justify-between shrink-0">
            <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Characters
            </span>

            <button
              type="button"
              onClick={handleCreate}
              disabled={isCreating}
              className="p-1 rounded-md text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-white/[0.06] transition-colors cursor-pointer disabled:opacity-50"
              title="Add character"
              aria-label="Add character"
            >
              {isCreating ? (
                <RiLoader4Line className="h-4 w-4 animate-spin" />
              ) : (
                <RiAddLine className="h-4 w-4" />
              )}
            </button>
          </div>

          {/* Search Box */}
          <div className="px-3 pb-2.5 shrink-0">
            <div className="relative flex items-center">
              <RiSearchLine className="absolute left-2.5 h-3.5 w-3.5 text-neutral-400 dark:text-neutral-500 pointer-events-none" />
              <input
                type="text"
                value={characterSearch}
                onChange={(e) => setCharacterSearch(e.target.value)}
                placeholder="Search characters..."
                className="w-full text-xs font-normal pl-8 pr-3 py-1.5 rounded-lg border border-neutral-200/80 dark:border-white/[0.08] bg-neutral-50/80 dark:bg-neutral-900/50 text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 outline-none focus:border-neutral-900 dark:focus:border-white transition-colors"
              />
              {characterSearch && (
                <button
                  type="button"
                  onClick={() => setCharacterSearch("")}
                  className="absolute right-2 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 p-0.5 cursor-pointer"
                >
                  <RiCloseLine className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          {/* Characters List Container */}
          <div className="flex-1 min-h-0 overflow-y-auto p-3 pt-1">
            {filteredCharacters.length === 0 ? (
              <div className="h-36 flex flex-col items-center justify-center text-center p-4">
                <p className="text-xs text-neutral-400 dark:text-neutral-500">
                  {characterSearch ? "No matching characters found." : "No characters created yet."}
                </p>
                {!characterSearch && (
                  <button
                    type="button"
                    onClick={handleCreate}
                    className="mt-2 text-xs font-medium text-neutral-900 dark:text-neutral-100 hover:underline cursor-pointer"
                  >
                    Add first character
                  </button>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-neutral-200/80 dark:border-white/[0.06] bg-neutral-50/50 dark:bg-neutral-900/40 divide-y divide-neutral-200/60 dark:divide-white/[0.04] overflow-hidden">
                {filteredCharacters.map((char) => {
                  const assignedVoice = findVoiceByIdOrName(char.assigned_voice_id || char.assigned_voice_name);
                  const isSelected = char.id === selectedCharacterId;
                  const isNarrator =
                    char.name.toLowerCase() === "narrator" ||
                    Boolean(char.is_general && char.name.toLowerCase().includes("narrator"));

                  return (
                    <div
                      key={char.id}
                      onClick={() => handleOpenDetail(char)}
                      className={cn(
                        "flex items-center justify-between p-2.5 text-xs transition-colors cursor-pointer group",
                        isSelected
                          ? "bg-neutral-100/80 dark:bg-white/[0.06]"
                          : "hover:bg-neutral-100/50 dark:hover:bg-white/[0.03]",
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
                        {/* Character Notionists Duotone Avatar */}
                        <CharacterAvatar
                          name={char.name}
                          gender={char.gender}
                          className="w-8 h-8 rounded-full shrink-0 shadow-2xs"
                        />

                        {/* Character Details */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-neutral-900 dark:text-neutral-100 truncate text-xs">
                              {char.name}
                            </span>
                            {char.voice_filter_id && (
                              <span
                                className="text-[9px] font-mono px-1 py-0.2 rounded bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border border-purple-200/50 dark:border-purple-800/50 shrink-0"
                                title={`Voice Filter: ${findVoiceFilterById(char.voice_filter_id)?.name}`}
                              >
                                🎛️ {findVoiceFilterById(char.voice_filter_id)?.name.split("/")[0].trim()}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-neutral-400 dark:text-neutral-500 truncate mt-0.5">
                            {assignedVoice
                              ? `Voiced by ${assignedVoice.title}`
                              : char.assigned_voice_name
                                ? `Voiced by ${char.assigned_voice_name}`
                                : "No voice assigned"}
                          </p>
                        </div>
                      </div>

                      {/* Right Tag / Badge & Indicator */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isNarrator && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-neutral-200/60 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
                            Default
                          </span>
                        )}
                        {isSelected && (
                          <RiCheckboxCircleFill className="h-4 w-4 text-neutral-900 dark:text-white" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* ========================================================= */}
      {/* VIEW 2: CHARACTER DETAIL VIEW                            */}
      {/* ========================================================= */}
      {currentView === "detail" && activeCharacter && (
        <div className="flex-1 min-h-0 flex flex-col overflow-y-auto">
          {/* Breadcrumb Header */}
          <div className="h-12 px-4 flex items-center gap-1.5 border-b border-transparent shrink-0">
            <button
              type="button"
              onClick={() => setCurrentView("list")}
              className="text-xs font-medium text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors cursor-pointer"
            >
              Characters
            </button>
            <RiArrowRightSLine className="h-3.5 w-3.5 text-neutral-400 dark:text-neutral-600" />
            <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 truncate">
              {activeCharacter.name}
            </span>
          </div>

          {/* Form Body */}
          <div className="p-4 space-y-4 flex-1">
            {/* Character Profile Header with Notionists Duotone Avatar */}
            <div className="flex items-center gap-3 p-2.5 rounded-xl border border-neutral-200/70 dark:border-white/[0.06] bg-neutral-50/50 dark:bg-neutral-900/30">
              <CharacterAvatar
                name={activeCharacter.name}
                gender={activeCharacter.gender}
                className="w-11 h-11 rounded-full shrink-0 shadow-xs ring-1 ring-neutral-300 dark:ring-neutral-700"
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                  {activeCharacter.name}
                </p>
                <p className="text-[11px] text-neutral-400 dark:text-neutral-500 capitalize">
                  {activeCharacter.gender || "Character"} · {activeCharacter.dialogue_count || 0} lines
                </p>
              </div>
            </div>

            {/* Name Field */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                Name
              </label>
              <input
                type="text"
                value={detailName}
                onChange={(e) => setDetailName(e.target.value)}
                onBlur={handleCommitNameChange}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.currentTarget.blur();
                  }
                }}
                className="w-full text-xs font-medium px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#121316] text-neutral-900 dark:text-neutral-100 outline-none focus:border-neutral-900 dark:focus:border-white transition-colors shadow-2xs"
              />
            </div>

            {/* Description Field (Dark mode styling properly fixed) */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                Description
              </label>
              <textarea
                value={detailDescription}
                onChange={(e) => setDetailDescription(e.target.value)}
                onBlur={handleCommitDescriptionChange}
                placeholder="Describe this character"
                rows={3}
                className="w-full text-xs font-normal p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#121316] text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-600 outline-none focus:border-neutral-900 dark:focus:border-white transition-colors shadow-2xs resize-none"
              />
            </div>

            {/* Voice Card Trigger */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                Voice
              </label>

              {(() => {
                const assignedVoice = findVoiceByIdOrName(
                  activeCharacter.assigned_voice_id || activeCharacter.assigned_voice_name,
                );

                return (
                  <div className="rounded-xl border border-neutral-200/90 dark:border-neutral-800 bg-neutral-50/60 dark:bg-[#121316] p-3 space-y-2.5 shadow-2xs">
                    <button
                      type="button"
                      onClick={() => setCurrentView("casting")}
                      className="w-full flex items-center justify-between gap-3 text-left cursor-pointer group"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <SoundAvatar
                          seed={assignedVoice?.id || activeCharacter.assigned_voice_name || "voice"}
                          className="w-8 h-8 rounded-lg shrink-0 shadow-2xs"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 truncate group-hover:text-primary transition-colors">
                            {assignedVoice?.title || activeCharacter.assigned_voice_name || "Select Voice"}
                          </p>
                          <p className="text-[11px] text-neutral-400 dark:text-neutral-500 truncate">
                            Currently selected voice
                          </p>
                        </div>
                      </div>

                      <RiArrowRightSLine className="h-4 w-4 text-neutral-400 dark:text-neutral-500 group-hover:translate-x-0.5 transition-transform" />
                    </button>

                    <div className="pt-2 border-t border-neutral-200/50 dark:border-white/[0.04]">
                      <button
                        type="button"
                        onClick={() => setCurrentView("casting")}
                        className="inline-flex items-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 transition-colors cursor-pointer"
                      >
                        <RiSparklingLine className="h-3.5 w-3.5 text-amber-500" />
                        <span>Create new or remix voice</span>
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Voice Filter & Atmospheric DSP */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
                  <span>🎛️</span>
                  <span>Voice Filter (DSP Effect)</span>
                </label>
                {activeCharacter.voice_filter_id && (
                  <button
                    type="button"
                    onClick={async () => {
                      await onUpdateCharacter(activeCharacter.id, { voice_filter_id: null });
                      showNotification("Voice filter removed");
                    }}
                    className="text-[10px] text-rose-500 hover:underline cursor-pointer"
                  >
                    Clear Filter
                  </button>
                )}
              </div>

              <select
                value={activeCharacter.voice_filter_id || ""}
                onChange={async (e) => {
                  const val = e.target.value;
                  await onUpdateCharacter(activeCharacter.id, {
                    voice_filter_id: val ? val : null,
                  });
                  showNotification(
                    val
                      ? `Applied "${VOICE_FILTER_PRESETS.find((p) => p.id === val)?.name}" filter`
                      : "Voice filter removed",
                  );
                }}
                className="w-full text-xs py-2 px-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/80 dark:bg-[#121316] text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-primary shadow-2xs cursor-pointer"
              >
                <option value="">None (Natural Voice)</option>
                {VOICE_FILTER_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name} — {preset.category}
                  </option>
                ))}
              </select>

              {activeCharacter.voice_filter_id && (
                <div className="flex items-center justify-between p-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-900 dark:text-purple-200 text-xs mt-1">
                  <span className="text-[11px] truncate flex-1 min-w-0">
                    {VOICE_FILTER_PRESETS.find((p) => p.id === activeCharacter.voice_filter_id)?.description}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      playAuditionVoiceFilter(
                        activeCharacter.voice_filter_id!,
                        `System notification: Spatial storage expanded. Speaking as ${activeCharacter.name}.`,
                      );
                    }}
                    className="px-2 py-0.5 rounded bg-purple-600 hover:bg-purple-700 text-white text-[10px] font-semibold shrink-0 ml-2 cursor-pointer flex items-center gap-1"
                  >
                    <RiPlayFill className="w-2.5 h-2.5 fill-current" />
                    <span>Audition</span>
                  </button>
                </div>
              )}
            </div>

            {/* Voice Volume Slider */}
            {/* TODO: Voice volume functionality to be implemented */}
            <div className="space-y-1.5 pt-1">
              <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                Voice Volume
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={voiceVolume}
                  onChange={(e) => setVoiceVolume(Number(e.target.value))}
                  className="flex-1 accent-neutral-900 dark:accent-neutral-100 h-1.5 bg-neutral-200 dark:bg-neutral-800 rounded-lg cursor-pointer"
                />
                <span className="text-xs font-mono font-medium px-2 py-0.5 rounded-md bg-neutral-100 dark:bg-[#18191e] border border-neutral-200/60 dark:border-white/[0.06] text-neutral-800 dark:text-neutral-200 shrink-0">
                  {voiceVolume} %
                </span>
              </div>
            </div>

            {/* Generation Settings Card */}
            {/* TODO: Generation settings functionality to be implemented */}
            <div className="space-y-2 pt-2">
              <label className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                Generation Settings
              </label>

              <div className="rounded-xl border border-neutral-200/90 dark:border-neutral-800 bg-neutral-50/60 dark:bg-[#121316] p-3.5 space-y-4 shadow-2xs">
                {/* Speed Slider */}
                <div className="space-y-1.5">
                  <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300 border-b border-dotted border-neutral-400 dark:border-neutral-500 pb-0.5 cursor-help">
                    Speed
                  </span>
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] text-neutral-400 dark:text-neutral-500">
                      <span>Slower</span>
                      <span>Faster</span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="2.0"
                      step="0.05"
                      value={speed}
                      onChange={(e) => setSpeed(Number(e.target.value))}
                      className="w-full accent-neutral-900 dark:accent-neutral-100 h-1.5 bg-neutral-200 dark:bg-neutral-800 rounded-lg cursor-pointer"
                    />
                  </div>
                </div>

                {/* Stability Slider */}
                <div className="space-y-1.5">
                  <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300 border-b border-dotted border-neutral-400 dark:border-neutral-500 pb-0.5 cursor-help">
                    Stability
                  </span>
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] text-neutral-400 dark:text-neutral-500">
                      <span>More variable</span>
                      <span>More stable</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={stability}
                      onChange={(e) => setStability(Number(e.target.value))}
                      className="w-full accent-neutral-900 dark:accent-neutral-100 h-1.5 bg-neutral-200 dark:bg-neutral-800 rounded-lg cursor-pointer"
                    />
                  </div>
                </div>

                {/* Similarity Slider */}
                <div className="space-y-1.5">
                  <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300 border-b border-dotted border-neutral-400 dark:border-neutral-500 pb-0.5 cursor-help">
                    Similarity
                  </span>
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] text-neutral-400 dark:text-neutral-500">
                      <span>Low</span>
                      <span>High</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={similarity}
                      onChange={(e) => setSimilarity(Number(e.target.value))}
                      className="w-full accent-neutral-900 dark:accent-neutral-100 h-1.5 bg-neutral-200 dark:bg-neutral-800 rounded-lg cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Optional Delete Character Button */}
            {onDeleteCharacter && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={async () => {
                    if (confirm(`Delete character "${activeCharacter.name}"?`)) {
                      await onDeleteCharacter(activeCharacter.id);
                      setCurrentView("list");
                      showNotification(`Deleted ${activeCharacter.name}`);
                    }
                  }}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                >
                  <RiDeleteBinLine className="h-3.5 w-3.5" />
                  <span>Delete Character</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* VIEW 3: VOICE CASTING VIEW                               */}
      {/* ========================================================= */}
      {currentView === "casting" && activeCharacter && (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {/* Breadcrumb Header */}
          <div className="h-12 px-3 flex items-center gap-1.5 border-b border-transparent shrink-0">
            <button
              type="button"
              onClick={() => setCurrentView("list")}
              className="text-xs font-medium text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors cursor-pointer"
            >
              Characters
            </button>
            <RiArrowRightSLine className="h-3 w-3 text-neutral-400 dark:text-neutral-600 shrink-0" />
            <button
              type="button"
              onClick={() => setCurrentView("detail")}
              className="text-xs font-medium text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors cursor-pointer truncate max-w-[80px]"
            >
              {activeCharacter.name}
            </button>
            <RiArrowRightSLine className="h-3 w-3 text-neutral-400 dark:text-neutral-600 shrink-0" />
            <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 truncate">
              Voice casting
            </span>
          </div>

          <div className="flex-1 min-h-0 flex flex-col overflow-y-auto p-3 space-y-3">
            {/* Preview Line Section */}
            <div className="space-y-1 shrink-0">
              <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300 border-b border-dotted border-neutral-400 dark:border-neutral-500 pb-0.5 cursor-help">
                Preview line
              </span>
              <input
                type="text"
                value={previewLine}
                onChange={(e) => setPreviewLine(e.target.value)}
                placeholder="Add a preview line to hear voices say it..."
                className="w-full text-xs px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#121316] text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-600 outline-none focus:border-neutral-900 dark:focus:border-white transition-colors shadow-2xs"
              />
            </div>

            {/* Explore vs My Voices Tabs */}
            <div className="flex items-center border-b border-neutral-200/80 dark:border-white/6 shrink-0">
              <button
                type="button"
                onClick={() => setCastingTab("explore")}
                className={cn(
                  "flex-1 py-2 text-xs font-semibold flex items-center justify-center gap-1.5 border-b-2 -mb-px transition-colors cursor-pointer",
                  castingTab === "explore"
                    ? "border-neutral-900 dark:border-white text-neutral-900 dark:text-white"
                    : "border-transparent text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300",
                )}
              >
                <RiVolumeUpLine className="h-3.5 w-3.5" />
                <span>Explore</span>
              </button>
              <button
                type="button"
                onClick={() => setCastingTab("my_voices")}
                className={cn(
                  "flex-1 py-2 text-xs font-semibold flex items-center justify-center gap-1.5 border-b-2 -mb-px transition-colors cursor-pointer",
                  castingTab === "my_voices"
                    ? "border-neutral-900 dark:border-white text-neutral-900 dark:text-white"
                    : "border-transparent text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300",
                )}
              >
                <span>My Voices</span>
              </button>
            </div>

            {/* Search Input */}
            <div className="relative flex items-center shrink-0">
              <RiSearchLine className="absolute left-2.5 h-3.5 w-3.5 text-neutral-400 pointer-events-none" />
              <input
                type="text"
                value={castingSearch}
                onChange={(e) => setCastingSearch(e.target.value)}
                placeholder="Start typing to search..."
                className="w-full text-xs pl-8 pr-3 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/80 dark:bg-neutral-900/50 text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 outline-none focus:border-neutral-900 dark:focus:border-white transition-colors"
              />
              {castingSearch && (
                <button
                  type="button"
                  onClick={() => setCastingSearch("")}
                  className="absolute right-2 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 p-0.5 cursor-pointer"
                >
                  <RiCloseLine className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Filter Pills & Sort Row */}
            <div className="flex items-center gap-1.5 flex-wrap shrink-0">
              {/* Collection Dropdown */}
              <NativeSelect
                size="sm"
                value={selectedCollection}
                onChange={(e) => setSelectedCollection(e.target.value)}
              >
                <NativeSelectOption value="all">Collection</NativeSelectOption>
                <NativeSelectOption value="ElevenLabs">ElevenLabs</NativeSelectOption>
                <NativeSelectOption value="Standard">Standard</NativeSelectOption>
                <NativeSelectOption value="Community">Community</NativeSelectOption>
              </NativeSelect>

              {/* Category / Type Dropdown */}
              <NativeSelect
                size="sm"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                <NativeSelectOption value="all">Type</NativeSelectOption>
                <NativeSelectOption value="Narration">Narration</NativeSelectOption>
                <NativeSelectOption value="Conversational">Conversational</NativeSelectOption>
                <NativeSelectOption value="Characters">Characters</NativeSelectOption>
                <NativeSelectOption value="Expressive">Expressive</NativeSelectOption>
                <NativeSelectOption value="News">News</NativeSelectOption>
              </NativeSelect>

              {/* Sort Toggle Button */}
              <button
                type="button"
                onClick={() => {
                  setSortOrder((prev) =>
                    prev === "latest" ? "alpha_asc" : prev === "alpha_asc" ? "alpha_desc" : "latest",
                  );
                }}
                className="ml-auto h-7 w-7 rounded-lg border border-neutral-200/80 dark:border-white/[0.08] bg-neutral-50/80 dark:bg-neutral-900/60 text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white flex items-center justify-center transition-colors cursor-pointer shadow-2xs"
                title={`Sort: ${sortOrder}`}
              >
                <RiEqualizerLine className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Voices List */}
            <div className="space-y-1 pt-1 flex-1">
              {filteredVoices.map((voice) => {
                const isAssigned =
                  activeCharacter.assigned_voice_id === voice.id ||
                  activeCharacter.assigned_voice_name === voice.title ||
                  activeCharacter.assigned_voice_name === voice.name;
                const isPlaying = playingVoiceId === voice.id;

                return (
                  <div
                    key={voice.id}
                    onClick={() => handleAssignVoice(voice)}
                    className={cn(
                      "flex items-center justify-between p-2 rounded-xl transition-colors cursor-pointer group",
                      isAssigned
                        ? "bg-neutral-100/90 dark:bg-white/[0.08]"
                        : "hover:bg-neutral-100/50 dark:hover:bg-white/[0.03]",
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
                      {/* Voice Sound Avatar: DiceBear Glass */}
                      <SoundAvatar
                        seed={voice.id}
                        className="w-7 h-7 rounded-lg shrink-0 shadow-2xs"
                      />

                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                          {voice.title}
                        </p>
                        <p className="text-[11px] text-neutral-400 dark:text-neutral-500 truncate">
                          {voice.description}
                        </p>
                      </div>
                    </div>

                    {/* Actions: Selected Checkmark, Play button, More */}
                    <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {isAssigned && (
                        <RiCheckboxCircleFill className="h-4 w-4 text-neutral-900 dark:text-white mr-1" />
                      )}

                      {/* Play Preview Button */}
                      <button
                        type="button"
                        onClick={() => handleTogglePlayVoice(voice)}
                        className="p-1 rounded-full text-neutral-400 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-200/60 dark:hover:bg-white/[0.1] transition-colors cursor-pointer"
                        title={isPlaying ? "Pause" : "Play preview"}
                      >
                        {isPlaying ? (
                          <RiPauseFill className="h-3.5 w-3.5 text-primary" />
                        ) : (
                          <RiPlayFill className="h-3.5 w-3.5" />
                        )}
                      </button>

                      {/* Options menu */}
                      <button
                        type="button"
                        onClick={() => handleAssignVoice(voice)}
                        className="p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors cursor-pointer"
                        title="Assign voice"
                      >
                        <RiMoreFill className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CharacterPanel;
