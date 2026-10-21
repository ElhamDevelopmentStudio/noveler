import { useState, useMemo } from "react";
import { Link, NavLink } from "react-router-dom";
import {
  RiArrowLeftLine,
  RiArrowDownSLine,
  RiSparklingLine,
  RiMicLine,
  RiTranslate2,
  RiSettings3Line,
  RiHistoryLine,
  RiMoreFill,
  RiSearchLine,
  RiCloseLine,
  RiCheckLine,
  RiLoader4Line,
} from "@remixicon/react";
import { BrandLogo } from "@/components/brand-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { NavbarUserMenu } from "@/components/navbar-user-menu";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import type { Project, Chapter, TaggingJob } from "@novelova/shared-types";
import { TaggingLatestRunPopover } from "./tagging-latest-run-popover";
import { cn } from "@/lib/utils";

interface WorkspaceTopBarProps {
  project?: Project | null;
  chapters?: Chapter[];
  activeChapterId?: string;
  onSelectChapter?: (chapterId: string) => void;
  onOpenParseDialog?: () => void;
  onRunTagging?: () => void;
  isTagging?: boolean;
  onOpenTaggingHistory?: () => void;
  onOpenVoiceCasting?: () => void;
  onOpenPronunciation?: () => void;
  onOpenSettings?: () => void;
  onHelpClick?: () => void;
  latestJob?: TaggingJob | null;
  totalRunsCount?: number;
  onCancelTagging?: () => Promise<void> | void;
}

export function WorkspaceTopBar({
  project,
  chapters = [],
  activeChapterId,
  onSelectChapter,
  onOpenParseDialog,
  onRunTagging,
  isTagging,
  onOpenTaggingHistory,
  onOpenVoiceCasting,
  onOpenPronunciation,
  onOpenSettings,
  latestJob,
  totalRunsCount,
  onCancelTagging,
}: WorkspaceTopBarProps) {
  const [chapterMenuOpen, setChapterMenuOpen] = useState(false);
  const [chapterSearch, setChapterSearch] = useState("");
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false);

  const activeChapter = useMemo(() => {
    if (!chapters || chapters.length === 0) return null;
    return chapters.find((c) => c.id === activeChapterId) || chapters[0];
  }, [chapters, activeChapterId]);

  const hasChapters = Boolean(chapters && chapters.length > 0);

  const statusSubtitle = useMemo(() => {
    if (!project) return "";
    if (project.status === "ready_to_parse") return "Source uploaded";
    if (project.status === "in_production") return "In production";
    if (project.status === "complete") return "Completed";
    return project.status_label || "Draft";
  }, [project]);

  const filteredChapters = useMemo(() => {
    if (!chapterSearch.trim()) return chapters;
    const lower = chapterSearch.toLowerCase();
    return chapters.filter(
      (c) =>
        c.title.toLowerCase().includes(lower) ||
        `chapter ${c.chapter_number}`.includes(lower),
    );
  }, [chapters, chapterSearch]);

  return (
    <header className="h-16 shrink-0 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black sticky top-0 z-30 select-none transition-colors">
      <div className="w-full h-full px-4 sm:px-6 flex items-center justify-between relative">
        {/* Left: Brand Logo & Navigation */}
        <div className="flex items-center gap-2.5 z-10">
          <Link
            to="/projects"
            className="p-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors shadow-2xs"
            title="Back to projects"
          >
            <RiArrowLeftLine className="h-4 w-4" />
          </Link>

          <NavLink
            to="/projects"
            className="flex items-center text-neutral-900 dark:text-neutral-100 hover:opacity-80 transition-opacity ml-0.5"
            title="Noveler Home"
          >
            <BrandLogo className="h-6 w-6 text-neutral-900 dark:text-neutral-100" />
          </NavLink>

          <div className="h-4 w-[1px] bg-neutral-200 dark:bg-neutral-800 hidden sm:block" />

          <NavLink
            to="/projects"
            className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 transition-colors hidden sm:block"
          >
            Projects
          </NavLink>
        </div>

        {/* Center: Project Name & Chapter Info (ElevenLabs Studio Style) */}
        <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center justify-center pointer-events-auto max-w-[42vw] sm:max-w-[50vw] md:max-w-[58vw] text-center z-10">
          <div className="flex items-center gap-1.5 min-w-0">
            {/* Project Title */}
            <span
              className="text-sm font-semibold tracking-tight text-neutral-900 dark:text-neutral-100 truncate max-w-[110px] sm:max-w-[170px] md:max-w-[220px]"
              title={project?.title || "Project"}
            >
              {project?.title || "Untitled Project"}
            </span>

            <span className="text-neutral-400 dark:text-neutral-500 font-light select-none px-0.5">
              /
            </span>

            {/* Chapter / Part Selector with Chevron */}
            {hasChapters ? (
              <Popover open={chapterMenuOpen} onOpenChange={setChapterMenuOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="group inline-flex items-center gap-1 px-2 py-0.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-900 text-sm font-medium text-neutral-800 dark:text-neutral-200 hover:text-neutral-950 dark:hover:text-white transition-colors cursor-pointer select-none"
                    title="Switch chapter"
                  >
                    <span className="truncate max-w-[110px] sm:max-w-[180px] md:max-w-[240px]">
                      {activeChapter?.title || "Select Chapter"}
                    </span>
                    <RiArrowDownSLine
                      className={cn(
                        "h-4 w-4 text-neutral-400 group-hover:text-neutral-700 dark:group-hover:text-neutral-200 shrink-0 transition-transform duration-200",
                        chapterMenuOpen && "rotate-180",
                      )}
                    />
                  </button>
                </PopoverTrigger>

                <PopoverContent
                  align="center"
                  sideOffset={8}
                  className="w-80 p-0 rounded-2xl border border-neutral-200/90 dark:border-neutral-800 bg-white dark:bg-neutral-950 shadow-xl overflow-hidden"
                >
                  {/* Popover Header */}
                  <div className="p-3 pb-2 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
                    <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                      Chapters ({chapters.length})
                    </span>
                    {project?.author && (
                      <span className="text-[10px] text-neutral-400 dark:text-neutral-500 truncate max-w-[140px]">
                        by {project.author}
                      </span>
                    )}
                  </div>

                  {/* Chapter Search Filter */}
                  <div className="p-2 border-b border-neutral-100 dark:border-neutral-800">
                    <div className="relative">
                      <RiSearchLine className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400" />
                      <input
                        type="text"
                        placeholder="Find chapter..."
                        value={chapterSearch}
                        onChange={(e) => setChapterSearch(e.target.value)}
                        className="w-full pl-7.5 pr-6 py-1 text-xs rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 text-neutral-900 dark:text-neutral-100 focus:outline-hidden focus:border-neutral-900 dark:focus:border-neutral-100"
                      />
                      {chapterSearch && (
                        <button
                          type="button"
                          onClick={() => setChapterSearch("")}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 cursor-pointer"
                        >
                          <RiCloseLine className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Scrollable Chapter List */}
                  <div className="max-h-72 overflow-y-auto p-1 divide-y divide-neutral-100 dark:divide-neutral-900">
                    {filteredChapters.length === 0 ? (
                      <div className="p-6 text-center text-xs text-neutral-400 dark:text-neutral-500">
                        No chapters matching "{chapterSearch}"
                      </div>
                    ) : (
                      filteredChapters.map((ch) => {
                        const isSelected = ch.id === activeChapter?.id;
                        return (
                          <button
                            key={ch.id}
                            type="button"
                            onClick={() => {
                              onSelectChapter?.(ch.id);
                              setChapterMenuOpen(false);
                              setChapterSearch("");
                            }}
                            className={cn(
                              "w-full text-left p-2.5 rounded-xl transition-colors flex items-center justify-between group/item cursor-pointer",
                              isSelected
                                ? "bg-neutral-100 dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 font-semibold"
                                : "hover:bg-neutral-50 dark:hover:bg-neutral-900/60 text-neutral-700 dark:text-neutral-300 font-medium",
                            )}
                          >
                            <div className="flex items-center gap-2.5 min-w-0 pr-2">
                              <span className="text-[10px] font-mono font-bold text-neutral-400 dark:text-neutral-500 shrink-0 w-5">
                                #{ch.chapter_number}
                              </span>
                              <span className="text-xs truncate">{ch.title}</span>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {ch.word_count ? (
                                <span className="text-[10px] text-neutral-400 dark:text-neutral-500">
                                  {ch.word_count.toLocaleString()} w
                                </span>
                              ) : null}
                              {isSelected && (
                                <RiCheckLine className="h-3.5 w-3.5 text-neutral-900 dark:text-neutral-100" />
                              )}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            ) : (
              <span className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
                Manuscript
              </span>
            )}
          </div>

          {/* Info Subtitle Line */}
          {project && (
            <div className="text-[11px] text-neutral-400 dark:text-neutral-500 font-normal mt-0.5 flex items-center gap-1.5 select-none">
              <span className="truncate max-w-[120px] sm:max-w-[200px]">
                {project.author ? `by ${project.author}` : "Author unassigned"}
              </span>
              <span className="text-neutral-300 dark:text-neutral-700">·</span>
              <span className="capitalize">{statusSubtitle}</span>
            </div>
          )}
        </div>

        {/* Right: Studio Actions & Controls */}
        <div className="flex items-center gap-2 z-10">
          {/* Parse & Format */}
          {onOpenParseDialog && (
            <button
              type="button"
              onClick={onOpenParseDialog}
              className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-xs font-medium shadow-2xs transition-all cursor-pointer"
              title="Parse & format manuscript"
            >
              <RiSparklingLine className="h-3.5 w-3.5 text-neutral-500 dark:text-neutral-400" />
              <span>Parse & format</span>
            </button>
          )}

          {/* Tag Dialogue (Stage B) */}
          {onRunTagging && (
            <div className="hidden sm:inline-flex rounded-lg shadow-2xs border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 divide-x divide-neutral-200 dark:divide-neutral-800">
              <button
                type="button"
                onClick={onRunTagging}
                disabled={isTagging}
                className="flex items-center gap-1.5 px-3 py-1.5 text-neutral-800 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-xs font-medium transition-all cursor-pointer disabled:opacity-50 rounded-l-lg"
              >
                {isTagging ? (
                  <RiLoader4Line className="h-3.5 w-3.5 animate-spin text-neutral-500" />
                ) : (
                  <span className="font-mono text-[9px] bg-neutral-100 dark:bg-neutral-800 px-1 py-0.5 rounded text-neutral-700 dark:text-neutral-300 font-bold">
                    B
                  </span>
                )}
                <span>{isTagging ? "Tagging..." : "Tag dialogue"}</span>
              </button>
              {onOpenTaggingHistory && (
                <TaggingLatestRunPopover
                  latestJob={latestJob}
                  totalRunsCount={totalRunsCount}
                  isTagging={isTagging}
                  onOpenFullHistory={onOpenTaggingHistory}
                  onRetryTagging={onRunTagging}
                  onCancelTagging={onCancelTagging}
                />
              )}
            </div>
          )}

          {/* Project Tools Popover */}
          <Popover open={toolsMenuOpen} onOpenChange={setToolsMenuOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="p-2 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-50 dark:hover:bg-neutral-800 shadow-2xs transition-colors cursor-pointer"
                title="Project tools & settings"
              >
                <RiMoreFill className="h-4 w-4" />
              </button>
            </PopoverTrigger>

            <PopoverContent
              align="end"
              sideOffset={8}
              className="w-52 p-1 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 shadow-xl"
            >
              {onOpenParseDialog && (
                <button
                  type="button"
                  onClick={() => {
                    setToolsMenuOpen(false);
                    onOpenParseDialog();
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-900 flex items-center gap-2.5 transition-colors cursor-pointer lg:hidden"
                >
                  <RiSparklingLine className="h-4 w-4 text-neutral-500" />
                  <span>Parse & format</span>
                </button>
              )}

              {onRunTagging && (
                <button
                  type="button"
                  onClick={() => {
                    setToolsMenuOpen(false);
                    onRunTagging();
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-900 flex items-center gap-2.5 transition-colors cursor-pointer sm:hidden"
                >
                  <span className="font-mono text-[9px] bg-neutral-100 dark:bg-neutral-800 px-1 py-0.5 rounded text-neutral-700 dark:text-neutral-300 font-bold">
                    B
                  </span>
                  <span>Tag dialogue (Stage B)</span>
                </button>
              )}

              {onOpenVoiceCasting && (
                <button
                  type="button"
                  onClick={() => {
                    setToolsMenuOpen(false);
                    onOpenVoiceCasting();
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-900 flex items-center gap-2.5 transition-colors cursor-pointer"
                >
                  <RiMicLine className="h-4 w-4 text-neutral-500" />
                  <span>Voice casting</span>
                </button>
              )}

              {onOpenPronunciation && (
                <button
                  type="button"
                  onClick={() => {
                    setToolsMenuOpen(false);
                    onOpenPronunciation();
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-900 flex items-center gap-2.5 transition-colors cursor-pointer"
                >
                  <RiTranslate2 className="h-4 w-4 text-neutral-500" />
                  <span>Pronunciation rules</span>
                </button>
              )}

              {onOpenTaggingHistory && (
                <button
                  type="button"
                  onClick={() => {
                    setToolsMenuOpen(false);
                    onOpenTaggingHistory();
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-900 flex items-center gap-2.5 transition-colors cursor-pointer"
                >
                  <RiHistoryLine className="h-4 w-4 text-neutral-500" />
                  <span>Tagging history</span>
                </button>
              )}

              {onOpenSettings && (
                <div className="pt-1 mt-1 border-t border-neutral-100 dark:border-neutral-800">
                  <button
                    type="button"
                    onClick={() => {
                      setToolsMenuOpen(false);
                      onOpenSettings();
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-900 flex items-center gap-2.5 transition-colors cursor-pointer"
                  >
                    <RiSettings3Line className="h-4 w-4 text-neutral-500" />
                    <span>Project settings</span>
                  </button>
                </div>
              )}
            </PopoverContent>
          </Popover>

          <div className="h-4 w-[1px] bg-neutral-200 dark:bg-neutral-800" />

          {/* Theme Toggle */}
          <ThemeToggle />

          <div className="h-4 w-[1px] bg-neutral-200 dark:bg-neutral-800" />

          {/* User Profile Navigation */}
          <NavbarUserMenu />
        </div>
      </div>
    </header>
  );
}

export default WorkspaceTopBar;
