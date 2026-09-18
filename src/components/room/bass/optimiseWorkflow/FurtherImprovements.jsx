// FurtherImprovements.jsx
// Optional user-decision recommendations that require physical room changes.
//
// These are NOT auto-applied because they require the room itself to change:
//   - Move subwoofers
//   - Move seating
//   - Add additional subwoofers
//
// Each has an Apply button where appropriate. Applying triggers a recalculation.

import React, { useCallback, useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { buildOptimisedInstances } from "../improveBassV2/improveBassV2Apply";
import { applyCalibrationTuning } from "../improveBassV2/improveBassV2ApplyCalibration";
import { buildProvenance } from "../improveBassV2/appliedProvenance";
import { computeV2DesignFingerprint } from "../improveBassV2/improveBassV2Fingerprint";
import { buildAuthoritativeRspPosition } from "../authoritativeRspPosition";

function ImprovementCard({ title, description, onApply, applyLabel }) {
  const [applying, setApplying] = useState(false);

  const handleApply = useCallback(() => {
    if (!onApply) return;
    setApplying(true);
    try {
      onApply();
    } finally {
      setApplying(false);
    }
  }, [onApply]);

  return (
    <div className="rounded-md border border-[#E7E4DF] bg-white px-3 py-3">
      <div className="text-[12px] font-semibold text-[#1B1A1A]">{title}</div>
      <p className="mt-1 text-[11px] text-[#625143] leading-relaxed">{description}</p>
      {onApply && (
        <button
          type="button"
          onClick={handleApply}
          disabled={applying}
          className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-[#213428] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#3E4349] disabled:opacity-50"
        >
          {applying ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowRight className="h-3 w-3" />}
          {applyLabel || "Apply"}
        </button>
      )}
    </div>
  );
}

export default function FurtherImprovements({
  recommendations,
  selection,
  currentInstances,
  roomDims,
  selectedSubModel,
  commitInstances,
  commitSeating,
  commitSeatingProvenance,
  hasCanonicalInstances,
  appState,
  shared,
  onRecalculate,
}) {
  const hasSubPositions = !!recommendations?.subPositions;
  const hasSeating = !!recommendations?.seating;

  const handleApplySubPositions = useCallback(() => {
    if (!hasSubPositions || !commitInstances || !hasCanonicalInstances || !selection) return;
    const winner = recommendations.subPositions;
    if (!winner) return;

    const fingerprint = selection.applyFingerprint;
    const provenance = buildProvenance("subPositions", winner.candidateId || "further", fingerprint, fingerprint);
    const next = buildOptimisedInstances(winner, currentInstances, roomDims, selectedSubModel, provenance);
    commitInstances(next, {
      front: { placementMode: "manual", isManual: true },
      rear: { placementMode: "manual", isManual: true },
    });

    if (typeof onRecalculate === "function") {
      setTimeout(() => onRecalculate(), 100);
    }
  }, [hasSubPositions, commitInstances, hasCanonicalInstances, selection, recommendations, currentInstances, roomDims, selectedSubModel, onRecalculate]);

  const handleApplySeating = useCallback(() => {
    if (!hasSeating || !commitSeating || !selection) return;
    const winner = recommendations.seating;
    if (!winner?.seatingPositions) return;

    commitSeating(winner.seatingPositions);

    const fingerprint = selection.applyFingerprint;
    const rspPosition = buildAuthoritativeRspPosition(roomDims, appState?.mlpY_m, appState?.mlpX_m, appState?.designatedRspSeatId);
    const postMutationFingerprint = (() => {
      try {
        return computeV2DesignFingerprint({
          subwooferInstances: currentInstances,
          roomDims,
          seatingPositions: winner.seatingPositions,
          rspPosition,
          selectedSubModel,
          p14TargetBasis: shared?.authoritative?.requested?.p14TargetBasis || "minimum",
          p14TargetLevel: shared?.authoritative?.requested?.requestedLevel || 2,
          p14TargetDb: shared?.authoritative?.requested?.selectedP14TargetDb || 117,
          p18TargetBasis: shared?.authoritative?.requested?.p18TargetBasis || "minimum",
          amplifierPowerPerSubW: 0,
        });
      } catch { return null; }
    })();
    const provenance = buildProvenance("seating_positions", winner.candidateId || "further", fingerprint, postMutationFingerprint);
    if (commitSeatingProvenance) commitSeatingProvenance(provenance);

    if (typeof onRecalculate === "function") {
      setTimeout(() => onRecalculate(), 100);
    }
  }, [hasSeating, commitSeating, selection, recommendations, roomDims, appState, currentInstances, selectedSubModel, shared, commitSeatingProvenance, onRecalculate]);

  if (!recommendations || (!hasSubPositions && !hasSeating)) return null;

  return (
    <div className="mt-3 rounded-md border border-[#E7E4DF] bg-[#F7F4F0]/40 px-4 py-3">
      <div className="text-[12px] font-semibold text-[#1B1A1A] mb-2">Further Improvements Available</div>
      <p className="text-[11px] text-[#625143] mb-3 leading-relaxed">
        These improvements require physical changes to the room. Apply them if the client agrees to the change.
      </p>
      <div className="space-y-2">
        {hasSubPositions && (
          <ImprovementCard
            title="Move subwoofers"
            description="Repositioning the subwoofers could further improve bass consistency across the seating area."
            onApply={handleApplySubPositions}
            applyLabel="Apply positions"
          />
        )}
        {hasSeating && (
          <ImprovementCard
            title="Move seating"
            description="Small seating position changes could further improve bass uniformity."
            onApply={handleApplySeating}
            applyLabel="Apply seating"
          />
        )}
      </div>
    </div>
  );
}