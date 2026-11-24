import { useState, useEffect } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import * as z from "zod";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollFade } from "@/components/ui/scroll-fade";
import { useAuth } from "@/context/auth-context";
import { ProfileNavbar } from "./components/profile-navbar";
import { ProfileHeader } from "./components/profile-header";
import { PersonalTab } from "./components/personal-tab";
import { PreferencesTab } from "./components/preferences-tab";
import { SecurityTab } from "./components/security-tab";
import { TelegramTab } from "./components/telegram-tab";
import { KaggleSettingsTab } from "./components/kaggle-settings-tab";
import { DataExportsTab } from "./components/data-exports-tab";
import { DeveloperSettingsTab } from "./components/developer-settings-tab";

const personalSchema = z.object({
  name: z.string().min(1, { message: "Name is required." }),
  email: z.string().email({ message: "Valid email is required." }),
  handle: z
    .string()
    .min(2, { message: "Handle must be at least 2 characters." })
    .regex(/^[a-zA-Z0-9_-]+$/, {
      message: "Handle can only contain letters, numbers, hyphens, and underscores.",
    }),
  social: z.string().optional(),
});

export function ProfilePage() {
  const { user, isAuthenticated, isLoading, updateUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const tabParam = searchParams.get("tab");
  const validTabs = [
    "personal",
    "preferences",
    "security",
    "telegram",
    "kaggle",
    "exports",
    "developer",
  ];
  const currentTab = validTabs.includes(tabParam || "") ? (tabParam as string) : "personal";

  const handleTabChange = (val: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (val === "personal") {
        next.delete("tab");
      } else {
        next.set("tab", val);
      }
      return next;
    });
  };

  const [personalValues, setPersonalValues] = useState({
    name: user?.name || "",
    handle: user?.handle || "",
    email: user?.email || "",
    social: user?.social || "",
  });

  const [activeField, setActiveField] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Sync state if user changes externally
  useEffect(() => {
    if (user) {
      setPersonalValues({
        name: user.name,
        handle: user.handle,
        email: user.email,
        social: user.social || "",
      });
    }
  }, [user]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col">
        <ProfileNavbar />
        <div className="flex-1 max-w-5xl w-full mx-auto px-6 py-24 text-center">
          <p className="text-sm text-muted-foreground shimmer-text">
            Loading user profile....
          </p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  const isDirty =
    personalValues.name !== user.name ||
    personalValues.handle !== user.handle ||
    personalValues.email !== user.email ||
    personalValues.social !== (user.social || "");

  const handlePersonalChange = (field: string, val: string) => {
    setPersonalValues((prev) => ({ ...prev, [field]: val }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const handlePersonalDiscard = () => {
    setPersonalValues({
      name: user.name,
      handle: user.handle,
      email: user.email,
      social: user.social || "",
    });
    setErrors({});
    setActiveField(null);
  };

  const handlePersonalSave = async () => {
    setErrors({});
    const validation = personalSchema.safeParse(personalValues);
    if (!validation.success) {
      const errMap: Record<string, string> = {};
      validation.error.issues.forEach((issue) => {
        const key = issue.path[0] as string;
        if (!errMap[key]) {
          errMap[key] = issue.message;
        }
      });
      setErrors(errMap);
      return;
    }

    setIsSaving(true);
    try {
      await updateUser({
        name: personalValues.name,
        handle: personalValues.handle,
        email: personalValues.email,
        social: personalValues.social.trim() ? personalValues.social.trim() : null,
      });
      setSaveSuccess(true);
      setActiveField(null);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setErrors({ general: err.message });
      } else {
        setErrors({ general: "Failed to update profile." });
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-[#0c0a09] text-foreground flex flex-col">
      {/* Top Navbar matching Projects and Workspace */}
      <ProfileNavbar />

      {/* Main Content Area with ScrollFade */}
      <ScrollFade className="flex-1 w-full">
        <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6 pb-16">
          {/* Top Hero Section */}
          <ProfileHeader user={user} />

          {/* General error message if any */}
          {errors.general && (
            <div className="p-3 text-xs rounded-lg bg-destructive/10 border border-destructive/20 text-destructive">
              {errors.general}
            </div>
          )}

          {/* Categorized Left Rail (Desktop) + Horizontal Underline Tabs (Mobile) */}
          <Tabs
            value={currentTab}
            onValueChange={handleTabChange}
            className="w-full flex flex-col md:flex-row gap-8"
          >
            {/* Mobile Horizontal Tabs */}
            <TabsList variant="underline" className="md:hidden w-full justify-start">
              <TabsTrigger value="personal">Profile</TabsTrigger>
              <TabsTrigger value="preferences">Preferences</TabsTrigger>
              <TabsTrigger value="security">Security</TabsTrigger>
              <TabsTrigger value="kaggle">Kaggle GPU</TabsTrigger>
              <TabsTrigger value="telegram">Telegram</TabsTrigger>
              <TabsTrigger value="exports">Data &amp; Exports</TabsTrigger>
              <TabsTrigger value="developer">Developer</TabsTrigger>
            </TabsList>

            {/* Desktop Categorized Left Settings Rail */}
            <aside className="hidden md:block w-52 shrink-0 space-y-5 pt-1">
              {[
                {
                  label: "Account",
                  items: [
                    { id: "personal", label: "Profile" },
                    { id: "preferences", label: "Studio Preferences" },
                    { id: "security", label: "Security" },
                  ],
                },
                {
                  label: "Integrations",
                  items: [
                    { id: "kaggle", label: "Kaggle GPU Pool" },
                    { id: "telegram", label: "Telegram Delivery" },
                  ],
                },
                {
                  label: "Data & API",
                  items: [
                    { id: "exports", label: "Data & Exports" },
                    { id: "developer", label: "Developer & API Keys" },
                  ],
                },
              ].map((group) => (
                <div key={group.label}>
                  <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground px-2.5 mb-1.5">
                    {group.label}
                  </div>
                  <div className="space-y-0.5">
                    {group.items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleTabChange(item.id)}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                          currentTab === item.id
                            ? "bg-secondary text-foreground font-medium"
                            : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </aside>

            <div className="flex-1 min-w-0">
              <TabsContent value="personal" className="mt-0 focus-visible:outline-hidden">
                <PersonalTab
                  user={user}
                  values={personalValues}
                  errors={errors}
                  activeField={activeField}
                  isDirty={isDirty}
                  isSaving={isSaving}
                  saveSuccess={saveSuccess}
                  onChange={handlePersonalChange}
                  onFocus={(field) => setActiveField(field)}
                  onBlur={() => {
                    setTimeout(() => {
                      setActiveField(null);
                    }, 150);
                  }}
                  onSave={handlePersonalSave}
                  onDiscard={handlePersonalDiscard}
                />
              </TabsContent>

              <TabsContent value="preferences" className="mt-0 focus-visible:outline-hidden">
                <PreferencesTab />
              </TabsContent>

              <TabsContent value="security" className="mt-0 focus-visible:outline-hidden">
                <SecurityTab />
              </TabsContent>

              <TabsContent value="telegram" className="mt-0 focus-visible:outline-hidden">
                <TelegramTab />
              </TabsContent>

              <TabsContent value="kaggle" className="mt-0 focus-visible:outline-hidden">
                <KaggleSettingsTab />
              </TabsContent>

              <TabsContent value="exports" className="mt-0 focus-visible:outline-hidden">
                <DataExportsTab />
              </TabsContent>

              <TabsContent value="developer" className="mt-0 focus-visible:outline-hidden">
                <DeveloperSettingsTab />
              </TabsContent>
            </div>
          </Tabs>
        </main>
      </ScrollFade>
    </div>
  );
}

export default ProfilePage;
