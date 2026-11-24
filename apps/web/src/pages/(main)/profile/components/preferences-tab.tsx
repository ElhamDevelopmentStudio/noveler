import { useEffect, useState } from "react";
import { toast } from "sonner";
import { RiLoader4Line, RiSparklingLine } from "@remixicon/react";
import { useAuth } from "@/context/auth-context";
import { TTS_MODELS } from "@/lib/tts-models";
import { updateUserPreferences } from "@/services/auth";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";

export function PreferencesTab() {
  const { user, updateUser } = useAuth();
  const [ttsModel, setTtsModel] = useState(
    user?.preferred_tts_model || "chatterbox-turbo",
  );
  const [taggingStrategy, setTaggingStrategy] = useState<"resume" | "overwrite">(
    (user?.preferences?.default_tagging_strategy as "resume" | "overwrite") || "resume",
  );
  const [autoFollowAudio, setAutoFollowAudio] = useState<boolean>(
    user?.preferences?.auto_follow_audio !== false,
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user?.preferred_tts_model) {
      setTtsModel(user.preferred_tts_model);
    }
    if (user?.preferences) {
      if (
        user.preferences.default_tagging_strategy === "resume" ||
        user.preferences.default_tagging_strategy === "overwrite"
      ) {
        setTaggingStrategy(user.preferences.default_tagging_strategy);
      }
      if (typeof user.preferences.auto_follow_audio === "boolean") {
        setAutoFollowAudio(user.preferences.auto_follow_audio);
      }
    }
  }, [user?.preferred_tts_model, user?.preferences]);

  const selectedModel =
    TTS_MODELS.find((m) => m.id === ttsModel) || TTS_MODELS[0];

  const handleModelChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value;
    const prev = ttsModel;
    setTtsModel(next);
    setSaving(true);
    try {
      await updateUser({ preferred_tts_model: next });
      toast.success("Default voice engine saved.");
    } catch (err) {
      setTtsModel(prev);
      toast.error(
        err instanceof Error ? err.message : "Failed to save default voice engine.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handlePreferencePatch = async (patch: Record<string, unknown>, label: string) => {
    setSaving(true);
    try {
      await updateUserPreferences(patch);
      toast.success(`${label} saved.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to save ${label.toLowerCase()}.`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl text-foreground">
          Studio Preferences
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Configure your default voice engine and studio workflow preferences. Changes save automatically.
        </p>
      </div>

      <div className="border-t border-b border-border divide-y divide-border text-xs">
        <div className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1 max-w-md">
            <div className="font-medium text-sm text-foreground flex items-center gap-2">
              <span>Default Voice Engine</span>
              {saving && (
                <RiLoader4Line className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              )}
            </div>
            <p className="text-muted-foreground leading-relaxed">
              Applied by default when starting chapter or batch audio generation across all projects.
            </p>
          </div>
          <div className="w-full sm:w-64 shrink-0">
            <NativeSelect
              value={ttsModel}
              onChange={handleModelChange}
              disabled={saving}
              className="w-full h-9 text-xs"
            >
              {TTS_MODELS.map((model) => (
                <NativeSelectOption key={model.id} value={model.id}>
                  {model.name} ({model.badge})
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        </div>

        {selectedModel && (
          <div className="py-4 space-y-1.5">
            <div className="flex items-center gap-2 text-foreground font-medium">
              <RiSparklingLine className="h-3.5 w-3.5 text-muted-foreground" />
              <span>{selectedModel.name}</span>
              <span className="px-2 py-0.5 rounded-full bg-secondary text-[11px] text-muted-foreground">
                {selectedModel.badge}
              </span>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              {selectedModel.description}
            </p>
          </div>
        )}

        <div className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1 max-w-md">
            <div className="font-medium text-sm text-foreground">
              Default Speaker Detection Strategy
            </div>
            <p className="text-muted-foreground leading-relaxed">
              Resume preserves manual speaker edits on already-tagged dialogue lines.
            </p>
          </div>
          <div className="w-full sm:w-64 shrink-0">
            <NativeSelect
              value={taggingStrategy}
              disabled={saving}
              onChange={(e) => {
                const val = e.target.value as "resume" | "overwrite";
                setTaggingStrategy(val);
                handlePreferencePatch(
                  { default_tagging_strategy: val },
                  "Tagging strategy",
                );
              }}
              className="w-full h-9 text-xs"
            >
              <NativeSelectOption value="resume">
                Resume untagged lines (Recommended)
              </NativeSelectOption>
              <NativeSelectOption value="overwrite">
                Overwrite existing tags
              </NativeSelectOption>
            </NativeSelect>
          </div>
        </div>

        <div className="py-4 flex items-center justify-between gap-4">
          <div className="space-y-1 max-w-md">
            <div className="font-medium text-sm text-foreground">
              Auto-follow audio playback
            </div>
            <p className="text-muted-foreground leading-relaxed">
              Automatically scroll the active dialogue segment into view while listening.
            </p>
          </div>
          <Switch
            checked={autoFollowAudio}
            disabled={saving}
            onCheckedChange={(checked) => {
              setAutoFollowAudio(checked);
              handlePreferencePatch(
                { auto_follow_audio: checked },
                "Playback preference",
              );
            }}
            aria-label="Auto-follow audio playback"
          />
        </div>
      </div>
    </div>
  );
}
