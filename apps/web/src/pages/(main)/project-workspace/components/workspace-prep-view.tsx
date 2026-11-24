import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import {
  RiAddLine,
  RiDeleteBinLine,
  RiLoader4Line,
  RiSearchLine,
  RiSparklingLine,
} from "@remixicon/react";
import type { PronunciationRule } from "@novelova/shared-types";
import {
  deletePronunciationRule,
  listPronunciationRules,
  savePronunciationRule,
} from "@/services/character-and-pronunciation";
import {
  extractPronunciationGlossary,
  togglePronunciationRule,
} from "@/services/voice-design";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SFXPanel } from "./sfx-panel";

interface WorkspacePrepViewProps {
  projectId: string;
  onRefresh: () => void;
  onOpenAdvancedPronunciation: () => void;
}

export function WorkspacePrepView({
  projectId,
  onRefresh,
  onOpenAdvancedPronunciation,
}: WorkspacePrepViewProps) {
  const [word, setWord] = useState("");
  const [replacement, setReplacement] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);

  const { data: rules = [], mutate: mutateRules } = useSWR<PronunciationRule[]>(
    projectId ? `/projects/${projectId}/pronunciation` : null,
    () => listPronunciationRules(projectId),
    { revalidateOnFocus: false },
  );

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!word.trim() || !replacement.trim()) return;
    setIsSaving(true);
    try {
      await savePronunciationRule(projectId, {
        phrase: word.trim(),
        replacement: replacement.trim(),
        match_case: false,
        scope: "entire_manuscript",
        occurrences_count: 0,
      });
      setWord("");
      setReplacement("");
      await mutateRules();
      onRefresh();
      toast.success(`Added pronunciation rule for "${word.trim()}"`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save rule.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggle = async (rule: PronunciationRule) => {
    try {
      await togglePronunciationRule(projectId, rule.id, !rule.is_active);
      await mutateRules();
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update rule.");
    }
  };

  const handleDelete = async (rule: PronunciationRule) => {
    try {
      await deletePronunciationRule(projectId, rule.id);
      await mutateRules();
      onRefresh();
      toast.success(`Removed rule for "${rule.phrase}"`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete rule.");
    }
  };

  const handleExtractGlossary = async () => {
    setIsExtracting(true);
    try {
      await extractPronunciationGlossary(projectId, { save_as_drafts: true });
      await mutateRules();
      toast.success("Extracted pronunciation candidates from manuscript.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to extract glossary.");
    } finally {
      setIsExtracting(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6 bg-background">
      <div className="max-w-4xl mx-auto space-y-6">
        <Tabs defaultValue="pronunciation" className="w-full space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h1 className="font-display text-2xl text-foreground">
                Pronunciation &amp; SFX
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Manage phonetic overrides, foley cues, ambient atmospheres, and voice filters.
              </p>
            </div>
            <TabsList variant="pills">
              <TabsTrigger value="pronunciation" className="text-xs">
                Pronunciation ({rules.length})
              </TabsTrigger>
              <TabsTrigger value="sfx" className="text-xs">
                SFX &amp; Atmosphere
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="pronunciation" className="space-y-6 mt-0">
            <form onSubmit={handleQuickAdd} className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={word}
                onChange={(e) => setWord(e.target.value)}
                placeholder="Word or name (e.g. Aurelia)"
                className="flex-1 h-9 px-3 rounded-lg bg-card border border-input text-xs text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-ring"
              />
              <input
                type="text"
                value={replacement}
                onChange={(e) => setReplacement(e.target.value)}
                placeholder="Phonetic spelling (e.g. aw-RAY-lee-uh)"
                className="flex-1 h-9 px-3 rounded-lg bg-card border border-input text-xs text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-ring"
              />
              <button
                type="submit"
                disabled={isSaving || !word.trim() || !replacement.trim()}
                className="inline-flex items-center justify-center gap-1.5 px-4 h-9 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 disabled:opacity-50 cursor-pointer shrink-0"
              >
                {isSaving ? (
                  <RiLoader4Line className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RiAddLine className="h-3.5 w-3.5" />
                )}
                <span>Add Rule</span>
              </button>
            </form>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-muted-foreground">
                {rules.length} saved rule{rules.length === 1 ? "" : "s"}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExtractGlossary}
                  disabled={isExtracting}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-secondary text-xs font-medium text-foreground cursor-pointer disabled:opacity-50"
                >
                  {isExtracting ? (
                    <RiLoader4Line className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RiSparklingLine className="h-3.5 w-3.5 text-violet-500" />
                  )}
                  <span>Auto-Extract Glossary</span>
                </button>
                <button
                  type="button"
                  onClick={onOpenAdvancedPronunciation}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-secondary text-xs font-medium text-foreground cursor-pointer"
                >
                  <RiSearchLine className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>Find &amp; Exclude Occurrences</span>
                </button>
              </div>
            </div>

            {rules.length === 0 ? (
              <div className="py-12 text-center border-t border-b border-border text-xs text-muted-foreground">
                No pronunciation rules yet. Add a custom spelling above or auto-extract terms from your manuscript.
              </div>
            ) : (
              <div className="border-t border-b border-border divide-y divide-border">
                {rules.map((rule) => (
                  <div
                    key={rule.id}
                    className="py-3 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex flex-wrap items-center gap-2.5 min-w-0">
                      <span className="font-medium text-sm text-foreground">
                        {rule.phrase}
                      </span>
                      <span className="text-muted-foreground">→</span>
                      <span className="font-mono px-2 py-0.5 rounded bg-secondary text-foreground">
                        {rule.replacement}
                      </span>
                      {rule.occurrences_count > 0 && (
                        <span className="text-muted-foreground">
                          {rule.occurrences_count} match{rule.occurrences_count === 1 ? "" : "es"}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <Switch
                        checked={rule.is_active}
                        onCheckedChange={() => handleToggle(rule)}
                        aria-label={`Toggle ${rule.phrase}`}
                      />
                      <button
                        type="button"
                        onClick={() => handleDelete(rule)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"
                        title={`Delete ${rule.phrase}`}
                      >
                        <RiDeleteBinLine className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="sfx" className="mt-0">
            <div className="border border-border rounded-2xl overflow-hidden bg-card min-h-[480px]">
              <SFXPanel
                projectId={projectId}
                onApplied={onRefresh}
                className="w-full sm:w-full border-r-0 bg-transparent"
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
