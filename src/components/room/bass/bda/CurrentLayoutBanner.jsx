// CurrentLayoutBanner.jsx
// ---------------------------------------------------------------------------
// Compact summary shown after the designer applies a starting layout.
//
//   Current Layout
//   4 Subwoofers — Quarter Layout
//   [Change]
//
// Selecting Change restores the three layout cards (handled by parent).
// ---------------------------------------------------------------------------

import React from "react";
import { RefreshCw } from "lucide-react";

function deriveLayoutLabel(subwooferInstances) {
  const enabled = (Array.isArray(subwooferInstances) ? subwooferInstances : [])
    .filter((s) => s?.enabled !== false);
  const count = enabled.length;
  if (count === 0) return null;

  // Derive a simple layout name from positions
  const placements = enabled.map((s) => {
    const group = s?.group || s?.legacyGroup;
    if (group === "rear") return "rear";
    if (group === "left") return "left";
    if (group === "right") return "right";
    return "front";
  });
  const uniquePlacements = [...new Set(placements)].sort();

  let layoutName;
  if (count === 1) layoutName = "Single";
  else if (count === 2) {
    if (uniquePlacements.includes("front") && uniquePlacements.includes("rear")) layoutName = "Front-Rear";
    else if (uniquePlacements.includes("left") && uniquePlacements.includes("right")) layoutName = "Left-Right";
    else layoutName = "Pair";
  } else if (count === 4) {
    if (uniquePlacements.length >= 3) layoutName = "Quarter";
    else if (uniquePlacements.includes("front") && uniquePlacements.includes("rear")) layoutName = "Front-Rear";
    else layoutName = "Four-Point";
  } else {
    layoutName = `${count}-Point`;
  }

  return { count, layoutName };
}

export default function CurrentLayoutBanner({ subwooferInstances, onChange }) {
  const layout = deriveLayoutLabel(subwooferInstances);
  if (!layout) return null;

  return (
    <div
      className="flex items-center justify-between gap-3 rounded-lg border border-[#213428] bg-[#F3F1EC] px-4 py-3"
      data-bda-stage="current-layout"
    >
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-[#625143]">Current Layout</div>
        <div className="mt-0.5 text-[14px] font-semibold text-[#1B1A1A]" style={{ fontFamily: "Didact Gothic, sans-serif" }}>
          {layout.count} Subwoofer{layout.count > 1 ? "s" : ""} — {layout.layoutName}
        </div>
      </div>
      <button
        type="button"
        onClick={onChange}
        className="flex items-center gap-1.5 rounded-md border border-[#D9D5CE] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#213428] transition-colors hover:bg-[#F5F5F0]"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Change
      </button>
    </div>
  );
}