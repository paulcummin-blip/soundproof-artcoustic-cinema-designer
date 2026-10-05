/**
 * P17VersionComparisonTable.jsx
 * -----------------------------
 * READ-ONLY P17 comparison across saved project versions.
 *
 * Version | Seat | P17 level | Basis | Limiting speaker | Model |
 * Effective off-axis angle | L4 window | L3 window | L2 / usable window |
 * Cause | Evidence type
 *
 * It renders saved evidence only. A version with no saved engineering evidence is
 * listed as unavailable — never generated, never written. A version saved before
 * the design-guide method is labelled with its own basis rather than re-graded.
 */

import React from "react";

const CELL = {
  padding: "3px 6px",
  fontSize: 10.5,
  color: "#3E4349",
  whiteSpace: "nowrap",
  borderBottom: "1px solid #F0EFEA",
};
const HEAD = {
  ...CELL,
  fontWeight: 700,
  color: "#625143",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  fontSize: 9.5,
  borderBottom: "1px solid #DCDBD6",
};
const NUM = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" };

const fmt = (value) => (typeof value === "number" && Number.isFinite(value) ? value.toFixed(1) : "—");

/** A coverage window as "≤24°". */
const windowText = (value) => (
  typeof value === "number" && Number.isFinite(value) ? `≤${Math.round(value)}°` : "—"
);

/** Which method graded the saved row: the coverage windows, or the earlier variance basis. */
const BASIS_TEXT = (row) => (
  row.basis === "coverage_window"
    ? "Coverage window"
    : row.basis === "earlier_variance_basis"
      ? "Earlier variance basis"
      : "—"
);

const CAUSE_TEXT = (row) => (row.evidenceAvailable ? (row.windowCauseLabel || "—") : "Missing evidence");

const EVIDENCE_TEXT = (row) => (row.evidenceAvailable ? (row.evidenceType || "—") : "missing");

const COLUMNS = [
  "Version", "Seat", "P17 level", "Basis", "Limiting speaker", "Model",
  "Effective off-axis angle", "L4 window", "L3 window", "L2 / usable window",
  "Cause", "Evidence type",
];

export default function P17VersionComparisonTable({ versions = [] }) {
  if (!versions.length) return null;

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {versions.map((version) => (
        <div key={version.label}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#1B1A1A", marginBottom: 3 }}>
            {version.label}
            {version.status === "no_evidence" && <span style={{ fontWeight: 400, color: "#8B4A2B" }}> — no saved P17 evidence (unavailable)</span>}
            {version.status === "no_version" && <span style={{ fontWeight: 400, color: "#8B4A2B" }}> — not present in this project (unavailable)</span>}
          </div>
          {version.status === "available" ? (
            <div style={{ overflowX: "auto", border: "1px solid #DCDBD6", borderRadius: 6, background: "#fff" }}>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead>
                  <tr>{COLUMNS.map((label) => <th key={label} style={{ ...HEAD, textAlign: "left" }}>{label}</th>)}</tr>
                </thead>
                <tbody>
                  {version.rows.map((row) => (
                    <tr key={`${version.label}-${row.seatId}`}>
                      <td style={{ ...CELL, fontWeight: 600, color: "#1B1A1A" }}>{version.label}</td>
                      <td style={{ ...CELL }}>{row.seatLabel}</td>
                      <td style={{ ...CELL, ...NUM, fontWeight: 700, color: "#213428" }}>{row.level || "—"}</td>
                      <td style={{ ...CELL, color: row.basis === "earlier_variance_basis" ? "#8B4A2B" : "#3E4349" }}>{BASIS_TEXT(row)}</td>
                      <td style={{ ...CELL, fontWeight: 600 }}>{row.limitingRole || "—"}</td>
                      <td style={{ ...CELL, color: "#9B8E82" }}>{row.limitingModel || "—"}</td>
                      <td style={{ ...CELL, ...NUM }}>{fmt(row.effectiveAngleDeg)}</td>
                      <td style={{ ...CELL, ...NUM }}>{windowText(row.windows?.l4Deg)}</td>
                      <td style={{ ...CELL, ...NUM }}>{windowText(row.windows?.l3Deg)}</td>
                      <td style={{ ...CELL, ...NUM }}>{windowText(row.windows?.l2Deg)}</td>
                      <td style={{
                        ...CELL,
                        fontWeight: row.windowCause === "outside_usable_window" ? 700 : 400,
                        color: row.windowCause === "outside_usable_window" ? "#8B4A2B" : "#3E4349",
                      }}>{CAUSE_TEXT(row)}</td>
                      <td style={{ ...CELL, color: "#9B8E82" }}>{EVIDENCE_TEXT(row)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ fontSize: 10.5, color: "#9B8E82", fontStyle: "italic" }}>
              Read-only diagnostic: reported as unavailable rather than recomputed.
            </div>
          )}
        </div>
      ))}
    </div>
  );
}