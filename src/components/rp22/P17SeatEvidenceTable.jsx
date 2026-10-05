/**
 * P17SeatEvidenceTable.jsx
 * ------------------------
 * READ-ONLY P17 evidence, one row per seat — the design-guide basis:
 *
 *   Seat | Result | Limiting speaker | Model | Effective off-axis angle |
 *   L4 window | L3 window | L2 / usable window | Cause | Evidence type
 *
 * P17 is a design guide based on off-axis suitability: each model's coverage
 * windows are the angles at which it is approximately 1.5 dB / 3 dB / 4 dB down,
 * and the seat is graded from the effective off-axis angle of the channel that
 * covers it. The raw seat-versus-RSP response delta is kept as a read-only
 * diagnostic inside each expanded row — it never grades the seat.
 *
 * Each seat row expands to every speaker evaluated at that seat
 * (P17SpeakerBreakdownTable).
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

/** The cause, in the panel's own words. Anything unreadable is reported, never guessed. */
const CAUSE_TEXT = (row) => row.windowCauseLabel || "Missing evidence";

/** A coverage window as "≤24°". */
const windowText = (value) => (
  typeof value === "number" && Number.isFinite(value) ? `≤${Math.round(value)}°` : "—"
);

/** How the windows were established: measured-derived, estimated or missing. */
const EVIDENCE_TEXT = (row) => (row.evidenceAvailable ? (row.evidenceType || "—") : "missing");

/** A seat outside every channel's usable window is the actionable case. */
const isOutsideCoverage = (row) => row.evidenceAvailable && row.windowCause === "outside_usable_window";

/** The product's built-in tilt and the axis the effective angle is measured from. */
const tiltText = (row) => {
  if (!row.evidenceAvailable || row.builtInTiltDeg == null) return "—";
  const basis = row.axisBasis === "wall_normal" ? "wall normal" : "acoustic axis";
  return `${Math.round(row.builtInTiltDeg)}° · ${basis}`;
};

/**
 * The axis arithmetic, spelled out: the built-in tilt is applied to the ceiling normal to
 * form the acoustic axis, so a seat can sit a long way from ceiling vertical yet close to
 * 0° off the axis. It is never a subtraction from the geometric ceiling angle.
 */
const axisLine = (row) => {
  if (!row.evidenceAvailable || row.builtInTiltDeg == null || row.geometricAngleDeg == null) return null;
  const model = row.limitingModel || row.limitingRole || "The speaker";
  const rsp = row.rspGeometricAngleDeg != null
    ? ` Geometric angle to the RSP: ${Math.round(row.rspGeometricAngleDeg)}°.`
    : "";
  const effective = row.effectiveAngleDeg != null
    ? ` Effective off-axis angle: ${Math.round(row.effectiveAngleDeg)}°.`
    : "";
  return `${model} built-in tilt: ${Math.round(row.builtInTiltDeg)}°.`
    + ` Geometric angle from ceiling vertical to ${row.seatLabel}: ${Math.round(row.geometricAngleDeg)}°.`
    + rsp + effective;
};

const COLUMNS = [
  "Seat", "Result", "Limiting speaker", "Model", "Effective off-axis angle",
  "Geometric angle", "Built-in tilt / axis",
  "L4 window", "L3 window", "L2 / usable window", "Cause", "Evidence type",
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
                  <td style={{ ...CELL, fontWeight: 600 }}>{row.limitingRole || "—"}</td>
                  <td style={{ ...CELL, ...MUTED }}>{row.limitingModel || "—"}</td>
                  <td style={{ ...CELL, ...NUM, fontWeight: 700 }}>
                    {fmt(row.effectiveAngleDeg)}
                    <span style={{ ...MUTED, fontWeight: 400 }}>{row.effectiveAngleDeg != null ? "°" : ""}</span>
                  </td>
                  <td style={{ ...CELL, ...NUM }}>
                    {fmt(row.geometricAngleDeg)}
                    <span style={{ ...MUTED, fontWeight: 400 }}>{row.geometricAngleDeg != null ? "°" : ""}</span>
                  </td>
                  <td style={{ ...CELL, ...MUTED }}>{tiltText(row)}</td>
                  <td style={{ ...CELL, ...NUM }}>{windowText(row.windows?.l4Deg)}</td>
                  <td style={{ ...CELL, ...NUM }}>{windowText(row.windows?.l3Deg)}</td>
                  <td style={{ ...CELL, ...NUM }}>{windowText(row.windows?.l2Deg)}</td>
                  <td style={{
                    ...CELL,
                    fontWeight: isOutsideCoverage(row) ? 700 : 400,
                    color: isOutsideCoverage(row) ? "#8B4A2B" : (row.evidenceAvailable ? "#3E4349" : "#9B8E82"),
                  }}>
                    {CAUSE_TEXT(row)}
                  </td>
                  <td style={{ ...CELL, ...MUTED }}>{EVIDENCE_TEXT(row)}</td>
                </tr>
                {isOpen && (
                  <tr>
                    <td colSpan={COLUMNS.length} style={{ padding: "5px 8px 9px 8px", background: "#FBFAF7", borderBottom: "1px solid #F0EFEA" }}>
                      {axisLine(row) && (
                        <div style={{ fontSize: 9.5, color: "#3E4349", marginBottom: 3 }}>
                          {axisLine(row)}
                        </div>
                      )}
                      <div style={{ fontSize: 9.5, color: "#9B8E82", marginBottom: 5 }}>
                        Design-guide windows for the deciding channel
                        {row.windows?.source ? ` — ${row.windows.source}` : ""}.
                        <span style={{ marginLeft: 6 }}>
                          Read-only diagnostics: seat-versus-RSP response delta {fmt(row.rawVarianceDb, 2)} dB
                          {row.coverageLimitDeg != null ? `; model −3 dB window ${fmt(row.coverageLimitDeg, 0)}°` : ""}.
                        </span>
                      </div>
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