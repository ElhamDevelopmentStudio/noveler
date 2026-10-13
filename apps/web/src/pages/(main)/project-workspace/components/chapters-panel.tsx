import { useState, useRef, useEffect, useTransition } from "react";
import {
  RiAddLine,
  RiMoreFill,
  RiDraggable,
  RiCheckboxCircleFill,
  RiDownloadLine,
  RiLoader4Line,
} from "@remixicon/react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import type { Chapter } from "@novelova/shared-types";
import { cn } from "@/lib/utils";

export interface ChaptersPanelProps {
  chapters: Chapter[];
  activeChapterId?: string;
  onSelectChapter: (chapterId: string) => void;
  onCreateChapter: (defaultTitle: string) => Promise<Chapter | null>;
  onRenameChapter: (chapterId: string, newTitle: string) => Promise<void>;
  onReorderChapters: (chapterIds: string[]) => Promise<void>;
  projectName?: string;
  className?: string;
}

export function ChaptersPanel({
  chapters,
  activeChapterId,
  onSelectChapter,
  onCreateChapter,
  onRenameChapter,
  onReorderChapters,
  projectName = "manuscript",
  className,
}: ChaptersPanelProps) {
  const [editingChapterId, setEditingChapterId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [, startTransition] = useTransition();

  const editInputRef = useRef<HTMLInputElement>(null);

  // Drag and drop state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Focus input when editing starts
  useEffect(() => {
    if (editingChapterId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingChapterId, chapters]);

  const handleStartRename = (chapter: Chapter, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingChapterId(chapter.id);
    setEditingTitle(chapter.title);
  };

  const handleSaveRename = async () => {
    if (!editingChapterId) return;
    const trimmed = editingTitle.trim();
    const current = chapters.find((c) => c.id === editingChapterId);
    setEditingChapterId(null);

    if (trimmed && current && trimmed !== current.title) {
      await onRenameChapter(current.id, trimmed);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSaveRename();
    } else if (e.key === "Escape") {
      setEditingChapterId(null);
    }
  };

  const handleCreate = async () => {
    if (isCreating) return;
    setIsCreating(true);
    try {
      const nextNumber = chapters.length + 1;
      const defaultTitle = `Chapter ${nextNumber}`;
      const newChapter = await onCreateChapter(defaultTitle);
      if (newChapter) {
        onSelectChapter(newChapter.id);
        // Directly focus the new chapter title for editing
        setEditingChapterId(newChapter.id);
        setEditingTitle(newChapter.title);
      }
    } finally {
      setIsCreating(false);
    }
  };

  // Drag & drop handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    setDragOverIndex(index);
  };

  const handleDragEnd = async () => {
    if (
      draggedIndex !== null &&
      dragOverIndex !== null &&
      draggedIndex !== dragOverIndex
    ) {
      const updated = [...chapters];
      const [moved] = updated.splice(draggedIndex, 1);
      updated.splice(dragOverIndex, 0, moved);

      startTransition(async () => {
        await onReorderChapters(updated.map((c) => c.id));
      });
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  // Download Chapters Metadata action
  const handleDownloadMetadata = () => {
    setMoreMenuOpen(false);
    const metadata = {
      project: projectName,
      exported_at: new Date().toISOString(),
      total_chapters: chapters.length,
      chapters: chapters.map((c, i) => ({
        index: i + 1,
        id: c.id,
        number: c.chapter_number,
        title: c.title,
        word_count: c.word_count,
        estimated_duration_seconds: c.estimated_duration_seconds,
        status: c.status,
        created_at: c.created_at,
      })),
    };

    const blob = new Blob([JSON.stringify(metadata, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-chapters-metadata.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className={cn(
        "w-64 sm:w-72 shrink-0 h-full border-r border-neutral-200/80 dark:border-white/[0.08] bg-white dark:bg-[#0c0d10] flex flex-col select-none transition-all",
        className,
      )}
    >
      {/* Panel Header */}
      <div className="h-12 px-4 flex items-center justify-between shrink-0">
        <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          Chapters
        </span>

        <div className="flex items-center gap-0.5">
          {/* Add Chapter Button */}
          <button
            type="button"
            onClick={handleCreate}
            disabled={isCreating}
            className="p-1 rounded-md text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-white/[0.06] transition-colors cursor-pointer disabled:opacity-50"
            title="Add chapter"
            aria-label="Add chapter"
          >
            {isCreating ? (
              <RiLoader4Line className="h-4 w-4 animate-spin" />
            ) : (
              <RiAddLine className="h-4 w-4" />
            )}
          </button>

          {/* Three Dots More Options Menu */}
          <Popover open={moreMenuOpen} onOpenChange={setMoreMenuOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="p-1 rounded-md text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
                title="More options"
                aria-label="More options"
              >
                <RiMoreFill className="h-4 w-4" />
              </button>
            </PopoverTrigger>

            <PopoverContent
              align="end"
              sideOffset={6}
              className="w-56 p-1 rounded-xl border border-neutral-200/90 dark:border-neutral-800 bg-white dark:bg-neutral-950 shadow-xl"
            >
              <button
                type="button"
                onClick={handleDownloadMetadata}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:text-neutral-950 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/[0.06] transition-colors cursor-pointer text-left"
              >
                <RiDownloadLine className="h-4 w-4 text-neutral-400" />
                <span>Download Chapters Metadata</span>
              </button>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Chapters List Body */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        {chapters.length === 0 ? (
          <div className="h-32 flex flex-col items-center justify-center text-center p-4">
            <p className="text-sm text-neutral-400 dark:text-neutral-500">
              No chapters yet.
            </p>
            <button
              type="button"
              onClick={handleCreate}
              className="mt-2 text-sm font-medium text-neutral-900 dark:text-neutral-100 hover:underline cursor-pointer"
            >
              Create first chapter
            </button>
          </div>
        ) : (
          <div className="rounded-xl border border-neutral-200/80 dark:border-white/[0.06] bg-neutral-50/50 dark:bg-neutral-900/40 divide-y divide-neutral-200/60 dark:divide-white/[0.04] overflow-hidden">
            {chapters.map((chap, idx) => {
              const isSelected = chap.id === activeChapterId;
              const isEditing = chap.id === editingChapterId;
              const isDragged = draggedIndex === idx;
              const isDragOver = dragOverIndex === idx;

              return (
                <div
                  key={chap.id}
                  draggable={!isEditing}
                  onDragStart={(e) => handleDragStart(e, idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDragEnd={handleDragEnd}
                  onClick={() => onSelectChapter(chap.id)}
                  className={cn(
                    "flex items-center justify-between px-3 py-2.5 text-sm transition-colors cursor-pointer group",
                    isSelected
                      ? "bg-neutral-100/80 dark:bg-white/[0.06]"
                      : "hover:bg-neutral-100/50 dark:hover:bg-white/[0.03]",
                    isDragged && "opacity-40",
                    isDragOver && "border-t-2 border-primary",
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
                    {/* Drag Handle Grip */}
                    <div
                      className="cursor-grab active:cursor-grabbing text-neutral-400 hover:text-neutral-700 dark:text-neutral-500 dark:hover:text-neutral-300 p-0.5 -ml-1 shrink-0"
                      title="Drag to reorder"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <RiDraggable className="h-4 w-4 opacity-60 group-hover:opacity-100 transition-opacity" />
                    </div>

                    {/* Chapter Name (Editable / Hover text state) */}
                    {isEditing ? (
                      <input
                        ref={editInputRef}
                        type="text"
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onBlur={handleSaveRename}
                        onKeyDown={handleKeyDown}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full text-sm font-medium bg-white dark:bg-black border border-neutral-300 dark:border-neutral-700 rounded-lg px-2 py-1 text-neutral-900 dark:text-neutral-100 outline-none focus:border-neutral-900 dark:focus:border-white shadow-2xs"
                      />
                    ) : (
                      <span
                        onClick={(e) => handleStartRename(chap, e)}
                        className="truncate text-sm font-medium text-neutral-800 dark:text-neutral-200 cursor-text hover:bg-neutral-200/50 dark:hover:bg-white/[0.08] px-1.5 py-0.5 -mx-1 rounded transition-colors"
                        title="Click to rename"
                      >
                        {chap.title}
                      </span>
                    )}
                  </div>

                  {/* Active Selected Checkmark Indicator */}
                  {isSelected && (
                    <RiCheckboxCircleFill className="h-4 w-4 text-neutral-900 dark:text-white shrink-0 ml-1.5" />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default ChaptersPanel;
