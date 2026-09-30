// OptimiserCalculationEstimateLine.jsx
// ---------------------------------------------------------------------------
// The pre-run estimate line: how many design calculations ADI will run for this
// design, stated from the optimiser's own declared search space.
//
// Read-only presentation. It renders the estimate sentence, the per-family
// basis behind it, and the honest note that the figures are estimated from the
// search space rather than measured. No calculation of the design is performed.
// ---------------------------------------------------------------------------

import React from "react";
import {
  estimateOptimiserCalculations,
  estimateSentence,
  formatCalculationCount,
} from "./optimiserCalculationEstimate.js";

export default function OptimiserCalculationEstimateLine({ instances = [], className = "" }) {
  const estimate = estimateOptimiserCalculations({ instances });
  const sentence = estimateSentence(estimate);

  return (
    <div className={className} data-adi-calculation-estimate={estimate.available ? "estimated" : "unavailable"}>
      <div className="text-[12px] font-semibold text-[#1B1A1A] leading-relaxed">{sentence}</div>

      {estimate.available && estimate.families.length > 0 && (
        <div className="mt-0.5 text-[10px] text-[#8B7F76] leading-relaxed">
          {estimate.families
            .map((family) => `${family.label} ${formatCalculationCount(family.count)}`)
            .join(" · ")}
        </div>
      )}

      <div className="mt-0.5 text-[10px] text-[#8B7F76] leading-relaxed">
        {estimate.available
          ? `${estimate.basisNote} ${estimate.scopeNote}`
          : `${estimate.reason} ${estimate.scopeNote}`}
      </div>
    </div>
  );
}