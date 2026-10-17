import { useState, useEffect } from "react";
import {
  RiCheckLine,
  RiLoader4Line,
  RiSendPlaneFill,
  RiEyeLine,
  RiEyeOffLine,
  RiExternalLinkLine,
  RiQuestionLine,
  RiNotificationLine,
  RiAlertLine,
  RiCheckboxCircleLine,
} from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  getTelegramSettings,
  updateTelegramSettings,
  testTelegramConnection,
} from "@/services/telegram";

export function TelegramTab() {
  const [enabled, setEnabled] = useState(false);
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [hasToken, setHasToken] = useState(false);
  const [savedMaskedToken, setSavedMaskedToken] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showToken, setShowToken] = useState(false);

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    bot_username?: string | null;
  } | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [isGuideOpen, setIsGuideOpen] = useState(true);

  // Fetch settings on mount
  useEffect(() => {
    async function loadSettings() {
      try {
        setIsLoading(true);
        const data = await getTelegramSettings();
        setEnabled(data.enabled);
        setHasToken(data.has_token);
        setChatId(data.chat_id || "");
        if (data.bot_token_masked) {
          setSavedMaskedToken(data.bot_token_masked);
          setBotToken(data.bot_token_masked);
        }
      } catch (err) {
        console.error("Failed to load Telegram settings:", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadSettings();
  }, []);

  const isTokenDirty = botToken !== (savedMaskedToken || "");

  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      // If user left the masked token as-is, don't re-send the masked string
      const tokenPayload = isTokenDirty ? botToken : undefined;
      const willEnable = enabled || (Boolean(tokenPayload || hasToken) && Boolean(chatId.trim()));
      const updated = await updateTelegramSettings({
        enabled: willEnable,
        bot_token: tokenPayload,
        chat_id: chatId,
      });

      setEnabled(updated.enabled);
      setHasToken(updated.has_token);
      setChatId(updated.chat_id || "");
      if (updated.bot_token_masked) {
        setSavedMaskedToken(updated.bot_token_masked);
        setBotToken(updated.bot_token_masked);
      }
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save settings.";
      setTestError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestPing = async () => {
    setIsTesting(true);
    setTestResult(null);
    setTestError(null);

    try {
      const result = await testTelegramConnection({
        bot_token: isTokenDirty ? botToken : undefined,
        chat_id: chatId || undefined,
      });
      setTestResult({
        success: result.success,
        message: result.message,
        bot_username: result.bot_username,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Telegram connection test failed.";
      setTestError(msg);
    } finally {
      setIsTesting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground shimmer-text">
        Loading Telegram delivery settings...
      </div>
    );
  }

  const isConfigured = hasToken && chatId.trim().length > 0;

  return (
    <div className="w-full space-y-8">
      {/* Section Header */}
      <div className="pb-3 border-b border-border flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Telegram Audio Delivery
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Deliver completed chapter audio files (.m4a/.mp3) directly to your Telegram chat.
          </p>
        </div>

        {/* Live Status Badge */}
        <div>
          {enabled && isConfigured ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Active Delivery
            </span>
          ) : isConfigured ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-500 border border-amber-500/20">
              Configured (Disabled)
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border">
              Not Configured
            </span>
          )}
        </div>
      </div>

      {/* Master Enable Toggle Card */}
      <div className="p-4 rounded-xl border border-border bg-card/50 flex items-center justify-between gap-4">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <RiNotificationLine className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">
              Automatic Chapter Delivery
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            When enabled, finished chapters will be pushed to your Telegram chat with full cover art and audio tags.
          </p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => setEnabled((prev) => !prev)}
          className={cn(
            "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
            enabled ? "bg-primary" : "bg-muted"
          )}
        >
          <span
            className={cn(
              "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow-lg ring-0 transition duration-200 ease-in-out",
              enabled ? "translate-x-5" : "translate-x-0"
            )}
          />
        </button>
      </div>

      {/* Test Feedback Alerts */}
      {testResult && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs flex items-start gap-3">
          <RiCheckboxCircleLine className="h-5 w-5 shrink-0 mt-0.5 text-emerald-500" />
          <div className="space-y-1">
            <p className="font-semibold">{testResult.message}</p>
            <p className="text-muted-foreground">
              Your bot (@{testResult.bot_username || "bot"}) is operational. Check your Telegram app for the welcome audio studio ping!
            </p>
          </div>
        </div>
      )}

      {testError && (
        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-start gap-3">
          <RiAlertLine className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">Telegram Connection Error</p>
            <p>{testError}</p>
          </div>
        </div>
      )}

      {/* Credentials Form */}
      <div className="space-y-6 pt-1">
        {/* Bot Token Field */}
        <div className="space-y-1.5 group">
          <div className="flex items-center justify-between">
            <label
              htmlFor="telegram-token"
              className="block text-xs font-medium text-muted-foreground transition-colors group-hover:text-foreground"
            >
              Telegram Bot Token
            </label>
            <span className="text-[11px] text-muted-foreground/60 font-mono">
              From @BotFather
            </span>
          </div>

          <div className="relative">
            <input
              id="telegram-token"
              type={showToken ? "text" : "password"}
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
              placeholder="123456789:ABCdefGHIjklMNOpqrSTUvwxYZ"
              className={cn(
                "w-full bg-transparent pr-10 py-2 text-sm font-mono text-foreground",
                "placeholder:text-muted-foreground/30 outline-none transition-all duration-150",
                "border-0 border-b border-border hover:border-foreground/40 focus:border-b-2 focus:border-foreground"
              )}
            />
            <button
              type="button"
              onClick={() => setShowToken((prev) => !prev)}
              className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
              title={showToken ? "Hide token" : "Show token"}
            >
              {showToken ? (
                <RiEyeOffLine className="h-4 w-4" />
              ) : (
                <RiEyeLine className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        {/* Chat ID Field */}
        <div className="space-y-1.5 group">
          <div className="flex items-center justify-between">
            <label
              htmlFor="telegram-chat-id"
              className="block text-xs font-medium text-muted-foreground transition-colors group-hover:text-foreground"
            >
              Telegram Chat ID
            </label>
            <span className="text-[11px] text-muted-foreground/60 font-mono">
              User ID or Channel ID
            </span>
          </div>

          <input
            id="telegram-chat-id"
            type="text"
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
            placeholder="e.g. 987654321 or -1001234567890"
            className={cn(
              "w-full bg-transparent py-2 text-sm font-mono text-foreground",
              "placeholder:text-muted-foreground/30 outline-none transition-all duration-150",
              "border-0 border-b border-border hover:border-foreground/40 focus:border-b-2 focus:border-foreground"
            )}
          />
          <p className="text-[11px] text-muted-foreground pt-1">
            Your personal numeric user ID, or channel ID (e.g. starting with -100).
          </p>
        </div>

        {/* Buttons Row */}
        <div className="pt-4 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
            className="h-9 px-5 bg-black text-white hover:bg-black/90 dark:bg-white dark:text-black dark:hover:bg-white/90 transition-all font-medium disabled:opacity-50"
          >
            {isSaving ? (
              <>
                <RiLoader4Line className="h-4 w-4 animate-spin mr-1.5" />
                Saving...
              </>
            ) : saveSuccess ? (
              <>
                <RiCheckLine className="h-4 w-4 text-emerald-400 mr-1.5" />
                Saved
              </>
            ) : (
              "Save Settings"
            )}
          </Button>

          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleTestPing}
            disabled={isTesting || (!botToken.trim() && !hasToken) || !chatId.trim()}
            className="h-9 px-4 border-border text-foreground hover:bg-muted/50 gap-2 font-medium"
          >
            {isTesting ? (
              <>
                <RiLoader4Line className="h-4 w-4 animate-spin" />
                Sending Ping...
              </>
            ) : (
              <>
                <RiSendPlaneFill className="h-4 w-4 text-primary" />
                Send Test Message
              </>
            )}
          </Button>
        </div>
      </div>

      {/* 3-Step Setup Guide Accordion/Card */}
      <div className="rounded-xl border border-border bg-muted/20 overflow-hidden">
        <button
          type="button"
          onClick={() => setIsGuideOpen((prev) => !prev)}
          className="w-full p-4 flex items-center justify-between text-left hover:bg-muted/40 transition-colors"
        >
          <div className="flex items-center gap-2">
            <RiQuestionLine className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
              3-Step Setup Guide: How to get Bot Token & Chat ID
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            {isGuideOpen ? "Hide Guide" : "Show Guide"}
          </span>
        </button>

        {isGuideOpen && (
          <div className="p-4 pt-1 border-t border-border/50 space-y-4 text-xs text-muted-foreground leading-relaxed">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              {/* Step 1 */}
              <div className="p-3 rounded-lg bg-card border border-border/60 space-y-2">
                <div className="flex items-center gap-2 font-semibold text-foreground">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary text-[11px]">
                    1
                  </span>
                  Create Your Bot
                </div>
                <p>
                  Open Telegram and search for{" "}
                  <a
                    href="https://t.me/BotFather"
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline font-medium inline-flex items-center gap-0.5"
                  >
                    @BotFather
                    <RiExternalLinkLine className="h-3 w-3 inline" />
                  </a>
                  . Send <code className="text-foreground">/newbot</code>, pick a display name and a username, and copy the <strong>HTTP API Token</strong>.
                </p>
              </div>

              {/* Step 2 */}
              <div className="p-3 rounded-lg bg-card border border-border/60 space-y-2">
                <div className="flex items-center gap-2 font-semibold text-foreground">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary text-[11px]">
                    2
                  </span>
                  Start the Bot
                </div>
                <p>
                  Open your new bot's chat link (e.g. <code>t.me/your_bot</code>) and click{" "}
                  <strong className="text-foreground">Start</strong>.
                </p>
                <p className="text-[11px] text-amber-500">
                  ⚠️ Telegram strictly forbids bots from sending messages until you click Start first.
                </p>
              </div>

              {/* Step 3 */}
              <div className="p-3 rounded-lg bg-card border border-border/60 space-y-2">
                <div className="flex items-center gap-2 font-semibold text-foreground">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary text-[11px]">
                    3
                  </span>
                  Get Your Chat ID
                </div>
                <p>
                  Search for{" "}
                  <a
                    href="https://t.me/userinfobot"
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline font-medium inline-flex items-center gap-0.5"
                  >
                    @userinfobot
                    <RiExternalLinkLine className="h-3 w-3 inline" />
                  </a>
                  , press Start, and copy your numeric <strong>Id</strong>. Paste both above and click <strong>"Send Test Message"</strong>!
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default TelegramTab;
