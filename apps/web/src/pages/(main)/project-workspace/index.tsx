import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import useSWR from "swr";
import { RiArrowLeftLine, RiAlertLine } from "@remixicon/react";
import { getProject } from "@/services/projects";
import {
  parseProject,
  getChapters,
  getChapterDetail,
} from "@/services/chapters";
import { getCharacters } from "@/services/character-and-pronunciation";
import { getStageBStatus, startStageB } from "@/services/stage-b";
import type { StageBJob } from "@novelova/shared-types";
import { WorkspaceTopBar } from "./components/workspace-top-bar";
import { WorkspaceHeader } from "./components/workspace-header";
import { ManuscriptFileBar } from "./components/manuscript-file-bar";
import { ReadyToParseCard } from "./components/ready-to-parse-card";
import { ChaptersSidebar } from "./components/chapters-sidebar";
import { ChapterCanvas } from "./components/chapter-canvas";
import {
  ParseConfigDialog,
  type ParseOptions,
} from "./components/parse-config-dialog";
import { VoiceAndCastingDialog } from "./components/voice-and-casting-dialog";
import { PronunciationDialog } from "./components/pronunciation-dialog";
import { ProjectDetailsDialog } from "../projects/components/project-details-dialog";
import { ScrollFade } from "@/components/ui/scroll-fade";

export function ProjectWorkspacePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const [parseDialogOpen, setParseDialogOpen] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [castingDialogOpen, setCastingDialogOpen] = useState(false);
  const [pronunciationDialogOpen, setPronunciationDialogOpen] = useState(false);
  const [selectedChapterId, setSelectedChapterId] = useState<string | undefined>(
    undefined,
  );
  const [isStageBPopoverOpen, setIsStageBPopoverOpen] = useState(false);
  const [isStageBRunning, setIsStageBRunning] = useState(false);

  // Fetch project details
  const {
    data: project,
    error,
    isLoading: isProjectLoading,
    mutate: mutateProject,
  } = useSWR(projectId ? `/projects/${projectId}` : null, () =>
    projectId ? getProject(projectId) : Promise.reject(new Error("No ID")),
  );

  // Fetch parsed chapters
  const {
    data: chapters = [],
    isLoading: isChaptersLoading,
    mutate: mutateChapters,
  } = useSWR(
    projectId && project?.status !== "ready_to_parse"
      ? `/projects/${projectId}/chapters`
      : null,
    () => (projectId ? getChapters(projectId) : Promise.resolve([])),
  );

  // Fetch characters roster for casting
  const { data: charactersList = [], mutate: mutateCharacters } = useSWR(
    projectId && project?.status !== "ready_to_parse"
      ? `/projects/${projectId}/characters`
      : null,
    () => (projectId ? getCharacters(projectId) : Promise.resolve([])),
  );

  // Fetch active Stage B status
  const { data: stageBJob, mutate: mutateStageBJob } = useSWR<StageBJob | null>(
    projectId && project?.status !== "ready_to_parse"
      ? `/projects/${projectId}/stage-b/status`
      : null,
    async () => {
      if (!projectId) return null;
      try {
        const job = await getStageBStatus(projectId);
        if (job.status === "running") {
          setIsStageBRunning(true);
        } else {
          setIsStageBRunning(false);
        }
        return job;
      } catch {
        return null;
      }
    },
    {
      refreshInterval: isStageBRunning ? 3000 : 0,
    },
  );

  // Resolve current active chapter ID (prefers Chapter 3 if present, or first chapter)
  const activeChapterId =
    selectedChapterId ||
    (chapters.length > 0
      ? chapters.find((c) => c.chapter_number === 3)?.id || chapters[0].id
      : undefined);

  // Fetch active chapter detail (with script segments)
  const { data: activeChapterDetail, isLoading: isChapterDetailLoading } = useSWR(
    projectId && activeChapterId
      ? `/projects/${projectId}/chapters/${activeChapterId}`
      : null,
    () =>
      projectId && activeChapterId
        ? getChapterDetail(projectId, activeChapterId)
        : Promise.resolve(null),
  );

  const handleConfirmParse = async (options: ParseOptions) => {
    if (!project) return;
    try {
      await parseProject(project.id, {
        remove_whitespace: options.removeWhitespace,
        normalize_paragraphs: options.normalizeParagraphs,
        separate_sentence_wise: options.separateSentenceWise,
        detect_chapter_headings: options.detectChapterHeadings,
        preserve_italics: options.preserveItalics,
        fix_punctuation_spacing: options.fixPunctuationSpacing,
      });
      await mutateProject();
      await mutateChapters();
      await mutateCharacters();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to run parse");
    }
  };

  const handleRunStageB = async () => {
    if (!projectId) return;
    try {
      const job = await startStageB(projectId);
      await mutateStageBJob(job, false);
      setIsStageBRunning(true);
      setIsStageBPopoverOpen(true);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to start Stage B");
    }
  };

  const handleStageBJobUpdated = (updatedJob: StageBJob) => {
    mutateStageBJob(updatedJob, false);
    setIsStageBRunning(updatedJob.status === "running");
  };

  const filename =
    project?.manuscript_filename ||
    `${(project?.title || "manuscript").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.${(project?.source || "docx").toLowerCase()}`;

  const isReadyToParse =
    project?.status === "ready_to_parse" && chapters.length === 0;

  return (
    <div className="min-h-screen flex flex-col bg-[#fbfbfc]">
      {/* Top Global Bar */}
      <WorkspaceTopBar />

      <ScrollFade className="flex-1">
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-20 space-y-6">
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
          ) : isProjectLoading && !project ? (
            <div className="py-24 text-center">
              <span className="shimmer-text text-sm font-medium text-neutral-400">
                Loading workspace...
              </span>
            </div>
          ) : project ? (
            <>
              {/* Workspace Header: Title, Author, Pill Action Bar & Stage B trigger */}
              <WorkspaceHeader
                project={project}
                onOpenParseDialog={() => setParseDialogOpen(true)}
                onOpenCastingDialog={() => setCastingDialogOpen(true)}
                onOpenPronunciationDialog={() => setPronunciationDialogOpen(true)}
                onOpenSettings={() => setSettingsDialogOpen(true)}
                onRunStageB={handleRunStageB}
                isStageBRunning={isStageBRunning}
                stageBJob={stageBJob}
                isStageBPopoverOpen={isStageBPopoverOpen}
                onToggleStageBPopover={() =>
                  setIsStageBPopoverOpen((prev) => !prev)
                }
                onCloseStageBPopover={() => setIsStageBPopoverOpen(false)}
                onStageBJobUpdated={handleStageBJobUpdated}
              />

              {/* Main Workspace Body */}
              {isReadyToParse ? (
                /* Unparsed Empty State */
                <div className="rounded-2xl border border-neutral-200/90 bg-white shadow-2xs overflow-hidden flex flex-col">
                  <ManuscriptFileBar project={project} />
                  <ReadyToParseCard
                    onOpenParseDialog={() => setParseDialogOpen(true)}
                  />
                </div>
              ) : (
                /* Parsed Canvas Workspace: 2-column sidebar & reader */
                <div className="flex flex-col md:flex-row gap-6 items-start">
                  <ChaptersSidebar
                    chapters={chapters}
                    activeChapterId={activeChapterId}
                    onSelectChapter={setSelectedChapterId}
                  />

                  <ChapterCanvas
                    chapter={activeChapterDetail || null}
                    isLoading={isChapterDetailLoading || isChaptersLoading}
                  />
                </div>
              )}

              {/* Parse & Format Configuration Modal */}
              <ParseConfigDialog
                open={parseDialogOpen}
                onOpenChange={setParseDialogOpen}
                filename={filename}
                onConfirmParse={handleConfirmParse}
              />

              {/* Voice & Casting Configuration Modal */}
              <VoiceAndCastingDialog
                open={castingDialogOpen}
                onOpenChange={setCastingDialogOpen}
                project={project}
                characters={charactersList}
                onSaved={mutateCharacters}
              />

              {/* Pronunciation Configuration Modal */}
              <PronunciationDialog
                open={pronunciationDialogOpen}
                onOpenChange={setPronunciationDialogOpen}
                project={project}
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
