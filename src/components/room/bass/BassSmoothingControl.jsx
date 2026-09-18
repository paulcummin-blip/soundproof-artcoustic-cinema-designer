import React from "react";
import { bassSmoothingLabel } from "@/components/room/bass/bassGraphSmoothing";

// Canonical P19/P20 assessment uses 1/3-octave power-domain smoothing
// (applyBassSmoothing(..., "third")). The bass graph defaults to the same
// canonical view so the displayed curve visually matches the published
// P19/P20 result. "None" remains available as raw diagnostic detail, with a
// subtle reminder that published grading uses 1/3-octave smoothing.
const OPTIONS = [
  { value: "none", label: "None" },
  { value: "sixth", label: "1/6 octave" },
  { value: "third", label: "1/3 octave" },
  { value: "octave", label: "1 octave" },
];

export default function BassSmoothingControl({ value, onChange }) {
  const isNone = value === "none";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <span style={{ fontSize: 11, color: "#625143", fontFamily: "monospace" }}>Smoothing:</span>
      <select
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        aria-label="Bass graph smoothing"
        style={{
          height: 26,
          borderRadius: 6,
          border: `1px solid ${isNone ? "#CBD5E1" : "#213428"}`,
          background: isNone ? "#F8F8F7" : "#EFF6F1",
          fontSize: 11,
          padding: "0 6px",
          color: "#1B1A1A",
          fontFamily: "monospace",
          cursor: "pointer",
          fontWeight: isNone ? 400 : 600,
        }}
      >
        {OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      {isNone && (
        <span
          style={{
            fontSize: 10,
            color: "#8B7F76",
            fontFamily: "monospace",
            fontStyle: "italic",
          }}
        >
          Published P19/P20 use 1/3-octave smoothing.
        </span>
      )}
      <span style={{ fontSize: 10, color: "#8B7F76", fontFamily: "monospace" }}>
        ({bassSmoothingLabel(value)})
      </span>
    </div>
  );
}