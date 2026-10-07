import { useState, useRef } from "react";
import {
  RiImage2Line,
  RiCameraLine,
  RiDeleteBinLine,
  RiLoader4Line,
} from "@remixicon/react";
import { uploadAttachment } from "@/services/attachment";
import type { Attachment } from "@novelova/shared-types";

interface ThumbnailDropzoneProps {
  value?: string | null;
  attachment?: Attachment | null;
  onChange: (attachmentId: string | null, attachment: Attachment | null) => void;
}

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export function ThumbnailDropzone({
  attachment,
  onChange,
}: ThumbnailDropzoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleProcessImage = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Please upload a valid image file (JPG, PNG, or WEBP).");
      return;
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      setError("Image file size must be less than 10MB.");
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
        setError("Failed to upload thumbnail image.");
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
      handleProcessImage(file);
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null, null);
    setError(null);
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-semibold text-neutral-900">
        Thumbnail
      </label>

      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleProcessImage(file);
        }}
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
      />

      {attachment?.url ? (
        /* Uploaded Image Preview with Profile Photo Flow (Change overlay + Delete button) */
        <div className="border border-neutral-200 rounded-xl p-4 bg-neutral-50/50 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="relative group w-18 h-24 rounded-lg overflow-hidden border border-neutral-200 bg-neutral-100 shadow-2xs cursor-pointer shrink-0"
              title="Click to replace thumbnail"
            >
              <img
                src={attachment.url}
                alt="Thumbnail preview"
                className="w-full h-full object-cover"
              />

              {/* Hover Camera Overlay like profile photo */}
              {!isUploading && (
                <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity">
                  <RiCameraLine className="h-5 w-5 mb-0.5" />
                  <span className="text-[10px] font-semibold">Change</span>
                </div>
              )}

              {isUploading && (
                <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-white">
                  <RiLoader4Line className="h-5 w-5 animate-spin mb-1" />
                  <span className="text-[9px]">Saving...</span>
                </div>
              )}
            </div>

            <div>
              <p className="text-sm font-semibold text-neutral-900 truncate max-w-xs">
                {attachment.filename}
              </p>
              <p className="text-xs text-neutral-500 mt-0.5">
                {(attachment.size / 1024).toFixed(0)} KB • Custom Cover
              </p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-2 text-xs font-semibold text-neutral-700 hover:text-neutral-900 hover:underline cursor-pointer"
              >
                Change thumbnail
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={handleRemove}
            className="p-2 text-neutral-400 hover:text-destructive rounded-lg transition-colors cursor-pointer"
            title="Remove thumbnail"
          >
            <RiDeleteBinLine className="h-4 w-4" />
          </button>
        </div>
      ) : (
        /* Exact Empty Dropzone Box Matching Screenshot */
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !isUploading && fileInputRef.current?.click()}
          className={`border border-dashed rounded-xl py-9 px-6 bg-white flex flex-col items-center justify-center text-center transition-colors cursor-pointer ${
            isDragging
              ? "border-neutral-900 bg-neutral-50"
              : "border-neutral-300 hover:border-neutral-400"
          }`}
        >
          {isUploading ? (
            <div className="flex flex-col items-center justify-center py-2">
              <RiLoader4Line className="h-8 w-8 animate-spin text-neutral-600 mb-2" />
              <p className="text-sm font-medium text-neutral-700">
                Uploading thumbnail...
              </p>
            </div>
          ) : (
            <>
              {/* Picture/Image Icon */}
              <div className="h-10 w-10 rounded-xl bg-neutral-100 flex items-center justify-center text-neutral-600 mb-2">
                <RiImage2Line className="h-5 w-5" />
              </div>

              {/* Exact Subtext from Screenshot */}
              <p className="text-xs text-neutral-400">
                Optional · JPG, PNG, or WEBP · up to 10 MB
              </p>
            </>
          )}
        </div>
      )}

      {error && <p className="text-xs text-destructive mt-1">{error}</p>}
    </div>
  );
}
