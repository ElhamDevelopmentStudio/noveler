import { useState, useEffect } from "react";
import {
  RiCloseLine,
  RiCheckLine,
  RiLoader4Line,
  RiDeleteBinLine,
  RiSettings3Line,
  RiEmotionLine,
  RiInformationLine,
} from "@remixicon/react";
import type { Project } from "@novelova/shared-types";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { updateProjectSettings, deleteProject } from "@/services/projects";

interface ProjectSettingsDialogProps {
  project: Project | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated?: () => void;
  onDeleted?: (projectId: string) => void;
}

export const ALLOWED_PARALINGUISTIC_TAGS = [
  { key: "laugh", tag: "[laugh]", label: "Laughter sound", desc: "Spoken or expressive laughter" },
  { key: "sigh", tag: "[sigh]", label: "Sighing expression", desc: "Weary or relieved exhales" },
  { key: "gasp", tag: "[gasp]", label: "Gasping expression", desc: "Sudden intake of breath or shock" },
  { key: "groan", tag: "[groan]", label: "Groaning expression", desc: "Low, mournful or strained sound" },
  { key: "chuckle", tag: "[chuckle]", label: "Light chuckling", desc: "Quiet or amused chuckle" },
  { key: "cough", tag: "[cough]", label: "Coughing sound", desc: "Dry or abrupt cough" },
  { key: "sniff", tag: "[sniff]", label: "Sniffing sound", desc: "Sniffling or crying cue" },
  { key: "shush", tag: "[shush]", label: "Shushing sound", desc: "Urging silence or calming" },
  { key: "clear throat", tag: "[clear throat]", label: "Throat clearing sound", desc: "Deliberate throat clear" },
];

export function ProjectSettingsDialog({
  project,
  open,
  onOpenChange,
  onUpdated,
  onDeleted,
}: ProjectSettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<"tags" | "info">("tags");
  const [enabled, setEnabled] = useState(true);
  const [activeTags, setActiveTags] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (project) {
      const currentSettings = project.settings || {};
      setEnabled(currentSettings.paralinguistic_tags_enabled ?? true);
      const initialMap: Record<string, boolean> = {};
      for (const t of ALLOWED_PARALINGUISTIC_TAGS) {
        initialMap[t.key] = currentSettings.active_paralinguistic_tags?.[t.key] ?? true;
      }
      setActiveTags(initialMap);
    }
  }, [project, open]);

  if (!project) return null;

  const toggleTag = (key: string) => {
    setActiveTags((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      await updateProjectSettings(project.id, {
        paralinguistic_tags_enabled: enabled,
        active_paralinguistic_tags: activeTags,
      });
      onUpdated?.();
      onOpenChange(false);
    } catch (err) {
      console.error("Failed to update project settings", err);
      alert("Failed to update project settings.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete "${project.title}"?`)) {
      return;
    }
    setIsDeleting(true);
    try {
      await deleteProject(project.id);
      onDeleted?.(project.id);
      onOpenChange(false);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to delete project");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden rounded-2xl border-neutral-200/90 dark:border-neutral-800 shadow-2xl bg-white dark:bg-black flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200/80 dark:border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200">
              <RiSettings3Line className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
                Project Settings
              </DialogTitle>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">{project.title}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            <RiCloseLine className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 px-6 pt-3 border-b border-neutral-200/70 dark:border-neutral-800 bg-neutral-50/50 dark:bg-black text-xs font-medium">
          <button
            type="button"
            onClick={() => setActiveTab("tags")}
            className={`flex items-center gap-1.5 px-3 py-2 border-b-2 transition-colors cursor-pointer ${
              activeTab === "tags"
                ? "border-neutral-900 dark:border-neutral-100 text-neutral-900 dark:text-neutral-100 font-semibold"
                : "border-transparent text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
            }`}
          >
            <RiEmotionLine className="h-3.5 w-3.5" />
            <span>Emotion & Paralinguistic Tags</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("info")}
            className={`flex items-center gap-1.5 px-3 py-2 border-b-2 transition-colors cursor-pointer ${
              activeTab === "info"
                ? "border-neutral-900 dark:border-neutral-100 text-neutral-900 dark:text-neutral-100 font-semibold"
                : "border-transparent text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
            }`}
          >
            <RiInformationLine className="h-3.5 w-3.5" />
            <span>Project Details</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6 max-h-[60vh] overflow-y-auto space-y-6">
          {activeTab === "tags" ? (
            <div className="space-y-6">
              {/* Master Switch Card */}
              <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 bg-white dark:bg-neutral-800/40 flex items-start justify-between gap-4 shadow-2xs">
                <div className="space-y-1">
                  <h4 className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                    Enable Paralinguistic Emotion Tags
                  </h4>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
                    When disabled, the Stage B tagging engine will not output any emotion or paralinguistic cues in the batches.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => setEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-6 bg-neutral-200 dark:bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white dark:after:bg-neutral-900 after:border-neutral-300 dark:after:border-neutral-600 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-neutral-900 dark:peer-checked:bg-neutral-100" />
                </label>
              </div>

              {/* Granular Tag Toggles */}
              <div className={`space-y-3 ${!enabled ? "opacity-50 pointer-events-none" : ""}`}>
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                    Active Sound Cues (9 allowed)
                  </h4>
                  <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                    {Object.values(activeTags).filter(Boolean).length} of 9 enabled
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {ALLOWED_PARALINGUISTIC_TAGS.map((item) => {
                    const isActive = activeTags[item.key] ?? true;
                    return (
                      <div
                        key={item.key}
                        onClick={() => toggleTag(item.key)}
                        className={`rounded-xl border p-3 cursor-pointer transition-all flex items-start justify-between gap-2.5 ${
                          isActive
                            ? "border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-600 shadow-2xs"
                            : "border-neutral-200/60 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-900/40 opacity-60"
                        }`}
                      >
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs font-bold text-neutral-900 dark:text-neutral-100 bg-neutral-100 dark:bg-neutral-700 px-1.5 py-0.5 rounded">
                              {item.tag}
                            </span>
                            <span className="text-xs font-medium text-neutral-700 dark:text-neutral-200 truncate">
                              {item.label}
                            </span>
                          </div>
                          <p className="text-[11px] text-neutral-400 dark:text-neutral-500 leading-tight">
                            {item.desc}
                          </p>
                        </div>

                        <input
                          type="checkbox"
                          checked={isActive}
                          onChange={() => {}}
                          className="rounded border-neutral-300 dark:border-neutral-700 text-neutral-900 focus:ring-neutral-900 h-4 w-4 mt-1 shrink-0 pointer-events-none"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            /* Project Details & Danger Zone */
            <div className="space-y-6 text-xs">
              <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 space-y-3 bg-neutral-50/40 dark:bg-neutral-800/40">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-neutral-400 block text-[11px]">Author</span>
                    <span className="font-medium text-neutral-900 dark:text-neutral-100">{project.author || "Unknown"}</span>
                  </div>
                  <div>
                    <span className="text-neutral-400 block text-[11px]">Status</span>
                    <span className="font-medium text-neutral-900 dark:text-neutral-100 capitalize">{project.status_label}</span>
                  </div>
                  <div>
                    <span className="text-neutral-400 block text-[11px]">Manuscript</span>
                    <span className="font-medium text-neutral-900 dark:text-neutral-100">{project.manuscript_filename || "N/A"}</span>
                  </div>
                  <div>
                    <span className="text-neutral-400 block text-[11px]">Format / Source</span>
                    <span className="font-medium text-neutral-900 dark:text-neutral-100 uppercase">{project.source || "N/A"}</span>
                  </div>
                </div>
              </div>

              {/* Danger Zone */}
              <div className="rounded-xl border border-destructive/20 dark:border-destructive/40 p-4 bg-destructive/5 dark:bg-destructive/10 space-y-3">
                <h4 className="text-xs font-semibold text-destructive">
                  Danger Zone
                </h4>
                <p className="text-neutral-600 dark:text-neutral-300 text-[11px]">
                  Deleting this project will permanently remove all chapters, segments, audio batches, and custom pronunciation rules.
                </p>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive text-white text-xs font-semibold hover:bg-destructive/90 transition-colors cursor-pointer"
                >
                  <RiDeleteBinLine className="h-3.5 w-3.5" />
                  <span>{isDeleting ? "Deleting..." : "Delete Project"}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-neutral-200/80 dark:border-neutral-800 bg-neutral-50/50 dark:bg-black flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="px-4 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs font-semibold text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSaveSettings}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-neutral-200 text-white dark:text-neutral-900 text-xs font-semibold transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
          >
            {saving ? (
              <RiLoader4Line className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RiCheckLine className="h-3.5 w-3.5" />
            )}
            <span>Save settings</span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
