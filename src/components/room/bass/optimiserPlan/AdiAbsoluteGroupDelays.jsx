// AdiAbsoluteGroupDelays.jsx
// ---------------------------------------------------------------------------
// ENGINEER DETAILS — the absolute saved processor delays behind the relative
// group offset the main panel states.
//
// Traceability only: the applied values themselves, per physical group, with the
// signed relative offset beside them. The design's saved tuning is what it
// always was — this block reads it and never writes it.
//
// Presentation only: the values are resolved by relativeGroupDelayAuthority.js,
// the same authority the panel's relative statement reads, so the two can never
// state a different offset. Nothing is rendered when the groups are not
// recorded, so no value is ever guessed at.
// ---------------------------------------------------------------------------

import React from "react";
import {
  ABSOLUTE_GROUP_DELAY_TITLE,
  buildRelativeGroupDelays,
} from "./relativeGroupDelayAuthority.js";

function Row({ label, value }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 text-[11px] leading-relaxed">
      <span className="text-[#625143]">{label}:</span>
      <span className="font-semibold text-[#1B1A1A]">{value}</span>
    </div>
  );
}

export default function AdiAbsoluteGroupDelays({
  instances = [],
  settings = [],
  roomDims = null,
  // An already-resolved display may be passed in; otherwise this block resolves
  // it from the design's own delays and the decision's own applied rows.
  display = null,
  className = "",
}) {
  const resolved = display || buildRelativeGroupDelays({ instances, settings, roomDims });
  if (!resolved) return null;
  const rows = Array.isArray(resolved.absoluteRows) ? resolved.absoluteRows : [];
  if (rows.length === 0) return null;

  return (
    <div className={`space-y-0.5 ${className}`} data-adi-absolute-group-delays="true">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">
        {ABSOLUTE_GROUP_DELAY_TITLE}
      </div>
      {rows.map((row) => (
        <Row key={row.role || row.label} label={row.label} value={row.text} />
      ))}
      <Row
        label="Relative offset"
        value={resolved.offset ? `${resolved.offset.role} ${resolved.offset.text}` : "none — the groups are aligned"}
      />
    </div>
  );
}