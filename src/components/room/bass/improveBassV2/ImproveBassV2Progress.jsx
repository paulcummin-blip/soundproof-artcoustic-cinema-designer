// ImproveBassV2Progress.jsx
// Progress bar with phase labels and Cancel button for the V2 workflow.

import React from "react";
import { Button } from "@/components/ui/button";
import { Loader2, X } from "lucide-react";

const PHASE_ORDER = [
  "reviewing",
  "testing_positions",
  "optimising_timing",
  "testing_polarity",
  "balancing_levels",
  "confirming",
  "finalising",
];

export default function ImproveBassV2Progress({ state, onCancel }) {
  const { phase, phaseLabel, progressCurrent, progressTotal } = state;
  const phaseIndex = PHASE_ORDER.indexOf(phase);
  const phaseCount = PHASE_ORDER.length;
  const overallPct = phaseIndex >= 0
    ? Math.round(((phaseIndex + (progressTotal > 0 ? progressCurrent / progressTotal : 0)) / phaseCount) * 100)
    : 0;

  return (
    <div className="mt-3 rounded-md border border-[#E7E4DF] bg-[#F8F7F4] p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-[#213428]" />
          <span className="text-[12px] font-semibold text-[#213428]">{phaseLabel || "Working…"}</span>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onCancel}
          className="text-[11px]"
        >
          <X className="h-3 w-3 mr-1" />
          Cancel
        </Button>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#E0DDD7]">
        <div
          className="h-full rounded-full bg-[#213428] transition-all duration-300"
          style={{ width: `${Math.max(2, overallPct)}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[9px] text-[#8A7B6A]">
        <span>{phaseIndex >= 0 ? `Phase ${phaseIndex + 1} of ${phaseCount}` : ""}</span>
        <span>{overallPct}%</span>
      </div>
    </div>
  );
}