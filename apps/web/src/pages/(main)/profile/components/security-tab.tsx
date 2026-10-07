import React, { useState } from "react";
import * as z from "zod";
import { RiCheckLine, RiErrorWarningLine, RiLoader4Line } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";
import { cn } from "@/lib/utils";

const passwordSchema = z
  .object({
    current_password: z
      .string()
      .min(1, { message: "Previous password is required." }),
    password: z
      .string()
      .min(6, { message: "New password must be at least 6 characters." }),
    confirm_password: z
      .string()
      .min(1, { message: "Please confirm your new password." }),
  })
  .refine((data) => data.password === data.confirm_password, {
    message: "New passwords do not match.",
    path: ["confirm_password"],
  });

export function SecurityTab() {
  const { updateUser } = useAuth();

  const [values, setValues] = useState({
    current_password: "",
    password: "",
    confirm_password: "",
  });

  const [activeField, setActiveField] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  const handleChange = (field: string, val: string) => {
    setValues((prev) => ({ ...prev, [field]: val }));
    setApiError(null);
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = async () => {
    setErrors({});
    setApiError(null);
    setSuccessMessage(null);

    const validation = passwordSchema.safeParse(values);
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
        current_password: values.current_password,
        password: values.password,
      });
      setValues({
        current_password: "",
        password: "",
        confirm_password: "",
      });
      setSuccessMessage("Password successfully updated.");
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setApiError(err.message);
      } else {
        setApiError("Failed to update password. Please check your current password.");
      }
    } finally {
      setIsSaving(false);
    }
  };

  const fields: Array<{
    id: "current_password" | "password" | "confirm_password";
    label: string;
    placeholder: string;
  }> = [
    {
      id: "current_password",
      label: "Previous Password",
      placeholder: "Enter current password",
    },
    {
      id: "password",
      label: "New Password",
      placeholder: "Enter new password (min. 6 characters)",
    },
    {
      id: "confirm_password",
      label: "Confirm New Password",
      placeholder: "Re-enter new password",
    },
  ];

  return (
    <div className="w-full space-y-6">
      {/* Section Header with Faint Bottom Border */}
      <div className="pb-3 border-b border-border">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Change password
        </h2>
      </div>

      {successMessage && (
        <div className="p-3 text-xs rounded-md bg-secondary text-secondary-foreground border border-border flex items-center gap-2">
          <RiCheckLine className="h-4 w-4 shrink-0 text-foreground" />
          <span>{successMessage}</span>
        </div>
      )}

      {apiError && (
        <div className="p-3 text-xs rounded-md bg-destructive/10 border border-destructive/20 text-destructive flex items-center gap-2">
          <RiErrorWarningLine className="h-4 w-4 shrink-0" />
          <span>{apiError}</span>
        </div>
      )}

      {/* Fields Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-8 pt-1">
        {fields.map((field) => {
          const isActive = activeField === field.id;
          const hasError = !!errors[field.id];

          return (
            <div key={field.id} className="space-y-1 group">
              <label
                htmlFor={field.id}
                className="block text-xs font-medium text-muted-foreground transition-colors group-hover:text-foreground"
              >
                {field.label}
              </label>

              <div className="relative">
                <input
                  id={field.id}
                  type="password"
                  value={values[field.id]}
                  onChange={(e) => handleChange(field.id, e.target.value)}
                  onFocus={() => setActiveField(field.id)}
                  onBlur={() => {
                    setTimeout(() => {
                      setActiveField((current) => (current === field.id ? null : current));
                    }, 150);
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder={field.placeholder}
                  className={cn(
                    "w-full bg-transparent px-0 py-2 text-sm font-medium text-foreground",
                    "placeholder:text-muted-foreground/40 outline-none transition-all duration-150",
                    "border-0 border-b",
                    isActive
                      ? "border-b-2 border-black dark:border-white text-foreground"
                      : "border-border hover:border-foreground/40",
                    hasError && "border-b-2 border-destructive text-destructive"
                  )}
                />
              </div>

              {hasError && (
                <p className="text-xs text-destructive mt-1 font-medium">
                  {errors[field.id]}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Save Button directly under the form */}
      <div className="pt-4 flex items-center gap-3">
        <Button
          type="button"
          size="sm"
          onClick={handleSubmit}
          disabled={isSaving || !values.current_password || !values.password}
          className="h-9 px-5 bg-black text-white hover:bg-black/90 dark:bg-white dark:text-black dark:hover:bg-white/90 transition-all font-medium disabled:opacity-50"
        >
          {isSaving ? (
            <>
              <RiLoader4Line className="h-4 w-4 animate-spin mr-1.5" />
              Updating...
            </>
          ) : (
            "Update Password"
          )}
        </Button>
      </div>
    </div>
  );
}

export default SecurityTab;
