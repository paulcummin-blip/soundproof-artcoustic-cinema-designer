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
// WHERE IT RENDERS. The panel's default view states the DECISION — one
// adjustment, one benefit, one comparison (adiPanelHeadline.js) — so this
// section is read inside the collapsed Engineering details, beside the other
// evidence: the settings each change touches, the canonical P19/P20 pair it was
// decided on, the reason every other candidate was held and the candidate-level
// proof behind them. Its own action stays on the main panel, so no control is
// duplicated.
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
  ADI_NO_SAFE_CALIBRATION_IMPROVEMENT,
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
  // The design's own subwoofers: subwoofer timing is stated as a relative group
  // offset in this panel, so the groups behind an applied calibration have to be
  // readable here. Presentation only — nothing is applied or recalculated.
  instances = [],
  roomDims = null,
  // Read in Engineer details: the best calibration result is stated in full —
  // its values, the settings it changed and why a tested result lost — rather
  // than as the compact headline the main panel used to carry.
  detailed = false,
  children = null,
  className = "",
}) {
  // A calibration result the decision HELD that makes P20 worse is not a
  // calibration improvement: the main panel states that none was found, and the
  // candidate, its values and its settings stay in Engineer details.
  const suppressedHeld = kind === ADI_CALIBRATION_KIND.HELD
    && bestResult?.mainPanelSuppressed === true;
  const showsApplied = !suppressedHeld
    && (kind === ADI_CALIBRATION_KIND.APPLIED
      || kind === ADI_CALIBRATION_KIND.HELD
      || kind === ADI_CALIBRATION_KIND.PERSISTED);
  const noImprovementProven = kind === ADI_CALIBRATION_KIND.TESTED
    && evidenceState?.noImprovementProven !== false;
  const evidenceLines = Array.isArray(evidenceState?.leverLines) ? evidenceState.leverLines : [];
  // The levers whose improvement was found and NOT applied, each with the reason
  // it was held. They are stated even when another lever was applied, so a found
  // improvement is never left without its reason.
  const heldLines = Array.isArray(evidenceState?.heldLines) ? evidenceState.heldLines : [];
  // Useful improvements that were held: stated as suggestions — what to change
  // and what it buys — each with the one reason it was not applied automatically.
  // They are the levers that would otherwise read as failed optimisations.
  const suggestionLines = Array.isArray(evidenceState?.suggestionLines) ? evidenceState.suggestionLines : [];

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
          result. The settings and the canonical P19/P20 before → after are
          printed once, by the section beside it, so no value is repeated here.
          A held result that worsens P20 states the outcome instead of the
          candidate — that candidate is read in Engineer details. */}
      {suppressedHeld ? (
        <div className="space-y-0.5">
          <div className="text-[12px] text-[#3E4349] leading-relaxed">
            {bestResult.mainPanelCopy?.tested || ADI_CALIBRATION_TESTED_SENTENCE}
          </div>
          <div className="text-[12px] font-semibold text-[#1B1A1A] leading-relaxed">
            {bestResult.mainPanelCopy?.sentence || ADI_NO_SAFE_CALIBRATION_IMPROVEMENT}
          </div>
        </div>
      ) : (
        <AdiBestCalibrationResult result={bestResult} compact={showsApplied && !detailed} />
      )}

      {/* A USEFUL improvement that was held: the suggestion leads, in the
          designer's own terms, with its benefit and its one disadvantage. It is
          never presented as a failed optimisation, and never stated twice. */}
      {suggestionLines.map((line) => (
        <div
          key={line.lever}
          className="rounded-md border border-[#D7E3D8] bg-[#F4F8F4] px-2.5 py-2"
          data-adi-calibration-suggestion={line.lever}
        >
          <div className="text-[12px] font-semibold text-[#213428] leading-relaxed">
            {line.text}
          </div>
          {line.note && (
            <div className="mt-0.5 text-[11px] text-[#8A5A2B] leading-relaxed">
              {line.note}
            </div>
          )}
        </div>
      ))}

      {/* The settings themselves — the one presentation the whole app uses for
          an applied calibration. Design changes are never rendered here. */}
      {showsApplied && (
        <AdiAppliedBassCalibration
          evidence={kind === ADI_CALIBRATION_KIND.PERSISTED ? null : appliedEvidence}
          appliedCalibration={appliedCalibration}
          designChanges={[]}
          instances={instances}
          roomDims={roomDims}
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