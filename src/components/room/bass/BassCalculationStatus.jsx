// BassCalculationStatus.jsx — Status, timer, and progress display for the
// detailed bass calculation. Shows elapsed time, phase, progress, and Cancel
// control while calculating. Shows completion summary when done.

import React from "react";

function formatElapsed(ms) {
  const totalSec = Math.floor((ms || 0) / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export default function BassCalculationStatus({ status, progress, elapsedMs, error, detailedResult, onCancel }) {
  if (status === "CALCULATING") {
    const p = progress || {};
    return (
      <div style={{ border: "1px solid #93c5fd", borderRadius: 8, background: "#eff6ff", padding: "10px 14px", marginBottom: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#1e40af", marginBottom: 4 }}>
          Calculating detailed EQ &amp; RP22…
        </div>
        <div style={{ fontSize: 11, fontFamily: "monospace", color: "#1e3a8a", display: "flex", flexWrap: "wrap", gap: "6px 16px" }}>
          <span>Elapsed: {formatElapsed(elapsedMs)}</span>
          <span>Phase: {p.phase || "Preparing"}</span>
          <span>Progress: {p.completedRequests ?? 0} / {p.totalRequests ?? 0} candidate requests</span>
          {(p.uniqueCoreFits != null || p.bankEvaluations != null) && (
            <span>{p.uniqueCoreFits ?? 0} core fits / {p.bankEvaluations ?? 0} bank evals</span>
          )}
        </div>
        <button
          onClick={onCancel}
          style={{ marginTop: 6, height: 28, padding: "0 14px", borderRadius: 6, border: "1px solid #dc2626", background: "#fff", color: "#b91c1c", fontSize: 11, fontFamily: "monospace", cursor: "pointer", fontWeight: 600 }}
        >
          Cancel
        </button>
      </div>
    );
  }

  if (status === "COMPLETE" && detailedResult) {
    const p = progress || {};
    const secs = ((detailedResult.calculationTimeMs || 0) / 1000).toFixed(1);
    return (
      <div style={{ border: "1px solid #86efac", borderRadius: 8, background: "#f0fdf4", padding: "10px 14px", marginBottom: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#166534", marginBottom: 4 }}>
          Detailed calculation complete
        </div>
        <div style={{ fontSize: 11, fontFamily: "monospace", color: "#14532d" }}>
          Completed in: {secs} seconds
        </div>
        <div style={{ fontSize: 11, fontFamily: "monospace", color: "#15803d" }}>
          {p.totalRequests ?? 0} candidates / {p.uniqueCoreFits ?? 0} unique core fits / {p.bankEvaluations ?? 0} bank evaluations
        </div>
        {Number.isFinite(detailedResult.transferTimeMs) && detailedResult.transferTimeMs > 0 && (
          <div style={{ fontSize: 10, fontFamily: "monospace", color: "#16a34a" }}>
            Worker→main transfer: {detailedResult.transferTimeMs.toFixed(1)} ms
          </div>
        )}
      </div>
    );
  }

  return null;
}