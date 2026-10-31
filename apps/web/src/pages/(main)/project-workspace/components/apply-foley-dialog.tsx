import { useState, useEffect, useRef, useMemo } from "react";
import {
  RiVolumeUpLine,
  RiPlayFill,
  RiPauseFill,
  RiCloseLine,
  RiAddLine,
  RiCheckLine,
  RiLoader4Line,
  RiSparklingLine,
  RiSearchLine,
  RiCheckboxCircleLine,
  RiInformationLine,
} from "@remixicon/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollFade } from "@/components/ui/scroll-fade";
import { scanFoleyOccurrences, applyFoleyToNovel } from "@/services/sfx";
import type { FoleyOccurrence, SFXItem } from "@novelova/shared-types";
import { cn } from "@/lib/utils";

export interface ApplyFoleyDialogProps {
  item: SFXItem | null;
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplied?: () => void;
}

export function ApplyFoleyDialog({
  item,
  projectId,
  open,
  onOpenChange,
  onApplied,
}: ApplyFoleyDialogProps) {
  // Triggers tag management
  const [triggers, setTriggers] = useState<string[]>([]);
  const [newTriggerInput, setNewTriggerInput] = useState("");

  // Mode: "alongside" (reads word + plays foley) vs "replace" (strips word, plays foley only)
  const [action, setAction] = useState<"alongside" | "replace">("alongside");
  const [volume, setVolume] = useState<number>(1.0);

  // Scanning state
  const [isScanning, setIsScanning] = useState(false);
  const [occurrences, setOccurrences] = useState<FoleyOccurrence[]>([]);
  const [selectedSegmentIds, setSelectedSegmentIds] = useState<Set<string>>(new Set());
  const [filterQuery, setFilterQuery] = useState("");

  // Application state
  const [isApplying, setIsApplying] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Audition audio player
  const [isPlayingAudition, setIsPlayingAudition] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Initialize state when item changes or modal opens
  useEffect(() => {
    if (item && open) {
      const initialTriggers = item.triggers && item.triggers.length > 0
        ? [...item.triggers]
        : [item.name];
      setTriggers(initialTriggers);
      setVolume(item.default_volume ?? 1.0);
      setSuccessMessage(null);
      setErrorMessage(null);
      setSelectedSegmentIds(new Set());
      setFilterQuery("");

      // Automatically scan novel segments
      performScan(initialTriggers);
    } else {
      setOccurrences([]);
      setSelectedSegmentIds(new Set());
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setIsPlayingAudition(false);
    }
  }, [item?.id, open]);

  const performScan = async (searchTriggers: string[]) => {
    if (!item) return;
    setIsScanning(true);
    setErrorMessage(null);
    try {
      const res = await scanFoleyOccurrences(item.id, projectId, {
        triggers: searchTriggers,
      });
      setOccurrences(res.occurrences);
      // Default: select all matching occurrences
      setSelectedSegmentIds(new Set(res.occurrences.map((o) => o.segment_id)));
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to scan novel segments");
    } finally {
      setIsScanning(false);
    }
  };

  const handleAddTrigger = () => {
    const clean = newTriggerInput.trim();
    if (!clean) return;
    if (!triggers.includes(clean)) {
      const updated = [...triggers, clean];
      setTriggers(updated);
      setNewTriggerInput("");
      performScan(updated);
    } else {
      setNewTriggerInput("");
    }
  };

  const handleRemoveTrigger = (tToRemove: string) => {
    const updated = triggers.filter((t) => t !== tToRemove);
    setTriggers(updated);
    performScan(updated);
  };

  const toggleSelectSegment = (segmentId: string) => {
    setSelectedSegmentIds((prev) => {
      const next = new Set(prev);
      if (next.has(segmentId)) {
        next.delete(segmentId);
      } else {
        next.add(segmentId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedSegmentIds.size === filteredOccurrences.length) {
      setSelectedSegmentIds(new Set());
    } else {
      setSelectedSegmentIds(new Set(filteredOccurrences.map((o) => o.segment_id)));
    }
  };

  const toggleAudition = () => {
    if (!item?.audio_url) return;
    if (isPlayingAudition) {
      if (audioRef.current) audioRef.current.pause();
      setIsPlayingAudition(false);
    } else {
      if (audioRef.current) {
        audioRef.current.src = item.audio_url;
        audioRef.current.volume = volume;
        audioRef.current.play().then(() => setIsPlayingAudition(true)).catch(() => setIsPlayingAudition(false));
      }
    }
  };

  const handleApply = async () => {
    if (!item) return;
    if (selectedSegmentIds.size === 0) {
      setErrorMessage("Please select at least one line to apply this sound effect.");
      return;
    }

    setIsApplying(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const targetList = occurrences
        .filter((o) => selectedSegmentIds.has(o.segment_id))
        .map((o) => ({
          segment_id: o.segment_id,
          target_text: o.matched_text,
        }));

      const res = await applyFoleyToNovel(item.id, projectId, {
        triggers,
        action,
        targets: targetList,
        volume,
      });

      setSuccessMessage(res.message);
      if (onApplied) onApplied();

      // Refresh occurrences after apply
      await performScan(triggers);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to apply sound effect.");
    } finally {
      setIsApplying(false);
    }
  };

  const filteredOccurrences = useMemo(() => {
    if (!filterQuery.trim()) return occurrences;
    const q = filterQuery.toLowerCase();
    return occurrences.filter(
      (o) =>
        o.segment_text.toLowerCase().includes(q) ||
        o.chapter_title.toLowerCase().includes(q) ||
        (o.speaker && o.speaker.toLowerCase().includes(q)),
    );
  }, [occurrences, filterQuery]);

  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-full p-0 overflow-hidden rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#0c0d10] text-neutral-900 dark:text-neutral-100 shadow-2xl flex flex-col max-h-[90vh]">
        <audio
          ref={audioRef}
          onEnded={() => setIsPlayingAudition(false)}
          onError={() => setIsPlayingAudition(false)}
          className="hidden"
        />

        {/* Dialog Header */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-neutral-200/80 dark:border-white/[0.08] shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-950 flex items-center justify-center shrink-0 shadow-sm">
                <RiSparklingLine className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold text-neutral-900 dark:text-white">
                  Apply Foley in Novel
                </DialogTitle>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
                    {item.name}
                  </span>
                  <span className="text-[11px] text-neutral-400">•</span>
                  <span className="text-[11px] font-mono text-neutral-400">
                    {item.duration_seconds ? `${item.duration_seconds}s` : "Spot cue"}
                  </span>
                </div>
              </div>
            </div>

            {/* Audition Play Button */}
            <button
              type="button"
              onClick={toggleAudition}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800/80 text-xs font-medium transition-colors cursor-pointer"
            >
              {isPlayingAudition ? (
                <>
                  <RiPauseFill className="h-3.5 w-3.5 fill-current" />
                  <span>Pause Audition</span>
                </>
              ) : (
                <>
                  <RiPlayFill className="h-3.5 w-3.5 fill-current ml-0.5" />
                  <span>Audition Sound</span>
                </>
              )}
            </button>
          </div>
        </DialogHeader>

        {/* Dialog Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-5 min-h-0">
          {/* Section 1: Foley Sound Triggers (Onomatopoeia words) */}
          <div className="rounded-xl border border-neutral-200/80 dark:border-white/[0.08] bg-neutral-50/60 dark:bg-neutral-900/40 p-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
                <span>Sound Triggers & Onomatopoeia</span>
                <span className="text-[10.5px] font-normal text-neutral-400">
                  (Words in the novel that trigger this sound effect)
                </span>
              </label>
              <button
                type="button"
                onClick={() => performScan(triggers)}
                disabled={isScanning}
                className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer disabled:opacity-50"
              >
                {isScanning ? "Scanning..." : "Re-scan novel"}
              </button>
            </div>

            {/* Tag List */}
            <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
              {triggers.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-800 dark:text-neutral-200 shadow-2xs"
                >
                  <span className="font-mono">"{tag}"</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveTrigger(tag)}
                    className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 p-0.5 cursor-pointer"
                    title={`Remove "${tag}"`}
                  >
                    <RiCloseLine className="h-3 w-3" />
                  </button>
                </span>
              ))}

              {triggers.length === 0 && (
                <span className="text-xs text-neutral-400 italic">
                  No triggers configured. Add words below to find lines.
                </span>
              )}
            </div>

            {/* Add Tag Input */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={newTriggerInput}
                  onChange={(e) => setNewTriggerInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddTrigger();
                    }
                  }}
                  placeholder="e.g. Boom!, Boooom!, Baaam!!"
                  className="w-full px-3 py-1.5 rounded-lg text-xs bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400 dark:focus:ring-neutral-600"
                />
              </div>
              <button
                type="button"
                onClick={handleAddTrigger}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-100 text-white dark:text-neutral-950 text-xs font-medium transition-colors cursor-pointer shrink-0"
              >
                <RiAddLine className="h-3.5 w-3.5" />
                <span>Add Cue</span>
              </button>
            </div>
          </div>

          {/* Section 2: Mode Selector (Replace vs Play Alongside) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Option A: Play Alongside Reading */}
            <div
              onClick={() => setAction("alongside")}
              className={cn(
                "p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between",
                action === "alongside"
                  ? "border-neutral-900 dark:border-white bg-neutral-50/80 dark:bg-white/[0.04] shadow-2xs ring-1 ring-neutral-900 dark:ring-white"
                  : "border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700 bg-white dark:bg-neutral-900/30",
              )}
            >
              <div className="flex items-start gap-2.5">
                <input
                  type="radio"
                  name="foley_action"
                  checked={action === "alongside"}
                  onChange={() => setAction("alongside")}
                  className="mt-0.5 text-neutral-900 focus:ring-neutral-500 cursor-pointer"
                />
                <div>
                  <div className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                    Play alongside reading
                  </div>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 leading-relaxed">
                    Narrator or character speaks the word, and the Foley sound effect is played alongside or right after.
                  </p>
                </div>
              </div>
              <div className="mt-3 pt-2 border-t border-neutral-200/60 dark:border-white/[0.04] text-[10.5px] font-mono text-neutral-500 dark:text-neutral-400">
                <span className="text-neutral-400 dark:text-neutral-500">Preview: </span>
                <span>Line: Knock, knock [FOLEY SOUND]</span>
              </div>
            </div>

            {/* Option B: Replace Word */}
            <div
              onClick={() => setAction("replace")}
              className={cn(
                "p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between",
                action === "replace"
                  ? "border-neutral-900 dark:border-white bg-neutral-50/80 dark:bg-white/[0.04] shadow-2xs ring-1 ring-neutral-900 dark:ring-white"
                  : "border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700 bg-white dark:bg-neutral-900/30",
              )}
            >
              <div className="flex items-start gap-2.5">
                <input
                  type="radio"
                  name="foley_action"
                  checked={action === "replace"}
                  onChange={() => setAction("replace")}
                  className="mt-0.5 text-neutral-900 focus:ring-neutral-500 cursor-pointer"
                />
                <div>
                  <div className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                    Replace word completely
                  </div>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 leading-relaxed">
                    The written sound word is removed from speech narration so TTS skips it, and only the Foley sound plays.
                  </p>
                </div>
              </div>
              <div className="mt-3 pt-2 border-t border-neutral-200/60 dark:border-white/[0.04] text-[10.5px] font-mono text-neutral-500 dark:text-neutral-400">
                <span className="text-neutral-400 dark:text-neutral-500">Preview: </span>
                <span>Line: [FOLEY SOUND ONLY]</span>
              </div>
            </div>
          </div>

          {/* Volume Control */}
          <div className="flex items-center gap-4 px-1">
            <div className="flex items-center gap-2 text-xs font-medium text-neutral-700 dark:text-neutral-300 shrink-0">
              <RiVolumeUpLine className="h-4 w-4 text-neutral-500" />
              <span>Playback Volume:</span>
              <span className="font-mono text-neutral-900 dark:text-neutral-100">
                {Math.round(volume * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0.1"
              max="1.0"
              step="0.05"
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="flex-1 accent-neutral-900 dark:accent-white h-1.5 bg-neutral-200 dark:bg-neutral-800 rounded-lg cursor-pointer"
            />
          </div>

          {/* Section 3: Occurrences in the Novel */}
          <div className="flex-1 flex flex-col min-h-0 border-t border-neutral-200/80 dark:border-white/[0.08] pt-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                  Novel Occurrences
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
                  {occurrences.length} found
                </span>
                {occurrences.length > 0 && (
                  <span className="text-[11px] text-neutral-400">
                    ({selectedSegmentIds.size} selected)
                  </span>
                )}
              </div>

              {occurrences.length > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="text-[11px] font-medium text-neutral-600 dark:text-neutral-300 hover:underline cursor-pointer"
                  >
                    {selectedSegmentIds.size === filteredOccurrences.length
                      ? "Deselect all"
                      : "Select all"}
                  </button>
                </div>
              )}
            </div>

            {/* Search Filter for occurrences */}
            {occurrences.length > 5 && (
              <div className="relative mb-2">
                <RiSearchLine className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400 pointer-events-none" />
                <input
                  type="text"
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                  placeholder="Filter lines or chapter..."
                  className="w-full pl-8 pr-3 py-1 rounded-md text-xs bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none"
                />
              </div>
            )}

            {/* Occurrences List */}
            <div className="rounded-xl border border-neutral-200/80 dark:border-white/[0.06] bg-neutral-50/50 dark:bg-neutral-900/40 overflow-hidden flex-1 max-h-56 min-h-[140px] flex flex-col">
              {isScanning ? (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                  <RiLoader4Line className="h-5 w-5 animate-spin text-neutral-400 mb-2" />
                  <span className="shimmer-text text-xs text-neutral-500">
                    Scanning manuscript chapters for triggers...
                  </span>
                </div>
              ) : filteredOccurrences.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                  <RiInformationLine className="h-5 w-5 text-neutral-400 mb-1.5" />
                  <span className="text-xs text-neutral-500">
                    {triggers.length === 0
                      ? "Add triggers above to search the novel."
                      : "No matching lines found for these triggers."}
                  </span>
                </div>
              ) : (
                <ScrollFade className="flex-1 overflow-y-auto divide-y divide-neutral-200/60 dark:divide-white/[0.04]">
                  {filteredOccurrences.map((occ) => {
                    const isSelected = selectedSegmentIds.has(occ.segment_id);

                    return (
                      <div
                        key={occ.segment_id}
                        onClick={() => toggleSelectSegment(occ.segment_id)}
                        className={cn(
                          "p-2.5 text-xs flex items-start gap-3 transition-colors cursor-pointer select-none",
                          isSelected
                            ? "bg-neutral-100/70 dark:bg-white/[0.06]"
                            : "hover:bg-neutral-100/40 dark:hover:bg-white/[0.02]",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectSegment(occ.segment_id)}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-0.5 rounded text-neutral-900 focus:ring-neutral-500 cursor-pointer"
                        />

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono text-[10px] text-neutral-500 dark:text-neutral-400 shrink-0 font-medium">
                              Ch. {occ.chapter_number} (#{occ.order_index})
                            </span>
                            {occ.speaker && (
                              <span className="text-[10px] font-semibold text-neutral-700 dark:text-neutral-300 truncate">
                                {occ.speaker}
                              </span>
                            )}
                            <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[9.5px] font-mono bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 shrink-0 ml-auto">
                              Matched: "{occ.matched_text}"
                            </span>
                            {occ.already_has_foley && (
                              <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[9.5px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0">
                                Applied ({occ.current_action || "foley"})
                              </span>
                            )}
                          </div>

                          <p className="text-xs text-neutral-800 dark:text-neutral-200 line-clamp-2 leading-relaxed">
                            {occ.segment_text}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </ScrollFade>
              )}
            </div>
          </div>

          {/* Feedback messages */}
          {errorMessage && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
              <RiInformationLine className="h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
              <RiCheckboxCircleLine className="h-4 w-4 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}
        </div>

        {/* Dialog Footer */}
        <div className="px-6 py-3.5 border-t border-neutral-200/80 dark:border-white/[0.08] bg-neutral-50/50 dark:bg-neutral-900/40 flex items-center justify-between shrink-0">
          <div className="text-xs text-neutral-500">
            {selectedSegmentIds.size} line{selectedSegmentIds.size === 1 ? "" : "s"} selected
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="px-3.5 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={isApplying || selectedSegmentIds.size === 0}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-100 text-white dark:text-neutral-950 text-xs font-semibold shadow-sm transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isApplying ? (
                <>
                  <RiLoader4Line className="h-3.5 w-3.5 animate-spin" />
                  <span>Applying to {selectedSegmentIds.size} lines...</span>
                </>
              ) : (
                <>
                  <RiCheckLine className="h-3.5 w-3.5" />
                  <span>
                    {action === "replace" ? "Replace in Novel" : "Apply to Novel"} ({selectedSegmentIds.size})
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ApplyFoleyDialog;
