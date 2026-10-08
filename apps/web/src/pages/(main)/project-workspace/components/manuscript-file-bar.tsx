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
    <div className="flex items-center justify-between p-4 px-5 border-b border-neutral-100 bg-neutral-50/40">
      <div className="flex items-center gap-3">
        {/* Document Icon Container */}
        <div className="h-10 w-10 rounded-xl bg-white border border-neutral-200/90 flex items-center justify-center text-neutral-500 shadow-2xs shrink-0">
          <RiFileTextLine className="h-5 w-5" />
        </div>

        {/* File Metadata */}
        <div>
          <div className="text-sm font-medium text-neutral-900 leading-snug">
            {filename}
          </div>
          <div className="text-xs text-neutral-400 mt-0.5">
            {format} · {sizeText} · Uploaded {uploadTime}
          </div>
        </div>
      </div>

      {/* Ready to Parse Pill Badge */}
      <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-2xs">
        Ready to parse
      </div>
    </div>
  );
}
