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
  RiCheckboxCircleLine,
  RiVolumeUpLine,
} from "@remixicon/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
import { generateChapterPackaging } from "@/services/voice-design";
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
  const [isGeneratingMeta, setIsGeneratingMeta] = useState(false);
  const [packagingMessage, setPackagingMessage] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !project.id) return;
    let isMounted = true;
    setIsLoadingPreview(true);
    setErrorMessage(null);
    setPackagingMessage("");
    setSearchQuery("");

    getPackagePreview(project.id)
      .then((data) => {
        if (isMounted) {
          setPreviewData(data);
          const synthIds = new Set(
            data.chapters.filter((c) => c.is_synthesized).map((c) => c.id),
          );
          setSelectedChapterIds(synthIds);
          setRangeEnd(Math.max(1, data.chapters.length));
        }
      })
      .catch((err) => {
        if (isMounted) {
          setErrorMessage(err instanceof Error ? err.message : "Failed to load export preview.");
        }
      })
      .finally(() => {
        if (isMounted) setIsLoadingPreview(false);
      });

    return () => {
      isMounted = false;
    };
  }, [open, project.id]);

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

  const synthesizedCount = useMemo(
    () => chapterList.filter((c) => c.is_synthesized).length,
    [chapterList],
  );

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

  const totalDurationSeconds = useMemo(
    () => targetedChapters.reduce((acc, c) => acc + (c.duration_seconds || 0), 0),
    [targetedChapters],
  );

  const durationFormatted = useMemo(() => {
    if (!totalDurationSeconds) return "0m";
    const hours = Math.floor(totalDurationSeconds / 3600);
    const mins = Math.floor((totalDurationSeconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  }, [totalDurationSeconds]);

  const estimatedSizeMB = useMemo(() => {
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

  const handleDownload = async (directSingleMp3 = false) => {
    if (targetedChapters.length === 0) return;
    setIsPackaging(true);
    setErrorMessage(null);

    try {
      if (directSingleMp3 && targetedChapters.length === 1) {
        const singleCh = targetedChapters[0];
        setPackagingMessage(
          `Packaging Chapter ${singleCh.chapter_number} with cover art & ID3 metadata…`,
        );
        await downloadChapterMp3(project.id, singleCh.id, singleCh.filename);
      } else {
        setPackagingMessage(
          `Compiling ${targetedChapters.length} chapter MP3s into archive…`,
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

  const handleGenerateMetadata = async () => {
    if (targetedChapters.length === 0) return;
    setIsGeneratingMeta(true);
    setErrorMessage(null);
    try {
      const res = await generateChapterPackaging(project.id, {
        chapter_ids: targetedChapters.slice(0, 10).map((c) => c.id),
      });
      setPackagingMessage(res.message);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to generate episode metadata.",
      );
    } finally {
      setIsGeneratingMeta(false);
    }
  };

  const safeProjectTitle = previewData?.safe_project_title || project.title;
  const hasReadyAudio = synthesizedCount > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[540px] p-0 gap-0 overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl flex flex-col max-h-[88vh]">
        {/* Compact Studio Header */}
        <div className="px-5 pt-5 pb-4 border-b border-border/80 shrink-0">
          <DialogHeader className="space-y-1 text-left pr-6">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-secondary border border-border flex items-center justify-center text-foreground shrink-0">
                <RiFolderDownloadLine className="h-4 w-4" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="font-display text-base font-semibold text-foreground tracking-tight flex items-center gap-2">
                  <span>Export Audio</span>
                  {isLoadingPreview && (
                    <RiLoader4Line className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-hidden="true" />
                  )}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Download ready chapters as MP3 with cover art and embedded metadata.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        {/* Book Metadata Strip */}
        <div className="px-5 py-3 bg-secondary/35 border-b border-border/80 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {previewData?.cover_art_url ? (
              <img
                src={previewData.cover_art_url}
                alt={project.title}
                width={40}
                height={40}
                className="w-10 h-10 rounded-lg object-cover border border-border shrink-0"
              />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-secondary border border-border flex items-center justify-center shrink-0">
                <RiDiscLine className="h-4.5 w-4.5 text-muted-foreground" aria-hidden="true" />
              </div>
            )}
            <div className="min-w-0">
              <div className="text-xs font-medium text-foreground truncate">
                {project.title}
              </div>
              <div className="text-[11px] text-muted-foreground truncate">
                {project.author || "Unknown author"}
                {project.genre ? ` · ${project.genre}` : ""}
              </div>
            </div>
          </div>

          <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-md bg-card border border-border text-[10.5px] font-mono text-muted-foreground shrink-0">
            192 kbps MP3 · ID3
          </span>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
          {errorMessage && (
            <div
              role="alert"
              className="p-3 rounded-xl border border-destructive/25 bg-destructive/10 text-destructive text-xs flex items-start gap-2.5"
            >
              <RiAlertLine className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
              <p className="leading-relaxed">{errorMessage}</p>
            </div>
          )}

          {!hasReadyAudio && !isLoadingPreview ? (
            /* Clean, Focused Empty State (No disabled clutter) */
            <div className="py-8 px-4 text-center space-y-3">
              <div className="mx-auto h-11 w-11 rounded-xl bg-secondary border border-border flex items-center justify-center text-muted-foreground">
                <RiVolumeUpLine className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="space-y-1 max-w-xs mx-auto">
                <p className="text-sm font-medium text-foreground">
                  No chapters ready to export
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Generate audio for at least one chapter first, then return here to download MP3 files or a ZIP archive.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Scope Segmented Control */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-foreground">Chapters to Export</span>
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    {synthesizedCount.toLocaleString()} of {chapterList.length.toLocaleString()} ready
                  </span>
                </div>

                <div
                  role="radiogroup"
                  aria-label="Export chapter selection mode"
                  className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-secondary/60 border border-border/60"
                >
                  {(
                    [
                      {
                        id: "all_synthesized",
                        title: "All Ready",
                        sub: `${synthesizedCount.toLocaleString()} chapter${synthesizedCount === 1 ? "" : "s"}`,
                      },
                      {
                        id: "selected",
                        title: "Select",
                        sub: `${selectedChapterIds.size.toLocaleString()} picked`,
                      },
                      {
                        id: "range",
                        title: "Range",
                        sub: `Ch. ${rangeStart}–${rangeEnd}`,
                      },
                    ] as const
                  ).map((opt) => {
                    const active = mode === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setMode(opt.id)}
                        className={cn(
                          "px-2.5 py-2 rounded-lg text-left transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          active
                            ? "bg-card text-foreground shadow-2xs border border-border/80"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <div className="text-xs font-medium leading-tight">{opt.title}</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5 tabular-nums truncate">
                          {opt.sub}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Mode 1: All Ready Summary */}
              {mode === "all_synthesized" && (
                <div className="rounded-xl border border-border bg-background/40 p-3.5 space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-2.5 rounded-lg bg-secondary/50 border border-border/60">
                      <div className="text-[10.5px] text-muted-foreground">Chapters</div>
                      <div className="text-sm font-semibold text-foreground tabular-nums mt-0.5">
                        {targetedChapters.length.toLocaleString()}
                      </div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-secondary/50 border border-border/60">
                      <div className="text-[10.5px] text-muted-foreground flex items-center gap-1">
                        <RiTimeLine className="h-3 w-3" aria-hidden="true" />
                        <span>Duration</span>
                      </div>
                      <div className="text-sm font-semibold text-foreground tabular-nums mt-0.5">
                        {durationFormatted}
                      </div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-secondary/50 border border-border/60">
                      <div className="text-[10.5px] text-muted-foreground flex items-center gap-1">
                        <RiArchiveLine className="h-3 w-3" aria-hidden="true" />
                        <span>Est. Size</span>
                      </div>
                      <div className="text-sm font-semibold text-foreground tabular-nums mt-0.5">
                        ~{estimatedSizeMB} MB
                      </div>
                    </div>
                  </div>

                  <div className="text-[11px] text-muted-foreground flex items-center justify-between gap-2 pt-1 border-t border-border/60">
                    <span>Filename pattern</span>
                    <code className="font-mono text-foreground truncate">
                      {safeProjectTitle} Chapter X.mp3
                    </code>
                  </div>
                </div>
              )}

              {/* Mode 2: Select Specific Chapters */}
              {mode === "selected" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="relative flex-1">
                      <RiSearchLine
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none"
                        aria-hidden="true"
                      />
                      <input
                        type="search"
                        aria-label="Search chapters"
                        placeholder="Search chapters…"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={selectAllSynthesized}
                        className="px-2 py-1 rounded-md text-[11px] font-medium text-foreground hover:bg-secondary transition-colors cursor-pointer"
                      >
                        Select ready
                      </button>
                      <button
                        type="button"
                        onClick={clearSelection}
                        className="px-2 py-1 rounded-md text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  <div className="border border-border rounded-xl max-h-52 overflow-y-auto divide-y divide-border/70 bg-background/40">
                    <ScrollFade>
                      {filteredChapters.length === 0 ? (
                        <div className="p-6 text-center text-xs text-muted-foreground">
                          No matching chapters found
                        </div>
                      ) : (
                        filteredChapters.map((ch) => {
                          const isSelected = selectedChapterIds.has(ch.id);
                          const isReady = ch.is_synthesized;

                          return (
                            <label
                              key={ch.id}
                              className={cn(
                                "flex items-center justify-between px-3 py-2 transition-colors select-none",
                                isReady
                                  ? "hover:bg-secondary/50 cursor-pointer"
                                  : "opacity-45 cursor-not-allowed",
                                isSelected && isReady && "bg-secondary/70",
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
                                  className="rounded border-border accent-primary"
                                />
                                <span className="font-mono text-[11px] text-muted-foreground w-7 shrink-0 tabular-nums">
                                  #{ch.chapter_number}
                                </span>
                                <span className="text-xs font-medium text-foreground truncate">
                                  {ch.title}
                                </span>
                              </div>

                              <div className="shrink-0">
                                {isReady ? (
                                  <span className="text-[10.5px] font-mono tabular-nums px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                                    {ch.duration_seconds
                                      ? `${Math.floor(ch.duration_seconds / 60)}m ${ch.duration_seconds % 60}s`
                                      : "Ready"}
                                  </span>
                                ) : (
                                  <span className="text-[10.5px] text-muted-foreground">
                                    No audio
                                  </span>
                                )}
                              </div>
                            </label>
                          );
                        })
                      )}
                    </ScrollFade>
                  </div>
                </div>
              )}

              {/* Mode 3: Chapter Range */}
              {mode === "range" && (
                <div className="rounded-xl border border-border bg-background/40 p-3.5 space-y-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-background">
                      <label
                        htmlFor="export-range-from"
                        className="text-[11px] text-muted-foreground shrink-0"
                      >
                        From
                      </label>
                      <input
                        id="export-range-from"
                        type="number"
                        min={1}
                        max={chapterList.length || 1}
                        value={rangeStart}
                        onChange={(e) =>
                          setRangeStart(Math.max(1, parseInt(e.target.value, 10) || 1))
                        }
                        className="w-full bg-transparent text-xs font-mono text-foreground focus-visible:outline-none tabular-nums"
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">to</span>
                    <div className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-background">
                      <label
                        htmlFor="export-range-to"
                        className="text-[11px] text-muted-foreground shrink-0"
                      >
                        To
                      </label>
                      <input
                        id="export-range-to"
                        type="number"
                        min={1}
                        max={chapterList.length || 1}
                        value={rangeEnd}
                        onChange={(e) =>
                          setRangeEnd(
                            Math.max(1, parseInt(e.target.value, 10) || chapterList.length || 1),
                          )
                        }
                        className="w-full bg-transparent text-xs font-mono text-foreground focus-visible:outline-none tabular-nums"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground">Presets:</span>
                      {[
                        { label: "1–5", end: Math.min(5, chapterList.length) },
                        { label: "1–10", end: Math.min(10, chapterList.length) },
                        { label: `All (${chapterList.length})`, end: chapterList.length },
                      ].map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => {
                            setRangeStart(1);
                            setRangeEnd(Math.max(1, preset.end));
                          }}
                          className="px-2 py-0.5 rounded-md bg-secondary text-foreground hover:bg-secondary/80 transition-colors cursor-pointer tabular-nums"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                    <span className="text-muted-foreground tabular-nums">
                      {targetedChapters.length} ready
                    </span>
                  </div>
                </div>
              )}

              {/* Optional AI Episode Metadata Row (Kept out of cramped footer) */}
              <div className="px-3.5 py-2.5 rounded-xl border border-border bg-background/40 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-foreground">
                    AI Episode Metadata
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">
                    Auto-generate podcast episode titles and descriptions before export.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleGenerateMetadata}
                  disabled={isGeneratingMeta || isPackaging || targetedChapters.length === 0}
                  className="h-7 px-2.5 text-[11px] shrink-0"
                >
                  {isGeneratingMeta ? (
                    <>
                      <RiLoader4Line className="h-3 w-3 animate-spin mr-1" aria-hidden="true" />
                      Generating…
                    </>
                  ) : (
                    <>
                      <RiSparklingLine className="h-3 w-3 mr-1 text-violet-500" aria-hidden="true" />
                      Generate
                    </>
                  )}
                </Button>
              </div>
            </>
          )}

          {/* Active Packaging / Success Status */}
          {isPackaging && (
            <div
              role="status"
              aria-live="polite"
              className="p-3 rounded-xl bg-secondary/60 border border-border flex items-center gap-2.5 text-xs"
            >
              <RiLoader4Line className="h-4 w-4 animate-spin text-foreground shrink-0" aria-hidden="true" />
              <span className="text-foreground">
                {packagingMessage || "Packaging audio and embedding metadata…"}
              </span>
            </div>
          )}

          {!isPackaging && packagingMessage && (
            <div
              role="status"
              aria-live="polite"
              className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2"
            >
              <RiCheckboxCircleLine className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{packagingMessage}</span>
            </div>
          )}
        </div>

        {/* Calm Studio Footer */}
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-t border-border/80 bg-secondary/30 shrink-0">
          <div className="text-xs text-muted-foreground min-w-0 truncate tabular-nums">
            {hasReadyAudio ? (
              <>
                <span className="font-medium text-foreground">
                  {targetedChapters.length.toLocaleString()} chapter{targetedChapters.length === 1 ? "" : "s"}
                </span>
                {targetedChapters.length > 0 && (
                  <>
                    <span className="mx-1.5 opacity-40">·</span>
                    <span>{durationFormatted}</span>
                    <span className="mx-1.5 opacity-40">·</span>
                    <span>~{estimatedSizeMB} MB</span>
                  </>
                )}
              </>
            ) : (
              <span>0 of {chapterList.length.toLocaleString()} chapters synthesized</span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isPackaging}
              className="h-8 text-xs"
            >
              {hasReadyAudio ? "Cancel" : "Close"}
            </Button>

            {!hasReadyAudio && onOpenGenerateModal ? (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  onOpenChange(false);
                  onOpenGenerateModal();
                }}
                className="h-8 px-3.5 text-xs font-medium gap-1.5"
              >
                <RiSparklingLine className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Generate Audio</span>
              </Button>
            ) : targetedChapters.length === 1 ? (
              <Button
                type="button"
                size="sm"
                onClick={() => handleDownload(true)}
                disabled={isPackaging}
                className="h-8 px-3.5 text-xs font-medium gap-1.5"
              >
                {isPackaging ? (
                  <>
                    <RiLoader4Line className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    <span>Packaging…</span>
                  </>
                ) : (
                  <>
                    <RiDownload2Line className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Download MP3</span>
                  </>
                )}
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                onClick={() => handleDownload(false)}
                disabled={isPackaging || targetedChapters.length === 0}
                className="h-8 px-3.5 text-xs font-medium gap-1.5"
              >
                {isPackaging ? (
                  <>
                    <RiLoader4Line className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    <span>Packaging…</span>
                  </>
                ) : (
                  <>
                    <RiFolderDownloadLine className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Download ZIP</span>
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
