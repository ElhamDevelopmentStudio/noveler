import { useState, useMemo, useEffect } from "react";
import {
  RiCloseLine,
  RiSearchLine,
  RiGroupLine,
  RiCheckLine,
  RiVolumeUpLine,
  RiEditLine,
  RiCheckboxCircleLine,
  RiAlertLine,
  RiLoader4Line,
} from "@remixicon/react";
import type { Character } from "@novelova/shared-types";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getCharacters,
  updateCharacter,
  setDefaultsByGender,
  resetAllCast,
} from "@/services/character-and-pronunciation";

interface VoiceCastingDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export const CURATED_VOICES = [
  { id: "elena-park", name: "Elena Park", gender: "female" },
  { id: "female-general", name: "Female General", gender: "female" },
  { id: "male-general", name: "Male General", gender: "male" },
  { id: "george-vance", name: "George Vance", gender: "male" },
  { id: "clara-higgins", name: "Clara Higgins", gender: "female" },
  { id: "henry-ward", name: "Henry Ward", gender: "male" },
  { id: "sarah-jenkins", name: "Sarah Jenkins", gender: "female" },
  { id: "arthur-doyle", name: "Arthur Doyle", gender: "male" },
];

export function VoiceCastingDialog({
  projectId,
  open,
  onOpenChange,
  onSaved,
}: VoiceCastingDialogProps) {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingCharId, setEditingCharId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const loadData = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const data = await getCharacters(projectId);
      setCharacters(data.characters || []);
    } catch (err) {
      console.error("Failed to load characters", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open, projectId]);

  const filteredCharacters = useMemo(() => {
    if (!search.trim()) return characters;
    const term = search.toLowerCase();
    return characters.filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        (c.role_description && c.role_description.toLowerCase().includes(term)) ||
        (c.gender && c.gender.toLowerCase().includes(term)),
    );
  }, [characters, search]);

  const handleVoiceChange = (characterId: string, voiceName: string) => {
    const voiceObj = CURATED_VOICES.find((v) => v.name === voiceName);
    setCharacters((prev) =>
      prev.map((c) =>
        c.id === characterId
          ? {
              ...c,
              assigned_voice_name: voiceName || null,
              assigned_voice_id: voiceObj ? voiceObj.id : null,
            }
          : c,
      ),
    );
  };

  const handleSetDefaultsByGender = async () => {
    try {
      setLoading(true);
      const updated = await setDefaultsByGender(projectId);
      setCharacters(updated);
    } catch (err) {
      console.error("Failed to set defaults by gender", err);
      alert("Failed to assign default voices.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetAll = async () => {
    if (!window.confirm("Are you sure you want to reset all voice assignments?")) {
      return;
    }
    try {
      setLoading(true);
      const updated = await resetAllCast(projectId);
      setCharacters(updated);
    } catch (err) {
      console.error("Failed to reset voice assignments", err);
      alert("Failed to reset casting.");
    } finally {
      setLoading(false);
    }
  };

  const startRename = (char: Character) => {
    setEditingCharId(char.id);
    setEditingName(char.name);
  };

  const commitRename = async (char: Character) => {
    if (!editingName.trim() || editingName.trim() === char.name) {
      setEditingCharId(null);
      return;
    }
    const newName = editingName.trim();
    try {
      const updated = await updateCharacter(projectId, char.id, {
        name: newName,
      });
      setCharacters((prev) =>
        prev.map((c) => (c.id === char.id ? updated : c)),
      );
    } catch (err) {
      console.error("Failed to rename character", err);
      alert("Failed to rename character.");
    } finally {
      setEditingCharId(null);
    }
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      for (const char of characters) {
        await updateCharacter(projectId, char.id, {
          assigned_voice_name: char.assigned_voice_name,
          assigned_voice_id: char.assigned_voice_id,
        });
      }
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      console.error("Failed to save voice casting", err);
      alert("Failed to save voice casting.");
    } finally {
      setSaving(false);
    }
  };

  const unassignedCount = characters.filter((c) => !c.assigned_voice_name).length;
  const allAssigned = characters.length > 0 && unassignedCount === 0;

  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return (name.slice(0, 2) || "CH").toUpperCase();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden rounded-2xl border-neutral-200/90 shadow-2xl bg-white sm:max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4.5 border-b border-neutral-200/80">
          <DialogTitle className="text-lg font-semibold tracking-tight text-neutral-900">
            Voice & casting
          </DialogTitle>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors cursor-pointer"
          >
            <RiCloseLine className="h-5 w-5" />
          </button>
        </div>

        {/* Toolbar Controls */}
        <div className="px-6 py-3.5 bg-neutral-50/60 border-b border-neutral-200/70 flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Search */}
          <div className="relative w-full sm:w-72">
            <RiSearchLine className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search characters"
              className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-neutral-200 bg-white text-xs text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-900 shadow-2xs"
            />
          </div>

          {/* Quick Defaults & Reset */}
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <span className="text-xs text-neutral-500 font-medium select-none">
              Set defaults:
            </span>
            <button
              type="button"
              onClick={handleSetDefaultsByGender}
              disabled={loading || characters.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-neutral-200 bg-white text-xs font-medium text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900 shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
            >
              <RiGroupLine className="h-3.5 w-3.5 text-neutral-500" />
              <span>By inferred gender</span>
            </button>
            <button
              type="button"
              onClick={handleResetAll}
              disabled={loading || characters.length === 0}
              className="px-3 py-1.5 rounded-xl border border-neutral-200 bg-white text-xs font-medium text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900 shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
            >
              Reset all
            </button>
          </div>
        </div>

        {/* Table Content */}
        <div className="flex-1 overflow-y-auto min-h-[300px] max-h-[500px]">
          {loading && characters.length === 0 ? (
            <div className="py-20 text-center space-y-2">
              <RiLoader4Line className="h-6 w-6 animate-spin mx-auto text-neutral-400" />
              <p className="text-xs text-neutral-500">Loading characters...</p>
            </div>
          ) : characters.length === 0 ? (
            <div className="py-20 text-center space-y-3 px-6">
              <div className="w-10 h-10 rounded-full bg-neutral-100 text-neutral-400 flex items-center justify-center mx-auto">
                <RiGroupLine className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-semibold text-neutral-900">
                No characters found yet
              </h3>
              <p className="text-xs text-neutral-500 max-w-sm mx-auto">
                Characters will appear here automatically once dialogue parsing and attribution have been completed.
              </p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-neutral-200/80 bg-neutral-50/40 text-[11px] font-semibold uppercase tracking-wider text-neutral-400 select-none">
                  <th className="py-3 px-6 font-medium">Character / Role</th>
                  <th className="py-3 px-6 font-medium">Dialogue</th>
                  <th className="py-3 px-6 font-medium text-right">Voice</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 text-xs">
                {filteredCharacters.map((char) => {
                  const isNarrator = char.slug === "narrator" || char.name.toLowerCase() === "narrator";
                  return (
                    <tr
                      key={char.id}
                      className="hover:bg-neutral-50/70 transition-colors group"
                    >
                      {/* Character / Role */}
                      <td className="py-3 px-6 align-middle">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-neutral-100 text-neutral-700 font-bold text-xs flex items-center justify-center shrink-0 border border-neutral-200/70">
                            {getInitials(char.name)}
                          </div>
                          <div className="min-w-0">
                            {editingCharId === char.id ? (
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  value={editingName}
                                  onChange={(e) => setEditingName(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") commitRename(char);
                                    if (e.key === "Escape") setEditingCharId(null);
                                  }}
                                  autoFocus
                                  className="px-2 py-0.5 rounded border border-neutral-300 text-xs font-semibold text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
                                />
                                <button
                                  type="button"
                                  onClick={() => commitRename(char)}
                                  className="text-[11px] text-neutral-700 font-semibold hover:underline"
                                >
                                  Save
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-neutral-900 truncate">
                                  {char.name}
                                </span>
                                {!isNarrator && (
                                  <button
                                    type="button"
                                    onClick={() => startRename(char)}
                                    title="Rename character (updates all spoken lines)"
                                    className="opacity-0 group-hover:opacity-100 text-neutral-400 hover:text-neutral-700 transition-opacity p-0.5"
                                  >
                                    <RiEditLine className="h-3 w-3" />
                                  </button>
                                )}
                              </div>
                            )}
                            <p className="text-[11px] text-neutral-500 capitalize">
                              {char.role_description ||
                                (isNarrator
                                  ? "Narration · Entire novel"
                                  : `${char.gender || "General"} · Character`)}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Dialogue Stats */}
                      <td className="py-3 px-6 align-middle text-neutral-600">
                        {isNarrator ? (
                          <span>All non-dialogue prose · {char.word_count.toLocaleString()} words</span>
                        ) : (
                          <span>
                            {char.dialogue_count} dialogue line{char.dialogue_count !== 1 ? "s" : ""}
                            {char.chapters_span ? ` · Chapters ${char.chapters_span}` : ""}
                          </span>
                        )}
                      </td>

                      {/* Voice Selector */}
                      <td className="py-3 px-6 align-middle text-right">
                        <div className="inline-flex items-center justify-end">
                          <div className="relative">
                            <RiVolumeUpLine className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400 pointer-events-none" />
                            <select
                              value={char.assigned_voice_name || ""}
                              onChange={(e) => handleVoiceChange(char.id, e.target.value)}
                              className="pl-8 pr-7 py-1.5 rounded-xl border border-neutral-200 bg-white text-xs font-medium text-neutral-900 hover:bg-neutral-50 focus:outline-none focus:ring-1 focus:ring-neutral-900 shadow-2xs appearance-none cursor-pointer"
                            >
                              <option value="">Unassigned</option>
                              {CURATED_VOICES.map((v) => (
                                <option key={v.id} value={v.name}>
                                  {v.name}
                                </option>
                              ))}
                            </select>
                            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none text-[10px]">
                              ▼
                            </span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-neutral-200/80 bg-neutral-50/50 flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Status Message */}
          <div className="flex items-center gap-2 text-xs">
            {allAssigned ? (
              <>
                <RiCheckboxCircleLine className="h-4 w-4 text-emerald-600 shrink-0" />
                <span className="text-neutral-700 font-medium">
                  Narrator and all {characters.length - (characters.some((c) => c.slug === "narrator") ? 1 : 0)} characters have a voice
                </span>
              </>
            ) : characters.length > 0 ? (
              <>
                <RiAlertLine className="h-4 w-4 text-amber-600 shrink-0" />
                <span className="text-neutral-700">
                  {unassignedCount} character{unassignedCount !== 1 ? "s" : ""} need a voice
                </span>
              </>
            ) : (
              <span className="text-neutral-400">No characters to cast</span>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="px-4 py-2 rounded-xl border border-neutral-200 bg-white text-xs font-semibold text-neutral-700 hover:bg-neutral-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={saving || characters.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-neutral-900 text-white text-xs font-semibold hover:bg-neutral-800 transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
            >
              {saving ? (
                <RiLoader4Line className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RiCheckLine className="h-3.5 w-3.5" />
              )}
              <span>Save casting</span>
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
