import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  RiMoreFill,
  RiDownload2Line,
  RiDeleteBinLine,
  RiBookOpenLine,
  RiEyeLine,
} from "@remixicon/react";
import type { Project } from "@novelova/shared-types";
import { StatusBadge } from "./status-badge";
import { formatRelativeTime } from "@/lib/date-utils";

interface ProjectCardProps {
  project: Project;
  onClick?: () => void;
  onDelete?: (projectId: string) => void;
}

export function ProjectCard({ project, onClick, onDelete }: ProjectCardProps) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  const handleMenuClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(!menuOpen);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    onDelete?.(project.id);
  };

  return (
    <div
      onClick={onClick}
      className="group relative flex flex-col rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:border-neutral-300 dark:hover:border-neutral-700 hover:shadow-lg transition-all duration-300 overflow-hidden cursor-pointer"
    >
      {/* Top Pedestal Stage */}
      <div className="relative p-6 pb-5 bg-gradient-to-b from-neutral-50/90 via-neutral-100/40 to-neutral-50/60 dark:from-neutral-900/90 dark:via-neutral-800/40 dark:to-neutral-900/60 flex items-center justify-center border-b border-neutral-100/80 dark:border-neutral-800 min-h-[195px] select-none overflow-hidden">
        {/* Top-left source format pill badge */}
        {project.source && (
          <div className="absolute top-3 left-3 px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wider uppercase bg-white/95 dark:bg-neutral-800/95 text-neutral-600 dark:text-neutral-300 border border-neutral-200/70 dark:border-neutral-700 shadow-2xs backdrop-blur-xs z-20">
            {project.source}
          </div>
        )}

        {/* Top-right 3-dot dropdown menu */}
        <div className="absolute top-3 right-3 z-20" ref={menuRef}>
          <button
            type="button"
            onClick={handleMenuClick}
            className="p-1 rounded-lg bg-white/90 dark:bg-neutral-800/90 hover:bg-white dark:hover:bg-neutral-800 text-neutral-400 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200 border border-neutral-200/60 dark:border-neutral-700 shadow-2xs backdrop-blur-xs opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
            title="Options"
          >
            <RiMoreFill className="h-4 w-4" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-44 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xl py-1 z-30">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  navigate(`/projects/${project.id}`);
                }}
                className="w-full text-left px-3.5 py-2 text-xs font-medium text-neutral-900 dark:text-neutral-100 hover:bg-neutral-50 dark:hover:bg-neutral-800 flex items-center gap-2"
              >
                <RiBookOpenLine className="h-3.5 w-3.5 text-neutral-500 dark:text-neutral-400" />
                <span>Open workspace</span>
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  onClick?.();
                }}
                className="w-full text-left px-3.5 py-2 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 flex items-center gap-2 border-t border-neutral-100 dark:border-neutral-800"
              >
                <RiEyeLine className="h-3.5 w-3.5 text-neutral-400 dark:text-neutral-500" />
                <span>View details</span>
              </button>

              {project.manuscript_url && (
                <a
                  href={project.manuscript_url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="w-full text-left px-3.5 py-2 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 flex items-center gap-2"
                >
                  <RiDownload2Line className="h-3.5 w-3.5 text-neutral-400 dark:text-neutral-500" />
                  <span>Download file</span>
                </a>
              )}

              {onDelete && (
                <button
                  type="button"
                  onClick={handleDelete}
                  className="w-full text-left px-3.5 py-2 text-xs font-medium text-destructive hover:bg-destructive/5 dark:hover:bg-destructive/15 flex items-center gap-2 border-t border-neutral-100 dark:border-neutral-800"
                >
                  <RiDeleteBinLine className="h-3.5 w-3.5" />
                  <span>Delete project</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Realistic Standing Book Volume */}
        <div className="relative w-28 h-40 aspect-[2/3] rounded-md overflow-hidden shadow-[0_10px_22px_-5px_rgba(0,0,0,0.16),0_3px_7px_-3px_rgba(0,0,0,0.08)] group-hover:shadow-[0_18px_32px_-6px_rgba(0,0,0,0.22)] group-hover:-translate-y-1.5 group-hover:scale-[1.02] transition-all duration-300">
          {/* Authentic Book Spine Shadow Overlay */}
          <div className="absolute inset-y-0 left-0 w-2.5 bg-gradient-to-r from-black/25 via-black/10 to-transparent pointer-events-none z-10" />
          <div className="absolute inset-y-0 left-2 w-[1px] bg-white/20 pointer-events-none z-10" />

          {project.thumbnail_url ? (
            <img
              src={project.thumbnail_url}
              alt={project.title}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            /* Bespoke Vintage Hardcover for projects without custom thumbnail */
            <div className="w-full h-full bg-gradient-to-br from-[#2c313a] to-[#181b22] text-neutral-100 p-3 flex flex-col justify-between text-center relative border border-neutral-700/60">
              <div className="pt-1">
                <RiBookOpenLine className="h-4 w-4 mx-auto text-amber-300/70" />
              </div>
              <div className="my-auto px-1">
                <p className="font-serif text-[11px] font-semibold leading-snug line-clamp-3 text-neutral-100">
                  {project.title}
                </p>
                <p className="text-[9px] uppercase tracking-wider text-neutral-400 font-sans mt-1.5 line-clamp-1">
                  {project.author || "Unknown"}
                </p>
              </div>
              <div className="text-[8px] tracking-widest uppercase text-neutral-500 pb-0.5">
                Noveler
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Info Section */}
      <div className="p-4 pt-3.5 flex flex-col flex-1 justify-between bg-white dark:bg-neutral-900">
        <div>
          <h3
            className="font-semibold text-neutral-900 dark:text-neutral-100 text-sm tracking-tight line-clamp-1 group-hover:text-neutral-700 dark:group-hover:text-neutral-300 transition-colors"
            title={project.title}
          >
            {project.title}
          </h3>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 line-clamp-1">
            by {project.author || "Unknown Author"}
          </p>
        </div>

        {/* Footer Meta Row */}
        <div className="mt-4 pt-2.5 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
          <StatusBadge
            status={project.status}
            label={project.status_label}
          />
          <span className="text-[11px] text-neutral-400 dark:text-neutral-500 font-medium">
            {formatRelativeTime(project.updated_at)}
          </span>
        </div>
      </div>
    </div>
  );
}
