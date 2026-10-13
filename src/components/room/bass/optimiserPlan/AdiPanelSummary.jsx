// AdiPanelSummary.jsx
// ---------------------------------------------------------------------------
// THE PANEL'S ONE HEADLINE.
//
// It states the decision, in this order and nothing more:
//   • the RECOMMENDED ADJUSTMENT — one line, in installer words
//   • what it BUYS — one benefit sentence, no figure
//   • where it LANDS — one P20 comparison, displayed whole dB, with its level
//   • a target the design cannot reach, when the decision authority says so
//   • for a design that has moved on, that the result belongs to an earlier
//     design and the instruction to re-run
//
// Everything the decision was measured from — settings, seats, thresholds,
// candidate counts, acceptance rules, fingerprints — is Engineer details' job
// and is deliberately absent here.
//
// Presentation only: every value arrives already resolved (adiPanelHeadline.js,
// adiDesignerSummary.js). Nothing is calculated, graded or re-evaluated here.
// ---------------------------------------------------------------------------

import React from "react";

export default function AdiPanelSummary({
  // The state's own line while a run is in progress.
  message = null,
  // THE recommendation: one adjustment, one benefit, one comparison.
  adjustment = null,
  benefit = null,
  comparison = null,
  // A target this design cannot reach, stated in one line.
  designLimitation = null,
  // The earlier design state a saved result belongs to, with the one action.
  staleCopy = null,
  previousBest = null,
  className = "",
}) {
  return (
    <div className={`space-y-1 ${className}`} data-adi-panel-summary="true">
      {message && (
        <div className="text-[13px] font-semibold text-[#1B1A1A] leading-relaxed">{message}</div>
      )}

      {/* THE recommendation: what to do, what it buys, where it lands. */}
      {adjustment && (
        <div className="text-[14px] font-semibold text-[#1B1A1A] leading-snug" data-adi-panel-adjustment="true">
          {adjustment}
        </div>
      )}

      {benefit && (
        <div className="text-[12.5px] text-[#3E4349] leading-relaxed" data-adi-panel-benefit="true">
          {benefit}
        </div>
      )}

      {comparison && (
        <div className="pt-0.5 text-[12.5px] font-semibold text-[#213428] leading-relaxed" data-adi-panel-comparison="true">
          {comparison}
        </div>
      )}

      {/* A design that cannot meet its selected target states the remaining
          limitation in one line — never withheld, never a paragraph. */}
      {designLimitation && (
        <div className="text-[11px] text-[#8A5A2B] leading-relaxed">{designLimitation}</div>
      )}

      {staleCopy ? (
        <div className="space-y-1">
          <div className="text-[11px] text-[#3E4349] leading-relaxed">{staleCopy.MESSAGE}</div>
          {previousBest && (
            <div className="text-[12px] font-semibold text-[#1B1A1A]">{previousBest}</div>
          )}
          <div className="text-[11px] text-[#8A5A2B] leading-relaxed">{staleCopy.INSTRUCTION}</div>
        </div>
      ) : null}
    </div>
  );
}