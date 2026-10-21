import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  RiVolumeUpLine,
  RiLoader4Line,
  RiSoundModuleLine,
} from "@remixicon/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { updateSFXItem } from "@/services/sfx";
import type { SFXCategory, SFXItem } from "@novelova/shared-types";
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

  const handleSelectCategory = (cat: SFXCategory) => {
    setValue("category", cat);
  };

  const onSubmit = async (data: EditSFXFormData) => {
    if (!item) return;

    try {
      const formData = new FormData();
      formData.append("name", data.name.trim());
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
      <DialogContent className="sm:max-w-lg p-0 gap-0 rounded-2xl border border-neutral-200/80 dark:border-white/[0.08] bg-white dark:bg-[#0c0d10] shadow-2xl overflow-hidden">
        {/* Header */}
        <DialogHeader className="h-14 px-5 flex flex-row items-center justify-between border-b border-neutral-200/80 dark:border-white/[0.08] space-y-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 flex items-center justify-center shrink-0 border border-neutral-200/60 dark:border-white/[0.06]">
              <RiSoundModuleLine className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                Edit Sound Effect
              </DialogTitle>
              <p className="text-[11px] text-neutral-400 dark:text-neutral-500">
                Update sound parameters, default volume, or project scoping
              </p>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
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
              placeholder="e.g. Heavy Explosion, Ocean Waves"
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

          {/* Actions */}
          <div className="pt-3 border-t border-neutral-200/80 dark:border-white/[0.08] flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
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
