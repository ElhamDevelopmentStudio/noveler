import { useState, useMemo } from "react";
import {
  RiHistoryLine,
  RiAlertLine,
  RiStopLine,
  RiDownloadLine,
  RiCpuLine,
  RiCoinsLine,
  RiGlobalLine,
  RiBookOpenLine,
  RiFileList3Line,
  RiCodeSSlashLine,
  RiFileCopyLine,
  RiCheckDoubleLine,
  RiSearchLine,
  RiGroupLine,
  RiTimeLine,
  RiRestartLine,
  RiSpeedLine,
  RiWallet3Line,
} from "@remixicon/react";
import type { TaggingJob, TaggingJobScope } from "@novelova/shared-types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollFade } from "@/components/ui/scroll-fade";
import { CharacterAvatar } from "@/components/ui/character-avatar";

interface TaggingHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobs: TaggingJob[];
  currentJob?: TaggingJob | null;
  onRetag?: () => void;
}

export function TaggingHistoryDialog({
  open,
  onOpenChange,
  jobs,
  currentJob,
  onRetag,
}: TaggingHistoryDialogProps) {
  // Combine all jobs, prioritizing current live job if active
  const allJobs = useMemo(() => {
    const list = [...jobs];
    if (currentJob && !list.some((j) => j.id === currentJob.id)) {
      list.unshift(currentJob);
    }
    // Sort newest to oldest
    return list.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }, [jobs, currentJob]);

  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "economics" | "json">(
    "overview",
  );
  const [copiedJson, setCopiedJson] = useState(false);
  const [characterSearch, setCharacterSearch] = useState("");
  const [genderFilter, setGenderFilter] = useState<
    "all" | "male" | "female" | "neutral"
  >("all");

  // Default selection to first job or currentJob
  const activeJob = useMemo(() => {
    if (!allJobs.length) return null;
    if (selectedJobId) {
      const found = allJobs.find((j) => j.id === selectedJobId);
      if (found) return found;
    }
    return allJobs[0];
  }, [allJobs, selectedJobId]);

  // Aggregate project lifetime metrics
  const lifetimeMetrics = useMemo(() => {
    let totalCost = 0;
    let totalTokens = 0;
    let completedRuns = 0;

    for (const j of allJobs) {
      if (j.status === "completed") completedRuns++;
      if (j.llm_report) {
        totalCost += j.llm_report.cost?.estimated_cost_usd || 0;
        totalTokens += j.llm_report.tokens?.total_tokens || 0;
      }
    }

    return {
      totalRuns: allJobs.length,
      completedRuns,
      totalCost,
      totalTokens,
    };
  }, [allJobs]);

  const handleDownloadReport = (jobToDownload: TaggingJob) => {
    if (!jobToDownload.llm_report) return;
    const blob = new Blob(
      [JSON.stringify(jobToDownload.llm_report, null, 2)],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `novelova_tagging_run_${jobToDownload.id.slice(0, 8)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopyRawJson = () => {
    if (!activeJob?.llm_report) return;
    navigator.clipboard.writeText(JSON.stringify(activeJob.llm_report, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  // Helper to format date cleanly
  const formatRunDate = (dateStr?: string | null) => {
    if (!dateStr) return "Unknown";
    const d = new Date(dateStr);
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  // Helper to format duration
  const formatDuration = (seconds?: number | null) => {
    if (!seconds) return "0s";
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  // Scope label generator
  const getScopeMeta = (scope?: TaggingJobScope | null, totalChapters?: number) => {
    const type = scope?.type || (totalChapters === 1 ? "single" : "full");
    const label = scope?.label || (totalChapters === 1 ? "Single Chapter" : "Full Novel");

    if (type === "single") {
      return {
        label,
        icon: RiBookOpenLine,
        pillClass:
          "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-200/80 dark:border-blue-900/60",
      };
    }
    if (type === "range") {
      return {
        label,
        icon: RiFileList3Line,
        pillClass:
          "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-200/80 dark:border-purple-900/60",
      };
    }
    return {
      label,
      icon: RiGlobalLine,
      pillClass:
        "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200/80 dark:border-emerald-900/60",
    };
  };

  const report = activeJob?.llm_report;

  // Process and sort detected characters
  const sortedCharacters = useMemo(() => {
    if (!report?.breakdown?.characters_synced) return [];
    const list = [...report.breakdown.characters_synced];
    // Sort descending by line count
    list.sort((a, b) => (b.lines || 0) - (a.lines || 0));

    return list.filter((char) => {
      const matchesSearch =
        !characterSearch.trim() ||
        char.name.toLowerCase().includes(characterSearch.toLowerCase().trim());
      const matchesGender =
        genderFilter === "all" ||
        char.gender.toLowerCase() === genderFilter.toLowerCase();
      return matchesSearch && matchesGender;
    });
  }, [report, characterSearch, genderFilter]);

  const totalDialogueInReport = report?.breakdown?.dialogue_segments || 1;


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[94vw] max-w-5xl h-[84vh] max-h-[820px] p-0 flex flex-col gap-0 overflow-hidden bg-white dark:bg-[#0c0c0c] border border-neutral-200/90 dark:border-neutral-800 shadow-2xl rounded-2xl">
        {/* Sleek, Polished Header */}
        <DialogHeader className="px-6 py-4 border-b border-neutral-200/80 dark:border-neutral-800/80 shrink-0 bg-neutral-50/50 dark:bg-neutral-900/40">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pr-10">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-neutral-100 dark:bg-neutral-800 border border-neutral-200/80 dark:border-neutral-700 text-neutral-800 dark:text-neutral-200 flex items-center justify-center shrink-0 shadow-2xs">
                <RiHistoryLine className="h-4 w-4" />
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <DialogTitle className="text-base font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
                    Tagging History & Metrics
                  </DialogTitle>
                  <span className="px-2 py-0.5 rounded-full bg-neutral-200/60 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 text-[11px] font-mono font-medium">
                    {allJobs.length} {allJobs.length === 1 ? "run" : "runs"}
                  </span>
                </div>
                <DialogDescription className="text-xs text-neutral-500 dark:text-neutral-400">
                  Review dialogue attribution runs, character detection, and token economics.
                </DialogDescription>
              </div>
            </div>

            {/* Lifetime Project Metrics Chip */}
            {allJobs.length > 0 && (
              <div className="hidden md:flex items-center gap-2.5 px-3 py-1 rounded-xl bg-neutral-100/70 dark:bg-neutral-900 border border-neutral-200/70 dark:border-neutral-800 text-xs font-mono">
                <div className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-400">
                  <RiCoinsLine className="h-3.5 w-3.5 text-amber-500" />
                  <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                    ${lifetimeMetrics.totalCost.toFixed(4)}
                  </span>
                </div>
                <span className="text-neutral-300 dark:text-neutral-700">·</span>
                <div className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-400">
                  <RiCpuLine className="h-3.5 w-3.5 text-blue-500" />
                  <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                    {(lifetimeMetrics.totalTokens / 1000).toFixed(1)}k
                  </span>
                  <span>tok</span>
                </div>
              </div>
            )}
          </div>
        </DialogHeader>

        {/* Master-Detail Body */}
        {allJobs.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 flex items-center justify-center text-neutral-400">
              <RiHistoryLine className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                No Tagging Runs Recorded Yet
              </h4>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 max-w-sm">
                Tagging jobs will appear here once initiated. You can tag the full novel or select specific chapters.
              </p>
            </div>
            {onRetag && (
              <button
                type="button"
                onClick={() => {
                  onOpenChange(false);
                  onRetag();
                }}
                className="mt-2 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-neutral-200 text-white dark:text-neutral-900 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
              >
                <RiRestartLine className="h-3.5 w-3.5" />
                <span>Launch Tagging Job</span>
              </button>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
            {/* Left Column: Master Timeline List */}
            <div className="w-full md:w-76 lg:w-80 border-r border-neutral-200/80 dark:border-neutral-800/80 flex flex-col shrink-0 bg-neutral-50/40 dark:bg-[#0a0a0a]">
              <div className="p-3 px-4 border-b border-neutral-200/60 dark:border-neutral-800/60 flex items-center justify-between text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                <span>Runs History ({allJobs.length})</span>
                <span>Newest first</span>
              </div>

              <ScrollFade className="flex-1 overflow-y-auto p-2 space-y-1.5">
                {allJobs.map((job, idx) => {
                  const isSelected = activeJob?.id === job.id;
                  const runIndex = allJobs.length - idx;
                  const jobReport = job.llm_report;
                  const scopeMeta = getScopeMeta(
                    job.target_scope,
                    job.total_chapters,
                  );
                  const ScopeIcon = scopeMeta.icon;

                  const isCompleted = job.status === "completed";
                  const isRunning =
                    job.status === "running" || job.status === "pending";
                  const isFailed = job.status === "failed";

                  return (
                    <button
                      key={job.id}
                      type="button"
                      onClick={() => setSelectedJobId(job.id)}
                      className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer relative ${
                        isSelected
                          ? "bg-white dark:bg-neutral-900 border-neutral-300 dark:border-neutral-700 shadow-xs"
                          : "bg-transparent border-transparent hover:bg-white/70 dark:hover:bg-neutral-900/50 hover:border-neutral-200 dark:hover:border-neutral-800/80"
                      }`}
                    >
                      {/* Active indicator bar */}
                      {isSelected && (
                        <div className="absolute left-0 top-3 bottom-3 w-1 bg-neutral-900 dark:bg-neutral-100 rounded-r-full" />
                      )}

                      <div className="pl-1.5 space-y-1.5">
                        {/* Top: Scope & Status Dot */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                              {scopeMeta.label}
                            </span>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                isCompleted
                                  ? "bg-emerald-500"
                                  : isRunning
                                    ? "bg-blue-500 animate-pulse"
                                    : isFailed
                                      ? "bg-red-500"
                                      : "bg-amber-500"
                              }`}
                            />
                            <span className="text-[10px] capitalize text-neutral-600 dark:text-neutral-400 font-medium">
                              {job.status}
                            </span>
                          </div>
                        </div>

                        {/* Middle: Segments & Chapters info */}
                        <div className="text-[11px] text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5">
                          <ScopeIcon className="h-3 w-3 text-neutral-400 shrink-0" />
                          <span>
                            {job.processed_segments.toLocaleString()} segments
                          </span>
                          {jobReport?.breakdown?.dialogue_segments ? (
                            <>
                              <span>·</span>
                              <span className="text-neutral-700 dark:text-neutral-300 font-medium">
                                {jobReport.breakdown.dialogue_segments} dialogue
                              </span>
                            </>
                          ) : null}
                        </div>

                        {/* Bottom: Date, Run #, Cost */}
                        <div className="flex items-center justify-between text-[10px] text-neutral-400 dark:text-neutral-500 pt-1 border-t border-neutral-100 dark:border-neutral-800/40 font-mono">
                          <span>
                            {formatRunDate(job.started_at || job.created_at)}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <span className="font-sans font-medium text-neutral-600 dark:text-neutral-400">
                              Run #{runIndex}
                            </span>
                            {jobReport?.cost && (
                              <>
                                <span>·</span>
                                <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                                  ${jobReport.cost.estimated_cost_usd.toFixed(4)}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </ScrollFade>
            </div>

            {/* Right Column: Selected Run Inspector */}
            {activeJob ? (
              <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-[#0c0c0c] overflow-hidden">
                {/* Run Inspector Header */}
                <div className="px-6 py-3.5 border-b border-neutral-200/80 dark:border-neutral-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0 bg-neutral-50/30 dark:bg-neutral-900/20">
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                        {activeJob.target_scope?.label || "Tagging Run Details"}
                      </h3>
                      <span className="px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 border border-neutral-200/70 dark:border-neutral-700/60 text-neutral-700 dark:text-neutral-300 text-[10px] font-mono">
                        {report?.model || "deepseek-chat"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400 flex-wrap">
                      <span>
                        Started {formatRunDate(activeJob.started_at || activeJob.created_at)}
                      </span>
                      {report?.duration_seconds ? (
                        <>
                          <span>·</span>
                          <span className="flex items-center gap-1 font-mono">
                            <RiTimeLine className="h-3 w-3 text-neutral-400" />
                            {formatDuration(report.duration_seconds)} duration
                          </span>
                        </>
                      ) : null}
                    </div>
                  </div>

                  {/* Top Inspector Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {report && (
                      <>
                        <button
                          type="button"
                          onClick={handleCopyRawJson}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-900 text-neutral-700 dark:text-neutral-300 text-xs font-medium transition-colors cursor-pointer"
                          title="Copy JSON report"
                        >
                          {copiedJson ? (
                            <>
                              <RiCheckDoubleLine className="h-3.5 w-3.5 text-emerald-500" />
                              <span className="text-emerald-600 dark:text-emerald-400">
                                Copied!
                              </span>
                            </>
                          ) : (
                            <>
                              <RiFileCopyLine className="h-3.5 w-3.5 text-neutral-400" />
                              <span>Copy JSON</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDownloadReport(activeJob)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-800 dark:text-neutral-200 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                          title="Download JSON Report"
                        >
                          <RiDownloadLine className="h-3.5 w-3.5 text-neutral-500" />
                          <span>Download Report</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Subheader: Modern Segmented Tab Navigation */}
                <div className="px-6 border-b border-neutral-200/80 dark:border-neutral-800/80 bg-white dark:bg-[#0c0c0c] flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-6">
                    <button
                      type="button"
                      onClick={() => setActiveTab("overview")}
                      className={`py-3 text-xs font-semibold transition-colors border-b-2 -mb-[1px] cursor-pointer flex items-center gap-1.5 ${
                        activeTab === "overview"
                          ? "border-neutral-900 dark:border-neutral-100 text-neutral-900 dark:text-neutral-100"
                          : "border-transparent text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
                      }`}
                    >
                      <RiGroupLine className="h-3.5 w-3.5" />
                      <span>Overview & Cast</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTab("economics")}
                      className={`py-3 text-xs font-semibold transition-colors border-b-2 -mb-[1px] cursor-pointer flex items-center gap-1.5 ${
                        activeTab === "economics"
                          ? "border-neutral-900 dark:border-neutral-100 text-neutral-900 dark:text-neutral-100"
                          : "border-transparent text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
                      }`}
                    >
                      <RiCoinsLine className="h-3.5 w-3.5" />
                      <span>Token & Cost Economics</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTab("json")}
                      className={`py-3 text-xs font-semibold transition-colors border-b-2 -mb-[1px] cursor-pointer flex items-center gap-1.5 ${
                        activeTab === "json"
                          ? "border-neutral-900 dark:border-neutral-100 text-neutral-900 dark:text-neutral-100"
                          : "border-transparent text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
                      }`}
                    >
                      <RiCodeSSlashLine className="h-3.5 w-3.5" />
                      <span>Raw Trace (JSON)</span>
                    </button>
                  </div>
                </div>

                {/* Tab Content Body */}
                <ScrollFade className="flex-1 overflow-y-auto p-6 space-y-6">
                  {/* Failure / Cancellation alerts */}
                  {activeJob.status === "failed" && (
                    <div className="p-4 rounded-xl border border-red-200 dark:border-red-950/80 bg-red-50/70 dark:bg-red-950/30 text-xs text-red-900 dark:text-red-200 space-y-1">
                      <div className="flex items-center gap-2 font-semibold">
                        <RiAlertLine className="h-4 w-4 text-red-600 shrink-0" />
                        <span>
                          Execution Failed: {activeJob.error_type || "Unknown Error"}
                        </span>
                      </div>
                      <p className="text-red-700 dark:text-red-300 text-[11px]">
                        {activeJob.error_message || activeJob.current_step}
                      </p>
                    </div>
                  )}

                  {activeJob.status === "cancelled" && (
                    <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-950/80 bg-amber-50/70 dark:bg-amber-950/30 text-xs text-amber-900 dark:text-amber-200 space-y-1">
                      <div className="flex items-center gap-2 font-semibold">
                        <RiStopLine className="h-4 w-4 text-amber-600 shrink-0" />
                        <span>Execution Cancelled by User</span>
                      </div>
                      <p className="text-amber-700 dark:text-amber-300 text-[11px]">
                        {activeJob.current_step ||
                          `Stopped after ${activeJob.processed_segments} segments.`}
                      </p>
                    </div>
                  )}

                  {/* TAB 1: OVERVIEW & CAST */}
                  {activeTab === "overview" && (
                    <div className="space-y-6">
                      {/* 4 Clean Primary KPI Cards */}
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
                        {/* 1. Dialogue Attributed */}
                        <div className="p-4 rounded-xl border border-neutral-200/80 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/40 space-y-1">
                          <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400 block">
                            Attributed Dialogue
                          </span>
                          <div className="text-lg font-bold font-mono text-neutral-900 dark:text-neutral-100">
                            {report?.breakdown?.dialogue_segments?.toLocaleString() ||
                              activeJob.processed_segments.toLocaleString()}
                          </div>
                          <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
                            {report?.breakdown?.total_segments
                              ? `${Math.round(
                                  (report.breakdown.dialogue_segments /
                                    report.breakdown.total_segments) *
                                    100,
                                )}% of segments`
                              : `${activeJob.total_chapters} chapters`}
                          </div>
                        </div>

                        {/* 2. Narrative Bypassed */}
                        <div className="p-4 rounded-xl border border-neutral-200/80 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/40 space-y-1">
                          <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400 block">
                            Narrative Bypassed
                          </span>
                          <div className="text-lg font-bold font-mono text-neutral-900 dark:text-neutral-100">
                            {report?.breakdown?.narration_segments?.toLocaleString() ||
                              0}
                          </div>
                          <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
                            Offline heuristic bypass
                          </div>
                        </div>

                        {/* 3. Cache Hit Efficiency */}
                        <div className="p-4 rounded-xl border border-neutral-200/80 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/40 space-y-1">
                          <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400 block">
                            Prompt Cache Hit
                          </span>
                          <div className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400">
                            {report?.tokens?.prompt_tokens
                              ? `${Math.round(
                                  ((report.tokens.cache_hit_tokens || 0) /
                                    report.tokens.prompt_tokens) *
                                    100,
                                )}% hit`
                              : "0%"}
                          </div>
                          <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
                            {report?.tokens?.cache_hit_tokens?.toLocaleString() || 0}{" "}
                            tokens cached
                          </div>
                        </div>

                        {/* 4. Total Run Cost */}
                        <div className="p-4 rounded-xl border border-neutral-200/80 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/40 space-y-1">
                          <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400 block">
                            Total Run Cost
                          </span>
                          <div className="text-lg font-bold font-mono text-neutral-900 dark:text-neutral-100">
                            ${report?.cost?.estimated_cost_usd?.toFixed(4) || "0.0000"}{" "}
                            USD
                          </div>
                          <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
                            {report?.total_api_calls || 0} API calls
                          </div>
                        </div>
                      </div>

                      {/* Detected Cast & Character Attribution Table/Grid */}
                      <div className="rounded-xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900/30 overflow-hidden">
                        {/* Cast Section Header & Filters */}
                        <div className="p-4 border-b border-neutral-200/70 dark:border-neutral-800/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-neutral-50/40 dark:bg-neutral-900/40">
                          <div>
                            <h4 className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
                              <RiGroupLine className="h-4 w-4 text-neutral-500" />
                              <span>Detected Cast & Dialogue Attribution</span>
                              <span className="ml-1 px-1.5 py-0.2 rounded-full bg-neutral-200/60 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 text-[10px] font-mono">
                                {sortedCharacters.length}
                              </span>
                            </h4>
                            <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                              Characters discovered, resolved, and synchronized from dialogue tags.
                            </p>
                          </div>

                          {/* Filter & Search Bar */}
                          <div className="flex items-center gap-2 flex-wrap">
                            {/* Gender filter toggles */}
                            <div className="inline-flex rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-0.5 text-[11px] font-medium">
                              {(["all", "male", "female", "neutral"] as const).map(
                                (g) => (
                                  <button
                                    key={g}
                                    type="button"
                                    onClick={() => setGenderFilter(g)}
                                    className={`px-2 py-0.5 rounded capitalize transition-colors cursor-pointer ${
                                      genderFilter === g
                                        ? "bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900"
                                        : "text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
                                    }`}
                                  >
                                    {g}
                                  </button>
                                ),
                              )}
                            </div>

                            {/* Character search box */}
                            <div className="relative">
                              <RiSearchLine className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400" />
                              <input
                                type="text"
                                value={characterSearch}
                                onChange={(e) => setCharacterSearch(e.target.value)}
                                placeholder="Search cast..."
                                className="pl-8 pr-3 py-1 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-neutral-100 w-36 sm:w-44"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Character Cards Grid */}
                        <div className="p-4">
                          {sortedCharacters.length === 0 ? (
                            <div className="py-8 text-center text-xs text-neutral-500 dark:text-neutral-400">
                              No characters match your search or filter.
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {sortedCharacters.map((char) => {
                                const sharePct = Math.round(
                                  ((char.lines || 0) / totalDialogueInReport) * 100,
                                );
                                const isMale = char.gender.toLowerCase() === "male";
                                const isFemale =
                                  char.gender.toLowerCase() === "female";

                                return (
                                  <div
                                    key={char.name}
                                    className="p-3 rounded-xl border border-neutral-200/70 dark:border-neutral-800/80 bg-neutral-50/30 dark:bg-neutral-900/30 flex items-center justify-between gap-3 hover:bg-neutral-50/80 dark:hover:bg-neutral-900/60 transition-colors"
                                  >
                                    {/* Left: Avatar + Name + Gender badge */}
                                    <div className="flex items-center gap-2.5 min-w-0">
                                      <CharacterAvatar
                                        name={char.name}
                                        gender={char.gender}
                                        className="w-8 h-8 rounded-full shrink-0 shadow-2xs"
                                      />

                                      <div className="min-w-0">
                                        <div className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                                          {char.name}
                                        </div>
                                        <span
                                          className={`text-[9px] px-1.5 py-0.2 rounded font-medium capitalize inline-block ${
                                            isFemale
                                              ? "bg-pink-100 dark:bg-pink-950/60 text-pink-700 dark:text-pink-300"
                                              : isMale
                                                ? "bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300"
                                                : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400"
                                          }`}
                                        >
                                          {char.gender}
                                        </span>
                                      </div>
                                    </div>

                                    {/* Right: Lines spoken & share bar */}
                                    <div className="text-right shrink-0 space-y-1">
                                      <div className="font-mono text-xs font-bold text-neutral-900 dark:text-neutral-100">
                                        {char.lines}{" "}
                                        <span className="text-[10px] font-sans font-normal text-neutral-500">
                                          {char.lines === 1 ? "line" : "lines"}
                                        </span>
                                      </div>

                                      <div className="flex items-center gap-1.5 justify-end">
                                        <div className="w-16 h-1.5 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden">
                                          <div
                                            className="h-full bg-neutral-900 dark:bg-neutral-100 rounded-full"
                                            style={{
                                              width: `${Math.min(100, Math.max(4, sharePct))}%`,
                                            }}
                                          />
                                        </div>
                                        <span className="text-[10px] font-mono text-neutral-400">
                                          {sharePct}%
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB 2: TOKEN & COST ECONOMICS */}
                  {activeTab === "economics" && report && (
                    <div className="space-y-6">
                      {/* DeepSeek Prompt Cache Visualizer */}
                      <div className="p-5 rounded-xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900/40 space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
                              <RiCpuLine className="h-4 w-4 text-emerald-500" />
                              <span>DeepSeek Prompt Cache Distribution</span>
                            </h4>
                            <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                              Novelova places stable character bibles first in the prompt to maximize KV cache reuse.
                            </p>
                          </div>
                          <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                            {report.tokens?.prompt_tokens
                              ? `${Math.round(
                                  ((report.tokens.cache_hit_tokens || 0) /
                                    report.tokens.prompt_tokens) *
                                    100,
                                )}% cached`
                              : "0%"}
                          </span>
                        </div>

                        {/* Tri-color Segment Bar */}
                        <div className="h-3 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden flex">
                          <div
                            title={`Cached Input: ${report.tokens?.cache_hit_tokens || 0}`}
                            className="bg-emerald-500 h-full transition-all"
                            style={{
                              width: `${
                                report.tokens?.total_tokens
                                  ? ((report.tokens.cache_hit_tokens || 0) /
                                      report.tokens.total_tokens) *
                                    100
                                  : 0
                              }%`,
                            }}
                          />
                          <div
                            title={`Uncached Input: ${report.tokens?.cache_miss_tokens || 0}`}
                            className="bg-blue-500 h-full transition-all"
                            style={{
                              width: `${
                                report.tokens?.total_tokens
                                  ? ((report.tokens.cache_miss_tokens || 0) /
                                      report.tokens.total_tokens) *
                                    100
                                  : 0
                              }%`,
                            }}
                          />
                          <div
                            title={`Completion Output: ${report.tokens?.completion_tokens || 0}`}
                            className="bg-purple-500 h-full transition-all"
                            style={{
                              width: `${
                                report.tokens?.total_tokens
                                  ? ((report.tokens.completion_tokens || 0) /
                                      report.tokens.total_tokens) *
                                    100
                                  : 0
                              }%`,
                            }}
                          />
                        </div>

                        {/* Tri-color legend */}
                        <div className="grid grid-cols-3 gap-3 text-xs pt-1">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-400 text-[11px]">
                              <span className="w-2 h-2 rounded-full bg-emerald-500" />
                              <span>Cache Hit ($0.07/1M)</span>
                            </div>
                            <div className="font-mono font-bold text-neutral-900 dark:text-neutral-100">
                              {report.tokens?.cache_hit_tokens?.toLocaleString() || 0}
                            </div>
                          </div>

                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-400 text-[11px]">
                              <span className="w-2 h-2 rounded-full bg-blue-500" />
                              <span>Cache Miss ($0.27/1M)</span>
                            </div>
                            <div className="font-mono font-bold text-neutral-900 dark:text-neutral-100">
                              {report.tokens?.cache_miss_tokens?.toLocaleString() || 0}
                            </div>
                          </div>

                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-400 text-[11px]">
                              <span className="w-2 h-2 rounded-full bg-purple-500" />
                              <span>Completion ($1.10/1M)</span>
                            </div>
                            <div className="font-mono font-bold text-neutral-900 dark:text-neutral-100">
                              {report.tokens?.completion_tokens?.toLocaleString() || 0}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Pricing Model & Account Specs Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        <div className="p-4 rounded-xl border border-neutral-200/80 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/40 space-y-2">
                          <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
                            <RiSpeedLine className="h-4 w-4 text-neutral-500" />
                            <span>Execution Latency & Throughput</span>
                          </span>
                          <div className="space-y-1 text-xs text-neutral-600 dark:text-neutral-400">
                            <div className="flex justify-between">
                              <span>Total Duration:</span>
                              <span className="font-mono text-neutral-900 dark:text-neutral-100 font-semibold">
                                {report.duration_seconds}s
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span>Throughput:</span>
                              <span className="font-mono text-neutral-900 dark:text-neutral-100 font-semibold">
                                {report.duration_seconds
                                  ? `${(
                                      (report.breakdown?.total_segments || 0) /
                                      report.duration_seconds
                                    ).toFixed(1)} seg/s`
                                  : "N/A"}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span>Average Latency:</span>
                              <span className="font-mono text-neutral-900 dark:text-neutral-100 font-semibold">
                                {report.total_api_calls && report.duration_seconds
                                  ? `${(
                                      report.duration_seconds /
                                      report.total_api_calls
                                    ).toFixed(2)}s / call`
                                  : "N/A"}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="p-4 rounded-xl border border-neutral-200/80 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/40 space-y-2">
                          <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
                            <RiWallet3Line className="h-4 w-4 text-neutral-500" />
                            <span>DeepSeek Account Standing</span>
                          </span>
                          <div className="space-y-1 text-xs text-neutral-600 dark:text-neutral-400">
                            <div className="flex justify-between">
                              <span>Remaining Balance:</span>
                              <span className="font-mono text-neutral-900 dark:text-neutral-100 font-semibold">
                                {report.account?.balance_remaining
                                  ? `$${report.account.balance_remaining} ${report.account.currency}`
                                  : "Active"}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span>Active Model:</span>
                              <span className="font-mono text-neutral-900 dark:text-neutral-100 font-semibold">
                                {report.model}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span>Total API Invocations:</span>
                              <span className="font-mono text-neutral-900 dark:text-neutral-100 font-semibold">
                                {report.total_api_calls} calls
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB 3: RAW JSON TRACE */}
                  {activeTab === "json" && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
                        <span>Structured LLM Execution Report (JSON)</span>
                        <button
                          type="button"
                          onClick={handleCopyRawJson}
                          className="inline-flex items-center gap-1 text-xs text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-100 cursor-pointer font-medium"
                        >
                          {copiedJson ? (
                            <>
                              <RiCheckDoubleLine className="h-3.5 w-3.5 text-emerald-500" />
                              <span className="text-emerald-600 dark:text-emerald-400">
                                Copied!
                              </span>
                            </>
                          ) : (
                            <>
                              <RiFileCopyLine className="h-3.5 w-3.5" />
                              <span>Copy JSON</span>
                            </>
                          )}
                        </button>
                      </div>

                      <pre className="p-4 rounded-xl bg-neutral-950 text-neutral-100 font-mono text-[11px] leading-relaxed overflow-x-auto max-h-[520px] border border-neutral-800 shadow-inner">
                        {JSON.stringify(report, null, 2)}
                      </pre>
                    </div>
                  )}
                </ScrollFade>
              </div>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
