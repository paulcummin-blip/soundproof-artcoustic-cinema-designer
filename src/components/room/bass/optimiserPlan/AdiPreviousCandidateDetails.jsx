// AdiPreviousCandidateDetails.jsx
// ---------------------------------------------------------------------------
// THE PREVIOUS RUN'S CANDIDATE — read in Engineer details.
//
// In the re-test states the saved result cannot support a recommendation, so the
// adjustment a previous run evaluated, what it was measured on, the reason it was
// not applied and its own P20 pair are never stated on the main panel. They are
// read HERE, after the designer has re-tested — so no designer has to weigh an
// unconfirmed candidate before deciding to re-test.
//
// PRESENTATION ONLY: every value arrives already resolved (adiPanelHeadline.js,
// adiDesignerSummary.js). Nothing is calculated, graded or re-evaluated here, and
// the component renders nothing at all when there is no previous candidate.
// ---------------------------------------------------------------------------

import React from "react";

export const PREVIOUS_CANDIDATE_TITLE = "Previous run — evaluated candidate, not confirmed";

export default function AdiPreviousCandidateDetails({
  adjustment = null,
  benefit = null,
  comparison = null,
  staleCopy = null,
  previousBest = null,
  className = "",
}) {
  const staleMessage = staleCopy?.MESSAGE || null;
  const staleInstruction = staleCopy?.INSTRUCTION || null;
  const hasDetail = Boolean(adjustment || benefit || comparison || staleMessage || previousBest);
  if (!hasDetail) return null;

  return (
    <div className={`space-y-0.5 ${className}`} data-adi-previous-candidate="true">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">
        {PREVIOUS_CANDIDATE_TITLE}
      </div>

      {adjustment && <div className="text-[11px] text-[#3E4349] leading-relaxed">{adjustment}</div>}
      {benefit && <div className="text-[11px] text-[#3E4349] leading-relaxed">{benefit}</div>}
      {comparison && <div className="text-[11px] text-[#3E4349] leading-relaxed">{comparison}</div>}
      {staleMessage && <div className="text-[11px] text-[#3E4349] leading-relaxed">{staleMessage}</div>}
      {previousBest && <div className="text-[11px] text-[#3E4349] leading-relaxed">{previousBest}</div>}
      {staleInstruction && <div className="text-[11px] text-[#625143] leading-relaxed">{staleInstruction}</div>}
    </div>
  );
}