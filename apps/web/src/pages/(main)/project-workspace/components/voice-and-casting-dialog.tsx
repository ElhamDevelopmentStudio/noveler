import { useState, useMemo, useEffect } from "react";
import {
  RiSearchLine,
  RiCloseLine,
  RiVolumeUpLine,
  RiGroupLine,
  RiCheckLine,
  RiLoader4Line,
} from "@remixicon/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Character, Project } from "@novelova/shared-types";
import {
  batchAssignVoices,
  setDefaultsByGender,
} from "@/services/character-and-pronunciation";

interface VoiceAndCastingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
  characters: Character[];
  onSaved?: () => void;
}

const AVAILABLE_VOICES = [
  { id: "elena-park", name: "Elena Park", gender: "female" },
  { id: "female-general", name: "Female General", gender: "female" },
  { id: "male-general", name: "Male General", gender: "male" },
  { id: "gritty-baritone", name: "Gritty Baritone", gender: "male" },
  { id: "soft-scholar", name: "Soft Spoken Scholar", gender: "male" },
  { id: "british-matron", name: "British Matron", gender: "female" },
];

function getInitials(name: string): string {
  const parts = name.split(" ");
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function VoiceAndCastingDialog({
  open,
  onOpenChange,
  project,
  characters: initialCharacters,
  onSaved,
}: VoiceAndCastingDialogProps) {
  const [characterList, setCharacterList] = useState<Character[]>(initialCharacters);
  const [search, setSearch] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setCharacterList(initialCharacters);
  }, [initialCharacters]);

  const filteredCharacters = useMemo(() => {
    if (!search.trim()) return characterList;
    const lower = search.toLowerCase();
    return characterList.filter(
      (c) =>
        c.name.toLowerCase().includes(lower) ||
        (c.role_description && c.role_description.toLowerCase().includes(lower)),
    );
  }, [characterList, search]);

  const displayedCharacters = useMemo(() => {
    if (search.trim() || isExpanded) return filteredCharacters;
    return filteredCharacters.slice(0, 5);
  }, [filteredCharacters, search, isExpanded]);

  const handleVoiceChange = (charId: string, voiceId: string) => {
    const voice = AVAILABLE_VOICES.find((v) => v.id === voiceId);
    if (!voice) return;

    setCharacterList((prev) =>
      prev.map((c) =>
        c.id === charId
          ? {
              ...c,
              assigned_voice_id: voice.id,
              assigned_voice_name: voice.name,
            }
          : c,
      ),
    );
  };

  const handleSetDefaultsByGender = async () => {
    try {
      const updated = await setDefaultsByGender(project.id);
      setCharacterList(updated);
    } catch {
      // Fallback local update
      setCharacterList((prev) =>
        prev.map((c) => ({
          ...c,
          assigned_voice_id:
            c.gender === "narrator"
              ? "elena-park"
              : c.gender === "female"
                ? "female-general"
                : "male-general",
          assigned_voice_name:
            c.gender === "narrator"
              ? "Elena Park"
              : c.gender === "female"
                ? "Female General"
                : "Male General",
        })),
      );
    }
  };

  const handleResetAll = () => {
    setCharacterList((prev) =>
      prev.map((c) => ({
        ...c,
        assigned_voice_id: null,
        assigned_voice_name: null,
      })),
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const assignments = characterList
        .filter((c) => c.assigned_voice_id && c.assigned_voice_name)
        .map((c) => ({
          character_id: c.id,
          assigned_voice_id: c.assigned_voice_id!,
          assigned_voice_name: c.assigned_voice_name!,
        }));

      await batchAssignVoices(project.id, assignments);
      onSaved?.();
      onOpenChange(false);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to save casting");
    } finally {
      setIsSaving(false);
    }
  };

  const allAssigned = characterList.every((c) => Boolean(c.assigned_voice_id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden rounded-2xl border-neutral-200">
        <div className="p-6 pb-4">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-xl font-bold font-serif text-neutral-900 tracking-tight">
              Voice & casting
            </DialogTitle>
          </DialogHeader>

          {/* Project Summary Banner */}
          <div className="flex items-center justify-between p-3.5 px-4 rounded-xl border border-neutral-200/80 bg-neutral-50/60 text-xs mb-5 select-none">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-600" />
              <span className="font-semibold text-neutral-900">Parsed:</span>
              <span className="text-neutral-700">
                {project.title} · {project.author || "Unknown Author"} · 24 chapters · 82,410 words
              </span>
            </div>
            <span className="text-neutral-400 text-[11px]">Last updated 12 minutes ago</span>
          </div>

          {/* Search & Set Defaults Toolbar */}
          <div className="flex items-center justify-between gap-4 mb-4 select-none">
            {/* Search Input */}
            <div className="relative w-72">
              <RiSearchLine className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search characters"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-8 py-1.5 text-xs rounded-xl border border-neutral-200 bg-white placeholder:text-neutral-400 text-neutral-900 focus:outline-hidden focus:border-neutral-900 shadow-2xs"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 p-0.5 rounded-full cursor-pointer"
                >
                  <RiCloseLine className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Set Defaults Actions */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-neutral-400">Set defaults:</span>
              <button
                type="button"
                onClick={handleSetDefaultsByGender}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-800 text-xs font-medium shadow-2xs transition-colors cursor-pointer"
              >
                <RiGroupLine className="h-3.5 w-3.5 text-neutral-500" />
                <span>By inferred gender</span>
              </button>
              <button
                type="button"
                onClick={handleResetAll}
                className="px-3 py-1.5 rounded-xl border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-600 hover:text-neutral-900 text-xs font-medium shadow-2xs transition-colors cursor-pointer"
              >
                Reset all
              </button>
            </div>
          </div>

          {/* Characters Table */}
          <div className="border border-neutral-100 rounded-xl overflow-hidden divide-y divide-neutral-100">
            {/* Table Header */}
            <div className="grid grid-cols-12 gap-3 p-3 bg-neutral-50/70 text-[11px] font-bold text-neutral-400 tracking-wider uppercase select-none">
              <div className="col-span-5">CHARACTER / ROLE</div>
              <div className="col-span-4">DIALOGUE</div>
              <div className="col-span-3">VOICE</div>
            </div>

            {/* Table Rows */}
            <div className="divide-y divide-neutral-100/90 max-h-[380px] overflow-y-auto">
              {displayedCharacters.map((char) => (
                <div
                  key={char.id}
                  className="grid grid-cols-12 gap-3 p-3 items-center hover:bg-neutral-50/50 transition-colors"
                >
                  {/* Character Avatar & Role */}
                  <div className="col-span-5 flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-full bg-neutral-100 border border-neutral-200 text-neutral-800 text-xs font-bold flex items-center justify-center shrink-0 select-none">
                      {getInitials(char.name)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-neutral-900 truncate">
                        {char.name}
                      </p>
                      <p className="text-[11px] text-neutral-400 truncate mt-0.5">
                        {char.role_description || "Secondary Character"}
                      </p>
                    </div>
                  </div>

                  {/* Dialogue Stats */}
                  <div className="col-span-4 text-xs text-neutral-600">
                    {char.dialogue_count > 0 ? (
                      <span>
                        {char.dialogue_count} dialogue lines · {char.chapters_span || "Chapters 1–24"}
                      </span>
                    ) : (
                      <span>All non-dialogue prose · {char.word_count.toLocaleString()} words</span>
                    )}
                  </div>

                  {/* Voice Selector Dropdown */}
                  <div className="col-span-3">
                    <div className="relative">
                      <select
                        value={char.assigned_voice_id || ""}
                        onChange={(e) => handleVoiceChange(char.id, e.target.value)}
                        className="w-full pl-8 pr-6 py-1.5 text-xs font-medium rounded-xl border border-neutral-200 bg-white text-neutral-900 hover:border-neutral-300 focus:outline-hidden focus:border-neutral-900 shadow-2xs cursor-pointer appearance-none truncate"
                      >
                        <option value="" disabled>
                          Select voice...
                        </option>
                        {AVAILABLE_VOICES.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                          </option>
                        ))}
                      </select>
                      <RiVolumeUpLine className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400 pointer-events-none" />
                      <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-400 text-[10px]">
                        ▼
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination / Expand footer */}
            {!search && characterList.length > 5 && (
              <div className="p-3 bg-neutral-50/50 flex items-center justify-between text-xs text-neutral-500 select-none">
                <span>
                  Showing {displayedCharacters.length} of {characterList.length} characters
                </span>
                <button
                  type="button"
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="font-semibold text-neutral-900 hover:underline cursor-pointer"
                >
                  {isExpanded
                    ? "Show fewer"
                    : `View ${characterList.length - 5} more characters`}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 bg-neutral-50/80 border-t border-neutral-100 select-none">
          <div className="flex items-center gap-2 text-xs font-medium text-neutral-700">
            {allAssigned ? (
              <>
                <div className="h-4 w-4 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <RiCheckLine className="h-3 w-3" />
                </div>
                <span>Narrator and all {characterList.length} characters have a voice</span>
              </>
            ) : (
              <span className="text-neutral-400">
                Assign voices to continue to production
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
              className="px-4 py-2 rounded-xl border border-neutral-200 bg-white text-xs font-semibold text-neutral-700 hover:bg-neutral-50 shadow-2xs cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer active:scale-98 disabled:opacity-70"
            >
              {isSaving ? (
                <>
                  <RiLoader4Line className="h-3.5 w-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>Save casting</span>
              )}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
