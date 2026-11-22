import { useEffect, useMemo, useState } from "react";
import {
  RiCheckLine,
  RiCloseLine,
  RiLoader4Line,
  RiRefreshLine,
  RiSparklingLine,
  RiVolumeUpLine,
} from "@remixicon/react";
import type { Character, VoiceDesignJob } from "@novelova/shared-types";
import {
  generateCharacterDossiers,
  getVoiceDesignJob,
  startVoiceDesignJob,
} from "@/services/voice-design";
import { cn } from "@/lib/utils";

export interface VoiceDesignModalProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  characters: Character[];
  onCompleted?: () => void;
}

export function VoiceDesignModal({
  open,
  onClose,
  projectId,
  characters,
  onCompleted,
}: VoiceDesignModalProps) {
  const eligibleCharacters = useMemo(
    () =>
      characters.filter(
        (c) =>
          !c.is_system &&
          !c.is_general &&
          c.name.toLowerCase() !== "narrator",
      ),
    [characters],
  );

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [autoAssign, setAutoAssign] = useState(true);
  const [cacheToDataset, setCacheToDataset] = useState(true);
  const [promptOverrides, setPromptOverrides] = useState<Record<string, string>>({});
  const [isBuildingDossiers, setIsBuildingDossiers] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const [activeJob, setActiveJob] = useState<VoiceDesignJob | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSelectedIds((prev) =>
      prev.length > 0
        ? prev
        : eligibleCharacters
            .filter((c) => !c.assigned_voice_id)
            .slice(0, 8)
            .map((c) => c.id),
    );
  }, [open, eligibleCharacters]);

  // Poll active job progress
  useEffect(() => {
    if (!activeJob || ["completed", "failed", "cancelled"].includes(activeJob.status)) {
      return;
    }
    const timer = window.setInterval(async () => {
      try {
        const updated = await getVoiceDesignJob(activeJob.id);
        setActiveJob(updated);
        if (updated.status === "completed") {
          onCompleted?.();
        }
      } catch {
        // Keep polling transiently
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [activeJob, onCompleted]);

  if (!open) return null;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleBuildDossiers = async (refresh = false) => {
    if (selectedIds.length === 0) return;
    setIsBuildingDossiers(true);
    setError(null);
    try {
      const res = await generateCharacterDossiers(projectId, {
        character_ids: selectedIds,
        refresh,
      });
      const nextOverrides = { ...promptOverrides };
      for (const item of res.items) {
        if (item.dossier?.voice_design_prompt) {
          nextOverrides[item.character_id] = item.dossier.voice_design_prompt;
        }
      }
      setPromptOverrides(nextOverrides);
      onCompleted?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to build character dossiers");
    } finally {
      setIsBuildingDossiers(false);
    }
  };

  const handleStartVoiceDesign = async () => {
    if (selectedIds.length === 0) return;
    setIsLaunching(true);
    setError(null);
    try {
      const job = await startVoiceDesignJob({
        project_id: projectId,
        items: selectedIds.map((cid) => ({
          character_id: cid,
          voice_design_prompt: promptOverrides[cid]?.trim() || undefined,
        })),
        auto_assign: autoAssign,
        cache_to_dataset: cacheToDataset,
        auto_build_missing_dossiers: true,
      });
      setActiveJob(job);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to launch VoiceDesign job");
    } finally {
      setIsLaunching(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#111318] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-neutral-200/80 dark:border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400 flex items-center justify-center">
              <RiSparklingLine className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                Design Custom Character Voices (Qwen3-TTS VoiceDesign)
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Select characters to generate custom reference clips on Kaggle GPU for Chatterbox-Turbo cloning.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-500 hover:bg-neutral-100 dark:hover:bg-white/10 cursor-pointer"
          >
            <RiCloseLine className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-xs text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {/* Auto-Assign Switch + Dataset Cache Toggle */}
          <div className="rounded-xl border border-neutral-200/80 dark:border-white/10 bg-neutral-50/70 dark:bg-white/[0.03] p-3.5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                  Should all the generated voices be automatically assigned?
                </div>
                <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
                  When YES, each generated voice is saved to your Voice Collection and immediately assigned to its character.
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={autoAssign}
                onClick={() => setAutoAssign((v) => !v)}
                className={cn(
                  "relative inline-flex h-6 w-14 shrink-0 items-center rounded-full px-1 text-[10px] font-bold transition-colors cursor-pointer",
                  autoAssign
                    ? "bg-emerald-600 text-white justify-start"
                    : "bg-neutral-300 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200 justify-end",
                )}
              >
                <span className="px-1">{autoAssign ? "YES" : "NO"}</span>
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 pt-2 border-t border-neutral-200/70 dark:border-white/10">
              <div>
                <div className="text-xs font-medium text-neutral-800 dark:text-neutral-200">
                  Use Kaggle Dataset Cache (noveler-voice-design)
                </div>
                <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
                  Mounts cached Qwen3-TTS-12Hz-1.7B-VoiceDesign weights on Kaggle to avoid repeated downloads.
                </div>
              </div>
              <input
                type="checkbox"
                checked={cacheToDataset}
                onChange={(e) => setCacheToDataset(e.target.checked)}
                className="h-4 w-4 accent-violet-600 cursor-pointer"
              />
            </div>
          </div>

          {/* Active Job Progress */}
          {activeJob && (
            <div className="rounded-xl border border-violet-200 dark:border-violet-800/60 bg-violet-50/60 dark:bg-violet-950/30 p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-violet-900 dark:text-violet-200">
                <span>
                  Job Status: <span className="uppercase">{activeJob.status}</span> (
                  {activeJob.completed_characters}/{activeJob.total_characters})
                </span>
                <span>{activeJob.progress_percentage}%</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-violet-200/70 dark:bg-violet-900/50 overflow-hidden">
                <div
                  className="h-full bg-violet-600 transition-all"
                  style={{ width: `${activeJob.progress_percentage}%` }}
                />
              </div>
              {activeJob.current_step && (
                <p className="text-[11px] text-violet-700 dark:text-violet-300">
                  {activeJob.current_step}
                </p>
              )}
            </div>
          )}

          {/* Character Selection List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Characters ({selectedIds.length} selected)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleBuildDossiers(true)}
                  disabled={selectedIds.length === 0 || isBuildingDossiers}
                  className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-lg border border-neutral-200 dark:border-white/10 hover:bg-neutral-100 dark:hover:bg-white/10 disabled:opacity-50 cursor-pointer"
                >
                  {isBuildingDossiers ? (
                    <RiLoader4Line className="h-3 w-3 animate-spin" />
                  ) : (
                    <RiRefreshLine className="h-3 w-3" />
                  )}
                  Build / Refresh Dossiers
                </button>
              </div>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {eligibleCharacters.map((char) => {
                const isSelected = selectedIds.includes(char.id);
                const promptValue =
                  promptOverrides[char.id] ?? char.dossier?.voice_design_prompt ?? "";
                return (
                  <div
                    key={char.id}
                    className={cn(
                      "rounded-xl border p-3 transition-colors",
                      isSelected
                        ? "border-violet-400 dark:border-violet-600 bg-violet-50/40 dark:bg-violet-950/20"
                        : "border-neutral-200/80 dark:border-white/10",
                    )}
                  >
                    <label className="flex items-center justify-between gap-2 cursor-pointer">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(char.id)}
                          className="h-4 w-4 accent-violet-600"
                        />
                        <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                          {char.name}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 capitalize">
                          {char.gender}
                        </span>
                        <span className="text-[10px] text-neutral-400">
                          {char.dialogue_count} lines
                        </span>
                      </div>
                      {char.dossier?.voice_design_prompt ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                          <RiCheckLine className="h-3 w-3" /> Dossier Ready
                        </span>
                      ) : (
                        <span className="text-[10px] text-neutral-400">Auto-dossier on run</span>
                      )}
                    </label>

                    {isSelected && (
                      <div className="mt-2.5 pl-6">
                        <textarea
                          rows={2}
                          value={promptValue}
                          onChange={(e) =>
                            setPromptOverrides((prev) => ({
                              ...prev,
                              [char.id]: e.target.value,
                            }))
                          }
                          placeholder="VoiceDesign prompt (leave blank to auto-synthesize from character dossier)..."
                          className="w-full rounded-lg border border-neutral-200 dark:border-white/10 bg-white dark:bg-black/30 px-2.5 py-1.5 text-[11px] text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-1 focus:ring-violet-500"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-neutral-200/80 dark:border-white/10 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/10 cursor-pointer"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleStartVoiceDesign}
            disabled={selectedIds.length === 0 || isLaunching}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50 cursor-pointer"
          >
            {isLaunching ? (
              <RiLoader4Line className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RiVolumeUpLine className="h-3.5 w-3.5" />
            )}
            Design {selectedIds.length} Voice{selectedIds.length === 1 ? "" : "s"} on Kaggle
          </button>
        </div>
      </div>
    </div>
  );
}
