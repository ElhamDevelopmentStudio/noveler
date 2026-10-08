import { useState } from "react";
import {
  RiInformationLine,
  RiArrowRightLine,
  RiLoader4Line,
} from "@remixicon/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export interface ParseOptions {
  removeWhitespace: boolean;
  normalizeParagraphs: boolean;
  separateSentenceWise: boolean;
  detectChapterHeadings: boolean;
  preserveItalics: boolean;
  fixPunctuationSpacing: boolean;
  speakUnambiguousNumbers: boolean;
}

interface ParseConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filename: string;
  onConfirmParse?: (options: ParseOptions) => Promise<void> | void;
}

export function ParseConfigDialog({
  open,
  onOpenChange,
  filename,
  onConfirmParse,
}: ParseConfigDialogProps) {
  const [options, setOptions] = useState<ParseOptions>({
    removeWhitespace: true,
    normalizeParagraphs: true,
    separateSentenceWise: true,
    detectChapterHeadings: true,
    preserveItalics: true,
    fixPunctuationSpacing: false,
    speakUnambiguousNumbers: true,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const toggleOption = (key: keyof ParseOptions) => {
    setOptions((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const enabledCount = Object.values(options).filter(Boolean).length;

  const handleRunParse = async () => {
    setIsSubmitting(true);
    try {
      await onConfirmParse?.(options);
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const items: Array<{
    key: keyof ParseOptions;
    label: string;
  }> = [
    {
      key: "removeWhitespace",
      label: "Remove extra whitespace",
    },
    {
      key: "normalizeParagraphs",
      label: "Normalize paragraph breaks",
    },
    {
      key: "separateSentenceWise",
      label: "Separate the novel sentence-wise",
    },
    {
      key: "detectChapterHeadings",
      label: "Detect chapter headings",
    },
    {
      key: "preserveItalics",
      label: "Preserve italics and emphasis",
    },
    {
      key: "fixPunctuationSpacing",
      label: "Fix common punctuation spacing",
    },
    {
      key: "speakUnambiguousNumbers",
      label: "Convert numbers to spoken words (audio-ready via inflect)",
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-0 overflow-hidden rounded-2xl border-neutral-200">
        <div className="p-6 pb-4">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-xl font-bold font-serif text-neutral-900 tracking-tight">
              Parse & format
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm text-neutral-500">
              Choose the processing to apply to {filename}.
            </DialogDescription>
          </DialogHeader>

          {/* Toggle Options List */}
          <div className="divide-y divide-neutral-100 mt-6 border-y border-neutral-100">
            {items.map((item) => {
              const checked = options[item.key];
              return (
                <div
                  key={item.key}
                  onClick={() => toggleOption(item.key)}
                  className="flex items-center justify-between py-3.5 px-1 hover:bg-neutral-50/70 rounded-lg cursor-pointer transition-colors"
                >
                  <span className="text-sm font-medium text-neutral-800 select-none">
                    {item.label}
                  </span>

                  {/* Accessible iOS-style Switch Toggle */}
                  <div
                    role="switch"
                    aria-checked={checked}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-hidden ${
                      checked ? "bg-neutral-900" : "bg-neutral-200"
                    }`}
                  >
                    <span
                      className={`inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow-2xs transition-transform duration-200 ease-in-out ${
                        checked ? "translate-x-5.5" : "translate-x-1"
                      }`}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Informational Callout */}
          <div className="flex items-center gap-2.5 mt-5 px-1 text-xs text-neutral-500">
            <RiInformationLine className="h-4 w-4 shrink-0 text-neutral-400" />
            <span>
              The source file is kept unchanged. Parsing creates editable chapters
              and structured content in this project.
            </span>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 bg-neutral-50/80 border-t border-neutral-100">
          <span className="text-xs text-neutral-500 font-medium">
            {enabledCount} of 6 options enabled
          </span>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl border border-neutral-200 bg-white text-xs font-semibold text-neutral-700 hover:bg-neutral-50 shadow-2xs transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleRunParse}
              disabled={isSubmitting}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer active:scale-98 disabled:opacity-70"
            >
              {isSubmitting ? (
                <>
                  <RiLoader4Line className="h-3.5 w-3.5 animate-spin" />
                  <span>Parsing...</span>
                </>
              ) : (
                <>
                  <span>Parse & format</span>
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
