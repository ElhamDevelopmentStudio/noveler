import { RiMagicLine, RiSparklingLine, RiLoader4Line, RiAlertLine } from "@remixicon/react";
import type { ParseJob } from "@novelova/shared-types";

interface ReadyToParseCardProps {
  onOpenParseDialog: () => void;
  parseJob?: ParseJob | null;
}

export function ReadyToParseCard({ onOpenParseDialog, parseJob }: ReadyToParseCardProps) {
  const isParsing = parseJob?.status === "pending" || parseJob?.status === "running";
  const isFailed = parseJob?.status === "failed";

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-12 sm:p-20 text-center min-h-[480px]">
      {/* Centered Soft Icon Container */}
      <div className="w-12 h-12 rounded-2xl bg-neutral-100/90 dark:bg-neutral-800 border border-neutral-200/90 dark:border-neutral-700 flex items-center justify-center text-neutral-600 dark:text-neutral-300 mb-4 shadow-2xs">
        {isParsing ? (
          <RiLoader4Line className="w-5 h-5 text-neutral-700 dark:text-neutral-200 animate-spin" />
        ) : isFailed ? (
          <RiAlertLine className="w-5 h-5 text-destructive" />
        ) : (
          <RiMagicLine className="w-5 h-5 text-neutral-700 dark:text-neutral-200" />
        )}
      </div>

      {/* Title */}
      <h3 className="text-base sm:text-lg font-semibold text-neutral-900 dark:text-neutral-100 tracking-tight">
        {isParsing
          ? "Parsing & structuring manuscript..."
          : isFailed
            ? "Parse operation encountered an issue"
            : "Your manuscript is ready to parse"}
      </h3>

      {/* Description */}
      <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 max-w-md mt-1.5 mb-6 leading-relaxed">
        {isParsing
          ? "We are processing chapters, segmenting sentences, and formatting dialogue in the background. Chapters will appear here automatically."
          : isFailed
            ? parseJob?.error_message || "An error occurred during parsing. You can review options and try again."
            : "Chapters, structure, and formatted content will appear here once you run Parse & format."}
      </p>

      {/* Progress Bar when parsing is active */}
      {isParsing && (
        <div className="w-full max-w-md mb-8 space-y-2.5">
          <div className="flex items-center justify-between text-xs text-neutral-600 dark:text-neutral-400 font-medium px-0.5">
            <span className="truncate max-w-[300px]">
              {parseJob?.current_step || "Analyzing manuscript..."}
            </span>
            <span className="font-mono font-bold text-neutral-900 dark:text-neutral-100 shrink-0 ml-2">
              {parseJob?.progress_percent ?? 0}%
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden p-0.5 border border-neutral-200/50 dark:border-neutral-700/50">
            <div
              className="h-full bg-neutral-900 dark:bg-neutral-100 transition-all duration-300 rounded-full"
              style={{ width: `${Math.max(parseJob?.progress_percent ?? 0, 4)}%` }}
            />
          </div>
        </div>
      )}

      {/* Primary Action Button */}
      <button
        type="button"
        onClick={onOpenParseDialog}
        disabled={isParsing}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-neutral-200 text-white dark:text-neutral-900 text-xs font-semibold shadow-xs transition-all cursor-pointer active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isParsing ? (
          <>
            <RiLoader4Line className="h-4 w-4 animate-spin" />
            <span>Processing in background...</span>
          </>
        ) : (
          <>
            <RiSparklingLine className="h-4 w-4" />
            <span>{isFailed ? "Retry Parse & format" : "Parse & format"}</span>
          </>
        )}
      </button>
    </div>
  );
}
