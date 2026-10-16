import React, { useState, useEffect, useRef } from "react";
import {
  RiUploadCloud2Line,
  RiCheckLine,
  RiLoader4Line,
  RiEyeLine,
  RiEyeOffLine,
  RiAlertLine,
  RiCheckboxCircleLine,
  RiFileTextLine,
} from "@remixicon/react";
import type { KaggleAccount } from "@novelova/shared-types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  createKaggleAccount,
  updateKaggleAccount,
  testKaggleCredentials,
} from "@/services/kaggle";

interface AddKaggleAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  editingAccount?: KaggleAccount | null;
}

export function AddKaggleAccountDialog({
  open,
  onOpenChange,
  onSuccess,
  editingAccount,
}: AddKaggleAccountDialogProps) {
  const isEditing = Boolean(editingAccount);

  const [username, setUsername] = useState("");
  const [key, setKey] = useState("");
  const [priority, setPriority] = useState(1);
  const [isActive, setIsActive] = useState(true);
  const [showKey, setShowKey] = useState(false);

  const [isDragging, setIsDragging] = useState(false);
  const [dropNotice, setDropNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (editingAccount) {
      setUsername(editingAccount.username);
      setKey(editingAccount.key_masked);
      setPriority(editingAccount.priority);
      setIsActive(editingAccount.is_active);
    } else {
      setUsername("");
      setKey("");
      setPriority(1);
      setIsActive(true);
    }
    setDropNotice(null);
    setTestResult(null);
    setTestError(null);
    setFormError(null);
    setShowKey(false);
  }, [editingAccount, open]);

  const handleJsonContent = (content: string) => {
    try {
      const parsed = JSON.parse(content);
      if (parsed.username && parsed.key) {
        setUsername(parsed.username.trim());
        setKey(parsed.key.trim());
        setDropNotice(`Loaded credentials for @${parsed.username.trim()}`);
        setTestError(null);
        setFormError(null);
      } else {
        setFormError("Invalid kaggle.json format. Expected 'username' and 'key' fields.");
      }
    } catch {
      setFormError("Failed to parse file. Make sure you dropped a valid kaggle.json file.");
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        if (text) handleJsonContent(text);
      };
      reader.readAsText(file);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        if (text) handleJsonContent(text);
      };
      reader.readAsText(file);
    }
  };

  const handleTest = async () => {
    if (!username.trim() || !key.trim() || key.includes("•")) {
      setTestError("Please enter both username and an unmasked API key to verify.");
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    setTestError(null);

    try {
      const res = await testKaggleCredentials(username.trim(), key.trim());
      setTestResult(res.message);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Verification failed.";
      setTestError(msg);
    } finally {
      setIsTesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!username.trim()) {
      setFormError("Kaggle username is required.");
      return;
    }
    if (!isEditing && !key.trim()) {
      setFormError("API key is required.");
      return;
    }

    setIsSubmitting(true);
    try {
      const keyPayload = key.includes("•") ? undefined : key.trim();
      if (isEditing && editingAccount) {
        await updateKaggleAccount(editingAccount.id, {
          username: username.trim(),
          key: keyPayload,
          priority: Number(priority),
          is_active: isActive,
          verify_first: Boolean(keyPayload),
        });
      } else {
        await createKaggleAccount({
          username: username.trim(),
          key: key.trim(),
          priority: Number(priority),
          is_active: isActive,
          verify_first: true,
        });
      }

      onSuccess();
      onOpenChange(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save Kaggle account.";
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card border-border text-foreground p-6">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-base font-semibold">
            {isEditing ? "Edit Kaggle Account" : "Add Kaggle Account"}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {isEditing
              ? "Update priority rank, active status, or API credentials."
              : "Connect an account to contribute 30 GPU hours/week to your production pool."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 pt-2">
          {/* File Dropzone for kaggle.json */}
          {!isEditing && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleFileDrop}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "p-4 rounded-xl border border-dashed text-center cursor-pointer transition-all duration-150 flex flex-col items-center justify-center gap-1.5",
                isDragging
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border hover:border-foreground/40 bg-muted/20"
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleFileInputChange}
              />
              <RiUploadCloud2Line className="h-5 w-5 text-muted-foreground" />
              <div className="text-xs font-medium">
                Drag & drop your <span className="font-mono text-primary font-semibold">kaggle.json</span> file
              </div>
              <p className="text-[11px] text-muted-foreground">
                Or click to browse your downloads
              </p>
            </div>
          )}

          {/* Parsed JSON Confirmation */}
          {dropNotice && (
            <div className="px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs flex items-center gap-2">
              <RiFileTextLine className="h-4 w-4 shrink-0" />
              <span className="font-medium">{dropNotice}</span>
            </div>
          )}

          {/* Test or Form Alert Banners */}
          {testResult && (
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs flex items-start gap-2">
              <RiCheckboxCircleLine className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{testResult}</span>
            </div>
          )}

          {(testError || formError) && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-start gap-2">
              <RiAlertLine className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{testError || formError}</span>
            </div>
          )}

          {/* Inputs */}
          <div className="space-y-4">
            {/* Username */}
            <div className="space-y-1">
              <label
                htmlFor="kaggle-username"
                className="block text-xs font-medium text-muted-foreground"
              >
                Kaggle Username
              </label>
              <input
                id="kaggle-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. runner_01"
                className="w-full bg-transparent px-0 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground/30 outline-none border-0 border-b border-border hover:border-foreground/40 focus:border-b-2 focus:border-foreground transition-all"
              />
            </div>

            {/* API Key */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="kaggle-key"
                  className="block text-xs font-medium text-muted-foreground"
                >
                  API Token / Key
                </label>
                {isEditing && (
                  <span className="text-[11px] text-muted-foreground/60">
                    Leave masked to keep existing
                  </span>
                )}
              </div>
              <div className="relative">
                <input
                  id="kaggle-key"
                  type={showKey ? "text" : "password"}
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder="32-character hexadecimal key"
                  className="w-full bg-transparent pr-8 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground/30 outline-none border-0 border-b border-border hover:border-foreground/40 focus:border-b-2 focus:border-foreground transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((prev) => !prev)}
                  className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showKey ? (
                    <RiEyeOffLine className="h-4 w-4" />
                  ) : (
                    <RiEyeLine className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Priority & Status Row */}
            <div className="grid grid-cols-2 gap-4 pt-1">
              <div className="space-y-1">
                <label
                  htmlFor="kaggle-priority"
                  className="block text-xs font-medium text-muted-foreground"
                >
                  Priority Rank
                </label>
                <input
                  id="kaggle-priority"
                  type="number"
                  min="1"
                  max="100"
                  value={priority}
                  onChange={(e) => setPriority(parseInt(e.target.value) || 1)}
                  className="w-full bg-transparent py-2 text-sm font-mono text-foreground outline-none border-0 border-b border-border hover:border-foreground/40 focus:border-b-2 focus:border-foreground transition-all"
                />
                <p className="text-[10px] text-muted-foreground">
                  #1 is primary; #2, #3 are failovers
                </p>
              </div>

              <div className="space-y-1 flex flex-col justify-center">
                <span className="block text-xs font-medium text-muted-foreground mb-1">
                  Active in Pool
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isActive}
                  onClick={() => setIsActive((prev) => !prev)}
                  className={cn(
                    "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                    isActive ? "bg-primary" : "bg-muted"
                  )}
                >
                  <span
                    className={cn(
                      "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow-lg ring-0 transition duration-200 ease-in-out",
                      isActive ? "translate-x-5" : "translate-x-0"
                    )}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-4 flex items-center justify-between border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleTest}
              disabled={isTesting || !username.trim() || !key.trim() || key.includes("•")}
              className="text-xs h-9 border-border text-foreground hover:bg-muted/50"
            >
              {isTesting ? (
                <>
                  <RiLoader4Line className="h-4 w-4 animate-spin mr-1.5" />
                  Testing...
                </>
              ) : (
                "Verify Credentials"
              )}
            </Button>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
                className="h-9 px-3 text-xs text-muted-foreground hover:text-foreground"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isSubmitting}
                className="h-9 px-5 bg-black text-white hover:bg-black/90 dark:bg-white dark:text-black dark:hover:bg-white/90 transition-all font-medium text-xs disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <RiLoader4Line className="h-4 w-4 animate-spin mr-1.5" />
                    Saving...
                  </>
                ) : (
                  <>
                    <RiCheckLine className="h-4 w-4 mr-1.5" />
                    {isEditing ? "Save Changes" : "Save Account"}
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default AddKaggleAccountDialog;
