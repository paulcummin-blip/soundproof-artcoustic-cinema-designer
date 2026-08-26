import React from "react";
import { Label } from "@/components/ui/Label";
import { Input } from "@/components/ui/input";

/**
 * Editable numeric input for manual screen-size dimensions.
 *
 * Reuses the same temporary string-state / parse-on-commit behaviour as the
 * working room-dimension fields (RoomDimensions.jsx):
 *   - The input value is bound to a local draft STRING, not the numeric state.
 *   - The user can clear the field, leave it blank while typing, and type a
 *     decimal value naturally — no forced `0` is pushed back during typing.
 *   - The parsed value is committed on blur; invalid/blank drafts restore the
 *     display from the last committed value.
 *
 * Props:
 *   value       — committed numeric value (number | "" | null)
 *   onCommit    — (parsedNumber | null) => void  (called on blur/Enter)
 *   label       — field label
 *   disabled    — boolean
 *   step, min, max, placeholder — forwarded to the input
 *   allowDecimal — true by default (dimension metres / inches)
 */

const formatDisplay = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return "";
  // Trim trailing zeros for clean display, keep up to 2 decimals
  const fixed = num.toFixed(2);
  return fixed.replace(/\.?0+$/, "");
};

const parseValue = (raw) => {
  if (raw == null) return null;
  const str = String(raw).trim().replace(",", ".");
  if (!str || str === ".") return null;
  const num = parseFloat(str);
  if (!Number.isFinite(num) || num <= 0) return null;
  return Math.round(num * 100) / 100;
};

export default function ManualSizeInput({
  value,
  onCommit,
  label,
  disabled = false,
  step = "0.01",
  min,
  max,
  placeholder = "0",
  style,
}) {
  const [draft, setDraft] = React.useState(() => formatDisplay(value));

  // Sync draft from external committed value when it changes externally
  // (e.g. hydration, preset switch, undo). This does NOT fire on every
  // keystroke — only when the committed value changes.
  React.useEffect(() => {
    setDraft(formatDisplay(value));
  }, [value]);

  const handleChange = (raw) => {
    // Allow digits, single decimal point, and trailing decimal point
    if (!/^\d*\.?\d*$/.test(raw)) return;
    setDraft(raw);
  };

  const handleBlur = () => {
    const parsed = parseValue(draft);
    if (parsed !== null) {
      onCommit?.(parsed);
    }
    // Restore display from the committed value (updated via effect after onCommit)
    setDraft(formatDisplay(value));
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget?.blur();
    }
  };

  const inputStyle = style || {
    border: "1px solid #DCDBD6",
    borderRadius: "8px",
    padding: "8px 10px",
    background: disabled ? "#F3F3F3" : "#FFF",
    color: "#1B1A1A",
    fontSize: "14px",
    width: "100%",
  };

  return (
    <div>
      {label && <Label className="block mb-1.5 text-xs text-[#6B7280]">{label}</Label>}
      <Input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        value={draft}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={placeholder}
        style={inputStyle}
      />
    </div>
  );
}