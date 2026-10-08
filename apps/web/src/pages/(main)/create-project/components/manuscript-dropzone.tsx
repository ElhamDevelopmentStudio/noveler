import { useState, useRef } from "react";
import {
  RiUploadCloud2Line,
  RiFileTextLine,
  RiDeleteBinLine,
  RiLoader4Line,
} from "@remixicon/react";
import { uploadAttachment } from "@/services/attachment";
import type { Attachment } from "@novelova/shared-types";

interface ManuscriptDropzoneProps {
  value?: string | null;
  attachment?: Attachment | null;
  onChange: (attachmentId: string | null, attachment: Attachment | null) => void;
}

const ALLOWED_EXTENSIONS = [".txt", ".pdf", ".epub", ".docx", ".rtf", ".md"];
const MAX_SIZE_BYTES = 250 * 1024 * 1024; // 250 MB

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ManuscriptDropzone({
  attachment,
  onChange,
}: ManuscriptDropzoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateFile = (file: File): string | null => {
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return `File type "${ext}" not supported. Supported: TXT, PDF, EPUB, DOCX, RTF, MD`;
    }
    if (file.size > MAX_SIZE_BYTES) {
      return "File size exceeds 250 MB limit.";
    }
    return null;
  };

  const handleProcessFile = async (file: File) => {
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setIsUploading(true);

    try {
      const uploaded = await uploadAttachment(file);
      onChange(uploaded.id, uploaded);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to upload manuscript file.");
      }
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleProcessFile(file);
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null, null);
    setError(null);
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-semibold text-neutral-900 dark:text-neutral-100">
        Manuscript
      </label>

      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleProcessFile(file);
        }}
        accept=".txt,.pdf,.epub,.docx,.rtf,.md"
        className="hidden"
      />

      {attachment ? (
        /* Uploaded Manuscript File State */
        <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl p-4 bg-neutral-50/50 dark:bg-neutral-900/50 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-lg bg-neutral-200/70 dark:bg-neutral-800 flex items-center justify-center text-neutral-700 dark:text-neutral-300 shrink-0">
              <RiFileTextLine className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                {attachment.filename}
              </p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {formatFileSize(attachment.size)} • Ready
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-200/50 dark:hover:bg-neutral-800 rounded-lg transition-colors cursor-pointer"
            >
              Replace
            </button>
            <button
              type="button"
              onClick={handleRemove}
              className="p-1.5 text-neutral-400 hover:text-destructive rounded-lg transition-colors cursor-pointer"
              title="Remove manuscript"
            >
              <RiDeleteBinLine className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : (
        /* Exact Dropzone Box Matching Screenshot */
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !isUploading && fileInputRef.current?.click()}
          className={`border border-dashed rounded-xl py-9 px-6 bg-white dark:bg-neutral-900/50 flex flex-col items-center justify-center text-center transition-colors cursor-pointer ${
            isDragging
              ? "border-neutral-900 dark:border-neutral-100 bg-neutral-50 dark:bg-neutral-800"
              : "border-neutral-300 dark:border-neutral-700 hover:border-neutral-400 dark:hover:border-neutral-600"
          }`}
        >
          {isUploading ? (
            <div className="flex flex-col items-center justify-center py-2">
              <RiLoader4Line className="h-8 w-8 animate-spin text-neutral-600 dark:text-neutral-400 mb-2" />
              <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Uploading manuscript...
              </p>
            </div>
          ) : (
            <>
              {/* Cloud Icon */}
              <div className="h-10 w-10 rounded-xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-600 dark:text-neutral-400 mb-3">
                <RiUploadCloud2Line className="h-5 w-5" />
              </div>

              {/* Title */}
              <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                Drop your manuscript here, or choose a file
              </p>

              {/* Formats Info */}
              <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1 mb-4">
                TXT, PDF, EPUB, DOCX, RTF, or MD · up to 250 MB
              </p>

              {/* Choose File Button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
                className="px-4 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 text-sm font-medium text-neutral-800 dark:text-neutral-200 shadow-2xs transition-colors cursor-pointer"
              >
                Choose file
              </button>
            </>
          )}
        </div>
      )}

      {error && <p className="text-xs text-destructive mt-1">{error}</p>}
    </div>
  );
}
