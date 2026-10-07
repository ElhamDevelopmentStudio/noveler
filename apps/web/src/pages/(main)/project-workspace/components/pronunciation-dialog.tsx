import { useState } from "react";
import {
  RiSearchLine,
  RiFileTextLine,
  RiInformationLine,
  RiLoader4Line,
} from "@remixicon/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Project, PronunciationOccurrence } from "@novelova/shared-types";
import {
  searchPronunciation,
  savePronunciationRule,
} from "@/services/character-and-pronunciation";

interface PronunciationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
  onSaved?: () => void;
}

export function PronunciationDialog({
  open,
  onOpenChange,
  project,
  onSaved,
}: PronunciationDialogProps) {
  const [phrase, setPhrase] = useState("Llywelyn");
  const [replacement, setReplacement] = useState("loo-EL-in");
  const [matchCase, setMatchCase] = useState(false);
  const [scope, setScope] = useState("entire_manuscript");
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [occurrences, setOccurrences] = useState<PronunciationOccurrence[]>([
    {
      chapter_number: 4,
      chapter_title: "The orchard keeper",
      segment_id: "seg-1",
      current_text: '“Ask Llywelyn about the eastern wall,” Elias said.',
      after_replacement: '“Ask loo-EL-in about the eastern wall,” Elias said.',
      included: true,
    },
    {
      chapter_number: 9,
      chapter_title: "A winter ledger",
      segment_id: "seg-2",
      current_text: "The name Llywelyn appeared twice in the orchard ledger.",
      after_replacement: "The name loo-EL-in appeared twice in the orchard ledger.",
      included: true,
    },
    {
      chapter_number: 17,
      chapter_title: "Survey stones",
      segment_id: "seg-3",
      current_text: "Mara traced Llywelyn into the dust with one finger.",
      after_replacement: "Mara traced loo-EL-in into the dust with one finger.",
      included: true,
    },
  ]);

  const handleSearch = async () => {
    if (!phrase.trim()) return;
    setIsSearching(true);
    try {
      const data = await searchPronunciation(
        project.id,
        phrase.trim(),
        replacement.trim(),
        matchCase,
        scope,
      );
      if (data.occurrences.length > 0) {
        setOccurrences(data.occurrences);
      }
    } catch {
      // Keep existing preview occurrences if backend search returns empty in demo
    } finally {
      setIsSearching(false);
    }
  };

  const toggleInclude = (idx: number) => {
    setOccurrences((prev) =>
      prev.map((item, i) =>
        i === idx ? { ...item, included: !item.included } : item,
      ),
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const includedCount = occurrences.filter((o) => o.included).length;
      await savePronunciationRule(project.id, {
        phrase: phrase.trim(),
        replacement: replacement.trim(),
        match_case: matchCase,
        scope,
        occurrences_count: includedCount,
      });
      onSaved?.();
      onOpenChange(false);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to save rule");
    } finally {
      setIsSaving(false);
    }
  };

  const includedCount = occurrences.filter((o) => o.included).length;

  const renderHighlightedText = (text: string, highlight: string) => {
    if (!highlight) return text;
    const parts = text.split(new RegExp(`(${highlight})`, "gi"));
    return (
      <>
        {parts.map((part, i) =>
          part.toLowerCase() === highlight.toLowerCase() ? (
            <strong key={i} className="font-bold text-neutral-950">
              {part}
            </strong>
          ) : (
            <span key={i}>{part}</span>
          ),
        )}
      </>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden rounded-2xl border-neutral-200">
        <div className="p-6 pb-4">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-xl font-bold font-serif text-neutral-900 tracking-tight">
              Pronunciation
            </DialogTitle>
          </DialogHeader>

          {/* Search Inputs Row */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="block text-[11px] font-semibold text-neutral-700 mb-1 select-none">
                  Word or phrase to find
                </label>
                <input
                  type="text"
                  value={phrase}
                  onChange={(e) => setPhrase(e.target.value)}
                  placeholder="e.g. Llywelyn"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-neutral-200 bg-white text-neutral-900 focus:outline-hidden focus:border-neutral-900 shadow-2xs"
                />
              </div>

              <div className="flex-1">
                <label className="block text-[11px] font-semibold text-neutral-700 mb-1 select-none">
                  Replacement / pronunciation
                </label>
                <input
                  type="text"
                  value={replacement}
                  onChange={(e) => setReplacement(e.target.value)}
                  placeholder="e.g. loo-EL-in"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-neutral-200 bg-white text-neutral-900 focus:outline-hidden focus:border-neutral-900 shadow-2xs"
                />
              </div>

              <div className="pt-5">
                <button
                  type="button"
                  onClick={handleSearch}
                  disabled={isSearching}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer active:scale-98"
                >
                  {isSearching ? (
                    <RiLoader4Line className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RiSearchLine className="h-3.5 w-3.5" />
                  )}
                  <span>Find</span>
                </button>
              </div>
            </div>

            {/* Match Case & Scope Controls */}
            <div className="flex items-center justify-between text-xs text-neutral-600 select-none pt-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={matchCase}
                  onChange={(e) => setMatchCase(e.target.checked)}
                  className="rounded border-neutral-300 text-neutral-900 focus:ring-0 cursor-pointer"
                />
                <span>Match case</span>
              </label>

              <div className="flex items-center gap-2">
                <span className="text-neutral-400">Scope</span>
                <select
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                  className="text-xs rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-neutral-800 focus:outline-hidden shadow-2xs cursor-pointer"
                >
                  <option value="entire_manuscript">Entire manuscript</option>
                  <option value="current_chapter">Current chapter</option>
                </select>
              </div>
            </div>
          </div>

          {/* Occurrences Stats Bar */}
          <div className="flex items-center justify-between mt-5 pt-4 border-t border-neutral-100 text-xs select-none">
            <div className="flex items-center gap-2">
              <span className="font-bold text-neutral-900">
                {occurrences.length} occurrences found
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-neutral-100 text-neutral-600">
                {occurrences.length} total
              </span>
            </div>
            <span className="text-neutral-400 text-xs">
              {includedCount} of {occurrences.length} included
            </span>
          </div>

          {/* Occurrences Cards List */}
          <div className="mt-3 space-y-3 max-h-[320px] overflow-y-auto pr-1">
            {occurrences.map((item, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-xl border border-neutral-200/80 bg-neutral-50/50 space-y-2 text-xs"
              >
                {/* Chapter Heading + Include Checkbox */}
                <div className="flex items-center justify-between select-none">
                  <div className="flex items-center gap-2 font-medium text-neutral-700">
                    <RiFileTextLine className="h-3.5 w-3.5 text-neutral-400" />
                    <span>
                      Chapter {item.chapter_number} · {item.chapter_title}
                    </span>
                  </div>

                  <label className="flex items-center gap-1.5 cursor-pointer text-[11px] font-semibold text-neutral-800">
                    <input
                      type="checkbox"
                      checked={item.included}
                      onChange={() => toggleInclude(idx)}
                      className="rounded border-neutral-300 text-neutral-900 focus:ring-0 cursor-pointer"
                    />
                    <span>Include</span>
                  </label>
                </div>

                {/* Diff Comparison */}
                <div className="space-y-1 pt-1 font-serif text-neutral-600 leading-relaxed">
                  <div>
                    <span className="text-[10px] font-sans font-bold tracking-wider text-neutral-400 uppercase block mb-0.5">
                      CURRENT TEXT
                    </span>
                    <p className="text-neutral-800">
                      {renderHighlightedText(item.current_text, phrase)}
                    </p>
                  </div>

                  <div className="pt-1">
                    <span className="text-[10px] font-sans font-bold tracking-wider text-neutral-400 uppercase block mb-0.5">
                      AFTER REPLACEMENT
                    </span>
                    <p className="text-neutral-800">
                      {renderHighlightedText(item.after_replacement, replacement)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Info Callout */}
          <div className="flex items-start gap-2 mt-4 text-[11px] text-neutral-500">
            <RiInformationLine className="h-4 w-4 shrink-0 text-neutral-400 mt-0.5" />
            <span>
              Only the {includedCount} included occurrences will be changed. The visible manuscript text
              remains &ldquo;{phrase}&rdquo;; the replacement affects pronunciation output.
            </span>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 bg-neutral-50/80 border-t border-neutral-100 select-none">
          <span className="text-xs text-neutral-500 font-medium">
            1 pronunciation rule ready to save
          </span>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
              className="px-4 py-2 rounded-xl border border-neutral-200 bg-white text-xs font-semibold text-neutral-700 hover:bg-neutral-50 shadow-2xs cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer active:scale-98 disabled:opacity-70"
            >
              {isSaving ? (
                <>
                  <RiLoader4Line className="h-3.5 w-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>Save pronunciation</span>
              )}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
