import { useState } from "react";
import {
  RiSparklingLine,
  RiAlertLine,
  RiFlashlightLine,
  RiArrowRightLine,
  RiLoader4Line,
  RiInformationLine,
  RiRefreshLine,
} from "@remixicon/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface ChapterTagConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chapterNumber: number;
  chapterTitle: string;
  totalDialogueCount: number;
  taggedDialogueCount: number;
  onConfirm: (options: { force: boolean; allowOfflineHeuristic: boolean }) => Promise<void> | void;
}

export function ChapterTagConfirmDialog({
  open,
  onOpenChange,
  chapterNumber,
  chapterTitle,
  totalDialogueCount,
  taggedDialogueCount,
  onConfirm,
}: ChapterTagConfirmDialogProps) {
  const isAlreadyTagged = taggedDialogueCount > 0;
  const [strategy, setStrategy] = useState<"overwrite" | "resume">(
    isAlreadyTagged ? "overwrite" : "resume",
  );
  const [allowOfflineHeuristic, setAllowOfflineHeuristic] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleExecute = async () => {
    setIsSubmitting(true);
    try {
      await onConfirm({
        force: strategy === "overwrite",
        allowOfflineHeuristic,
      });
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden rounded-2xl border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black shadow-2xl">
        <div className="p-6 pb-4">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-xl font-bold font-serif text-neutral-900 dark:text-neutral-100 tracking-tight flex items-center gap-2">
              <span className={`h-6 w-6 rounded-lg flex items-center justify-center text-xs font-mono font-bold ${
                isAlreadyTagged
                  ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                  : "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
              }`}>
                {isAlreadyTagged ? (
                  <RiRefreshLine className="h-3.5 w-3.5" />
                ) : (
                  <RiSparklingLine className="h-3.5 w-3.5" />
                )}
              </span>
              <span>
                {isAlreadyTagged ? "Re-tag Chapter Dialogue" : "Tag Chapter Dialogue"}
              </span>
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400">
              Chapter {chapterNumber}: {chapterTitle}
            </DialogDescription>
          </DialogHeader>

          {/* Overwrite Warning Banner if already tagged */}
          {isAlreadyTagged ? (
            <div className="mt-4 p-3.5 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 space-y-2">
              <div className="flex items-start gap-2.5">
                <RiAlertLine className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                    Existing Attributions Detected
                  </div>
                  <div className="text-[11px] leading-relaxed text-amber-800/90 dark:text-amber-300/80">
                    This chapter currently has {taggedDialogueCount} of {totalDialogueCount} dialogue lines tagged. Running attribution will overwrite previous speaker assignments, emotion cues, and delivery modes with fresh model inferences.
                  </div>
                </div>
              </div>

              {/* Mode Selection */}
              <div className="pt-2 border-t border-amber-200/60 dark:border-amber-900/40 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setStrategy("overwrite")}
                  className={`p-2 rounded-lg border text-left transition-all cursor-pointer ${
                    strategy === "overwrite"
                      ? "border-amber-600 bg-white dark:bg-neutral-900 shadow-2xs font-semibold"
                      : "border-transparent hover:bg-amber-100/50 dark:hover:bg-amber-900/30 text-neutral-600 dark:text-neutral-400 font-normal"
                  }`}
                >
                  <div className="text-xs text-neutral-900 dark:text-neutral-100">
                    Overwrite All
                  </div>
                  <div className="text-[10px] text-neutral-500 truncate">
                    Re-infer whole chapter
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setStrategy("resume")}
                  className={`p-2 rounded-lg border text-left transition-all cursor-pointer ${
                    strategy === "resume"
                      ? "border-neutral-900 dark:border-neutral-100 bg-white dark:bg-neutral-900 shadow-2xs font-semibold"
                      : "border-transparent hover:bg-amber-100/50 dark:hover:bg-amber-900/30 text-neutral-600 dark:text-neutral-400 font-normal"
                  }`}
                >
                  <div className="text-xs text-neutral-900 dark:text-neutral-100">
                    Resume Only
                  </div>
                  <div className="text-[10px] text-neutral-500 truncate">
                    Keep existing tags
                  </div>
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-4 p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-900/50">
              <div className="flex items-start gap-2.5">
                <RiInformationLine className="h-4 w-4 text-neutral-500 shrink-0 mt-0.5" />
                <div className="text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
                  Ready to attribute <span className="font-semibold text-neutral-900 dark:text-neutral-100">{totalDialogueCount}</span> dialogue segments in Chapter {chapterNumber}. Speakers, emotions, and delivery modes will be detected and synchronized.
                </div>
              </div>
            </div>
          )}

          {/* Offline Heuristic Toggle */}
          <div className="mt-4 pt-3 border-t border-neutral-100 dark:border-neutral-800">
            <div
              onClick={() => setAllowOfflineHeuristic(!allowOfflineHeuristic)}
              className="flex items-center justify-between cursor-pointer hover:bg-neutral-50/60 dark:hover:bg-neutral-900/40 p-1.5 rounded-lg transition-colors"
            >
              <div>
                <div className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
                  <RiFlashlightLine className="h-3.5 w-3.5 text-amber-500" />
                  <span>Run offline heuristics (Zero LLM cost)</span>
                </div>
                <div className="text-[10px] text-neutral-500">
                  Fast regex rule-based attribution without DeepSeek API calls.
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

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 bg-neutral-50/80 dark:bg-black border-t border-neutral-100 dark:border-neutral-800">
          <span className="text-[11px] text-neutral-500 font-medium">
            {totalDialogueCount} dialogue line(s)
          </span>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
              className="px-3.5 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs font-semibold text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleExecute}
              disabled={isSubmitting}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-xl text-xs font-semibold shadow-xs cursor-pointer disabled:opacity-50 ${
                isAlreadyTagged && strategy === "overwrite"
                  ? "bg-amber-600 hover:bg-amber-700 text-white"
                  : "bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-neutral-200 text-white dark:text-neutral-900"
              }`}
            >
              {isSubmitting ? (
                <>
                  <RiLoader4Line className="h-3.5 w-3.5 animate-spin" />
                  <span>Starting...</span>
                </>
              ) : (
                <>
                  <span>
                    {isAlreadyTagged
                      ? strategy === "overwrite"
                        ? "Force Re-tag"
                        : "Resume Tagging"
                      : "Start Tagging"}
                  </span>
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
