import { Link } from "react-router-dom";
import {
  RiArrowLeftLine,
  RiSparklingLine,
  RiSettings3Line,
} from "@remixicon/react";
import type { Project } from "@novelova/shared-types";

interface WorkspaceHeaderProps {
  project: Project;
  onOpenParseDialog: () => void;
  onOpenSettings?: () => void;
}

export function WorkspaceHeader({
  project,
  onOpenParseDialog,
  onOpenSettings,
}: WorkspaceHeaderProps) {
  const isReadyToParse = project.status === "ready_to_parse";
  const statusSubtitle = isReadyToParse
    ? "Source uploaded"
    : project.status === "in_production"
      ? "In production"
      : project.status === "complete"
        ? "Completed"
        : "Parsed manuscript";

  return (
    <div className="space-y-4">
      {/* Top Title & Metadata Row */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3.5">
          {/* Back Navigation Button */}
          <Link
            to="/projects"
            className="mt-0.5 p-2 rounded-xl border border-neutral-200 bg-white text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50 shadow-2xs transition-colors"
            title="Back to projects"
          >
            <RiArrowLeftLine className="h-4 w-4" />
          </Link>

          <div>
            {/* Breadcrumb Path */}
            <div className="text-[11px] font-semibold tracking-wider text-neutral-400 uppercase select-none">
              Projects / {project.title}
            </div>

            {/* Main Title */}
            <h1 className="text-2xl sm:text-3xl font-serif font-bold text-neutral-900 tracking-tight mt-0.5">
              {project.title}
            </h1>

            {/* Author & Status Subtitle */}
            <p className="text-sm text-neutral-500 font-normal mt-0.5">
              {project.author || "Unknown Author"} · {statusSubtitle}
            </p>
          </div>
        </div>

        {/* Top Right Actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenSettings}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 bg-white text-xs font-medium text-neutral-700 hover:bg-neutral-50 shadow-2xs transition-colors cursor-pointer"
          >
            <RiSettings3Line className="h-3.5 w-3.5 text-neutral-500" />
            <span>Project settings</span>
          </button>
        </div>
      </div>

      {/* Action Buttons Pill Bar */}
      <div className="flex items-center justify-between border-b border-neutral-200/80 pb-4 pt-1">
        <div className="flex items-center flex-wrap gap-2.5">
          {/* Parse & Format Pill */}
          <button
            type="button"
            onClick={onOpenParseDialog}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-semibold shadow-2xs transition-all cursor-pointer active:scale-98"
          >
            <RiSparklingLine className="h-3.5 w-3.5" />
            <span>Parse & format</span>
          </button>
        </div>
      </div>
    </div>
  );
}
