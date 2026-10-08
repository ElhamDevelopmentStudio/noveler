import { RiMagicLine, RiSparklingLine } from "@remixicon/react";

interface ReadyToParseCardProps {
  onOpenParseDialog: () => void;
}

export function ReadyToParseCard({ onOpenParseDialog }: ReadyToParseCardProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-12 sm:p-20 text-center min-h-[480px]">
      {/* Centered Soft Icon Container */}
      <div className="w-12 h-12 rounded-2xl bg-neutral-100/90 dark:bg-neutral-800 border border-neutral-200/90 dark:border-neutral-700 flex items-center justify-center text-neutral-600 dark:text-neutral-300 mb-4 shadow-2xs">
        <RiMagicLine className="w-5 h-5 text-neutral-700 dark:text-neutral-200" />
      </div>

      {/* Title */}
      <h3 className="text-base sm:text-lg font-semibold text-neutral-900 dark:text-neutral-100 tracking-tight">
        Your manuscript is ready to parse
      </h3>

      {/* Description */}
      <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 max-w-md mt-1.5 mb-6 leading-relaxed">
        Chapters, structure, and formatted content will appear here once you run
        Parse & format.
      </p>

      {/* Primary Action Button */}
      <button
        type="button"
        onClick={onOpenParseDialog}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-neutral-200 text-white dark:text-neutral-900 text-xs font-semibold shadow-xs transition-all cursor-pointer active:scale-98"
      >
        <RiSparklingLine className="h-4 w-4" />
        <span>Parse & format</span>
      </button>
    </div>
  );
}
