import { useEffect, useState } from "react";
import type { EmotionProfile } from "@novelova/shared-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RiAlertLine, RiEmotionLine, RiRestartLine } from "@remixicon/react";

const EMOTION_DIMENSIONS = [
  { key: "happy", label: "Happy", color: "accent-amber-500", dot: "bg-amber-500" },
  { key: "angry", label: "Angry", color: "accent-rose-500", dot: "bg-rose-500" },
  { key: "sad", label: "Sad", color: "accent-blue-500", dot: "bg-blue-500" },
  { key: "afraid", label: "Afraid", color: "accent-purple-500", dot: "bg-purple-500" },
  { key: "disgusted", label: "Disgusted", color: "accent-lime-600", dot: "bg-lime-600" },
  { key: "melancholic", label: "Melancholic", color: "accent-indigo-500", dot: "bg-indigo-500" },
  { key: "surprised", label: "Surprised", color: "accent-cyan-500", dot: "bg-cyan-500" },
  { key: "calm", label: "Calm", color: "accent-emerald-500", dot: "bg-emerald-500" },
] as const;

const EMOTION_PRESETS: Array<{ name: string; profile: EmotionProfile }> = [
  {
    name: "Calm",
    profile: {
      label: "calm_steady",
      vector: [0, 0, 0, 0, 0, 0, 0, 0.6],
      emo_alpha: 0.45,
      duration_factor: 1.0,
    },
  },
  {
    name: "Quiet Grief",
    profile: {
      label: "quiet_sorrow",
      vector: [0, 0, 0.6, 0, 0, 0.55, 0, 0.2],
      emo_alpha: 0.66,
      duration_factor: 1.08,
    },
  },
  {
    name: "Bitter Anger",
    profile: {
      label: "bitter_anger",
      vector: [0, 0.68, 0.15, 0, 0.2, 0, 0, 0.1],
      emo_alpha: 0.68,
      duration_factor: 0.96,
    },
  },
  {
    name: "Fierce Resolve",
    profile: {
      label: "fierce_resolve",
      vector: [0, 0.48, 0, 0, 0, 0, 0, 0.4],
      emo_alpha: 0.64,
      duration_factor: 0.99,
    },
  },
  {
    name: "Warm Smile",
    profile: {
      label: "warm_gentle",
      vector: [0.3, 0, 0, 0, 0, 0.15, 0, 0.5],
      emo_alpha: 0.52,
      duration_factor: 1.03,
    },
  },
  {
    name: "Shock / Horror",
    profile: {
      label: "horrified_shock",
      vector: [0, 0, 0.25, 0.6, 0, 0, 0.55, 0],
      emo_alpha: 0.72,
      duration_factor: 1.05,
    },
  },
  {
    name: "Exhausted",
    profile: {
      label: "exhausted_tired",
      vector: [0, 0, 0.35, 0, 0, 0.55, 0, 0.3],
      emo_alpha: 0.58,
      duration_factor: 1.1,
    },
  },
];

function getDominantStyle(profile: EmotionProfile | null | undefined): {
  badgeClass: string;
  dominantName: string;
} {
  if (!profile || !Array.isArray(profile.vector) || profile.vector.length < 8) {
    return {
      badgeClass:
        "bg-neutral-100/70 text-neutral-500 border-neutral-200/70 dark:bg-neutral-800/50 dark:text-neutral-400 dark:border-neutral-700/60",
      dominantName: "neutral",
    };
  }
  let maxIdx = 7;
  let maxVal = -1;
  for (let i = 0; i < 8; i++) {
    if ((profile.vector[i] ?? 0) > maxVal) {
      maxVal = profile.vector[i] ?? 0;
      maxIdx = i;
    }
  }
  const styles: Record<number, string> = {
    0: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/25",
    1: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/25",
    2: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/25",
    3: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/25",
    4: "bg-lime-500/10 text-lime-700 dark:text-lime-300 border-lime-500/25",
    5: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/25",
    6: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/25",
    7: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25",
  };
  return {
    badgeClass: styles[maxIdx] ?? styles[7],
    dominantName: EMOTION_DIMENSIONS[maxIdx]?.label ?? "Calm",
  };
}

function makeDefaultProfile(isNarration: boolean): EmotionProfile {
  return {
    label: isNarration ? "somber_calm" : "calm_steady",
    vector: [0, 0, 0, 0, 0, 0, 0, 0.5],
    emo_alpha: isNarration ? 0.28 : 0.55,
    duration_factor: 1.0,
  };
}

interface EmotionProfilePopoverProps {
  profile: EmotionProfile | null | undefined;
  isNarration?: boolean;
  onSave: (profile: EmotionProfile | null) => Promise<void> | void;
}

export function EmotionProfilePopover({
  profile,
  isNarration = false,
  onSave,
}: EmotionProfilePopoverProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<EmotionProfile>(
    () => profile ?? makeDefaultProfile(isNarration),
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(
        profile
          ? {
              label: profile.label || "neutral",
              vector:
                Array.isArray(profile.vector) && profile.vector.length === 8
                  ? [...profile.vector]
                  : [0, 0, 0, 0, 0, 0, 0, 0.5],
              emo_alpha: profile.emo_alpha ?? (isNarration ? 0.28 : 0.55),
              duration_factor: profile.duration_factor ?? 1.0,
            }
          : makeDefaultProfile(isNarration),
      );
    }
  }, [open, profile, isNarration]);

  const { badgeClass } = getDominantStyle(profile);
  const happyWarning = (draft.vector[0] ?? 0) > 0.45;
  const formattedLabel = profile?.label
    ? profile.label.replace(/_/g, " ")
    : null;

  const updateDimension = (idx: number, val: number) => {
    setDraft((prev) => {
      const nextVec = [...prev.vector];
      nextVec[idx] = Number(val.toFixed(2));
      return { ...prev, vector: nextVec };
    });
  };

  const applySafeClamp = () => {
    setDraft((prev) => {
      const nextVec = [...prev.vector];
      if ((nextVec[0] ?? 0) > 0.45) nextVec[0] = 0.45;
      if ((nextVec[0] ?? 0) > 0.2 && (nextVec[7] ?? 0) < 0.35) {
        nextVec[7] = 0.35;
      }
      const alphaMax = isNarration ? 0.35 : 0.75;
      const alphaMin = isNarration ? 0.2 : 0.35;
      const nextAlpha = Math.max(alphaMin, Math.min(alphaMax, prev.emo_alpha));
      return {
        ...prev,
        vector: nextVec,
        emo_alpha: Number(nextAlpha.toFixed(2)),
      };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        label: (draft.label || "neutral").trim().replace(/\s+/g, "_").toLowerCase(),
        vector: draft.vector.map((v) => Number(Math.max(0, Math.min(1, v)).toFixed(2))),
        emo_alpha: Number(Math.max(0, Math.min(1, draft.emo_alpha)).toFixed(2)),
        duration_factor: Number(
          Math.max(0.85, Math.min(1.15, draft.duration_factor)).toFixed(2),
        ),
      });
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    try {
      await onSave(null);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border transition-colors cursor-pointer select-none ${
            profile
              ? badgeClass
              : "opacity-0 group-hover:opacity-100 focus:opacity-100 bg-neutral-100/80 text-neutral-500 border-neutral-200/80 dark:bg-neutral-800/60 dark:text-neutral-400 dark:border-neutral-700/60 hover:text-foreground"
          }`}
          title={
            profile
              ? `Emotion: ${formattedLabel} (alpha ${profile.emo_alpha.toFixed(2)}, pace ${profile.duration_factor.toFixed(2)}x) — Click to inspect & edit 8-vector`
              : "Set 8-vector emotion profile (IndexTTS 2.5)"
          }
        >
          <RiEmotionLine className="h-3 w-3 shrink-0" />
          {profile ? (
            <>
              <span className="max-w-[110px] truncate">{formattedLabel}</span>
              <span className="font-mono opacity-75">
                {profile.emo_alpha.toFixed(2)}
              </span>
            </>
          ) : (
            <span>emotion</span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-80 p-3 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold text-foreground">
              8-Vector Emotion Director
            </p>
            <p className="text-[10px] text-muted-foreground">
              IndexTTS 2.5 timbre-disentangled acting controls
            </p>
          </div>
          {profile && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-destructive"
              onClick={handleClear}
              disabled={saving}
              title="Clear emotion profile"
            >
              <RiRestartLine className="h-3 w-3 mr-1" />
              Reset
            </Button>
          )}
        </div>

        {/* Presets */}
        <div className="flex flex-wrap gap-1">
          {EMOTION_PRESETS.map((preset) => (
            <button
              key={preset.name}
              type="button"
              onClick={() =>
                setDraft({
                  ...preset.profile,
                  vector: [...preset.profile.vector],
                  emo_alpha: isNarration
                    ? Math.min(0.35, Math.max(0.2, preset.profile.emo_alpha * 0.5))
                    : preset.profile.emo_alpha,
                })
              }
              className="px-1.5 py-0.5 rounded text-[10px] bg-muted/70 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/60 transition-colors cursor-pointer"
            >
              {preset.name}
            </button>
          ))}
        </div>

        {/* Mood Label */}
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Mood Label</Label>
          <Input
            value={draft.label}
            onChange={(e) => setDraft((p) => ({ ...p, label: e.target.value }))}
            placeholder="e.g. bitter_frustrated"
            className="h-7 text-xs font-mono"
          />
        </div>

        {/* 8-Dimension Sliders */}
        <div className="space-y-1.5">
          {EMOTION_DIMENSIONS.map((dim, idx) => {
            const val = draft.vector[idx] ?? 0;
            return (
              <div key={dim.key} className="grid grid-cols-[76px_1fr_34px] items-center gap-2">
                <span className="flex items-center gap-1.5 text-[11px] text-foreground">
                  <span className={`h-1.5 w-1.5 rounded-full ${dim.dot}`} />
                  {dim.label}
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={val}
                  onChange={(e) => updateDimension(idx, parseFloat(e.target.value))}
                  className={`h-1.5 w-full cursor-pointer ${dim.color}`}
                />
                <span className="text-[10px] font-mono text-right text-muted-foreground">
                  {val.toFixed(2)}
                </span>
              </div>
            );
          })}
        </div>

        {happyWarning && (
          <div className="flex items-center justify-between gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[10px] text-amber-700 dark:text-amber-300">
            <span className="flex items-center gap-1">
              <RiAlertLine className="h-3.5 w-3.5 shrink-0" />
              Happy &gt; 0.45 can sound strained in English.
            </span>
            <button
              type="button"
              onClick={applySafeClamp}
              className="underline font-medium shrink-0 cursor-pointer"
            >
              Clamp safe
            </button>
          </div>
        )}

        {/* Intensity & Pacing */}
        <div className="grid grid-cols-2 gap-3 pt-1 border-t border-border/60">
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-muted-foreground">Intensity (α)</span>
              <span className="font-mono text-foreground">
                {draft.emo_alpha.toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={draft.emo_alpha}
              onChange={(e) =>
                setDraft((p) => ({
                  ...p,
                  emo_alpha: parseFloat(e.target.value),
                }))
              }
              className="h-1.5 w-full cursor-pointer accent-primary"
            />
            <p className="text-[9px] text-muted-foreground">
              {isNarration ? "Rec: 0.20–0.35" : "Rec: 0.35–0.75"}
            </p>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-muted-foreground">Pacing</span>
              <span className="font-mono text-foreground">
                {draft.duration_factor.toFixed(2)}x
              </span>
            </div>
            <input
              type="range"
              min={0.85}
              max={1.15}
              step={0.01}
              value={draft.duration_factor}
              onChange={(e) =>
                setDraft((p) => ({
                  ...p,
                  duration_factor: parseFloat(e.target.value),
                }))
              }
              className="h-1.5 w-full cursor-pointer accent-primary"
            />
            <p className="text-[9px] text-muted-foreground">
              &lt;1 faster · &gt;1 slower
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-1.5 pt-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-7 text-xs"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving..." : "Apply Emotion"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
