// AdiTestedOptionsTable.jsx
// ---------------------------------------------------------------------------
// "What ADI tested" — the levers ADI evaluates, in the fixed least-intrusive
// order (delay · gain · polarity · placement · layout · seating), with the
// low-frequency absorption advice row appended after them. A capability the
// optimiser does not evaluate is never a row here.
//
// Two rules this table only obeys, never decides:
//   • Once a pass has completed, no row reads "Not yet run": every supported
//     lever states its own outcome (Tested · Recommended · Rejected ·
//     Trade-off · Combined only · Not applicable · Not yet supported).
//   • Only a Recommended row carries an Apply. Tested, Trade-off, Rejected,
//     theoretical-only and advice rows carry their own note or nothing at all.
//
// Presentation only: no ids, no coordinates, no decimals, no paragraphs. Every
// value arrives from adiDesignerSummary.js, which reads the saved plan.
// ---------------------------------------------------------------------------

import React from "react";
import { ADI_TESTED_TITLE } from "./adiDesignerSummary.js";

const COLUMN = "grid grid-cols-[92px_112px_1fr_200px] items-baseline gap-x-3";

export default function AdiTestedOptionsTable({ summary = null, className = "" }) {
  const rows = Array.isArray(summary?.rows) ? summary.rows : [];
  if (!rows.length) return null;

  return (
    <div className={`rounded-md border border-[#E7E5E0] bg-white px-3 py-2 ${className}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">
        {ADI_TESTED_TITLE}
      </div>

      <div className="mt-1.5 space-y-1">
        {rows.map((row) => {
          const recommended = row.action === "apply";
          return (
            <div key={row.key} className={`${COLUMN} text-[11px] leading-snug`}>
              <span className={`font-semibold ${recommended ? "text-[#213428]" : "text-[#1B1A1A]"}`}>
                {row.label}
              </span>
              <span className={recommended ? "font-semibold text-[#213428]" : "text-[#625143]"}>
                {row.status}
              </span>
              <span className="text-[#3E4349]">
                {row.outcome || "—"}
              </span>
              {/* Advice rows state what to review — never an Apply action. */}
              <span className={`justify-self-end text-right text-[10px] font-semibold leading-snug ${row.advice ? "text-[#625143]" : "uppercase tracking-wide text-[#213428]"}`}>
                {row.actionText || (row.action === "apply" ? "Apply" : "—")}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}