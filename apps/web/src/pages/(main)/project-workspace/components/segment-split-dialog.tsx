import { useState, useEffect, useMemo } from "react";
import {
  RiScissorsCutLine,
  RiCloseLine,
  RiLoader4Line,
} from "@remixicon/react";
import type { ScriptSegment } from "@novelova/shared-types";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

interface SegmentSplitDialogProps {
  segment: ScriptSegment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmSplit: (segmentId: string, splitIndex: number) => Promise<void>;
}

export function SegmentSplitDialog({
  segment,
  open,
  onOpenChange,
  onConfirmSplit,
}: SegmentSplitDialogProps) {
  const text = segment?.text || "";
  const [splitIndex, setSplitIndex] = useState<number>(() => Math.floor(text.length / 2));
  const [splitting, setSplitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (text) {
      // Find a natural sentence break or punctuation near the middle if possible
      const mid = Math.floor(text.length / 2);
      let bestIndex = mid;
      const candidates = [". ", "? ", "! ", ", ", "; "];
      for (const cand of candidates) {
        const found = text.indexOf(cand, Math.floor(mid * 0.5));
        if (found !== -1 && found < Math.floor(mid * 1.5)) {
          bestIndex = found + cand.length;
          break;
        }
      }
      setSplitIndex(Math.max(1, Math.min(bestIndex, text.length - 1)));
      setError(null);
    }
  }, [text, open]);

  const leftPart = useMemo(() => text.slice(0, splitIndex), [text, splitIndex]);
  const rightPart = useMemo(() => text.slice(splitIndex), [text, splitIndex]);

  const isValid =
    splitIndex > 0 &&
    splitIndex < text.length &&
    leftPart.trim().length > 0 &&
    rightPart.trim().length > 0;

  const handleTextClick = () => {
    // If user clicks within text, estimate character offset from click position
    const selection = window.getSelection();
    if (selection && selection.anchorOffset !== undefined && selection.anchorNode) {
      const clickedOffset = selection.anchorOffset;
      if (clickedOffset > 0 && clickedOffset < text.length) {
        setSplitIndex(clickedOffset);
      }
    }
  };

  const handleConfirm = async () => {
    if (!segment || !isValid) return;
    setSplitting(true);
    setError(null);
    try {
      await onConfirmSplit(segment.id, splitIndex);
      onOpenChange(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to split segment");
    } finally {
      setSplitting(false);
    }
  };

  if (!segment) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl p-0 gap-0 overflow-hidden rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-2xl">
        {/* Header */}
        <div className="px-6 py-5 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-800 dark:text-neutral-200">
              <RiScissorsCutLine className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 tracking-tight">
                Split Script Segment
              </DialogTitle>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Divide this dialogue or narrative segment into two distinct lines.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="p-1 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            <RiCloseLine className="h-4 w-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5">
          {error && (
            <div className="p-3 text-xs rounded-xl bg-destructive/10 text-destructive border border-destructive/20 font-medium">
              {error}
            </div>
          )}

          {/* Interactive Text Split Visualizer */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              Adjust Split Cursor (Char {splitIndex} of {text.length})
            </label>
            <div
              onClick={handleTextClick}
              className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-950/40 font-serif text-sm leading-relaxed select-text cursor-pointer"
            >
              <span className="bg-emerald-100 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-200 rounded px-1 py-0.5">
                {leftPart}
              </span>
              <span className="inline-block w-1.5 h-4 bg-primary mx-0.5 align-middle animate-pulse rounded-full" />
              <span className="bg-blue-100 dark:bg-blue-950/60 text-blue-900 dark:text-blue-200 rounded px-1 py-0.5">
                {rightPart}
              </span>
            </div>
          </div>

          {/* Slider Controls */}
          <div className="space-y-1">
            <input
              type="range"
              min={1}
              max={Math.max(1, text.length - 1)}
              value={splitIndex}
              onChange={(e) => setSplitIndex(Number(e.target.value))}
              className="w-full accent-neutral-900 dark:accent-neutral-100 cursor-pointer"
            />
            <div className="flex justify-between text-[11px] text-neutral-400 font-mono">
              <span>Start</span>
              <span>Position: {splitIndex}</span>
              <span>End ({text.length})</span>
            </div>
          </div>

          {/* Resulting Two Segments Preview */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <div className="p-3 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-1">
              <span className="text-[10px] font-bold tracking-wider text-emerald-700 dark:text-emerald-400 uppercase">
                First Segment
              </span>
              <p className="text-xs text-neutral-800 dark:text-neutral-200 font-serif line-clamp-3">
                {leftPart.trim() || "<empty>"}
              </p>
            </div>

            <div className="p-3 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/40 dark:bg-blue-950/20 space-y-1">
              <span className="text-[10px] font-bold tracking-wider text-blue-700 dark:text-blue-400 uppercase">
                Second Segment
              </span>
              <p className="text-xs text-neutral-800 dark:text-neutral-200 font-serif line-clamp-3">
                {rightPart.trim() || "<empty>"}
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-950/50 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={splitting}
            className="px-4 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-xs font-semibold text-neutral-700 dark:text-neutral-300 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={splitting || !isValid}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-neutral-200 text-white dark:text-neutral-900 text-xs font-semibold transition-colors disabled:opacity-40 cursor-pointer shadow-2xs"
          >
            {splitting ? (
              <>
                <RiLoader4Line className="h-3.5 w-3.5 animate-spin" />
                <span>Splitting...</span>
              </>
            ) : (
              <>
                <RiScissorsCutLine className="h-3.5 w-3.5" />
                <span>Split into 2 Segments</span>
              </>
            )}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
