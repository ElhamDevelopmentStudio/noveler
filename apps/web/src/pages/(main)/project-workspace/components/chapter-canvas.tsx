import { useState } from "react";
import {
  RiBookmarkLine,
  RiMoreFill,
  RiLoader4Line,
} from "@remixicon/react";
import type { Chapter } from "@novelova/shared-types";

interface ChapterCanvasProps {
  chapter: Chapter | null;
  isLoading?: boolean;
}

export function ChapterCanvas({ chapter, isLoading }: ChapterCanvasProps) {
  const [activeTab, setActiveTab] = useState<"book_content" | "parsed_chapters">(
    "parsed_chapters",
  );
  const [fontScale, setFontScale] = useState(0); // -1, 0, 1, 2

  const increaseFontSize = () => {
    setFontScale((prev) => Math.min(2, prev + 1));
  };

  const decreaseFontSize = () => {
    setFontScale((prev) => Math.max(-1, prev - 1));
  };

  const getFontSizeClass = () => {
    switch (fontScale) {
      case -1:
        return "text-[15px] leading-[1.7]";
      case 1:
        return "text-[18px] leading-[1.85]";
      case 2:
        return "text-[20px] leading-[1.9]";
      default:
        return "text-[16.5px] leading-[1.8]";
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-20 min-h-[560px] bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200/90 dark:border-neutral-800 shadow-2xs">
        <RiLoader4Line className="h-6 w-6 animate-spin text-neutral-400 dark:text-neutral-500 mb-2" />
        <span className="shimmer-text text-xs text-neutral-400 dark:text-neutral-500 font-medium">
          Loading chapter content...
        </span>
      </div>
    );
  }

  if (!chapter) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-20 min-h-[560px] bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200/90 dark:border-neutral-800 shadow-2xs text-center">
        <p className="text-sm text-neutral-400 dark:text-neutral-500">Select a chapter from the sidebar</p>
      </div>
    );
  }

  const segments = chapter.segments || [];

  return (
    <div className="flex-1 flex flex-col rounded-2xl border border-neutral-200/90 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-2xs overflow-hidden h-[calc(100vh-14rem)] min-h-[560px]">
      {/* Top Tabs Header: Book content vs Parsed chapters */}
      <div className="px-6 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between select-none bg-white dark:bg-neutral-900">
        <div className="flex items-center gap-6">
          <button
            type="button"
            onClick={() => setActiveTab("book_content")}
            className={`py-3.5 text-xs font-semibold tracking-tight transition-colors border-b-2 -mb-[1px] cursor-pointer ${
              activeTab === "book_content"
                ? "border-neutral-900 dark:border-neutral-100 text-neutral-900 dark:text-neutral-100"
                : "border-transparent text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
            }`}
          >
            Book content
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("parsed_chapters")}
            className={`py-3.5 text-xs font-semibold tracking-tight transition-colors border-b-2 -mb-[1px] cursor-pointer ${
              activeTab === "parsed_chapters"
                ? "border-neutral-900 dark:border-neutral-100 text-neutral-900 dark:text-neutral-100"
                : "border-transparent text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
            }`}
          >
            Parsed chapters
          </button>
        </div>
      </div>

      {/* Subheader Toolbar: Chapter Title + Typography controls + Actions */}
      <div className="px-6 py-2.5 border-b border-neutral-100/90 dark:border-neutral-800 flex items-center justify-between bg-neutral-50/40 dark:bg-neutral-950/40 select-none">
        <div className="flex items-center gap-4">
          <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
            {chapter.title}
          </span>

          {/* Typography Zoom Pill */}
          <div className="flex items-center rounded-lg border border-neutral-200/80 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-2 py-0.5 shadow-2xs">
            <button
              type="button"
              onClick={decreaseFontSize}
              disabled={fontScale <= -1}
              className="text-xs text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 px-1 disabled:opacity-30 cursor-pointer"
              title="Decrease text size"
            >
              −
            </button>
            <span className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-200 px-1.5 border-x border-neutral-100 dark:border-neutral-700">
              Aa
            </span>
            <button
              type="button"
              onClick={increaseFontSize}
              disabled={fontScale >= 2}
              className="text-xs text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 px-1 disabled:opacity-30 cursor-pointer"
              title="Increase text size"
            >
              +
            </button>
          </div>
        </div>

        {/* Right Toolbar Icons */}
        <div className="flex items-center gap-1 text-neutral-400 dark:text-neutral-500">
          <button
            type="button"
            className="p-1 rounded-lg hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            title="Bookmark chapter"
          >
            <RiBookmarkLine className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="p-1 rounded-lg hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            title="Chapter options"
          >
            <RiMoreFill className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Reader Scrollable Canvas */}
      <div className="flex-1 overflow-y-auto px-6 sm:px-12 py-10">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Chapter Metadata Heading */}
          <div className="space-y-1 mb-8 select-none">
            <p className="text-[11px] font-sans font-bold tracking-widest text-neutral-400 dark:text-neutral-500 uppercase">
              CHAPTER {chapter.chapter_number > 0 ? chapter.chapter_number : "PRELUDE"}
            </p>
            <h2 className="text-3xl font-serif font-bold text-neutral-900 dark:text-neutral-100 tracking-tight">
              {chapter.title.replace(/^[0-9]+\.\s*/, "")}
            </h2>
          </div>

          {/* Render Segments */}
          {segments.length > 0 ? (
            segments.map((seg) => {
              const isDialogue =
                !seg.is_internal_thought &&
                Boolean(seg.is_dialogue) &&
                Boolean(seg.speaker) &&
                seg.speaker?.toLowerCase() !== "narrator";

              if (isDialogue) {
                return (
                  <div
                    key={seg.id}
                    className="my-5 p-4 pl-5 rounded-r-xl border-l-[3px] border-neutral-900 dark:border-neutral-100 bg-neutral-50/80 dark:bg-neutral-800/80 shadow-2xs transition-all hover:bg-neutral-100/50 dark:hover:bg-neutral-800/50"
                  >
                    {seg.speaker && (
                      <div className="text-[11px] font-sans font-semibold tracking-wider text-neutral-500 dark:text-neutral-400 uppercase mb-1">
                        {seg.speaker}
                        {seg.emotion && ` · ${seg.emotion}`}
                      </div>
                    )}
                    <p className={`font-serif text-neutral-900 dark:text-neutral-100 ${getFontSizeClass()}`}>
                      {seg.text}
                    </p>
                  </div>
                );
              }

              return (
                <p
                  key={seg.id}
                  className={`font-serif text-neutral-800 dark:text-neutral-200 ${getFontSizeClass()}`}
                >
                  {seg.text}
                </p>
              );
            })
          ) : (
            <p className="text-sm font-serif text-neutral-500 dark:text-neutral-400 italic">
              No content parsed for this chapter yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
