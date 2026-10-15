// AdiSubwooferGroupingBlock.jsx
// ---------------------------------------------------------------------------
// Engineer details: the optimisation groups ADI read from this design.
//
// Read-only. It states how many subwoofers are active, how many optimisation
// groups the grouped phase / delay / gain searches act on, and which sources sit
// in each group — so every result below can be read against the layout it was
// searched on.
//
// The grouping itself is the ONE grouping authority's
// (improveBassV2/subwooferGroupAuthority): this component groups nothing, and
// changing a label here changes nothing about the search.
// ---------------------------------------------------------------------------

import React from "react";
import { describeSubwooferGrouping } from "../improveBassV2/subwooferGroupAuthority.js";

export default function AdiSubwooferGroupingBlock({
  instances = [],
  roomDims = null,
  className = "",
}) {
  const grouping = describeSubwooferGrouping(instances, roomDims);

  // A single source has no inter-sub grouping to state, and a layout whose
  // grouping cannot be read is reported where it blocks the search — never
  // invented here.
  if (grouping.status !== "eligible" || grouping.activeCount < 2) return null;

  return (
    <div className={className} data-adi-subwoofer-grouping={grouping.status}>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">
        Subwoofer groups
      </div>
      <div className="mt-0.5 text-[11px] text-[#3E4349] leading-relaxed">
        {grouping.activeCount} active subwoofers · {grouping.groupCount}{" "}
        optimisation {grouping.groupCount === 1 ? "group" : "groups"}
      </div>
      <div className="mt-1 space-y-0.5">
        {grouping.rows.map((row) => (
          <div key={row.id} className="flex gap-2 text-[11px] leading-relaxed">
            <span className="w-32 shrink-0 font-semibold text-[#1B1A1A]">{row.label}</span>
            <span className="text-[#3E4349]">{row.sourceText}</span>
          </div>
        ))}
      </div>
    </div>
  );
}