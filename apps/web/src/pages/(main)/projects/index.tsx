import { useState, useMemo, useTransition, useEffect, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import useSWR from "swr";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { ProjectsHeader } from "./components/projects-header";
import {
  ProjectsFilterBar,
  type FilterStatus,
} from "./components/projects-filter-bar";
import { ProjectCard } from "./components/project-card";
import { ProjectTable } from "./components/project-table";
import { ImportProjectModal } from "./components/import-project-modal";
import { ExportTaggedModal } from "@/components/export-tagged-modal";
import { getProjects, deleteProject } from "@/services/projects";
import type { PaginatedProjects, Project } from "@novelova/shared-types";
import { ScrollFade } from "@/components/ui/scroll-fade";

interface ProjectsPageProps {
  initialViewMode?: "card" | "table";
}

export function ProjectsPage({ initialViewMode }: ProjectsPageProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [, startTransition] = useTransition();

  const urlViewParam = searchParams.get("view");
  const viewMode: "card" | "table" =
    urlViewParam === "table"
      ? "table"
      : urlViewParam === "card"
        ? "card"
        : initialViewMode || "card";

  const urlSearchParam = searchParams.get("search") || "";
  const [search, setSearch] = useState(urlSearchParam);
  const [debouncedSearch, setDebouncedSearch] = useState(urlSearchParam);
  const lastPushedSearchRef = useRef(urlSearchParam);

  const urlStatusParam = (searchParams.get("status") as FilterStatus) || "all";
  const currentStatus: FilterStatus = urlStatusParam;
  const setCurrentStatus = (nextStatus: FilterStatus) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (nextStatus === "all") {
          next.delete("status");
        } else {
          next.set("status", nextStatus);
        }
        next.delete("page");
        return next;
      },
      { replace: true },
    );
  };

  const currentPage = Math.max(1, Number(searchParams.get("page") || "1") || 1);
  const setCurrentPage = (page: number) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (page <= 1) {
          next.delete("page");
        } else {
          next.set("page", String(page));
        }
        return next;
      },
      { replace: true },
    );
  };
  const [sortBy, setSortBy] = useState("updated_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [sortLabel, setSortLabel] = useState("Last updated");
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [exportTaggedModalOpen, setExportTaggedModalOpen] = useState(false);


  // Sync state if URL changes externally (e.g. back/forward navigation)
  useEffect(() => {
    if (urlSearchParam !== lastPushedSearchRef.current) {
      lastPushedSearchRef.current = urlSearchParam;
      setSearch(urlSearchParam);
      setDebouncedSearch(urlSearchParam);
    }
  }, [urlSearchParam]);

  // Debounce search query and update URL parameter
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      const trimmed = search.trim();

      if (trimmed !== lastPushedSearchRef.current) {
        lastPushedSearchRef.current = trimmed;
        startTransition(() => {
          setSearchParams(
            (prev) => {
              const next = new URLSearchParams(prev);
              if (trimmed) {
                next.set("search", trimmed);
              } else {
                next.delete("search");
              }
              return next;
            },
            { replace: true },
          );
        });
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [search, setSearchParams]);

  // Fetch projects from backend using debounced search + URL-synced status & pagination
  const PAGE_SIZE = 20;
  const swrKey = useMemo(
    () => ["projects", debouncedSearch, currentStatus, sortBy, sortOrder, currentPage],
    [debouncedSearch, currentStatus, sortBy, sortOrder, currentPage],
  );

  const { data, error, isLoading, mutate } = useSWR<PaginatedProjects>(
    swrKey,
    () =>
      getProjects({
        search: debouncedSearch.trim() || undefined,
        status: currentStatus,
        sort_by: sortBy,
        sort_order: sortOrder,
        page: currentPage,
        page_size: PAGE_SIZE,
      }),
    {
      revalidateOnFocus: true,
      keepPreviousData: true,
    },
  );


  const handleViewModeChange = (mode: "card" | "table") => {
    startTransition(() => {
      const nextParams = new URLSearchParams(searchParams);
      if (mode === "table") {
        nextParams.set("view", "table");
      } else {
        nextParams.set("view", "card");
      }
      setSearchParams(nextParams, { replace: true });
    });
  };

  const handleSortChange = (
    newSortBy: string,
    newSortOrder: "asc" | "desc",
    label: string,
  ) => {
    setSortBy(newSortBy);
    setSortOrder(newSortOrder);
    setSortLabel(label);
  };

  const counts = data?.counts || {
    all: 0,
    in_production: 0,
    needs_review: 0,
    complete: 0,
    ready_to_parse: 0,
  };

  const projects = data?.items || [];
  const totalItems = data?.meta?.total_items ?? data?.meta?.totalItems ?? projects.length;


  const handleOpenProject = (project: Project) => {
    navigate(`/projects/${project.id}`);
  };

  const confirm = useConfirm();

  const handleDeleteProject = async (projectId: string) => {
    const project = projects.find((p) => p.id === projectId);
    const confirmed = await confirm({
      title: project ? `Delete "${project.title}"?` : "Delete this project?",
      description:
        "This permanently removes the project, parsed chapters, and generated audio takes.",
      confirmLabel: "Delete project",
      variant: "destructive",
    });
    if (!confirmed) {
      return;
    }
    try {
      await deleteProject(projectId);
      mutate();
      toast.success(project ? `Deleted "${project.title}"` : "Project deleted");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete project");
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Exact Header matching screenshot */}
      <ProjectsHeader
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        search={search}
        onSearchChange={setSearch}
        onOpenImportModal={() => setImportModalOpen(true)}
        onOpenExportTaggedModal={() => setExportTaggedModalOpen(true)}
      />

      {/* Main Content Area */}
      <ScrollFade className="flex-1 w-full">
        <main className="w-full max-w-7xl mx-auto px-6 pt-6 pb-16">
          {/* Filter Bar with Tabs and Sort dropdown (hidden on 0-project empty state) */}
          {(counts.all > 0 || Boolean(debouncedSearch) || isLoading) && (
            <ProjectsFilterBar
              currentStatus={currentStatus}
              counts={counts}
              onStatusChange={setCurrentStatus}
              sortLabel={sortLabel}
              onSortChange={handleSortChange}
            />
          )}

          {/* Loading or Error or Content */}
          {error ? (
            <div className="py-16 text-center">
              <p className="text-sm text-destructive mb-2">
                Failed to load projects: {error.message}
              </p>
              <button
                type="button"
                onClick={() => mutate()}
                className="px-4 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 text-xs font-medium hover:bg-neutral-50 dark:hover:bg-neutral-900 text-neutral-700 dark:text-neutral-300"
              >
                Retry
              </button>
            </div>
          ) : isLoading && !data ? (
            <div className="py-20 text-center">
              <span className="shimmer-text text-sm font-medium text-neutral-400 dark:text-neutral-500">
                Loading projects...
              </span>
            </div>
          ) : projects.length === 0 ? (
            <div className="py-24 text-center max-w-sm mx-auto space-y-3">
              <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                {debouncedSearch
                  ? "No matching projects"
                  : counts.all === 0
                    ? "No projects yet"
                    : "No projects in this category"}
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
                {debouncedSearch
                  ? `No projects found matching "${debouncedSearch}". Try a different keyword.`
                  : counts.all === 0
                    ? "Get started by creating your first project and uploading a manuscript."
                    : "There are no projects with this status filter."}
              </p>
              {debouncedSearch ? (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-border bg-card text-foreground hover:bg-secondary text-xs font-medium transition-colors cursor-pointer"
                  >
                    <span>Clear search</span>
                  </button>
                </div>
              ) : counts.all === 0 ? (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => navigate("/projects/new")}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground hover:opacity-90 text-xs font-semibold transition-opacity shadow-2xs cursor-pointer"
                  >
                    <span>Create project</span>
                  </button>
                </div>
              ) : (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setCurrentStatus("all")}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-border bg-card text-foreground hover:bg-secondary text-xs font-medium transition-colors cursor-pointer"
                  >
                    <span>Clear filter</span>
                  </button>
                </div>
              )}
            </div>
          ) : viewMode === "card" ? (
            <div>
              {/* Card View 4-column Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-6">
                {projects.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    onClick={() => handleOpenProject(project)}
                    onDelete={handleDeleteProject}
                  />
                ))}
              </div>

              {/* Pagination Footer */}
              <div className="flex items-center justify-between text-xs text-muted-foreground mt-8 pt-4 border-t border-border">
                <span>
                  Showing {projects.length} of {totalItems} project{totalItems === 1 ? "" : "s"}
                </span>
                {totalItems > PAGE_SIZE && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage(currentPage - 1)}
                      className="px-2.5 py-1 rounded-lg border border-border bg-card text-foreground hover:bg-secondary disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <span className="font-mono">
                      Page {currentPage} of {Math.max(1, Math.ceil(totalItems / PAGE_SIZE))}
                    </span>
                    <button
                      type="button"
                      disabled={currentPage >= Math.ceil(totalItems / PAGE_SIZE)}
                      onClick={() => setCurrentPage(currentPage + 1)}
                      className="px-2.5 py-1 rounded-lg border border-border bg-card text-foreground hover:bg-secondary disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-4">
              {/* Table View */}
              <ProjectTable
                projects={projects}
                onProjectClick={handleOpenProject}
                onDelete={handleDeleteProject}
              />

              {/* Pagination Footer */}
              <div className="flex items-center justify-between text-xs text-muted-foreground mt-6 pt-4 border-t border-border">
                <span>
                  Showing {projects.length} of {totalItems} project{totalItems === 1 ? "" : "s"}
                </span>
                {totalItems > PAGE_SIZE && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage(currentPage - 1)}
                      className="px-2.5 py-1 rounded-lg border border-border bg-card text-foreground hover:bg-secondary disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <span className="font-mono">
                      Page {currentPage} of {Math.max(1, Math.ceil(totalItems / PAGE_SIZE))}
                    </span>
                    <button
                      type="button"
                      disabled={currentPage >= Math.ceil(totalItems / PAGE_SIZE)}
                      onClick={() => setCurrentPage(currentPage + 1)}
                      className="px-2.5 py-1 rounded-lg border border-border bg-card text-foreground hover:bg-secondary disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </ScrollFade>

      <ImportProjectModal
        open={importModalOpen}
        onOpenChange={setImportModalOpen}
        onSuccess={(imported) => {
          mutate();
          navigate(`/projects/${imported.id}`);
        }}
      />

      <ExportTaggedModal
        open={exportTaggedModalOpen}
        onOpenChange={setExportTaggedModalOpen}
      />
    </div>
  );

}

export default ProjectsPage;
