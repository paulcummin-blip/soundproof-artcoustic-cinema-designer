// OptimiserCalculationDetail.jsx
// ---------------------------------------------------------------------------
// The pre-run disclosure: everything technical about the calculation count,
// collapsed by default and rendered BELOW the primary action.
//
// The default card carries only the selling point (the count and the
// electronic-first summary). The lever order, the per-family estimated counts,
// what ADI compares, and the honesty notes about how the estimate was derived
// all live here, so the default card never carries a paragraph of method.
//
// Read-only presentation. It renders an estimate; it calculates no design.
// ---------------------------------------------------------------------------

import React from "react";
import { ChevronRight } from "lucide-react";
import {
  estimateOptimiserCalculations,
  formatCalculationCount,
} from "./optimiserCalculationEstimate.js";
import { OPTIMISER_FAMILY_SEQUENCE, leverLabel } from "./optimiserLeverOrder.js";
import { ADI_OPTIMISER_COPY } from "./resolveAdiOptimiserJourney.js";

export default function OptimiserCalculationDetail({ instances = [], className = "" }) {
  const estimate = estimateOptimiserCalculations({ instances });

  // The lever order comes from the one least-intrusive sequence, so this list
  // can never drift from the order ADI actually evaluates.
  const leverOrder = OPTIMISER_FAMILY_SEQUENCE
    .map((key) => leverLabel(key))
    .filter(Boolean)
    .join(" · ");

  // Per-family counts use the lever's own presentation name, so the disclosure
  // reads "Phase 72" rather than an internal family label.
  const familyCounts = estimate.families
    .map((family) => `${leverLabel(family.key) || family.label} ${formatCalculationCount(family.count)}`)
    .join(" · ");

  return (
    <details
      className={className}
      data-adi-calculation-detail={estimate.available ? "estimated" : "unavailable"}
    >
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[11px] font-semibold text-[#213428] underline-offset-2 hover:underline [&::-webkit-details-marker]:hidden">
        <ChevronRight className="h-3 w-3" />
        {ADI_OPTIMISER_COPY.DISCLOSURE_TITLE}
      </summary>

      <div className="mt-2 space-y-1.5 pl-4 text-[11px] text-[#3E4349] leading-relaxed">
        <div>{leverOrder}</div>

        {estimate.available && estimate.families.length > 0 && (
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">
              {ADI_OPTIMISER_COPY.DISCLOSURE_ESTIMATE_LABEL}
            </div>
            <div>{familyCounts}</div>
          </div>
        )}

        <div>{ADI_OPTIMISER_COPY.DISCLOSURE_COMPARISON}</div>

        <div className="text-[10px] text-[#8B7F76]">
          {estimate.available
            ? `${estimate.basisNote} ${estimate.scopeNote}`
            : `${estimate.reason} ${estimate.scopeNote}`}
        </div>
      </div>
    </details>
  );
}