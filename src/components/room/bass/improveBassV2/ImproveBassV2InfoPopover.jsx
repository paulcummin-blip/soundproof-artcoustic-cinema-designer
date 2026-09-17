// ImproveBassV2InfoPopover.jsx
// Info popover that shows the investigation details behind a small ⓘ button.
// Replaces the permanent "What Sound Proof checked" panel in the main UI.
//
// Shows: options checked, phase/delay/gain/placement/seating/combined candidates,
// canonical confirmations, and rejection reasons — expert diagnostic information.

import React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Info } from "lucide-react";
import ImproveBassV2CompletedInvestigation from "./ImproveBassV2CompletedInvestigation";

export default function ImproveBassV2InfoPopover({
  state,
  selection,
  stale,
  currentInstances,
  roomDims,
  appliedSeatingProvenance,
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-full p-1 text-[#8A7B6A] hover:text-[#213428] hover:bg-[#E7E4DF] transition-colors"
          data-info-popover-trigger="true"
          title="Investigation details"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[480px] max-h-[600px] overflow-y-auto p-0"
        side="bottom"
        align="start"
      >
        <ImproveBassV2CompletedInvestigation
          state={state}
          selection={selection}
          stale={stale}
          currentInstances={currentInstances}
          roomDims={roomDims}
          appliedSeatingProvenance={appliedSeatingProvenance}
        />
      </PopoverContent>
    </Popover>
  );
}