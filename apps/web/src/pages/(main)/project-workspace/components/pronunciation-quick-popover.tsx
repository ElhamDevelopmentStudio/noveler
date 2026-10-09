import { useState, useEffect, useRef } from "react";
import {
  RiVolumeUpLine,
  RiCloseLine,
  RiSearchLine,
  RiCheckLine,
  RiDeleteBinLine,
  RiLoader4Line,
  RiSparklingLine,
  RiGlobalLine,
  RiBookOpenLine,
} from "@remixicon/react";
import type {
  PronunciationOccurrence,
  PronunciationRule,
} from "@novelova/shared-types";
import {
  findPronunciationOccurrences,
  savePronunciationRule,
  deletePronunciationRule,
} from "@/services/character-and-pronunciation";

interface PronunciationQuickPopoverProps {
  projectId: string;
  chapterId?: string;
  chapterTitle?: string;
  initialPhrase: string;
  position: { top: number; left: number } | null;
  isOpen: boolean;
  existingRules?: PronunciationRule[];
  onClose: () => void;
  onSaved: (phrase: string, replacement: string) => void;
  onDeleted?: (phrase: string) => void;
}

export function PronunciationQuickPopover({
  projectId,
  chapterId,
  chapterTitle,
  initialPhrase,
  position,
  isOpen,
  existingRules = [],
  onClose,
  onSaved,
  onDeleted,
}: PronunciationQuickPopoverProps) {
  const [phrase, setPhrase] = useState(initialPhrase);
  const [replacement, setReplacement] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [scope, setScope] = useState<"chapter" | "entire_manuscript">(
    chapterId ? "chapter" : "entire_manuscript",
  );

  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [occurrences, setOccurrences] = useState<PronunciationOccurrence[]>([]);
  const [matchedRule, setMatchedRule] = useState<PronunciationRule | null>(null);

  const popoverRef = useRef<HTMLDivElement>(null);
  const replacementInputRef = useRef<HTMLInputElement>(null);

  // Synchronize state when popover opens or initialPhrase changes
  useEffect(() => {
    if (isOpen) {
      const clean = initialPhrase.trim();
      setPhrase(clean);

      // Check if this phrase already has an existing rule
      const existing = existingRules.find(
        (r) => r.phrase.toLowerCase() === clean.toLowerCase(),
      );
      if (existing) {
        setMatchedRule(existing);
        setReplacement(existing.replacement);
        setMatchCase(Boolean(existing.match_case));
        setScope(
          existing.scope && existing.scope !== "entire_manuscript"
            ? "chapter"
            : "entire_manuscript",
        );
      } else {
        setMatchedRule(null);
        setReplacement("");
        setMatchCase(false);
        setScope(chapterId ? "chapter" : "entire_manuscript");
      }

      // Auto-focus the replacement field
      setTimeout(() => {
        replacementInputRef.current?.focus();
        replacementInputRef.current?.select();
      }, 80);
    }
  }, [isOpen, initialPhrase, existingRules, chapterId]);

  // Debounced live occurrence scan
  useEffect(() => {
    if (!isOpen || !phrase.trim() || !projectId) {
      setOccurrences([]);
      setSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const effectiveScope =
          scope === "chapter" && chapterId ? chapterId : "entire_manuscript";
        const result = await findPronunciationOccurrences(projectId, {
          word: phrase.trim(),
          replacement: replacement.trim(),
          match_case: matchCase,
          scope: effectiveScope,
        });
        setOccurrences(result.occurrences || []);
      } catch (err) {
        console.error("Failed to preview pronunciation occurrences:", err);
      } finally {
        setSearching(false);
      }
    }, 280);

    return () => clearTimeout(timer);
  }, [isOpen, phrase, replacement, matchCase, scope, projectId, chapterId]);

  // Close on Escape or click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !position) return null;

  // Calculate popover positioning relative to viewport
  const popoverWidth = 360;
  const popoverHeight = 380;
  const padding = 16;

  let left = position.left - popoverWidth / 2;
  if (left < padding) left = padding;
  if (left + popoverWidth > window.innerWidth - padding) {
    left = window.innerWidth - popoverWidth - padding;
  }

  let top = position.top - popoverHeight - 12;
  // If not enough room on top, position below
  if (top < padding) {
    top = position.top + 32;
  }
  if (top + popoverHeight > window.innerHeight - padding) {
    top = window.innerHeight - popoverHeight - padding;
  }

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!phrase.trim() || !replacement.trim() || saving) return;

    setSaving(true);
    try {
      const effectiveScope =
        scope === "chapter" && chapterId ? chapterId : "entire_manuscript";

      await savePronunciationRule(projectId, {
        phrase: phrase.trim(),
        replacement: replacement.trim(),
        match_case: matchCase,
        scope: effectiveScope,
        occurrences_count: occurrences.length,
      });

      onSaved(phrase.trim(), replacement.trim());
      onClose();
    } catch (err) {
      console.error("Failed to save pronunciation rule:", err);
      alert("Failed to save pronunciation rule.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!matchedRule || deleting) return;
    setDeleting(true);
    try {
      await deletePronunciationRule(projectId, matchedRule.id);
      onDeleted?.(matchedRule.phrase);
      onClose();
    } catch (err) {
      console.error("Failed to delete pronunciation rule:", err);
      alert("Failed to delete rule.");
    } finally {
      setDeleting(false);
    }
  };

  // Preview occurrence text formatting
  const previewOccurrence = occurrences[0];

  return (
    <div
      ref={popoverRef}
      style={{
        position: "fixed",
        top: `${top}px`,
        left: `${left}px`,
        width: `${popoverWidth}px`,
        zIndex: 60,
      }}
      className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-2xl p-4 flex flex-col gap-3.5 animate-in fade-in zoom-in-95 select-none"
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-neutral-100 dark:border-neutral-800">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 flex items-center justify-center">
            <RiVolumeUpLine className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-neutral-900 dark:text-neutral-100 tracking-tight">
              Phonetic Respelling
            </h3>
            <p className="text-[10px] text-neutral-400 dark:text-neutral-500">
              {matchedRule ? "Update active pronunciation rule" : "Quick pronunciation override"}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-md text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
        >
          <RiCloseLine className="w-4 h-4" />
        </button>
      </div>

      {/* Form Fields */}
      <form onSubmit={handleSave} className="flex flex-col gap-3">
        {/* Phrase / Word */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-300">
              Selected Phrase
            </label>
            {matchedRule && (
              <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.2 rounded">
                Active Rule
              </span>
            )}
          </div>
          <input
            type="text"
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            className="w-full text-xs font-serif px-2.5 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-neutral-900 dark:focus:border-neutral-100"
            placeholder="Selected text..."
          />
        </div>

        {/* Replacement Phonetic */}
        <div className="space-y-1">
          <label className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-300 flex items-center gap-1">
            <span>Phonetic Guide / Replacement</span>
            <RiSparklingLine className="w-3 h-3 text-primary" />
          </label>
          <input
            ref={replacementInputRef}
            type="text"
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-neutral-100 font-medium"
            placeholder="e.g. Jun Myung Hoon, Eh-LIK-ser"
          />
        </div>

        {/* Scope and Match Case */}
        <div className="flex items-center justify-between gap-2 pt-0.5">
          {/* Scope Toggle */}
          <div className="inline-flex rounded-lg border border-neutral-200 dark:border-neutral-700 p-0.5 bg-neutral-100 dark:bg-neutral-800 text-[10px] font-semibold">
            {chapterId && (
              <button
                type="button"
                onClick={() => setScope("chapter")}
                className={`px-2 py-1 rounded-md transition-colors flex items-center gap-1 cursor-pointer ${
                  scope === "chapter"
                    ? "bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 shadow-2xs"
                    : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
                }`}
                title={chapterTitle ? `Apply only to ${chapterTitle}` : "Apply to this chapter"}
              >
                <RiBookOpenLine className="w-3 h-3" />
                <span>This Chapter</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setScope("entire_manuscript")}
              className={`px-2 py-1 rounded-md transition-colors flex items-center gap-1 cursor-pointer ${
                scope === "entire_manuscript"
                  ? "bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 shadow-2xs"
                  : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
              }`}
              title="Apply to all chapters in manuscript"
            >
              <RiGlobalLine className="w-3 h-3" />
              <span>All Chapters</span>
            </button>
          </div>

          {/* Match Case Checkbox */}
          <label className="flex items-center gap-1.5 text-[11px] text-neutral-600 dark:text-neutral-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={matchCase}
              onChange={(e) => setMatchCase(e.target.checked)}
              className="rounded border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 focus:ring-0"
            />
            <span>Match Case</span>
          </label>
        </div>

        {/* Live Occurrence Status & Preview */}
        <div className="rounded-xl border border-neutral-100 dark:border-neutral-800 bg-neutral-50/80 dark:bg-neutral-800/40 p-2.5 text-[11px] space-y-1.5">
          <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400">
            <span className="flex items-center gap-1">
              <RiSearchLine className="w-3 h-3" />
              <span>Occurrences found:</span>
            </span>
            {searching ? (
              <span className="flex items-center gap-1 text-neutral-400">
                <RiLoader4Line className="w-3 h-3 animate-spin" />
                <span>Searching...</span>
              </span>
            ) : (
              <span className="font-semibold text-neutral-800 dark:text-neutral-200 font-mono">
                {occurrences.length} {occurrences.length === 1 ? "match" : "matches"}
              </span>
            )}
          </div>

          {/* Context Snippet Preview */}
          {previewOccurrence && replacement.trim() ? (
            <div className="pt-1 border-t border-neutral-200/50 dark:border-neutral-700/50 space-y-0.5">
              <p className="text-[10px] text-neutral-400 dark:text-neutral-500">
                Audio preview ({previewOccurrence.chapter_title}):
              </p>
              <p className="text-[11px] font-serif text-neutral-700 dark:text-neutral-300 line-clamp-2 italic bg-white dark:bg-neutral-900 p-1.5 rounded border border-neutral-200/60 dark:border-neutral-700/60">
                "{previewOccurrence.preview_text}"
              </p>
            </div>
          ) : null}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-1 gap-2">
          {matchedRule ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="px-2.5 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-50"
              title="Delete this pronunciation rule"
            >
              {deleting ? (
                <RiLoader4Line className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RiDeleteBinLine className="w-3.5 h-3.5" />
              )}
              <span>Delete</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
          )}

          <button
            type="submit"
            disabled={!phrase.trim() || !replacement.trim() || saving}
            className="px-4 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-neutral-200 text-white dark:text-neutral-900 text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors disabled:opacity-40"
          >
            {saving ? (
              <RiLoader4Line className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RiCheckLine className="w-3.5 h-3.5" />
            )}
            <span>{matchedRule ? "Update Rule" : "Save Rule"}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
