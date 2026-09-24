// AdiRecommendation.jsx
// ---------------------------------------------------------------------------
// The unified ADI engineering partner experience.
//
// One card. One recommendation. Four questions:
//   What should I do?  — specific action
//   Why?               — dominant physical cause, one sentence
//   What improves?     — expected RP22 level changes
//   Apply              — one button, one action
//
// If no improvement is available:
//   "No further engineering changes are recommended."
//   No Apply button. No placeholder text.
//
// This component consolidates the former BassOptimisationSummary and
// FurtherImprovements into a single coherent recommendation. The ADI
// decision model is the reasoning authority; the optimiser is the engineer.
// ---------------------------------------------------------------------------

import React, { useCallback, useMemo, useState } from "react";
import { CheckCircle2, ArrowRight, Loader2, Activity } from "lucide-react";
import { runEngineeringDecisionModel } from "@/components/adi";
import { RECOMMENDATION_INTENT } from "@/components/room/bass/recommendationAuthority/recommendationAuthority";
import { ADI_OUTCOME } from "@/components/adi/adiConstants";
import { buildOptimisedInstances } from "../improveBassV2/improveBassV2Apply";
import { applyCalibrationTuning } from "../improveBassV2/improveBassV2ApplyCalibration";
import { buildProvenance } from "../improveBassV2/appliedProvenance";
import { computeV2DesignFingerprint } from "../improveBassV2/improveBassV2Fingerprint";
import { buildAuthoritativeRspPosition } from "../authoritativeRspPosition";

// ── Displacement helpers ──

function computeSubwooferDisplacement(currentInstances, winner) {
  const coords = winner?.positionCoordinates || winner?.coordinates;
  if (!Array.isArray(coords) || !coords.length) return null;

  const activeInstances = (currentInstances || []).filter((i) => i?.enabled !== false);
  if (!activeInstances.length || activeInstances.length !== coords.length) return null;

  let totalDeltaY = 0;
  for (let i = 0; i < activeInstances.length; i++) {
    const currentY = Number(activeInstances[i]?.position?.y) || 0;
    const recommendedY = Number(coords[i]?.y) || 0;
    totalDeltaY += recommendedY - currentY;
  }
  const avgDeltaY = totalDeltaY / activeInstances.length;
  const distanceMm = Math.round(Math.abs(avgDeltaY) * 1000);
  if (distanceMm < 50) return null;

  // Y=0 is the front wall (screen). +Y = toward back, -Y = toward screen.
  const direction = avgDeltaY > 0 ? "backward" : "forward";
  return { distanceMm, direction };
}

function computeSeatingDisplacement(currentSeating, recommendedSeating) {
  if (!Array.isArray(currentSeating) || !Array.isArray(recommendedSeating)) return null;
  const count = Math.min(currentSeating.length, recommendedSeating.length);
  if (count === 0) return null;

  let totalDeltaY = 0;
  for (let i = 0; i < count; i++) {
    const currentY = Number(currentSeating[i]?.y) || Number(currentSeating[i]?.position?.y) || 0;
    const recommendedY = Number(recommendedSeating[i]?.y) || Number(recommendedSeating[i]?.position?.y) || 0;
    totalDeltaY += recommendedY - currentY;
  }
  const avgDeltaY = totalDeltaY / count;
  const distanceMm = Math.round(Math.abs(avgDeltaY) * 1000);
  if (distanceMm < 50) return null;

  const direction = avgDeltaY > 0 ? "backward" : "forward";
  return { distanceMm, direction };
}

// ── RP22 evidence formatting ──

function formatRp22Evidence(evidence) {
  if (!evidence || evidence === "RP22 results available after recalculation") return null;
  const parts = evidence
    .split("; ")
    .map((part) => {
      const match = part.match(/^(P\d+)\s+\S+:\s*(.+)$/);
      if (match) return { parameter: match[1], change: match[2].replace("→", " → ") };
      return null;
    })
    .filter(Boolean);
  return parts.length > 0 ? parts : null;
}

// ── Main component ──

export default function AdiRecommendation({
  autoApplied,
  v2State,
  completedBassAuthority,
  subwooferCount,
  shared,
  roomDims,
  seatingPositions,
  recommendations,
  currentInstances,
  selectedSubModel,
  commitInstances,
  commitSeating,
  commitSeatingProvenance,
  hasCanonicalInstances,
  appState,
  amplifierPowerPerSubW,
  onRecalculate,
}) {
  const [applying, setApplying] = useState(false);
  const [appliedStage, setAppliedStage] = useState(null);

  // Run ADI decision model
  const adiDecision = useMemo(() => {
    try {
      return runEngineeringDecisionModel({
        optimiserResult: v2State,
        currentResult: completedBassAuthority?.result || completedBassAuthority,
        designObjectives: {
          p14TargetDb: shared?.authoritative?.requested?.selectedP14TargetDb,
          p14Level: shared?.authoritative?.requested?.requestedLevel,
          p18TargetBasis: shared?.authoritative?.requested?.p18TargetBasis,
        },
        context: { subwooferCount, roomDims, seatingPositions },
      });
    } catch {
      return null;
    }
  }, [v2State, completedBassAuthority, shared, subwooferCount, roomDims, seatingPositions]);

  // Determine the physical lever from the ADI decision
  const appropriateLever = adiDecision?.leverAssessment?.appropriateLever;
  const leverKey = appropriateLever?.lever;
  const isSubPositionLever = leverKey === "move_subwoofer";
  const isSeatingLever = leverKey === "move_seating";

  // Physical recommendation data
  const subPositionWinner = recommendations?.subPositions;
  const seatingWinner = recommendations?.seating;
  const hasSubPositions = !!subPositionWinner;
  const hasSeating = !!seatingWinner;

  // Compute specific displacement for the action text
  const subDisplacement = useMemo(() => {
    if (!isSubPositionLever || !hasSubPositions) return null;
    return computeSubwooferDisplacement(currentInstances, subPositionWinner);
  }, [isSubPositionLever, hasSubPositions, currentInstances, subPositionWinner]);

  const seatingDisplacement = useMemo(() => {
    if (!isSeatingLever || !hasSeating) return null;
    return computeSeatingDisplacement(seatingPositions, seatingWinner?.seatingPositions);
  }, [isSeatingLever, hasSeating, seatingPositions, seatingWinner]);

  // ── Apply handlers (preserved from FurtherImprovements) ──

  const selection = v2State?.winner;

  const handleApplySubPositions = useCallback(() => {
    if (!hasSubPositions || !commitInstances || !hasCanonicalInstances || !selection) return;
    const winner = subPositionWinner;
    if (!winner) return;

    setApplying(true);
    try {
      const fingerprint = selection.applyFingerprint;
      const provenance = buildProvenance("subPositions", winner.candidateId || "further", fingerprint, fingerprint);
      const next = buildOptimisedInstances(winner, currentInstances, roomDims, selectedSubModel, provenance);
      commitInstances(next, {
        front: { placementMode: "manual", isManual: true },
        rear: { placementMode: "manual", isManual: true },
      });
      setAppliedStage("placement");
      if (typeof onRecalculate === "function") {
        onRecalculate({ previousCacheKey: shared?.cacheKey || null });
      }
    } finally {
      setApplying(false);
    }
  }, [hasSubPositions, commitInstances, hasCanonicalInstances, selection, subPositionWinner, currentInstances, roomDims, selectedSubModel, shared, onRecalculate]);

  const handleApplySeating = useCallback(() => {
    if (!hasSeating || !commitSeating || !selection) return;
    const winner = seatingWinner;
    if (!winner?.seatingPositions) return;

    setApplying(true);
    try {
      const fingerprint = selection.applyFingerprint;
      const tuning = winner.appliedTuning || winner.tuning || [];
      const provisionalProvenance = buildProvenance(
        "seating_positions",
        winner.candidateId || "further",
        fingerprint,
        fingerprint,
      );
      const nextInstances = Array.isArray(tuning) && tuning.length
        ? applyCalibrationTuning(currentInstances, tuning, provisionalProvenance)
        : currentInstances;
      const rspPosition = buildAuthoritativeRspPosition(roomDims, appState?.mlpY_m, appState?.mlpX_m, appState?.designatedRspSeatId);
      const postMutationFingerprint = (() => {
        try {
          return computeV2DesignFingerprint({
            subwooferInstances: nextInstances,
            roomDims,
            seatingPositions: winner.seatingPositions,
            rspPosition,
            selectedSubModel,
            p14TargetBasis: shared?.authoritative?.requested?.p14TargetBasis || "minimum",
            p14TargetLevel: shared?.authoritative?.requested?.requestedLevel || 2,
            p14TargetDb: shared?.authoritative?.requested?.selectedP14TargetDb || 117,
            p18TargetBasis: shared?.authoritative?.requested?.p18TargetBasis || "minimum",
            amplifierPowerPerSubW,
          });
        } catch {
          return null;
        }
      })();
      const provenance = buildProvenance("seating_positions", winner.candidateId || "further", fingerprint, postMutationFingerprint);
      if (Array.isArray(tuning) && tuning.length && commitInstances) {
        const finalInstances = applyCalibrationTuning(currentInstances, tuning, provenance);
        commitInstances(finalInstances, {
          front: { placementMode: "manual", isManual: true },
          rear: { placementMode: "manual", isManual: true },
        });
      }
      commitSeating(winner.seatingPositions);
      if (commitSeatingProvenance) commitSeatingProvenance(provenance);
      setAppliedStage("seating");
      if (typeof onRecalculate === "function") {
        onRecalculate({ previousCacheKey: shared?.cacheKey || null });
      }
    } finally {
      setApplying(false);
    }
  }, [hasSeating, commitSeating, commitInstances, selection, seatingWinner, currentInstances, roomDims, appState, selectedSubModel, shared, amplifierPowerPerSubW, commitSeatingProvenance, onRecalculate]);

  // ── Render ──

  if (!adiDecision?.recommendation) return null;

  const { recommendation, diagnosis, outcome, intent } = adiDecision;

  // No improvement case
  const isNoImprovement =
    outcome === ADI_OUTCOME.NO_FURTHER_ENGINEERING || outcome === ADI_OUTCOME.NO_FURTHER_EQ;

  if (isNoImprovement) {
    return (
      <div className="rounded-md border border-[#E7E4DF] bg-[#F7F4F0]/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-[#213428]" />
          <div>
            <span className="text-[13px] font-semibold text-[#1B1A1A]">Recommended Improvement</span>
            <div className="text-[9px] font-medium text-[#8A7B6A]" style={{ letterSpacing: '0.04em' }}>
              Powered by Artcoustic Design Intelligence
            </div>
          </div>
        </div>
        <div className="mt-2 text-[12px] text-[#3E4349] leading-relaxed">
          No further engineering changes are recommended.
        </div>
      </div>
    );
  }

  // Determine the specific action text
  let actionText = recommendation.action;
  if (isSubPositionLever && subDisplacement) {
    actionText = `Move the subwoofers ${subDisplacement.distanceMm} mm ${subDisplacement.direction}.`;
  } else if (isSeatingLever && seatingDisplacement) {
    actionText = `Move the seating row ${seatingDisplacement.distanceMm} mm ${seatingDisplacement.direction}.`;
  }

  // Determine the cause (one sentence)
  const causeText = diagnosis?.physicalCause?.description || diagnosis?.problem?.description || "";

  // Format RP22 evidence
  const rp22Changes = formatRp22Evidence(recommendation.rp22Evidence);

  // Determine if we need an Apply button
  const isCalibration = intent === RECOMMENDATION_INTENT.CALIBRATION;
  const isPhysical = intent === RECOMMENDATION_INTENT.DESIGN;
  const isSpecification = intent === RECOMMENDATION_INTENT.SPECIFICATION;

  const canApplySubPositions = isPhysical && isSubPositionLever && hasSubPositions && hasCanonicalInstances && !appliedStage;
  const canApplySeating = isPhysical && isSeatingLever && hasSeating && !appliedStage;
  const showApplyButton = canApplySubPositions || canApplySeating;
  const showAppliedBadge = (isCalibration && autoApplied) || appliedStage;

  const applyHandler = canApplySubPositions ? handleApplySubPositions : canApplySeating ? handleApplySeating : null;

  return (
    <div className="rounded-md border border-[#E7E4DF] bg-[#F7F4F0]/60 px-4 py-3 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Activity className="h-4 w-4 text-[#213428]" />
        <div>
          <span className="text-[13px] font-semibold text-[#1B1A1A]">Recommended Improvement</span>
          <div className="text-[9px] font-medium text-[#8A7B6A]" style={{ letterSpacing: '0.04em' }}>
            Powered by Artcoustic Design Intelligence
          </div>
        </div>
        {showAppliedBadge && (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-[#213428] px-2 py-0.5 text-[9px] font-semibold uppercase text-white">
            <CheckCircle2 className="h-2.5 w-2.5" />
            Applied
          </span>
        )}
      </div>

      {/* What should I do? */}
      <div className="space-y-0.5">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">
          What should I do?
        </div>
        <div className="text-[12px] font-medium text-[#1B1A1A] leading-relaxed">
          {actionText}
        </div>
      </div>

      {/* Why? */}
      {causeText && (
        <div className="space-y-0.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">
            Why?
          </div>
          <div className="text-[11px] text-[#3E4349] leading-relaxed">
            {causeText}
          </div>
        </div>
      )}

      {/* What improves? */}
      {rp22Changes && (
        <div className="space-y-0.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">
            What improves?
          </div>
          <div className="space-y-0.5">
            {rp22Changes.map((change, i) => (
              <div key={i} className="flex items-center gap-2 text-[11px]">
                <span className="font-semibold text-[#1B1A1A]">{change.parameter}</span>
                <span className="text-[#3E4349]">{change.change}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Apply button */}
      {showApplyButton && applyHandler && (
        <button
          type="button"
          onClick={applyHandler}
          disabled={applying}
          className="inline-flex items-center gap-1.5 rounded-md bg-[#213428] px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-[#3E4349] disabled:opacity-50"
        >
          {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
          Apply
        </button>
      )}
    </div>
  );
}