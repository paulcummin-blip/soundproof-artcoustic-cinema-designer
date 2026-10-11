// AdiTestedSection.jsx
// ---------------------------------------------------------------------------
// LAYER 3b — WHAT ADI TESTED, in one compact list.
//
// Every lever ADI evaluated, split into the two kinds of change so a calibration
// lever is never read beside a physical move:
//
//   Calibration: delay · gain · phase · polarity   (ADI may apply these)
//   Design:      placement · layout · sub option · seating · absorption advice
//
// This is a summary, not the evidence: the per-lever outcome text, the
// per-family counts and the rejection reasons stay in the detailed table and the
// run evidence inside Engineer details. Nothing is reordered, omitted or
// re-evaluated here — the rows arrive resolved by the summary authority.
// ---------------------------------------------------------------------------

import React from "react";
import {
  ADI_SECTION_GROUP,
  ADI_SECTION_TITLE,
  ADI_TESTED_NOTHING,
  buildAdiTestedGroups,
} from "./adiPanelSections.js";

function Group({ title, rows }) {
  if (!rows.length) return null;
  return (
    <div className="space-y-0.5">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">{title}</div>
      {rows.map((row) => (
        <div key={row.key} className="flex flex-wrap items-baseline gap-x-2 text-[11px] leading-snug">
          <span className="text-[#3E4349]">{row.label}:</span>
          <span className="font-semibold text-[#1B1A1A]">{row.status}</span>
          {row.note && <span className="text-[#625143]">{row.note}</span>}
        </div>
      ))}
    </div>
  );
}

export default function AdiTestedSection({ rows = [], className = "" }) {
  const { calibration, design } = buildAdiTestedGroups(rows);

  return (
    <div
      className={`space-y-1.5 rounded-md border border-[#E7E5E0] bg-white px-3 py-2 ${className}`}
      data-adi-section="tested"
      data-adi-tested-compact="true"
    >
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">
        {ADI_SECTION_TITLE.TESTED}
      </div>

      {calibration.length === 0 && design.length === 0 ? (
        <div className="text-[11px] text-[#8A7B6A] leading-relaxed">{ADI_TESTED_NOTHING}</div>
      ) : (
        <>
          <Group title={ADI_SECTION_GROUP.CALIBRATION} rows={calibration} />
          <Group title={ADI_SECTION_GROUP.DESIGN} rows={design} />
        </>
      )}
    </div>
  );
}