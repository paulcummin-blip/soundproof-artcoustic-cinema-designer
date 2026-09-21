// FurtherImprovements.jsx
// Physical design recommendation cards (subwoofer placement, seating position).
// These are NOT calibration — they are design changes that require user decision.
//
// Rendered as a separate section below the calibration summary.
// After applying, the card stays visible as a read-only "Applied" summary so the
// user can see what Sound Proof recommended and that it has been applied.

import React, { useCallback, useState } from "react";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { buildOptimisedInstances } from "../improveBassV2/improveBassV2Apply";
import { buildProvenance } from "../improveBassV2/appliedProvenance";
import { computeV2DesignFingerprint } from "../improveBassV2/improveBassV2Fingerprint";
import { buildAuthoritativeRspPosition } from "../authoritativeRspPosition";

function ImprovementCard({ title, description, onApply, applyLabel, appliedSummary }) {
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

  if (appliedSummary) {
    // Read-only "Applied" state — card stays visible with the recommendation
    // and a disabled Apply button, so the user can see what was recommended.
    return (
      <div className="rounded-md border border-[#DCE3DD] bg-[#F2F6F3] px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5 text-[#213428]" />
          <span className="text-[12px] font-semibold text-[#1B1A1A]">{title}</span>
        </div>
        <p className="mt-1 text-[11px] text-[#625143] leading-relaxed">{appliedSummary}</p>
        <button
          type="button"
          disabled
          className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-[#9CAFA3] px-3 py-1.5 text-[11px] font-semibold text-white cursor-not-allowed"
        >
          <CheckCircle2 className="h-3 w-3" />
          Applied
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-[#E7E4DF] bg-white px-3 py-2.5">
      <div className="text-[12px] font-semibold text-[#1B1A1A]">{title}</div>
      <p className="mt-1 text-[11px] text-[#625143] leading-relaxed">{description}</p>
      <button
        type="button"
        onClick={handleApply}
        disabled={applying}
        className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-[#213428] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#3E4349] disabled:opacity-50"
      >
        {applying ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowRight className="h-3 w-3" />}
        {applyLabel || "Apply"}
      </button>
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
      onRecalculate({ previousCacheKey: shared?.cacheKey || null });
    }
  }, [hasSubPositions, commitInstances, hasCanonicalInstances, selection, recommendations, currentInstances, roomDims, selectedSubModel, shared?.cacheKey, onRecalculate, markApplied]);

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
      onRecalculate({ previousCacheKey: shared?.cacheKey || null });
    }
  }, [hasSeating, commitSeating, selection, recommendations, roomDims, appState, currentInstances, selectedSubModel, shared, commitSeatingProvenance, onRecalculate, markApplied]);

  if (!recommendations || (!hasSubPositions && !hasSeating)) return null;

  const placementApplied = appliedStages.has("placement");
  const seatingApplied = appliedStages.has("seating");

  return (
    <div className="rounded-md border border-[#E7E4DF] bg-[#F7F4F0]/60 px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A] mb-2">
        Further Design Improvements
      </div>
      <div className="space-y-2">
        {hasSubPositions && (
          <ImprovementCard
            title="Move subwoofers"
            description="Repositioning the subwoofers could further improve bass consistency across the seating area."
            onApply={handleApplySubPositions}
            applyLabel="Apply"
            appliedSummary={placementApplied ? "Subwoofer positions updated. Estimated improvement achieved." : null}
          />
        )}
        {hasSeating && (
          <ImprovementCard
            title="Move seating"
            description="Small seating position changes could further improve bass uniformity."
            onApply={handleApplySeating}
            applyLabel="Apply"
            appliedSummary={seatingApplied ? "Seating position updated. Estimated improvement achieved." : null}
          />
        )}
      </div>
    </div>
  );
}