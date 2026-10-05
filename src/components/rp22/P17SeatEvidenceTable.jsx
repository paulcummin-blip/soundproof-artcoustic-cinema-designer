/**
 * P17SeatEvidenceTable.jsx
 * ------------------------
 * READ-ONLY P17 evidence, one limiting row per seat:
 *
 *   Seat | Result | Cause | Limiting speaker | Model | Seat angle | RSP angle |
 *   Raw variance | Coverage limit | Cap applied
 *
 * Cause is stated in plain language: "Raw variance", "Coverage cap" or
 * "Missing evidence". Each seat row expands to every speaker evaluated at that
 * seat (P17SpeakerBreakdownTable).
 *
 * Presentation only: it recomputes nothing, grades nothing and writes nothing;
 * missing evidence renders as "—" and is never inferred.
 */

import React, { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import P17SpeakerBreakdownTable from "./P17SpeakerBreakdownTable";

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

/** The three stated causes. Anything unreadable is reported, never guessed. */
const CAUSE_TEXT = (row) => {
  if (!row.evidenceAvailable) return "Missing evidence";
  if (row.capApplied) return "Coverage cap";
  if (row.cause === "raw_variance") return "Raw variance";
  return "Missing evidence";
};

const COLUMNS = [
  "Seat", "Result", "Cause", "Limiting speaker", "Model",
  "Seat angle", "RSP angle", "Raw variance", "Coverage limit", "Cap applied",
];

export default function P17SeatEvidenceTable({ rows = [] }) {
  const [expanded, setExpanded] = useState({});

  if (!rows.length) {
    return <div style={{ fontSize: 11, color: "#9B8E82" }}>No P17 seat evidence available.</div>;
  }

  const toggle = (seatId) => setExpanded((previous) => ({ ...previous, [seatId]: !previous[seatId] }));

  return (
    <div style={{ overflowX: "auto", border: "1px solid #DCDBD6", borderRadius: 6, background: "#fff" }}>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            {COLUMNS.map((label) => <th key={label} style={{ ...HEAD, textAlign: "left" }}>{label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isOpen = !!expanded[row.seatId];
            const speakerCount = Array.isArray(row.speakers) ? row.speakers.length : 0;
            return (
              <React.Fragment key={row.seatId}>
                <tr>
                  <td style={{ ...CELL, fontWeight: 600, color: "#1B1A1A" }}>
                    <button
                      type="button"
                      onClick={() => toggle(row.seatId)}
                      aria-expanded={isOpen}
                      title={speakerCount ? "Show every speaker evaluated at this seat" : "No per-speaker evidence for this seat"}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 4, background: "none",
                        border: "none", padding: 0, cursor: speakerCount ? "pointer" : "default",
                        font: "inherit", fontWeight: 600, color: "#1B1A1A",
                      }}
                    >
                      {speakerCount ? (isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : <span style={{ width: 12 }} />}
                      {row.seatLabel}
                    </button>
                    <span style={{ ...MUTED, fontWeight: 400, marginLeft: 5, fontSize: 9.5 }}>{row.seatId}</span>
                  </td>
                  <td style={{ ...CELL, ...NUM, fontWeight: 700, color: "#213428" }}>
                    {row.evidenceAvailable ? (row.level || "—") : "—"}
                  </td>
                  <td style={{
                    ...CELL,
                    fontWeight: row.capApplied ? 700 : 400,
                    color: row.capApplied ? "#8B4A2B" : (row.evidenceAvailable ? "#3E4349" : "#9B8E82"),
                  }}>
                    {CAUSE_TEXT(row)}
                  </td>
                  <td style={{ ...CELL, fontWeight: 600 }}>{row.limitingRole || "—"}</td>
                  <td style={{ ...CELL, ...MUTED }}>{row.limitingModel || "—"}</td>
                  <td style={{ ...CELL, ...NUM }}>{fmt(row.seatAngleDeg)}</td>
                  <td style={{ ...CELL, ...NUM }}>{fmt(row.rspAngleDeg)}</td>
                  <td style={{ ...CELL, ...NUM }}>{fmt(row.rawVarianceDb, 2)}</td>
                  <td style={{ ...CELL, ...NUM }}>{fmt(row.coverageLimitDeg, 0)}</td>
                  <td style={{
                    ...CELL,
                    fontWeight: row.capApplied ? 700 : 400,
                    color: row.capApplied ? "#8B4A2B" : "#3E4349",
                  }}>
                    {row.evidenceAvailable ? (row.capApplied ? "Yes" : "No") : "—"}
                  </td>
                </tr>
                {isOpen && (
                  <tr>
                    <td colSpan={COLUMNS.length} style={{ padding: "5px 8px 9px 8px", background: "#FBFAF7", borderBottom: "1px solid #F0EFEA" }}>
                      <P17SpeakerBreakdownTable speakers={row.speakers || []} worstRole={row.limitingRole} />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}