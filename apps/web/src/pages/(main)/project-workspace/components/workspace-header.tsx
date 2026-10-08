import { Link } from "react-router-dom";
import {
  RiArrowLeftLine,
  RiSparklingLine,
  RiMicLine,
  RiTranslate2,
  RiSettings3Line,
} from "@remixicon/react";
import type { Project } from "@novelova/shared-types";

interface WorkspaceHeaderProps {
  project: Project;
  onOpenParseDialog: () => void;
  onRunTagging?: () => void;
  isTagging?: boolean;
  onOpenVoiceCasting?: () => void;
  onOpenPronunciation?: () => void;
  onOpenSettings?: () => void;
}

export function WorkspaceHeader({
  project,
  onOpenParseDialog,
  onRunTagging,
  isTagging,
  onOpenVoiceCasting,
  onOpenPronunciation,
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
            className="mt-0.5 p-2 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-50 dark:hover:bg-neutral-800 shadow-2xs transition-colors"
            title="Back to projects"
          >
            <RiArrowLeftLine className="h-4 w-4" />
          </Link>

          <div>
            {/* Breadcrumb Path */}
            <div className="text-[11px] font-semibold tracking-wider text-neutral-400 dark:text-neutral-500 uppercase select-none">
              Projects / {project.title}
            </div>

            {/* Main Title */}
            <h1 className="text-2xl sm:text-3xl font-serif font-bold text-neutral-900 dark:text-neutral-100 tracking-tight mt-0.5">
              {project.title}
            </h1>

            {/* Author & Status Subtitle */}
            <p className="text-sm text-neutral-500 dark:text-neutral-400 font-normal mt-0.5">
              {project.author || "Unknown Author"} · {statusSubtitle}
            </p>
          </div>
        </div>

        {/* Top Right Actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenSettings}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 shadow-2xs transition-colors cursor-pointer"
          >
            <RiSettings3Line className="h-3.5 w-3.5 text-neutral-500 dark:text-neutral-400" />
            <span>Project settings</span>
          </button>
        </div>
      </div>

      {/* Action Buttons Pill Bar matching design mockup */}
      <div className="flex items-center justify-between border-b border-neutral-200/80 dark:border-neutral-800 pb-4 pt-1">
        <div className="flex items-center flex-wrap gap-2.5">
          {/* Parse & Format */}
          <button
            type="button"
            onClick={onOpenParseDialog}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-xs font-medium shadow-2xs transition-all cursor-pointer active:scale-98"
          >
            <RiSparklingLine className="h-3.5 w-3.5 text-neutral-600 dark:text-neutral-400" />
            <span>Parse & format</span>
          </button>

          {/* Tag Dialogue (Stage B) */}
          <button
            type="button"
            onClick={onRunTagging}
            disabled={isTagging}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-xs font-medium shadow-2xs transition-all cursor-pointer active:scale-98 disabled:opacity-50"
          >
            <span className="font-mono text-[10px] bg-neutral-100 dark:bg-neutral-800 px-1 py-0.5 rounded text-neutral-700 dark:text-neutral-300 font-bold">
              B
            </span>
            <span>{isTagging ? "Tagging..." : "Tag dialogue"}</span>
          </button>

          {/* Voice & Casting */}
          <button
            type="button"
            onClick={onOpenVoiceCasting}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-xs font-medium shadow-2xs transition-all cursor-pointer active:scale-98"
          >
            <RiMicLine className="h-3.5 w-3.5 text-neutral-600 dark:text-neutral-400" />
            <span>Voice & casting</span>
          </button>

          {/* Pronunciation */}
          <button
            type="button"
            onClick={onOpenPronunciation}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-xs font-medium shadow-2xs transition-all cursor-pointer active:scale-98"
          >
            <RiTranslate2 className="h-3.5 w-3.5 text-neutral-600 dark:text-neutral-400" />
            <span>Pronunciation</span>
          </button>
        </div>
      </div>
    </div>
  );
}
