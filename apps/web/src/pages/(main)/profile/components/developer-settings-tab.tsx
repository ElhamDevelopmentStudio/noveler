import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  RiKey2Line,
  RiAddLine,
  RiDeleteBinLine,
  RiTerminalBoxLine,
  RiCodeSSlashLine,
  RiShieldCheckLine,
  RiTimeLine,
  RiSpeedLine,
  RiLoader4Line,
  RiFileCopyLine,
  RiCheckLine,
  RiSparklingLine,
} from "@remixicon/react";
import type { ApiToken, HfTokenStatus } from "@novelova/shared-types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  deleteHfToken,
  getApiTokens,
  getHfTokenStatus,
  revokeApiToken,
  updateHfToken,
} from "@/services/api-tokens";
import { GenerateApiTokenDialog } from "./generate-api-token-dialog";

export function DeveloperSettingsTab() {
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [copiedPrefixId, setCopiedPrefixId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Per-user Hugging Face token state (for TangoFlux / gated HF weights)
  const [hfStatus, setHfStatus] = useState<HfTokenStatus>({
    has_token: false,
    token_masked: null,
  });
  const [hfTokenInput, setHfTokenInput] = useState("");
  const [isSavingHf, setIsSavingHf] = useState(false);
  const [isClearingHf, setIsClearingHf] = useState(false);

  const fetchTokens = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [res, hfRes] = await Promise.all([
        getApiTokens(),
        getHfTokenStatus().catch(() => ({ has_token: false, token_masked: null })),
      ]);
      setTokens(res.tokens);
      setHfStatus(hfRes);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to load API tokens.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveHfToken = async () => {
    const trimmed = hfTokenInput.trim();
    if (!trimmed) {
      toast.error("Please enter a Hugging Face token (e.g. hf_...).");
      return;
    }
    try {
      setIsSavingHf(true);
      const updated = await updateHfToken(trimmed);
      setHfStatus(updated);
      setHfTokenInput("");
      toast.success("Hugging Face token saved securely.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save Hugging Face token.");
    } finally {
      setIsSavingHf(false);
    }
  };

  const handleClearHfToken = async () => {
    try {
      setIsClearingHf(true);
      const updated = await deleteHfToken();
      setHfStatus(updated);
      setHfTokenInput("");
      toast.success("Hugging Face token removed.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to remove Hugging Face token.");
    } finally {
      setIsClearingHf(false);
    }
  };

  useEffect(() => {
    fetchTokens();
  }, []);

  const confirm = useConfirm();

  const handleRevoke = async (tokenId: string) => {
    const confirmed = await confirm({
      title: "Revoke API token?",
      description:
        "Any active CLI or agent sessions using this token will immediately stop working.",
      confirmLabel: "Revoke token",
      variant: "destructive",
    });
    if (!confirmed) {
      return;
    }

    try {
      setRevokingId(tokenId);
      await revokeApiToken(tokenId);
      setTokens((prev) => prev.filter((t) => t.id !== tokenId));
      toast.success("API token revoked.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to revoke token.");
    } finally {
      setRevokingId(null);
    }
  };

  const handleCopyPrefix = async (token: ApiToken) => {
    try {
      await navigator.clipboard.writeText(`${token.token_prefix}...`);
      setCopiedPrefixId(token.id);
      setTimeout(() => setCopiedPrefixId(null), 2000);
    } catch (err) {
      console.error("Failed to copy prefix:", err);
    }
  };

  const isExpired = (token: ApiToken) => {
    if (!token.expires_at) return false;
    return new Date(token.expires_at).getTime() < Date.now();
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Hero Banner Card */}
      <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-linear-to-b from-neutral-50/80 to-white dark:from-neutral-900/40 dark:to-neutral-950 p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
              <RiTerminalBoxLine className="h-3.5 w-3.5" />
              <span>Headless CLI & Autonomous Agent Access</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
              Developer Settings & API Tokens
            </h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
              API tokens grant full access to Novelova's backend services, projects, manuscripts,
              and distributed Kaggle synthesis engine. Perfect for AI coding agents and automated pipelines.
            </p>
          </div>
          <Button
            onClick={() => setDialogOpen(true)}
            className="gap-2 shrink-0 cursor-pointer shadow-xs"
          >
            <RiAddLine className="h-4 w-4" />
            <span>Generate New Token</span>
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          {error}
        </div>
      )}

      {/* Active Tokens Card */}
      <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-background overflow-hidden shadow-xs">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RiKey2Line className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Active API Tokens</h3>
            <span className="text-xs text-muted-foreground ml-1">({tokens.length})</span>
          </div>
        </div>

        {isLoading ? (
          <div className="py-16 text-center">
            <RiLoader4Line className="h-6 w-6 animate-spin mx-auto text-primary mb-2" />
            <p className="text-xs text-muted-foreground shimmer-text">Loading API tokens...</p>
          </div>
        ) : tokens.length === 0 ? (
          <div className="py-16 px-6 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-muted/50 border border-border flex items-center justify-center mx-auto text-muted-foreground">
              <RiKey2Line className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">No API Tokens Yet</p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Generate an API token to interact with Novelova through the command line or autonomous AI agents.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDialogOpen(true)}
              className="mt-2 gap-1.5 cursor-pointer"
            >
              <RiAddLine className="h-4 w-4" />
              <span>Generate Your First Token</span>
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {tokens.map((token) => {
              const expired = isExpired(token);
              return (
                <div
                  key={token.id}
                  className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-muted/20 transition-colors"
                >
                  <div className="space-y-2">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="font-semibold text-sm text-foreground">{token.name}</span>
                      {expired ? (
                        <Badge variant="destructive" className="text-[11px] font-normal py-0">
                          Expired
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-[11px] font-normal py-0 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                        >
                          Active
                        </Badge>
                      )}
                      {token.rate_limit_rpm ? (
                        <Badge variant="outline" className="text-[11px] font-normal py-0 gap-1 text-muted-foreground">
                          <RiSpeedLine className="h-3 w-3" />
                          <span>{token.rate_limit_rpm} rpm</span>
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[11px] font-normal py-0 text-muted-foreground">
                          Unlimited rpm
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
                      <span className="bg-muted px-2 py-0.5 rounded border border-border/70 select-all">
                        {token.token_prefix}...
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopyPrefix(token)}
                        className="p-1 hover:text-foreground text-muted-foreground rounded transition-colors cursor-pointer"
                        title="Copy token prefix"
                      >
                        {copiedPrefixId === token.id ? (
                          <RiCheckLine className="h-3.5 w-3.5 text-emerald-500" />
                        ) : (
                          <RiFileCopyLine className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>

                    <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        <RiTimeLine className="h-3.5 w-3.5 text-muted-foreground/70" />
                        Created: {new Date(token.created_at).toLocaleDateString()}
                      </span>
                      <span>
                        Expires:{" "}
                        {token.expires_at
                          ? new Date(token.expires_at).toLocaleDateString()
                          : "Never (Permanent)"}
                      </span>
                      <span>
                        Last used:{" "}
                        {token.last_used_at
                          ? new Date(token.last_used_at).toLocaleDateString()
                          : "Never"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRevoke(token.id)}
                      disabled={revokingId === token.id}
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive gap-1.5 cursor-pointer text-xs"
                    >
                      {revokingId === token.id ? (
                        <RiLoader4Line className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RiDeleteBinLine className="h-3.5 w-3.5" />
                      )}
                      <span>Revoke</span>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Hugging Face Hub Token Card (Per-User, Encrypted at Rest) */}
      <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-background overflow-hidden shadow-xs">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <RiSparklingLine className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-semibold text-foreground">
              Hugging Face Access Token (HF_TOKEN)
            </h3>
          </div>
          <Badge variant={hfStatus.has_token ? "default" : "secondary"}>
            {hfStatus.has_token
              ? `Configured (${hfStatus.token_masked || "hf_••••••••"})`
              : "Not configured"}
          </Badge>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Your personal Hugging Face read token is used by Kaggle GPU workers to download
            gated model weights such as <strong>TangoFlux (44.1kHz SFX)</strong>. Each user
            configures their own token; it is encrypted at rest and never exposed in plaintext.
          </p>

          <div className="flex flex-col sm:flex-row gap-2.5">
            <input
              type="password"
              value={hfTokenInput}
              onChange={(e) => setHfTokenInput(e.target.value)}
              placeholder={
                hfStatus.has_token
                  ? "Enter a new hf_... token to replace your saved token"
                  : "Paste your Hugging Face token (hf_...)"
              }
              autoComplete="off"
              className="flex-1 h-9 rounded-lg border border-border bg-background px-3 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring font-mono"
            />
            <div className="flex items-center gap-2 shrink-0">
              <Button
                type="button"
                size="sm"
                onClick={handleSaveHfToken}
                disabled={isSavingHf || !hfTokenInput.trim()}
                className="cursor-pointer"
              >
                {isSavingHf ? (
                  <RiLoader4Line className="h-3.5 w-3.5 animate-spin mr-1.5" />
                ) : (
                  <RiCheckLine className="h-3.5 w-3.5 mr-1.5" />
                )}
                <span>{hfStatus.has_token ? "Update Token" : "Save Token"}</span>
              </Button>
              {hfStatus.has_token && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleClearHfToken}
                  disabled={isClearingHf}
                  className="text-destructive hover:text-destructive cursor-pointer"
                >
                  {isClearingHf ? (
                    <RiLoader4Line className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RiDeleteBinLine className="h-3.5 w-3.5" />
                  )}
                  <span className="ml-1">Remove</span>
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Start Guide Card */}
      <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-muted/20 p-6 sm:p-8 space-y-6">
        <div className="flex items-center gap-2">
          <RiSparklingLine className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">CLI & Agent Quick Start</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="p-4 rounded-xl border border-border bg-background space-y-2">
            <div className="flex items-center gap-1.5 font-medium text-foreground">
              <RiTerminalBoxLine className="h-4 w-4 text-primary" />
              <span>1. Authenticate Novelova CLI</span>
            </div>
            <p className="text-muted-foreground">
              Login interactively or provide your generated API token:
            </p>
            <pre className="p-2.5 rounded-lg bg-muted border border-border/80 font-mono text-[11px] text-foreground overflow-x-auto select-all">
              novelova auth login --token nv_live_...
            </pre>
          </div>

          <div className="p-4 rounded-xl border border-border bg-background space-y-2">
            <div className="flex items-center gap-1.5 font-medium text-foreground">
              <RiCodeSSlashLine className="h-4 w-4 text-primary" />
              <span>2. Environment Variable for AI Agents</span>
            </div>
            <p className="text-muted-foreground">
              Export the token in your agent container or shell profile:
            </p>
            <pre className="p-2.5 rounded-lg bg-muted border border-border/80 font-mono text-[11px] text-foreground overflow-x-auto select-all">
              export NOVELOVA_API_TOKEN="nv_live_..."
            </pre>
          </div>

          <div className="p-4 rounded-xl border border-border bg-background space-y-2 md:col-span-2">
            <div className="flex items-center gap-1.5 font-medium text-foreground">
              <RiShieldCheckLine className="h-4 w-4 text-primary" />
              <span>Direct HTTP API Header</span>
            </div>
            <p className="text-muted-foreground">
              Both Bearer and X-API-Key authorization headers are supported simultaneously:
            </p>
            <pre className="p-2.5 rounded-lg bg-muted border border-border/80 font-mono text-[11px] text-foreground overflow-x-auto select-all">
              curl -H "X-API-Key: nv_live_..." https://api.novelova.app/api/v1/projects
            </pre>
          </div>
        </div>
      </div>

      {/* Generate Dialog */}
      <GenerateApiTokenDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={fetchTokens}
      />
    </div>
  );
}
