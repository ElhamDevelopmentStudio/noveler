import { useState, useRef, type ChangeEvent, type DragEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  RiUpload2Line,
  RiFileZipLine,
  RiCheckLine,
  RiCloseLine,
  RiLoader4Line,
  RiAlertLine,
  RiBookOpenLine,
  RiUserVoiceLine,
  RiFileTextLine,
  RiInformationLine,
} from "@remixicon/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Project, ProjectArchivePreviewResponse } from "@novelova/shared-types";
import { previewProjectArchive, importProjectArchive } from "@/services/projects";
import { cn } from "@/lib/utils";

export interface ImportProjectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (project: Project) => void;
}

export function ImportProjectModal({
  open,
  onOpenChange,
  onSuccess,
}: ImportProjectModalProps) {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [preview, setPreview] = useState<ProjectArchivePreviewResponse | null>(null);
  const [overrideTitle, setOverrideTitle] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleReset = () => {
    setSelectedFile(null);
    setPreview(null);
    setOverrideTitle("");
    setErrorMessage(null);
    setIsPreviewing(false);
    setIsImporting(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".zip")) {
      setErrorMessage("Please select a valid .zip project archive.");
      return;
    }

    setErrorMessage(null);
    setSelectedFile(file);
    setIsPreviewing(true);

    try {
      const data = await previewProjectArchive(file);
      setPreview(data);
      setOverrideTitle(data.title || "");
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Failed to read project archive. Make sure it was created by Novelova.";
      setErrorMessage(msg);
      setSelectedFile(null);
      setPreview(null);
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFile(file);
    }
  };

  const handleImport = async () => {
    if (!selectedFile) return;

    setIsImporting(true);
    setErrorMessage(null);

    try {
      const imported = await importProjectArchive(
        selectedFile,
        overrideTitle.trim() || undefined,
      );
      onOpenChange(false);
      handleReset();
      if (onSuccess) {
        onSuccess(imported);
      } else {
        navigate(`/projects/${imported.id}`);
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Failed to import project. Please try again.";
      setErrorMessage(msg);
      setIsImporting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!isImporting) {
          onOpenChange(next);
          if (!next) handleReset();
        }
      }}
    >
      <DialogContent className="max-w-xl p-0 overflow-hidden rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 shadow-2xl">
        <DialogHeader className="p-6 pb-4 border-b border-neutral-100 dark:border-neutral-800/80">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-neutral-100 dark:bg-neutral-900 flex items-center justify-center text-neutral-800 dark:text-neutral-200">
              <RiFileZipLine className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                Import Project Archive
              </DialogTitle>
              <DialogDescription className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                Restore a full novel project bundle (.zip) with chapters, character voices, and history.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="p-6 space-y-5">
          {errorMessage && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-400 text-xs flex items-start gap-2.5">
              <RiAlertLine className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="leading-relaxed">{errorMessage}</div>
            </div>
          )}

          {!preview ? (
            /* Dropzone / Upload area */
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-3 select-none",
                isDragging
                  ? "border-neutral-900 dark:border-neutral-100 bg-neutral-50/80 dark:bg-neutral-900/50"
                  : "border-neutral-200 dark:border-neutral-800 hover:border-neutral-400 dark:hover:border-neutral-600 bg-neutral-50/40 dark:bg-neutral-900/20",
                isPreviewing && "pointer-events-none opacity-60",
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip"
                onChange={handleFileChange}
                className="hidden"
              />

              {isPreviewing ? (
                <div className="py-4 flex flex-col items-center gap-2">
                  <RiLoader4Line className="h-8 w-8 animate-spin text-neutral-600 dark:text-neutral-400" />
                  <p className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
                    Inspecting archive manifest & chapters...
                  </p>
                </div>
              ) : (
                <>
                  <div className="h-12 w-12 rounded-2xl bg-neutral-100 dark:bg-neutral-900 flex items-center justify-center text-neutral-600 dark:text-neutral-300 shadow-2xs">
                    <RiUpload2Line className="h-6 w-6" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                      Drop project archive (.zip) here
                    </p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      or click to browse from your device
                    </p>
                  </div>
                  <div className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-1">
                    Must be a ZIP archive exported from Novelova
                  </div>
                </>
              )}
            </div>
          ) : (
            /* Archive Preview Card */
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-xl bg-neutral-50 dark:bg-neutral-900/60 border border-neutral-200/80 dark:border-neutral-800">
                <div className="flex items-center gap-2.5 min-w-0">
                  <RiFileZipLine className="h-5 w-5 text-neutral-600 dark:text-neutral-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                      {selectedFile?.name}
                    </p>
                    <p className="text-[10px] text-neutral-500 dark:text-neutral-400 font-mono">
                      {(selectedFile?.size ? selectedFile.size / 1024 : 0).toFixed(1)} KB
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleReset}
                  disabled={isImporting}
                  className="h-7 px-2 text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
                >
                  <RiCloseLine className="h-4 w-4 mr-1" />
                  Change file
                </Button>
              </div>

              {/* Title override input */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                  Project Title
                </label>
                <input
                  type="text"
                  value={overrideTitle}
                  onChange={(e) => setOverrideTitle(e.target.value)}
                  disabled={isImporting}
                  placeholder="Enter project title"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 focus:outline-hidden focus:border-neutral-900 dark:focus:border-neutral-100 shadow-2xs"
                />
              </div>

              {/* Stats & metadata grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 rounded-xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900/40 space-y-1">
                  <div className="flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400">
                    <RiBookOpenLine className="h-3.5 w-3.5" />
                    <span className="text-[11px] font-medium">Chapters</span>
                  </div>
                  <p className="text-base font-bold text-neutral-900 dark:text-neutral-100 font-mono">
                    {preview.total_chapters}
                  </p>
                  <div className="text-[10px] text-neutral-400 dark:text-neutral-500 flex items-center gap-1">
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                      {preview.tagged_chapters_count}
                    </span>{" "}
                    tagged · {preview.untagged_chapters_count} untagged
                  </div>
                </div>

                <div className="p-3 rounded-xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900/40 space-y-1">
                  <div className="flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400">
                    <RiUserVoiceLine className="h-3.5 w-3.5" />
                    <span className="text-[11px] font-medium">Characters</span>
                  </div>
                  <p className="text-base font-bold text-neutral-900 dark:text-neutral-100 font-mono">
                    {preview.total_characters}
                  </p>
                  <div className="text-[10px] text-neutral-400 dark:text-neutral-500">
                    Casting preserved
                  </div>
                </div>

                <div className="p-3 rounded-xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900/40 space-y-1">
                  <div className="flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400">
                    <RiFileTextLine className="h-3.5 w-3.5" />
                    <span className="text-[11px] font-medium">Segments</span>
                  </div>
                  <p className="text-base font-bold text-neutral-900 dark:text-neutral-100 font-mono">
                    {preview.total_segments.toLocaleString()}
                  </p>
                  <div className="text-[10px] text-neutral-400 dark:text-neutral-500">
                    {preview.total_words.toLocaleString()} words
                  </div>
                </div>

                <div className="p-3 rounded-xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900/40 space-y-1">
                  <div className="flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400">
                    <RiInformationLine className="h-3.5 w-3.5" />
                    <span className="text-[11px] font-medium">Assets</span>
                  </div>
                  <div className="pt-1 flex flex-col gap-1 text-[10px]">
                    <span className="flex items-center gap-1 text-neutral-600 dark:text-neutral-300">
                      <RiCheckLine className={cn("h-3 w-3", preview.has_cover ? "text-emerald-500" : "text-neutral-300")} />
                      Cover image
                    </span>
                    <span className="flex items-center gap-1 text-neutral-600 dark:text-neutral-300">
                      <RiCheckLine className={cn("h-3 w-3", preview.has_manuscript ? "text-emerald-500" : "text-neutral-300")} />
                      Manuscript file
                    </span>
                    {preview.total_voices !== undefined && preview.total_voices > 0 && (
                      <span className="flex items-center gap-1 text-neutral-600 dark:text-neutral-300">
                        <RiCheckLine className="h-3 w-3 text-emerald-500" />
                        {preview.total_voices} Voice{preview.total_voices === 1 ? "" : "s"}
                      </span>
                    )}
                    {preview.total_sfx !== undefined && preview.total_sfx > 0 && (
                      <span className="flex items-center gap-1 text-neutral-600 dark:text-neutral-300">
                        <RiCheckLine className="h-3 w-3 text-emerald-500" />
                        {preview.total_sfx} SFX ({preview.total_foley_cues ?? 0} Foley cues)
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {preview.author && (
                <div className="text-xs text-neutral-500 dark:text-neutral-400 flex items-center gap-2">
                  <span>Author: <strong className="text-neutral-800 dark:text-neutral-200">{preview.author}</strong></span>
                  {preview.genre && <span>· Genre: <strong className="text-neutral-800 dark:text-neutral-200">{preview.genre}</strong></span>}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-6 pt-4 border-t border-neutral-100 dark:border-neutral-800/80 bg-neutral-50/50 dark:bg-neutral-900/30 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isImporting}
            className="text-xs text-neutral-600 dark:text-neutral-400"
          >
            Cancel
          </Button>

          <Button
            size="sm"
            onClick={handleImport}
            disabled={!preview || isImporting || !overrideTitle.trim()}
            className="bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-neutral-200 text-white dark:text-neutral-900 font-medium text-xs px-4"
          >
            {isImporting ? (
              <>
                <RiLoader4Line className="h-3.5 w-3.5 animate-spin mr-1.5" />
                Restoring project...
              </>
            ) : (
              "Confirm & Import"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
