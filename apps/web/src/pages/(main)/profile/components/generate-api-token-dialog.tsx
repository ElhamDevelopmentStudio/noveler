import React, { useState } from "react";
import {
  RiKey2Line,
  RiCheckLine,
  RiFileCopyLine,
  RiAlertLine,
  RiLoader4Line,
  RiShieldCheckLine,
} from "@remixicon/react";
import type { ApiTokenCreated } from "@novelova/shared-types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { createApiToken } from "@/services/api-tokens";

interface GenerateApiTokenDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function GenerateApiTokenDialog({
  open,
  onOpenChange,
  onSuccess,
}: GenerateApiTokenDialogProps) {
  const [name, setName] = useState("");
  const [expirationOption, setExpirationOption] = useState<string>("permanent");
  const [rateLimit, setRateLimit] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Once generated, hold the created token result
  const [createdToken, setCreatedToken] = useState<ApiTokenCreated | null>(null);
  const [copied, setCopied] = useState(false);

  const handleReset = () => {
    setName("");
    setExpirationOption("permanent");
    setRateLimit("");
    setErrorMessage(null);
    setCreatedToken(null);
    setCopied(false);
  };

  const handleClose = () => {
    if (createdToken) {
      onSuccess();
    }
    handleReset();
    onOpenChange(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMessage("Token name is required.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    let expiresInDays: number | null = null;
    if (expirationOption === "30") expiresInDays = 30;
    else if (expirationOption === "90") expiresInDays = 90;
    else if (expirationOption === "180") expiresInDays = 180;
    else if (expirationOption === "365") expiresInDays = 365;

    const parsedRateLimit = rateLimit.trim() ? parseInt(rateLimit, 10) : null;
    if (parsedRateLimit !== null && (isNaN(parsedRateLimit) || parsedRateLimit < 1)) {
      setErrorMessage("Rate limit must be a positive number.");
      setIsSubmitting(false);
      return;
    }

    try {
      const res = await createApiToken({
        name: name.trim(),
        expires_in_days: expiresInDays,
        rate_limit_rpm: parsedRateLimit,
      });
      setCreatedToken(res);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage("Failed to generate API token. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopy = async () => {
    if (!createdToken) return;
    try {
      await navigator.clipboard.writeText(createdToken.token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy token:", err);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => (!val ? handleClose() : onOpenChange(val))}>
      <DialogContent className="sm:max-w-md bg-background border-border">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <RiKey2Line className="h-5 w-5" />
            </div>
            <DialogTitle className="text-lg font-semibold">
              {createdToken ? "API Token Generated" : "Generate API Token"}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            {createdToken
              ? "Your API token is ready. Save it now; you won't be able to see it again."
              : "Generate a token to authenticate the novelova CLI and autonomous AI agent workflows."}
          </DialogDescription>
        </DialogHeader>

        {createdToken ? (
          <div className="space-y-4 py-2">
            <div className="p-3.5 rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs flex items-start gap-2.5">
              <RiAlertLine className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                Please copy this secret key now and store it in a secure location. For security
                reasons, it cannot be displayed or retrieved again once you dismiss this window.
              </span>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Token Secret</Label>
              <div className="flex items-center gap-2">
                <div className="flex-1 font-mono text-xs p-2.5 rounded-lg border border-border bg-muted/50 break-all select-all">
                  {createdToken.token}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-1.5 h-10 px-3 cursor-pointer"
                  onClick={handleCopy}
                >
                  {copied ? (
                    <>
                      <RiCheckLine className="h-4 w-4 text-emerald-500" />
                      <span className="text-xs text-emerald-500 font-medium">Copied!</span>
                    </>
                  ) : (
                    <>
                      <RiFileCopyLine className="h-4 w-4" />
                      <span className="text-xs">Copy</span>
                    </>
                  )}
                </Button>
              </div>
            </div>

            <div className="p-3 rounded-xl border border-border bg-muted/30 text-xs space-y-1.5">
              <div className="flex items-center gap-1.5 text-foreground font-medium">
                <RiShieldCheckLine className="h-4 w-4 text-primary" />
                <span>Usage with CLI:</span>
              </div>
              <code className="block p-2 rounded-md bg-background border border-border/60 font-mono text-[11px] text-muted-foreground select-all">
                novelova auth login --token {createdToken.token_prefix}...
              </code>
            </div>

            <div className="pt-2 flex justify-end">
              <Button type="button" onClick={handleClose} className="cursor-pointer">
                I Have Saved My Token
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            {errorMessage && (
              <div className="p-3 text-xs rounded-lg bg-destructive/10 border border-destructive/20 text-destructive flex items-center gap-2">
                <RiAlertLine className="h-4 w-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="token-name" className="text-xs font-medium">
                Token Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="token-name"
                placeholder="e.g. MacBook CLI, AI Agent Daemon, Production Server"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                autoFocus
              />
              <p className="text-[11px] text-muted-foreground">
                A descriptive label to identify where this token is being used.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="token-expiration" className="text-xs font-medium">
                Expiration
              </Label>
              <NativeSelect
                id="token-expiration"
                value={expirationOption}
                onChange={(e) => setExpirationOption(e.target.value)}
              >
                <NativeSelectOption value="permanent">Never (Permanent / No Expiration)</NativeSelectOption>
                <NativeSelectOption value="30">30 Days</NativeSelectOption>
                <NativeSelectOption value="90">90 Days</NativeSelectOption>
                <NativeSelectOption value="180">180 Days</NativeSelectOption>
                <NativeSelectOption value="365">1 Year</NativeSelectOption>
              </NativeSelect>
              <p className="text-[11px] text-muted-foreground">
                Tokens can be revoked anytime from this dashboard.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="token-rate-limit" className="text-xs font-medium">
                Rate Limit RPM (Optional)
              </Label>
              <Input
                id="token-rate-limit"
                type="number"
                placeholder="e.g. 120 (leave blank for unlimited)"
                value={rateLimit}
                onChange={(e) => setRateLimit(e.target.value)}
                min={1}
                max={10000}
              />
              <p className="text-[11px] text-muted-foreground">
                Maximum requests per minute. Leave empty for unrestricted throughput.
              </p>
            </div>

            <div className="pt-3 flex items-center justify-end gap-2.5">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isSubmitting}
                className="cursor-pointer"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || !name.trim()} className="cursor-pointer">
                {isSubmitting ? (
                  <>
                    <RiLoader4Line className="h-4 w-4 animate-spin mr-1.5" />
                    Generating...
                  </>
                ) : (
                  "Generate Token"
                )}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
