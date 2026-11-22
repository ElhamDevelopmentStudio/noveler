import { RiImageLine, RiDeleteBinLine } from "@remixicon/react";
import type { Project } from "@novelova/shared-types";
import { StatusBadge } from "./status-badge";
import { formatRelativeTime } from "@/lib/date-utils";

interface ProjectTableProps {
  projects: Project[];
  onProjectClick?: (project: Project) => void;
  onDelete?: (projectId: string) => void;
}

export function ProjectTable({ projects, onProjectClick, onDelete }: ProjectTableProps) {
  return (
    <div className="w-full overflow-x-auto border-t border-b border-border/80 bg-card rounded-xl">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-border/80">
            <th className="py-3 px-4 text-[11px] font-medium tracking-wider text-muted-foreground uppercase w-[38%]">
              Project
            </th>
            <th className="py-3 px-4 text-[11px] font-medium tracking-wider text-muted-foreground uppercase w-[18%]">
              Author
            </th>
            <th className="py-3 px-4 text-[11px] font-medium tracking-wider text-muted-foreground uppercase w-[12%]">
              Source
            </th>
            <th className="py-3 px-4 text-[11px] font-medium tracking-wider text-muted-foreground uppercase w-[14%]">
              Status
            </th>
            <th className="py-3 px-4 text-[11px] font-medium tracking-wider text-muted-foreground uppercase w-[14%]">
              Last Updated
            </th>
            {onDelete && <th className="py-3 px-3 w-10" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {projects.map((project) => (
            <tr
              key={project.id}
              onClick={() => onProjectClick?.(project)}
              className="hover:bg-neutral-50/80 dark:hover:bg-neutral-900/50 transition-colors duration-150 cursor-pointer group"
            >
              {/* Project Title + Thumbnail */}
              <td className="py-3 px-4">
                <div className="flex items-center gap-3">
                  {project.thumbnail_url ? (
                    <div className="w-8 h-10 rounded-md overflow-hidden shrink-0 border border-border/80 bg-muted">
                      <img
                        src={project.thumbnail_url}
                        alt={project.title}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>
                  ) : (
                    <div className="w-8 h-10 rounded-md border border-dashed border-border flex items-center justify-center bg-muted/50 shrink-0">
                      <RiImageLine className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  )}
                  <p className="font-medium text-sm text-foreground group-hover:text-neutral-700 dark:group-hover:text-neutral-200 transition-colors truncate">
                    {project.title}
                  </p>
                </div>
              </td>

              {/* Author */}
              <td className="py-3 px-4 text-sm text-muted-foreground truncate">
                {project.author || "—"}
              </td>

              {/* Source */}
              <td className="py-3 px-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {project.source || "DOCX"}
              </td>

              {/* Status */}
              <td className="py-3 px-4">
                <StatusBadge
                  status={project.status}
                  label={project.status_label}
                />
              </td>

              {/* Last updated */}
              <td className="py-3 px-4 text-xs text-muted-foreground whitespace-nowrap">
                {formatRelativeTime(project.updated_at)}
              </td>

              {onDelete && (
                <td className="py-3 px-3 text-right">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(project.id);
                    }}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-[opacity,color,background-color] duration-150 cursor-pointer"
                    title="Delete project"
                    aria-label={`Delete ${project.title}`}
                  >
                    <RiDeleteBinLine className="h-4 w-4" />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
