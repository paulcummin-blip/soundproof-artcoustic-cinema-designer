// AdiImprovementResult.jsx
// ---------------------------------------------------------------------------
// THE ACTUAL RESULT of a confirmed improvement, on the main panel.
//
// PROPOSED ADJUSTMENT — the exact setting change, in installer words
// RESULT              — what it improves, and the current → proposed pair
// P19                 — its own line, unchanged or moved
// PRIMARY SEATS       — whether any protected seat gets worse
//
// Every value arrives already resolved (improvementResultAuthority.js): nothing
// is calculated, ranked or re-evaluated here, and a line the run did not record
// is simply not drawn.
// ---------------------------------------------------------------------------

import React from "react";

export default function AdiImprovementResult({ result = null, className = "" }) {
  if (!result?.found) return null;
  const applied = result.caseKey === "applied";

  return (
    <div className={`space-y-2 ${className}`} data-adi-improvement-result={result.caseKey}>
      {result.adjustment && (
        <div className="space-y-0.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">
            {applied ? "APPLIED ADJUSTMENT" : "PROPOSED ADJUSTMENT"}
          </div>
          <div className="text-[13px] font-semibold text-[#1B1A1A] leading-snug" data-adi-improvement-adjustment="true">
            {result.adjustment}
          </div>
        </div>
      )}

      {result.result && (
        <div className="space-y-0.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">
            {result.result.title}
          </div>
          <div className="text-[12.5px] text-[#3E4349] leading-relaxed" data-adi-improvement-metric="true">
            {result.result.line}
          </div>
          {result.result.pair && (
            <div className="text-[12.5px] font-semibold text-[#213428]" data-adi-improvement-pair="true">
              {result.result.pair}
            </div>
          )}
        </div>
      )}

      {result.p19?.text && (
        <div className="space-y-0.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">{result.p19.title}</div>
          <div className="text-[12.5px] text-[#3E4349]" data-adi-improvement-p19="true">{result.p19.text}</div>
        </div>
      )}

      {result.seats?.text && (
        <div className="space-y-0.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">{result.seats.title}</div>
          <div className="text-[12.5px] text-[#213428]" data-adi-improvement-seats="true">{result.seats.text}</div>
        </div>
      )}

      {/* WHY IT IS THE DESIGNER'S DECISION, when the run held it back. */}
      {result.held?.text && (
        <p className="text-[11px] text-[#8A5A2B] leading-relaxed" data-adi-improvement-held="true">
          {result.held.text}
        </p>
      )}
    </div>
  );
}