import { useState, useMemo, useEffect } from "react";
import {
  RiArchiveLine,
  RiDownload2Line,
  RiSearchLine,
  RiFolderDownloadLine,
  RiSparklingLine,
  RiLoader4Line,
  RiDiscLine,
  RiTimeLine,
  RiAlertLine,
} from "@remixicon/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollFade } from "@/components/ui/scroll-fade";
import type {
  Project,
  Chapter,
  PackagePreviewResponse,
} from "@novelova/shared-types";
import {
  getPackagePreview,
  downloadChapterMp3,
  downloadPackagedChaptersArchive,
} from "@/services/projects";
import { cn } from "@/lib/utils";

export interface PackageDownloadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
  chapters: Chapter[];
  onOpenGenerateModal?: () => void;
}

type PackagingMode = "all_synthesized" | "selected" | "range";

export function PackageDownloadDialog({
  open,
  onOpenChange,
  project,
  chapters,
  onOpenGenerateModal,
}: PackageDownloadDialogProps) {
  const [mode, setMode] = useState<PackagingMode>("all_synthesized");
  const [selectedChapterIds, setSelectedChapterIds] = useState<Set<string>>(new Set());
  const [rangeStart, setRangeStart] = useState<number>(1);
  const [rangeEnd, setRangeEnd] = useState<number>(Math.max(1, chapters.length));
  const [searchQuery, setSearchQuery] = useState("");
  const [previewData, setPreviewData] = useState<PackagePreviewResponse | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isPackaging, setIsPackaging] = useState(false);
  const [packagingMessage, setPackagingMessage] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch packaging preview when dialog opens
  useEffect(() => {
    if (!open || !project.id) return;
    let isMounted = true;
    setIsLoadingPreview(true);
    setErrorMessage(null);

    getPackagePreview(project.id)
      .then((data) => {
        if (isMounted) {
          setPreviewData(data);
          // Default selection to all synthesized chapters
          const synthIds = new Set(
            data.chapters.filter((c) => c.is_synthesized).map((c) => c.id),
          );
          setSelectedChapterIds(synthIds);
          setRangeEnd(Math.max(1, data.chapters.length));
        }
      })
      .catch((err) => {
        if (isMounted) {
          setErrorMessage(err instanceof Error ? err.message : "Failed to load package preview");
        }
      })
      .finally(() => {
        if (isMounted) setIsLoadingPreview(false);
      });

    return () => {
      isMounted = false;
    };
  }, [open, project.id]);

  // Combined chapter list from previewData or fallback to chapters prop
  const chapterList = useMemo(() => {
    if (previewData?.chapters && previewData.chapters.length > 0) {
      return previewData.chapters;
    }
    return chapters.map((c) => ({
      id: c.id,
      chapter_number: c.chapter_number,
      title: c.title,
      is_synthesized: Boolean(c.audio_url),
      duration_seconds: c.estimated_duration_seconds || 0,
      word_count: c.word_count || 0,
      filename: `${project.title} Chapter ${c.chapter_number}.mp3`,
    }));
  }, [previewData, chapters, project.title]);

  const synthesizedCount = useMemo(() => {
    return chapterList.filter((c) => c.is_synthesized).length;
  }, [chapterList]);

  // Filtered chapters for 'selected' mode search
  const filteredChapters = useMemo(() => {
    if (!searchQuery.trim()) return chapterList;
    const q = searchQuery.toLowerCase();
    return chapterList.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        `chapter ${c.chapter_number}`.includes(q) ||
        c.filename.toLowerCase().includes(q),
    );
  }, [chapterList, searchQuery]);

  // Targeted chapters based on selected mode
  const targetedChapters = useMemo(() => {
    if (mode === "all_synthesized") {
      return chapterList.filter((c) => c.is_synthesized);
    }
    if (mode === "selected") {
      return chapterList.filter((c) => selectedChapterIds.has(c.id) && c.is_synthesized);
    }
    if (mode === "range") {
      const min = Math.min(rangeStart, rangeEnd);
      const max = Math.max(rangeStart, rangeEnd);
      return chapterList.filter(
        (c) => c.chapter_number >= min && c.chapter_number <= max && c.is_synthesized,
      );
    }
    return [];
  }, [mode, chapterList, selectedChapterIds, rangeStart, rangeEnd]);

  // Total duration of targeted chapters
  const totalDurationSeconds = useMemo(() => {
    return targetedChapters.reduce((acc, c) => acc + (c.duration_seconds || 0), 0);
  }, [targetedChapters]);

  const durationFormatted = useMemo(() => {
    if (!totalDurationSeconds) return "0m";
    const hours = Math.floor(totalDurationSeconds / 3600);
    const mins = Math.floor((totalDurationSeconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  }, [totalDurationSeconds]);

  // Estimated archive size based on 192kbps MP3
  const estimatedSizeMB = useMemo(() => {
    // 192 kbps = 24 KB/s = ~1.44 MB per minute
    if (totalDurationSeconds <= 0) return 0;
    const mb = (totalDurationSeconds * 24) / 1024;
    return Math.max(1, Math.round(mb));
  }, [totalDurationSeconds]);

  const toggleChapterSelection = (chapterId: string) => {
    setSelectedChapterIds((prev) => {
      const next = new Set(prev);
      if (next.has(chapterId)) {
        next.delete(chapterId);
      } else {
        next.add(chapterId);
      }
      return next;
    });
  };

  const selectAllSynthesized = () => {
    const allIds = new Set(chapterList.filter((c) => c.is_synthesized).map((c) => c.id));
    setSelectedChapterIds(allIds);
  };

  const clearSelection = () => {
    setSelectedChapterIds(new Set());
  };

  // Execute packaging & download
  const handleDownload = async (directSingleMp3 = false) => {
    if (targetedChapters.length === 0) return;
    setIsPackaging(true);
    setErrorMessage(null);

    try {
      if (directSingleMp3 && targetedChapters.length === 1) {
        const singleCh = targetedChapters[0];
        setPackagingMessage(
          `Packaging Chapter ${singleCh.chapter_number} with ID3 metadata & cover art...`,
        );
        await downloadChapterMp3(project.id, singleCh.id, singleCh.filename);
      } else {
        setPackagingMessage(
          `Compiling ${targetedChapters.length} chapter MP3s into structured archive...`,
        );
        const payloadIds =
          mode === "selected" ? targetedChapters.map((c) => c.id) : undefined;
        const payloadStart = mode === "range" ? Math.min(rangeStart, rangeEnd) : undefined;
        const payloadEnd = mode === "range" ? Math.max(rangeStart, rangeEnd) : undefined;

        await downloadPackagedChaptersArchive(
          project.id,
          {
            mode,
            chapter_ids: payloadIds,
            range_start: payloadStart,
            range_end: payloadEnd,
          },
          previewData?.archive_filename || `${project.title}.zip`,
        );
      }
      onOpenChange(false);
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to package and download chapters.",
      );
    } finally {
      setIsPackaging(false);
      setPackagingMessage("");
    }
  };

  const safeProjectTitle = previewData?.safe_project_title || project.title;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 shadow-2xl">
        {/* Dialog Header */}
        <div className="p-6 pb-4 border-b border-neutral-100 dark:border-neutral-800 flex items-start justify-between">
          <div>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-900 dark:text-neutral-100">
                  <RiFolderDownloadLine className="h-4 w-4" />
                </div>
                <DialogTitle className="text-base font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
                  <span>Package & Download Audio</span>
                  {isLoadingPreview && (
                    <RiLoader4Line className="h-3.5 w-3.5 animate-spin text-neutral-400" />
                  )}
                </DialogTitle>
                <Badge
                  variant="outline"
                  className="text-[10px] uppercase font-mono font-semibold tracking-wider text-neutral-600 dark:text-neutral-400 bg-neutral-50 dark:bg-neutral-900"
                >
                  Studio MP3
                </Badge>
              </div>
              <DialogDescription className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                Export single stitched MP3 files with embedded ID3 metadata and album art. Zero segment sprawl.
              </DialogDescription>
            </DialogHeader>
          </div>
        </div>

        {/* Project & Format Specification Banner */}
        <div className="px-6 py-3.5 bg-neutral-50 dark:bg-neutral-900/60 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {previewData?.cover_art_url ? (
              <img
                src={previewData.cover_art_url}
                alt={project.title}
                className="w-11 h-11 rounded-lg object-cover border border-neutral-200 dark:border-neutral-800 shadow-2xs shrink-0"
              />
            ) : (
              <div className="w-11 h-11 rounded-lg bg-neutral-200 dark:bg-neutral-800 flex items-center justify-center shrink-0 border border-neutral-300 dark:border-neutral-700">
                <RiDiscLine className="h-5 w-5 text-neutral-500" />
              </div>
            )}
            <div className="min-w-0">
              <h4 className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                {project.title}
              </h4>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
                by {project.author || "Author unassigned"} · {project.genre || "Audiobook"}
              </p>
              <div className="flex items-center gap-2 mt-0.5 text-[10px] text-neutral-400 dark:text-neutral-500 font-mono">
                <span>Output: {safeProjectTitle} Chapter X.mp3</span>
              </div>
            </div>
          </div>

          <div className="hidden sm:flex flex-col items-end shrink-0 text-right">
            <span className="text-[11px] font-medium text-neutral-700 dark:text-neutral-300">
              192 kbps CBR · ID3v2.3
            </span>
            <span className="text-[10px] text-neutral-400 dark:text-neutral-500 font-mono">
              Target: ~/Downloads/{safeProjectTitle}/
            </span>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5">
          {/* Packaging Scope Mode Switcher */}
          <div>
            <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300 block mb-2">
              Packaging Mode
            </label>
            <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-neutral-100 dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800">
              <button
                type="button"
                onClick={() => setMode("all_synthesized")}
                className={cn(
                  "py-2 px-3 rounded-lg text-xs font-medium transition-all cursor-pointer flex flex-col items-center justify-center text-center",
                  mode === "all_synthesized"
                    ? "bg-white dark:bg-neutral-800 text-neutral-950 dark:text-white shadow-2xs font-semibold"
                    : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-white",
                )}
              >
                <span>All Synthesized</span>
                <span className="text-[10px] text-neutral-400 dark:text-neutral-500 mt-0.5">
                  {synthesizedCount} of {chapterList.length} ready
                </span>
              </button>

              <button
                type="button"
                onClick={() => setMode("selected")}
                className={cn(
                  "py-2 px-3 rounded-lg text-xs font-medium transition-all cursor-pointer flex flex-col items-center justify-center text-center",
                  mode === "selected"
                    ? "bg-white dark:bg-neutral-800 text-neutral-950 dark:text-white shadow-2xs font-semibold"
                    : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-white",
                )}
              >
                <span>Select Specific</span>
                <span className="text-[10px] text-neutral-400 dark:text-neutral-500 mt-0.5">
                  Pick individual chapters
                </span>
              </button>

              <button
                type="button"
                onClick={() => setMode("range")}
                className={cn(
                  "py-2 px-3 rounded-lg text-xs font-medium transition-all cursor-pointer flex flex-col items-center justify-center text-center",
                  mode === "range"
                    ? "bg-white dark:bg-neutral-800 text-neutral-950 dark:text-white shadow-2xs font-semibold"
                    : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-white",
                )}
              >
                <span>Chapter Range</span>
                <span className="text-[10px] text-neutral-400 dark:text-neutral-500 mt-0.5">
                  From Ch A to B
                </span>
              </button>
            </div>
          </div>

          {/* Mode 1: All Synthesized Overview */}
          {mode === "all_synthesized" && (
            <div className="rounded-xl border border-neutral-200/90 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/30 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                  Ready for Production Export
                </span>
                <Badge variant="secondary" className="text-xs font-mono">
                  {synthesizedCount} Chapters
                </Badge>
              </div>

              {synthesizedCount === 0 ? (
                <div className="py-6 text-center space-y-2">
                  <RiAlertLine className="h-6 w-6 text-amber-500 mx-auto" />
                  <p className="text-xs font-medium text-neutral-800 dark:text-neutral-200">
                    No chapters have synthesized audio yet
                  </p>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 max-w-sm mx-auto">
                    Please synthesize chapter audio using the Kaggle Stage C worker before packaging.
                  </p>
                  {onOpenGenerateModal && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        onOpenChange(false);
                        onOpenGenerateModal();
                      }}
                      className="mt-2 text-xs"
                    >
                      <RiSparklingLine className="h-3.5 w-3.5 mr-1.5" />
                      Generate Audio
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-1 text-xs text-neutral-600 dark:text-neutral-400">
                  <p>
                    All {synthesizedCount} synthesized chapters will be compiled into individual,
                    high-definition MP3 tracks inside a folder named{" "}
                    <code className="text-neutral-900 dark:text-neutral-100 font-semibold font-mono">
                      {safeProjectTitle}
                    </code>
                    .
                  </p>
                  <div className="flex items-center gap-4 pt-2 text-[11px] text-neutral-500 dark:text-neutral-400">
                    <span className="flex items-center gap-1">
                      <RiTimeLine className="h-3.5 w-3.5" /> Total Duration: {durationFormatted}
                    </span>
                    <span className="flex items-center gap-1">
                      <RiArchiveLine className="h-3.5 w-3.5" /> Est. Size: ~{estimatedSizeMB} MB
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Mode 2: Interactive Checkbox List */}
          {mode === "selected" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                {/* Search */}
                <div className="relative flex-1 max-w-xs">
                  <RiSearchLine className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400" />
                  <input
                    type="text"
                    placeholder="Search chapters..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-1 text-xs rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-hidden focus:border-neutral-900 dark:focus:border-neutral-100"
                  />
                </div>

                {/* Quick Selection Buttons */}
                <div className="flex items-center gap-1.5 shrink-0 text-xs">
                  <button
                    type="button"
                    onClick={selectAllSynthesized}
                    className="px-2 py-1 rounded-md text-[11px] font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                  >
                    Select All Ready
                  </button>
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="px-2 py-1 rounded-md text-[11px] font-medium text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
              </div>

              {/* Scrollable Checkbox List */}
              <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl max-h-56 overflow-y-auto divide-y divide-neutral-100 dark:divide-neutral-900">
                <ScrollFade>
                  {filteredChapters.length === 0 ? (
                    <div className="p-6 text-center text-xs text-neutral-400 dark:text-neutral-500">
                      No matching chapters found
                    </div>
                  ) : (
                    filteredChapters.map((ch) => {
                      const isSelected = selectedChapterIds.has(ch.id);
                      const isReady = ch.is_synthesized;

                      return (
                        <div
                          key={ch.id}
                          onClick={() => {
                            if (isReady) toggleChapterSelection(ch.id);
                          }}
                          className={cn(
                            "flex items-center justify-between p-2.5 transition-colors select-none",
                            isReady
                              ? "hover:bg-neutral-50 dark:hover:bg-neutral-900/60 cursor-pointer"
                              : "opacity-40 bg-neutral-50/30 dark:bg-neutral-900/10 cursor-not-allowed",
                            isSelected && isReady && "bg-neutral-100/60 dark:bg-neutral-900/80",
                          )}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 pr-3">
                            <input
                              type="checkbox"
                              checked={isSelected && isReady}
                              disabled={!isReady}
                              onChange={() => {
                                if (isReady) toggleChapterSelection(ch.id);
                              }}
                              className="rounded border-neutral-300 dark:border-neutral-700 text-neutral-900 focus:ring-neutral-900 dark:focus:ring-neutral-100"
                            />
                            <span className="font-mono text-[11px] font-bold text-neutral-400 dark:text-neutral-500 w-6 shrink-0">
                              #{ch.chapter_number}
                            </span>
                            <span className="text-xs font-medium text-neutral-800 dark:text-neutral-200 truncate">
                              {ch.title}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {isReady ? (
                              <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60">
                                {ch.duration_seconds
                                  ? `${Math.floor(ch.duration_seconds / 60)}m ${ch.duration_seconds % 60}s`
                                  : "Synthesized"}
                              </span>
                            ) : (
                              <span className="text-[10px] text-neutral-400 dark:text-neutral-500 italic">
                                Not synthesized
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </ScrollFade>
              </div>
            </div>
          )}

          {/* Mode 3: Chapter Range Input */}
          {mode === "range" && (
            <div className="space-y-3 rounded-xl border border-neutral-200/90 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/30 p-4">
              <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 block">
                Select Sequential Chapter Range
              </span>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400 block mb-1">
                    From Chapter
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={chapterList.length || 1}
                    value={rangeStart}
                    onChange={(e) => setRangeStart(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 focus:outline-hidden focus:border-neutral-900"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400 block mb-1">
                    To Chapter
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={chapterList.length || 1}
                    value={rangeEnd}
                    onChange={(e) =>
                      setRangeEnd(Math.max(1, parseInt(e.target.value) || chapterList.length || 1))
                    }
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 focus:outline-hidden focus:border-neutral-900"
                  />
                </div>
              </div>

              {/* Quick Preset Buttons */}
              <div className="flex items-center gap-1.5 pt-1">
                <span className="text-[11px] text-neutral-400 mr-1">Presets:</span>
                <button
                  type="button"
                  onClick={() => {
                    setRangeStart(1);
                    setRangeEnd(Math.min(5, chapterList.length));
                  }}
                  className="px-2 py-0.5 rounded text-[11px] bg-neutral-200/80 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-300 dark:hover:bg-neutral-700 transition-colors cursor-pointer"
                >
                  Ch 1–5
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRangeStart(1);
                    setRangeEnd(Math.min(10, chapterList.length));
                  }}
                  className="px-2 py-0.5 rounded text-[11px] bg-neutral-200/80 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-300 dark:hover:bg-neutral-700 transition-colors cursor-pointer"
                >
                  Ch 1–10
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRangeStart(1);
                    setRangeEnd(chapterList.length);
                  }}
                  className="px-2 py-0.5 rounded text-[11px] bg-neutral-200/80 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-300 dark:hover:bg-neutral-700 transition-colors cursor-pointer"
                >
                  All ({chapterList.length})
                </button>
              </div>

              <div className="text-[11px] text-neutral-500 dark:text-neutral-400 pt-1">
                {targetedChapters.length} synthesized chapters fall within this range.
              </div>
            </div>
          )}

          {/* Active Packaging Status or Error Notice */}
          {isPackaging && (
            <div className="p-3.5 rounded-xl bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 flex items-center gap-3">
              <RiLoader4Line className="h-4 w-4 animate-spin text-neutral-700 dark:text-neutral-300 shrink-0" />
              <div className="min-w-0 text-xs">
                <span className="font-medium text-neutral-900 dark:text-neutral-100 block">
                  Packaging in Progress...
                </span>
                <span className="text-neutral-500 dark:text-neutral-400 text-[11px]">
                  {packagingMessage || "Transcoding audio and injecting ID3 metadata tags..."}
                </span>
              </div>
            </div>
          )}

          {errorMessage && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
              <RiAlertLine className="h-4 w-4 shrink-0 text-red-500" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        {/* Dialog Footer */}
        <div className="p-4 px-6 bg-neutral-50 dark:bg-neutral-900/60 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between gap-3">
          <div className="text-xs text-neutral-500 dark:text-neutral-400 flex items-center gap-2">
            <span>
              <strong className="text-neutral-900 dark:text-neutral-100 font-semibold">
                {targetedChapters.length}
              </strong>{" "}
              chapter{targetedChapters.length === 1 ? "" : "s"} selected
            </span>
            {targetedChapters.length > 0 && (
              <>
                <span>·</span>
                <span>{durationFormatted}</span>
                <span>·</span>
                <span>~{estimatedSizeMB} MB</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isPackaging}
              className="text-xs"
            >
              Cancel
            </Button>

            {targetedChapters.length === 1 ? (
              <Button
                type="button"
                size="sm"
                onClick={() => handleDownload(true)}
                disabled={isPackaging}
                className="text-xs bg-neutral-900 dark:bg-white text-white dark:text-neutral-950 hover:bg-neutral-800 dark:hover:bg-neutral-100 shadow-2xs"
              >
                {isPackaging ? (
                  <>
                    <RiLoader4Line className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    Packaging...
                  </>
                ) : (
                  <>
                    <RiDownload2Line className="h-3.5 w-3.5 mr-1.5" />
                    Download MP3
                  </>
                )}
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                onClick={() => handleDownload(false)}
                disabled={isPackaging || targetedChapters.length === 0}
                className="text-xs bg-neutral-900 dark:bg-white text-white dark:text-neutral-950 hover:bg-neutral-800 dark:hover:bg-neutral-100 shadow-2xs"
              >
                {isPackaging ? (
                  <>
                    <RiLoader4Line className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    Packaging...
                  </>
                ) : (
                  <>
                    <RiFolderDownloadLine className="h-3.5 w-3.5 mr-1.5" />
                    Package & Download (.zip)
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default PackageDownloadDialog;
