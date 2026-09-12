// ImproveBassV2StageResults.jsx
// New one-result-per-stage results UI for Improve Bass V2.
//
// Replaces the old ranked-recommendation-cards pattern with a clear
// 5-stage layout:
//   PHASE | DELAY | GAIN | SUBWOOFER POSITIONS | SEATING POSITIONS
//
// Each stage shows exactly ONE result (or a verdict: no improvement /
// not available / not tested). Each useful result has its own independent
// Apply button. No runner-up candidates are shown.
//
// The duplicate per-seat evidence table is removed — each stage shows
// its own compact before/after evidence inline.

import React from "react";
import ImproveBassV2StageRow from "./ImproveBassV2StageRow";
import { buildStageResults, STAGE_ORDER, STAGE_DISPLAY_LABELS } from "./improveBassV2StageAuthority";
import { isOptimisedApplied } from "./improveBassV2Apply";
import { isCalibrationApplied } from "./improveBassV2ApplyCalibration";

export default function ImproveBassV2StageResults({
  selection,
  snapshot,
  currentInstances,
  roomDims,
  seatingPositions,
  onApplyStage,
  stale,
}) {
  if (!selection) return null;

  const stages = buildStageResults(selection);
  const currentResult = selection.currentResult;

  // Determine which stages are already applied
  function isStageApplied(stageKey, stage) {
    if (!stage?.result || !currentInstances) return false;
    if (stageKey === "delay" || stageKey === "gain") {
      return isCalibrationApplied(currentInstances, stage.result.appliedTuning || stage.result.tuning || []);
    }
    if (stageKey === "subPositions") {
      return isOptimisedApplied(currentInstances, stage.result, roomDims);
    }
    if (stageKey === "seating") {
      // Seating apply check: compare current seating positions against the result's moved positions
      const offsetMm = stage.result?.seatingOffsetMm || 0;
      return offsetMm === 0; // only "current" (0 offset) is "applied" by definition
    }
    return false;
  }

  return (
    <div className="mt-3 space-y-2" data-stage-results="true">
      {STAGE_ORDER.map((stageKey) => {
        const stage = stages[stageKey];
        const label = STAGE_DISPLAY_LABELS[stageKey];
        const applied = isStageApplied(stageKey, stage);

        return (
          <ImproveBassV2StageRow
            key={stageKey}
            stageKey={stageKey}
            label={label}
            stage={stage}
            currentResult={currentResult}
            currentInstances={currentInstances}
            isApplied={applied}
            onApply={onApplyStage}
            stale={stale}
          />
        );
      })}
    </div>
  );
}