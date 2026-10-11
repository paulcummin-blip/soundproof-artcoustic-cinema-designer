// AdiPanelSummary.jsx
// ---------------------------------------------------------------------------
// LAYER 1 — the panel's result summary.
//
// It states, in this order and nothing more:
//   • the one-line finding: what ADI has already done
//   • the current result and the best result found (or, for a design that has
//     moved on, the previous best and the instruction to re-run)
//   • what the evaluation covers, in one short line
//   • a target the design cannot reach, when the decision authority says so
//
// Presentation only: every value arrives already resolved by the summary
// authority. Nothing is calculated, graded or re-evaluated here.
// ---------------------------------------------------------------------------

import React from "react";

export default function AdiPanelSummary({
  finding = null,
  message = null,
  testedSentence = null,
  designLimitation = null,
  staleCopy = null,
  previousBest = null,
  currentP20 = null,
  recommendedP20 = null,
  className = "",
}) {
  return (
    <div className={`space-y-1 ${className}`} data-adi-panel-summary="true">
      {message && (
        <div className="text-[13px] font-semibold text-[#1B1A1A] leading-relaxed">{message}</div>
      )}

      {finding && (
        <div className="text-[13px] font-semibold text-[#1B1A1A] leading-relaxed">{finding}</div>
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
      ) : (
        <div className="space-y-0.5">
          {currentP20 && (
            <div className="text-[12px] text-[#3E4349]">
              Current result: <span className="font-semibold text-[#1B1A1A]">{currentP20}</span>
            </div>
          )}
          {recommendedP20 && (
            <div className="text-[12px] text-[#3E4349]">
              Best result found: <span className="font-semibold text-[#1B1A1A]">{recommendedP20}</span>
            </div>
          )}
        </div>
      )}

      {/* What the evaluation covers. One line, and only when the evidence
          authority produced one. */}
      {testedSentence && (
        <div className="text-[11px] text-[#3E4349] leading-relaxed">{testedSentence}</div>
      )}
    </div>
  );
}