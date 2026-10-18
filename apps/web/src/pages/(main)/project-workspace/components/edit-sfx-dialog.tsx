import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  RiEditLine,
  RiGlobalLine,
  RiLoader4Line,
  RiVolumeUpLine,
} from "@remixicon/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { updateSFXItem } from "@/services/sfx";
import type { SFXItem } from "@novelova/shared-types";
import { cn } from "@/lib/utils";

const editSFXSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name cannot exceed 100 characters"),
  category: z.enum(["foley", "atmosphere"]),
  is_global: z.boolean(),
  default_volume: z.number().min(0.05).max(1.0),
});

type EditSFXFormData = z.infer<typeof editSFXSchema>;

export interface EditSFXDialogProps {
  item: SFXItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSFXUpdated: (item: SFXItem) => void;
}

export function EditSFXDialog({
  item,
  open,
  onOpenChange,
  onSFXUpdated,
}: EditSFXDialogProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EditSFXFormData>({
    resolver: zodResolver(editSFXSchema),
    defaultValues: {
      name: item?.name || "",
      category: item?.category || "foley",
      is_global: item?.is_global ?? true,
      default_volume: item?.default_volume ?? 1.0,
    },
  });

  useEffect(() => {
    if (item) {
      reset({
        name: item.name,
        category: item.category,
        is_global: item.is_global,
        default_volume: item.default_volume,
      });
    }
  }, [item, reset]);

  const watchCategory = watch("category");
  const watchVolume = watch("default_volume");

  const onSubmit = async (data: EditSFXFormData) => {
    if (!item) return;

    try {
      const formData = new FormData();
      formData.append("name", data.name);
      formData.append("category", data.category);
      formData.append("is_global", String(data.is_global));
      formData.append("default_volume", String(data.default_volume));

      const updated = await updateSFXItem(item.id, formData);
      onSFXUpdated(updated);
      onOpenChange(false);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to update sound effect");
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
                Edit Sound Effect
              </DialogTitle>
              <p className="text-xs text-neutral-400 dark:text-neutral-500">
                Update label, default playback volume, or project scoping
              </p>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-5">
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
              placeholder="e.g. Heavy Explosion, Ocean Waves"
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
                When checked, you can insert this sound effect into any of your novels. Uncheck to scope it exclusively to this project.
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

export default EditSFXDialog;
