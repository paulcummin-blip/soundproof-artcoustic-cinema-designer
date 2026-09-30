import React from "react";
import { SelectTrigger } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * The single source of truth for speaker / subwoofer selector field styling.
 *
 * Every model field in the app (LCR, surround, overhead, subwoofer) must read as
 * one design system: 24px semibold model text, a 40px white field, a #DCDBD6
 * border that turns brand green on hover and focus, a 1px focus ring, and the
 * same chevron. These primitives are that recipe, defined once.
 *
 * A selector that hand-rolls its own <SelectTrigger> classes instead of using
 * these will drift out of the design system — which is exactly how the
 * subwoofer section came to look like a different component set.
 *
 * Styling only. No state, pricing, calculation or persistence logic lives here.
 */
export const MODEL_SELECT_TRIGGER_CLASS =
  "w-full bg-white border-[#DCDBD6] hover:border-[#213428] focus:border-[#213428] focus:ring-1 focus:ring-[#213428]";
export const MODEL_SELECT_LABEL_CLASS = "text-sm font-medium text-[#3E4349]";

const MODEL_VALUE_TEXT_CLASS = "text-2xl font-semibold";
const MODEL_VALUE_COLOR = "#213428";
const MODEL_VALUE_MUTED_COLOR = "#9B9890";

/** The selector field itself. Pass a width via className to narrow it. */
export function ModelSelectTrigger({ className, children, ...rest }) {
  return (
    <SelectTrigger className={cn(MODEL_SELECT_TRIGGER_CLASS, className)} {...rest}>
      {children}
    </SelectTrigger>
  );
}

/** The large model (or quantity) text. Muted while the field is empty. */
export function ModelValueText({ muted = false, children }) {
  return (
    <span
      className={MODEL_VALUE_TEXT_CLASS}
      style={{ color: muted ? MODEL_VALUE_MUTED_COLOR : MODEL_VALUE_COLOR }}
    >
      {children}
    </span>
  );
}

/** The field's own label, always the same size, weight and colour. */
export function ModelSelectLabel({ className, children, ...rest }) {
  return (
    <span className={cn(MODEL_SELECT_LABEL_CLASS, className)} {...rest}>
      {children}
    </span>
  );
}