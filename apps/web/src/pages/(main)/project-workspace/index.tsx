import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import useSWR, { mutate } from "swr";
import { RiArrowLeftLine, RiAlertLine } from "@remixicon/react";
import { getProject } from "@/services/projects";
import {
  parseProject,
  startTaggingJob,
  getTaggingJobStatus,
  cancelTaggingJob,
  getChapters,
  getChapterDetail,
} from "@/services/chapters";
import type { TaggingJob } from "@novelova/shared-types";
import { WorkspaceTopBar } from "./components/workspace-top-bar";
import { WorkspaceHeader } from "./components/workspace-header";
import { TaggingProgressBanner } from "./components/tagging-progress-banner";
import { ManuscriptFileBar } from "./components/manuscript-file-bar";
import { ReadyToParseCard } from "./components/ready-to-parse-card";
import { ChaptersSidebar } from "./components/chapters-sidebar";
import { ChapterCanvas } from "./components/chapter-canvas";
import {
  ParseConfigDialog,
  type ParseOptions,
} from "./components/parse-config-dialog";
import { VoiceCastingDialog } from "./components/voice-casting-dialog";
import { PronunciationDialog } from "./components/pronunciation-dialog";
import { ProjectSettingsDialog } from "./components/project-settings-dialog";
import { ScrollFade } from "@/components/ui/scroll-fade";

export function ProjectWorkspacePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const [parseDialogOpen, setParseDialogOpen] = useState(false);
  const [voiceCastingOpen, setVoiceCastingOpen] = useState(false);
  const [pronunciationOpen, setPronunciationOpen] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [selectedChapterId, setSelectedChapterId] = useState<string | undefined>(
    undefined,
  );

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
    projectId ? `/projects/${projectId}/chapters` : null,
    () => (projectId ? getChapters(projectId) : Promise.resolve([])),
  );

  // Active chapter ID defaults to the first parsed chapter
  const activeChapterId =
    selectedChapterId || (chapters.length > 0 ? chapters[0].id : undefined);

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
        speak_unambiguous_numbers: options.speakUnambiguousNumbers,
      });
      await mutateProject();
      const updatedChapters = await mutateChapters();
      if (updatedChapters && updatedChapters.length > 0) {
        setSelectedChapterId(updatedChapters[0].id);
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to run parse");
    }
  };

  // Fetch active/latest Stage B tagging background job
  const { data: taggingJob, mutate: mutateTaggingJob } = useSWR<TaggingJob | null>(
    projectId ? `/projects/${projectId}/tag/status` : null,
    () => (projectId ? getTaggingJobStatus(projectId) : Promise.resolve(null)),
    {
      refreshInterval: (latestJob) => {
        if (latestJob && (latestJob.status === "pending" || latestJob.status === "running")) {
          return 1500;
        }
        return 0;
      },
    },
  );

  const isTaggingRunning =
    taggingJob?.status === "pending" || taggingJob?.status === "running";

  // Automatically revalidate chapters and script segments when tagging finishes or is cancelled
  useEffect(() => {
    if (taggingJob?.status === "completed" || taggingJob?.status === "cancelled") {
      mutateChapters();
      if (projectId && activeChapterId) {
        mutate(`/projects/${projectId}/chapters/${activeChapterId}`);
      }
    }
  }, [taggingJob?.status, projectId, activeChapterId, mutateChapters]);

  const handleStartTagging = async (resume: boolean = true) => {
    if (!project) return;
    try {
      const job = await startTaggingJob(project.id, resume, false);
      await mutateTaggingJob(job, false);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to start tagging job");
    }
  };

  const handleStartHeuristicTagging = async () => {
    if (!project) return;
    try {
      const job = await startTaggingJob(project.id, true, true);
      await mutateTaggingJob(job, false);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to start heuristic tagging");
    }
  };

  const handleCancelTagging = async () => {
    if (!project) return;
    try {
      const job = await cancelTaggingJob(project.id);
      await mutateTaggingJob(job, false);
      await mutateChapters();
      if (projectId && activeChapterId) {
        mutate(`/projects/${projectId}/chapters/${activeChapterId}`);
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to cancel tagging job");
    }
  };

  const filename =
    project?.manuscript_filename ||
    `${(project?.title || "manuscript").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.${(project?.source || "docx").toLowerCase()}`;

  const hasChapters = chapters.length > 0;

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Top Global Bar */}
      <WorkspaceTopBar />

      <ScrollFade className="flex-1">
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-20 space-y-6">
          {error ? (
            <div className="py-20 text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
                <RiAlertLine className="h-6 w-6" />
              </div>
              <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                Failed to load project
              </h2>
              <p className="text-sm text-neutral-500 dark:text-neutral-400 max-w-sm mx-auto">
                {error.message || "The requested project could not be found."}
              </p>
              <Link
                to="/projects"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-neutral-200 text-white dark:text-neutral-900 text-xs font-semibold transition-colors"
              >
                <RiArrowLeftLine className="h-3.5 w-3.5" />
                <span>Return to projects</span>
              </Link>
            </div>
          ) : isProjectLoading && !project ? (
            <div className="py-24 text-center">
              <span className="shimmer-text text-sm font-medium text-neutral-400 dark:text-neutral-500">
                Loading workspace...
              </span>
            </div>
          ) : project ? (
            <>
              {/* Workspace Header: Title, Author, Settings & Action buttons */}
              <WorkspaceHeader
                project={project}
                onOpenParseDialog={() => setParseDialogOpen(true)}
                onRunTagging={() => handleStartTagging(true)}
                isTagging={isTaggingRunning}
                onOpenVoiceCasting={() => setVoiceCastingOpen(true)}
                onOpenPronunciation={() => setPronunciationOpen(true)}
                onOpenSettings={() => setSettingsDialogOpen(true)}
              />

              {/* Tagging Background Job Progress Banner */}
              <TaggingProgressBanner
                job={taggingJob || null}
                onRetry={() => handleStartTagging(true)}
                onRunHeuristic={handleStartHeuristicTagging}
                onCancel={handleCancelTagging}
                onDismiss={() => mutateTaggingJob(null, false)}
              />

              {/* Main Workspace Body */}
              {!hasChapters ? (
                /* Unparsed Empty State */
                <div className="rounded-2xl border border-neutral-200/90 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-2xs overflow-hidden flex flex-col">
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

              {/* Voice & Casting Modal */}
              <VoiceCastingDialog
                projectId={project.id}
                open={voiceCastingOpen}
                onOpenChange={setVoiceCastingOpen}
                onSaved={() => {
                  mutateProject();
                  mutateChapters();
                }}
              />

              {/* Pronunciation Configuration Modal */}
              <PronunciationDialog
                projectId={project.id}
                open={pronunciationOpen}
                onOpenChange={setPronunciationOpen}
                onSaved={() => {
                  mutateProject();
                  mutateChapters();
                }}
              />

              {/* Project Settings Modal */}
              <ProjectSettingsDialog
                project={project}
                open={settingsDialogOpen}
                onOpenChange={setSettingsDialogOpen}
                onUpdated={() => mutateProject()}
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
