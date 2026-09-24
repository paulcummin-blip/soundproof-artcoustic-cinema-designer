// CurrentSystemSummary.jsx
// ---------------------------------------------------------------------------
// Compact hardware summary shown at the top of the Subwoofer Design workflow.
// Does NOT duplicate hardware configuration — shows what's configured in Speakers.
// Includes a "Change" link that returns the user to the Speakers section.
// ---------------------------------------------------------------------------

import React from "react";
import { Settings2 } from "lucide-react";
import { subwooferDisplayLabel } from "@/components/utils/subwooferDisplayLabel";

export default function CurrentSystemSummary({ frontModel, frontCount, rearModel, rearCount, onChangeConfig }) {
  const hasFront = frontCount > 0 && frontModel;
  const hasRear = rearCount > 0 && rearModel;

  if (!hasFront && !hasRear) {
    return (
      <div className="rounded-lg border border-dashed border-[#C9C2B8] bg-[#F8F7F4] px-4 py-3">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-[#625143]">Current System</div>
        <div className="mt-0.5 text-[12px] text-[#625143]">No subwoofers configured.</div>
        <button
          type="button"
          onClick={onChangeConfig}
          className="mt-1 text-[11px] font-semibold text-[#213428] underline underline-offset-2 hover:no-underline"
        >
          Configure in Speakers
        </button>
      </div>
    );
  }

  const totalCount = (frontCount || 0) + (rearCount || 0);
  const sameModel = frontModel === rearModel;
  const modelLabel = subwooferDisplayLabel(frontModel);

  const systemLabel = sameModel
    ? `${modelLabel} ×${totalCount}`
    : `${subwooferDisplayLabel(frontModel)} ×${frontCount}${hasRear ? ` + ${subwooferDisplayLabel(rearModel)} ×${rearCount}` : ""}`;

  return (
    <div className="rounded-lg border border-[#D9D5CE] bg-[#F8F7F4] px-4 py-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[#625143]">Current System</div>
          <div className="mt-0.5 text-[14px] font-semibold text-[#1B1A1A]" style={{ fontFamily: "Didact Gothic, sans-serif" }}>
            {systemLabel}
          </div>
          <div className="text-[11px] text-[#8A7B6A]">Configured in Speakers</div>
        </div>
        <button
          type="button"
          onClick={onChangeConfig}
          className="flex items-center gap-1.5 rounded-md border border-[#D9D5CE] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#213428] transition-colors hover:bg-[#F5F5F0]"
        >
          <Settings2 className="h-3.5 w-3.5" />
          Change
        </button>
      </div>
    </div>
  );
}