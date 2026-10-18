import { useState, useRef, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  RiSparkling2Line,
  RiUploadCloud2Line,
  RiPlayFill,
  RiPauseFill,
  RiGlobalLine,
  RiDeleteBinLine,
  RiInformationLine,
  RiLoader4Line,
  RiVolumeUpLine,
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

  // Adjust volume default when category changes
  useEffect(() => {
    if (watchCategory === "atmosphere") {
      setValue("default_volume", 0.2);
    } else {
      setValue("default_volume", 1.0);
    }
  }, [watchCategory, setValue]);

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
      audioRef.current.play();
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
      formData.append("name", data.name);
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
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto p-0 gap-0 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#0c0d10] shadow-2xl">
        <DialogHeader className="p-6 pb-4 border-b border-neutral-200/80 dark:border-neutral-800 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-900 dark:text-neutral-100 shadow-2xs">
              <RiSparkling2Line className="h-4.5 w-4.5" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                New Sound Effect
              </DialogTitle>
              <p className="text-xs text-neutral-400 dark:text-neutral-500">
                Upload Foley action sounds or atmospheric background beds
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

          {/* Category Selector */}
          <div>
            <label className="block text-xs font-semibold text-neutral-800 dark:text-neutral-200 mb-1.5">
              Sound Type
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label
                className={cn(
                  "p-3 rounded-xl border cursor-pointer transition-colors flex flex-col gap-1 select-none",
                  watchCategory === "foley"
                    ? "bg-neutral-900 text-white border-neutral-900 dark:bg-white dark:text-neutral-950 dark:border-white shadow-2xs"
                    : "bg-neutral-50/60 dark:bg-neutral-900/40 text-neutral-600 dark:text-neutral-400 border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-800",
                )}
              >
                <input
                  type="radio"
                  value="foley"
                  {...register("category")}
                  className="sr-only"
                />
                <span className="text-xs font-semibold flex items-center gap-1.5">
                  <span>💥</span> Foley / Action Cue
                </span>
                <span
                  className={cn(
                    "text-[11px] leading-relaxed",
                    watchCategory === "foley"
                      ? "text-neutral-300 dark:text-neutral-600"
                      : "text-neutral-400 dark:text-neutral-500",
                  )}
                >
                  Onomatopoeia, explosions, clanks, footsteps, door slams.
                </span>
              </label>

              <label
                className={cn(
                  "p-3 rounded-xl border cursor-pointer transition-colors flex flex-col gap-1 select-none",
                  watchCategory === "atmosphere"
                    ? "bg-neutral-900 text-white border-neutral-900 dark:bg-white dark:text-neutral-950 dark:border-white shadow-2xs"
                    : "bg-neutral-50/60 dark:bg-neutral-900/40 text-neutral-600 dark:text-neutral-400 border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-800",
                )}
              >
                <input
                  type="radio"
                  value="atmosphere"
                  {...register("category")}
                  className="sr-only"
                />
                <span className="text-xs font-semibold flex items-center gap-1.5">
                  <span>🌊</span> Atmosphere (Ambience)
                </span>
                <span
                  className={cn(
                    "text-[11px] leading-relaxed",
                    watchCategory === "atmosphere"
                      ? "text-neutral-300 dark:text-neutral-600"
                      : "text-neutral-400 dark:text-neutral-500",
                  )}
                >
                  Continuous environmental beds (rain, ocean waves, tavern).
                </span>
              </label>
            </div>
          </div>

          {/* Sound Name */}
          <div>
            <label className="block text-xs font-semibold text-neutral-800 dark:text-neutral-200 mb-1">
              Sound Name <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              placeholder={
                watchCategory === "foley"
                  ? "e.g. Heavy Explosion, Metal Clank, Sword Clash"
                  : "e.g. Ocean Waves & Wind, Rainy Tavern, Night Forest"
              }
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

          {/* Audio Upload */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-neutral-800 dark:text-neutral-200">
              Audio File <span className="text-destructive">*</span>
            </label>

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
                    title={isPlayingAudio ? "Pause" : "Play sample"}
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
                      {audioDuration ? ` · ~${audioDuration}s` : ""}
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

          {/* Default Volume Slider */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 flex items-center gap-1.5">
                <RiVolumeUpLine className="h-3.5 w-3.5" />
                Default Playback Volume
              </label>
              <span className="text-xs font-mono font-medium text-neutral-600 dark:text-neutral-300">
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
              className="w-full accent-neutral-900 dark:accent-neutral-100 h-1.5 bg-neutral-200 dark:bg-neutral-800 rounded-lg cursor-pointer"
            />
            <p className="text-[11px] text-neutral-400 dark:text-neutral-500">
              {watchCategory === "atmosphere"
                ? "Recommended 15%–25% so spoken lines stay clear and audible over ambient beds."
                : "Standard volume for punchy spot sound effects."}
            </p>
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
                When checked, you can insert this sound effect into any of your novels. Uncheck to scope it exclusively to this project.
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
                  <span>Uploading sound...</span>
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
