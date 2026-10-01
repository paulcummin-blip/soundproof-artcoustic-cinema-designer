// OptimiserCalculationEstimateLine.jsx
// ---------------------------------------------------------------------------
// The default pre-run message: the selling point, in two short lines.
//
//   1. how many design options ADI will test, and the acoustic work behind them
//   2. what it checks before it suggests moving anything
//
// The per-family counts, the honesty notes and the lever order are technical
// detail and belong in the disclosure (OptimiserCalculationDetail), not here.
// Read-only presentation — no calculation of the design is performed.
// ---------------------------------------------------------------------------

import React from "react";
import { estimateOptimiserCalculations, estimateSentence } from "./optimiserCalculationEstimate.js";
import { ADI_OPTIMISER_COPY } from "./resolveAdiOptimiserJourney.js";

export default function OptimiserCalculationEstimateLine({
  instances = [],
  seatCount = null,
  // The calculation count is stated ONCE, near the top of the card. When the
  // card has already stated it, this line carries only the short summary, so
  // the same amount is never repeated above the button.
  showSentence = true,
  className = "",
}) {
  const estimate = estimateOptimiserCalculations({ instances });
  const sentence = estimateSentence(estimate, { seatCount });

  return (
    <div className={className} data-adi-calculation-estimate={estimate.available ? "estimated" : "unavailable"}>
      {showSentence && (
        <div className="text-[12px] font-semibold text-[#1B1A1A] leading-relaxed">{sentence}</div>
      )}
      <div className="mt-1 text-[11px] text-[#3E4349] leading-relaxed">
        {ADI_OPTIMISER_COPY.PRE_RUN_SUMMARY}
      </div>
    </div>
  );
}