import * as React from "react";
import { RiArrowDownSLine } from "@remixicon/react";
import { cn } from "@/lib/utils";

export interface NativeSelectProps
  extends Omit<React.ComponentProps<"select">, "size"> {
  size?: "sm" | "default";
}

const NativeSelect = React.forwardRef<HTMLSelectElement, NativeSelectProps>(
  ({ className, size = "default", children, ...props }, ref) => {
    return (
      <div
        className={cn(
          "group/native-select relative w-fit has-[select:disabled]:opacity-50",
          className,
        )}
        data-slot="native-select-wrapper"
        data-size={size}
      >
        <select
          ref={ref}
          data-slot="native-select"
          data-size={size}
          className={cn(
            "flex w-full appearance-none items-center justify-between rounded-lg border border-neutral-200/80 dark:border-white/[0.08] bg-neutral-50/80 dark:bg-neutral-900/60 text-neutral-800 dark:text-neutral-200 shadow-2xs transition-colors outline-none focus-visible:border-neutral-900 dark:focus-visible:border-white disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer select-none",
            size === "sm"
              ? "h-7 text-[11px] font-medium pl-2.5 pr-6"
              : "h-9 text-xs pl-3 pr-8",
          )}
          {...props}
        >
          {children}
        </select>
        <RiArrowDownSLine
          className="text-neutral-400 dark:text-neutral-500 pointer-events-none absolute right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 select-none transition-transform group-hover/native-select:text-neutral-700 dark:group-hover/native-select:text-neutral-300"
          aria-hidden="true"
        />
      </div>
    );
  },
);
NativeSelect.displayName = "NativeSelect";

const NativeSelectOption = React.forwardRef<
  HTMLOptionElement,
  React.ComponentProps<"option">
>(({ className, ...props }, ref) => (
  <option
    ref={ref}
    data-slot="native-select-option"
    className={cn(
      "bg-white dark:bg-[#121316] text-neutral-900 dark:text-neutral-100 py-1",
      className,
    )}
    {...props}
  />
));
NativeSelectOption.displayName = "NativeSelectOption";

const NativeSelectOptGroup = React.forwardRef<
  HTMLOptGroupElement,
  React.ComponentProps<"optgroup">
>(({ className, ...props }, ref) => (
  <optgroup
    ref={ref}
    data-slot="native-select-optgroup"
    className={cn(
      "bg-white dark:bg-[#121316] font-semibold text-neutral-500 dark:text-neutral-400",
      className,
    )}
    {...props}
  />
));
NativeSelectOptGroup.displayName = "NativeSelectOptGroup";

export { NativeSelect, NativeSelectOption, NativeSelectOptGroup };
