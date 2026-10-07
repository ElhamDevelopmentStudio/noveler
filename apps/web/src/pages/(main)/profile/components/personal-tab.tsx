import React from "react";
import { RiCheckLine, RiLoader4Line } from "@remixicon/react";
import type { User } from "@novelova/shared-types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PersonalTabProps {
  user: User;
  values: {
    name: string;
    handle: string;
    email: string;
    social: string;
  };
  errors: Record<string, string>;
  activeField: string | null;
  isDirty: boolean;
  isSaving: boolean;
  saveSuccess: boolean;
  onChange: (field: string, value: string) => void;
  onFocus: (field: string) => void;
  onBlur: (field: string) => void;
  onSave: () => void;
  onDiscard: () => void;
}

export function PersonalTab({
  values,
  errors,
  activeField,
  isDirty,
  isSaving,
  saveSuccess,
  onChange,
  onFocus,
  onBlur,
  onSave,
  onDiscard,
}: PersonalTabProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onSave();
    }
  };

  const fields: Array<{
    id: "name" | "handle" | "email" | "social";
    label: string;
    type: string;
    placeholder: string;
  }> = [
    {
      id: "name",
      label: "Full Name",
      type: "text",
      placeholder: "Your full name",
    },
    {
      id: "handle",
      label: "Handle",
      type: "text",
      placeholder: "username",
    },
    {
      id: "email",
      label: "Email Address",
      type: "email",
      placeholder: "user@example.com",
    },
    {
      id: "social",
      label: "Social",
      type: "text",
      placeholder: "instagram: _b_dark",
    },
  ];

  return (
    <div className="w-full space-y-6">
      {/* Section Header with Faint Bottom Border */}
      <div className="pb-3 border-b border-border">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Personal information
        </h2>
      </div>

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
                  type={field.type}
                  value={values[field.id]}
                  onChange={(e) => onChange(field.id, e.target.value)}
                  onFocus={() => onFocus(field.id)}
                  onBlur={() => onBlur(field.id)}
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
          onClick={onSave}
          disabled={isSaving || !isDirty}
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
            "Save Changes"
          )}
        </Button>

        {isDirty && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onDiscard}
            disabled={isSaving}
            className="h-9 px-3 text-muted-foreground hover:text-foreground text-xs"
          >
            Discard
          </Button>
        )}
      </div>
    </div>
  );
}

export default PersonalTab;
