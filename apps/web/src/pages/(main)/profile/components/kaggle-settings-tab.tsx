import { useState, useEffect } from "react";
import {
  RiAddLine,
  RiCheckLine,
  RiLoader4Line,
  RiExternalLinkLine,
  RiFileCopyLine,
  RiDeleteBinLine,
  RiEditLine,
  RiArrowUpLine,
  RiArrowDownLine,
  RiQuestionLine,
  RiCpuLine,
  RiPulseLine,
  RiAlertLine,
  RiCheckboxCircleLine,
  RiVolumeUpLine,
  RiSparklingLine,
} from "@remixicon/react";
import type { KaggleAccount, KagglePoolSummary } from "@novelova/shared-types";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { useAuth } from "@/context/auth-context";
import { cn } from "@/lib/utils";
import {
  getKaggleAccounts,
  getKagglePoolSummary,
  updateKaggleAccount,
  deleteKaggleAccount,
  testKaggleAccount,
} from "@/services/kaggle";
import { AddKaggleAccountDialog } from "./add-kaggle-account-dialog";

export function KaggleSettingsTab() {
  const [accounts, setAccounts] = useState<KaggleAccount[]>([]);
  const [summary, setSummary] = useState<KagglePoolSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // User Auth & Preferred TTS Model state
  const { user, updateUser } = useAuth();
  const [ttsModel, setTtsModel] = useState<string>(user?.preferred_tts_model || "kokoro-82m");
  const [isUpdatingModel, setIsUpdatingModel] = useState(false);
  const [modelSaved, setModelSaved] = useState(false);

  useEffect(() => {
    if (user?.preferred_tts_model) {
      setTtsModel(user.preferred_tts_model);
    }
  }, [user?.preferred_tts_model]);

  const handleModelChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setTtsModel(val);
    try {
      setIsUpdatingModel(true);
      await updateUser({ preferred_tts_model: val });
      setModelSaved(true);
      setTimeout(() => setModelSaved(false), 2500);
    } catch (err) {
      console.error("Failed to update preferred TTS model:", err);
    } finally {
      setIsUpdatingModel(false);
    }
  };

  // Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<KaggleAccount | null>(null);

  // Testing status map: accountId -> { testing: bool, result?: string, error?: string }
  const [testingMap, setTestingMap] = useState<
    Record<string, { isTesting: boolean; result?: string; error?: string }>
  >({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [accs, sum] = await Promise.all([
        getKaggleAccounts(),
        getKagglePoolSummary(),
      ]);
      setAccounts(accs);
      setSummary(sum);
    } catch (err) {
      console.error("Failed to load Kaggle settings:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleToggleActive = async (account: KaggleAccount) => {
    try {
      await updateKaggleAccount(account.id, { is_active: !account.is_active });
      loadData();
    } catch (err) {
      console.error("Failed to toggle account:", err);
    }
  };

  const handlePriorityShift = async (account: KaggleAccount, direction: "up" | "down") => {
    const currentIndex = accounts.findIndex((a) => a.id === account.id);
    if (currentIndex === -1) return;

    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= accounts.length) return;

    const targetAccount = accounts[targetIndex];
    // Swap priorities
    const currentPriority = account.priority;
    const targetPriority = targetAccount.priority;

    try {
      await Promise.all([
        updateKaggleAccount(account.id, { priority: targetPriority }),
        updateKaggleAccount(targetAccount.id, { priority: currentPriority }),
      ]);
      loadData();
    } catch (err) {
      console.error("Failed to reorder priority:", err);
    }
  };

  const handleTestAccount = async (account: KaggleAccount) => {
    setTestingMap((prev) => ({
      ...prev,
      [account.id]: { isTesting: true },
    }));

    try {
      const res = await testKaggleAccount(account.id);
      setTestingMap((prev) => ({
        ...prev,
        [account.id]: { isTesting: false, result: res.message },
      }));
      // Refresh to update status if it changed
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Connection failed.";
      setTestingMap((prev) => ({
        ...prev,
        [account.id]: { isTesting: false, error: msg },
      }));
    }
  };

  const handleDelete = async (accountId: string) => {
    if (confirm("Are you sure you want to remove this Kaggle account from your pool?")) {
      try {
        await deleteKaggleAccount(accountId);
        loadData();
      } catch (err) {
        console.error("Failed to delete account:", err);
      }
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (isLoading) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground shimmer-text">
        Loading Kaggle GPU pool settings...
      </div>
    );
  }

  return (
    <div className="w-full space-y-8">
      {/* Top Header */}
      <div className="pb-3 border-b border-border flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Kaggle GPU Compute Pool
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage your free Kaggle accounts for distributed Stage C audio synthesis.
          </p>
        </div>

        <Button
          type="button"
          size="sm"
          onClick={() => {
            setEditingAccount(null);
            setIsDialogOpen(true);
          }}
          className="h-9 px-4 bg-black text-white hover:bg-black/90 dark:bg-white dark:text-black dark:hover:bg-white/90 transition-all font-medium text-xs gap-1.5"
        >
          <RiAddLine className="h-4 w-4" />
          Add Kaggle Account
        </Button>
      </div>

      {/* Pool Capacity Metrics Overview */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Card 1: Total Compute */}
          <div className="p-4 rounded-xl border border-border bg-card/60 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
              <span>Pooled GPU Capacity</span>
              <RiCpuLine className="h-4 w-4 text-primary" />
            </div>
            <div className="text-2xl font-bold text-foreground">
              ~{summary.total_gpu_hours_available.toFixed(0)} <span className="text-xs font-normal text-muted-foreground">hrs / week</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {summary.active_accounts} of {summary.total_accounts} accounts active in pool
            </p>
          </div>

          {/* Card 2: Active Accounts */}
          <div className="p-4 rounded-xl border border-border bg-card/60 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
              <span>Pool Health</span>
              <RiPulseLine className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="text-2xl font-bold text-foreground flex items-center gap-2">
              <span>{summary.available_accounts}</span>
              <span className="text-xs font-medium text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                Ready
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {summary.in_use_accounts} running · {summary.exhausted_accounts} exhausted
            </p>
          </div>

          {/* Card 3: Execution Strategy */}
          <div className="p-4 rounded-xl border border-border bg-card/60 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
              <span>Worker Strategy</span>
              <RiCheckLine className="h-4 w-4 text-primary" />
            </div>
            <div className="text-sm font-semibold text-foreground pt-1">
              Session Worker (3–5 hrs)
            </div>
            <p className="text-[11px] text-muted-foreground">
              Hot VRAM model reuse with per-chapter atomic R2 checkpoints
            </p>
          </div>
        </div>
      )}

      {/* Stage C Neural Speech Engine Selector */}
      <div className="p-5 rounded-xl border border-border bg-card/60 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/20 text-primary">
              <RiVolumeUpLine className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground">
                  Stage C Neural TTS Engine
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary border border-primary/20">
                  GPU Warm Session
                </span>
                {modelSaved && (
                  <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-500 animate-in fade-in duration-200">
                    <RiCheckboxCircleLine className="h-3.5 w-3.5" />
                    Saved
                  </span>
                )}
                {isUpdatingModel && (
                  <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                    <RiLoader4Line className="h-3.5 w-3.5 animate-spin" />
                    Updating...
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Target model deployed to your hot Kaggle GPU session worker. Models stay resident in GPU VRAM across chapters.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <NativeSelect
              value={ttsModel}
              onChange={handleModelChange}
              disabled={isUpdatingModel}
              className="w-full sm:w-[260px]"
            >
              <NativeSelectOption value="kokoro-82m">
                Kokoro-82M (Default · 24kHz · RTF ~0.03)
              </NativeSelectOption>
              <NativeSelectOption value="chatterbox-turbo">
                Chatterbox-Turbo (Conversational Flow)
              </NativeSelectOption>
              <NativeSelectOption value="system-native">
                System-Native TTS (Offline Fallback)
              </NativeSelectOption>
            </NativeSelect>
          </div>
        </div>

        {/* Model Spec Callout Banner */}
        <div className="p-3.5 rounded-lg bg-muted/40 border border-border/60 text-xs space-y-2">
          {ttsModel === "kokoro-82m" && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-foreground flex items-center gap-1">
                  <RiSparklingLine className="h-3.5 w-3.5 text-primary" />
                  Kokoro-82M Neural Model
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-background border border-border text-muted-foreground font-mono">
                  StyleTTS2
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-background border border-border text-muted-foreground font-mono">
                  24,000 Hz
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-mono">
                  RTF ~0.03 (Ultra-Fast)
                </span>
              </div>
              <p className="text-muted-foreground leading-relaxed text-[11px]">
                Ultra-lightweight 82M diffusion-based voice synthesizer. Delivers broadcast studio fidelity with precise phoneme duration and pitch styling. On Kaggle Nvidia T4 GPUs, it synthesizes a 20-minute chapter in ~35 seconds (~150ms per dialogue line).
              </p>
            </>
          )}

          {ttsModel === "chatterbox-turbo" && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-foreground flex items-center gap-1">
                  <RiSparklingLine className="h-3.5 w-3.5 text-primary" />
                  Chatterbox-Turbo Engine
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-background border border-border text-muted-foreground font-mono">
                  Conversational
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 border border-blue-500/20 font-mono">
                  Dynamic Turn-Taking
                </span>
              </div>
              <p className="text-muted-foreground leading-relaxed text-[11px]">
                Optimized for expressive multi-character fiction and dialogue interplay. Maintains consistent emotional prosody across speaker transitions and parent turn dialogue chains.
              </p>
            </>
          )}

          {ttsModel === "system-native" && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-foreground flex items-center gap-1">
                  <RiSparklingLine className="h-3.5 w-3.5 text-primary" />
                  System-Native Acoustic Synthesis
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-background border border-border text-muted-foreground font-mono">
                  Local / Offline
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20 font-mono">
                  0 GPU Quota Consumed
                </span>
              </div>
              <p className="text-muted-foreground leading-relaxed text-[11px]">
                Executes synthesis locally using operating system voice synthesis. Zero Kaggle queue latency and zero GPU compute consumption. Ideal for rapid offline development, tag auditioning, and quick verification.
              </p>
            </>
          )}
        </div>
      </div>

      {/* Accounts Roster Table/Cards */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Configured Accounts ({accounts.length})
          </h3>
          <span className="text-[11px] text-muted-foreground">
            Ordered by priority (top runs first)
          </span>
        </div>

        {accounts.length === 0 ? (
          <div className="p-8 rounded-xl border border-dashed border-border text-center space-y-3 bg-muted/10">
            <RiCpuLine className="h-8 w-8 text-muted-foreground mx-auto" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">
                No Kaggle accounts added yet
              </p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Add one or more Kaggle accounts to unlock zero-cost Stage C audio synthesis with automatic quota rotation.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setEditingAccount(null);
                setIsDialogOpen(true);
              }}
              className="h-8 px-3 text-xs bg-primary text-primary-foreground font-medium"
            >
              Add First Account
            </Button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {accounts.map((acc, index) => {
              const testState = testingMap[acc.id];
              return (
                <div
                  key={acc.id}
                  className={cn(
                    "p-4 rounded-xl border transition-all duration-150 bg-card/60 space-y-3",
                    acc.is_active ? "border-border" : "border-border/40 opacity-70"
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    {/* Left: Priority & User handle */}
                    <div className="flex items-center gap-3">
                      {/* Priority Tag */}
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-muted text-foreground border border-border">
                        #{acc.priority}
                        {index === 0 && <span className="text-[9px] text-primary uppercase ml-1">Primary</span>}
                      </span>

                      {/* Username */}
                      <a
                        href={`https://www.kaggle.com/${acc.username}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm font-semibold font-mono text-foreground hover:text-primary transition-colors flex items-center gap-1"
                      >
                        @{acc.username}
                        <RiExternalLinkLine className="h-3 w-3 text-muted-foreground" />
                      </a>

                      {/* Status Badge */}
                      {acc.status === "available" && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                          Available
                        </span>
                      )}
                      {acc.status === "in_use" && (
                        <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-500/10 text-blue-500 border border-blue-500/20 animate-pulse">
                          <RiLoader4Line className="h-3 w-3 animate-spin" />
                          In Use · Active Lane Worker
                        </span>
                      )}
                      {acc.status === "exhausted" && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-500 border border-amber-500/20">
                          Quota Exhausted
                        </span>
                      )}
                      {acc.status === "failed" && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-destructive/10 text-destructive border border-destructive/20">
                          Connection Failed
                        </span>
                      )}
                    </div>

                    {/* Right: Active Switch & Actions */}
                    <div className="flex items-center gap-2">
                      {/* Priority Up/Down */}
                      <div className="flex items-center border border-border rounded-md overflow-hidden">
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() => handlePriorityShift(acc, "up")}
                          className="p-1 hover:bg-muted disabled:opacity-30 transition-colors"
                          title="Increase Priority (Run Earlier)"
                        >
                          <RiArrowUpLine className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={index === accounts.length - 1}
                          onClick={() => handlePriorityShift(acc, "down")}
                          className="p-1 hover:bg-muted disabled:opacity-30 transition-colors border-l border-border"
                          title="Decrease Priority"
                        >
                          <RiArrowDownLine className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {/* Active toggle */}
                      <button
                        type="button"
                        role="switch"
                        aria-checked={acc.is_active}
                        onClick={() => handleToggleActive(acc)}
                        className={cn(
                          "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                          acc.is_active ? "bg-primary" : "bg-muted"
                        )}
                        title={acc.is_active ? "Account Active" : "Account Disabled"}
                      >
                        <span
                          className={cn(
                            "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow-lg ring-0 transition duration-200 ease-in-out",
                            acc.is_active ? "translate-x-4" : "translate-x-0"
                          )}
                        />
                      </button>

                      {/* Test Connection Button */}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleTestAccount(acc)}
                        disabled={testState?.isTesting}
                        className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                      >
                        {testState?.isTesting ? (
                          <RiLoader4Line className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          "Test"
                        )}
                      </Button>

                      {/* Edit Button */}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingAccount(acc);
                          setIsDialogOpen(true);
                        }}
                        className="h-8 px-2 text-muted-foreground hover:text-foreground"
                      >
                        <RiEditLine className="h-3.5 w-3.5" />
                      </Button>

                      {/* Delete Button */}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(acc.id)}
                        className="h-8 px-2 text-muted-foreground hover:text-destructive"
                      >
                        <RiDeleteBinLine className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Account Details Row */}
                  <div className="flex flex-wrap items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/50 gap-2 font-mono">
                    <div className="flex items-center gap-2">
                      <span>Token:</span>
                      <span className="text-foreground/80">{acc.key_masked}</span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(acc.key_masked, acc.id)}
                        className="p-1 hover:text-foreground transition-colors"
                        title="Copy masked token"
                      >
                        {copiedId === acc.id ? (
                          <RiCheckLine className="h-3 w-3 text-emerald-500" />
                        ) : (
                          <RiFileCopyLine className="h-3 w-3" />
                        )}
                      </button>
                    </div>

                    <div className="text-[11px] font-sans">
                      Used: <span className="font-mono text-foreground font-semibold">{acc.total_hours_used.toFixed(1)} hrs</span>
                    </div>
                  </div>

                  {/* Inline Test Result Feedback */}
                  {testState?.result && (
                    <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs flex items-center gap-2">
                      <RiCheckboxCircleLine className="h-4 w-4 shrink-0" />
                      <span>{testState.result}</span>
                    </div>
                  )}

                  {testState?.error && (
                    <div className="p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
                      <RiAlertLine className="h-4 w-4 shrink-0" />
                      <span>{testState.error}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Guide Accordion */}
      <div className="rounded-xl border border-border bg-muted/20 overflow-hidden">
        <button
          type="button"
          onClick={() => setIsGuideOpen((prev) => !prev)}
          className="w-full p-4 flex items-center justify-between text-left hover:bg-muted/40 transition-colors"
        >
          <div className="flex items-center gap-2">
            <RiQuestionLine className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
              How to obtain your Kaggle API key (kaggle.json)
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            {isGuideOpen ? "Hide Guide" : "Show Guide"}
          </span>
        </button>

        {isGuideOpen && (
          <div className="p-4 pt-1 border-t border-border/50 space-y-3 text-xs text-muted-foreground leading-relaxed">
            <ol className="list-decimal pl-5 space-y-2 pt-2">
              <li>
                Sign in to your account at{" "}
                <a
                  href="https://www.kaggle.com/settings"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline font-medium inline-flex items-center gap-0.5"
                >
                  kaggle.com/settings
                  <RiExternalLinkLine className="h-3 w-3 inline" />
                </a>
                .
              </li>
              <li>
                Ensure your account has phone verification completed under the <strong>Phone Verification</strong> section (required for GPU access).
              </li>
              <li>
                Scroll down to the <strong>API</strong> section and click <strong>"Create New Token"</strong>.
              </li>
              <li>
                A file named <code className="text-foreground">kaggle.json</code> will automatically download.
              </li>
              <li>
                Click <strong>"Add Kaggle Account"</strong> above and drag & drop the downloaded file into the dropzone!
              </li>
            </ol>
          </div>
        )}
      </div>

      {/* Add / Edit Dialog */}
      <AddKaggleAccountDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onSuccess={loadData}
        editingAccount={editingAccount}
      />
    </div>
  );
}

export default KaggleSettingsTab;
