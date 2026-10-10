import { useState, useEffect, useMemo } from "react";
import {
  RiGitMergeLine,
  RiArrowRightLine,
  RiAlertLine,
  RiLoader4Line,
  RiChat1Line,
  RiBookOpenLine,
  RiVolumeUpLine,
  RiUserLine,
  RiCloseLine,
  RiErrorWarningLine,
} from "@remixicon/react";
import type {
  Character,
  CharacterMergePreviewResponse,
} from "@novelova/shared-types";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  getCharacterMergePreview,
  mergeCharacters,
} from "@/services/character-and-pronunciation";

interface CharacterMergeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  sourceCharacter: Character | null;
  initialTargetCharacterId?: string;
  allCharacters: Character[];
  onMerged?: () => void;
}

export function CharacterMergeModal({
  open,
  onOpenChange,
  projectId,
  sourceCharacter,
  initialTargetCharacterId = "",
  allCharacters,
  onMerged,
}: CharacterMergeModalProps) {
  const [selectedTargetId, setSelectedTargetId] = useState(initialTargetCharacterId);
  const [searchTarget, setSearchTarget] = useState("");
  const [preview, setPreview] = useState<CharacterMergePreviewResponse | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isMerging, setIsMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [showAllSamples, setShowAllSamples] = useState(false);

  // Sync initial target when modal opens or initialTarget changes
  useEffect(() => {
    if (open) {
      setSelectedTargetId(initialTargetCharacterId || "");
      setIsConfirmed(false);
      setMergeError(null);
      setSearchTarget("");
      setShowAllSamples(false);
    }
  }, [open, initialTargetCharacterId]);

  // Candidate targets (exclude source, system, narrator, general)
  const candidateTargets = useMemo(() => {
    if (!sourceCharacter) return [];
    return allCharacters.filter(
      (c) =>
        c.id !== sourceCharacter.id &&
        !c.is_general &&
        !c.is_system &&
        c.slug !== "narrator" &&
        c.name.toLowerCase().includes(searchTarget.toLowerCase().trim()),
    );
  }, [allCharacters, sourceCharacter, searchTarget]);

  const targetCharacter = useMemo(() => {
    return allCharacters.find((c) => c.id === selectedTargetId) || null;
  }, [allCharacters, selectedTargetId]);

  // Fetch merge preview from backend whenever source or target selection changes
  useEffect(() => {
    if (!open || !sourceCharacter) {
      setPreview(null);
      return;
    }

    let isCancelled = false;
    async function fetchPreview() {
      try {
        setLoadingPreview(true);
        setPreviewError(null);
        const data = await getCharacterMergePreview(
          projectId,
          sourceCharacter!.id,
          selectedTargetId || undefined,
        );
        if (!isCancelled) {
          setPreview(data);
        }
      } catch (err) {
        if (!isCancelled) {
          console.error("Failed to fetch merge preview:", err);
          setPreviewError(
            err instanceof Error ? err.message : "Failed to load merge preview",
          );
        }
      } finally {
        if (!isCancelled) {
          setLoadingPreview(false);
        }
      }
    }

    fetchPreview();

    return () => {
      isCancelled = true;
    };
  }, [open, projectId, sourceCharacter, selectedTargetId]);

  const handleConfirmMerge = async () => {
    if (!sourceCharacter || !selectedTargetId || !isConfirmed) return;
    setIsMerging(true);
    setMergeError(null);
    try {
      await mergeCharacters(projectId, {
        source_character_id: sourceCharacter.id,
        target_character_id: selectedTargetId,
      });
      onOpenChange(false);
      onMerged?.();
    } catch (err) {
      console.error("Failed to execute character merge:", err);
      setMergeError(
        err instanceof Error ? err.message : "Failed to merge character",
      );
    } finally {
      setIsMerging(false);
    }
  };

  if (!sourceCharacter) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4.5 border-b border-neutral-200/80 dark:border-neutral-800 flex items-center justify-between shrink-0 bg-neutral-50/50 dark:bg-neutral-900/30">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center justify-center">
              <RiGitMergeLine className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
                Merge Character Roster
              </DialogTitle>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Reassign dialogue, consolidate aliases, and remove redundant actor entities.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            <RiCloseLine className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Side-by-Side Character Comparison Transfer Cards */}
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-center gap-3">
            {/* Source Character Card */}
            <div className="p-4 rounded-xl border border-rose-200 dark:border-rose-900/40 bg-rose-50/40 dark:bg-rose-950/20 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold tracking-wider uppercase text-rose-600 dark:text-rose-400">
                  Source (To Delete)
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300">
                  {sourceCharacter.gender}
                </span>
              </div>
              <div>
                <p className="font-semibold text-neutral-900 dark:text-neutral-100 text-sm">
                  {sourceCharacter.name}
                </p>
                <p className="text-neutral-500 dark:text-neutral-400 text-xs mt-0.5">
                  {sourceCharacter.dialogue_count} line(s) · {sourceCharacter.word_count || 0} words
                </p>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-neutral-600 dark:text-neutral-400">
                <RiVolumeUpLine className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
                <span className="truncate">
                  {sourceCharacter.assigned_voice_name
                    ? `Voice: ${sourceCharacter.assigned_voice_name}`
                    : "No voice assigned"}
                </span>
              </div>
            </div>

            {/* Transfer Direction Indicator */}
            <div className="flex items-center justify-center p-1 text-neutral-400 dark:text-neutral-500">
              <div className="w-8 h-8 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center">
                <RiArrowRightLine className="h-4 w-4" />
              </div>
            </div>

            {/* Target Character Card */}
            <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold tracking-wider uppercase text-emerald-600 dark:text-emerald-400">
                  Target (Canonical)
                </span>
                {targetCharacter && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300">
                    {targetCharacter.gender}
                  </span>
                )}
              </div>
              <div>
                <p className="font-semibold text-neutral-900 dark:text-neutral-100 text-sm truncate">
                  {targetCharacter ? targetCharacter.name : "Select Target Below"}
                </p>
                <p className="text-neutral-500 dark:text-neutral-400 text-xs mt-0.5">
                  {targetCharacter
                    ? `${targetCharacter.dialogue_count} existing lines + ${preview?.affected_segments_count ?? 0} = ${(targetCharacter.dialogue_count ?? 0) + (preview?.affected_segments_count ?? 0)} lines`
                    : "Choose character to absorb dialogue"}
                </p>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-neutral-600 dark:text-neutral-400">
                <RiVolumeUpLine className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
                <span className="truncate">
                  {targetCharacter?.assigned_voice_name
                    ? `Voice: ${targetCharacter.assigned_voice_name}`
                    : sourceCharacter.assigned_voice_name
                      ? `Will inherit: ${sourceCharacter.assigned_voice_name}`
                      : "No voice assigned"}
                </span>
              </div>
            </div>
          </div>

          {/* Target Character Selector Dropdown */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 flex items-center justify-between">
              <span>Choose Canonical Target Character</span>
              {candidateTargets.length > 5 && (
                <span className="text-[11px] font-normal text-neutral-400">
                  {candidateTargets.length} candidates
                </span>
              )}
            </label>
            <div className="relative">
              <select
                value={selectedTargetId}
                onChange={(e) => setSelectedTargetId(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-medium text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-neutral-100 cursor-pointer"
              >
                <option value="">-- Select Canonical Character --</option>
                {candidateTargets.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.dialogue_count} lines, {c.gender})
                    {c.assigned_voice_name ? ` · Voice: ${c.assigned_voice_name}` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Impact Stats Grid */}
          {loadingPreview ? (
            <div className="p-4 rounded-xl border border-neutral-200/80 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/30 flex items-center justify-center gap-2 text-xs text-neutral-500">
              <RiLoader4Line className="h-4 w-4 animate-spin text-neutral-400" />
              <span>Analyzing affected segments and story chapters...</span>
            </div>
          ) : preview ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2.5">
                <div className="p-3 rounded-xl border border-neutral-200/80 dark:border-neutral-800 bg-neutral-50/60 dark:bg-neutral-900/40 text-center">
                  <div className="flex items-center justify-center gap-1 text-neutral-400 mb-1">
                    <RiChat1Line className="h-3.5 w-3.5" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">
                      Lines
                    </span>
                  </div>
                  <p className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                    {preview.affected_segments_count}
                  </p>
                  <p className="text-[10px] text-neutral-400">Reassigned</p>
                </div>

                <div className="p-3 rounded-xl border border-neutral-200/80 dark:border-neutral-800 bg-neutral-50/60 dark:bg-neutral-900/40 text-center">
                  <div className="flex items-center justify-center gap-1 text-neutral-400 mb-1">
                    <RiUserLine className="h-3.5 w-3.5" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">
                      Words
                    </span>
                  </div>
                  <p className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                    {preview.affected_words_count}
                  </p>
                  <p className="text-[10px] text-neutral-400">Word count</p>
                </div>

                <div className="p-3 rounded-xl border border-neutral-200/80 dark:border-neutral-800 bg-neutral-50/60 dark:bg-neutral-900/40 text-center">
                  <div className="flex items-center justify-center gap-1 text-neutral-400 mb-1">
                    <RiBookOpenLine className="h-3.5 w-3.5" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">
                      Chapters
                    </span>
                  </div>
                  <p className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                    {preview.affected_chapters.length}
                  </p>
                  <p className="text-[10px] text-neutral-400">Affected</p>
                </div>
              </div>

              {/* Warnings List (if any) */}
              {preview.warnings.length > 0 && (
                <div className="p-3.5 rounded-xl border border-amber-300 dark:border-amber-800/60 bg-amber-50/70 dark:bg-amber-950/30 text-xs text-amber-900 dark:text-amber-200 space-y-1.5">
                  <div className="flex items-center gap-2 font-semibold">
                    <RiAlertLine className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span>Merge Warnings</span>
                  </div>
                  <ul className="list-disc list-inside space-y-1 pl-1 text-[11px] text-amber-800/90 dark:text-amber-300/90">
                    {preview.warnings.map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Affected Chapters Breakdown Pill List */}
              {preview.affected_chapters.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-400 uppercase tracking-wider">
                    Affected Chapters
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {preview.affected_chapters.map((chap) => (
                      <span
                        key={chap.id}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700/60"
                      >
                        <span>Ch. {chap.chapter_number}</span>
                        <span className="text-neutral-400">({chap.segment_count})</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Sample Dialogue Lines Preview */}
              {preview.sample_segments.length > 0 && (
                <div className="space-y-2 border border-neutral-200/80 dark:border-neutral-800 rounded-xl p-3 bg-neutral-50/30 dark:bg-neutral-900/20">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider flex items-center gap-1.5">
                      <RiChat1Line className="h-3.5 w-3.5 text-neutral-400" />
                      <span>Dialogue Snippet Preview</span>
                    </span>
                    <span className="text-[10px] text-neutral-400">
                      Showing {Math.min(showAllSamples ? preview.sample_segments.length : 3, preview.sample_segments.length)} of {preview.affected_segments_count} lines
                    </span>
                  </div>

                  <div className="space-y-2">
                    {(showAllSamples
                      ? preview.sample_segments
                      : preview.sample_segments.slice(0, 3)
                    ).map((seg) => (
                      <div
                        key={seg.id}
                        className="p-2.5 rounded-lg bg-white dark:bg-neutral-900 border border-neutral-200/60 dark:border-neutral-800 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between text-[10px] text-neutral-400">
                          <span className="font-semibold text-neutral-600 dark:text-neutral-300 truncate max-w-[280px]">
                            Ch. {seg.chapter_number}: {seg.chapter_title}
                          </span>
                          <span className="capitalize px-1.5 py-0.2 rounded bg-neutral-100 dark:bg-neutral-800 font-medium">
                            {seg.delivery_type}
                          </span>
                        </div>
                        <p className="text-neutral-800 dark:text-neutral-200 italic line-clamp-2">
                          &ldquo;{seg.text}&rdquo;
                        </p>
                      </div>
                    ))}
                  </div>

                  {preview.sample_segments.length > 3 && (
                    <button
                      type="button"
                      onClick={() => setShowAllSamples(!showAllSamples)}
                      className="text-[11px] text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 font-medium cursor-pointer"
                    >
                      {showAllSamples ? "Show fewer samples" : `Show all ${preview.sample_segments.length} sample lines...`}
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : previewError ? (
            <div className="p-3.5 rounded-xl border border-rose-300 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30 text-xs text-rose-800 dark:text-rose-200 flex items-center gap-2">
              <RiErrorWarningLine className="h-4 w-4 shrink-0 text-rose-500" />
              <span>{previewError}</span>
            </div>
          ) : null}

          {/* Merge Error Alert */}
          {mergeError && (
            <div className="p-3.5 rounded-xl border border-rose-300 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30 text-xs text-rose-800 dark:text-rose-200 flex items-center gap-2">
              <RiErrorWarningLine className="h-4 w-4 shrink-0 text-rose-500" />
              <span>{mergeError}</span>
            </div>
          )}

          {/* Required Confirmation Guard Checkbox */}
          <div className="pt-2">
            <label className="flex items-start gap-2.5 p-3 rounded-xl bg-neutral-50 dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-800 cursor-pointer">
              <Checkbox
                checked={isConfirmed}
                onCheckedChange={(checked) => setIsConfirmed(Boolean(checked))}
                className="mt-0.5"
              />
              <span className="text-xs text-neutral-700 dark:text-neutral-300 leading-snug">
                I understand this operation is permanent. All lines spoken by{" "}
                <strong>{sourceCharacter.name}</strong> will be reassigned to{" "}
                <strong>{targetCharacter ? targetCharacter.name : "the selected target"}</strong>, and{" "}
                <em>{sourceCharacter.name}</em> will be added to its aliases.
              </span>
            </label>
          </div>
        </div>

        {/* Action Footer */}
        <div className="px-6 py-4 border-t border-neutral-200/80 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/30 flex items-center justify-between shrink-0">
          <p className="text-[11px] text-neutral-400">
            {selectedTargetId
              ? isConfirmed
                ? "Ready to merge"
                : "Awaiting confirmation checkbox"
              : "Select a canonical target"}
          </p>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="px-4 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-semibold text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmMerge}
              disabled={!selectedTargetId || !isConfirmed || isMerging}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-neutral-200 text-white dark:text-neutral-900 text-xs font-semibold transition-colors shadow-2xs cursor-pointer disabled:opacity-40"
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
