import React, { useState } from "react";
import { Input } from "@/components/ui/input";

/**
 * A number input that:
 * - Displays the value to 2 decimal places (cm resolution) when not focused
 * - Allows normal free-form editing while focused
 * - Does NOT change the stored/internal value precision
 */
export default function HeightInput({ value, onChange, min = 0, max = 2.5, step = 0.01, className = "", disabled = false }) {
  const [draft, setDraft] = useState(null); // null = not focused

  const displayValue = draft !== null
    ? draft
    : Number.isFinite(Number(value))
      ? Number(value).toFixed(2)
      : "";

  return (
    <Input
      type="number"
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      value={displayValue}
      className={className}
      onFocus={() => setDraft(String(value ?? ""))}
      onChange={(e) => {
        setDraft(e.target.value);
        const raw = Number(e.target.value);
        if (Number.isFinite(raw)) onChange(raw);
      }}
      onBlur={() => setDraft(null)}
    />
  );
}