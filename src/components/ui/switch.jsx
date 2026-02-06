import * as React from "react";

// Simple class name helper
function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

const Switch = React.forwardRef(
  ({ className, checked, onCheckedChange, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        role="switch"
        aria-checked={!!checked}
        onClick={() => {
          if (props?.disabled) return;
          onCheckedChange?.(!checked);
        }}
        className={cn(
          // Track base styles
          "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border transition-colors",
          // Focus styles
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#C1B6AD]",
          // Disabled state
          "disabled:cursor-not-allowed disabled:opacity-50",
          // Subtle hover contrast (both states)
          "hover:brightness-[0.98]",
          // Allow extra classes, but DO NOT let them override track colours
          className,
          // Track colours (ONLY one set is ever applied)
          checked ? "bg-[#3E4349] border-[#3E4349]" : "bg-[#F8F8F7] border-[#DCDBD6]"
        )}
        {...props}
      >
        <div
          className={cn(
            "pointer-events-none block h-4 w-4 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-4" : "translate-x-0"
          )}
        />
      </button>
    );
  }
);

Switch.displayName = "Switch";

export { Switch };