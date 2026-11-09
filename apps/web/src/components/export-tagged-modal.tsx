import { useState, useEffect, useMemo } from "react";
import {
  RiDownload2Line,
  RiCheckLine,
  RiLoader4Line,
  RiAlertLine,
  RiBookOpenLine,
  RiCodeSSlashLine,
  RiFileTextLine,
  RiSparklingLine,
  RiCheckboxCircleLine,
  RiCheckboxBlankCircleLine,
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
import type { TaggedProjectSummary } from "@novelova/shared-types";
import {
  getTaggedProjectsSummary,
  downloadTaggedDataset,
} from "@/services/tagged-dataset";
import { cn } from "@/lib/utils";

export interface ExportTaggedModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ExportTaggedModal({
  open,
  onOpenChange,
}: ExportTaggedModalProps) {
  const [projects, setProjects] = useState<TaggedProjectSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [format, setFormat] = useState<"json" | "txt">("json");
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);

  // Load summary on open
  useEffect(() => {
    if (!open) {
      setErrorMessage(null);
      setExportSuccess(false);
      return;
    }

    let isMounted = true;
    async function loadData() {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const data = await getTaggedProjectsSummary();
        if (isMounted) {
          setProjects(data);
          // By default all projects are selected
          setSelectedIds(new Set(data.map((p) => p.id)));
        }
      } catch (err: unknown) {
        if (isMounted) {
          const msg = err instanceof Error ? err.message : "Failed to load tagged projects summary.";
          setErrorMessage(msg);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadData();
    return () => {
      isMounted = false;
    };
  }, [open]);

  // Toggle selection
  const handleToggleProject = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedIds(new Set(projects.map((p) => p.id)));
  };

  const handleDeselectAll = () => {
    setSelectedIds(new Set());
  };

  // Selected totals
  const selectedStats = useMemo(() => {
    const selected = projects.filter((p) => selectedIds.has(p.id));
    return {
      novelsCount: selected.length,
      chaptersCount: selected.reduce((acc, p) => acc + p.tagged_chapters_count, 0),
      segmentsCount: selected.reduce((acc, p) => acc + p.tagged_segments_count, 0),
      dialogueCount: selected.reduce((acc, p) => acc + p.dialogue_segments_count, 0),
      wordsCount: selected.reduce((acc, p) => acc + p.total_words, 0),
    };
  }, [projects, selectedIds]);

  const handleExport = async () => {
    if (selectedIds.size === 0) return;

    setIsExporting(true);
    setErrorMessage(null);
    setExportSuccess(false);

    try {
      await downloadTaggedDataset({
        project_ids: Array.from(selectedIds),
        format,
      });
      setExportSuccess(true);
      setTimeout(() => {
        onOpenChange(false);
      }, 1500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to export tagged dataset.";
      setErrorMessage(msg);
    } finally {
      setIsExporting(false);
    }
  };

  const allSelected = projects.length > 0 && selectedIds.size === projects.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden bg-white dark:bg-neutral-950 border-neutral-200 dark:border-neutral-800 text-neutral-900 dark:text-neutral-100">
        {/* Header */}
        <DialogHeader className="p-6 pb-4 border-b border-neutral-100 dark:border-neutral-800/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100">
              <RiDownload2Line className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-semibold tracking-tight">
                Export Tagged Chapters
              </DialogTitle>
              <DialogDescription className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                Export complete tagged chapters as training datasets for fine-tuning dialogue attribution models.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {errorMessage && (
            <div className="p-3.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-600 dark:text-red-400 flex items-start gap-2.5">
              <RiAlertLine className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Format Picker */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
              Dataset Format
            </label>
            <div className="grid grid-cols-2 gap-3">
              {/* JSON Option */}
              <button
                type="button"
                onClick={() => setFormat("json")}
                className={cn(
                  "p-3.5 rounded-xl border text-left transition-all cursor-pointer relative",
                  format === "json"
                    ? "border-neutral-900 dark:border-neutral-100 bg-neutral-50/80 dark:bg-neutral-900 shadow-2xs"
                    : "border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 hover:border-neutral-300 dark:hover:border-neutral-700",
                )}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <RiCodeSSlashLine className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    <span className="font-semibold text-sm">JSON & JSONL</span>
                  </div>
                  {format === "json" && (
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  )}
                </div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
                  Includes full schemas per chapter + <code className="text-[11px] bg-neutral-200/60 dark:bg-neutral-800 px-1 py-0.5 rounded">fine_tuning_train.jsonl</code> ready for Unsloth, HuggingFace, and OpenAI fine-tuning.
                </p>
              </button>

              {/* TXT Option */}
              <button
                type="button"
                onClick={() => setFormat("txt")}
                className={cn(
                  "p-3.5 rounded-xl border text-left transition-all cursor-pointer relative",
                  format === "txt"
                    ? "border-neutral-900 dark:border-neutral-100 bg-neutral-50/80 dark:bg-neutral-900 shadow-2xs"
                    : "border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 hover:border-neutral-300 dark:hover:border-neutral-700",
                )}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <RiFileTextLine className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <span className="font-semibold text-sm">Plain Text (.txt)</span>
                  </div>
                  {format === "txt" && (
                    <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                  )}
                </div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
                  Screenplay transcript with speaker tags and character dossier per chapter + concatenated <code className="text-[11px] bg-neutral-200/60 dark:bg-neutral-800 px-1 py-0.5 rounded">all_tagged_dataset.txt</code>.
                </p>
              </button>
            </div>
          </div>

          {/* Project Selection Header */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                Select Novels to Export
              </label>
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={allSelected ? handleDeselectAll : handleSelectAll}
                  className="text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 font-medium underline underline-offset-2 cursor-pointer transition-colors"
                >
                  {allSelected ? "Deselect all" : "Select all"}
                </button>
              </div>
            </div>

            {/* Projects List Container */}
            <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden bg-neutral-50/40 dark:bg-neutral-900/40">
              {isLoading ? (
                <div className="p-8 text-center">
                  <p className="text-xs text-neutral-400 dark:text-neutral-500 shimmer-text">
                    Scanning library for tagged chapters....
                  </p>
                </div>
              ) : projects.length === 0 ? (
                <div className="p-8 text-center space-y-2">
                  <RiBookOpenLine className="h-8 w-8 text-neutral-300 dark:text-neutral-600 mx-auto" />
                  <p className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                    No tagged chapters found in any novel.
                  </p>
                  <p className="text-xs text-neutral-400 dark:text-neutral-500">
                    Run Stage B tagging on any novel chapter to export it into your fine-tuning dataset.
                  </p>
                </div>
              ) : (
                <ScrollFade className="max-h-56 overflow-y-auto divide-y divide-neutral-100 dark:divide-neutral-800/80">
                  {projects.map((proj) => {
                    const isSelected = selectedIds.has(proj.id);
                    return (
                      <div
                        key={proj.id}
                        onClick={() => handleToggleProject(proj.id)}
                        className={cn(
                          "px-4 py-3 flex items-center justify-between gap-3 cursor-pointer transition-colors",
                          isSelected
                            ? "bg-white dark:bg-neutral-900/90"
                            : "hover:bg-neutral-100/60 dark:hover:bg-neutral-800/40 opacity-70",
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {isSelected ? (
                            <RiCheckboxCircleLine className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          ) : (
                            <RiCheckboxBlankCircleLine className="h-4 w-4 text-neutral-300 dark:text-neutral-600 shrink-0" />
                          )}
                          <div className="min-w-0">
                            <h4 className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                              {proj.title}
                            </h4>
                            <p className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
                              {proj.author ? `By ${proj.author} · ` : ""}
                              <span className="text-neutral-700 dark:text-neutral-300 font-medium">
                                {proj.tagged_chapters_count}
                              </span>{" "}
                              of {proj.total_chapters} chapters tagged
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300">
                            {proj.dialogue_segments_count.toLocaleString()} dialogues
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </ScrollFade>
              )}
            </div>
          </div>

          {/* Selected Summary Metrics Card */}
          {projects.length > 0 && (
            <div className="p-3.5 rounded-xl bg-neutral-100/70 dark:bg-neutral-900/80 border border-neutral-200/80 dark:border-neutral-800/80 flex items-center justify-between text-xs">
              <div className="space-y-0.5">
                <span className="text-neutral-500 dark:text-neutral-400">Total dataset scope:</span>
                <p className="font-semibold text-neutral-800 dark:text-neutral-200">
                  {selectedStats.novelsCount} novel{selectedStats.novelsCount === 1 ? "" : "s"} ·{" "}
                  {selectedStats.chaptersCount} chapters
                </p>
              </div>
              <div className="text-right space-y-0.5">
                <span className="text-neutral-500 dark:text-neutral-400">Dialogue turns:</span>
                <p className="font-semibold text-emerald-600 dark:text-emerald-400">
                  {selectedStats.dialogueCount.toLocaleString()} turns
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 px-6 border-t border-neutral-100 dark:border-neutral-800/80 flex items-center justify-between bg-neutral-50/50 dark:bg-neutral-900/50">
          <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
            <RiSparklingLine className="h-3.5 w-3.5 text-amber-500" />
            <span>Structured for fine-tuning dialogue SLMs</span>
          </div>

          <div className="flex items-center gap-2.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isExporting}
              className="text-xs cursor-pointer"
            >
              Cancel
            </Button>

            <Button
              type="button"
              size="sm"
              onClick={handleExport}
              disabled={isExporting || selectedIds.size === 0}
              className={cn(
                "text-xs gap-1.5 cursor-pointer",
                exportSuccess
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                  : "bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-neutral-200 text-white dark:text-neutral-900",
              )}
            >
              {isExporting ? (
                <>
                  <RiLoader4Line className="h-3.5 w-3.5 animate-spin" />
                  <span>Packaging dataset...</span>
                </>
              ) : exportSuccess ? (
                <>
                  <RiCheckLine className="h-3.5 w-3.5" />
                  <span>Export complete!</span>
                </>
              ) : (
                <>
                  <RiDownload2Line className="h-3.5 w-3.5" />
                  <span>
                    Export {selectedStats.chaptersCount} Chapter{selectedStats.chaptersCount === 1 ? "" : "s"} (.zip)
                  </span>
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
