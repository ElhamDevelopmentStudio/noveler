import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import useSWR, { mutate } from "swr";
import { RiArrowLeftLine, RiAlertLine } from "@remixicon/react";
import { getProject } from "@/services/projects";
import {
  parseProject,
  formatProjectScript,
  startTaggingJob,
  getTaggingJobStatus,
  getTaggingJobHistory,
  cancelTaggingJob,
  getChapters,
  getChapterDetail,
  createChapter,
  updateChapter,
  reorderChapters,
  saveChapterText,
} from "@/services/chapters";
import type {
  TaggingJob,
  TaggingJobOptionsDto,
  FormatOptionsDto,
} from "@novelova/shared-types";
import { WorkspaceTopBar } from "./components/workspace-top-bar";
import {
  WorkspaceSidebar,
  type WorkspaceSidebarItem,
} from "./components/workspace-sidebar";
import { ChaptersPanel } from "./components/chapters-panel";
import { CharacterPanel } from "./components/character-panel";
import { SFXPanel } from "./components/sfx-panel";
import { VoicesPanel } from "./components/voices-panel";
import {
  getCharacters,
  createCharacter,
  updateCharacter,
  deleteCharacter,
} from "@/services/character-and-pronunciation";
import { TaggingHistoryDialog } from "./components/tagging-history-dialog";
import { ManuscriptFileBar } from "./components/manuscript-file-bar";
import { ReadyToParseCard } from "./components/ready-to-parse-card";
import { ChapterCanvas } from "./components/chapter-canvas";
import {
  ParseConfigDialog,
  type ParseOptions,
} from "./components/parse-config-dialog";
import { TaggingConfigDialog } from "./components/tagging-config-dialog";
import { VoiceCastingDialog } from "./components/voice-casting-dialog";
import { PronunciationDialog } from "./components/pronunciation-dialog";
import { ProjectSettingsDialog } from "./components/project-settings-dialog";

export function ProjectWorkspacePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const [parseDialogOpen, setParseDialogOpen] = useState(false);
  const [taggingDialogOpen, setTaggingDialogOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [voiceCastingOpen, setVoiceCastingOpen] = useState(false);
  const [pronunciationOpen, setPronunciationOpen] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [selectedChapterId, setSelectedChapterId] = useState<string | undefined>(
    undefined,
  );
  const [activeSidebarItem, setActiveSidebarItem] =
    useState<WorkspaceSidebarItem>("chapters");

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

  // Fetch project characters
  const {
    data: charactersData,
    mutate: mutateCharactersData,
  } = useSWR(
    projectId ? `/projects/${projectId}/characters` : null,
    () => (projectId ? getCharacters(projectId) : Promise.resolve(null)),
  );
  const projectCharacters = charactersData?.characters || [];

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
    {
      refreshInterval: (latest) => {
        return latest?.audio_job_status === "generating" ||
          latest?.audio_job_status === "queued"
          ? 2500
          : 0;
      },
    },
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
      await mutateTaggingJob(null, false);
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

  // Fetch Stage B tagging jobs history
  const { data: taggingHistory = [], mutate: mutateTaggingHistory } = useSWR<TaggingJob[]>(
    projectId ? `/projects/${projectId}/tag/history` : null,
    () => (projectId ? getTaggingJobHistory(projectId) : Promise.resolve([])),
    {
      revalidateOnFocus: false,
    },
  );

  const isTaggingRunning =
    taggingJob?.status === "pending" || taggingJob?.status === "running";

  // Automatically revalidate chapters, script segments, and history when tagging finishes or is cancelled
  useEffect(() => {
    if (taggingJob?.status === "completed" || taggingJob?.status === "cancelled" || taggingJob?.status === "failed") {
      mutateChapters();
      mutateTaggingHistory();
      mutateCharactersData();
      if (projectId && activeChapterId) {
        mutate(`/projects/${projectId}/chapters/${activeChapterId}`);
      }
    }
  }, [taggingJob?.status, projectId, activeChapterId, mutateChapters, mutateTaggingHistory, mutateCharactersData]);

  const handleConfirmTagging = async (options?: TaggingJobOptionsDto) => {
    if (!project) return;
    try {
      const job = await startTaggingJob(project.id, options);
      await mutateTaggingJob(job, false);
      mutateTaggingHistory();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to start tagging job");
    }
  };

  const handleTagChapter = async (
    chapterId: string,
    options?: Partial<TaggingJobOptionsDto>,
  ) => {
    return handleConfirmTagging({
      chapter_ids: [chapterId],
      force: false,
      ...options,
    });
  };

  const handleFormatChapter = async (chapterId: string) => {
    return handleConfirmFormat({
      chapter_id: chapterId,
      remove_whitespace: true,
      normalize_paragraphs: true,
      fix_punctuation_spacing: true,
      speak_unambiguous_numbers: true,
      normalize_dialogue_quotes: true,
    });
  };

  const handleConfirmFormat = async (options: FormatOptionsDto) => {
    if (!project) return;
    try {
      await formatProjectScript(project.id, options);
      await mutateChapters();
      if (activeChapterId) {
        await mutate(`/projects/${project.id}/chapters/${activeChapterId}`);
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to format script");
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

  const handleCreateChapter = async (defaultTitle: string) => {
    if (!project) return null;
    try {
      const newChap = await createChapter(project.id, defaultTitle);
      await mutateChapters((prev) => (prev ? [...prev, newChap] : [newChap]), {
        revalidate: true,
      });
      setSelectedChapterId(newChap.id);
      return newChap;
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to create chapter");
      return null;
    }
  };

  const handleRenameChapter = async (chapterId: string, newTitle: string) => {
    if (!project) return;
    try {
      const updated = await updateChapter(project.id, chapterId, newTitle);
      await mutateChapters(
        (prev) =>
          prev
            ? prev.map((c) =>
                c.id === chapterId ? { ...c, title: updated.title } : c,
              )
            : [],
        { revalidate: false },
      );
      if (activeChapterId === chapterId) {
        mutate(`/projects/${project.id}/chapters/${chapterId}`);
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to rename chapter");
    }
  };

  const handleReorderChapters = async (chapterIds: string[]) => {
    if (!project) return;
    try {
      const updated = await reorderChapters(project.id, chapterIds);
      await mutateChapters(updated, { revalidate: false });
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to reorder chapters");
    }
  };

  const handleSaveChapterText = async (chapterId: string, text: string) => {
    if (!project) return;
    try {
      const updated = await saveChapterText(project.id, chapterId, text);
      await mutateChapters();
      await mutate(
        `/projects/${project.id}/chapters/${chapterId}`,
        updated,
        { revalidate: false },
      );
      await mutateProject();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to save chapter text");
    }
  };

  const handleCreateCharacter = async (
    name: string,
    roleDescription?: string,
  ) => {
    if (!project) return null;
    try {
      const newChar = await createCharacter(project.id, {
        name,
        role_description: roleDescription,
      });
      await mutateCharactersData();
      return newChar;
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to create character");
      return null;
    }
  };

  const handleUpdateCharacter = async (
    characterId: string,
    payload: {
      name?: string;
      role_description?: string;
      assigned_voice_id?: string | null;
      assigned_voice_name?: string | null;
    },
  ) => {
    if (!project) return;
    try {
      await updateCharacter(project.id, characterId, payload);
      await mutateCharactersData();
      if (activeChapterId) {
        mutate(`/projects/${project.id}/chapters/${activeChapterId}`);
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to update character");
    }
  };

  const handleDeleteCharacter = async (characterId: string) => {
    if (!project) return;
    try {
      await deleteCharacter(project.id, characterId);
      await mutateCharactersData();
      if (activeChapterId) {
        mutate(`/projects/${project.id}/chapters/${activeChapterId}`);
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to delete character");
    }
  };

  const filename =
    project?.manuscript_filename ||
    `${(project?.title || "manuscript").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.${(project?.source || "docx").toLowerCase()}`;

  const hasChapters = chapters.length > 0;

  return (
    <div className="h-screen w-full flex flex-col bg-background text-foreground overflow-hidden">
      {/* Top Global Bar with Centered Project Name & Info */}
      <WorkspaceTopBar
        project={project}
        chapters={chapters}
        activeChapterId={activeChapterId}
        onSelectChapter={setSelectedChapterId}
        onOpenParseDialog={() => setParseDialogOpen(true)}
        onRunTagging={() => setTaggingDialogOpen(true)}
        isTagging={isTaggingRunning}
        onOpenTaggingHistory={() => setHistoryDialogOpen(true)}
        onOpenVoiceCasting={() => setVoiceCastingOpen(true)}
        onOpenPronunciation={() => setPronunciationOpen(true)}
        onOpenSettings={() => setSettingsDialogOpen(true)}
        latestJob={taggingJob || (taggingHistory.length > 0 ? taggingHistory[0] : null)}
        totalRunsCount={taggingHistory.length}
        onCancelTagging={handleCancelTagging}
      />

      <main className="flex-1 min-h-0 w-full flex flex-row overflow-hidden relative">
        {/* Left Navigation Sidebar */}
        <WorkspaceSidebar
          activeItem={activeSidebarItem}
          onSelectItem={setActiveSidebarItem}
        />

        {/* Chapters Navigation Sub-Panel */}
        {activeSidebarItem === "chapters" && (
          <ChaptersPanel
            chapters={chapters}
            activeChapterId={activeChapterId}
            onSelectChapter={setSelectedChapterId}
            onCreateChapter={handleCreateChapter}
            onRenameChapter={handleRenameChapter}
            onReorderChapters={handleReorderChapters}
            projectName={project?.title}
            projectId={project?.id}
            onBatchAudioUpdated={mutateChapters}
          />
        )}

        {/* Characters Navigation Sub-Panel */}
        {activeSidebarItem === "characters" && project && (
          <CharacterPanel
            projectId={project.id}
            characters={projectCharacters}
            onCreateCharacter={handleCreateCharacter}
            onUpdateCharacter={handleUpdateCharacter}
            onDeleteCharacter={handleDeleteCharacter}
          />
        )}

        {/* SFX Sub-panel */}
        {activeSidebarItem === "sfx" && project && (
          <SFXPanel projectId={project.id} />
        )}


        {/* Voices Sub-panel */}
        {activeSidebarItem === "voices" && project && (
          <VoicesPanel projectId={project.id} />
        )}


        {/* Workspace Canvas / Body */}
        <div className="flex-1 min-w-0 h-full flex flex-col overflow-hidden relative">
          {error ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4">
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
            <div className="flex-1 flex items-center justify-center p-6 text-center">
              <span className="shimmer-text text-sm font-medium text-neutral-400 dark:text-neutral-500">
                Loading workspace...
              </span>
            </div>
          ) : project ? (
            <>
              {/* Main Workspace Body */}
              {!hasChapters ? (
                /* Unparsed Empty State */
                <div className="flex-1 min-h-0 overflow-y-auto p-6 sm:p-10 flex flex-col items-center justify-center">
                  <div className="w-full max-w-2xl rounded-2xl border border-neutral-200/90 dark:border-neutral-800 bg-white dark:bg-black shadow-2xs overflow-hidden flex flex-col">
                    <ManuscriptFileBar project={project} />
                    <ReadyToParseCard
                      onOpenParseDialog={() => setParseDialogOpen(true)}
                    />
                  </div>
                </div>
              ) : (
                /* Full-width Chapter Canvas */
                <ChapterCanvas
                  projectId={project.id}
                  chapter={activeChapterDetail || null}
                  chapters={chapters}
                  onSelectChapter={setSelectedChapterId}
                  isLoading={isChapterDetailLoading || isChaptersLoading}
                  onChapterMutate={() => {
                    if (projectId && activeChapterId) {
                      mutate(`/projects/${projectId}/chapters/${activeChapterId}`);
                    }
                  }}
                  onTagChapter={handleTagChapter}
                  onFormatChapter={handleFormatChapter}
                  onOpenTaggingHistory={() => setHistoryDialogOpen(true)}
                  onSaveChapterText={handleSaveChapterText}
                />
              )}
            </>
          ) : null}
        </div>

        {/* Dialog Modals */}
        {project && (
          <>
            <ParseConfigDialog
              open={parseDialogOpen}
              onOpenChange={setParseDialogOpen}
              filename={filename}
              hasExistingChapters={hasChapters}
              activeChapterId={activeChapterId}
              activeChapterTitle={activeChapterDetail?.title}
              onConfirmParse={handleConfirmParse}
              onConfirmFormat={handleConfirmFormat}
            />

            <TaggingConfigDialog
              open={taggingDialogOpen}
              onOpenChange={setTaggingDialogOpen}
              chapters={chapters}
              activeChapterId={activeChapterId}
              onConfirmTagging={handleConfirmTagging}
            />

            <TaggingHistoryDialog
              open={historyDialogOpen}
              onOpenChange={setHistoryDialogOpen}
              jobs={taggingHistory}
              currentJob={taggingJob || null}
              onRetag={() => setTaggingDialogOpen(true)}
            />

            <VoiceCastingDialog
              projectId={project.id}
              open={voiceCastingOpen}
              onOpenChange={setVoiceCastingOpen}
              onSaved={() => {
                mutateProject();
                mutateChapters();
                mutateCharactersData();
              }}
            />

            <PronunciationDialog
              projectId={project.id}
              open={pronunciationOpen}
              onOpenChange={setPronunciationOpen}
              onSaved={() => {
                mutateProject();
                mutateChapters();
                mutate(`/projects/${project.id}/pronunciation`);
              }}
            />

            <ProjectSettingsDialog
              project={project}
              open={settingsDialogOpen}
              onOpenChange={setSettingsDialogOpen}
              onUpdated={() => mutateProject()}
              onDeleted={() => navigate("/projects")}
            />
          </>
        )}
      </main>
    </div>
  );
}

export default ProjectWorkspacePage;
