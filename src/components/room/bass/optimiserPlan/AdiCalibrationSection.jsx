// AdiCalibrationSection.jsx
// ---------------------------------------------------------------------------
// LAYER 2 — SAFE CALIBRATION ADJUSTMENTS.
//
// Calibration is what an installer sets on site: subwoofer delay, group delay,
// rear-sub offset, gain trim, polarity and all-pass phase. ADI may apply these
// on its own when the calibration decision authority confirms a safe
// improvement, so this section states exactly one of:
//
//   • the settings ADI applied, with the canonical P19/P20 before → after
//   • a calibration change that was confirmed but held for the designer
//   • the calibration already held in this design (with no invented history)
//   • that calibration was tested and no useful improvement was found
//   • that calibration has not been tested yet
//
// The section's own action is supplied by the caller (the panel passes it in),
// because only the panel knows whether this section owns the primary action.
// Presentation only: no calculation, no decision, no apply.
// ---------------------------------------------------------------------------

import React from "react";
import AdiAppliedBassCalibration from "./AdiAppliedBassCalibration.jsx";
import {
  ADI_CALIBRATION_KIND,
  ADI_CALIBRATION_NOT_TESTED_SENTENCE,
  ADI_CALIBRATION_TESTED_SENTENCE,
  ADI_NO_CALIBRATION_IMPROVEMENT,
  ADI_SECTION_TITLE,
} from "./adiPanelSections.js";

export default function AdiCalibrationSection({
  kind = ADI_CALIBRATION_KIND.NOT_TESTED,
  appliedEvidence = null,
  appliedCalibration = null,
  // A recommendation sentence for an ELECTRONIC change belongs to this layer —
  // the design recommendation never states it, and it is never stated twice.
  recommendation = null,
  children = null,
  className = "",
}) {
  const showsApplied = kind === ADI_CALIBRATION_KIND.APPLIED
    || kind === ADI_CALIBRATION_KIND.HELD
    || kind === ADI_CALIBRATION_KIND.PERSISTED;

  return (
    <div
      className={`space-y-1.5 rounded-md border border-[#E7E5E0] bg-white px-3 py-2 ${className}`}
      data-adi-section="calibration"
    >
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">
        {ADI_SECTION_TITLE.CALIBRATION}
      </div>

      {/* The settings themselves — the one presentation the whole app uses for
          an applied calibration. Design changes are never rendered here. */}
      {showsApplied && (
        <AdiAppliedBassCalibration
          evidence={kind === ADI_CALIBRATION_KIND.PERSISTED ? null : appliedEvidence}
          appliedCalibration={appliedCalibration}
          designChanges={[]}
        />
      )}

      {kind === ADI_CALIBRATION_KIND.TESTED && (
        <div className="space-y-0.5">
          <div className="text-[12px] text-[#3E4349] leading-relaxed">
            {ADI_CALIBRATION_TESTED_SENTENCE}
          </div>
          <div className="text-[12px] font-semibold text-[#1B1A1A] leading-relaxed">
            {ADI_NO_CALIBRATION_IMPROVEMENT}
          </div>
        </div>
      )}

      {kind === ADI_CALIBRATION_KIND.NOT_TESTED && (
        <div className="text-[12px] text-[#3E4349] leading-relaxed">
          {ADI_CALIBRATION_NOT_TESTED_SENTENCE}
        </div>
      )}

      {recommendation && (
        <div className="text-[12px] font-semibold text-[#1B1A1A] leading-relaxed">
          {recommendation}
        </div>
      )}

      {children}
    </div>
  );
}