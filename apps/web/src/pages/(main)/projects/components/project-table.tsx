import { RiImageLine } from "@remixicon/react";
import type { Project } from "@novelova/shared-types";
import { StatusBadge } from "./status-badge";
import { formatRelativeTime } from "@/lib/date-utils";

interface ProjectTableProps {
  projects: Project[];
  onProjectClick?: (project: Project) => void;
}

export function ProjectTable({ projects, onProjectClick }: ProjectTableProps) {
  return (
    <div className="w-full overflow-x-auto border-t border-b border-neutral-200 dark:border-neutral-800">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-neutral-200/80 dark:border-neutral-800">
            <th className="py-3 px-4 text-[11px] font-semibold tracking-wider text-neutral-400 dark:text-neutral-500 uppercase w-[35%]">
              Project
            </th>
            <th className="py-3 px-4 text-[11px] font-semibold tracking-wider text-neutral-400 dark:text-neutral-500 uppercase w-[20%]">
              Author
            </th>
            <th className="py-3 px-4 text-[11px] font-semibold tracking-wider text-neutral-400 dark:text-neutral-500 uppercase w-[15%]">
              Source
            </th>
            <th className="py-3 px-4 text-[11px] font-semibold tracking-wider text-neutral-400 dark:text-neutral-500 uppercase w-[15%]">
              Status
            </th>
            <th className="py-3 px-4 text-[11px] font-semibold tracking-wider text-neutral-400 dark:text-neutral-500 uppercase w-[15%]">
              Last Updated
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/80">
          {projects.map((project) => (
            <tr
              key={project.id}
              onClick={() => onProjectClick?.(project)}
              className="hover:bg-neutral-50/70 dark:hover:bg-neutral-900/60 transition-colors cursor-pointer group"
            >
              {/* Project Title + Thumbnail */}
              <td className="py-3.5 px-4">
                <div className="flex items-center gap-3.5">
                  {project.thumbnail_url ? (
                    <div className="w-9 h-12 rounded-md overflow-hidden shrink-0 border border-neutral-100 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-800 shadow-2xs">
                      <img
                        src={project.thumbnail_url}
                        alt={project.title}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>
                  ) : (
                    <div className="w-9 h-12 rounded-md border border-dashed border-neutral-300 dark:border-neutral-700 flex items-center justify-center bg-neutral-50 dark:bg-neutral-800 shrink-0">
                      <RiImageLine className="h-4 w-4 text-neutral-400 dark:text-neutral-500" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-neutral-900 dark:text-neutral-100 group-hover:text-neutral-700 dark:group-hover:text-neutral-300 transition-colors truncate">
                      {project.title}
                    </p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate mt-0.5">
                      {project.author || "—"}
                    </p>
                  </div>
                </div>
              </td>

              {/* Author */}
              <td className="py-3.5 px-4 text-sm text-neutral-600 dark:text-neutral-300 truncate">
                {project.author || "—"}
              </td>

              {/* Source */}
              <td className="py-3.5 px-4 text-xs font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-300">
                {project.source || "DOCX"}
              </td>

              {/* Status */}
              <td className="py-3.5 px-4">
                <StatusBadge
                  status={project.status}
                  label={project.status_label}
                />
              </td>

              {/* Last updated */}
              <td className="py-3.5 px-4 text-sm text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
                {formatRelativeTime(project.updated_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
