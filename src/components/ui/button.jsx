import * as React from "react";
import { cva } from "class-variance-authority";

// Minimal class combiner (no external deps; no name collisions)
function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

// Variants (includes our brand style)
export const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border brand-border bg-background hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",

        // Brand green variant
        brand: "bg-[var(--brand-green)] text-white hover:bg-[var(--brand-slate)] focus-visible:ring-[var(--brand-green)]",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "brand",
      size: "default",
    },
  }
);

// Self-contained Button (no Slot, no cn)
const Button = React.forwardRef(function Button(
  { className, variant = "brand", size = "default", ...props },
  ref
) {
  return (
    <button
      ref={ref}
      className={cx(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
});

Button.displayName = "Button";

export { Button };