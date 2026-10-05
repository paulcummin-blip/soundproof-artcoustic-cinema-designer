/**
 * P17SpeakerBreakdownTable.jsx
 * ----------------------------
 * READ-ONLY per-speaker P17 evidence for one seat: the speaker role, the seat angle
 * against the aimed acoustic axis, the same angle at the RSP, and the seat-versus-RSP
 * delta that P17 grades.
 *
 * Presentation only. It recomputes nothing, grades nothing and writes nothing;
 * evidence a record does not carry renders as "—" and is never inferred.
 *
 * Used by the ADI Data P17 panel and by the P17 parameter tooltip, so the same
 * evidence is shown the same way in both places.
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

const num = (value) => (typeof value === "number" && Number.isFinite(value) ? value : null);
const fmt = (value, digits = 1) => {
  const v = num(value);
  return v == null ? "—" : v.toFixed(digits);
};

const COLUMNS = ["Speaker", "Model", "Seat angle", "RSP angle", "Delta"];

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
                <td style={{ ...CELL, ...NUM }}>{fmt(speaker.angleDeg)}</td>
                <td style={{ ...CELL, ...NUM }}>{fmt(speaker.rspAngleDeg)}</td>
                <td style={{
                  ...CELL,
                  ...NUM,
                  fontWeight: isWorst ? 700 : 400,
                  color: isWorst ? "#8B4A2B" : "#3E4349",
                }}>
                  {fmt(speaker.lossDb)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}