import { useState } from "react";
import {
  RiHardDrive2Line,
  RiFlashlightLine,
  RiTimerLine,
  RiCloudLine,
  RiCheckLine,
  RiLoader4Line,
} from "@remixicon/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface ModelCacheModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modelId: string;
  modelName: string;
  sizeMb: number;
  kaggleAccountUsername?: string | null;
  onConfirm: (options: { cacheToDataset: boolean }) => Promise<void> | void;
}

export function ModelCacheModal({
  open,
  onOpenChange,
  modelName,
  sizeMb,
  kaggleAccountUsername,
  onConfirm,
}: ModelCacheModalProps) {
  const [cacheToDataset, setCacheToDataset] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const formattedSize =
    sizeMb >= 1000 ? `${(sizeMb / 1024).toFixed(1)} GB` : `${sizeMb} MB`;

  const handleExecute = async () => {
    setIsSubmitting(true);
    try {
      await onConfirm({ cacheToDataset });
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 overflow-hidden rounded-2xl border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#0f1013] shadow-2xl">
        <div className="p-6 pb-4">
          <DialogHeader className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="h-6 w-6 rounded-lg flex items-center justify-center text-xs font-mono font-bold bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900">
                <RiFlashlightLine className="h-3.5 w-3.5" />
              </span>
              <DialogTitle className="text-lg font-bold font-serif text-neutral-900 dark:text-neutral-100 tracking-tight">
                Voice Engine Setup: {modelName}
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-neutral-500 dark:text-neutral-400">
              This model ({formattedSize}) is not yet cached in{" "}
              {kaggleAccountUsername ? `@${kaggleAccountUsername}'s ` : "your "}
              Kaggle dataset storage. Choose how to run this generation:
            </DialogDescription>
          </DialogHeader>

          <div className="mt-5 space-y-3">
            {/* Option A: Cache to Dataset (Default / Recommended) */}
            <div
              onClick={() => setCacheToDataset(true)}
              className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer relative ${
                cacheToDataset
                  ? "border-neutral-900 dark:border-white bg-neutral-50/80 dark:bg-white/[0.04] shadow-2xs"
                  : "border-neutral-200/80 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700 bg-white dark:bg-transparent"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <div
                    className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                      cacheToDataset
                        ? "border-neutral-900 dark:border-white bg-neutral-900 dark:bg-white text-white dark:text-neutral-900"
                        : "border-neutral-300 dark:border-neutral-700"
                    }`}
                  >
                    {cacheToDataset && <RiCheckLine className="w-2.5 h-2.5 stroke-3" />}
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                        Save to Kaggle Dataset
                      </span>
                      <span className="text-[10px] font-mono font-medium px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/60">
                        Recommended · Instant Boot
                      </span>
                    </div>
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
                      Caches model weights cloud-to-cloud. All future chapters start in{" "}
                      <strong className="text-neutral-700 dark:text-neutral-200 font-medium">
                        &lt; 1 second
                      </strong>{" "}
                      with zero wasted GPU quota. Uses ~{formattedSize} of your 200 GB free Kaggle storage.
                    </p>
                  </div>
                </div>
              </div>
              <div className="mt-2.5 pl-6.5 flex items-center gap-3 text-[10px] text-neutral-400 font-mono">
                <span className="flex items-center gap-1">
                  <RiHardDrive2Line className="w-3 h-3 text-neutral-500" />
                  ~{formattedSize} / 200 GB free
                </span>
                <span>·</span>
                <span className="flex items-center gap-1">
                  <RiCloudLine className="w-3 h-3 text-neutral-500" />
                  0 MB laptop bandwidth
                </span>
              </div>
            </div>

            {/* Option B: Ephemeral Single-Run */}
            <div
              onClick={() => setCacheToDataset(false)}
              className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer relative ${
                !cacheToDataset
                  ? "border-neutral-900 dark:border-white bg-neutral-50/80 dark:bg-white/[0.04] shadow-2xs"
                  : "border-neutral-200/80 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700 bg-white dark:bg-transparent"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <div
                    className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                      !cacheToDataset
                        ? "border-neutral-900 dark:border-white bg-neutral-900 dark:bg-white text-white dark:text-neutral-900"
                        : "border-neutral-300 dark:border-neutral-700"
                    }`}
                  >
                    {!cacheToDataset && <RiCheckLine className="w-2.5 h-2.5 stroke-3" />}
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                        Ephemeral Single-Run
                      </span>
                      <span className="text-[10px] font-mono font-medium px-1.5 py-0.2 rounded bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                        One-Off
                      </span>
                    </div>
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
                      Downloads model inside the GPU container just for this session. Uses{" "}
                      <strong className="text-neutral-700 dark:text-neutral-200 font-medium">
                        0 GB
                      </strong>{" "}
                      dataset storage, but burns ~1–2 minutes of your weekly GPU quota downloading weights.
                    </p>
                  </div>
                </div>
              </div>
              <div className="mt-2.5 pl-6.5 flex items-center gap-3 text-[10px] text-neutral-400 font-mono">
                <span className="flex items-center gap-1">
                  <RiTimerLine className="w-3 h-3 text-neutral-500" />
                  ~1–2 min GPU overhead
                </span>
                <span>·</span>
                <span className="flex items-center gap-1">
                  <RiHardDrive2Line className="w-3 h-3 text-neutral-500" />
                  0 GB dataset storage used
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-neutral-50/60 dark:bg-neutral-950/60 border-t border-neutral-100 dark:border-neutral-800/80 flex items-center justify-between">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleExecute}
            disabled={isSubmitting}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 text-xs font-semibold hover:opacity-90 active:scale-95 disabled:opacity-50 transition-all cursor-pointer shadow-2xs"
          >
            {isSubmitting ? (
              <>
                <RiLoader4Line className="w-3.5 h-3.5 animate-spin" />
                <span>Dispatching...</span>
              </>
            ) : (
              <span>Proceed to Generate</span>
            )}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
