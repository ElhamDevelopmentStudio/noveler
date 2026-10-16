import { useState, useEffect, useRef, useMemo } from "react";
import useSWR from "swr";
import {
  RiBookmarkLine,
  RiBookmarkFill,
  RiMoreFill,
  RiLoader4Line,
  RiScissorsCutLine,
  RiArrowUpLine,
  RiArrowDownLine,
  RiEditLine,
  RiChat1Line,
  RiLightbulbLine,
  RiTerminalBoxLine,
  RiBookOpenLine,
  RiSparklingLine,
  RiCheckLine,
  RiVolumeUpLine,
  RiFileCopyLine,
  RiFileTextLine,
  RiHistoryLine,
  RiSearchLine,
  RiCloseLine,
  RiArrowDownSLine,
  RiArrowLeftSLine,
  RiArrowRightSLine,
  RiUser3Line,
  RiUploadLine,
  RiLink,
  RiPlayFill,
  RiPauseFill,
} from "@remixicon/react";
import type {
  Chapter,
  ScriptSegment,
  ScriptSegmentUpdateDto,
  PronunciationRule,
  TaggingJobOptionsDto,
} from "@novelova/shared-types";
import {
  getCharacters,
  listPronunciationRules,
} from "@/services/character-and-pronunciation";
import {
  updateSegment,
  splitSegment,
  mergeSegment,
} from "@/services/chapters";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SegmentSpeakerPopover } from "./segment-speaker-popover";
import { SegmentSplitDialog } from "./segment-split-dialog";
import { PronunciationQuickPopover } from "./pronunciation-quick-popover";
import { BookContentReader } from "./book-content-reader";
import { ChapterTagConfirmDialog } from "./chapter-tag-confirm-dialog";
import { ChapterDialoguePreviewDialog } from "./chapter-dialogue-preview-dialog";
import { UrlImportDialog } from "./url-import-dialog";
import { ScrollFade } from "@/components/ui/scroll-fade";
import { CharacterAvatar } from "@/components/ui/character-avatar";
import { useChapterAudio } from "./use-chapter-audio";
import { ChapterAudioPlayer } from "./chapter-audio-player";

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface ChapterCanvasProps {
  projectId: string;
  chapter: Chapter | null;
  chapters?: Chapter[];
  onSelectChapter?: (chapterId: string) => void;
  isLoading?: boolean;
  onChapterMutate?: () => void;
  onTagChapter?: (
    chapterId: string,
    options?: Partial<TaggingJobOptionsDto>,
  ) => void | Promise<void>;
  onFormatChapter?: (chapterId: string) => void | Promise<void>;
  onOpenTaggingHistory?: () => void;
  onSaveChapterText?: (chapterId: string, text: string) => Promise<void>;
}

export function ChapterCanvas({
  projectId,
  chapter,
  chapters,
  onSelectChapter,
  isLoading,
  onChapterMutate,
  onTagChapter,
  onFormatChapter,
  onOpenTaggingHistory,
  onSaveChapterText,
}: ChapterCanvasProps) {
  const [activeTab, setActiveTab] = useState<"book_content" | "parsed_chapters">(
    "parsed_chapters",
  );
  const [fontScale, setFontScale] = useState(0); // -1, 0, 1, 2
  const [localSegments, setLocalSegments] = useState<ScriptSegment[]>([]);

  // Studio Audio Player & Karaoke Synchronization Hook
  const chapterAudio = useChapterAudio(
    projectId,
    chapter?.id ?? null,
    localSegments,
  );

  // Auto-scroll active speech segment smoothly into center view
  useEffect(() => {
    if (
      !chapterAudio.autoScroll ||
      !chapterAudio.activeSegmentId ||
      !scrollContainerRef.current
    )
      return;

    const activeEl = scrollContainerRef.current.querySelector(
      `[data-segment-id="${chapterAudio.activeSegmentId}"]`,
    );
    if (activeEl) {
      activeEl.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [chapterAudio.activeSegmentId, chapterAudio.autoScroll]);

  // Next / Previous Chapter determination
  const currentChapterIndex = useMemo(() => {
    if (!chapters || !chapter) return -1;
    return chapters.findIndex((c) => c.id === chapter.id);
  }, [chapters, chapter]);

  const prevChapter = useMemo(() => {
    if (!chapters || currentChapterIndex <= 0) return null;
    return chapters[currentChapterIndex - 1];
  }, [chapters, currentChapterIndex]);

  const nextChapter = useMemo(() => {
    if (
      !chapters ||
      currentChapterIndex === -1 ||
      currentChapterIndex >= chapters.length - 1
    )
      return null;
    return chapters[currentChapterIndex + 1];
  }, [chapters, currentChapterIndex]);

  // Inline editing state
  const [editingSegmentId, setEditingSegmentId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Split dialog state
  const [splitDialogOpen, setSplitDialogOpen] = useState(false);
  const [splitTargetSegment, setSplitTargetSegment] = useState<ScriptSegment | null>(null);

  // Canvas Pronunciation Quick-Action State
  const [selectionState, setSelectionState] = useState<{
    phrase: string;
    rect: { top: number; left: number; width: number; height: number };
  } | null>(null);
  const [quickPopoverOpen, setQuickPopoverOpen] = useState(false);
  const [quickPopoverPhrase, setQuickPopoverPhrase] = useState("");
  const [quickPopoverPosition, setQuickPopoverPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Action status notification
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [optionsMenuOpen, setOptionsMenuOpen] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [tagConfirmDialogOpen, setTagConfirmDialogOpen] = useState(false);
  const [dialoguePreviewOpen, setDialoguePreviewOpen] = useState(false);

  // Draft canvas state (for empty chapters or raw text editing)
  const [draftText, setDraftText] = useState("");
  const [isDraftMode, setIsDraftMode] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [urlImportOpen, setUrlImportOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset draft state when active chapter changes
  useEffect(() => {
    setDraftText("");
    setIsDraftMode(false);
  }, [chapter?.id]);

  const draftWords = useMemo(() => {
    return draftText.trim().split(/\s+/).filter(Boolean).length;
  }, [draftText]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setDraftText(content);
        showNotification(`Loaded ${file.name} into chapter draft`);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleSaveDraft = async () => {
    if (!chapter || !draftText.trim() || isSavingDraft) return;
    setIsSavingDraft(true);
    try {
      if (onSaveChapterText) {
        await onSaveChapterText(chapter.id, draftText);
      }
      setIsDraftMode(false);
      setDraftText("");
      showNotification("Chapter script saved and parsed into speech segments");
      onChapterMutate?.();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to save chapter text");
    } finally {
      setIsSavingDraft(false);
    }
  };

  // Search & Filter state
  const [searchBarOpen, setSearchBarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDelivery, setSelectedDelivery] = useState<
    "all" | "dialogue" | "narration" | "thought" | "system" | "unassigned"
  >("all");
  const [selectedSpeaker, setSelectedSpeaker] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcut listener for Cmd+F / Ctrl+F search toggle
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setSearchBarOpen((prev) => {
          const next = !prev;
          if (next) {
            setTimeout(() => {
              searchInputRef.current?.focus();
              searchInputRef.current?.select();
            }, 50);
          }
          return next;
        });
      } else if (e.key === "Escape" && searchBarOpen) {
        if (searchQuery) {
          setSearchQuery("");
        } else {
          setSearchBarOpen(false);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [searchBarOpen, searchQuery]);

  // Computed speaker line counts in this chapter
  const chapterSpeakers = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const seg of localSegments) {
      const isSys =
        seg.delivery_type === "system_prompt" ||
        seg.speaker === "System / Interface";
      const isTho =
        seg.delivery_type === "internal_thought" ||
        Boolean(seg.is_internal_thought);
      const isDia =
        !isSys &&
        !isTho &&
        (seg.delivery_type === "dialogue" || Boolean(seg.is_dialogue)) &&
        seg.speaker?.toLowerCase() !== "narrator";

      const spk = seg.speaker?.trim() || (isDia ? "Unassigned" : "Narrator");
      counts[spk] = (counts[spk] || 0) + 1;
    }
    return counts;
  }, [localSegments]);

  // Computed delivery mode counts
  const deliveryCounts = useMemo(() => {
    let dialogue = 0;
    let narration = 0;
    let thought = 0;
    let system = 0;
    let unassigned = 0;

    for (const seg of localSegments) {
      const isSys =
        seg.delivery_type === "system_prompt" ||
        seg.speaker === "System / Interface";
      const isTho =
        seg.delivery_type === "internal_thought" ||
        Boolean(seg.is_internal_thought);
      const isDia =
        !isSys &&
        !isTho &&
        (seg.delivery_type === "dialogue" || Boolean(seg.is_dialogue)) &&
        seg.speaker?.toLowerCase() !== "narrator";

      if (isSys) system++;
      else if (isTho) thought++;
      else if (isDia) {
        dialogue++;
        if (!seg.speaker || seg.speaker === "Unassigned") unassigned++;
      } else {
        narration++;
      }
    }

    return {
      all: localSegments.length,
      dialogue,
      narration,
      thought,
      system,
      unassigned,
    };
  }, [localSegments]);

  // Filtered segments based on search & delivery / speaker filters
  const filteredSegments = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return localSegments.filter((seg) => {
      const isSys =
        seg.delivery_type === "system_prompt" ||
        seg.speaker === "System / Interface";
      const isTho =
        seg.delivery_type === "internal_thought" ||
        Boolean(seg.is_internal_thought);
      const isDia =
        !isSys &&
        !isTho &&
        (seg.delivery_type === "dialogue" || Boolean(seg.is_dialogue)) &&
        seg.speaker?.toLowerCase() !== "narrator";

      // 1. Delivery Filter
      if (selectedDelivery === "dialogue" && !isDia) return false;
      if (selectedDelivery === "narration" && (isDia || isTho || isSys))
        return false;
      if (selectedDelivery === "thought" && !isTho) return false;
      if (selectedDelivery === "system" && !isSys) return false;
      if (
        selectedDelivery === "unassigned" &&
        (!isDia || (Boolean(seg.speaker) && seg.speaker !== "Unassigned"))
      )
        return false;

      // 2. Speaker Filter
      if (selectedSpeaker !== null) {
        const segSpk = seg.speaker?.trim() || (isDia ? "Unassigned" : "Narrator");
        if (segSpk.toLowerCase() !== selectedSpeaker.toLowerCase()) return false;
      }

      // 3. Search Query
      if (query) {
        const textMatches = seg.text.toLowerCase().includes(query);
        const speakerMatches = seg.speaker
          ? seg.speaker.toLowerCase().includes(query)
          : false;
        const emotionMatches = seg.emotion
          ? seg.emotion.toLowerCase().includes(query)
          : false;
        if (!textMatches && !speakerMatches && !emotionMatches) return false;
      }

      return true;
    });
  }, [localSegments, searchQuery, selectedDelivery, selectedSpeaker]);

  const isFilterActive = Boolean(
    searchQuery.trim() ||
      selectedDelivery !== "all" ||
      selectedSpeaker !== null,
  );

  const clearAllFilters = () => {
    setSearchQuery("");
    setSelectedDelivery("all");
    setSelectedSpeaker(null);
  };

  const totalDialogueCount = useMemo(
    () => localSegments.filter((s) => s.is_dialogue).length,
    [localSegments],
  );

  const taggedDialogueCount = useMemo(
    () =>
      localSegments.filter(
        (s) => s.is_dialogue && Boolean(s.speaker && s.speaker !== "Narrator"),
      ).length,
    [localSegments],
  );

  const isChapterAlreadyTagged = taggedDialogueCount > 0;

  // Fetch project characters for speaker reassignments
  const { data: charData } = useSWR(
    projectId ? `/projects/${projectId}/characters` : null,
    () => getCharacters(projectId),
  );
  const characters = charData?.characters || [];

  // Character gender & avatar initials helpers for balanced visual identity
  const getCharacterGender = (
    speakerName?: string | null,
  ): "female" | "male" | "neutral" => {
    if (!speakerName) return "neutral";
    const lower = speakerName.toLowerCase();
    const char = characters.find((c) => c.name.toLowerCase() === lower);
    if (char && char.gender) {
      const g = char.gender.toLowerCase();
      if (g === "female") return "female";
      if (g === "male") return "male";
    }
    if (lower.includes("female")) return "female";
    if (lower.includes("male")) return "male";
    return "neutral";
  };

  const getInitials = (name: string): string => {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return (name.slice(0, 2) || "CH").toUpperCase();
  };

  // Fetch active pronunciation rules for canvas visual indicators and popover sync
  const { data: pronunciationRules = [], mutate: mutatePronunciationRules } = useSWR(
    projectId ? `/projects/${projectId}/pronunciation` : null,
    () => listPronunciationRules(projectId),
  );

  // Sync local segments from chapter prop
  useEffect(() => {
    if (chapter?.segments) {
      setLocalSegments(chapter.segments);
    } else {
      setLocalSegments([]);
    }
  }, [chapter?.segments]);

  // Focus textarea when editing starts
  useEffect(() => {
    if (editingSegmentId && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [editingSegmentId]);

  const showNotification = (msg: string) => {
    setActionNotice(msg);
    setTimeout(() => {
      setActionNotice(null);
    }, 2500);
  };

  const handleCopyChapterScript = () => {
    if (!localSegments || localSegments.length === 0) return;
    const text = localSegments.map((s) => s.text).join("\n\n");
    navigator.clipboard.writeText(text);
    showNotification("Chapter script copied to clipboard");
    setOptionsMenuOpen(false);
  };

  const increaseFontSize = () => {
    setFontScale((prev) => Math.min(2, prev + 1));
  };

  const decreaseFontSize = () => {
    setFontScale((prev) => Math.max(-1, prev - 1));
  };

  const getFontSizeClass = () => {
    switch (fontScale) {
      case -1:
        return "text-[15px] leading-[1.7]";
      case 1:
        return "text-[18px] leading-[1.85]";
      case 2:
        return "text-[20px] leading-[1.9]";
      default:
        return "text-[16.5px] leading-[1.8]";
    }
  };

  // Segment Mutation Handlers
  const handleUpdateSegment = async (
    segmentId: string,
    payload: ScriptSegmentUpdateDto,
  ) => {
    // Optimistic local update
    setLocalSegments((prev) =>
      prev.map((seg) => {
        if (seg.id !== segmentId) return seg;
        return {
          ...seg,
          ...(payload.text !== undefined ? { text: payload.text || "" } : {}),
          ...(payload.speaker !== undefined ? { speaker: payload.speaker } : {}),
          ...(payload.speaker_gender !== undefined
            ? { speaker_gender: payload.speaker_gender }
            : {}),
          ...(payload.delivery_type !== undefined
            ? { delivery_type: payload.delivery_type || undefined }
            : {}),
          ...(payload.emotion !== undefined ? { emotion: payload.emotion } : {}),
          ...(payload.character_id !== undefined
            ? { character_id: payload.character_id }
            : {}),
          ...(payload.is_dialogue !== undefined
            ? { is_dialogue: Boolean(payload.is_dialogue) }
            : {}),
          ...(payload.is_internal_thought !== undefined
            ? { is_internal_thought: Boolean(payload.is_internal_thought) }
            : {}),
        };
      }),
    );

    try {
      await updateSegment(projectId, segmentId, payload);
      showNotification("Segment updated");
      onChapterMutate?.();
    } catch (err: unknown) {
      showNotification(err instanceof Error ? err.message : "Failed to update segment");
      onChapterMutate?.();
    }
  };

  const startInlineEdit = (segment: ScriptSegment) => {
    setSelectionState(null);
    setEditingSegmentId(segment.id);
    setEditingText(segment.text);
  };

  const saveInlineEdit = async () => {
    if (!editingSegmentId) return;
    const trimmed = editingText.trim();
    const current = localSegments.find((s) => s.id === editingSegmentId);
    if (!trimmed || trimmed === current?.text) {
      setEditingSegmentId(null);
      return;
    }
    const targetId = editingSegmentId;
    setEditingSegmentId(null);
    await handleUpdateSegment(targetId, { text: trimmed });
  };

  const cancelInlineEdit = () => {
    setEditingSegmentId(null);
  };

  const openSplitDialog = (segment: ScriptSegment) => {
    setSplitTargetSegment(segment);
    setSplitDialogOpen(true);
  };

  const handleConfirmSplit = async (segmentId: string, splitIndex: number) => {
    try {
      await splitSegment(projectId, segmentId, splitIndex);
      showNotification("Segment split successfully");
      onChapterMutate?.();
    } catch (err: unknown) {
      showNotification(err instanceof Error ? err.message : "Failed to split segment");
    }
  };

  const handleMergeSegment = async (
    segmentId: string,
    direction: "next" | "previous",
  ) => {
    try {
      await mergeSegment(projectId, segmentId, direction);
      showNotification(`Merged with ${direction} segment`);
      onChapterMutate?.();
    } catch (err: unknown) {
      showNotification(err instanceof Error ? err.message : "Failed to merge segment");
    }
  };

  // Text selection handler for Canvas Pronunciation Quick-Action
  const handleMouseUp = () => {
    if (editingSegmentId || activeTab === "book_content") return;

    setTimeout(() => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        setSelectionState(null);
        return;
      }

      const text = selection.toString().trim();
      // Strip leading and trailing quotes or punctuation from selection
      const cleaned = text.replace(/^[“”"’'(\s]+|[“”"’'),\.?!;:—\s]+$/g, "");
      if (cleaned.length < 2 || cleaned.length > 80) {
        setSelectionState(null);
        return;
      }

      const anchorNode = selection.anchorNode;
      if (!scrollContainerRef.current || !anchorNode) {
        setSelectionState(null);
        return;
      }

      if (!scrollContainerRef.current.contains(anchorNode)) {
        setSelectionState(null);
        return;
      }

      try {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          setSelectionState({
            phrase: cleaned,
            rect: {
              top: rect.top,
              left: rect.left,
              width: rect.width,
              height: rect.height,
            },
          });
        }
      } catch {
        setSelectionState(null);
      }
    }, 15);
  };

  const handleScroll = () => {
    if (selectionState && !quickPopoverOpen) {
      setSelectionState(null);
    }
  };

  const handleOpenPopoverForExistingRule = (
    rule: PronunciationRule,
    rect: DOMRect,
  ) => {
    setQuickPopoverPhrase(rule.phrase);
    setQuickPopoverPosition({
      top: rect.top,
      left: rect.left + rect.width / 2,
    });
    setQuickPopoverOpen(true);
    setSelectionState(null);
  };

  // Highlight search query occurrences in rendered segment text
  const highlightSearch = (text: string) => {
    const q = searchQuery.trim();
    if (!q) return text;
    try {
      const regex = new RegExp(`(${escapeRegExp(q)})`, "gi");
      const subparts = text.split(regex);
      if (subparts.length <= 1) return text;
      return subparts.map((sp, i) =>
        regex.test(sp) ? (
          <mark
            key={i}
            className="bg-amber-300/50 dark:bg-amber-400/35 text-neutral-900 dark:text-neutral-100 rounded-xs px-0.5 font-medium"
          >
            {sp}
          </mark>
        ) : (
          sp
        ),
      );
    } catch {
      return text;
    }
  };

  // Highlighting matching active pronunciation overrides in segment paragraphs
  const renderSegmentText = (segText: string) => {
    const activeRules = (pronunciationRules || []).filter(
      (r) => r.is_active !== false && r.phrase.trim().length > 0,
    );

    if (activeRules.length === 0) {
      return highlightSearch(segText);
    }

    // Sort by length descending to match longest phrase matches first
    const sortedRules = [...activeRules].sort(
      (a, b) => b.phrase.length - a.phrase.length,
    );

    try {
      const pattern = new RegExp(
        `(${sortedRules.map((r) => `\\b${escapeRegExp(r.phrase)}\\b`).join("|")})`,
        "gi",
      );
      const parts = segText.split(pattern);
      if (parts.length <= 1) return highlightSearch(segText);

      return parts.map((part, index) => {
        const matched = sortedRules.find(
          (r) => r.phrase.toLowerCase() === part.toLowerCase(),
        );

        if (matched) {
          return (
            <span
              key={index}
              onClick={(e) => {
                e.stopPropagation();
                handleOpenPopoverForExistingRule(
                  matched,
                  e.currentTarget.getBoundingClientRect(),
                );
              }}
              className="cursor-pointer border-b-2 border-dotted border-primary/80 hover:border-primary text-neutral-900 dark:text-neutral-100 hover:text-primary transition-colors bg-primary/10 hover:bg-primary/20 rounded-xs px-0.5 inline-flex items-center gap-0.5 group/pron"
              title={`Phonetic rule: "${matched.phrase}" → "${matched.replacement}" (Click to edit)`}
            >
              <span>{part}</span>
              <span className="text-[10px] text-primary/80 group-hover/pron:text-primary font-mono select-none">
                🗣️
              </span>
            </span>
          );
        }
        return highlightSearch(part);
      });
    } catch {
      return highlightSearch(segText);
    }
  };

  if (isLoading) {
    return (
      <div className="w-full h-full flex-1 min-h-0 flex flex-col items-center justify-center p-12 bg-white dark:bg-[#0c0d10]">
        <RiLoader4Line className="h-6 w-6 animate-spin text-neutral-400 dark:text-neutral-500 mb-2" />
        <span className="shimmer-text text-xs text-neutral-400 dark:text-neutral-500 font-medium">
          Loading chapter content...
        </span>
      </div>
    );
  }

  if (!chapter) {
    return (
      <div className="w-full h-full flex-1 min-h-0 flex flex-col items-center justify-center p-12 bg-white dark:bg-[#0c0d10] text-center">
        <p className="text-sm text-neutral-400 dark:text-neutral-500">
          Select a chapter from the top navigation
        </p>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex-1 min-h-0 flex flex-col bg-white dark:bg-[#0c0d10] overflow-hidden relative">
      {/* Toast Notification Banner */}
      {actionNotice && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-50 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-3.5 py-1.5 rounded-full text-xs font-semibold shadow-lg flex items-center gap-1.5 animate-in fade-in zoom-in-95">
          <RiCheckLine className="h-3.5 w-3.5" />
          <span>{actionNotice}</span>
        </div>
      )}

      {/* Top Tabs Header: Book content vs Parsed chapters */}
      <div className="px-6 border-b border-neutral-100 dark:border-white/[0.06] flex items-center justify-between select-none bg-white dark:bg-[#0c0d10]">
        <div className="flex items-center gap-6">
          <button
            type="button"
            onClick={() => setActiveTab("book_content")}
            className={`py-3.5 text-xs font-semibold tracking-tight transition-colors border-b-2 -mb-[1px] cursor-pointer ${
              activeTab === "book_content"
                ? "border-neutral-900 dark:border-neutral-100 text-neutral-900 dark:text-neutral-100"
                : "border-transparent text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
            }`}
          >
            Book content
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("parsed_chapters")}
            className={`py-3.5 text-xs font-semibold tracking-tight transition-colors border-b-2 -mb-[1px] cursor-pointer ${
              activeTab === "parsed_chapters"
                ? "border-neutral-900 dark:border-neutral-100 text-neutral-900 dark:text-neutral-100"
                : "border-transparent text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
            }`}
          >
            Parsed chapters
          </button>
        </div>
      </div>

      {/* Subheader Toolbar: Chapter Title + Attribution progress + Typography controls + Actions */}
      <div className="px-6 py-2.5 border-b border-neutral-100 dark:border-white/[0.06] flex items-center justify-between bg-neutral-50/50 dark:bg-[#0f1013]/90 select-none">
        <div className="flex items-center gap-3.5">
          <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 truncate max-w-[200px] sm:max-w-xs">
            {chapter.title}
          </span>

          {/* Chapter Metadata & Attribution Progress Badge */}
          <div className="hidden sm:flex items-center gap-2 text-[11px] font-mono text-neutral-400">
            <span>{chapter.word_count.toLocaleString()} words</span>
            <span>·</span>
            <span
              className={`inline-flex items-center gap-1 ${
                isChapterAlreadyTagged && taggedDialogueCount === totalDialogueCount
                  ? "text-emerald-600 dark:text-emerald-400 font-semibold"
                  : "text-neutral-500 dark:text-neutral-400"
              }`}
            >
              {taggedDialogueCount}/{totalDialogueCount} dialogue tagged
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Previous / Next Chapter Controls */}
          {chapters && chapters.length > 1 && (
            <div className="flex items-center rounded-lg border border-neutral-200/80 dark:border-neutral-700/80 bg-white dark:bg-neutral-900 divide-x divide-neutral-100 dark:divide-neutral-800 shadow-2xs">
              <button
                type="button"
                onClick={() => prevChapter && onSelectChapter?.(prevChapter.id)}
                disabled={!prevChapter}
                className="p-1 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-25 disabled:pointer-events-none transition-colors cursor-pointer rounded-l-lg"
                title={prevChapter ? `Previous chapter: ${prevChapter.title}` : "At first chapter"}
                aria-label={prevChapter ? `Previous chapter: ${prevChapter.title}` : "At first chapter"}
              >
                <RiArrowLeftSLine className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => nextChapter && onSelectChapter?.(nextChapter.id)}
                disabled={!nextChapter}
                className="p-1 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-25 disabled:pointer-events-none transition-colors cursor-pointer rounded-r-lg"
                title={nextChapter ? `Next chapter: ${nextChapter.title}` : "At last chapter"}
                aria-label={nextChapter ? `Next chapter: ${nextChapter.title}` : "At last chapter"}
              >
                <RiArrowRightSLine className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Typography Zoom Pill */}
          <div className="flex items-center rounded-lg border border-neutral-200/80 dark:border-neutral-700/80 bg-white dark:bg-neutral-900 px-2 py-0.5 shadow-2xs">
            <button
              type="button"
              onClick={decreaseFontSize}
              disabled={fontScale <= -1}
              className="text-xs text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 px-1 disabled:opacity-30 cursor-pointer"
              title="Decrease text size"
            >
              −
            </button>
            <span className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-200 px-1.5 border-x border-neutral-100 dark:border-neutral-800">
              Aa
            </span>
            <button
              type="button"
              onClick={increaseFontSize}
              disabled={fontScale >= 2}
              className="text-xs text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 px-1 disabled:opacity-30 cursor-pointer"
              title="Increase text size"
            >
              +
            </button>
          </div>

          {/* ElevenLabs-Style Audio Generation Action */}
          {activeTab === "parsed_chapters" && localSegments.length > 0 && (
            chapterAudio.isGenerating ? (
              <div className="flex items-center gap-1.5">
                <div
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 text-xs font-medium cursor-wait select-none"
                  title="Synthesizing chapter on Kaggle GPU..."
                >
                  <RiLoader4Line className="h-3.5 w-3.5 animate-spin" />
                  <span className="hidden sm:inline">Generating...</span>
                </div>
                <button
                  type="button"
                  onClick={() => chapterAudio.resetAudio()}
                  className="px-2 py-1 rounded-lg text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-xs font-medium transition-colors cursor-pointer"
                  title="Cancel and reset synthesis"
                >
                  Cancel
                </button>
              </div>
            ) : chapterAudio.isGenerated ? (
              <button
                type="button"
                onClick={() => chapterAudio.resetAudio()}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-neutral-200/80 dark:border-neutral-700/80 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-xs font-medium text-neutral-700 dark:text-neutral-200 transition-colors cursor-pointer"
                title="Reset or re-synthesize chapter audio"
              >
                <RiSparklingLine className="h-3.5 w-3.5 text-amber-500" />
                <span className="hidden sm:inline">Audio Ready</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => chapterAudio.startGeneration()}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 hover:opacity-90 active:scale-95 text-xs font-semibold shadow-2xs transition-all cursor-pointer"
                title="Synthesize chapter audio on Kaggle GPU"
              >
                <RiSparklingLine className="h-3.5 w-3.5" />
                <span>Generate</span>
              </button>
            )
          )}

          {/* Search & Filter Toggle Button */}
          <button
            type="button"
            onClick={() => {
              setSearchBarOpen((prev) => {
                const next = !prev;
                if (next) {
                  setTimeout(() => searchInputRef.current?.focus(), 50);
                }
                return next;
              });
            }}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
              searchBarOpen || isFilterActive
                ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 shadow-2xs"
                : "text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            }`}
            title="Search and filter chapter (Cmd+F)"
          >
            <RiSearchLine className="h-4 w-4" />
            {isFilterActive && (
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setIsBookmarked(!isBookmarked);
              showNotification(isBookmarked ? "Bookmark removed" : "Chapter bookmarked");
            }}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              isBookmarked
                ? "text-primary bg-primary/10 hover:text-primary/80"
                : "text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            }`}
            title={isBookmarked ? "Remove bookmark" : "Bookmark chapter"}
          >
            {isBookmarked ? (
              <RiBookmarkFill className="h-4 w-4" />
            ) : (
              <RiBookmarkLine className="h-4 w-4" />
            )}
          </button>

          <Popover open={optionsMenuOpen} onOpenChange={setOptionsMenuOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={`p-1 rounded-lg transition-colors cursor-pointer ${
                  optionsMenuOpen
                    ? "text-neutral-900 dark:text-neutral-100 bg-neutral-100 dark:bg-neutral-800"
                    : "hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                }`}
                title="Chapter options"
              >
                <RiMoreFill className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              side="bottom"
              sideOffset={8}
              className="w-72 p-1.5 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 shadow-xl"
            >
              {/* Chapter Metadata Summary Header */}
              <div className="px-3 py-2 border-b border-neutral-100 dark:border-neutral-800/80 mb-1">
                <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                  Chapter {chapter.chapter_number}
                </div>
                <div className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                  {chapter.title}
                </div>
                <div className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-0.5 flex items-center gap-1.5">
                  <span>{chapter.word_count} words</span>
                  <span>•</span>
                  <span>{localSegments.length} segments</span>
                  <span>•</span>
                  <span>{localSegments.filter((s) => s.is_dialogue).length} dialogues</span>
                </div>
              </div>

              {/* Group: Dialogue Attribution */}
              <div className="py-1">
                <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                  Dialogue Attribution
                </div>

                {onTagChapter && (
                  <button
                    type="button"
                    onClick={() => {
                      setOptionsMenuOpen(false);
                      setTagConfirmDialogOpen(true);
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-900 transition-colors cursor-pointer text-left"
                  >
                    <RiSparklingLine className="h-4 w-4 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-neutral-900 dark:text-neutral-100">
                        {isChapterAlreadyTagged ? "Re-tag chapter dialogue" : "Tag chapter dialogue"}
                      </div>
                      <div className="text-[10px] text-neutral-400 truncate">
                        {isChapterAlreadyTagged
                          ? `${taggedDialogueCount} tagged · Overwrite or resume`
                          : "Attribute speakers & emotions"}
                      </div>
                    </div>
                  </button>
                )}

                {onOpenTaggingHistory && (
                  <button
                    type="button"
                    onClick={() => {
                      setOptionsMenuOpen(false);
                      onOpenTaggingHistory();
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-900 transition-colors cursor-pointer text-left"
                  >
                    <RiHistoryLine className="h-4 w-4 text-neutral-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-neutral-900 dark:text-neutral-100">
                        Tagging runs & metrics
                      </div>
                      <div className="text-[10px] text-neutral-400 truncate">
                        Full history of all tagging runs
                      </div>
                    </div>
                  </button>
                )}
              </div>

              <div className="border-t border-neutral-100 dark:border-neutral-800/80 my-1" />

              {/* Group: Script Text & Formatting */}
              <div className="py-1">
                <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                  Script Formatting & Copy
                </div>

                {onFormatChapter && (
                  <button
                    type="button"
                    onClick={() => {
                      setOptionsMenuOpen(false);
                      onFormatChapter(chapter.id);
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-900 transition-colors cursor-pointer text-left"
                  >
                    <RiFileTextLine className="h-4 w-4 text-neutral-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div>Format chapter script</div>
                      <div className="text-[10px] text-neutral-400">Spoken numbers & punctuation fixes</div>
                    </div>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleCopyChapterScript}
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-900 transition-colors cursor-pointer text-left"
                >
                  <RiFileCopyLine className="h-4 w-4 text-neutral-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div>Copy chapter script</div>
                    <div className="text-[10px] text-neutral-400">Full chapter text to clipboard</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setOptionsMenuOpen(false);
                    setDialoguePreviewOpen(true);
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-900 transition-colors cursor-pointer text-left"
                >
                  <RiChat1Line className="h-4 w-4 text-neutral-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div>Copy dialogue only</div>
                    <div className="text-[10px] text-neutral-400">Preview & format spoken lines</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setOptionsMenuOpen(false);
                    setDraftText(localSegments.map((s) => s.text).join("\n\n"));
                    setIsDraftMode(true);
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-900 transition-colors cursor-pointer text-left"
                >
                  <RiEditLine className="h-4 w-4 text-neutral-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div>Edit raw chapter text</div>
                    <div className="text-[10px] text-neutral-400">Open full text draft editor</div>
                  </div>
                </button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Search & Filter Drawer Strip */}
      {searchBarOpen && (
        <div className="px-6 py-2.5 border-b border-neutral-100 dark:border-white/[0.06] bg-neutral-50/70 dark:bg-[#111216]/90 backdrop-blur-md flex flex-wrap items-center justify-between gap-3 animate-in slide-in-from-top-2 duration-150 select-none">
          <div className="flex items-center gap-2 flex-1 min-w-[280px] flex-wrap sm:flex-nowrap">
            {/* Search Input Box */}
            <div className="relative flex-1 min-w-[160px] max-w-sm">
              <RiSearchLine className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search chapter text..."
                className="w-full pl-8 pr-7 py-1 text-xs rounded-lg border border-neutral-200 dark:border-white/[0.08] bg-white dark:bg-[#18191e] text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-primary/60 transition-all shadow-2xs"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 cursor-pointer"
                >
                  <RiCloseLine className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Segment Type Filter Pills */}
            <div className="flex items-center gap-0.5 bg-neutral-200/50 dark:bg-neutral-800/50 p-0.5 rounded-lg text-[11px] font-medium shrink-0">
              <button
                type="button"
                onClick={() => setSelectedDelivery("all")}
                className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                  selectedDelivery === "all"
                    ? "bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 shadow-2xs font-semibold"
                    : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
                }`}
              >
                All ({deliveryCounts.all})
              </button>
              <button
                type="button"
                onClick={() => setSelectedDelivery("dialogue")}
                className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                  selectedDelivery === "dialogue"
                    ? "bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 shadow-2xs font-semibold"
                    : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
                }`}
              >
                Dialogue ({deliveryCounts.dialogue})
              </button>
              <button
                type="button"
                onClick={() => setSelectedDelivery("narration")}
                className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                  selectedDelivery === "narration"
                    ? "bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 shadow-2xs font-semibold"
                    : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
                }`}
              >
                Narration ({deliveryCounts.narration})
              </button>
              {deliveryCounts.thought > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedDelivery("thought")}
                  className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                    selectedDelivery === "thought"
                      ? "bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 shadow-2xs font-semibold"
                      : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
                  }`}
                >
                  Thoughts ({deliveryCounts.thought})
                </button>
              )}
              {deliveryCounts.unassigned > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedDelivery("unassigned")}
                  className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                    selectedDelivery === "unassigned"
                      ? "bg-amber-500/20 text-amber-800 dark:text-amber-300 shadow-2xs font-semibold"
                      : "text-amber-700/80 dark:text-amber-400/80 hover:text-amber-800"
                  }`}
                >
                  Untagged ({deliveryCounts.unassigned})
                </button>
              )}
            </div>

            {/* Character Selector Popover */}
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={`px-2 py-1 text-xs rounded-lg border flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
                    selectedSpeaker
                      ? "border-primary/50 bg-primary/10 text-primary font-semibold"
                      : "border-neutral-200 dark:border-white/[0.08] bg-white dark:bg-[#18191e] text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-100"
                  }`}
                >
                  <RiUser3Line className="h-3.5 w-3.5 text-neutral-400" />
                  <span className="max-w-[100px] truncate">
                    {selectedSpeaker || "Character"}
                  </span>
                  <RiArrowDownSLine className="h-3 w-3 opacity-60" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="w-56 p-1.5 rounded-xl border border-neutral-200 dark:border-white/[0.08] bg-white dark:bg-[#18191e] shadow-xl"
              >
                <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                  Filter by Character
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedSpeaker(null)}
                  className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md text-xs cursor-pointer ${
                    selectedSpeaker === null
                      ? "bg-neutral-100 dark:bg-neutral-800 font-semibold text-neutral-900 dark:text-neutral-100"
                      : "hover:bg-neutral-50 dark:hover:bg-neutral-800/60 text-neutral-700 dark:text-neutral-300"
                  }`}
                >
                  <span>All Characters</span>
                  <span className="text-[10px] text-neutral-400 font-mono">
                    {localSegments.length}
                  </span>
                </button>
                <div className="border-t border-neutral-100 dark:border-white/[0.06] my-1" />
                <div className="max-h-52 overflow-y-auto space-y-0.5">
                  {Object.entries(chapterSpeakers).map(([spk, count]) => (
                    <button
                      key={spk}
                      type="button"
                      onClick={() =>
                        setSelectedSpeaker(spk === selectedSpeaker ? null : spk)
                      }
                      className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md text-xs cursor-pointer ${
                        selectedSpeaker === spk
                          ? "bg-primary/10 text-primary font-semibold"
                          : "hover:bg-neutral-50 dark:hover:bg-neutral-800/60 text-neutral-700 dark:text-neutral-300"
                      }`}
                    >
                      <span className="truncate pr-2">{spk}</span>
                      <span className="text-[10px] font-mono text-neutral-400 shrink-0">
                        {count}
                      </span>
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* Right Status & Clear Reset */}
          <div className="flex items-center gap-2 text-xs shrink-0">
            {isFilterActive && (
              <>
                <span className="text-[11px] text-neutral-400 font-mono">
                  {filteredSegments.length} of {localSegments.length}
                </span>
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="text-[11px] font-medium text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 underline decoration-dotted cursor-pointer"
                >
                  Reset
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => {
                clearAllFilters();
                setSearchBarOpen(false);
              }}
              className="p-1 rounded-md text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
              title="Close search & filter (Esc)"
            >
              <RiCloseLine className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Tab 1: Book content (Chunked Infinite-Scroll Manuscript Stream) */}
      {activeTab === "book_content" ? (
        <BookContentReader
          projectId={projectId}
          fontScaleClass={getFontSizeClass()}
        />
      ) : localSegments.length === 0 || isDraftMode ? (
        /* Empty Draft / Typing Canvas */
        <div className="flex-1 min-h-0 flex flex-col relative px-6 sm:px-12 py-10 overflow-hidden">
          <div className="max-w-[700px] w-full mx-auto flex-1 min-h-0 flex flex-col relative">
            {/* Chapter Metadata Heading */}
            <div className="mb-6 select-none space-y-1.5 pt-2 shrink-0">
              <p className="text-[11px] font-sans font-bold tracking-widest text-neutral-400 dark:text-neutral-500 uppercase">
                CHAPTER {chapter.chapter_number > 0 ? chapter.chapter_number : "PRELUDE"}
              </p>
              <h2 className="text-3xl sm:text-4xl font-serif font-bold text-neutral-900 dark:text-neutral-50 tracking-tight leading-tight">
                {chapter.title.replace(/^[0-9]+\.\s*/, "")}
              </h2>
              <div className="w-12 h-0.5 bg-neutral-200 dark:bg-neutral-800 rounded-full mt-4 mb-2" />
            </div>

            {/* Draft Typing Textarea Container */}
            <div className="flex-1 min-h-0 flex flex-col relative w-full">
              <textarea
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    e.preventDefault();
                    handleSaveDraft();
                  }
                }}
                placeholder="Start typing here or paste any text you want to turn info lifelike speech..."
                className={`w-full flex-1 bg-transparent border-none outline-none resize-none font-serif text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:outline-none focus:ring-0 ${getFontSizeClass()}`}
                autoFocus
              />

              {/* Bottom Center: Get started with (when empty) */}
              {!draftText.trim() && (
                <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 select-none pointer-events-auto">
                  <span className="text-xs sm:text-sm text-neutral-400 dark:text-neutral-500 font-normal">
                    Get started with
                  </span>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl border border-neutral-300 dark:border-neutral-800 bg-white dark:bg-[#121316] hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-800 dark:text-neutral-200 text-xs sm:text-sm font-medium transition-all shadow-xs cursor-pointer hover:scale-102 active:scale-98"
                    >
                      <RiUploadLine className="h-4 w-4 text-neutral-500 dark:text-neutral-400" />
                      <span>Document</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setUrlImportOpen(true)}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl border border-neutral-300 dark:border-neutral-800 bg-white dark:bg-[#121316] hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-800 dark:text-neutral-200 text-xs sm:text-sm font-medium transition-all shadow-xs cursor-pointer hover:scale-102 active:scale-98"
                    >
                      <RiLink className="h-4 w-4 text-neutral-500 dark:text-neutral-400" />
                      <span>URL</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Bottom Bar: Word Counter & Save Action (when text entered) */}
              {draftText.trim() && (
                <div className="shrink-0 pt-4 pb-2 flex items-center justify-between border-t border-neutral-200/60 dark:border-white/[0.06]">
                  <span className="text-xs text-neutral-400 dark:text-neutral-500">
                    {draftWords} words · {draftText.length} characters
                  </span>
                  <div className="flex items-center gap-2">
                    {localSegments.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsDraftMode(false);
                          setDraftText("");
                        }}
                        className="px-3 py-1.5 rounded-xl text-xs font-medium text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleSaveDraft}
                      disabled={isSavingDraft}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-neutral-200 text-white dark:text-neutral-900 text-xs font-semibold shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {isSavingDraft ? (
                        <>
                          <RiLoader4Line className="h-3.5 w-3.5 animate-spin" />
                          <span>Converting...</span>
                        </>
                      ) : (
                        <>
                          <RiCheckLine className="h-3.5 w-3.5" />
                          <span>Save & Convert (⌘+Enter)</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Tab 2: Parsed chapters (Segment by Segment Script Canvas) */
        <ScrollFade
          ref={scrollContainerRef}
          onMouseUp={handleMouseUp}
          onScroll={handleScroll}
          className="flex-1 min-h-0 overflow-y-auto px-6 sm:px-12 py-10 pb-32 sm:pb-36"
        >
          <div className="max-w-[700px] mx-auto space-y-2">
            {/* Chapter Metadata Heading */}
            <div className="mb-8 select-none space-y-1.5 pt-2">
              <p className="text-[11px] font-sans font-bold tracking-widest text-neutral-400 dark:text-neutral-500 uppercase">
                CHAPTER {chapter.chapter_number > 0 ? chapter.chapter_number : "PRELUDE"}
              </p>
              <h2 className="text-3xl sm:text-4xl font-serif font-bold text-neutral-900 dark:text-neutral-50 tracking-tight leading-tight">
                {chapter.title.replace(/^[0-9]+\.\s*/, "")}
              </h2>
              <div className="w-12 h-0.5 bg-neutral-200 dark:bg-neutral-800 rounded-full mt-4 mb-2" />
            </div>

            {/* Render Segments */}
            {filteredSegments.length > 0 ? (
              filteredSegments.map((seg, idx) => {
                const isSystem =
                  seg.delivery_type === "system_prompt" ||
                  seg.speaker === "System / Interface";

                const isThought =
                  seg.delivery_type === "internal_thought" ||
                  Boolean(seg.is_internal_thought);

                const isDialogue =
                  !isSystem &&
                  !isThought &&
                  (seg.delivery_type === "dialogue" || Boolean(seg.is_dialogue)) &&
                  seg.speaker?.toLowerCase() !== "narrator";

                const isEditing = editingSegmentId === seg.id;
                const gender = getCharacterGender(seg.speaker);
                const isActiveSegment = chapterAudio.activeSegmentId === seg.id;

                return (
                  <div
                    key={seg.id}
                    data-segment-id={seg.id}
                    onClick={() => {
                      if (!isEditing && chapterAudio.isGenerated) {
                        chapterAudio.seekToSegment(seg.id);
                      }
                    }}
                    className={`group relative rounded-xl transition-all duration-200 ${
                      isActiveSegment && chapterAudio.isGenerated
                        ? "bg-amber-500/[0.04] dark:bg-amber-500/[0.06] border border-amber-500/30 dark:border-amber-500/20 shadow-2xs pl-5 pr-4 py-2.5 my-1.5"
                        : isSystem
                          ? "border border-cyan-500/25 bg-cyan-50/30 dark:bg-cyan-950/20 font-mono shadow-2xs pl-5 pr-4 py-2.5 my-1.5"
                          : isDialogue
                            ? "border border-neutral-200/50 dark:border-white/[0.04] bg-neutral-50/40 dark:bg-[#121316]/50 hover:bg-neutral-50/80 dark:hover:bg-[#15161a]/80 hover:border-neutral-300/50 dark:hover:border-white/[0.07] shadow-2xs pl-5 pr-4 py-2.5 my-1.5"
                            : isThought
                              ? "border border-amber-500/20 dark:border-amber-500/10 bg-amber-500/[0.02] dark:bg-amber-500/[0.02] hover:bg-amber-500/[0.04] pl-5 pr-4 py-2.5 my-1.5"
                              : "hover:bg-neutral-100/40 dark:hover:bg-white/[0.02] border border-transparent pl-5 pr-4 py-2 my-1"
                    }`}
                  >
                    {/* Vertically-Inset Left Accent Rail (Reduced height: starts at top-2.5, ends at bottom-2.5, never curves into radius) */}
                    {isThought && (
                      <span className="absolute left-1.5 top-2.5 bottom-2.5 w-[2.5px] rounded-full bg-amber-400 dark:bg-amber-500 pointer-events-none" />
                    )}
                    {isDialogue && (
                      <span
                        className={`absolute left-1.5 top-2.5 bottom-2.5 w-[2.5px] rounded-full pointer-events-none transition-colors ${
                          gender === "female"
                            ? "bg-rose-400/85 dark:bg-rose-500/75"
                            : gender === "male"
                              ? "bg-sky-400/85 dark:bg-sky-500/75"
                              : "bg-neutral-300 dark:bg-neutral-700"
                        }`}
                      />
                    )}
                    {isSystem && (
                      <span className="absolute left-1.5 top-2.5 bottom-2.5 w-[2.5px] rounded-full bg-cyan-400 dark:bg-cyan-500 pointer-events-none" />
                    )}

                    {/* Quiet Gutter Action Dock (aligned top-right within segment padding) */}
                    <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-all duration-150 flex items-center gap-0.5 bg-white/95 dark:bg-[#18191e]/95 backdrop-blur-md border border-neutral-200/80 dark:border-white/[0.08] shadow-2xs rounded-lg p-0.5 z-10 select-none">
                      {/* Audition / Jump to Segment Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (chapterAudio.isGenerated) {
                            if (isActiveSegment && chapterAudio.isPlaying) {
                              chapterAudio.pause();
                            } else {
                              chapterAudio.seekToSegment(seg.id);
                            }
                          } else {
                            chapterAudio.startGeneration();
                          }
                        }}
                        className={`p-1 rounded transition-colors cursor-pointer ${
                          isActiveSegment && chapterAudio.isPlaying
                            ? "text-amber-600 bg-amber-100 dark:bg-amber-900/50 font-semibold"
                            : "text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                        }`}
                        title={
                          !chapterAudio.isGenerated
                            ? "Generate audio to audition line"
                            : isActiveSegment && chapterAudio.isPlaying
                              ? "Pause audio (Spacebar)"
                              : "Audition line"
                        }
                      >
                        {isActiveSegment && chapterAudio.isPlaying ? (
                          <RiPauseFill className="h-3.5 w-3.5 fill-current" />
                        ) : (
                          <RiPlayFill className="h-3.5 w-3.5 fill-current" />
                        )}
                      </button>
                      <div className="w-[1px] h-3 bg-neutral-200 dark:bg-neutral-700 my-auto" />

                      {/* Delivery & Speaker Quick Action Trigger (for non-dialogue segments) */}
                      {!isDialogue && (
                        <>
                          <SegmentSpeakerPopover
                            segment={seg}
                            characters={characters}
                            onUpdate={(payload) => handleUpdateSegment(seg.id, payload)}
                          >
                            <button
                              type="button"
                              className="px-1.5 py-1 rounded text-[11px] font-semibold text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors flex items-center gap-1 cursor-pointer"
                              title="Set speaker or delivery mode"
                            >
                              {isSystem ? (
                                <RiTerminalBoxLine className="h-3.5 w-3.5 text-cyan-600" />
                              ) : isThought ? (
                                <RiLightbulbLine className="h-3.5 w-3.5 text-amber-600" />
                              ) : (
                                <RiBookOpenLine className="h-3.5 w-3.5 text-neutral-500" />
                              )}
                              <span className="max-w-[70px] truncate text-[11px]">
                                {seg.speaker || (isThought ? "Thought" : "Narrator")}
                              </span>
                            </button>
                          </SegmentSpeakerPopover>
                          <div className="w-[1px] h-3 bg-neutral-200 dark:bg-neutral-700 my-auto" />
                        </>
                      )}

                      {/* Inline Edit Button */}
                      <button
                        type="button"
                        onClick={() => startInlineEdit(seg)}
                        className="p-1 rounded text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                        title="Edit text inline (or double-click text)"
                      >
                        <RiEditLine className="h-3.5 w-3.5" />
                      </button>

                      {/* Split Button */}
                      <button
                        type="button"
                        onClick={() => openSplitDialog(seg)}
                        className="p-1 rounded text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                        title="Split segment"
                      >
                        <RiScissorsCutLine className="h-3.5 w-3.5" />
                      </button>

                      {/* Merge Up Button */}
                      <button
                        type="button"
                        onClick={() => handleMergeSegment(seg.id, "previous")}
                        disabled={idx === 0}
                        className="p-1 rounded text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors disabled:opacity-20 cursor-pointer"
                        title="Merge with previous segment"
                      >
                        <RiArrowUpLine className="h-3.5 w-3.5" />
                      </button>

                      {/* Merge Down Button */}
                      <button
                        type="button"
                        onClick={() => handleMergeSegment(seg.id, "next")}
                        disabled={idx === localSegments.length - 1}
                        className="p-1 rounded text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors disabled:opacity-20 cursor-pointer"
                        title="Merge with next segment"
                      >
                        <RiArrowDownLine className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {/* Dialogue Cue Header with Refined Theatrical Direction */}
                    {isDialogue && (
                      <div className="flex items-center gap-2 text-xs mb-1.5 flex-wrap">
                        <SegmentSpeakerPopover
                          segment={seg}
                          characters={characters}
                          onUpdate={(payload) => handleUpdateSegment(seg.id, payload)}
                        >
                          <button
                            type="button"
                            className="inline-flex items-center gap-1.5 py-0.5 rounded-md hover:bg-neutral-200/50 dark:hover:bg-white/[0.06] transition-colors cursor-pointer group/spk"
                          >
                            {seg.speaker && seg.speaker !== "Unassigned" ? (
                              <CharacterAvatar
                                name={seg.speaker}
                                gender={gender}
                                className="w-4 h-4 rounded-full shrink-0 shadow-2xs"
                              />
                            ) : (
                              <span
                                className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-mono font-bold shrink-0 ${
                                  gender === "female"
                                    ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 ring-1 ring-rose-500/25"
                                    : gender === "male"
                                      ? "bg-sky-500/15 text-sky-600 dark:text-sky-400 ring-1 ring-sky-500/25"
                                      : "bg-neutral-500/15 text-neutral-600 dark:text-neutral-400 ring-1 ring-neutral-500/25"
                                }`}
                              >
                                {getInitials(seg.speaker || "CH")}
                              </span>
                            )}

                            <span
                              className={`font-semibold text-[12px] tracking-tight ${
                                !seg.speaker || seg.speaker === "Unassigned"
                                  ? "text-amber-700 dark:text-amber-400 italic font-medium"
                                  : "text-neutral-800 dark:text-neutral-200 group-hover/spk:text-primary"
                              }`}
                            >
                              {seg.speaker || "Unassigned"}
                            </span>
                          </button>
                        </SegmentSpeakerPopover>

                        {/* Emotion Script Cue (Parenthetical stage direction style) */}
                        {seg.emotion && (
                          <span className="text-[11.5px] font-serif italic text-neutral-400 dark:text-neutral-500 select-none">
                            ({seg.emotion.replace(/^\[|\]$/g, "")})
                          </span>
                        )}

                        {/* Continuation Tags */}
                        {seg.continuation_type === "starts_phrase" && (
                          <span className="text-[10px] font-mono text-neutral-400 dark:text-neutral-500 tracking-tight">
                            ↳ split
                          </span>
                        )}
                        {seg.continuation_type === "completes_phrase" && (
                          <span className="text-[10px] font-mono text-neutral-400 dark:text-neutral-500 tracking-tight">
                            ↳ resolves
                          </span>
                        )}
                      </div>
                    )}

                    {/* Internal Thought Cue Header */}
                    {isThought && (
                      <div className="flex items-center gap-1.5 text-[11px] font-sans text-amber-600 dark:text-amber-400/90 font-medium mb-1 select-none">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 dark:bg-amber-500" />
                        <span className="uppercase tracking-wider text-[10px] font-semibold">Thought</span>
                        <span className="text-neutral-300 dark:text-neutral-700">·</span>
                        <span className="text-neutral-600 dark:text-neutral-300 font-normal">{seg.speaker || "Narrator"}</span>
                      </div>
                    )}

                    {/* System Interface Cue Header */}
                    {isSystem && (
                      <div className="flex items-center gap-1.5 text-[10px] font-mono font-semibold tracking-widest uppercase text-cyan-600 dark:text-cyan-400 mb-1 select-none">
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 dark:bg-cyan-500 animate-pulse" />
                        <span>System / Interface</span>
                      </div>
                    )}

                    {/* Segment Text or Inline Editor */}
                    {isEditing ? (
                      <div className="space-y-2 mt-1">
                        <textarea
                          ref={textareaRef}
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              saveInlineEdit();
                            } else if (e.key === "Escape") {
                              cancelInlineEdit();
                            }
                          }}
                          className={`w-full p-3 rounded-xl border border-neutral-900 dark:border-neutral-100 bg-white dark:bg-neutral-900 font-serif text-neutral-900 dark:text-neutral-100 focus:outline-none shadow-xs resize-y ${getFontSizeClass()}`}
                          rows={Math.max(2, Math.ceil(editingText.length / 60))}
                        />
                        <div className="flex items-center justify-between text-[11px] text-neutral-400">
                          <span>Enter to save · Shift+Enter for newline · Esc to cancel</span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={cancelInlineEdit}
                              className="px-2.5 py-1 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700 cursor-pointer text-neutral-600 dark:text-neutral-300 font-medium"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={saveInlineEdit}
                              className="px-3 py-1 rounded-lg bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-neutral-200 text-white dark:text-neutral-900 font-semibold cursor-pointer shadow-2xs"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p
                        onDoubleClick={() => startInlineEdit(seg)}
                        title="Double-click to edit text"
                        className={`cursor-text select-text pr-12 sm:pr-14 transition-colors ${getFontSizeClass()} ${
                          isSystem
                            ? "font-mono text-cyan-950 dark:text-cyan-100"
                            : isDialogue
                              ? "font-serif text-neutral-900 dark:text-neutral-100 font-normal"
                              : isThought
                                ? "font-serif italic text-neutral-800 dark:text-neutral-200"
                                : "font-serif text-neutral-800 dark:text-neutral-200"
                        }`}
                      >
                        {isActiveSegment && chapterAudio.isGenerated ? (
                          <span className="bg-amber-200/60 dark:bg-amber-400/25 text-neutral-900 dark:text-neutral-100 rounded px-1 py-0.5 box-decoration-clone">
                            {renderSegmentText(seg.text)}
                          </span>
                        ) : (
                          renderSegmentText(seg.text)
                        )}
                      </p>
                    )}
                  </div>
                );
              })
            ) : isFilterActive ? (
              <div className="py-16 text-center space-y-3 select-none">
                <div className="w-10 h-10 rounded-full bg-neutral-100 dark:bg-[#18191e] border border-neutral-200/60 dark:border-white/[0.06] text-neutral-400 flex items-center justify-center mx-auto">
                  <RiSearchLine className="h-4 w-4" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                    No segments match your filters
                  </p>
                  <p className="text-[11px] text-neutral-400 dark:text-neutral-500 max-w-xs mx-auto">
                    {searchQuery
                      ? `No results found for "${searchQuery}" in this chapter.`
                      : "No segments match the selected delivery or character filters."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-xs font-semibold hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors cursor-pointer shadow-2xs"
                >
                  <RiCloseLine className="h-3.5 w-3.5" />
                  <span>Reset filters</span>
                </button>
              </div>
            ) : (
              <p className="text-sm font-serif text-neutral-500 dark:text-neutral-400 italic">
                No content parsed for this chapter yet.
              </p>
            )}

            {/* Chapter End Asterism Footnote */}
            {filteredSegments.length > 0 && !isFilterActive && (
              <div className="pt-12 pb-6 text-center select-none">
                <div className="inline-flex items-center gap-2 text-neutral-300 dark:text-neutral-700 text-xs">
                  <span>✦</span>
                  <span>✦</span>
                  <span>✦</span>
                </div>
                <p className="text-[11px] font-sans font-medium text-neutral-400 dark:text-neutral-500 uppercase tracking-widest mt-2">
                  End of Chapter {chapter.chapter_number > 0 ? chapter.chapter_number : "Prelude"}
                </p>
              </div>
            )}
          </div>
        </ScrollFade>
      )}

      {/* ElevenLabs-Style Studio Bottom Audio Player */}
      {activeTab === "parsed_chapters" && localSegments.length > 0 && (
        <ChapterAudioPlayer
          audio={chapterAudio}
          chapterTitle={chapter.title}
          chapterNumber={chapter.chapter_number}
        />
      )}

      {/* Floating Canvas Quick-Action Pill */}
      {activeTab === "parsed_chapters" && selectionState && !quickPopoverOpen && (
        <div
          style={{
            position: "fixed",
            top: `${Math.max(12, selectionState.rect.top - 36)}px`,
            left: `${selectionState.rect.left + selectionState.rect.width / 2}px`,
            transform: "translateX(-50%)",
            zIndex: 55,
          }}
          className="animate-in fade-in zoom-in-95 pointer-events-auto select-none"
        >
          <button
            type="button"
            onMouseDown={(e) => {
              // Prevent browser from clearing selection before click completes
              e.preventDefault();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setQuickPopoverPhrase(selectionState.phrase);
              setQuickPopoverPosition({
                top: selectionState.rect.top,
                left: selectionState.rect.left + selectionState.rect.width / 2,
              });
              setQuickPopoverOpen(true);
              setSelectionState(null);
            }}
            className="px-2.5 py-1 rounded-full bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-xs font-semibold shadow-xl flex items-center gap-1.5 hover:scale-105 active:scale-95 transition-all cursor-pointer border border-neutral-700/50 dark:border-neutral-300/50"
          >
            <RiVolumeUpLine className="w-3.5 h-3.5 text-primary" />
            <span>Pronounce</span>
          </button>
        </div>
      )}

      {/* Canvas Pronunciation Quick-Action Popover */}
      <PronunciationQuickPopover
        projectId={projectId}
        chapterId={chapter?.id}
        chapterTitle={chapter?.title}
        initialPhrase={quickPopoverPhrase}
        position={quickPopoverPosition}
        isOpen={quickPopoverOpen}
        existingRules={pronunciationRules}
        onClose={() => {
          setQuickPopoverOpen(false);
          setQuickPopoverPhrase("");
          setQuickPopoverPosition(null);
        }}
        onSaved={(phrase, replacement) => {
          mutatePronunciationRules();
          showNotification(`Pronunciation rule saved: "${phrase}" → "${replacement}"`);
          onChapterMutate?.();
        }}
        onDeleted={(phrase) => {
          mutatePronunciationRules();
          showNotification(`Pronunciation rule removed for "${phrase}"`);
          onChapterMutate?.();
        }}
      />

      {/* Split Segment Dialog */}
      <SegmentSplitDialog
        segment={splitTargetSegment}
        open={splitDialogOpen}
        onOpenChange={setSplitDialogOpen}
        onConfirmSplit={handleConfirmSplit}
      />

      {/* Chapter Tag Confirmation Modal */}
      <ChapterTagConfirmDialog
        open={tagConfirmDialogOpen}
        onOpenChange={setTagConfirmDialogOpen}
        chapterNumber={chapter.chapter_number}
        chapterTitle={chapter.title}
        totalDialogueCount={totalDialogueCount}
        taggedDialogueCount={taggedDialogueCount}
        onConfirm={async ({ force, allowOfflineHeuristic }) => {
          if (onTagChapter) {
            await onTagChapter(chapter.id, {
              force,
              allow_offline_heuristic: allowOfflineHeuristic,
              resume: !force,
            });
          }
        }}
      />

      {/* Chapter Dialogue Preview Modal */}
      <ChapterDialoguePreviewDialog
        open={dialoguePreviewOpen}
        onOpenChange={setDialoguePreviewOpen}
        chapterNumber={chapter.chapter_number}
        chapterTitle={chapter.title}
        segments={localSegments}
        onCopied={() => showNotification("Dialogue lines copied to clipboard")}
      />

      {/* Hidden File Input for Document Import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,.md,.text"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* URL Import Modal */}
      <UrlImportDialog
        open={urlImportOpen}
        onOpenChange={setUrlImportOpen}
        projectId={projectId}
        onImport={(text) => {
          setDraftText(text);
          showNotification("Content imported from URL into chapter draft");
        }}
      />
    </div>
  );
}
