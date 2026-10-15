// AdiDesignRecommendationSection.jsx
// ---------------------------------------------------------------------------
// LAYER 3 — DESIGN RECOMMENDATION.
//
// A design change is physical: moving seating, moving subwoofers, changing the
// layout, adding treatment or adding subwoofers. ADI never applies one on its
// own, so everything in this section is stated as a recommendation that is still
// awaiting the designer — and it says so.
//
// The section states the recommended move, the result measured for it and the
// reason behind it, then renders whatever physical controls the panel owns
// (placement apply/undo, lever apply/undo, re-run). Those controls are supplied
// by the caller, because only the panel decides which control is the primary.
//
// Presentation only: it computes no engineering value and applies nothing.
// ---------------------------------------------------------------------------

import React from "react";
import { MoveHorizontal } from "lucide-react";
import AdiAppliedBassCalibration from "./AdiAppliedBassCalibration.jsx";
import AdiBeforeAfterResult from "./AdiBeforeAfterResult.jsx";
import {
  ADI_BEST_IMPROVEMENT_LABEL,
  ADI_DESIGN_NOT_APPLIED,
  ADI_PREDICTED_RESULT_LABEL,
  ADI_SECTION_TITLE,
} from "./adiPanelSections.js";

export default function AdiDesignRecommendationSection({
  designChanges = [],
  seatingRecommendation = null,
  // True when the panel is stating a placement position at all — recommended,
  // already applied, or evaluated for an earlier design state.
  placementStated = false,
  // A recommendation sentence for a PHYSICAL change, when the placement panel
  // does not already state it in its own words.
  recommendation = null,
  children = null,
  className = "",
}) {
  const changes = Array.isArray(designChanges) ? designChanges : [];
  const hasDesignContent = changes.length > 0
    || Boolean(seatingRecommendation)
    || Boolean(recommendation)
    || placementStated === true;

  // A DESIGN OPPORTUNITY is stated only when there is one to consider. An empty
  // box reading "No physical design change was applied." tells the designer
  // nothing and is never drawn.
  if (!hasDesignContent) return null;

  return (
    <div
      className={`space-y-1.5 rounded-md border border-[#E8D5AE] bg-[#FDF6E9] px-3 py-2 ${className}`}
      data-adi-section="design"
    >
      <div className="flex items-center gap-2">
        <MoveHorizontal className="h-3.5 w-3.5 shrink-0 text-[#B45309]" />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">
          {ADI_SECTION_TITLE.DESIGN}
        </span>
      </div>

      {/* What the optimiser confirmed but must not apply, in its own words. */}
      <AdiAppliedBassCalibration designChanges={changes} />

      {/* The seating move IS the recommendation for that lever, so it is stated
          here as the move itself, with the performance it produced beneath it. */}
      {seatingRecommendation && (
        <div className="space-y-1 rounded-md border border-[#E7E5E0] bg-white px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">
            {ADI_BEST_IMPROVEMENT_LABEL}
          </div>
          <div className="text-[12px] font-semibold text-[#1B1A1A] leading-relaxed">
            {seatingRecommendation.movementLabel}
            {seatingRecommendation.wholeBlockMoved ? " (whole seating block)" : ""}
          </div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">
            {ADI_PREDICTED_RESULT_LABEL}
          </div>
          <AdiBeforeAfterResult
            metricLabel="P20"
            beforeText={seatingRecommendation.p20Before}
            afterText={seatingRecommendation.p20After}
            improvementDb={seatingRecommendation.p20ImprovementDb}
            levelBefore={seatingRecommendation.p20LevelBefore}
            levelAfter={seatingRecommendation.p20LevelAfter}
          />
          {seatingRecommendation.baselineNote && (
            <div className="text-[11px] text-[#8A5A2B] leading-relaxed">
              {seatingRecommendation.baselineNote}
            </div>
          )}
          {seatingRecommendation.reason && (
            <div className="text-[11px] text-[#625143] leading-relaxed">
              Why: {seatingRecommendation.reason}
            </div>
          )}
        </div>
      )}

      {recommendation && !seatingRecommendation && (
        <div className="space-y-1">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">
            {ADI_BEST_IMPROVEMENT_LABEL}
          </div>
          <div className="text-[12px] font-semibold text-[#1B1A1A] leading-relaxed">
            {recommendation}
          </div>
        </div>
      )}

      {/* The physical controls the panel owns: placement apply/undo, lever
          apply/undo, re-run. */}
      {children}

      <div className="text-[11px] font-medium text-[#8A5A2B] leading-relaxed">
        {ADI_DESIGN_NOT_APPLIED}
      </div>
    </div>
  );
}