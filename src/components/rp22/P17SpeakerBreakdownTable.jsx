/**
 * P17SpeakerBreakdownTable.jsx
 * ----------------------------
 * READ-ONLY per-speaker P17 evidence for one seat: the speaker role, the seat's
 * effective off-axis angle to that speaker, the coverage window that angle falls
 * in, the model's L4 / L3 / L2 windows, and the cause.
 *
 * The raw seat-versus-RSP response delta is kept as the final diagnostic column.
 * It never grades the seat — P17 is graded from the off-axis angle.
 *
 * Presentation only. It recomputes nothing, grades nothing and writes nothing;
 * evidence a record does not carry renders as "—" and is never inferred.
 *
 * Used by the ADI Data P17 panel and by the P17 parameter tooltip, so the same
 * evidence is shown the same way in both places.
 */

import React from "react";
import { P17_WINDOW_CAUSE_LABEL } from "@/components/utils/rp22/p17CoverageWindows";

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

const num = (value) => (typeof value === "number" && Number.isFinite(value) ? value : null);
const fmt = (value, digits = 1) => {
  const v = num(value);
  return v == null ? "—" : v.toFixed(digits);
};

/** A coverage window as "≤24°". */
const windowText = (value) => (
  typeof value === "number" && Number.isFinite(value) ? `≤${Math.round(value)}°` : "—"
);

const CAUSE_TEXT = (speaker) => (
  speaker.windowCause ? (P17_WINDOW_CAUSE_LABEL[speaker.windowCause] || "—") : "—"
);

const COLUMNS = [
  "Speaker", "Model", "Effective off-axis angle", "Level",
  "L4 / L3 / L2 windows", "Cause", "Raw Δ (diagnostic)",
];

export default function P17SpeakerBreakdownTable({ speakers = [], worstRole = null }) {
  if (!speakers.length) {
    return <div style={{ fontSize: 10.5, color: "#9B8E82" }}>No per-speaker P17 evidence for this seat.</div>;
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
          {speakers.map((speaker, index) => {
            const isWorst = !!worstRole && speaker.role === worstRole;
            return (
              <tr key={`${speaker.role || "speaker"}-${index}`}>
                <td style={{ ...CELL, fontWeight: isWorst ? 700 : 600, color: isWorst ? "#8B4A2B" : "#1B1A1A" }}>
                  {speaker.role || "—"}
                  {isWorst && <span style={{ fontWeight: 400, marginLeft: 4, fontSize: 9.5 }}>limiting</span>}
                  {speaker.beyondLimit && <span style={{ marginLeft: 4, fontSize: 9, color: "#9B8E82" }}>beyond −3 dB window</span>}
                </td>
                <td style={{ ...CELL, color: "#9B8E82" }}>{speaker.model || "—"}</td>
                <td style={{ ...CELL, ...NUM, fontWeight: isWorst ? 700 : 400 }}>
                  {fmt(speaker.angleDeg)}{speaker.angleDeg != null ? "°" : ""}
                </td>
                <td style={{ ...CELL, ...NUM, fontWeight: 700, color: "#213428" }}>{speaker.windowLevel || "—"}</td>
                <td style={{ ...CELL, ...NUM }}>
                  {windowText(speaker.windows?.l4Deg)} · {windowText(speaker.windows?.l3Deg)} · {windowText(speaker.windows?.l2Deg)}
                </td>
                <td style={{ ...CELL }}>{CAUSE_TEXT(speaker)}</td>
                <td style={{ ...CELL, ...NUM, color: "#9B8E82" }}>{fmt(speaker.lossDb)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}