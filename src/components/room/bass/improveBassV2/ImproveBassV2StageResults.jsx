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
import TradeOffCard from "./TradeOffCard";
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
  onApplyTradeOff,
  stale,
  sharedBassResults,
  currentDesignFingerprint,
}) {
  if (!selection) return null;

  const stages = buildStageResults(selection);
  const currentResult = selection.currentResult;
  const tradeOffs = selection.tradeOffs || [];

  // Determine which stages are already applied
  function isStageApplied(stageKey, stage) {
    if (!stage?.result || !currentInstances) return false;
    if (stageKey === "phase" || stageKey === "delay" || stageKey === "gain") {
      return isCalibrationApplied(currentInstances, stage.result.appliedTuning || stage.result.tuning || []);
    }
    if (stageKey === "subPositions") {
      return isOptimisedApplied(currentInstances, stage.result, roomDims);
    }
    if (stageKey === "combined") {
      // Best Overall may include positions, calibration, and/or seating.
      // Check each component: all must be applied for the APPLIED badge.
      const result = stage.result;
      const hasCoords = (result?.positionCoordinates?.length || result?.coordinates?.length || 0) > 0;
      const hasSeating = !!result?.seatingPositions && (result?.seatingOffsetMm || 0) !== 0;
      // If seating is part of the winner, it's not fully applied until seating moves too
      if (hasSeating) return false;
      if (hasCoords) {
        return isOptimisedApplied(currentInstances, result, roomDims);
      }
      return isCalibrationApplied(currentInstances, result?.appliedTuning || result?.tuning || []);
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
      {/* Intro copy — clarifies individual vs combined hierarchy */}
      <p className="text-[10px] leading-relaxed text-[#625143]">
        Review individual improvements below, or apply the recommended combined solution further down.
      </p>
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
            snapshot={selection?.snapshot || snapshot}
          />
        );
      })}

      {/* ── Verified trade-off alternatives (designer choices) ── */}
      {tradeOffs.length > 0 && !stale && (
        <div className="space-y-2 pt-2" data-trade-offs-section="true">
          {tradeOffs.map((entry) => (
            <TradeOffCard
              key={entry.candidateId}
              tradeOffEntry={entry}
              snapshot={snapshot}
              currentInstances={currentInstances}
              onApply={onApplyTradeOff}
              isApplied={
                entry.result.candidateKind === "calibration"
                  ? isCalibrationApplied(currentInstances, entry.result.appliedTuning || entry.result.tuning || [])
                  : isOptimisedApplied(currentInstances, entry.result, roomDims)
              }
              currentResult={currentResult}
              seatingPositions={seatingPositions}
              sharedBassResults={sharedBassResults}
              currentDesignFingerprint={currentDesignFingerprint}
            />
          ))}
        </div>
      )}
    </div>
  );
}