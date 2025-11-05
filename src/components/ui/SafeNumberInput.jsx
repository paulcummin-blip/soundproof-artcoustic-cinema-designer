import React from "react";
import { Input } from "@/components/ui/input";

/**
 * SafeNumberInput
 * - Keeps internal string to avoid NaN thrash
 * - Calls onNumber(value:number|null) with parsed number or null
 */
export default function SafeNumberInput({
  value,
  onNumber,
  placeholder = "",
  className = "",
  min,
  max,
  step = "any",
  "aria-label": ariaLabel,
}) {
  const [text, setText] = React.useState(
    typeof value === "number" && Number.isFinite(value) ? String(value) : ""
  );

  React.useEffect(() => {
    const next = typeof value === "number" && Number.isFinite(value) ? String(value) : "";
    if (next !== text) setText(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <Input
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      placeholder={placeholder}
      className={className}
      value={text}
      onChange={(e) => {
        const v = e.target.value;
        setText(v);
        const n = Number(v);
        if (v.trim() === "") onNumber?.(null);
        else if (Number.isFinite(n)) {
          if (typeof min === "number" && n < min) return;
          if (typeof max === "number" && n > max) return;
          onNumber?.(n);
        }
      }}
      onBlur={() => {
        const n = Number(text);
        if (!Number.isFinite(n)) setText("");
      }}
      step={step}
    />
  );
}