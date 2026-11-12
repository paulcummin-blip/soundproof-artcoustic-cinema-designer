// AdiCoordinatedPhysicalAlternatives.jsx
// ---------------------------------------------------------------------------
// Coordinated physical alternatives — Phase 9B candidates that move BOTH
// seating and subwoofer positions. Presented SEPARATELY from the overall
// calibration winner. Nothing here is auto-applied: the section is
// informational only. The designer reviews each alternative and, if they
// choose to act, moves the seating and subwoofers manually in the Room
// Designer and re-runs the optimisation.
//
// This component renders ONLY eligible alternatives (validation, safety,
// protected-primary-seat and materiality all passed). It is independent of
// the calibration winner: it appears whether or not a calibration
// improvement was found, and never competes with the primary decision.
//
// Every value is read from the persisted coordinated summary — no
// recalculation, no fabrication.
// ---------------------------------------------------------------------------

import React from "react";
import { Move } from "lucide-react";
import { selectEligiblePhysicalAlternativesFromSummary } from "./coordinatedPhysicalAlternativePresentation.js";
import CoordinatedAlternativeCard from "./CoordinatedAlternativeCard.jsx";

export default function AdiCoordinatedPhysicalAlternatives({
  coordinatedSummary = null,
  roomDims = null,
  className = "",
}) {
  // Uses only the candidate-owned saved evidence — no current live seating
  // values. The staleness gate (shouldShowCoordinatedAlternatives) is
  // checked by the parent before rendering this component, so historical
  // evidence from a stale plan never reaches here.
  const alternatives = selectEligiblePhysicalAlternativesFromSummary(coordinatedSummary);
  if (alternatives.length === 0) return null;

  return (
    <div className={`space-y-2 ${className}`} data-adi-coordinated-alternatives="true">
      <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[#1B1A1A]">
        <Move className="h-3.5 w-3.5 text-[#213428]" />
        Coordinated alternatives
      </div>
      <div className="text-[11px] text-[#757575] leading-relaxed">
        These combine a seating shift with new subwoofer positions. Review each option and, if you want to
        proceed, move the seating and subwoofers in the Room Designer and re-run the optimisation.
      </div>
      {alternatives.map((alt, index) => (
        <CoordinatedAlternativeCard
          key={alt.candidateId || index}
          alt={alt}
          index={index}
          roomDims={roomDims}
        />
      ))}
    </div>
  );
}