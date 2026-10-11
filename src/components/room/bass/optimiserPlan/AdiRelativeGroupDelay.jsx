// AdiRelativeGroupDelay.jsx
// ---------------------------------------------------------------------------
// THE MAIN PANEL'S STATEMENT OF SUBWOOFER TIMING.
//
// Subwoofer timing is stated as a relative group offset — "Rear sub group
// +1 ms relative to the front group" — because bass summation depends on the
// timing relationship between the groups. The absolute processor delays are
// never led with here; they are kept in Engineer details
// (AdiAbsoluteGroupDelays.jsx) for traceability.
//
// Presentation only: every value arrives already resolved by
// relativeGroupDelayAuthority.js. It renders nothing when the groups are not
// recorded, so no offset is ever guessed at.
// ---------------------------------------------------------------------------

import React from "react";
import { RELATIVE_GROUP_DELAY_TITLE } from "./relativeGroupDelayAuthority.js";

export default function AdiRelativeGroupDelay({ display = null, className = "" }) {
  if (!display?.statement) return null;
  const rows = Array.isArray(display.relativeRows) ? display.relativeRows : [];

  return (
    <div className={`space-y-0.5 ${className}`} data-adi-relative-group-delay="true">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">
        {RELATIVE_GROUP_DELAY_TITLE}
      </div>
      <div
        className="text-[12px] font-semibold text-[#1B1A1A] leading-relaxed"
        data-adi-relative-group-delay-statement={display.statement}
      >
        {display.statement}
      </div>
      {rows.length > 0 && (
        <div className="text-[11px] text-[#3E4349] leading-relaxed">
          {rows.map((row) => `${row.label} ${row.text}`).join(" · ")}
        </div>
      )}
      <div className="text-[10px] text-[#8A7B6A] leading-relaxed">{display.note}</div>
    </div>
  );
}