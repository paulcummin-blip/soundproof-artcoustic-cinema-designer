// AdiRecommendationEvidenceGroups.jsx
// ---------------------------------------------------------------------------
// THE TWO EVIDENCE GROUPS BEHIND THE PANEL'S RECOMMENDATION — read in Engineer
// details, never on the main panel:
//
//   • the low-frequency absorption the measurement points at — the frequency,
//     how many seats share it, which levers were evaluated without becoming the
//     recommendation, and how far placement was already taken
//   • the seating recommendation's own evaluation — the worst seat after the
//     move, the other RP22 movements, the P18 extension and whether every
//     destination seat position is legal
//
// PRESENTATION ONLY: every value arrives already resolved by adiDesignerSummary.js
// and is rendered exactly once. Nothing is calculated, graded or re-evaluated
// here, and a group renders only when its own evidence exists.
// ---------------------------------------------------------------------------

import React from "react";

export default function AdiRecommendationEvidenceGroups({
  absorption = null,
  attemptsWithoutGain = [],
  seatingRecommendation = null,
  className = "",
}) {
  const attempts = Array.isArray(attemptsWithoutGain) ? attemptsWithoutGain : [];
  if (!absorption && !seatingRecommendation) return null;

  return (
    <div className={`space-y-3 ${className}`} data-adi-recommendation-evidence="true">
      {absorption && (
        <div className="space-y-0.5 text-[11px] text-[#3E4349] leading-relaxed" data-adi-absorption-evidence="true">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">
            Low-frequency absorption evidence
          </div>
          {absorption.headline && (
            <div>{absorption.headline}</div>
          )}
          {absorption.location && (
            <div>{absorption.location}</div>
          )}
          {absorption.frequencyText && (
            <div>Limiting frequency: {absorption.frequencyText}</div>
          )}
          {absorption.affectedSeatCount > 0 && (
            <div>Seats sharing this frequency: {absorption.affectedSeatCount}</div>
          )}
          <div>Advice status: {absorption.status}</div>
          <div>
            Placement already evaluated: {absorption.placementEvaluated ? "yes" : "no"}
            {" · "}
            Seat-to-seat trade-off found: {absorption.tradedOff ? "yes" : "no"}
          </div>
          {attempts.length > 0 && (
            <div>Evaluated without becoming the recommendation: {attempts.join(", ")}</div>
          )}
        </div>
      )}

      {seatingRecommendation && (
        <div className="space-y-0.5 text-[11px] text-[#3E4349] leading-relaxed" data-adi-seating-evidence="true">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">
            Seating recommendation evidence
          </div>
          {seatingRecommendation.worstSeat && (
            <div>Worst seat after the move: {seatingRecommendation.worstSeat}</div>
          )}
          {seatingRecommendation.p19Delta && (
            <div>P19 {seatingRecommendation.p19Delta}</div>
          )}
          {seatingRecommendation.p14Delta && (
            <div>P14 {seatingRecommendation.p14Delta}</div>
          )}
          {seatingRecommendation.p18DeltaHz != null
            && Math.abs(Math.round(seatingRecommendation.p18DeltaHz)) > 0 && (
              <div>
                P18 extension {seatingRecommendation.p18DeltaHz >= 0 ? "+" : "−"}
                {Math.abs(Math.round(seatingRecommendation.p18DeltaHz))} Hz
              </div>
          )}
          <div>
            {seatingRecommendation.destinationsValid === true
              ? `Every destination seat position checked: valid (${seatingRecommendation.validationBasis}).`
              : seatingRecommendation.destinationsValid === false
                ? `Destination positions not applied: ${seatingRecommendation.validationReason || "a destination seat position is not legal in this room."}`
                : "Destination seat positions were validated by the optimiser before evaluation."}
          </div>
          {seatingRecommendation.tradeOff && (
            <div>Trade-off: {seatingRecommendation.tradeOff}</div>
          )}
        </div>
      )}
    </div>
  );
}