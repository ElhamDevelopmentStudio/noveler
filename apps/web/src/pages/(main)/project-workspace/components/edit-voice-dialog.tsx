import { useState, useRef, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  RiEditLine,
  RiGlobalLine,
  RiImageAddLine,
  RiInformationLine,
  RiLoader4Line,
} from "@remixicon/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CharacterAvatar } from "@/components/ui/character-avatar";
import { updateVoice } from "@/services/voices";
import type { Voice } from "@novelova/shared-types";
import { cn } from "@/lib/utils";

const editVoiceSchema = z.object({
  name: z.string().min(1, "Voice name is required").max(100, "Name cannot exceed 100 characters"),
  gender: z.enum(["male", "female", "neutral"]),
  is_global: z.boolean(),
  reference_text: z.string().max(2000, "Reference text cannot exceed 2000 characters").optional(),
});

type EditVoiceFormData = z.infer<typeof editVoiceSchema>;

export interface EditVoiceDialogProps {
  voice: Voice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onVoiceUpdated: (voice: Voice) => void;
}

export function EditVoiceDialog({
  voice,
  open,
  onOpenChange,
  onVoiceUpdated,
}: EditVoiceDialogProps) {
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<EditVoiceFormData>({
    resolver: zodResolver(editVoiceSchema),
    defaultValues: {
      name: voice?.name || "",
      gender: (voice?.gender as "male" | "female" | "neutral") || "neutral",
      is_global: voice?.is_global ?? true,
      reference_text: voice?.reference_text || "",
    },
  });

  useEffect(() => {
    if (voice) {
      reset({
        name: voice.name,
        gender: (voice.gender as "male" | "female" | "neutral") || "neutral",
        is_global: voice.is_global,
        reference_text: voice.reference_text || "",
      });
      setAvatarPreviewUrl(voice.avatar_url || null);
      setAvatarFile(null);
    }
  }, [voice, reset]);

  // Clean up preview object URL
  useEffect(() => {
    return () => {
      if (avatarPreviewUrl && avatarPreviewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(avatarPreviewUrl);
      }
    };
  }, [avatarPreviewUrl]);

  const watchName = watch("name");
  const watchGender = watch("gender");

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (avatarPreviewUrl && avatarPreviewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(avatarPreviewUrl);
    }
    const url = URL.createObjectURL(file);
    setAvatarFile(file);
    setAvatarPreviewUrl(url);
  };

  const onSubmit = async (data: EditVoiceFormData) => {
    if (!voice) return;

    setIsSubmitting(true);
    setFormError(null);

    try {
      const formData = new FormData();
      formData.append("name", data.name);
      formData.append("gender", data.gender);
      formData.append("is_global", String(data.is_global));
      if (data.reference_text !== undefined) {
        formData.append("reference_text", data.reference_text);
      }
      if (avatarFile) {
        formData.append("avatar_file", avatarFile);
      }

      const updatedVoice = await updateVoice(voice.id, formData);
      onVoiceUpdated(updatedVoice);
      onOpenChange(false);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to update voice clone");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto p-0 gap-0 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#0c0d10] shadow-2xl">
        <DialogHeader className="p-6 pb-4 border-b border-neutral-200/80 dark:border-neutral-800 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-900 dark:text-neutral-100 shadow-2xs">
              <RiEditLine className="h-4.5 w-4.5" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                Edit Voice Clone
              </DialogTitle>
              <p className="text-xs text-neutral-400 dark:text-neutral-500">
                Update display name, avatar, persona, or project scope
              </p>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-5">
          {formError && (
            <div className="p-3 rounded-xl bg-destructive/10 text-destructive text-xs font-medium border border-destructive/20 flex items-start gap-2">
              <RiInformationLine className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          {/* Voice Identity (Avatar + Name + Gender) */}
          <div className="flex items-start gap-4">
            {/* Avatar Preview & Upload */}
            <div className="flex flex-col items-center gap-1.5 shrink-0">
              <div className="relative group">
                {avatarPreviewUrl ? (
                  <div className="w-16 h-16 rounded-full overflow-hidden ring-2 ring-neutral-200 dark:ring-neutral-700 bg-neutral-100 dark:bg-neutral-800">
                    <img
                      src={avatarPreviewUrl}
                      alt="Voice preview"
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <CharacterAvatar
                    name={watchName || "Voice"}
                    gender={watchGender}
                    size={64}
                    className="w-16 h-16"
                  />
                )}

                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  className="absolute inset-0 rounded-full bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                  title="Change avatar"
                >
                  <RiImageAddLine className="h-5 w-5" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                className="text-[10px] text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 cursor-pointer"
              >
                Change photo
              </button>

              <input
                ref={avatarInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={handleAvatarChange}
                className="hidden"
              />
            </div>

            {/* Inputs */}
            <div className="flex-1 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-neutral-800 dark:text-neutral-200 mb-1">
                  Voice Name <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Lord Ronald"
                  {...register("name")}
                  className={cn(
                    "w-full px-3 py-2 rounded-xl text-xs border bg-neutral-50/50 dark:bg-neutral-900/50 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 transition-colors",
                    errors.name
                      ? "border-destructive focus:ring-destructive"
                      : "border-neutral-200 dark:border-neutral-700 focus:ring-neutral-900 dark:focus:ring-white",
                  )}
                />
                {errors.name && (
                  <p className="text-[11px] text-destructive mt-1 font-medium">
                    {errors.name.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-800 dark:text-neutral-200 mb-1">
                  Gender Persona
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(["male", "female", "neutral"] as const).map((genderVal) => (
                    <label
                      key={genderVal}
                      className={cn(
                        "flex items-center justify-center py-1.5 px-3 rounded-xl border text-xs font-medium cursor-pointer transition-colors capitalize",
                        watchGender === genderVal
                          ? "bg-neutral-900 text-white border-neutral-900 dark:bg-white dark:text-neutral-900 dark:border-white shadow-2xs"
                          : "bg-neutral-50/50 dark:bg-neutral-900/40 text-neutral-600 dark:text-neutral-400 border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800",
                      )}
                    >
                      <input
                        type="radio"
                        value={genderVal}
                        {...register("gender")}
                        className="sr-only"
                      />
                      {genderVal}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Reference Transcript */}
          <div>
            <label className="block text-xs font-semibold text-neutral-800 dark:text-neutral-200 mb-1">
              Reference Transcript <span className="text-neutral-400 text-[11px] font-normal">(Optional)</span>
            </label>
            <textarea
              rows={2}
              placeholder="Spoken words in the audio clip."
              {...register("reference_text")}
              className="w-full px-3 py-2 rounded-xl text-xs border border-neutral-200 dark:border-neutral-700 bg-neutral-50/50 dark:bg-neutral-900/50 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-white transition-colors resize-none"
            />
          </div>

          {/* Scope Checkbox */}
          <label className="flex items-start gap-3 p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/60 dark:bg-neutral-900/40 cursor-pointer select-none hover:bg-neutral-100/60 dark:hover:bg-neutral-900/60 transition-colors">
            <input
              type="checkbox"
              {...register("is_global")}
              className="mt-0.5 h-4 w-4 rounded border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-white focus:ring-0 cursor-pointer"
            />
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
                <RiGlobalLine className="h-3.5 w-3.5 text-blue-500" />
                Make available globally across all projects
              </span>
              <span className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 leading-normal">
                When checked, this voice clone can be assigned to characters in any of your novels. Uncheck to scope it exclusively to this project.
              </span>
            </div>
          </label>

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-xl text-xs font-semibold bg-neutral-900 text-white dark:bg-white dark:text-neutral-950 hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shadow-2xs"
            >
              {isSubmitting ? (
                <>
                  <RiLoader4Line className="h-3.5 w-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>Save Changes</span>
              )}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default EditVoiceDialog;
