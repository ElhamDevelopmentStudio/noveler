import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import useSWR from "swr";
import { RiArrowLeftLine, RiAlertLine } from "@remixicon/react";
import { getProject, updateProject } from "@/services/projects";
import { WorkspaceTopBar } from "./components/workspace-top-bar";
import { WorkspaceHeader } from "./components/workspace-header";
import { ManuscriptFileBar } from "./components/manuscript-file-bar";
import { ReadyToParseCard } from "./components/ready-to-parse-card";
import {
  ParseConfigDialog,
  type ParseOptions,
} from "./components/parse-config-dialog";
import { ProjectDetailsDialog } from "../projects/components/project-details-dialog";
import { ScrollFade } from "@/components/ui/scroll-fade";

export function ProjectWorkspacePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const [parseDialogOpen, setParseDialogOpen] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);

  const {
    data: project,
    error,
    isLoading,
    mutate,
  } = useSWR(projectId ? `/projects/${projectId}` : null, () =>
    projectId ? getProject(projectId) : Promise.reject(new Error("No ID")),
  );

  const handleConfirmParse = async (_options: ParseOptions) => {
    if (!project) return;
    try {
      // In Phase 1, we simulate or trigger the status transition to in_production
      // In Phase 2, this will invoke the backend stage_a chapter extraction service
      await updateProject(project.id, {
        status: "in_production",
      });
      await mutate();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to run parse");
    }
  };

  const filename =
    project?.manuscript_filename ||
    `${(project?.title || "manuscript").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.${(project?.source || "docx").toLowerCase()}`;

  return (
    <div className="min-h-screen flex flex-col bg-[#fbfbfc]">
      {/* Top Global Bar */}
      <WorkspaceTopBar />

      <ScrollFade className="flex-1">
        <main className="max-w-6xl mx-auto px-6 py-6 pb-20 space-y-6">
          {error ? (
            <div className="py-20 text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
                <RiAlertLine className="h-6 w-6" />
              </div>
              <h2 className="text-base font-semibold text-neutral-900">
                Failed to load project
              </h2>
              <p className="text-sm text-neutral-500 max-w-sm mx-auto">
                {error.message || "The requested project could not be found."}
              </p>
              <Link
                to="/projects"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-neutral-900 text-white text-xs font-semibold hover:bg-neutral-800 transition-colors"
              >
                <RiArrowLeftLine className="h-3.5 w-3.5" />
                <span>Return to projects</span>
              </Link>
            </div>
          ) : isLoading && !project ? (
            <div className="py-24 text-center">
              <span className="shimmer-text text-sm font-medium text-neutral-400">
                Loading workspace...
              </span>
            </div>
          ) : project ? (
            <>
              {/* Workspace Header: Title, Author, Pill Action Bar */}
              <WorkspaceHeader
                project={project}
                onOpenParseDialog={() => setParseDialogOpen(true)}
                onOpenSettings={() => setSettingsDialogOpen(true)}
              />

              {/* Main Canvas Body Container */}
              <div className="rounded-2xl border border-neutral-200/90 bg-white shadow-2xs overflow-hidden flex flex-col">
                {/* Top Attached Manuscript Strip */}
                <ManuscriptFileBar project={project} />

                {/* Main Canvas Interior (Ready to Parse state or Canvas) */}
                <ReadyToParseCard
                  onOpenParseDialog={() => setParseDialogOpen(true)}
                />
              </div>

              {/* Parse & Format Configuration Modal */}
              <ParseConfigDialog
                open={parseDialogOpen}
                onOpenChange={setParseDialogOpen}
                filename={filename}
                onConfirmParse={handleConfirmParse}
              />

              {/* Project Settings / Info Modal */}
              <ProjectDetailsDialog
                project={project}
                open={settingsDialogOpen}
                onOpenChange={setSettingsDialogOpen}
                onDeleted={() => navigate("/projects")}
              />
            </>
          ) : null}
        </main>
      </ScrollFade>
    </div>
  );
}
export default ProjectWorkspacePage;
