import React from "react";

const signed = (value) => Number.isFinite(value) ? `${value >= 0 ? "+" : ""}${value.toFixed(1)} dB` : "—";

export default function ProtectedNullNotice({ annotations = [] }) {
  if (!annotations.length) return null;
  return <div className="mt-2 space-y-2">{annotations.map((item) => {
    const modes = item.nearestModes.length ? item.nearestModes.map((mode) => `${mode.frequencyHz.toFixed(1)} Hz ${mode.type} (${mode.indices.join(",")})`).join("; ") : "None within 5 Hz";
    const details = `Raw depth relative to target: ${signed(item.rawDepthDb)}\nApplied EQ: ${signed(item.appliedEqDb)}\nRemaining residual: ${signed(item.remainingResidualDb)}\nProtected region: ${item.startHz.toFixed(1)}–${item.endHz.toFixed(1)} Hz\nNearest room modes: ${modes}\nProtection reason: ${item.reason}`;
    return <div key={item.frequencyHz} title={details} className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
      <div className="font-semibold">{item.label}</div>
      <div className="mt-1 text-[10px] text-amber-800">Hover for depth, EQ, residual, protected region, nearest modes and protection reason.</div>
    </div>;
  })}</div>;
}