/**
 * P17SeatEvidenceTable.jsx
 * ------------------------
 * READ-ONLY per-seat P17 evidence table.
 *
 * Presentation only: it renders the rows built by p17SeatEvidenceAuthority and
 * recomputes nothing. Missing evidence renders as "—" — it is never inferred.
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
const MUTED = { color: "#9B8E82" };

const fmt = (value, digits = 1) => (
  typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "—"
);

const CAUSE_TEXT = (row) => {
  if (row.capApplied) return "Coverage cap";
  if (row.cause === "raw_variance") return "Raw variance";
  return "—";
};

const COLUMNS = [
  "Seat", "P17 level", "Raw var dB", "Uncapped", "Cause", "Limiting", "Model",
  "Seat ∠", "RSP ∠", "Seat loss", "RSP loss", "Cov. limit", "N/A",
];

export default function P17SeatEvidenceTable({ rows = [] }) {
  if (!rows.length) {
    return <div style={{ fontSize: 11, color: "#9B8E82" }}>No P17 seat evidence available.</div>;
  }

  return (
    <div style={{ overflowX: "auto", border: "1px solid #DCDBD6", borderRadius: 6, background: "#fff" }}>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            {COLUMNS.map((label) => <th key={label} style={{ ...HEAD, textAlign: "left" }}>{label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.seatId}>
              <td style={{ ...CELL, fontWeight: 600, color: "#1B1A1A" }}>
                {row.seatLabel}
                <span style={{ ...MUTED, fontWeight: 400, marginLeft: 5, fontSize: 9.5 }}>{row.seatId}</span>
              </td>
              <td style={{ ...CELL, ...NUM, fontWeight: 700, color: "#213428" }}>{row.level || (row.evidenceAvailable ? "—" : "N/A")}</td>
              <td style={{ ...CELL, ...NUM }}>{fmt(row.rawVarianceDb, 2)}</td>
              <td style={{ ...CELL, ...NUM, ...MUTED }}>{row.uncappedLevel || "—"}</td>
              <td style={{ ...CELL, color: row.capApplied ? "#8B4A2B" : "#3E4349", fontWeight: row.capApplied ? 700 : 400 }}>
                {CAUSE_TEXT(row)}
              </td>
              <td style={{ ...CELL, fontWeight: 600 }}>{row.limitingRole || "—"}</td>
              <td style={{ ...CELL, ...MUTED }}>{row.limitingModel || "—"}</td>
              <td style={{ ...CELL, ...NUM }}>{fmt(row.seatAngleDeg)}</td>
              <td style={{ ...CELL, ...NUM }}>{fmt(row.rspAngleDeg)}</td>
              <td style={{ ...CELL, ...NUM }}>{fmt(row.seatLossDb)}</td>
              <td style={{ ...CELL, ...NUM }}>{fmt(row.rspLossDb)}</td>
              <td style={{ ...CELL, ...NUM }}>{fmt(row.coverageLimitDeg)}</td>
              <td style={{ ...CELL, color: row.evidenceAvailable && row.hasNaAngles ? "#8B4A2B" : "#3E4349" }}>
                {row.evidenceAvailable ? (row.hasNaAngles ? "Yes" : "No") : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}