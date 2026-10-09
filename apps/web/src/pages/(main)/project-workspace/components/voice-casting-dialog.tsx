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
  RiGitMergeLine,
  RiSparklingLine,
} from "@remixicon/react";
import type { Character, CharacterAliasSuggestion } from "@novelova/shared-types";
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
  mergeCharacters,
  getAliasSuggestions,
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
  { id: "system-chime", name: "System Chime", gender: "neutral" },
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

  // Merge Character State
  const [aliasSuggestions, setAliasSuggestions] = useState<CharacterAliasSuggestion[]>([]);
  const [mergeModalOpen, setMergeModalOpen] = useState(false);
  const [mergeSourceChar, setMergeSourceChar] = useState<Character | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [isMerging, setIsMerging] = useState(false);

  const loadData = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const data = await getCharacters(projectId);
      setCharacters(data.characters || []);
      const suggestions = await getAliasSuggestions(projectId);
      setAliasSuggestions(suggestions || []);
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

  const openMergeModal = (char: Character) => {
    setMergeSourceChar(char);
    const suggestedTarget = aliasSuggestions.find(
      (s) => s.source_character_id === char.id,
    );
    setMergeTargetId(suggestedTarget ? suggestedTarget.target_character_id : "");
    setMergeModalOpen(true);
  };

  const handleConfirmMerge = async () => {
    if (!mergeSourceChar || !mergeTargetId) return;
    setIsMerging(true);
    try {
      await mergeCharacters(projectId, {
        source_character_id: mergeSourceChar.id,
        target_character_id: mergeTargetId,
      });
      setMergeModalOpen(false);
      setMergeSourceChar(null);
      setMergeTargetId("");
      await loadData();
      onSaved?.();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to merge character");
    } finally {
      setIsMerging(false);
    }
  };

  const handleQuickMerge = async (suggestion: CharacterAliasSuggestion) => {
    setIsMerging(true);
    try {
      await mergeCharacters(projectId, {
        source_character_id: suggestion.source_character_id,
        target_character_id: suggestion.target_character_id,
      });
      await loadData();
      onSaved?.();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to merge character");
    } finally {
      setIsMerging(false);
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
      <DialogContent className="max-w-3xl p-0 overflow-hidden rounded-2xl border-neutral-200/90 dark:border-neutral-800 shadow-2xl bg-white dark:bg-black sm:max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4.5 border-b border-neutral-200/80 dark:border-neutral-800">
          <DialogTitle className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
            Voice & casting
          </DialogTitle>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            <RiCloseLine className="h-5 w-5" />
          </button>
        </div>

        {/* Toolbar Controls */}
        <div className="px-6 py-3.5 bg-neutral-50/60 dark:bg-black border-b border-neutral-200/70 dark:border-neutral-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Search */}
          <div className="relative w-full sm:w-72">
            <RiSearchLine className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search characters"
              className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-neutral-100 shadow-2xs"
            />
          </div>

          {/* Quick Defaults & Reset */}
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <span className="text-xs text-neutral-500 dark:text-neutral-400 font-medium select-none">
              Set defaults:
            </span>
            <button
              type="button"
              onClick={handleSetDefaultsByGender}
              disabled={loading || characters.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
            >
              <RiGroupLine className="h-3.5 w-3.5 text-neutral-500 dark:text-neutral-400" />
              <span>By inferred gender</span>
            </button>
            <button
              type="button"
              onClick={handleResetAll}
              disabled={loading || characters.length === 0}
              className="px-3 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
            >
              Reset all
            </button>
          </div>
        </div>

        {/* Smart Alias Suggestions Banner */}
        {aliasSuggestions.length > 0 && (
          <div className="mx-6 mt-3 p-3 rounded-xl border border-primary/20 bg-primary/5 dark:bg-primary/10 flex items-center justify-between gap-4 animate-in fade-in">
            <div className="flex items-center gap-2.5 text-xs text-neutral-800 dark:text-neutral-200">
              <RiSparklingLine className="h-4 w-4 text-primary shrink-0" />
              <div>
                <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                  Potential Alias Detected:
                </span>{" "}
                <span>
                  Merge &ldquo;{aliasSuggestions[0].source_name}&rdquo; into &ldquo;{aliasSuggestions[0].target_name}&rdquo;?
                </span>
                <span className="text-neutral-500 text-[11px] block mt-0.5">
                  {aliasSuggestions[0].reason}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={isMerging}
                onClick={() => handleQuickMerge(aliasSuggestions[0])}
                className="px-3 py-1 text-xs font-semibold rounded-lg bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 hover:opacity-90 transition-opacity cursor-pointer shadow-2xs"
              >
                {isMerging ? "Merging..." : "Merge Now"}
              </button>
              <button
                type="button"
                onClick={() => setAliasSuggestions((prev) => prev.slice(1))}
                className="px-2 py-1 text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Table Content */}
        <div className="flex-1 overflow-y-auto min-h-[300px] max-h-[500px]">
          {loading && characters.length === 0 ? (
            <div className="py-20 text-center space-y-2">
              <RiLoader4Line className="h-6 w-6 animate-spin mx-auto text-neutral-400" />
              <p className="text-xs text-neutral-500 dark:text-neutral-400">Loading characters...</p>
            </div>
          ) : characters.length === 0 ? (
            <div className="py-20 text-center space-y-3 px-6">
              <div className="w-10 h-10 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-400 flex items-center justify-center mx-auto">
                <RiGroupLine className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                No characters found yet
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 max-w-sm mx-auto">
                Characters will appear here automatically once dialogue parsing and attribution have been completed.
              </p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-neutral-200/80 dark:border-neutral-800 bg-neutral-50/40 dark:bg-neutral-950/40 text-[11px] font-semibold uppercase tracking-wider text-neutral-400 select-none">
                  <th className="py-3 px-6 font-medium">Character / Role</th>
                  <th className="py-3 px-6 font-medium">Dialogue</th>
                  <th className="py-3 px-6 font-medium text-right">Voice</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/80 text-xs">
                {filteredCharacters.map((char) => {
                  const isNarrator = char.slug === "narrator" || char.name.toLowerCase() === "narrator";
                  return (
                    <tr
                      key={char.id}
                      className="hover:bg-neutral-50/70 dark:hover:bg-neutral-800/50 transition-colors group"
                    >
                      {/* Character / Role */}
                      <td className="py-3 px-6 align-middle">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 font-bold text-xs flex items-center justify-center shrink-0 border border-neutral-200/70 dark:border-neutral-700">
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
                                  className="px-2 py-0.5 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-semibold text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-neutral-100"
                                />
                                <button
                                  type="button"
                                  onClick={() => commitRename(char)}
                                  className="text-[11px] text-neutral-700 dark:text-neutral-300 font-semibold hover:underline"
                                >
                                  Save
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                                  {char.name}
                                </span>
                                {!isNarrator && (
                                  <button
                                    type="button"
                                    onClick={() => startRename(char)}
                                    title="Rename character (updates all spoken lines)"
                                    className="opacity-0 group-hover:opacity-100 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-opacity p-0.5 cursor-pointer"
                                  >
                                    <RiEditLine className="h-3 w-3" />
                                  </button>
                                )}
                                {!isNarrator && !char.is_system && (
                                  <button
                                    type="button"
                                    onClick={() => openMergeModal(char)}
                                    title="Merge character into canonical (alias resolver)"
                                    className="opacity-0 group-hover:opacity-100 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-opacity p-0.5 cursor-pointer ml-0.5"
                                  >
                                    <RiGitMergeLine className="h-3 w-3" />
                                  </button>
                                )}
                              </div>
                            )}
                            <p className="text-[11px] text-neutral-500 dark:text-neutral-400 capitalize">
                              {char.role_description ||
                                (isNarrator
                                  ? "Narration · Entire novel"
                                  : char.is_system
                                    ? "System alerts · LitRPG interface"
                                    : `${char.gender || "General"} · Character`)}
                            </p>
                            {char.aliases && char.aliases.length > 0 && (
                              <div className="flex items-center gap-1 mt-1 flex-wrap">
                                <span className="text-[9px] text-neutral-400 font-mono">Aliases:</span>
                                {char.aliases.map((alias) => (
                                  <span
                                    key={alias}
                                    className="text-[9px] font-mono px-1 py-0.2 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300"
                                  >
                                    {alias}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Dialogue Stats */}
                      <td className="py-3 px-6 align-middle text-neutral-600 dark:text-neutral-300">
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
                              className="pl-8 pr-7 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-medium text-neutral-900 dark:text-neutral-100 hover:bg-neutral-50 dark:hover:bg-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-neutral-100 shadow-2xs appearance-none cursor-pointer"
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
        <div className="px-6 py-4 border-t border-neutral-200/80 dark:border-neutral-800 bg-neutral-50/50 dark:bg-black flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Status Message */}
          <div className="flex items-center gap-2 text-xs">
            {allAssigned ? (
              <>
                <RiCheckboxCircleLine className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="text-neutral-700 dark:text-neutral-300 font-medium">
                  Narrator and all {characters.length - (characters.some((c) => c.slug === "narrator") ? 1 : 0)} characters have a voice
                </span>
              </>
            ) : characters.length > 0 ? (
              <>
                <RiAlertLine className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span className="text-neutral-700 dark:text-neutral-300">
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
              className="px-4 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs font-semibold text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={saving || characters.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-neutral-200 text-white dark:text-neutral-900 text-xs font-semibold transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
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

      {/* Merge Character Sub-Dialog */}
      <Dialog open={mergeModalOpen} onOpenChange={setMergeModalOpen}>
        <DialogContent className="sm:max-w-md p-0 overflow-hidden rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-2xl">
          <div className="px-6 py-5 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-800 dark:text-neutral-200">
                <RiGitMergeLine className="h-4 w-4" />
              </div>
              <div>
                <DialogTitle className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  Merge Character Roster
                </DialogTitle>
                <p className="text-xs text-neutral-500">
                  Resolve aliases, titles, and nicknames into a single canonical actor.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMergeModalOpen(false)}
              className="p-1 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 cursor-pointer"
            >
              <RiCloseLine className="h-4 w-4" />
            </button>
          </div>

          <div className="p-6 space-y-4">
            <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200/80 dark:border-neutral-800 text-xs space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                Source Character (Will be merged and removed)
              </span>
              <p className="font-semibold text-neutral-900 dark:text-neutral-100 text-sm">
                {mergeSourceChar?.name}
              </p>
              <p className="text-neutral-500 text-[11px]">
                {mergeSourceChar?.dialogue_count} spoken line(s) · {mergeSourceChar?.gender}
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Select Canonical Target Character
              </label>
              <select
                value={mergeTargetId}
                onChange={(e) => setMergeTargetId(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-medium text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-neutral-100 cursor-pointer"
              >
                <option value="">-- Choose Canonical Character --</option>
                {characters
                  .filter(
                    (c) =>
                      c.id !== mergeSourceChar?.id &&
                      !c.is_general &&
                      !c.is_system &&
                      c.slug !== "narrator",
                  )
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.dialogue_count} lines, {c.gender})
                    </option>
                  ))}
              </select>
            </div>

            <div className="p-3 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40 text-[11px] text-amber-900 dark:text-amber-200 leading-relaxed">
              <strong>What happens:</strong> All {mergeSourceChar?.dialogue_count} line(s) spoken by <em>{mergeSourceChar?.name}</em> will be reassigned to the chosen target. <em>{mergeSourceChar?.name}</em> will be added to the target&apos;s aliases.
            </div>
          </div>

          <div className="px-6 py-4 border-t border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-950/50 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setMergeModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold rounded-xl border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmMerge}
              disabled={!mergeTargetId || isMerging}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-neutral-200 text-white dark:text-neutral-900 disabled:opacity-40 cursor-pointer shadow-2xs"
            >
              {isMerging ? (
                <>
                  <RiLoader4Line className="h-3.5 w-3.5 animate-spin" />
                  <span>Merging...</span>
                </>
              ) : (
                <>
                  <RiGitMergeLine className="h-3.5 w-3.5" />
                  <span>Confirm Merge</span>
                </>
              )}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
