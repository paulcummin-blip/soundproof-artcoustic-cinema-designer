import React from "react";
import { getLevelColors } from "@/components/utils/rp22Colors";

export default function PrintRp23Pill({ level }) {
  const text = String(level || "").toUpperCase();
  const numeric = typeof level === "number" ? Math.max(0, Math.min(4, level))
    : text === "L1" ? 1 : text === "L2" ? 2 : text === "L3" ? 3 : text === "L4" ? 4 : text === "FAIL" ? 0 : -1;
  const label = numeric === -1 ? "—" : numeric === 0 ? "FAIL" : `L${numeric}`;
  const colors = numeric <= 0
    ? { bg: "#F3F4F6", border: "#E5E7EB", text: "#9CA3AF" }
    : getLevelColors(numeric);
  return (
    <span style={{
      border: `1px solid ${colors?.border || "#E5E7EB"}`,
      borderRadius: 6,
      padding: "6px 12px",
      fontSize: 13,
      fontWeight: 600,
      lineHeight: 1.2,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      background: colors?.bg || "#F3F4F6",
      color: colors?.text || "#9CA3AF",
      whiteSpace: "nowrap",
      minWidth: 40,
    }}>{label}</span>
  );
}