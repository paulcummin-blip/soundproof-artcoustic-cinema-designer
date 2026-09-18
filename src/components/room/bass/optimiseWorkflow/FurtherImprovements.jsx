// FurtherImprovements.jsx
// Physical improvement cards (subwoofer placement, seating position) that
// require user decision. Rendered inside the BassOptimisationSummary
// "IMPROVEMENTS FOUND" section — no separate heading.
//
// Cards remain visible after Apply. State transitions from Available → Applied ✓.
// The Apply button is disabled after applying. Values remain visible.
// Once applied, the card stays so the user can see what changed.

import React, { useCallback, useState } from "react";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { buildOptimisedInstances } from "../improveBassV2/improveBassV2Apply";
import { buildProvenance } from "../improveBassV2/appliedProvenance";
import { computeV2DesignFingerprint } from "../improveBassV2/improveBassV2Fingerprint";
import { buildAuthoritativeRspPosition } from "../authoritativeRspPosition";

function ImprovementCard({ title, description, onApply, applyLabel, applied }) {
  const [applying, setApplying] = useState(false);

  const handleApply = useCallback(() => {
    if (!onApply || applied) return;
    setApplying(true);
    try {
      onApply();
    } finally {
      setApplying(false);
    }
  }, [onApply, applied]);

  return (
    <div className="rounded-md border border-[#E7E4DF] bg-white px-3 py-2.5">
      <div className="flex items-center justify-between">
        <div className="text-[12px] font-semibold text-[#1B1A1A]">{title}</div>
        {applied && (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#213428]">
            <CheckCircle2 className="h-3 w-3" />
            Applied
          </span>
        )}
      </div>
      <p className="mt-1 text-[11px] text-[#625143] leading-relaxed">{description}</p>
      {onApply && !applied && (
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
  const [appliedStages, setAppliedStages] = useState(new Set());

  const markApplied = useCallback((stageKey) => {
    setAppliedStages((prev) => {
      const next = new Set(prev);
      next.add(stageKey);
      return next;
    });
  }, []);

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

    markApplied("placement");

    if (typeof onRecalculate === "function") {
      setTimeout(() => onRecalculate(), 100);
    }
  }, [hasSubPositions, commitInstances, hasCanonicalInstances, selection, recommendations, currentInstances, roomDims, selectedSubModel, onRecalculate, markApplied]);

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

    markApplied("seating");

    if (typeof onRecalculate === "function") {
      setTimeout(() => onRecalculate(), 100);
    }
  }, [hasSeating, commitSeating, selection, recommendations, roomDims, appState, currentInstances, selectedSubModel, shared, commitSeatingProvenance, onRecalculate, markApplied]);

  if (!recommendations || (!hasSubPositions && !hasSeating)) return null;

  return (
    <>
      {hasSubPositions && (
        <ImprovementCard
          title="Placement"
          description="Repositioning the subwoofers could further improve bass consistency across the seating area."
          onApply={handleApplySubPositions}
          applyLabel="Apply positions"
          applied={appliedStages.has("placement")}
        />
      )}
      {hasSeating && (
        <ImprovementCard
          title="Seating Position"
          description="Small seating position changes could further improve bass uniformity."
          onApply={handleApplySeating}
          applyLabel="Apply seating"
          applied={appliedStages.has("seating")}
        />
      )}
    </>
  );
}