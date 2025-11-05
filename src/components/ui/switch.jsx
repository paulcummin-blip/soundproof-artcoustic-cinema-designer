import * as React from "react";

// Simple class name helper
function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

const Switch = React.forwardRef(({ className, checked, onCheckedChange, ...props }, ref) => {
  return (
    <button
      ref={ref}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange?.(!checked)}
      className={cn(
        // Track base styles
        "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border transition-colors",
        // Brand colors - unchecked state
        "border-[#DCDBD6] bg-[#F8F8F7]",
        // Brand colors - checked state  
        checked ? "bg-[#213428] border-[#213428]" : "",
        // Focus styles
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#C1B6AD]",
        // Disabled state
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
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
});

Switch.displayName = "Switch";

export { Switch };