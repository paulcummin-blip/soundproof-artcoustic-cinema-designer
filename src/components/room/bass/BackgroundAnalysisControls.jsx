import React from "react";
import BassCalculationStatus from "@/components/room/bass/BassCalculationStatus";

export default function BackgroundAnalysisControls({ lifecycle, onRecalculate, disabled, includeDiagnostics, onDiagnosticsChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <button
        onClick={onRecalculate}
        disabled={disabled}
        style={{ height: 28, padding: "0 14px", borderRadius: 6, border: "1px solid #213428", background: "#213428", color: "#fff", fontSize: 11, fontFamily: "monospace", cursor: "pointer", fontWeight: 600, opacity: disabled ? 0.6 : 1 }}
      >
        Recalculate detailed EQ &amp; RP22
      </button>
      <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "#625143", fontFamily: "monospace", cursor: "pointer" }}>
        <input type="checkbox" checked={includeDiagnostics} onChange={(event) => onDiagnosticsChange(event.target.checked)} />
        Include engineering diagnostics
      </label>
      <BassCalculationStatus lifecycle={lifecycle} />
    </div>
  );
}