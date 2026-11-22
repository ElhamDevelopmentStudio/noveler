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
  RiFolderDownloadLine,
  RiFileZipLine,
} from "@remixicon/react";
import { BrandLogo } from "@/components/brand-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { NavbarUserMenu } from "@/components/navbar-user-menu";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import type { Project, Chapter, TaggingJob, ParseJob } from "@novelova/shared-types";
import { downloadFullProjectArchive } from "@/services/projects";
import { TaggingLatestRunPopover } from "./tagging-latest-run-popover";
import { cn } from "@/lib/utils";

interface WorkspaceTopBarProps {
  project?: Project | null;
  chapters?: Chapter[];
  activeChapterId?: string;
  onSelectChapter?: (chapterId: string) => void;
  onOpenParseDialog?: () => void;
  isParsing?: boolean;
  parseJob?: ParseJob | null;
  isFormatting?: boolean;
  formatJob?: ParseJob | null;
  onRunTagging?: () => void;
  isTagging?: boolean;
  onOpenTaggingHistory?: () => void;
  onOpenVoiceCasting?: () => void;
  onOpenPronunciation?: () => void;
  onOpenSettings?: () => void;
  onOpenPackageDialog?: () => void;
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
  isParsing,
  parseJob,
  isFormatting,
  formatJob,
  onRunTagging,
  isTagging,
  onOpenTaggingHistory,
  onOpenVoiceCasting,
  onOpenPronunciation,
  onOpenSettings,
  onOpenPackageDialog,
  latestJob,
  totalRunsCount,
  onCancelTagging,
}: WorkspaceTopBarProps) {
  const [chapterMenuOpen, setChapterMenuOpen] = useState(false);
  const [chapterSearch, setChapterSearch] = useState("");
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false);
  const [isExportingArchive, setIsExportingArchive] = useState(false);

  const handleExportArchive = async () => {
    if (!project?.id || isExportingArchive) return;
    setIsExportingArchive(true);
    try {
      const safeTitle = (project.title || "project")
        .replace(/[^\w\s-]/g, "")
        .trim()
        .replace(/\s+/g, "_");
      await downloadFullProjectArchive(project.id, `${safeTitle}_archive.zip`);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to export project archive.");
    } finally {
      setIsExportingArchive(false);
      setToolsMenuOpen(false);
    }
  };

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
    <header className="h-13 shrink-0 border-b border-border/80 bg-white dark:bg-[#0c0a09] sticky top-0 z-30 select-none transition-colors">
      <div className="w-full h-full px-3 sm:px-4 flex items-center justify-between gap-2 sm:gap-3 min-w-0">
        {/* Left: Back & Brand */}
        <div className="flex items-center gap-2 shrink-0">
          <Link
            to="/projects"
            className="p-1.5 rounded-lg text-neutral-600 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800/80 transition-colors"
            title="Back to projects"
            aria-label="Back to projects"
          >
            <RiArrowLeftLine className="h-4 w-4" />
          </Link>

          <NavLink
            to="/projects"
            className="hidden sm:flex items-center text-neutral-950 dark:text-neutral-100 hover:opacity-80 transition-opacity"
            title="Novelova Studio"
          >
            <BrandLogo className="h-5 w-5 text-neutral-950 dark:text-neutral-100" />
          </NavLink>

          <div className="h-4 w-[1px] bg-border hidden lg:block" />

          <NavLink
            to="/projects"
            className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors hidden lg:block whitespace-nowrap"
          >
            Projects
          </NavLink>
        </div>

        {/* Center: Project Name & Chapter Selector (Never collides at 1024px) */}
        <div className="flex-1 min-w-0 flex flex-col items-center justify-center text-center px-1">
          <div className="flex items-center justify-center gap-1 min-w-0 max-w-full">
            <span
              className="text-sm font-medium tracking-tight text-foreground truncate max-w-[140px] sm:max-w-[200px] xl:max-w-[260px]"
              title={project?.title || "Project"}
            >
              {project?.title || "Untitled Project"}
            </span>

            <span className="text-neutral-300 dark:text-neutral-700 font-light select-none px-0.5 hidden lg:inline shrink-0">
              /
            </span>

            {/* Chapter Selector (shown at lg+; canvas subheader already shows chapter title on narrower screens) */}
            {hasChapters ? (
              <Popover open={chapterMenuOpen} onOpenChange={setChapterMenuOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="group hidden lg:inline-flex items-center gap-1 px-2 py-0.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-900 text-sm font-normal text-neutral-600 dark:text-neutral-300 hover:text-neutral-950 dark:hover:text-white transition-colors cursor-pointer select-none min-w-0 max-w-[160px] xl:max-w-[220px]"
                    title="Switch chapter"
                  >
                    <span className="truncate">
                      {activeChapter?.title || "Select Chapter"}
                    </span>
                    <RiArrowDownSLine
                      className={cn(
                        "h-3.5 w-3.5 text-neutral-400 group-hover:text-neutral-700 dark:group-hover:text-neutral-200 shrink-0 transition-transform duration-150",
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

          {/* Info Subtitle Line (hidden on compact mobile) */}
          {project && (
            <div className="hidden xl:flex text-[11px] text-muted-foreground font-normal items-center gap-1.5 select-none leading-none mt-0.5">
              <span className="truncate max-w-[160px]">
                {project.author ? `by ${project.author}` : "Author unassigned"}
              </span>
              <span className="text-border">·</span>
              <span className="capitalize">{statusSubtitle}</span>
            </div>
          )}
        </div>

        {/* Right: Studio Actions & Export CTA */}
        <div className="flex items-center justify-end gap-1.5 sm:gap-2 shrink-0">
          {/* Parse & Format */}
          {onOpenParseDialog && (
            <button
              type="button"
              onClick={onOpenParseDialog}
              className="hidden xl:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-white dark:bg-neutral-900 text-foreground hover:bg-neutral-50 dark:hover:bg-neutral-800 text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer"
              title={
                isParsing
                  ? `Parsing (${parseJob?.progress_percent ?? 0}%)`
                  : isFormatting
                    ? `Formatting (${formatJob?.progress_percent ?? 0}%)`
                    : "Parse & format manuscript"
              }
            >
              {isParsing || isFormatting ? (
                <>
                  <RiLoader4Line className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />
                  <span>
                    {isParsing
                      ? `Parsing (${parseJob?.progress_percent ?? 0}%)`
                      : `Formatting (${formatJob?.progress_percent ?? 0}%)`}
                  </span>
                </>
              ) : (
                <>
                  <RiSparklingLine className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span>Parse</span>
                </>
              )}
            </button>
          )}

          {/* Detect Speakers (Dialogue Tagging) */}
          {onRunTagging && (
            <div className="hidden md:inline-flex rounded-lg border border-border bg-white dark:bg-neutral-900 divide-x divide-border shrink-0">
              <button
                type="button"
                onClick={onRunTagging}
                disabled={isTagging}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-foreground hover:bg-neutral-50 dark:hover:bg-neutral-800 text-xs font-medium whitespace-nowrap transition-colors cursor-pointer disabled:opacity-50 rounded-l-lg"
                title={isTagging ? "Detecting speakers..." : "Detect speakers and dialogue delivery"}
              >
                {isTagging ? (
                  <RiLoader4Line className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />
                ) : (
                  <RiSparklingLine className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                )}
                <span className="hidden xl:inline">
                  {isTagging ? "Detecting..." : "Detect speakers"}
                </span>
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
                className="p-1.5 rounded-lg text-neutral-600 dark:text-neutral-300 hover:text-neutral-950 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
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

              {onOpenPackageDialog && (
                <button
                  type="button"
                  onClick={() => {
                    setToolsMenuOpen(false);
                    onOpenPackageDialog();
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-900 flex items-center gap-2.5 transition-colors cursor-pointer"
                >
                  <RiFolderDownloadLine className="h-4 w-4 text-neutral-500" />
                  <span>Package & download</span>
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

              {project?.id && (
                <button
                  type="button"
                  onClick={handleExportArchive}
                  disabled={isExportingArchive}
                  className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-900 flex items-center gap-2.5 transition-colors cursor-pointer disabled:opacity-50"
                  title="Export entire project, characters, chapters & history as a .zip"
                >
                  {isExportingArchive ? (
                    <RiLoader4Line className="h-4 w-4 animate-spin text-neutral-500" />
                  ) : (
                    <RiFileZipLine className="h-4 w-4 text-neutral-500" />
                  )}
                  <span>{isExportingArchive ? "Exporting archive..." : "Export archive (.zip)"}</span>
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

          {/* Primary Export / Package CTA (ElevenLabs solid ink button) */}
          {onOpenPackageDialog && (
            <button
              type="button"
              onClick={onOpenPackageDialog}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-950 text-white dark:bg-white dark:text-neutral-950 hover:opacity-90 active:scale-[0.98] text-xs font-medium whitespace-nowrap shrink-0 transition-[opacity,transform] duration-150 cursor-pointer"
              title="Export and package chapters as MP3"
            >
              <RiFolderDownloadLine className="h-3.5 w-3.5 shrink-0" />
              <span>Export</span>
            </button>
          )}

          <div className="h-4 w-[1px] bg-border hidden sm:block" />

          {/* Theme Toggle */}
          <div className="hidden sm:block">
            <ThemeToggle />
          </div>

          {/* User Profile Navigation */}
          <NavbarUserMenu />
        </div>
      </div>
    </header>
  );
}

export default WorkspaceTopBar;
