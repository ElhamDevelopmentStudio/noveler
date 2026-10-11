import { useState, useMemo } from "react";
import {
  RiSparklingLine,
  RiPlayFill,
  RiArrowRightLine,
  RiLoader4Line,
  RiBookOpenLine,
  RiInformationLine,
  RiFlashlightLine,
} from "@remixicon/react";
import type { Chapter, TaggingJobOptionsDto } from "@novelova/shared-types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface TaggingConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chapters: Chapter[];
  activeChapterId?: string;
  onConfirmTagging: (options: TaggingJobOptionsDto) => Promise<void> | void;
}

export function TaggingConfigDialog({
  open,
  onOpenChange,
  chapters,
  activeChapterId,
  onConfirmTagging,
}: TaggingConfigDialogProps) {
  const [scope, setScope] = useState<"all" | "active" | "range">("all");
  const [startChapter, setStartChapter] = useState<number>(1);
  const [endChapter, setEndChapter] = useState<number>(Math.max(1, chapters.length));
  const [force, setForce] = useState<boolean>(false);
  const [allowOfflineHeuristic, setAllowOfflineHeuristic] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const activeChapter = useMemo(
    () => chapters.find((c) => c.id === activeChapterId) || chapters[0],
    [chapters, activeChapterId],
  );

  const targetedChapters = useMemo(() => {
    if (scope === "all") return chapters;
    if (scope === "active") return activeChapter ? [activeChapter] : [];
    if (scope === "range") {
      const minNum = Math.min(startChapter, endChapter);
      const maxNum = Math.max(startChapter, endChapter);
      return chapters.filter(
        (c) => c.chapter_number >= minNum && c.chapter_number <= maxNum,
      );
    }
    return chapters;
  }, [scope, chapters, activeChapter, startChapter, endChapter]);

  const handleStart = async () => {
    setIsSubmitting(true);
    try {
      const options: TaggingJobOptionsDto = {
        resume: !force,
        force,
        allow_offline_heuristic: allowOfflineHeuristic,
      };

      if (scope === "active" && activeChapter) {
        options.chapter_ids = [activeChapter.id];
      } else if (scope === "range") {
        options.start_chapter = Math.min(startChapter, endChapter);
        options.end_chapter = Math.max(startChapter, endChapter);
      }

      await onConfirmTagging(options);
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-0 overflow-hidden rounded-2xl border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black shadow-2xl">
        <div className="p-6 pb-4">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-xl font-bold font-serif text-neutral-900 dark:text-neutral-100 tracking-tight flex items-center gap-2">
              <span className="h-6 w-6 rounded-lg bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 flex items-center justify-center text-xs font-mono font-bold">
                B
              </span>
              <span>Dialogue Attribution (Stage B)</span>
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400">
              Run character dialogue attribution, emotion cues, and voice casting preparation.
            </DialogDescription>
          </DialogHeader>

          {/* Scope Selector */}
          <div className="mt-5 space-y-3">
            <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
              Tagging Scope
            </label>

            <div className="grid grid-cols-3 gap-2.5">
              {/* Option: All Chapters */}
              <button
                type="button"
                onClick={() => setScope("all")}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  scope === "all"
                    ? "border-neutral-900 dark:border-neutral-100 bg-neutral-50 dark:bg-neutral-900/80 shadow-2xs"
                    : "border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50/60 dark:hover:bg-neutral-900/40"
                }`}
              >
                <div className="flex items-center justify-between">
                  <RiBookOpenLine className="h-4 w-4 text-neutral-500" />
                  {scope === "all" && (
                    <span className="h-2 w-2 rounded-full bg-neutral-900 dark:bg-neutral-100" />
                  )}
                </div>
                <div className="mt-2">
                  <div className="text-xs font-bold text-neutral-900 dark:text-neutral-100">
                    All Chapters
                  </div>
                  <div className="text-[10px] text-neutral-500">
                    {chapters.length} chapters
                  </div>
                </div>
              </button>

              {/* Option: Active Chapter */}
              <button
                type="button"
                onClick={() => setScope("active")}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  scope === "active"
                    ? "border-neutral-900 dark:border-neutral-100 bg-neutral-50 dark:bg-neutral-900/80 shadow-2xs"
                    : "border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50/60 dark:hover:bg-neutral-900/40"
                }`}
              >
                <div className="flex items-center justify-between">
                  <RiPlayFill className="h-4 w-4 text-neutral-500" />
                  {scope === "active" && (
                    <span className="h-2 w-2 rounded-full bg-neutral-900 dark:bg-neutral-100" />
                  )}
                </div>
                <div className="mt-2">
                  <div className="text-xs font-bold text-neutral-900 dark:text-neutral-100 truncate">
                    Active Chapter
                  </div>
                  <div className="text-[10px] text-neutral-500 truncate">
                    Ch {activeChapter?.chapter_number || 1}
                  </div>
                </div>
              </button>

              {/* Option: Chapter Range */}
              <button
                type="button"
                onClick={() => setScope("range")}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  scope === "range"
                    ? "border-neutral-900 dark:border-neutral-100 bg-neutral-50 dark:bg-neutral-900/80 shadow-2xs"
                    : "border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50/60 dark:hover:bg-neutral-900/40"
                }`}
              >
                <div className="flex items-center justify-between">
                  <RiSparklingLine className="h-4 w-4 text-neutral-500" />
                  {scope === "range" && (
                    <span className="h-2 w-2 rounded-full bg-neutral-900 dark:bg-neutral-100" />
                  )}
                </div>
                <div className="mt-2">
                  <div className="text-xs font-bold text-neutral-900 dark:text-neutral-100">
                    Chapter Range
                  </div>
                  <div className="text-[10px] text-neutral-500">
                    Custom range
                  </div>
                </div>
              </button>
            </div>

            {/* Custom Range Inputs */}
            {scope === "range" && (
              <div className="p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-900/50 flex items-center gap-3">
                <div className="flex-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                    From Chapter
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={chapters.length}
                    value={startChapter}
                    onChange={(e) => setStartChapter(parseInt(e.target.value) || 1)}
                    className="w-full mt-1 p-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-black text-xs font-mono font-bold"
                  />
                </div>
                <span className="text-neutral-400 mt-4 text-sm font-bold">to</span>
                <div className="flex-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                    To Chapter
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={chapters.length}
                    value={endChapter}
                    onChange={(e) => setEndChapter(parseInt(e.target.value) || chapters.length)}
                    className="w-full mt-1 p-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-black text-xs font-mono font-bold"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Strategy & Options */}
          <div className="mt-5 space-y-3">
            <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
              Execution Strategy
            </label>

            <div className="divide-y divide-neutral-100 dark:divide-neutral-800 border-y border-neutral-100 dark:border-neutral-800">
              {/* Force Re-tag Toggle */}
              <div
                onClick={() => setForce(!force)}
                className="py-3 flex items-center justify-between cursor-pointer hover:bg-neutral-50/60 dark:hover:bg-neutral-900/40 px-1 rounded-lg transition-colors"
              >
                <div>
                  <div className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                    {force ? "Re-tag all segments (Overwrite)" : "Resume untagged segments only"}
                  </div>
                  <div className="text-[11px] text-neutral-500">
                    {force
                      ? "Discards existing speaker tags in the selection and re-infers fresh."
                      : "Skips already tagged lines to minimize token usage and protect existing work."}
                  </div>
                </div>
                <div
                  role="switch"
                  aria-checked={force}
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 ${
                    force
                      ? "bg-neutral-900 dark:bg-neutral-100"
                      : "bg-neutral-200 dark:bg-neutral-800"
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white dark:bg-neutral-900 shadow-2xs transition-transform duration-200 ${
                      force ? "translate-x-4.5" : "translate-x-1"
                    }`}
                  />
                </div>
              </div>

              {/* Offline Heuristic Toggle */}
              <div
                onClick={() => setAllowOfflineHeuristic(!allowOfflineHeuristic)}
                className="py-3 flex items-center justify-between cursor-pointer hover:bg-neutral-50/60 dark:hover:bg-neutral-900/40 px-1 rounded-lg transition-colors"
              >
                <div>
                  <div className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
                    <RiFlashlightLine className="h-3.5 w-3.5 text-amber-500" />
                    <span>Run offline heuristics (Zero LLM cost)</span>
                  </div>
                  <div className="text-[11px] text-neutral-500">
                    Fast rule-based regex tagger without calling DeepSeek API.
                  </div>
                </div>
                <div
                  role="switch"
                  aria-checked={allowOfflineHeuristic}
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 ${
                    allowOfflineHeuristic
                      ? "bg-neutral-900 dark:bg-neutral-100"
                      : "bg-neutral-200 dark:bg-neutral-800"
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white dark:bg-neutral-900 shadow-2xs transition-transform duration-200 ${
                      allowOfflineHeuristic ? "translate-x-4.5" : "translate-x-1"
                    }`}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Callout Info */}
          <div className="flex items-center gap-2 mt-4 text-[11px] text-neutral-500 dark:text-neutral-400">
            <RiInformationLine className="h-4 w-4 shrink-0 text-neutral-400" />
            <span>
              Targeting {targetedChapters.length} chapter(s). Tagging runs in background with live progress updates.
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 bg-neutral-50/80 dark:bg-black border-t border-neutral-100 dark:border-neutral-800">
          <span className="text-xs text-neutral-500 font-medium">
            {targetedChapters.length} of {chapters.length} chapters selected
          </span>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs font-semibold text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleStart}
              disabled={isSubmitting || targetedChapters.length === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-neutral-200 dark:text-neutral-900 text-white text-xs font-semibold shadow-xs cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <RiLoader4Line className="h-3.5 w-3.5 animate-spin" />
                  <span>Starting...</span>
                </>
              ) : (
                <>
                  <span>Start Tagging</span>
                  <RiArrowRightLine className="h-3.5 w-3.5" />
                </>
              )}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
