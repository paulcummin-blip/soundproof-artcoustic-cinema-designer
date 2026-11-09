// SpeakerLibraryTable.jsx
//
// The Speaker Comparison Library table: one row per competitor loudspeaker, with
// the values the designer's comparison runs on and the retail price it shows.
// Presentation only — it reads library rows and reports the administrator's
// intent back; it never writes anything.

import React from "react";
import { Pencil, Trash2 } from "lucide-react";
import {
  dataStatus,
  evidenceCell,
  maxSplCell,
  powerCell,
  priceText,
  sensitivityCell,
  sourceUrl,
  statusText,
} from "./speakerLibraryDisplay";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#3E4349",
  hint: "#625143",
  border: "#DCDBD6",
  soft: "#F1F0EE",
  panel: "#FFFFFF",
};

const COLUMNS = [
  "Brand",
  "Product",
  "Sensitivity",
  "Power / amplifier",
  "Max SPL",
  "Price inc VAT",
  "Data status",
  "Source",
  "",
];

function Cell({ children, muted = false, strong = false, tone = null }) {
  return (
    <td style={{ padding: "10px 12px", fontSize: 13, color: tone || (muted ? BRAND.hint : BRAND.text), fontWeight: strong ? 600 : 400, verticalAlign: "top" }}>
      {children}
    </td>
  );
}

export default function SpeakerLibraryTable({ rows, loading, error, onEdit, onDelete }) {
  if (error) {
    return <div style={{ padding: 18, border: `1px solid ${BRAND.border}`, borderRadius: 12, background: BRAND.panel, color: "#7A1E19", fontSize: 13 }}>{error}</div>;
  }
  if (loading && rows.length === 0) {
    return <div style={{ padding: 18, border: `1px solid ${BRAND.border}`, borderRadius: 12, background: BRAND.panel, color: BRAND.subtext, fontSize: 13 }}>Loading speakers…</div>;
  }
  if (rows.length === 0) {
    return <div style={{ padding: 18, border: `1px solid ${BRAND.border}`, borderRadius: 12, background: BRAND.panel, color: BRAND.subtext, fontSize: 13 }}>No speaker matches this search.</div>;
  }

  return (
    <div style={{ border: `1px solid ${BRAND.border}`, borderRadius: 12, background: BRAND.panel, overflowX: "auto" }}>
      <table style={{ width: "100%", minWidth: 1040, borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: BRAND.soft }}>
            {COLUMNS.map((label, index) => (
              <th
                key={label || `actions-${index}`}
                style={{
                  textAlign: "left",
                  padding: "10px 12px",
                  fontSize: 10,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: BRAND.hint,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                }}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const maxSpl = maxSplCell(row);
            const status = dataStatus(row);
            const url = sourceUrl(row);
            return (
              <tr key={row.key} style={{ borderTop: `1px solid ${BRAND.soft}` }}>
                <Cell>{row.manufacturer || "—"}</Cell>
                <Cell strong>
                  {row.model || "—"}
                  <div style={{ fontSize: 11, color: BRAND.hint, marginTop: 2, fontWeight: 400 }}>{statusText(row)}</div>
                </Cell>
                <Cell>{sensitivityCell(row)}</Cell>
                <Cell>{powerCell(row)}</Cell>
                <Cell>
                  {maxSpl.text}
                  {maxSpl.note && <div style={{ fontSize: 11, color: BRAND.hint, marginTop: 2 }}>{maxSpl.note}</div>}
                </Cell>
                <Cell>{priceText(row)}</Cell>
                <Cell>
                  <span style={{ fontWeight: 600, color: status.tone }}>{status.label}</span>
                </Cell>
                <Cell>
                  {url
                    ? <a href={url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "#2C5AA0", textDecoration: "none" }}>link</a>
                    : <span style={{ color: BRAND.hint }}>—</span>}
                </Cell>
                <Cell>
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      onClick={() => onEdit(row)}
                      title="Edit this speaker"
                      style={{ display: "inline-flex", alignItems: "center", gap: 5, border: `1px solid ${BRAND.border}`, borderRadius: 8, background: "#FFF", color: BRAND.text, padding: "6px 10px", fontSize: 12, fontFamily: "inherit", cursor: "pointer" }}
                    >
                      <Pencil size={13} /> Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(row)}
                      title="Remove from the comparison library"
                      style={{ display: "inline-flex", alignItems: "center", gap: 5, border: `1px solid ${BRAND.border}`, borderRadius: 8, background: "#FFF", color: "#7A1E19", padding: "6px 10px", fontSize: 12, fontFamily: "inherit", cursor: "pointer" }}
                    >
                      <Trash2 size={13} /> Delete
                    </button>
                  </div>
                </Cell>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}