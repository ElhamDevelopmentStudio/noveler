import { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import * as z from "zod";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAuth } from "@/context/auth-context";
import { ProfileHeader } from "./components/profile-header";
import { PersonalTab } from "./components/personal-tab";
import { SecurityTab } from "./components/security-tab";

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
      <div className="max-w-5xl mx-auto py-16 text-center">
        <p className="text-sm text-muted-foreground shimmer-text">
          Loading user profile....
        </p>
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
    <div className="max-w-5xl mx-auto space-y-8 pb-16">
      {/* Top Breadcrumb & Hero Section (no extra buttons) */}
      <ProfileHeader user={user} />

      {/* General error message if any */}
      {errors.general && (
        <div className="p-3 text-xs rounded-md bg-destructive/10 border border-destructive/20 text-destructive">
          {errors.general}
        </div>
      )}

      {/* Tabs Section: Personal and Security */}
      <Tabs defaultValue="personal" className="w-full space-y-6">
        <TabsList className="bg-transparent border-b border-border w-full justify-start rounded-none p-0 h-auto gap-8">
          <TabsTrigger
            value="personal"
            className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-primary rounded-none pb-3 pt-2 px-1 text-sm font-medium text-muted-foreground hover:text-foreground cursor-pointer transition-all"
          >
            Personal
          </TabsTrigger>
          <TabsTrigger
            value="security"
            className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-primary rounded-none pb-3 pt-2 px-1 text-sm font-medium text-muted-foreground hover:text-foreground cursor-pointer transition-all"
          >
            Security
          </TabsTrigger>
        </TabsList>

        <TabsContent value="personal" className="focus-visible:outline-none">
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

        <TabsContent value="security" className="focus-visible:outline-none">
          <SecurityTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default ProfilePage;
