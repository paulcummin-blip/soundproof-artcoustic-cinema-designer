import React from "react";

const finite = (value) => value !== null && value !== "" && Number.isFinite(Number(value));

const MarkerItem = ({ color, dash, children }) => (
  <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
    <svg width="24" height="8" aria-hidden="true" style={{ flexShrink: 0 }}>
      <line
        x1="0"
        y1="4"
        x2="24"
        y2="4"
        stroke={color}
        strokeWidth="1.5"
        strokeDasharray={dash}
      />
    </svg>
    <span>{children}</span>
  </div>
);

export default function Rp22GraphMarkerKey({ markers }) {
  const hasP18 = finite(markers?.p18FrequencyHz);
  const hasBand = finite(markers?.p19StartHz) && finite(markers?.p19EndHz);
  const hasP19Worst = finite(markers?.p19WorstFrequencyHz);
  const hasP20Worst = finite(markers?.p20WorstFrequencyHz);
  if (!hasP18 && !hasBand && !hasP19Worst && !hasP20Worst) return null;

  return (
    <div
      role="note"
      aria-label="RP22 graph markers"
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "6px 16px",
        margin: "2px 0 6px",
        padding: "6px 10px",
        borderRadius: 6,
        border: "1px solid #E5E7EB",
        background: "#FFFFFF",
        color: "#475569",
        fontFamily: "monospace",
        fontSize: 9,
      }}
    >
      <strong style={{ color: "#1B1A1A" }}>RP22 markers</strong>
      {hasP18 && (
        <MarkerItem color="#2563EB" dash="5 4">
          P18 achieved extension · {Number(markers.p18FrequencyHz).toFixed(0)} Hz
        </MarkerItem>
      )}
      {hasBand && (
        <span>
          P19 / P20 assessment band · {Math.round(Number(markers.p19StartHz))}–{Math.round(Number(markers.p19EndHz))} Hz
        </span>
      )}
      {hasP19Worst && (
        <MarkerItem color="#B45309" dash="3 4">
          P19 worst point · {Number(markers.p19WorstFrequencyHz).toFixed(0)} Hz
        </MarkerItem>
      )}
      {hasP20Worst && (
        <MarkerItem color="#7C3AED" dash="3 4">
          P20 worst point{markers.p20WorstSeatId ? ` · ${markers.p20WorstSeatId}` : ""} · {Number(markers.p20WorstFrequencyHz).toFixed(0)} Hz
        </MarkerItem>
      )}
    </div>
  );
}
