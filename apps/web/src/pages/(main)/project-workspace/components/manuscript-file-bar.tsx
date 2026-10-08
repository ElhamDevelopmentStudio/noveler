import { RiFileTextLine } from "@remixicon/react";
import type { Project } from "@novelova/shared-types";
import { formatRelativeTime } from "@/lib/date-utils";

interface ManuscriptFileBarProps {
  project: Project;
}

function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ManuscriptFileBar({ project }: ManuscriptFileBarProps) {
  const filename =
    project.manuscript_filename ||
    `${project.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.${(project.source || "docx").toLowerCase()}`;

  const format = (project.source || filename.split(".").pop() || "DOCX").toUpperCase();
  const sizeText = formatBytes(project.manuscript_size);
  const uploadTime = formatRelativeTime(project.created_at);

  return (
    <div className="flex items-center justify-between p-4 px-5 border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50/40 dark:bg-black">
      <div className="flex items-center gap-3">
        {/* Document Icon Container */}
        <div className="h-10 w-10 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200/90 dark:border-neutral-700 flex items-center justify-center text-neutral-500 dark:text-neutral-400 shadow-2xs shrink-0">
          <RiFileTextLine className="h-5 w-5" />
        </div>

        {/* File Metadata */}
        <div>
          <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100 leading-snug">
            {filename}
          </div>
          <div className="text-xs text-neutral-400 dark:text-neutral-500 mt-0.5">
            {format} · {sizeText} · Uploaded {uploadTime}
          </div>
        </div>
      </div>

      {/* Ready to Parse Pill Badge */}
      <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200/80 dark:border-emerald-800/60 shadow-2xs">
        Ready to parse
      </div>
    </div>
  );
}
