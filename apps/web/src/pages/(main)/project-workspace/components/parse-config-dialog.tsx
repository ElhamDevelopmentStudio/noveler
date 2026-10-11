import { useState } from "react";
import {
  RiInformationLine,
  RiArrowRightLine,
  RiLoader4Line,
  RiSparklingLine,
  RiRefreshLine,
  RiShieldCheckLine,
  RiAlertLine,
} from "@remixicon/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { FormatOptionsDto } from "@novelova/shared-types";

export interface ParseOptions {
  removeWhitespace: boolean;
  normalizeParagraphs: boolean;
  separateSentenceWise: boolean;
  detectChapterHeadings: boolean;
  preserveItalics: boolean;
  fixPunctuationSpacing: boolean;
  speakUnambiguousNumbers: boolean;
  preserveExistingTags: boolean;
}

interface ParseConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filename: string;
  hasExistingChapters?: boolean;
  activeChapterId?: string;
  activeChapterTitle?: string;
  onConfirmParse?: (options: ParseOptions) => Promise<void> | void;
  onConfirmFormat?: (options: FormatOptionsDto) => Promise<void> | void;
}

export function ParseConfigDialog({
  open,
  onOpenChange,
  filename,
  hasExistingChapters = false,
  activeChapterId,
  activeChapterTitle,
  onConfirmParse,
  onConfirmFormat,
}: ParseConfigDialogProps) {
  const [mode, setMode] = useState<"format" | "reparse">(
    hasExistingChapters ? "format" : "reparse",
  );

  const [formatScope, setFormatScope] = useState<"all" | "active">("all");

  const [options, setOptions] = useState<ParseOptions>({
    removeWhitespace: true,
    normalizeParagraphs: true,
    separateSentenceWise: true,
    detectChapterHeadings: true,
    preserveItalics: true,
    fixPunctuationSpacing: true,
    speakUnambiguousNumbers: true,
    preserveExistingTags: true,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const toggleOption = (key: keyof ParseOptions) => {
    setOptions((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const enabledCount = Object.entries(options).filter(
    ([k, v]) => k !== "preserveExistingTags" && Boolean(v),
  ).length;

  const handleExecute = async () => {
    setIsSubmitting(true);
    try {
      if (hasExistingChapters && mode === "format") {
        if (onConfirmFormat) {
          await onConfirmFormat({
            remove_whitespace: options.removeWhitespace,
            normalize_paragraphs: options.normalizeParagraphs,
            fix_punctuation_spacing: options.fixPunctuationSpacing,
            speak_unambiguous_numbers: options.speakUnambiguousNumbers,
            normalize_dialogue_quotes: true,
            chapter_id: formatScope === "active" && activeChapterId ? activeChapterId : null,
          });
        }
      } else {
        if (onConfirmParse) {
          await onConfirmParse(options);
        }
      }
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const parseItems: Array<{
    key: keyof ParseOptions;
    label: string;
    description?: string;
  }> = [
    {
      key: "speakUnambiguousNumbers",
      label: "Convert numbers to spoken words (audio-ready via inflect)",
      description: "Turns plain digits into spelled words (e.g., '29' -> 'twenty-nine', '$100' -> 'one hundred dollars').",
    },
    {
      key: "fixPunctuationSpacing",
      label: "Fix common punctuation spacing & em-dashes",
      description: "Normalizes dashes to em-dashes and strips whitespace before punctuation.",
    },
    {
      key: "removeWhitespace",
      label: "Remove extra whitespace & invisible unicode",
      description: "Cleans non-breaking spaces and redundant tabs.",
    },
    {
      key: "normalizeParagraphs",
      label: "Normalize line and paragraph breaks",
      description: "Standardizes carriage returns and multiple empty lines.",
    },
    ...(mode === "reparse"
      ? [
          {
            key: "separateSentenceWise" as keyof ParseOptions,
            label: "Separate the novel sentence-wise",
            description: "Splits paragraphs into sentence segments for audio pacing.",
          },
          {
            key: "detectChapterHeadings" as keyof ParseOptions,
            label: "Detect chapter headings",
            description: "Automatically detects chapter dividers and titles from manuscript.",
          },
          {
            key: "preserveItalics" as keyof ParseOptions,
            label: "Preserve italics and emphasis",
            description: "Retains markdown-style formatting markers.",
          },
        ]
      : []),
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-0 overflow-hidden rounded-2xl border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black shadow-2xl">
        <div className="p-6 pb-4">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-xl font-bold font-serif text-neutral-900 dark:text-neutral-100 tracking-tight">
              {hasExistingChapters && mode === "format"
                ? "Format Script Segments"
                : "Parse & Format Manuscript"}
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400">
              {hasExistingChapters && mode === "format"
                ? "Clean text, format numbers to spoken words, and normalize punctuation in-place."
                : `Process source manuscript ${filename} into structured chapters.`}
            </DialogDescription>
          </DialogHeader>

          {/* Mode Switcher when chapters exist */}
          {hasExistingChapters && (
            <div className="mt-4 p-1 bg-neutral-100 dark:bg-neutral-900 rounded-xl grid grid-cols-2 gap-1">
              <button
                type="button"
                onClick={() => setMode("format")}
                className={`py-2 px-3 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  mode === "format"
                    ? "bg-white dark:bg-black text-neutral-900 dark:text-neutral-100 shadow-2xs font-bold"
                    : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
                }`}
              >
                <RiSparklingLine className="h-3.5 w-3.5" />
                <span>Format Script (Safe)</span>
              </button>

              <button
                type="button"
                onClick={() => setMode("reparse")}
                className={`py-2 px-3 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  mode === "reparse"
                    ? "bg-white dark:bg-black text-neutral-900 dark:text-neutral-100 shadow-2xs font-bold"
                    : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
                }`}
              >
                <RiRefreshLine className="h-3.5 w-3.5" />
                <span>Re-parse from Source</span>
              </button>
            </div>
          )}

          {/* Safe In-Place Banner */}
          {hasExistingChapters && mode === "format" && (
            <div className="mt-4 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/60 flex items-start gap-2.5 text-xs text-emerald-900 dark:text-emerald-200">
              <RiShieldCheckLine className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
              <div>
                <span className="font-semibold">Zero Attribution Loss:</span> Formatting runs directly on existing segments in-place. All character assignments, dialogue speakers, and emotions remain 100% intact.
              </div>
            </div>
          )}

          {/* Formatting Scope Selector */}
          {hasExistingChapters && mode === "format" && (
            <div className="mt-4 flex items-center gap-2">
              <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                Scope:
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setFormatScope("all")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                    formatScope === "all"
                      ? "bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 font-semibold"
                      : "bg-neutral-100 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200"
                  }`}
                >
                  All Chapters
                </button>
                {activeChapterTitle && (
                  <button
                    type="button"
                    onClick={() => setFormatScope("active")}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer transition-colors truncate max-w-[200px] ${
                      formatScope === "active"
                        ? "bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 font-semibold"
                        : "bg-neutral-100 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200"
                    }`}
                    title={activeChapterTitle}
                  >
                    Current Chapter ({activeChapterTitle})
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Re-parse Tag Preservation Toggle */}
          {hasExistingChapters && mode === "reparse" && (
            <div className="mt-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/60 flex items-start justify-between gap-3 text-xs text-amber-900 dark:text-amber-200">
              <div className="flex items-start gap-2">
                <RiAlertLine className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                <div>
                  <div className="font-semibold">Preserve Existing Dialogue Tags</div>
                  <div className="text-[11px] text-amber-800/80 dark:text-amber-300/80 mt-0.5">
                    Automatically matches already tagged dialogue lines to newly split segments so you don't lose character attributions.
                  </div>
                </div>
              </div>
              <div
                role="switch"
                aria-checked={options.preserveExistingTags}
                onClick={() => toggleOption("preserveExistingTags")}
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors cursor-pointer duration-200 ${
                  options.preserveExistingTags
                    ? "bg-amber-600 dark:bg-amber-500"
                    : "bg-neutral-300 dark:bg-neutral-700"
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white dark:bg-neutral-900 shadow-2xs transition-transform duration-200 ${
                    options.preserveExistingTags ? "translate-x-4.5" : "translate-x-1"
                  }`}
                />
              </div>
            </div>
          )}

          {/* Toggle Options List */}
          <div className="divide-y divide-neutral-100 dark:divide-neutral-800/80 mt-5 border-y border-neutral-100 dark:border-neutral-800/80 max-h-[300px] overflow-y-auto">
            {parseItems.map((item) => {
              const checked = options[item.key];
              return (
                <div
                  key={item.key}
                  onClick={() => toggleOption(item.key)}
                  className="flex items-center justify-between py-3 px-1 hover:bg-neutral-50/70 dark:hover:bg-neutral-900/60 rounded-lg cursor-pointer transition-colors"
                >
                  <div className="pr-4">
                    <span className="text-xs sm:text-sm font-medium text-neutral-800 dark:text-neutral-200 select-none block">
                      {item.label}
                    </span>
                    {item.description && (
                      <span className="text-[11px] text-neutral-500 dark:text-neutral-400 block mt-0.5">
                        {item.description}
                      </span>
                    )}
                  </div>

                  <div
                    role="switch"
                    aria-checked={checked}
                    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 ease-in-out ${
                      checked
                        ? "bg-neutral-900 dark:bg-neutral-100"
                        : "bg-neutral-200 dark:bg-neutral-800"
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white dark:bg-neutral-900 shadow-2xs transition-transform duration-200 ease-in-out ${
                        checked ? "translate-x-4.5" : "translate-x-1"
                      }`}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Informational Callout */}
          <div className="flex items-center gap-2 mt-4 px-1 text-xs text-neutral-500 dark:text-neutral-400">
            <RiInformationLine className="h-4 w-4 shrink-0 text-neutral-400" />
            <span>
              {hasExistingChapters && mode === "format"
                ? "Changes take effect immediately on your active canvas and reader."
                : "The raw source file is always preserved unchanged."}
            </span>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 bg-neutral-50/80 dark:bg-black border-t border-neutral-100 dark:border-neutral-800">
          <span className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">
            {enabledCount} options enabled
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
              onClick={handleExecute}
              disabled={isSubmitting}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-neutral-200 dark:text-neutral-900 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer active:scale-98 disabled:opacity-70"
            >
              {isSubmitting ? (
                <>
                  <RiLoader4Line className="h-3.5 w-3.5 animate-spin" />
                  <span>{mode === "format" ? "Formatting..." : "Parsing..."}</span>
                </>
              ) : (
                <>
                  <span>
                    {hasExistingChapters && mode === "format"
                      ? "Apply Formatting"
                      : "Run Parse & Format"}
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
