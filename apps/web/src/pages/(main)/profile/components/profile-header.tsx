import { useState, useRef } from "react";
import {
  RiCameraLine,
  RiLoader4Line,
  RiDeleteBinLine,
  RiErrorWarningLine,
} from "@remixicon/react";
import type { User } from "@novelova/shared-types";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/context/auth-context";
import { uploadAttachment } from "@/services/attachment";

interface ProfileHeaderProps {
  user: User;
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
      month: "long",
      day: "2-digit",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export function ProfileHeader({ user }: ProfileHeaderProps) {
  const { updateUser } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleSelectFile = () => {
    setUploadError(null);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setUploadError("Please upload a valid image file (PNG, JPG, WebP, GIF).");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setUploadError("Image file size must be less than 10MB.");
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      const attachment = await uploadAttachment(file);
      await updateUser({ avatar_attachment_id: attachment.id });
    } catch (err: unknown) {
      if (err instanceof Error) {
        setUploadError(err.message);
      } else {
        setUploadError("Failed to upload profile photo.");
      }
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleRemovePhoto = async () => {
    setIsUploading(true);
    setUploadError(null);
    try {
      await updateUser({ avatar_attachment_id: "" });
    } catch (err: unknown) {
      if (err instanceof Error) {
        setUploadError(err.message);
      } else {
        setUploadError("Failed to remove profile photo.");
      }
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-6 pb-6 border-b border-border">
      {/* Top Breadcrumb Only */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground font-medium">
        <span className="hover:text-foreground transition-colors cursor-pointer">
          Users
        </span>
        <span className="text-muted-foreground/60">›</span>
        <span className="text-foreground font-semibold">
          {user.name} details
        </span>
      </div>

      {/* Hero Profile Info */}
      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 pt-1">
        {/* Avatar with Camera Hover Overlay & Bottom-Right Delete Button */}
        <div className="relative group shrink-0">
          <Avatar
            className="h-24 w-24 ring-2 ring-primary/20 shadow-xs cursor-pointer select-none overflow-hidden"
            onClick={handleSelectFile}
            title="Click to change profile picture"
          >
            <AvatarImage
              src={user.avatar_url || undefined}
              alt={user.name}
              className="object-cover"
            />
            <AvatarFallback seed={user.handle}>
              {user.name.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>

          {/* Hover Camera Overlay ("Change") */}
          {!isUploading && (
            <div
              onClick={handleSelectFile}
              className="absolute inset-0 bg-black/45 rounded-full flex flex-col items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer pointer-events-none"
            >
              <RiCameraLine className="h-5 w-5 mb-0.5" />
              <span className="text-[10px] font-semibold">Change</span>
            </div>
          )}

          {/* Uploading Spinner */}
          {isUploading && (
            <div className="absolute inset-0 bg-black/60 rounded-full flex flex-col items-center justify-center text-white select-none">
              <RiLoader4Line className="h-6 w-6 animate-spin mb-1 text-primary-foreground" />
              <span className="text-[10px] font-medium">Saving...</span>
            </div>
          )}

          {/* Bottom-right Corner Delete Icon Button (visible on hover if custom photo exists) */}
          {user.avatar_attachment_id && !isUploading && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleRemovePhoto();
              }}
              title="Remove profile photo"
              className="absolute bottom-0 right-0 translate-x-1 translate-y-1 h-7 w-7 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 flex items-center justify-center shadow-xs border-2 border-background cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity z-10"
            >
              <RiDeleteBinLine className="h-3.5 w-3.5" />
              <span className="sr-only">Remove profile photo</span>
            </button>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={handleFileChange}
        />

        {/* User Details */}
        <div className="flex-1 text-center sm:text-left space-y-1.5 min-w-0">
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-foreground truncate">
              {user.name}
            </h1>
            <Badge
              variant="secondary"
              className="text-xs px-2 py-0.5 rounded-full font-medium"
            >
              Admin
            </Badge>
          </div>

          <p className="text-sm text-muted-foreground truncate">
            {user.email}
          </p>

          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1 text-xs text-muted-foreground">
            <span>Started on {formatDate(user.created_at)}</span>
            <span>•</span>
            <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
              <span className="h-2 w-2 rounded-full bg-foreground" />
              Active
            </span>
          </div>
        </div>
      </div>

      {uploadError && (
        <div className="p-2.5 text-xs rounded-md bg-destructive/10 border border-destructive/20 text-destructive flex items-center gap-2">
          <RiErrorWarningLine className="h-4 w-4 shrink-0" />
          <span>{uploadError}</span>
        </div>
      )}
    </div>
  );
}

export default ProfileHeader;
