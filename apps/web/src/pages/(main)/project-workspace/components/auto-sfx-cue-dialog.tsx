import { useState } from "react";
import useSWR from "swr";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  RiCheckLine,
  RiLoader4Line,
  RiSparklingLine,
} from "@remixicon/react";
import type { Chapter } from "@novelova/shared-types";
import { getChapters } from "@/services/chapters";
import { autoCueProjectSfx } from "@/services/voice-design";

export interface AutoSfxCueDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplied?: () => void;
}

export function AutoSfxCueDialog({
  projectId,
  open,
  onOpenChange,
  onApplied,
}: AutoSfxCueDialogProps) {
  const { data: chapters = [] } = useSWR<Chapter[]>(
    open ? `/projects/${projectId}/chapters-for-sfx` : null,
    () => getChapters(projectId),
    { revalidateOnFocus: false },
  );

  const [selectedChapterIds, setSelectedChapterIds] = useState<string[]>([]);
  const [includeFoley, setIncludeFoley] = useState(true);
  const [includeAtmosphere, setIncludeAtmosphere] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [previewPlans, setPreviewPlans] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const toggleChapter = (id: string) => {
    setSelectedChapterIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const runAutoCue = async (dryRun: boolean) => {
    if (selectedChapterIds.length === 0) return;
    setIsRunning(true);
    setError(null);
    setResultMessage(null);
    try {
      const res = await autoCueProjectSfx(projectId, {
        chapter_ids: selectedChapterIds,
        dry_run: dryRun,
        include_foley: includeFoley,
        include_atmosphere: includeAtmosphere,
      });
      setPreviewPlans(res.plans || []);
      setResultMessage(res.message);
      if (!dryRun) {
        onApplied?.();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Auto SFX cueing failed");
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="md"
        className="p-0 gap-0 max-h-[85vh] flex flex-col overflow-hidden bg-card border-border"
      >
        <div className="px-5 py-4 pr-12 border-b border-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <RiSparklingLine className="h-4 w-4 text-amber-500" />
            <DialogTitle className="text-sm font-semibold text-foreground">
              Auto SFX &amp; Ambience Cueing
            </DialogTitle>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 px-3 py-2 text-xs text-red-700 dark:text-red-300">
              {error}
            </div>
          )}
          {resultMessage && (
            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
              <RiCheckLine className="h-3.5 w-3.5 shrink-0" />
              <span>{resultMessage}</span>
            </div>
          )}

          <div className="flex items-center gap-4 text-xs">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={includeFoley}
                onChange={(e) => setIncludeFoley(e.target.checked)}
                className="accent-neutral-900 dark:accent-white"
              />
              <span>Foley Cues</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={includeAtmosphere}
                onChange={(e) => setIncludeAtmosphere(e.target.checked)}
                className="accent-neutral-900 dark:accent-white"
              />
              <span>Atmosphere Spans</span>
            </label>
          </div>

          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              Select Chapters ({selectedChapterIds.length} selected)
            </div>
            <div className="max-h-48 overflow-y-auto border border-neutral-200/80 dark:border-white/10 rounded-xl divide-y divide-neutral-100 dark:divide-white/5">
              {chapters.map((ch) => (
                <label
                  key={ch.id}
                  className="flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-neutral-50 dark:hover:bg-white/5 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedChapterIds.includes(ch.id)}
                    onChange={() => toggleChapter(ch.id)}
                    className="accent-neutral-900 dark:accent-white"
                  />
                  <span className="font-mono text-[10px] text-neutral-400">
                    Ch.{ch.chapter_number}
                  </span>
                  <span className="truncate text-neutral-800 dark:text-neutral-200">
                    {ch.title}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {previewPlans.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Suggested Cues Preview
              </div>
              <div className="max-h-44 overflow-y-auto space-y-2">
                {previewPlans.map((plan, idx) => {
                  const foleys = (plan.foley_cues as Array<Record<string, unknown>>) || [];
                  const atmos = (plan.atmosphere_spans as Array<Record<string, unknown>>) || [];
                  return (
                    <div
                      key={idx}
                      className="rounded-lg border border-neutral-200/80 dark:border-white/10 p-2.5 text-[11px] space-y-1"
                    >
                      <div className="font-semibold text-neutral-800 dark:text-neutral-200">
                        Chapter {String(plan.chapter_number)}: {String(plan.chapter_title)}
                      </div>
                      <div className="text-neutral-500">
                        {foleys.length} foley cue(s) · {atmos.length} atmosphere span(s)
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-3.5 border-t border-neutral-200/80 dark:border-white/10 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => runAutoCue(true)}
            disabled={selectedChapterIds.length === 0 || isRunning}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-neutral-200 dark:border-white/10 hover:bg-neutral-100 dark:hover:bg-white/10 disabled:opacity-50 cursor-pointer"
          >
            {isRunning && <RiLoader4Line className="h-3.5 w-3.5 animate-spin" />}
            Preview (Dry Run)
          </button>
          <button
            type="button"
            onClick={() => runAutoCue(false)}
            disabled={selectedChapterIds.length === 0 || isRunning}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-neutral-900 dark:bg-white text-white dark:text-neutral-950 disabled:opacity-50 cursor-pointer"
          >
            Apply Cues
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
