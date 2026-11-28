import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  RiCheckLine,
  RiErrorWarningLine,
  RiEyeLine,
  RiEyeOffLine,
  RiLoader4Line,
} from "@remixicon/react";
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

type PasswordFormValues = z.infer<typeof passwordSchema>;

export function SecurityTab() {
  const { updateUser } = useAuth();
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      current_password: "",
      password: "",
      confirm_password: "",
    },
  });

  const watched = watch();

  const onSubmit = async (values: PasswordFormValues) => {
    setApiError(null);
    setSuccessMessage(null);
    try {
      await updateUser({
        current_password: values.current_password,
        password: values.password,
      });
      reset();
      setSuccessMessage("Password successfully updated.");
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setApiError(err.message);
      } else {
        setApiError("Failed to update password. Please check your current password.");
      }
    }
  };

  const fields: Array<{
    id: keyof PasswordFormValues;
    label: string;
    placeholder: string;
    autoComplete: string;
  }> = [
    {
      id: "current_password",
      label: "Previous Password",
      placeholder: "Enter current password",
      autoComplete: "current-password",
    },
    {
      id: "password",
      label: "New Password",
      placeholder: "Enter new password (min. 6 characters)",
      autoComplete: "new-password",
    },
    {
      id: "confirm_password",
      label: "Confirm New Password",
      placeholder: "Re-enter new password",
      autoComplete: "new-password",
    },
  ];

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="w-full space-y-6" noValidate>
      {/* Section Header with Faint Bottom Border */}
      <div className="pb-3 border-b border-border">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Change password
        </h2>
      </div>

      {successMessage && (
        <div
          role="status"
          aria-live="polite"
          className="p-3 text-xs rounded-md bg-secondary text-secondary-foreground border border-border flex items-center gap-2"
        >
          <RiCheckLine className="h-4 w-4 shrink-0 text-foreground" aria-hidden="true" />
          <span>{successMessage}</span>
        </div>
      )}

      {apiError && (
        <div
          role="alert"
          className="p-3 text-xs rounded-md bg-destructive/10 border border-destructive/20 text-destructive flex items-center gap-2"
        >
          <RiErrorWarningLine className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{apiError}</span>
        </div>
      )}

      {/* Fields Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-8 pt-1">
        {fields.map((field) => {
          const fieldError = errors[field.id]?.message;
          const isVisible = Boolean(showPasswords[field.id]);

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
                  type={isVisible ? "text" : "password"}
                  autoComplete={field.autoComplete}
                  aria-invalid={Boolean(fieldError)}
                  aria-describedby={fieldError ? `${field.id}-error` : undefined}
                  placeholder={field.placeholder}
                  {...register(field.id, {
                    onChange: () => {
                      if (apiError) setApiError(null);
                    },
                  })}
                  className={cn(
                    "w-full bg-transparent px-0 pr-8 py-2 text-sm font-medium text-foreground",
                    "placeholder:text-muted-foreground/50 focus-visible:outline-none transition-colors duration-150",
                    "border-0 border-b border-border hover:border-foreground/40 focus-visible:border-b-2 focus-visible:border-foreground",
                    fieldError && "border-b-2 border-destructive text-destructive",
                  )}
                />
                <button
                  type="button"
                  onClick={() =>
                    setShowPasswords((prev) => ({
                      ...prev,
                      [field.id]: !prev[field.id],
                    }))
                  }
                  aria-label={isVisible ? `Hide ${field.label.toLowerCase()}` : `Show ${field.label.toLowerCase()}`}
                  className="absolute right-0 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {isVisible ? (
                    <RiEyeOffLine className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <RiEyeLine className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              </div>

              {fieldError && (
                <p id={`${field.id}-error`} role="alert" className="text-xs text-destructive mt-1 font-medium">
                  {fieldError}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Save Button directly under the form */}
      <div className="pt-4 flex items-center gap-3">
        <Button
          type="submit"
          size="sm"
          disabled={
            isSubmitting ||
            !watched.current_password ||
            !watched.password ||
            !watched.confirm_password
          }
          className="h-9 px-5 bg-primary text-primary-foreground hover:opacity-90 transition-opacity font-medium disabled:opacity-50"
        >
          {isSubmitting ? (
            <>
              <RiLoader4Line className="h-4 w-4 animate-spin mr-1.5" aria-hidden="true" />
              Updating…
            </>
          ) : (
            "Update Password"
          )}
        </Button>
      </div>
    </form>
  );
}

export default SecurityTab;
