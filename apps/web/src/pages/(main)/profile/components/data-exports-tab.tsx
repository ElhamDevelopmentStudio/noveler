import { useState, useEffect } from "react";
import {
  RiDownload2Line,
  RiFileTextLine,
  RiCodeSSlashLine,
  RiSparklingLine,
  RiCheckLine,
} from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { ExportTaggedModal } from "@/components/export-tagged-modal";
import { getTaggedProjectsSummary } from "@/services/tagged-dataset";
import type { TaggedProjectSummary } from "@novelova/shared-types";

export function DataExportsTab() {
  const [modalOpen, setModalOpen] = useState(false);
  const [projects, setProjects] = useState<TaggedProjectSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function loadStats() {
      try {
        const data = await getTaggedProjectsSummary();
        if (isMounted) {
          setProjects(data);
        }
      } catch (err) {
        console.error("Failed to load tagged summary:", err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }
    loadStats();
    return () => {
      isMounted = false;
    };
  }, []);

  const totalChapters = projects.reduce((acc, p) => acc + p.tagged_chapters_count, 0);
  const totalDialogues = projects.reduce((acc, p) => acc + p.dialogue_segments_count, 0);
  const totalSegments = projects.reduce((acc, p) => acc + p.tagged_segments_count, 0);

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Hero Banner Card */}
      <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-linear-to-b from-neutral-50/80 to-white dark:from-neutral-900/40 dark:to-neutral-950 p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200/80 dark:border-emerald-800/80">
              <RiSparklingLine className="h-3.5 w-3.5" />
              <span>Model Fine-Tuning Hub</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
              Export Tagged Chapters
            </h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
              Export all tagged chapters across your novels into structured datasets.
              Select novels to include, choose between JSON & JSONL or Plain Text, and generate training data ready for fine-tuning dialogue attribution SLMs.
            </p>
          </div>

          <div className="shrink-0">
            <Button
              type="button"
              onClick={() => setModalOpen(true)}
              className="gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-neutral-200 text-white dark:text-neutral-900 shadow-sm cursor-pointer transition-all"
            >
              <RiDownload2Line className="h-4 w-4" />
              <span>Export Tagged Dataset</span>
            </Button>
          </div>
        </div>

        {/* Live Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-8 pt-6 border-t border-neutral-200/80 dark:border-neutral-800/80">
          <div className="space-y-1">
            <span className="text-xs text-neutral-500 dark:text-neutral-400">Tagged Novels</span>
            <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
              {isLoading ? "—" : projects.length}
            </p>
          </div>
          <div className="space-y-1">
            <span className="text-xs text-neutral-500 dark:text-neutral-400">Tagged Chapters</span>
            <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
              {isLoading ? "—" : totalChapters}
            </p>
          </div>
          <div className="space-y-1">
            <span className="text-xs text-neutral-500 dark:text-neutral-400">Dialogue Turns</span>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {isLoading ? "—" : totalDialogues.toLocaleString()}
            </p>
          </div>
          <div className="space-y-1">
            <span className="text-xs text-neutral-500 dark:text-neutral-400">Total Segments</span>
            <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
              {isLoading ? "—" : totalSegments.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* Dataset Capabilities Section */}
      <div className="grid sm:grid-cols-2 gap-6">
        {/* JSON / JSONL Card */}
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-6 bg-white dark:bg-neutral-950 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
              <RiCodeSSlashLine className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-neutral-900 dark:text-neutral-100">
                JSON & JSONL Training Dataset
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                For instruction fine-tuning & SLMs (Qwen / Llama / Mistral)
              </p>
            </div>
          </div>
          <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
            Outputs per-chapter schema files containing token-aligned segment data, character dossiers, narrative POV, and a master <code className="px-1 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 font-mono text-[11px]">fine_tuning_train.jsonl</code> formatted in OpenAI/Chat message format.
          </p>
          <ul className="text-xs space-y-1.5 text-neutral-600 dark:text-neutral-400 pt-1">
            <li className="flex items-center gap-1.5">
              <RiCheckLine className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              <span>Full speaker attribution, emotion, and delivery types</span>
            </li>
            <li className="flex items-center gap-1.5">
              <RiCheckLine className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              <span>Includes present character aliases and narrative POV</span>
            </li>
            <li className="flex items-center gap-1.5">
              <RiCheckLine className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              <span>Plugs directly into Unsloth, HuggingFace, and Axolotl</span>
            </li>
          </ul>
        </div>

        {/* TXT Script Card */}
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-6 bg-white dark:bg-neutral-950 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400">
              <RiFileTextLine className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-neutral-900 dark:text-neutral-100">
                Annotated Script Dataset (.txt)
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                For causal language modeling and text analysis
              </p>
            </div>
          </div>
          <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
            Outputs structured screenplay files with <code className="px-1 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 font-mono text-[11px]">[SPEAKER: ... | EMOTION: ...]</code> headers before dialogue lines, character rosters, and an aggregated <code className="px-1 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 font-mono text-[11px]">all_tagged_dataset.txt</code> master file.
          </p>
          <ul className="text-xs space-y-1.5 text-neutral-600 dark:text-neutral-400 pt-1">
            <li className="flex items-center gap-1.5">
              <RiCheckLine className="h-3.5 w-3.5 text-blue-500 shrink-0" />
              <span>Human-readable annotated screenplay formatting</span>
            </li>
            <li className="flex items-center gap-1.5">
              <RiCheckLine className="h-3.5 w-3.5 text-blue-500 shrink-0" />
              <span>Distinguishes dialogue, internal thoughts, and system prompts</span>
            </li>
            <li className="flex items-center gap-1.5">
              <RiCheckLine className="h-3.5 w-3.5 text-blue-500 shrink-0" />
              <span>Concatenated master text for causal pre-training</span>
            </li>
          </ul>
        </div>
      </div>

      {/* Export Modal */}
      <ExportTaggedModal open={modalOpen} onOpenChange={setModalOpen} />
    </div>
  );
}

export default DataExportsTab;
