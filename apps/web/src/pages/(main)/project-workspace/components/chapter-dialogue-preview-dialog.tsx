import { useState, useMemo } from "react";
import {
  RiFileCopyLine,
  RiCheckLine,
  RiSearchLine,
  RiChat1Line,
  RiFilter3Line,
} from "@remixicon/react";
import type { ScriptSegment } from "@novelova/shared-types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollFade } from "@/components/ui/scroll-fade";

interface ChapterDialoguePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chapterNumber: number;
  chapterTitle: string;
  segments: ScriptSegment[];
  onCopied?: () => void;
}

export function ChapterDialoguePreviewDialog({
  open,
  onOpenChange,
  chapterNumber,
  chapterTitle,
  segments,
  onCopied,
}: ChapterDialoguePreviewDialogProps) {
  const [search, setSearch] = useState("");
  const [format, setFormat] = useState<"standard" | "with_emotions" | "quotes_only">("standard");
  const [viewMode, setViewMode] = useState<"visual" | "raw">("visual");
  const [copied, setCopied] = useState(false);

  // Filter only dialogue lines
  const dialogueSegments = useMemo(
    () => segments.filter((s) => s.is_dialogue),
    [segments],
  );

  // Search filtered dialogue segments
  const filteredSegments = useMemo(() => {
    if (!search.trim()) return dialogueSegments;
    const lower = search.toLowerCase();
    return dialogueSegments.filter(
      (s) =>
        (s.speaker && s.speaker.toLowerCase().includes(lower)) ||
        s.text.toLowerCase().includes(lower) ||
        (s.emotion && s.emotion.toLowerCase().includes(lower)),
    );
  }, [dialogueSegments, search]);

  // Construct formatted export text based on chosen format
  const formattedText = useMemo(() => {
    return dialogueSegments
      .map((s) => {
        const speaker = s.speaker || "Unknown";
        if (format === "quotes_only") {
          return s.text;
        }
        if (format === "with_emotions") {
          const emotionTag = s.emotion ? ` ${s.emotion}` : "";
          return `${speaker}${emotionTag}: ${s.text}`;
        }
        // standard format
        return `${speaker}: ${s.text}`;
      })
      .join("\n\n");
  }, [dialogueSegments, format]);

  const spokenWordCount = useMemo(() => {
    return dialogueSegments.reduce(
      (acc, s) => acc + s.text.trim().split(/\s+/).filter(Boolean).length,
      0,
    );
  }, [dialogueSegments]);

  const handleCopy = () => {
    navigator.clipboard.writeText(formattedText);
    setCopied(true);
    if (onCopied) onCopied();
    setTimeout(() => {
      setCopied(false);
    }, 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] p-0 overflow-hidden rounded-2xl border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black shadow-2xl flex flex-col">
        {/* Header */}
        <div className="p-6 pb-4 border-b border-neutral-100 dark:border-neutral-800 shrink-0">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-xl font-bold font-serif text-neutral-900 dark:text-neutral-100 tracking-tight flex items-center gap-2">
              <span className="h-6 w-6 rounded-lg bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 flex items-center justify-center text-xs font-mono font-bold">
                <RiChat1Line className="h-3.5 w-3.5" />
              </span>
              <span>Dialogue Preview</span>
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400">
              Chapter {chapterNumber}: {chapterTitle} · {dialogueSegments.length} dialogue lines · ~{spokenWordCount} spoken words
            </DialogDescription>
          </DialogHeader>

          {/* Controls Bar: Search & Format Switcher */}
          <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            {/* Search filter */}
            <div className="relative w-full sm:w-64">
              <RiSearchLine className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter lines or speaker..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 text-xs text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-hidden focus:ring-1 focus:ring-neutral-400"
              />
            </div>

            {/* Format & View Mode Switchers */}
            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              {/* Format selection */}
              <div className="flex items-center rounded-lg border border-neutral-200 dark:border-neutral-800 p-0.5 bg-neutral-50 dark:bg-neutral-900 text-[11px] font-medium">
                <button
                  type="button"
                  onClick={() => setFormat("standard")}
                  className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                    format === "standard"
                      ? "bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 shadow-2xs font-semibold"
                      : "text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
                  }`}
                  title="Speaker: &quot;Quote&quot;"
                >
                  Standard
                </button>
                <button
                  type="button"
                  onClick={() => setFormat("with_emotions")}
                  className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                    format === "with_emotions"
                      ? "bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 shadow-2xs font-semibold"
                      : "text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
                  }`}
                  title="Speaker [emotion]: &quot;Quote&quot;"
                >
                  With Emotion
                </button>
                <button
                  type="button"
                  onClick={() => setFormat("quotes_only")}
                  className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                    format === "quotes_only"
                      ? "bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 shadow-2xs font-semibold"
                      : "text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
                  }`}
                  title="Quotes only"
                >
                  Quotes Only
                </button>
              </div>

              {/* View Toggle */}
              <div className="flex items-center rounded-lg border border-neutral-200 dark:border-neutral-800 p-0.5 bg-neutral-50 dark:bg-neutral-900 text-[11px] font-medium">
                <button
                  type="button"
                  onClick={() => setViewMode("visual")}
                  className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                    viewMode === "visual"
                      ? "bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 shadow-2xs font-semibold"
                      : "text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
                  }`}
                >
                  Cards
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("raw")}
                  className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                    viewMode === "raw"
                      ? "bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 shadow-2xs font-semibold"
                      : "text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
                  }`}
                >
                  Raw
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Body Content */}
        <ScrollFade className="flex-1 overflow-y-auto min-h-[300px] max-h-[50vh] p-6 bg-neutral-50/50 dark:bg-neutral-950/50">
          {viewMode === "raw" ? (
            <textarea
              readOnly
              value={formattedText}
              className="w-full h-full min-h-[280px] p-4 font-mono text-xs leading-relaxed bg-white dark:bg-black rounded-xl border border-neutral-200 dark:border-neutral-800 text-neutral-800 dark:text-neutral-200 resize-none focus:outline-hidden select-text"
            />
          ) : filteredSegments.length === 0 ? (
            <div className="py-16 text-center text-neutral-400">
              <RiFilter3Line className="h-8 w-8 mx-auto opacity-50 mb-2" />
              <p className="text-xs">No dialogue segments matching your filter.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredSegments.map((seg, idx) => (
                <div
                  key={seg.id || idx}
                  className="p-3.5 rounded-xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-black shadow-2xs space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md bg-neutral-100 dark:bg-neutral-800 text-neutral-500">
                        #{idx + 1}
                      </span>
                      <span className="text-xs font-bold text-neutral-900 dark:text-neutral-100">
                        {seg.speaker || "Unassigned"}
                      </span>
                      {seg.speaker_gender && (
                        <span className="text-[10px] capitalize px-1.5 py-0.2 rounded-full border border-neutral-200 dark:border-neutral-700 text-neutral-500">
                          {seg.speaker_gender}
                        </span>
                      )}
                    </div>

                    {seg.emotion && format === "with_emotions" && (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                        {seg.emotion}
                      </span>
                    )}
                  </div>

                  <p className="text-xs sm:text-sm text-neutral-800 dark:text-neutral-200 font-serif leading-relaxed italic">
                    {seg.text}
                  </p>
                </div>
              ))}
            </div>
          )}
        </ScrollFade>

        {/* Footer */}
        <div className="p-4 px-6 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between bg-white dark:bg-black shrink-0">
          <div className="text-xs text-neutral-500 font-medium">
            {dialogueSegments.length} line(s) ready to copy
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="px-3.5 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs font-semibold text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 cursor-pointer"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-2 px-4 py-1.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-neutral-200 text-white dark:text-neutral-900 text-xs font-semibold shadow-xs cursor-pointer active:scale-98 transition-all"
            >
              {copied ? (
                <>
                  <RiCheckLine className="h-3.5 w-3.5 text-emerald-500" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <RiFileCopyLine className="h-3.5 w-3.5" />
                  <span>Copy to Clipboard</span>
                </>
              )}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
