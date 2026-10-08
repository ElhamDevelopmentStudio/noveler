import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  RiDownload2Line,
  RiDeleteBinLine,
  RiFileTextLine,
  RiBookOpenLine,
  RiLoader4Line,
} from "@remixicon/react";
import type { Project } from "@novelova/shared-types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { StatusBadge } from "./status-badge";
import { formatRelativeTime } from "@/lib/date-utils";
import { deleteProject } from "@/services/projects";

interface ProjectDetailsDialogProps {
  project: Project | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: (projectId: string) => void;
}

export function ProjectDetailsDialog({
  project,
  open,
  onOpenChange,
  onDeleted,
}: ProjectDetailsDialogProps) {
  const navigate = useNavigate();
  const [isDeleting, setIsDeleting] = useState(false);

  if (!project) return null;

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
      <DialogContent className="max-w-xl p-0 overflow-hidden rounded-2xl border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
        <div className="flex flex-col sm:flex-row">
          {/* Left: Book Cover Stage */}
          <div className="sm:w-56 bg-neutral-100/70 dark:bg-neutral-800/40 p-6 flex flex-col items-center justify-center border-b sm:border-b-0 sm:border-r border-neutral-200 dark:border-neutral-800 shrink-0 select-none">
            {project.thumbnail_url ? (
              <div className="relative w-32 h-44 rounded-lg overflow-hidden shadow-md border border-neutral-200/80 dark:border-neutral-700">
                <img
                  src={project.thumbnail_url}
                  alt={project.title}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-y-0 left-0 w-2 bg-gradient-to-r from-black/20 to-transparent pointer-events-none" />
              </div>
            ) : (
              <div className="relative w-32 h-44 rounded-lg bg-neutral-800 text-white p-3 flex flex-col justify-between text-center shadow-md border border-neutral-700">
                <div className="absolute inset-y-0 left-0 w-2 bg-gradient-to-r from-black/40 to-transparent pointer-events-none" />
                <RiBookOpenLine className="h-5 w-5 mx-auto text-neutral-400 mt-1" />
                <div>
                  <p className="font-serif text-xs font-semibold leading-tight line-clamp-3">
                    {project.title}
                  </p>
                  <p className="text-[9px] uppercase tracking-wider text-neutral-400 mt-1">
                    {project.author || "Unknown"}
                  </p>
                </div>
                <div className="text-[9px] text-neutral-500 pb-1">Noveler Edition</div>
              </div>
            )}

            <div className="mt-4 flex items-center gap-2">
              <StatusBadge status={project.status} label={project.status_label} />
              {project.source && (
                <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300">
                  {project.source}
                </span>
              )}
            </div>
          </div>

          {/* Right: Details & Actions */}
          <div className="flex-1 p-6 flex flex-col justify-between">
            <div>
              <DialogHeader>
                <DialogTitle className="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100 text-left">
                  {project.title}
                </DialogTitle>
                <DialogDescription className="text-xs text-neutral-500 dark:text-neutral-400 text-left">
                  by {project.author || "Unknown Author"} • Updated {formatRelativeTime(project.updated_at)}
                </DialogDescription>
              </DialogHeader>

              {/* Metadata Grid */}
              <div className="grid grid-cols-2 gap-3 mt-5 text-xs">
                <div>
                  <span className="text-neutral-400 dark:text-neutral-500 block font-medium">Owner</span>
                  <span className="text-neutral-800 dark:text-neutral-200 font-semibold truncate block">
                    {project.owner || "—"}
                  </span>
                </div>
                <div>
                  <span className="text-neutral-400 dark:text-neutral-500 block font-medium">Genre</span>
                  <span className="text-neutral-800 dark:text-neutral-200 font-semibold truncate block">
                    {project.genre || "—"}
                  </span>
                </div>
                <div>
                  <span className="text-neutral-400 dark:text-neutral-500 block font-medium">Language</span>
                  <span className="text-neutral-800 dark:text-neutral-200 font-semibold truncate block">
                    {project.language || "English"}
                  </span>
                </div>
                <div>
                  <span className="text-neutral-400 dark:text-neutral-500 block font-medium">ISBN</span>
                  <span className="text-neutral-800 dark:text-neutral-200 font-semibold truncate block font-mono text-[11px]">
                    {project.isbn || "—"}
                  </span>
                </div>
              </div>

              {/* Manuscript attachment card */}
              {project.manuscript_url && (
                <div className="mt-5 p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-800/50 flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <RiFileTextLine className="h-5 w-5 text-neutral-600 dark:text-neutral-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                        {project.manuscript_filename || "Manuscript document"}
                      </p>
                      {project.manuscript_size && (
                        <p className="text-[10px] text-neutral-500 dark:text-neutral-400">
                          {(project.manuscript_size / 1024).toFixed(1)} KB
                        </p>
                      )}
                    </div>
                  </div>

                  <a
                    href={project.manuscript_url}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 rounded-lg bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 transition-colors shadow-2xs"
                    title="Download manuscript"
                  >
                    <RiDownload2Line className="h-4 w-4" />
                  </a>
                </div>
              )}
            </div>

            {/* Bottom Footer Actions */}
            <div className="pt-6 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between mt-6">
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex items-center gap-1.5 text-xs font-medium text-destructive hover:text-destructive/80 transition-colors cursor-pointer"
              >
                {isDeleting ? (
                  <RiLoader4Line className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RiDeleteBinLine className="h-3.5 w-3.5" />
                )}
                <span>Delete project</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="px-4 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-800 text-xs font-semibold text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700 shadow-2xs cursor-pointer"
                >
                  Close
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onOpenChange(false);
                    navigate(`/projects/${project.id}`);
                  }}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-neutral-200 text-white dark:text-neutral-900 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                >
                  <RiBookOpenLine className="h-3.5 w-3.5" />
                  <span>Open workspace</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
