// StatusBadge.jsx
// Reusable coloured status badge for the investigation notebook UI.
// Valid statuses: ACTIVE, IN REVIEW, VERIFIED, RETIRED, FAILED.

import React from "react";

const STYLES = {
  ACTIVE: { bg: "#dbeafe", fg: "#1e40af", border: "#93c5fd" },
  "IN REVIEW": { bg: "#fef3c7", fg: "#92400e", border: "#fcd34d" },
  VERIFIED: { bg: "#dcfce7", fg: "#166534", border: "#86efac" },
  RETIRED: { bg: "#f3f4f6", fg: "#4b5563", border: "#d1d5db" },
  FAILED: { bg: "#fee2e2", fg: "#991b1b", border: "#fca5a5" },
};

export default function StatusBadge({ status, size = "md" }) {
  const s = STYLES[status] || STYLES.RETIRED;
  const isSm = size === "sm";
  return (
    <span
      style={{
        display: "inline-block",
        padding: isSm ? "1px 6px" : "2px 9px",
        borderRadius: 999,
        fontFamily: "monospace",
        fontWeight: 700,
        fontSize: isSm ? 9 : 10,
        letterSpacing: "0.03em",
        background: s.bg,
        color: s.fg,
        border: `1px solid ${s.border}`,
        whiteSpace: "nowrap",
      }}
    >
      {status}
    </span>
  );
}