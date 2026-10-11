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
import AdiBestCalibrationResult from "./AdiBestCalibrationResult.jsx";
import {
  ADI_CALIBRATION_KIND,
  ADI_CALIBRATION_NOT_TESTED_SENTENCE,
  ADI_CALIBRATION_TESTED_SENTENCE,
  ADI_NO_CALIBRATION_IMPROVEMENT,
  ADI_SECTION_TITLE,
} from "./adiPanelSections.js";
import {
  CALIBRATION_EVIDENCE_MISSING_MESSAGE,
  CALIBRATION_TRADE_OFF_MESSAGE,
} from "./optimiserCalibrationEvidence.js";

export default function AdiCalibrationSection({
  kind = ADI_CALIBRATION_KIND.NOT_TESTED,
  appliedEvidence = null,
  appliedCalibration = null,
  // A recommendation sentence for an ELECTRONIC change belongs to this layer —
  // the design recommendation never states it, and it is never stated twice.
  recommendation = null,
  // What the saved calibration evidence actually proves. The no-improvement
  // sentence is shown only when it does.
  evidenceState = null,
  // WHICH calibration result ADI's own decision names — one lever on its own, or
  // several levers retuned together — with its state, its P19/P20 before → after
  // and the settings it changed. Null when the decision names no result.
  bestResult = null,
  children = null,
  className = "",
}) {
  const showsApplied = kind === ADI_CALIBRATION_KIND.APPLIED
    || kind === ADI_CALIBRATION_KIND.HELD
    || kind === ADI_CALIBRATION_KIND.PERSISTED;
  const noImprovementProven = kind === ADI_CALIBRATION_KIND.TESTED
    && evidenceState?.noImprovementProven !== false;
  const evidenceLines = Array.isArray(evidenceState?.leverLines) ? evidenceState.leverLines : [];
  // The levers whose improvement was found and NOT applied, each with the reason
  // it was held. They are stated even when another lever was applied, so a found
  // improvement is never left without its reason.
  const heldLines = Array.isArray(evidenceState?.heldLines) ? evidenceState.heldLines : [];

  return (
    <div
      className={`space-y-1.5 rounded-md border border-[#E7E5E0] bg-white px-3 py-2 ${className}`}
      data-adi-section="calibration"
    >
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">
        {ADI_SECTION_TITLE.CALIBRATION}
      </div>

      {/* The result the decision itself selected, stated FIRST: whether it is
          one lever on its own (delay only, gain only) or a combined calibration
          result, and why the other tested results were not taken. Without this
          the section beside it reads as delay-only versus gain-only. */}
      <AdiBestCalibrationResult result={bestResult} />

      {/* The settings themselves — the one presentation the whole app uses for
          an applied calibration. Design changes are never rendered here. */}
      {showsApplied && (
        <AdiAppliedBassCalibration
          evidence={kind === ADI_CALIBRATION_KIND.PERSISTED ? null : appliedEvidence}
          appliedCalibration={appliedCalibration}
          designChanges={[]}
        />
      )}

      {/* A held calibration improvement — a trade-off under review, a weaker
          candidate than the one applied, a hand-set calibration — states its
          reason, whether or not something else was applied. */}
      {showsApplied && heldLines.length > 0 && (
        <div className="space-y-0.5">
          {heldLines.map((line) => (
            <div key={line.lever} className="text-[11px] text-[#3E4349] leading-relaxed">
              <span className="text-[#625143]">{line.label}:</span> {line.text}
            </div>
          ))}
        </div>
      )}

      {/* The retained record kept no calibration evidence: nothing may be claimed. */}
      {kind === ADI_CALIBRATION_KIND.EVIDENCE_MISSING && (
        <div className="text-[12px] font-semibold text-[#1B1A1A] leading-relaxed">
          {CALIBRATION_EVIDENCE_MISSING_MESSAGE}
        </div>
      )}

      {(kind === ADI_CALIBRATION_KIND.TESTED || kind === ADI_CALIBRATION_KIND.TRADE_OFF_HELD) && (
        <div className="space-y-0.5">
          {kind === ADI_CALIBRATION_KIND.TESTED && (
            <div className="text-[12px] text-[#3E4349] leading-relaxed">
              {ADI_CALIBRATION_TESTED_SENTENCE}
            </div>
          )}
          {noImprovementProven ? (
            <div className="text-[12px] font-semibold text-[#1B1A1A] leading-relaxed">
              {ADI_NO_CALIBRATION_IMPROVEMENT}
            </div>
          ) : (
            <>
              {/* A trade-off, or an improvement that was not applied: stated with
                  the best candidate's own values, never as "no improvement". */}
              {kind === ADI_CALIBRATION_KIND.TRADE_OFF_HELD && (
                <div className="text-[12px] font-semibold text-[#1B1A1A] leading-relaxed">
                  {evidenceState?.tradeOffMessage || CALIBRATION_TRADE_OFF_MESSAGE}
                </div>
              )}
              {evidenceLines.map((line) => (
                <div key={line.lever} className="text-[11px] text-[#3E4349] leading-relaxed">
                  <span className="text-[#625143]">{line.label}:</span> {line.text}
                </div>
              ))}
            </>
          )}
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