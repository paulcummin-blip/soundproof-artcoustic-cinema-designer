// AdvancedDiagnosticsPanel.jsx
// Wrapper that renders the existing engineering workflow (Calculate button +
// Improve Bass Response V2 + diagnostics) behind the Advanced Diagnostics toggle.
//
// Normal users never see this. It is for development, validation, and support.

import React from "react";
import { Button } from "@/components/ui/button";
import BassTerminalStatus from "../BassTerminalStatus";
import BassPermanentSeatResults from "../BassPermanentSeatResults";
import CalculateAllTargetResults from "../CalculateAllTargetResults";
import ImproveBassResponseV2 from "../improveBassV2/ImproveBassResponseV2";

export default function AdvancedDiagnosticsPanel({
  shared,
  disabled,
  bassActionDisabled,
  roomDims,
  seatingPositions,
  subwooferInstances,
  frontSubsCfg,
  rearSubsCfg,
  commitInstances,
  commitSeating,
  commitSeatingProvenance,
  appliedSeatingProvenance,
  hasCanonicalInstances,
  appState,
  amplifierPowerPerSubW,
}) {
  const bassCalculationInProgress = shared?.calculationInProgress === true;
  const bassCalculationPhaseLabel = shared?.calculationPhaseLabel || null;
  const hasActiveSubModel = React.useMemo(() => {
    const instances = Array.isArray(subwooferInstances) ? subwooferInstances : [];
    return instances.some((i) => i?.enabled !== false && i?.model);
  }, [subwooferInstances]);

  return (
    <div className="rounded-md border border-[#DCDBD6] bg-[#FAFAF8] px-3 py-3 space-y-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">
        Engineering Diagnostics
      </div>

      {/* Manual Calculate button — the original engineering workflow */}
      <div>
        <button
          type="button"
          onClick={() => shared?.onCalculate?.()}
          disabled={bassActionDisabled}
          className="w-full rounded-lg bg-[#3E4349] px-4 py-2.5 text-[12px] font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-45"
        >
          {bassCalculationInProgress ? (bassCalculationPhaseLabel || "Calculating…") : "Calculate Parameter Results"}
        </button>
      </div>

      {/* P18 target preparation */}
      <CalculateAllTargetResults disabled={disabled || !hasActiveSubModel} />

      {/* Terminal status */}
      <BassTerminalStatus />

      {/* Permanent per-seat results */}
      <BassPermanentSeatResults />

      {/* Improve Bass Response V2 — the full engineering optimisation UI */}
      <ImproveBassResponseV2
        roomDims={roomDims}
        seatingPositions={seatingPositions}
        subwooferInstances={subwooferInstances}
        frontSubsCfg={frontSubsCfg}
        rearSubsCfg={rearSubsCfg}
        commitInstances={commitInstances}
        commitSeating={commitSeating}
        commitSeatingProvenance={commitSeatingProvenance}
        appliedSeatingProvenance={appliedSeatingProvenance}
        hasCanonicalInstances={hasCanonicalInstances}
        appState={appState}
        amplifierPowerPerSubW={amplifierPowerPerSubW}
      />
    </div>
  );
}