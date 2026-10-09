import { useState, useEffect, useRef } from "react";
import useSWR from "swr";
import {
  RiBookmarkLine,
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
} from "@remixicon/react";
import type {
  Chapter,
  ScriptSegment,
  ScriptSegmentUpdateDto,
  PronunciationRule,
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
import { SegmentSpeakerPopover } from "./segment-speaker-popover";
import { SegmentSplitDialog } from "./segment-split-dialog";
import { PronunciationQuickPopover } from "./pronunciation-quick-popover";

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface ChapterCanvasProps {
  projectId: string;
  chapter: Chapter | null;
  isLoading?: boolean;
  onChapterMutate?: () => void;
}

export function ChapterCanvas({
  projectId,
  chapter,
  isLoading,
  onChapterMutate,
}: ChapterCanvasProps) {
  const [activeTab, setActiveTab] = useState<"book_content" | "parsed_chapters">(
    "parsed_chapters",
  );
  const [fontScale, setFontScale] = useState(0); // -1, 0, 1, 2
  const [localSegments, setLocalSegments] = useState<ScriptSegment[]>([]);

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

  // Fetch project characters for speaker reassignments
  const { data: charData } = useSWR(
    projectId ? `/projects/${projectId}/characters` : null,
    () => getCharacters(projectId),
  );
  const characters = charData?.characters || [];

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
    if (editingSegmentId) return;

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

  // Highlighting matching active pronunciation overrides in segment paragraphs
  const renderSegmentText = (segText: string) => {
    const activeRules = (pronunciationRules || []).filter(
      (r) => r.is_active !== false && r.phrase.trim().length > 0,
    );

    if (activeRules.length === 0) {
      return segText;
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
      if (parts.length <= 1) return segText;

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
        return part;
      });
    } catch {
      return segText;
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-20 min-h-[560px] bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200/90 dark:border-neutral-800 shadow-2xs">
        <RiLoader4Line className="h-6 w-6 animate-spin text-neutral-400 dark:text-neutral-500 mb-2" />
        <span className="shimmer-text text-xs text-neutral-400 dark:text-neutral-500 font-medium">
          Loading chapter content...
        </span>
      </div>
    );
  }

  if (!chapter) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-20 min-h-[560px] bg-white dark:bg-black rounded-2xl border border-neutral-200/90 dark:border-neutral-800 shadow-2xs text-center">
        <p className="text-sm text-neutral-400 dark:text-neutral-500">
          Select a chapter from the sidebar
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col rounded-2xl border border-neutral-200/90 dark:border-neutral-800 bg-white dark:bg-black shadow-2xs overflow-hidden h-[calc(100vh-14rem)] min-h-[560px] relative">
      {/* Toast Notification Banner */}
      {actionNotice && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-50 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-3.5 py-1.5 rounded-full text-xs font-semibold shadow-lg flex items-center gap-1.5 animate-in fade-in zoom-in-95">
          <RiCheckLine className="h-3.5 w-3.5" />
          <span>{actionNotice}</span>
        </div>
      )}

      {/* Top Tabs Header: Book content vs Parsed chapters */}
      <div className="px-6 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between select-none bg-white dark:bg-black">
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

      {/* Subheader Toolbar: Chapter Title + Typography controls + Actions */}
      <div className="px-6 py-2.5 border-b border-neutral-100/90 dark:border-neutral-800 flex items-center justify-between bg-neutral-50/40 dark:bg-neutral-950/40 select-none">
        <div className="flex items-center gap-4">
          <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
            {chapter.title}
          </span>

          {/* Typography Zoom Pill */}
          <div className="flex items-center rounded-lg border border-neutral-200/80 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-2 py-0.5 shadow-2xs">
            <button
              type="button"
              onClick={decreaseFontSize}
              disabled={fontScale <= -1}
              className="text-xs text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 px-1 disabled:opacity-30 cursor-pointer"
              title="Decrease text size"
            >
              −
            </button>
            <span className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-200 px-1.5 border-x border-neutral-100 dark:border-neutral-700">
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
        </div>

        {/* Right Toolbar Icons */}
        <div className="flex items-center gap-1 text-neutral-400 dark:text-neutral-500">
          <button
            type="button"
            className="p-1 rounded-lg hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            title="Bookmark chapter"
          >
            <RiBookmarkLine className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="p-1 rounded-lg hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            title="Chapter options"
          >
            <RiMoreFill className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Reader Scrollable Canvas */}
      <div
        ref={scrollContainerRef}
        onMouseUp={handleMouseUp}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-6 sm:px-12 py-10"
      >
        <div className="max-w-2xl mx-auto space-y-4">
          {/* Chapter Metadata Heading */}
          <div className="space-y-1 mb-8 select-none">
            <p className="text-[11px] font-sans font-bold tracking-widest text-neutral-400 dark:text-neutral-500 uppercase">
              CHAPTER {chapter.chapter_number > 0 ? chapter.chapter_number : "PRELUDE"}
            </p>
            <h2 className="text-3xl font-serif font-bold text-neutral-900 dark:text-neutral-100 tracking-tight">
              {chapter.title.replace(/^[0-9]+\.\s*/, "")}
            </h2>
          </div>

          {/* Render Segments */}
          {localSegments.length > 0 ? (
            localSegments.map((seg, idx) => {
              const isDialogue =
                !seg.is_internal_thought &&
                Boolean(seg.is_dialogue) &&
                Boolean(seg.speaker) &&
                seg.speaker?.toLowerCase() !== "narrator";

              const isSystem =
                seg.delivery_type === "system_prompt" ||
                seg.speaker === "System / Interface";

              const isThought =
                seg.delivery_type === "internal_thought" ||
                seg.is_internal_thought;

              const isEditing = editingSegmentId === seg.id;

              return (
                <div
                  key={seg.id}
                  className={`group relative rounded-xl transition-all p-3 -mx-3 ${
                    isSystem
                      ? "border-l-[3px] border-cyan-500 dark:border-cyan-400 bg-cyan-50/40 dark:bg-cyan-950/20"
                      : isDialogue
                        ? "border-l-[3px] border-neutral-900 dark:border-neutral-100 bg-neutral-50/70 dark:bg-neutral-800/60 hover:bg-neutral-100/50 dark:hover:bg-neutral-800/80"
                        : isThought
                          ? "border-l-[3px] border-amber-400 dark:border-amber-500 bg-amber-50/30 dark:bg-amber-950/20"
                          : "hover:bg-neutral-50/60 dark:hover:bg-neutral-900/40"
                  }`}
                >
                  {/* Floating Action Toolbar on hover */}
                  <div className="absolute right-2 -top-3 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 shadow-md rounded-lg p-0.5 z-20">
                    {/* Delivery & Speaker Quick Action Trigger */}
                    <SegmentSpeakerPopover
                      segment={seg}
                      characters={characters}
                      onUpdate={(payload) => handleUpdateSegment(seg.id, payload)}
                    >
                      <button
                        type="button"
                        className="px-1.5 py-1 rounded text-[11px] font-semibold text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors flex items-center gap-1 cursor-pointer"
                        title="Change speaker or delivery mode"
                      >
                        {isSystem ? (
                          <RiTerminalBoxLine className="h-3.5 w-3.5 text-cyan-600" />
                        ) : isDialogue ? (
                          <RiChat1Line className="h-3.5 w-3.5 text-neutral-800 dark:text-neutral-200" />
                        ) : isThought ? (
                          <RiLightbulbLine className="h-3.5 w-3.5 text-amber-600" />
                        ) : (
                          <RiBookOpenLine className="h-3.5 w-3.5 text-neutral-500" />
                        )}
                        <span className="max-w-[80px] truncate">
                          {seg.speaker || "Narrator"}
                        </span>
                      </button>
                    </SegmentSpeakerPopover>

                    <div className="w-[1px] h-3 bg-neutral-200 dark:bg-neutral-700 my-auto" />

                    {/* Inline Edit Button */}
                    <button
                      type="button"
                      onClick={() => startInlineEdit(seg)}
                      className="p-1 rounded text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors cursor-pointer"
                      title="Edit text inline (or double-click text)"
                    >
                      <RiEditLine className="h-3.5 w-3.5" />
                    </button>

                    {/* Split Button */}
                    <button
                      type="button"
                      onClick={() => openSplitDialog(seg)}
                      className="p-1 rounded text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors cursor-pointer"
                      title="Split segment"
                    >
                      <RiScissorsCutLine className="h-3.5 w-3.5" />
                    </button>

                    {/* Merge Up Button */}
                    <button
                      type="button"
                      onClick={() => handleMergeSegment(seg.id, "previous")}
                      disabled={idx === 0}
                      className="p-1 rounded text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors disabled:opacity-20 cursor-pointer"
                      title="Merge with previous segment"
                    >
                      <RiArrowUpLine className="h-3.5 w-3.5" />
                    </button>

                    {/* Merge Down Button */}
                    <button
                      type="button"
                      onClick={() => handleMergeSegment(seg.id, "next")}
                      disabled={idx === localSegments.length - 1}
                      className="p-1 rounded text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors disabled:opacity-20 cursor-pointer"
                      title="Merge with next segment"
                    >
                      <RiArrowDownLine className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Header Pill / Metadata */}
                  {(isDialogue || isSystem || isThought) && (
                    <div className="flex items-center gap-2 text-[11px] font-sans font-semibold tracking-wider uppercase mb-1">
                      <SegmentSpeakerPopover
                        segment={seg}
                        characters={characters}
                        onUpdate={(payload) => handleUpdateSegment(seg.id, payload)}
                      >
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md hover:bg-neutral-200/70 dark:hover:bg-neutral-700 transition-colors cursor-pointer"
                        >
                          <span
                            className={
                              isSystem
                                ? "text-cyan-700 dark:text-cyan-300 font-bold"
                                : isThought
                                  ? "text-amber-700 dark:text-amber-400 font-bold"
                                  : "text-neutral-700 dark:text-neutral-300 font-bold"
                            }
                          >
                            {isSystem
                              ? "System Notification"
                              : isThought
                                ? `Thought · ${seg.speaker || "Narrator"}`
                                : seg.speaker}
                          </span>
                        </button>
                      </SegmentSpeakerPopover>

                      {seg.emotion && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-neutral-200/80 dark:bg-neutral-700 text-neutral-800 dark:text-neutral-200 text-[10px] font-mono lowercase">
                          <RiSparklingLine className="h-2.5 w-2.5 text-primary" />
                          {seg.emotion}
                        </span>
                      )}

                      {seg.continuation_type === "starts_phrase" && (
                        <span className="text-[10px] font-mono lowercase bg-neutral-200/80 dark:bg-neutral-700 px-1.5 py-0.5 rounded text-neutral-600 dark:text-neutral-300 font-normal">
                          split phrase
                        </span>
                      )}
                      {seg.continuation_type === "completes_phrase" && (
                        <span className="text-[10px] font-mono lowercase bg-neutral-200/80 dark:bg-neutral-700 px-1.5 py-0.5 rounded text-neutral-600 dark:text-neutral-300 font-normal">
                          phrase resolves
                        </span>
                      )}
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
                        className={`w-full p-2.5 rounded-xl border border-neutral-900 dark:border-neutral-100 bg-white dark:bg-neutral-900 font-serif text-neutral-900 dark:text-neutral-100 focus:outline-none shadow-xs resize-y ${getFontSizeClass()}`}
                        rows={Math.max(2, Math.ceil(editingText.length / 60))}
                      />
                      <div className="flex items-center justify-between text-[11px] text-neutral-400">
                        <span>Enter to save · Shift+Enter for newline · Esc to cancel</span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={cancelInlineEdit}
                            className="px-2 py-0.5 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 cursor-pointer text-neutral-600 dark:text-neutral-300"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={saveInlineEdit}
                            className="px-2.5 py-0.5 rounded bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-neutral-200 text-white dark:text-neutral-900 font-semibold cursor-pointer shadow-2xs"
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
                      className={`cursor-text select-text ${getFontSizeClass()} ${
                        isSystem
                          ? "font-mono text-cyan-950 dark:text-cyan-100"
                          : isDialogue
                            ? "font-serif text-neutral-900 dark:text-neutral-100"
                            : isThought
                              ? "font-serif italic text-neutral-800 dark:text-neutral-200"
                              : "font-serif text-neutral-800 dark:text-neutral-200"
                      }`}
                    >
                      {renderSegmentText(seg.text)}
                    </p>
                  )}
                </div>
              );
            })
          ) : (
            <p className="text-sm font-serif text-neutral-500 dark:text-neutral-400 italic">
              No content parsed for this chapter yet.
            </p>
          )}
        </div>
      </div>

      {/* Floating Canvas Quick-Action Pill */}
      {selectionState && !quickPopoverOpen && (
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
    </div>
  );
}
