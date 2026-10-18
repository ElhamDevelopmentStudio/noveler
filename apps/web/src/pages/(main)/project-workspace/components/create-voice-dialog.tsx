import { useState, useRef, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  RiUploadCloud2Line,
  RiMicLine,
  RiPlayFill,
  RiPauseFill,
  RiGlobalLine,
  RiImageAddLine,
  RiDeleteBinLine,
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
import { createVoice } from "@/services/voices";
import type { Voice } from "@novelova/shared-types";
import { cn } from "@/lib/utils";

const voiceFormSchema = z.object({
  name: z.string().min(1, "Voice name is required").max(100, "Name cannot exceed 100 characters"),
  gender: z.enum(["male", "female", "neutral"]),
  is_global: z.boolean(),
  reference_text: z.string().max(2000, "Reference text cannot exceed 2000 characters").optional(),
});

type VoiceFormData = z.infer<typeof voiceFormSchema>;

export interface CreateVoiceDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onVoiceCreated: (voice: Voice) => void;
}

export function CreateVoiceDialog({
  projectId,
  open,
  onOpenChange,
  onVoiceCreated,
}: CreateVoiceDialogProps) {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioDuration, setAudioDuration] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<VoiceFormData>({
    resolver: zodResolver(voiceFormSchema),
    defaultValues: {
      name: "",
      gender: "neutral",
      is_global: true,
      reference_text: "",
    },
  });

  const watchName = watch("name");
  const watchGender = watch("gender");

  // Clean up object URLs on unmount / change
  useEffect(() => {
    return () => {
      if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
      if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
    };
  }, [audioPreviewUrl, avatarPreviewUrl]);

  // Handle audio selection
  const handleAudioChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
    const url = URL.createObjectURL(file);
    setAudioFile(file);
    setAudioPreviewUrl(url);
    setIsPlayingAudio(false);
    setFormError(null);

    // Measure duration
    const tempAudio = new Audio(url);
    tempAudio.onloadedmetadata = () => {
      if (isFinite(tempAudio.duration)) {
        setAudioDuration(Math.round(tempAudio.duration * 10) / 10);
      }
    };
  };

  // Handle avatar selection
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
    const url = URL.createObjectURL(file);
    setAvatarFile(file);
    setAvatarPreviewUrl(url);
  };

  const removeAvatar = () => {
    if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
    setAvatarFile(null);
    setAvatarPreviewUrl(null);
    if (avatarInputRef.current) avatarInputRef.current.value = "";
  };

  const removeAudio = () => {
    if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
    setAudioFile(null);
    setAudioPreviewUrl(null);
    setIsPlayingAudio(false);
    setAudioDuration(null);
    if (audioInputRef.current) audioInputRef.current.value = "";
  };

  const toggleAudioPlay = () => {
    if (!audioRef.current || !audioPreviewUrl) return;
    if (isPlayingAudio) {
      audioRef.current.pause();
      setIsPlayingAudio(false);
    } else {
      audioRef.current.play();
      setIsPlayingAudio(true);
    }
  };

  const onSubmit = async (data: VoiceFormData) => {
    if (!audioFile) {
      setFormError("Please select a reference audio file (.wav, .mp3, .m4a)");
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const formData = new FormData();
      formData.append("name", data.name);
      formData.append("gender", data.gender);
      formData.append("is_global", String(data.is_global));
      if (!data.is_global && projectId) {
        formData.append("project_id", projectId);
      }
      if (data.reference_text) {
        formData.append("reference_text", data.reference_text);
      }
      formData.append("audio_file", audioFile);
      if (avatarFile) {
        formData.append("avatar_file", avatarFile);
      }

      const createdVoice = await createVoice(formData);
      onVoiceCreated(createdVoice);
      handleClose();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to create voice clone");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (isPlayingAudio && audioRef.current) {
      audioRef.current.pause();
    }
    removeAudio();
    removeAvatar();
    reset();
    setFormError(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto p-0 gap-0 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#0c0d10] shadow-2xl">
        <DialogHeader className="p-6 pb-4 border-b border-neutral-200/80 dark:border-neutral-800 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-900 dark:text-neutral-100 shadow-2xs">
              <RiMicLine className="h-4.5 w-4.5" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                New Voice Clone
              </DialogTitle>
              <p className="text-xs text-neutral-400 dark:text-neutral-500">
                Upload a speech sample to clone for Chatterbox, CosyVoice, or VibeVoice
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
            {/* Avatar Uploader / Preview */}
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

                {/* Upload overlay */}
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  className="absolute inset-0 rounded-full bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                  title="Change avatar"
                >
                  <RiImageAddLine className="h-5 w-5" />
                </button>
              </div>

              {avatarPreviewUrl ? (
                <button
                  type="button"
                  onClick={removeAvatar}
                  className="text-[10px] text-destructive hover:underline cursor-pointer"
                >
                  Remove
                </button>
              ) : (
                <span className="text-[10px] text-neutral-400">Glass avatar</span>
              )}

              <input
                ref={avatarInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={handleAvatarChange}
                className="hidden"
              />
            </div>

            {/* Name & Gender inputs */}
            <div className="flex-1 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-neutral-800 dark:text-neutral-200 mb-1">
                  Voice Name <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Lord Ronald, British Storyteller, Clara"
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

          {/* Reference Audio Upload Section */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-neutral-800 dark:text-neutral-200">
              Reference Audio Sample <span className="text-destructive">*</span>
            </label>
            <p className="text-[11px] text-neutral-400 dark:text-neutral-500">
              Upload 5–30 seconds of clean, clear speech with minimal background noise.
            </p>

            {!audioFile ? (
              <div
                onClick={() => audioInputRef.current?.click()}
                className="border-2 border-dashed border-neutral-200 dark:border-neutral-800 hover:border-neutral-400 dark:hover:border-neutral-600 rounded-2xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors bg-neutral-50/30 dark:bg-neutral-900/20 group"
              >
                <div className="w-10 h-10 rounded-xl bg-neutral-100 dark:bg-neutral-800 group-hover:bg-neutral-200 dark:group-hover:bg-neutral-700 text-neutral-600 dark:text-neutral-300 flex items-center justify-center transition-colors">
                  <RiUploadCloud2Line className="h-5 w-5" />
                </div>
                <div className="text-center">
                  <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                    Click to select audio file
                  </span>
                  <p className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-0.5">
                    WAV, MP3, M4A, OGG, or FLAC (Max 25MB)
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50/70 dark:bg-neutral-900/60 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={toggleAudioPlay}
                    className="w-9 h-9 rounded-xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-950 flex items-center justify-center shrink-0 hover:opacity-90 transition-opacity cursor-pointer shadow-2xs"
                    title={isPlayingAudio ? "Pause sample" : "Play sample"}
                  >
                    {isPlayingAudio ? (
                      <RiPauseFill className="h-4.5 w-4.5" />
                    ) : (
                      <RiPlayFill className="h-4.5 w-4.5 translate-x-0.5" />
                    )}
                  </button>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                      {audioFile.name}
                    </p>
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                      {(audioFile.size / (1024 * 1024)).toFixed(2)} MB
                      {audioDuration ? ` · ~${audioDuration}s duration` : ""}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={removeAudio}
                  className="p-1.5 rounded-lg text-neutral-400 hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                  title="Remove file"
                >
                  <RiDeleteBinLine className="h-4 w-4" />
                </button>

                {audioPreviewUrl && (
                  <audio
                    ref={audioRef}
                    src={audioPreviewUrl}
                    onEnded={() => setIsPlayingAudio(false)}
                    className="hidden"
                  />
                )}
              </div>
            )}

            <input
              ref={audioInputRef}
              type="file"
              accept=".wav,.mp3,.m4a,.ogg,.flac,.aac"
              onChange={handleAudioChange}
              className="hidden"
            />
          </div>

          {/* Reference Transcript (Optional) */}
          <div>
            <label className="block text-xs font-semibold text-neutral-800 dark:text-neutral-200 mb-1">
              Reference Transcript <span className="text-neutral-400 text-[11px] font-normal">(Optional)</span>
            </label>
            <textarea
              rows={2}
              placeholder="Spoken words in the audio clip. Providing this improves zero-shot cloning accuracy for models like CosyVoice and F5-TTS."
              {...register("reference_text")}
              className="w-full px-3 py-2 rounded-xl text-xs border border-neutral-200 dark:border-neutral-700 bg-neutral-50/50 dark:bg-neutral-900/50 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-white transition-colors resize-none"
            />
          </div>

          {/* Scope Checkbox (Default checked) */}
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
              onClick={handleClose}
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
                  <span>Uploading sample...</span>
                </>
              ) : (
                <span>Create Voice</span>
              )}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default CreateVoiceDialog;
