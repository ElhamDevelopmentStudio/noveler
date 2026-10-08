import { useState, useEffect } from "react";
import {
  RiCloseLine,
  RiSearchLine,
  RiShieldCheckLine,
  RiCheckLine,
  RiFileTextLine,
  RiLoader4Line,
  RiDeleteBinLine,
  RiVolumeUpLine,
} from "@remixicon/react";
import type {
  PronunciationOccurrence,
  PronunciationRule,
} from "@novelova/shared-types";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  findPronunciationOccurrences,
  listPronunciationRules,
  savePronunciationRule,
  deletePronunciationRule,
} from "@/services/character-and-pronunciation";

interface PronunciationDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export function PronunciationDialog({
  projectId,
  open,
  onOpenChange,
  onSaved,
}: PronunciationDialogProps) {
  const [word, setWord] = useState("");
  const [replacement, setReplacement] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [scope, setScope] = useState("entire_manuscript");

  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [occurrences, setOccurrences] = useState<PronunciationOccurrence[]>([]);
  const [includedSegmentIds, setIncludedSegmentIds] = useState<Set<string>>(
    new Set(),
  );
  const [hasSearched, setHasSearched] = useState(false);

  const [existingRules, setExistingRules] = useState<PronunciationRule[]>([]);
  const [activeTab, setActiveTab] = useState<"new" | "existing">("new");

  const loadRules = async () => {
    if (!projectId) return;
    try {
      const rules = await listPronunciationRules(projectId);
      setExistingRules(rules || []);
    } catch (err) {
      console.error("Failed to load pronunciation rules", err);
    }
  };

  useEffect(() => {
    if (open) {
      loadRules();
    }
  }, [open, projectId]);

  const handleFind = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!word.trim() || !replacement.trim()) return;

    setSearching(true);
    try {
      const res = await findPronunciationOccurrences(projectId, {
        word: word.trim(),
        replacement: replacement.trim(),
        match_case: matchCase,
        scope,
      });
      const found = res.occurrences || [];
      setOccurrences(found);
      setIncludedSegmentIds(new Set(found.map((o) => o.segment_id)));
      setHasSearched(true);
    } catch (err) {
      console.error("Failed to find occurrences", err);
      alert("Failed to search occurrences.");
    } finally {
      setSearching(false);
    }
  };

  const toggleInclude = (segmentId: string) => {
    setIncludedSegmentIds((prev) => {
      const next = new Set(prev);
      if (next.has(segmentId)) {
        next.delete(segmentId);
      } else {
        next.add(segmentId);
      }
      return next;
    });
  };

  const handleSaveRule = async () => {
    if (!word.trim() || !replacement.trim() || occurrences.length === 0) return;

    setSaving(true);
    try {
      const excluded = occurrences
        .filter((o) => !includedSegmentIds.has(o.segment_id))
        .map((o) => o.segment_id);

      await savePronunciationRule(projectId, {
        phrase: word.trim(),
        replacement: replacement.trim(),
        match_case: matchCase,
        scope,
        occurrences_count: includedSegmentIds.size,
        excluded_segment_ids: excluded,
      });

      await loadRules();
      onSaved?.();
      // Reset form
      setWord("");
      setReplacement("");
      setOccurrences([]);
      setHasSearched(false);
      onOpenChange(false);
    } catch (err) {
      console.error("Failed to save pronunciation rule", err);
      alert("Failed to save pronunciation rule.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    try {
      await deletePronunciationRule(projectId, ruleId);
      setExistingRules((prev) => prev.filter((r) => r.id !== ruleId));
      onSaved?.();
    } catch (err) {
      console.error("Failed to delete rule", err);
      alert("Failed to delete rule.");
    }
  };

  const includedCount = occurrences.filter((o) =>
    includedSegmentIds.has(o.segment_id),
  ).length;

  // Helper to render text with matched word bolded
  const renderHighlightedSnippet = (text: string, query: string) => {
    if (!query) return text;
    const flags = matchCase ? "g" : "gi";
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, flags);
    const parts = text.split(regex);
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <span key={i} className="font-bold text-neutral-900 bg-amber-100 px-0.5 rounded">
          {part}
        </span>
      ) : (
        part
      ),
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden rounded-2xl border-neutral-200/90 shadow-2xl bg-white sm:max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4.5 border-b border-neutral-200/80">
          <div className="flex items-center gap-3">
            <DialogTitle className="text-lg font-semibold tracking-tight text-neutral-900">
              Pronunciation
            </DialogTitle>
            {existingRules.length > 0 && (
              <div className="flex items-center gap-1 bg-neutral-100 p-0.5 rounded-lg text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setActiveTab("new")}
                  className={`px-2.5 py-1 rounded-md transition-colors ${
                    activeTab === "new"
                      ? "bg-white text-neutral-900 shadow-2xs"
                      : "text-neutral-500 hover:text-neutral-900"
                  }`}
                >
                  New rule
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("existing")}
                  className={`px-2.5 py-1 rounded-md transition-colors ${
                    activeTab === "existing"
                      ? "bg-white text-neutral-900 shadow-2xs"
                      : "text-neutral-500 hover:text-neutral-900"
                  }`}
                >
                  Active rules ({existingRules.length})
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors cursor-pointer"
          >
            <RiCloseLine className="h-5 w-5" />
          </button>
        </div>

        {activeTab === "existing" ? (
          /* Active Rules List */
          <div className="flex-1 overflow-y-auto p-6 space-y-3 min-h-[350px]">
            <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
              Saved Pronunciation Rules
            </h3>
            {existingRules.length === 0 ? (
              <p className="text-xs text-neutral-500 py-10 text-center">
                No active pronunciation rules saved yet.
              </p>
            ) : (
              <div className="divide-y divide-neutral-100 border border-neutral-200 rounded-xl overflow-hidden">
                {existingRules.map((rule) => (
                  <div
                    key={rule.id}
                    className="p-3.5 bg-white flex items-center justify-between gap-4 text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-neutral-900">
                          {rule.phrase}
                        </span>
                        <span className="text-neutral-400">→</span>
                        <span className="font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                          {rule.replacement}
                        </span>
                      </div>
                      <p className="text-[11px] text-neutral-400 mt-1">
                        Scope: {rule.scope.replace("_", " ")} · {rule.occurrences_count} occurrences
                        {rule.match_case ? " · Case-sensitive" : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteRule(rule.id)}
                      className="p-2 text-neutral-400 hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors cursor-pointer"
                      title="Delete rule"
                    >
                      <RiDeleteBinLine className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* New Rule Creation Form */
          <>
            {/* Search Configuration Fields */}
            <form onSubmit={handleFind} className="px-6 py-5 border-b border-neutral-200/80 space-y-4 bg-white">
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
                {/* Find Field */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-neutral-700 block">
                    Word or phrase to find
                  </label>
                  <input
                    type="text"
                    value={word}
                    onChange={(e) => setWord(e.target.value)}
                    placeholder="e.g. Llywelyn"
                    className="w-full px-3.5 py-2 rounded-xl border border-neutral-200 bg-white text-xs text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-900 shadow-2xs"
                  />
                </div>

                {/* Replacement Field */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-neutral-700 block">
                    Replacement / pronunciation
                  </label>
                  <input
                    type="text"
                    value={replacement}
                    onChange={(e) => setReplacement(e.target.value)}
                    placeholder="e.g. loo-EL-in"
                    className="w-full px-3.5 py-2 rounded-xl border border-neutral-200 bg-white text-xs text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-900 shadow-2xs"
                  />
                </div>

                {/* Find Button */}
                <button
                  type="submit"
                  disabled={searching || !word.trim() || !replacement.trim()}
                  className="inline-flex items-center justify-center gap-1.5 px-5 py-2 rounded-xl bg-neutral-900 text-white text-xs font-semibold hover:bg-neutral-800 transition-colors shadow-2xs cursor-pointer disabled:opacity-50 shrink-0 h-[36px]"
                >
                  {searching ? (
                    <RiLoader4Line className="h-4 w-4 animate-spin" />
                  ) : (
                    <RiSearchLine className="h-3.5 w-3.5" />
                  )}
                  <span>Find</span>
                </button>
              </div>

              {/* Secondary Controls: Match Case & Scope */}
              <div className="flex items-center justify-between pt-1 text-xs">
                <label className="inline-flex items-center gap-2 cursor-pointer select-none text-neutral-600">
                  <input
                    type="checkbox"
                    checked={matchCase}
                    onChange={(e) => setMatchCase(e.target.checked)}
                    className="rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900 h-3.5 w-3.5"
                  />
                  <span>Match case</span>
                </label>

                <div className="flex items-center gap-2">
                  <span className="text-neutral-500 font-medium select-none">Scope:</span>
                  <select
                    value={scope}
                    onChange={(e) => setScope(e.target.value)}
                    className="px-2.5 py-1 rounded-lg border border-neutral-200 bg-white text-xs text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900 cursor-pointer"
                  >
                    <option value="entire_manuscript">Entire manuscript</option>
                  </select>
                </div>
              </div>
            </form>

            {/* Results Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 min-h-[250px] max-h-[440px] bg-neutral-50/30">
              {searching ? (
                <div className="py-16 text-center space-y-2">
                  <RiLoader4Line className="h-6 w-6 animate-spin mx-auto text-neutral-400" />
                  <p className="text-xs text-neutral-500">Searching manuscript occurrences...</p>
                </div>
              ) : hasSearched && occurrences.length === 0 ? (
                <div className="py-16 text-center space-y-2">
                  <p className="text-xs text-neutral-500">
                    No occurrences of &quot;{word}&quot; found in the manuscript.
                  </p>
                </div>
              ) : hasSearched && occurrences.length > 0 ? (
                <>
                  {/* Results Count Header */}
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 font-semibold text-neutral-900">
                      <span>{occurrences.length} occurrences found</span>
                      <span className="px-2 py-0.5 rounded-full bg-neutral-200/70 text-neutral-600 text-[10px]">
                        {occurrences.length} total
                      </span>
                    </div>
                    <span className="text-neutral-500 font-medium">
                      {includedCount} of {occurrences.length} included
                    </span>
                  </div>

                  {/* Occurrence Cards */}
                  <div className="space-y-3">
                    {occurrences.map((item) => {
                      const isIncluded = includedSegmentIds.has(item.segment_id);
                      return (
                        <div
                          key={item.segment_id}
                          className={`rounded-xl border transition-all ${
                            isIncluded
                              ? "border-neutral-200 bg-white shadow-2xs"
                              : "border-neutral-200/60 bg-neutral-50/60 opacity-60"
                          } p-3.5 space-y-2.5`}
                        >
                          {/* Card Header: Chapter info & Checkbox */}
                          <div className="flex items-center justify-between pb-1.5 border-b border-neutral-100 text-xs">
                            <div className="flex items-center gap-1.5 text-neutral-600 font-medium">
                              <RiFileTextLine className="h-3.5 w-3.5 text-neutral-400" />
                              <span>
                                Chapter {item.chapter_number} · {item.chapter_title}
                              </span>
                            </div>
                            <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs font-medium text-neutral-700 select-none">
                              <input
                                type="checkbox"
                                checked={isIncluded}
                                onChange={() => toggleInclude(item.segment_id)}
                                className="rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900 h-3.5 w-3.5"
                              />
                              <span>Include</span>
                            </label>
                          </div>

                          {/* Card Body: 2 Columns */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-serif leading-relaxed">
                            {/* Current text */}
                            <div className="space-y-1">
                              <span className="text-[10px] font-sans font-semibold uppercase tracking-wider text-neutral-400 block">
                                Current text
                              </span>
                              <p className="text-neutral-700">
                                {renderHighlightedSnippet(item.current_text, word)}
                              </p>
                            </div>

                            {/* After replacement */}
                            <div className="space-y-1">
                              <span className="text-[10px] font-sans font-semibold uppercase tracking-wider text-emerald-600 block">
                                After replacement
                              </span>
                              <p className="text-neutral-900">
                                {item.after_replacement ||
                                  item.current_text.replace(
                                    new RegExp(word, matchCase ? "g" : "gi"),
                                    replacement,
                                  )}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="py-16 text-center space-y-2">
                  <div className="w-10 h-10 rounded-full bg-neutral-100 text-neutral-400 flex items-center justify-center mx-auto">
                    <RiVolumeUpLine className="h-5 w-5" />
                  </div>
                  <p className="text-xs text-neutral-500 max-w-sm mx-auto">
                    Enter a word and its pronunciation replacement above, then click &quot;Find&quot; to review occurrences.
                  </p>
                </div>
              )}
            </div>

            {/* Explanatory Notice */}
            <div className="px-6 py-2.5 bg-neutral-50/80 border-t border-neutral-200/70 flex items-center gap-2 text-[11px] text-neutral-500">
              <RiShieldCheckLine className="h-4 w-4 text-neutral-400 shrink-0" />
              <span>
                Only the included occurrences will be changed. The visible manuscript text remains authentic; the replacement affects audio pronunciation output.
              </span>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-neutral-200/80 bg-white flex flex-col sm:flex-row items-center justify-between gap-3">
              <span className="text-xs text-neutral-500 font-medium">
                {occurrences.length > 0
                  ? `${includedCount} occurrence${includedCount !== 1 ? "s" : ""} ready to save`
                  : "0 pronunciation rules ready to save"}
              </span>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="px-4 py-2 rounded-xl border border-neutral-200 bg-white text-xs font-semibold text-neutral-700 hover:bg-neutral-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveRule}
                  disabled={saving || occurrences.length === 0 || includedCount === 0}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-neutral-900 text-white text-xs font-semibold hover:bg-neutral-800 transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
                >
                  {saving ? (
                    <RiLoader4Line className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RiCheckLine className="h-3.5 w-3.5" />
                  )}
                  <span>Save pronunciation</span>
                </button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
