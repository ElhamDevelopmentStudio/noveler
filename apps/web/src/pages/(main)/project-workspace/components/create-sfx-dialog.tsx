import { useState, useRef, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  RiVolumeUpLine,
  RiUpload2Line,
  RiPlayFill,
  RiPauseFill,
  RiInformationLine,
  RiLoader4Line,
  RiCloseLine,
  RiSoundModuleLine,
} from "@remixicon/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createSFXItem } from "@/services/sfx";
import type { SFXCategory, SFXItem } from "@novelova/shared-types";
import { cn } from "@/lib/utils";

const sfxFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name cannot exceed 100 characters"),
  category: z.enum(["foley", "atmosphere"]),
  is_global: z.boolean(),
  default_volume: z.number().min(0.05).max(1.0),
});

type SFXFormData = z.infer<typeof sfxFormSchema>;

export interface CreateSFXDialogProps {
  projectId: string;
  defaultCategory?: SFXCategory;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSFXCreated: (item: SFXItem) => void;
}

export function CreateSFXDialog({
  projectId,
  defaultCategory = "foley",
  open,
  onOpenChange,
  onSFXCreated,
}: CreateSFXDialogProps) {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioDuration, setAudioDuration] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<SFXFormData>({
    resolver: zodResolver(sfxFormSchema),
    defaultValues: {
      name: "",
      category: defaultCategory,
      is_global: true,
      default_volume: defaultCategory === "atmosphere" ? 0.2 : 1.0,
    },
  });

  const watchCategory = watch("category");
  const watchVolume = watch("default_volume");

  // Sync category when prop changes
  useEffect(() => {
    if (open) {
      setValue("category", defaultCategory);
      setValue("default_volume", defaultCategory === "atmosphere" ? 0.2 : 1.0);
    }
  }, [open, defaultCategory, setValue]);

  // Adjust volume default when category switches
  const handleSelectCategory = (cat: SFXCategory) => {
    setValue("category", cat);
    if (cat === "atmosphere") {
      setValue("default_volume", 0.2);
    } else {
      setValue("default_volume", 1.0);
    }
  };

  // Clean up object URLs
  useEffect(() => {
    return () => {
      if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
    };
  }, [audioPreviewUrl]);

  const handleAudioChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
    const url = URL.createObjectURL(file);
    setAudioFile(file);
    setAudioPreviewUrl(url);
    setIsPlayingAudio(false);
    setFormError(null);

    // Auto-fill name if empty
    const currentName = watch("name");
    if (!currentName) {
      const cleanName = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
      setValue("name", cleanName.charAt(0).toUpperCase() + cleanName.slice(1));
    }

    const tempAudio = new Audio(url);
    tempAudio.onloadedmetadata = () => {
      if (isFinite(tempAudio.duration)) {
        setAudioDuration(Math.round(tempAudio.duration * 10) / 10);
      }
    };
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
      audioRef.current.volume = watchVolume;
      audioRef.current.play().catch(() => setIsPlayingAudio(false));
      setIsPlayingAudio(true);
    }
  };

  const onSubmit = async (data: SFXFormData) => {
    if (!audioFile) {
      setFormError("Please select an audio file (.wav, .mp3, .m4a)");
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const formData = new FormData();
      formData.append("name", data.name.trim());
      formData.append("category", data.category);
      formData.append("is_global", String(data.is_global));
      formData.append("default_volume", String(data.default_volume));
      if (!data.is_global && projectId) {
        formData.append("project_id", projectId);
      }
      formData.append("audio_file", audioFile);

      const created = await createSFXItem(formData);
      onSFXCreated(created);
      handleClose();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to upload sound effect");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (isPlayingAudio && audioRef.current) {
      audioRef.current.pause();
    }
    removeAudio();
    reset();
    setFormError(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg p-0 gap-0 rounded-2xl border border-neutral-200/80 dark:border-white/[0.08] bg-white dark:bg-[#0c0d10] shadow-2xl overflow-hidden">
        {/* Dialog Header */}
        <DialogHeader className="h-14 px-5 flex flex-row items-center justify-between border-b border-neutral-200/80 dark:border-white/[0.08] space-y-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 flex items-center justify-center shrink-0 border border-neutral-200/60 dark:border-white/[0.06]">
              <RiSoundModuleLine className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                New Sound Effect
              </DialogTitle>
              <p className="text-[11px] text-neutral-400 dark:text-neutral-500">
                Import an audio cue or background atmosphere track
              </p>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
          {formError && (
            <div className="p-2.5 rounded-lg bg-destructive/10 text-destructive text-xs font-medium border border-destructive/20 flex items-start gap-2">
              <RiInformationLine className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          {/* Sound Type Segmented Switcher */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
              Sound Type
            </label>
            <div className="grid grid-cols-2 p-1 rounded-xl bg-neutral-100 dark:bg-neutral-900/80 border border-neutral-200/80 dark:border-white/[0.06] text-xs">
              <button
                type="button"
                onClick={() => handleSelectCategory("foley")}
                className={cn(
                  "py-1.5 px-3 rounded-lg text-xs font-medium transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5",
                  watchCategory === "foley"
                    ? "bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white shadow-2xs font-semibold"
                    : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200",
                )}
              >
                <span>Foley Cue</span>
                <span className="text-[10px] font-normal opacity-60">Spot action & impact sound</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectCategory("atmosphere")}
                className={cn(
                  "py-1.5 px-3 rounded-lg text-xs font-medium transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5",
                  watchCategory === "atmosphere"
                    ? "bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white shadow-2xs font-semibold"
                    : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200",
                )}
              >
                <span>Atmosphere</span>
                <span className="text-[10px] font-normal opacity-60">Continuous room tone & ambient bed</span>
              </button>
            </div>
          </div>

          {/* Sound Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300 flex items-center justify-between">
              <span>Name</span>
              <span className="text-[10px] text-neutral-400">Required</span>
            </label>
            <input
              type="text"
              placeholder={
                watchCategory === "foley"
                  ? "e.g. Sword Clash, Metal Clank, Footstep"
                  : "e.g. Ocean Waves, Tavern Chatter, Rainy Night"
              }
              {...register("name")}
              className={cn(
                "w-full px-3 py-2 rounded-lg text-xs border bg-neutral-50/50 dark:bg-neutral-900/50 text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-1 transition-colors",
                errors.name
                  ? "border-destructive focus:ring-destructive"
                  : "border-neutral-200/80 dark:border-white/[0.08] focus:ring-neutral-900 dark:focus:ring-white",
              )}
            />
            {errors.name && (
              <p className="text-[11px] text-destructive font-medium">
                {errors.name.message}
              </p>
            )}
          </div>

          {/* Audio Upload */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300 flex items-center justify-between">
              <span>Audio File</span>
              <span className="text-[10px] font-mono text-neutral-400">WAV · MP3 · M4A · OGG (Max 25MB)</span>
            </label>

            {!audioFile ? (
              <div
                onClick={() => audioInputRef.current?.click()}
                className="border border-dashed border-neutral-300 dark:border-neutral-700/80 hover:border-neutral-500 dark:hover:border-neutral-500 rounded-xl p-4 flex items-center justify-center gap-3 cursor-pointer transition-colors bg-neutral-50/30 dark:bg-white/[0.01] hover:bg-neutral-50 dark:hover:bg-white/[0.03]"
              >
                <div className="w-8 h-8 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 flex items-center justify-center shrink-0">
                  <RiUpload2Line className="h-4 w-4" />
                </div>
                <div className="text-left">
                  <span className="text-xs font-medium text-neutral-900 dark:text-neutral-100">
                    Click to browse or drop audio
                  </span>
                  <p className="text-[10.5px] text-neutral-400 dark:text-neutral-500">
                    Lossless WAV or high-bitrate MP3 recommended
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-2.5 rounded-xl border border-neutral-200/80 dark:border-white/[0.08] bg-neutral-50/60 dark:bg-white/[0.03] flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <button
                    type="button"
                    onClick={toggleAudioPlay}
                    className="w-7 h-7 rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-950 flex items-center justify-center shrink-0 hover:opacity-90 transition-opacity cursor-pointer shadow-2xs"
                    title={isPlayingAudio ? "Pause" : "Play audition"}
                  >
                    {isPlayingAudio ? (
                      <RiPauseFill className="h-3.5 w-3.5 fill-current" />
                    ) : (
                      <RiPlayFill className="h-3.5 w-3.5 fill-current ml-0.5" />
                    )}
                  </button>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-neutral-900 dark:text-neutral-100 truncate">
                      {audioFile.name}
                    </p>
                    <p className="text-[10px] font-mono text-neutral-400 dark:text-neutral-500">
                      {(audioFile.size / (1024 * 1024)).toFixed(2)} MB
                      {audioDuration ? ` · ${audioDuration}s` : ""}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={removeAudio}
                  className="p-1 rounded-md text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-200/60 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                  title="Remove file"
                >
                  <RiCloseLine className="h-4 w-4" />
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

          {/* Default Playback Volume */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between text-xs">
              <label className="font-medium text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
                <RiVolumeUpLine className="h-3.5 w-3.5 text-neutral-400" />
                <span>Default Volume</span>
              </label>
              <span className="font-mono text-[11px] text-neutral-500 dark:text-neutral-400">
                {Math.round(watchVolume * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0.05"
              max="1.0"
              step="0.05"
              value={watchVolume}
              onChange={(e) => setValue("default_volume", parseFloat(e.target.value))}
              className="w-full accent-neutral-900 dark:accent-neutral-100 h-1 bg-neutral-200 dark:bg-neutral-800 rounded-lg cursor-pointer"
            />
          </div>

          {/* Scope Checkbox */}
          <div className="pt-1">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                {...register("is_global")}
                className="h-3.5 w-3.5 rounded border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-white focus:ring-0 cursor-pointer"
              />
              <span className="text-xs text-neutral-700 dark:text-neutral-300 font-medium">
                Available across all projects
              </span>
            </label>
            <p className="text-[10.5px] text-neutral-400 dark:text-neutral-500 pl-5.5 mt-0.5">
              Uncheck to keep this sound effect exclusive to this project
            </p>
          </div>

          {/* Actions Footer */}
          <div className="pt-3 border-t border-neutral-200/80 dark:border-white/[0.08] flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/[0.05] transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-neutral-900 text-white dark:bg-white dark:text-neutral-950 hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shadow-2xs"
            >
              {isSubmitting ? (
                <>
                  <RiLoader4Line className="h-3.5 w-3.5 animate-spin" />
                  <span>Uploading...</span>
                </>
              ) : (
                <span>Upload Sound</span>
              )}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default CreateSFXDialog;
