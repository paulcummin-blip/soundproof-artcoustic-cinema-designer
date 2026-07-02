import React from "react";

// Reusable, self-contained status/health pill for the Measured Dataset Manager.
// tone: "good" | "warn" | "bad"
const TONE_STYLES = {
  good: { bg: "#E6F4EA", text: "#1E7B34" },
  warn: { bg: "#FFF4E0", text: "#8A5A00" },
  bad: { bg: "#FCE8E6", text: "#B3261E" },
};

export default function DatasetStatusBadge({ label, tone = "good" }) {
  const style = TONE_STYLES[tone] || TONE_STYLES.good;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        background: style.bg,
        color: style.text,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}