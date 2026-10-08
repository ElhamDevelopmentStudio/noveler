import { useState, useMemo } from "react";
import {
  RiSearchLine,
  RiCloseLine,
  RiPlayFill,
  RiCheckLine,
  RiFileTextLine,
  RiDraggable,
  RiAddLine,
} from "@remixicon/react";
import type { Chapter } from "@novelova/shared-types";

interface ChaptersSidebarProps {
  chapters: Chapter[];
  activeChapterId?: string;
  onSelectChapter: (chapterId: string) => void;
  onAddChapter?: () => void;
}

function formatDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) return "10 min";
  const mins = Math.max(1, Math.round(seconds / 60));
  return `${mins} min`;
}

export function ChaptersSidebar({
  chapters,
  activeChapterId,
  onSelectChapter,
  onAddChapter,
}: ChaptersSidebarProps) {
  const [search, setSearch] = useState("");

  const filteredChapters = useMemo(() => {
    if (!search.trim()) return chapters;
    const lower = search.toLowerCase();
    return chapters.filter(
      (c) =>
        c.title.toLowerCase().includes(lower) ||
        `chapter ${c.chapter_number}`.includes(lower),
    );
  }, [chapters, search]);

  return (
    <aside className="w-full md:w-72 lg:w-80 shrink-0 flex flex-col rounded-2xl border border-neutral-200/90 bg-white shadow-2xs overflow-hidden h-[calc(100vh-14rem)] min-h-[560px]">
      {/* Sidebar Header */}
      <div className="p-4 pb-3 border-b border-neutral-100 flex items-center justify-between select-none">
        <h2 className="text-sm font-bold text-neutral-900 tracking-tight">
          Chapters
        </h2>
        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-neutral-100 text-neutral-600">
          {chapters.length}
        </span>
      </div>

      {/* Chapter Search Bar */}
      <div className="p-3 border-b border-neutral-100">
        <div className="relative">
          <RiSearchLine className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Find chapter"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8.5 pr-7 py-1.5 text-xs rounded-xl border border-neutral-200/80 bg-neutral-50/60 placeholder:text-neutral-400 text-neutral-900 focus:bg-white focus:outline-hidden focus:border-neutral-900 transition-colors shadow-2xs"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 p-0.5 rounded-full cursor-pointer"
            >
              <RiCloseLine className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Chapters Scrollable List */}
      <div className="flex-1 overflow-y-auto divide-y divide-neutral-100/80 p-1">
        {filteredChapters.length === 0 ? (
          <div className="p-8 text-center text-xs text-neutral-400">
            {search ? `No chapters matching "${search}"` : "No chapters available"}
          </div>
        ) : (
          filteredChapters.map((chapter) => {
            const isActive = chapter.id === activeChapterId;
            const isCompleted = chapter.status === "complete";

            return (
              <div
                key={chapter.id}
                onClick={() => onSelectChapter(chapter.id)}
                className={`group flex items-center justify-between p-3 rounded-xl transition-all cursor-pointer select-none ${
                  isActive
                    ? "bg-neutral-100/80 text-neutral-900 shadow-2xs"
                    : "hover:bg-neutral-50/80 text-neutral-700"
                }`}
              >
                {/* Left Status Icon + Title + Duration */}
                <div className="flex items-center gap-3 min-w-0 pr-2">
                  {/* Status Indicator Icon */}
                  {isActive ? (
                    <div className="h-6 w-6 rounded-full bg-neutral-900 text-white flex items-center justify-center shrink-0 shadow-2xs">
                      <RiPlayFill className="h-3.5 w-3.5 fill-current ml-0.5" />
                    </div>
                  ) : isCompleted ? (
                    <div className="h-6 w-6 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60 flex items-center justify-center shrink-0">
                      <RiCheckLine className="h-3.5 w-3.5" />
                    </div>
                  ) : (
                    <div className="h-6 w-6 rounded-lg bg-neutral-100/70 text-neutral-400 flex items-center justify-center shrink-0 group-hover:text-neutral-600 transition-colors">
                      <RiFileTextLine className="h-3.5 w-3.5" />
                    </div>
                  )}

                  {/* Title and Runtime */}
                  <div className="min-w-0">
                    <p
                      className={`text-xs truncate tracking-tight ${
                        isActive
                          ? "font-bold text-neutral-950"
                          : "font-medium text-neutral-800 group-hover:text-neutral-950"
                      }`}
                    >
                      {chapter.title}
                    </p>
                    <p className="text-[11px] text-neutral-400 mt-0.5">
                      Batch {chapter.batch_number || 1} · {formatDuration(chapter.estimated_duration_seconds)}
                    </p>
                  </div>
                </div>

                {/* Right Grip Handle */}
                <div
                  className="p-1 text-neutral-300 group-hover:text-neutral-500 opacity-60 group-hover:opacity-100 transition-opacity"
                  title="Reorder chapter"
                >
                  <RiDraggable className="h-4 w-4" />
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Bottom Add Chapter Action */}
      <div className="p-3 border-t border-neutral-100 bg-neutral-50/40">
        <button
          type="button"
          onClick={onAddChapter}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100/80 rounded-xl transition-colors cursor-pointer select-none"
        >
          <RiAddLine className="h-4 w-4 text-neutral-400" />
          <span>Add chapter</span>
        </button>
      </div>
    </aside>
  );
}
