// AdiRecommendation.jsx
// ---------------------------------------------------------------------------
// Bass Optimisation — Powered by ADI. ONE panel, whatever the outcome.
//
// This component resolves the ADI decision model, the saved Optimisation Plan
// and the canonical presentation state, and hands them to the single ADI card.
// It renders no card of its own: there is no second recommendation surface and
// no separate plan panel beside the card, so the designer can never be shown two
// panels that appear to say the same thing.
//
//   What did ADI test?    — the fixed-order tested-options table
//   What did ADI find?    — current result, best result found
//   What should I do?     — one plain-English recommendation
//   Can I apply it?       — one Apply action, owned by the plan's own safety
//   Can I undo it?        — one Undo, once a change has been applied
//
// Engineer details stay collapsed inside the card. The ADI decision model is the
// reasoning authority; the optimiser is the engineer.
// ---------------------------------------------------------------------------

import React, { useCallback, useMemo, useState } from "react";
import { runEngineeringDecisionModel } from "@/components/adi";
import { buildAdiDecisionFromPersistedRecommendation } from "@/components/adi/persistedRecommendationAdapter";
import { buildAdiBassEvidence } from "@/components/adi/adiBassEvidenceBuilder";
import { RECOMMENDATION_INTENT } from "@/components/room/bass/recommendationAuthority/recommendationAuthority";
import { ADI_OUTCOME } from "@/components/adi/adiConstants";
import {
  buildLeverApplyInstances,
  buildLeverUndoInstances,
  buildSeatingApplyPositions,
  buildSeatingUndoPositions,
} from "../optimiserPlan/optimiserPlanLeverApply.js";
import { readAuthoritativeP20Headline } from "../optimiserPlan/optimiserPlanMetrics.js";
import { OPTIMISER_LEVER } from "../optimiserPlan/optimiserPlanConstants.js";
import { useActiveProjectId } from "@/components/state/project-session";
import AdiOptimisationJourney from "@/components/room/bass/optimiserPlan/AdiOptimisationJourney.jsx";
import { firstSentence } from "@/components/room/bass/optimiserPlan/resolveAdiOptimiserJourney.js";
import { useOptimiserPlanView } from "@/components/room/bass/optimiserPlan/useOptimiserPlanView.js";
import { resolveOptimiserPresentationState } from "@/components/room/bass/optimiserPlan/resolveOptimiserPresentationState.js";
import { buildDesignChangeRecommendations } from "@/components/room/bass/optimiseWorkflow/adiCalibrationAutoApplyAuthority.js";

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

// ── Main component ──

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
  optimisationRunBlockReason,
  optimisationRunStatus,
  optimisationRunError,
  onRunOptimisationPlan,
  onCalculateBassPerformance,
}) {
  // The design's own seat count, so the acoustic estimate spans this design's
  // seats rather than an assumed number.
  const seatCount = Array.isArray(seatingPositions) ? seatingPositions.length : null;

  // The open design version this card's optimiser evidence belongs to.
  const projectId = useActiveProjectId();
  const versionId = appState?.activeVersionId || null;

  // Run ADI decision model.
  // On cold load / refresh, v2State (transient V2 optimiser memory) is empty.
  // Fall back to the persisted Recommendation Engine output stored inside the
  // published bass authority contract so ADI restores from the same authority
  // as Graph and RP22 — never "No further engineering changes" when a valid
  // recommendation was published.
  // FIX 1 & 2: Use the ONE shared canonical evidence builder so the display
  // path and the publication path never diverge. The builder extracts
  // perSeatP20 from contract.bassResult.seatResults.P20 (the canonical
  // seat-consistency source), synthesises perSeatP19 from the RSP aggregate,
  // and maps p14AchievedDb / achievedP18Hz from the contract.
  const canonicalBassEvidence = useMemo(
    () => buildAdiBassEvidence(completedBassAuthority),
    [completedBassAuthority],
  );

  const adiDecision = useMemo(() => {
    let liveDecision = null;
    try {
      liveDecision = runEngineeringDecisionModel({
        optimiserResult: v2State,
        currentResult: canonicalBassEvidence,
        designObjectives: {
          p14TargetDb: shared?.authoritative?.requested?.selectedP14TargetDb,
          p14Level: shared?.authoritative?.requested?.requestedLevel,
          p18TargetBasis: shared?.authoritative?.requested?.p18TargetBasis,
          p18TargetHz: shared?.authoritative?.requested?.selectedP18RequiredExtensionHz,
        },
        context: { subwooferCount, roomDims, seatingPositions },
      });
    } catch {
      // A cold-load live decision can fail on a compact published contract.
      // The persisted display decision is still independently restorable.
    }

    if (liveDecision?.recommendation && liveDecision.outcome !== ADI_OUTCOME.NO_FURTHER_ENGINEERING) {
      return liveDecision;
    }

    const persistedRecommendation = completedBassAuthority?.contract?.recommendation || null;
    const publishedDecision = persistedRecommendation?.publishedAdiDecision;
    if (publishedDecision?.recommendation) return publishedDecision;
    return buildAdiDecisionFromPersistedRecommendation(persistedRecommendation) || liveDecision;
  }, [v2State, completedBassAuthority, canonicalBassEvidence, shared, subwooferCount, roomDims, seatingPositions]);

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

  // The limiting factor in one plain sentence — ADI's own diagnosis, never
  // re-derived. Shown as the lead of the optimiser journey card.
  const limitingFactorSentence = useMemo(
    () => firstSentence(adiDecision?.diagnosis?.problem?.description),
    [adiDecision],
  );

  // ── The optimiser evidence for THIS design version ──
  // Read through the same plan/run-evidence store every other surface uses.
  // No calculation, no re-run, no mutation: a read of what was saved.
  const optimiserPlanView = useOptimiserPlanView({
    projectId,
    versionId,
    completedBassAuthority,
    currentDesignFingerprint: shared?.cacheKey || null,
    instances: currentInstances,
    seatingPositions,
  });

  // ── Apply handlers (preserved from FurtherImprovements) ──

  // ── Individual lever apply / undo ──
  // One lever at a time, through the SAME commit + recalculation path every
  // other apply uses. Only that lever's own field is written; the plan object is
  // left intact (it becomes stale because the design changed, which is what
  // disables the other levers until the plan is re-run).
  const [leverApplyBusy, setLeverApplyBusy] = useState(null);
  const [leverOutcome, setLeverOutcome] = useState(null);

  const commitLeverChange = useCallback((lever, direction = "to") => {
    if (!lever?.key) return;
    const before = readAuthoritativeP20Headline(completedBassAuthority);

    // A seating lever writes the evaluated seat positions — the subwoofer
    // instances are never touched by it, and vice versa. Undo writes back the
    // lever's own persisted previous positions.
    if (lever.key === OPTIMISER_LEVER.SEATING) {
      if (!commitSeating) return;
      const result = direction === "from"
        ? buildSeatingUndoPositions({ lever, seatingPositions })
        : buildSeatingApplyPositions({ lever, seatingPositions });
      if (!result.ok) return;
      commitSeating(result.seatingPositions);
      setLeverOutcome({
        leverKey: lever.key, label: lever.label || lever.key, before, after: null, appliedLever: lever.key, direction,
      });
      if (typeof onRecalculate === "function") {
        onRecalculate({ previousCacheKey: shared?.cacheKey || null });
      }
      return;
    }

    if (!commitInstances) return;
    const result = direction === "from"
      ? buildLeverUndoInstances({ leverKey: lever.key, lever, instances: currentInstances })
      : buildLeverApplyInstances({ leverKey: lever.key, lever, instances: currentInstances });
    if (!result.ok) return;
    commitInstances(
      result.instances,
      lever.key === OPTIMISER_LEVER.PLACEMENT
        ? { front: { placementMode: "manual", isManual: true }, rear: { placementMode: "manual", isManual: true } }
        : undefined,
    );
    setLeverOutcome({
      leverKey: lever.key, label: lever.label || lever.key, before, after: null, appliedLever: lever.key, direction,
    });
    if (typeof onRecalculate === "function") {
      onRecalculate({ previousCacheKey: shared?.cacheKey || null });
    }
  }, [commitInstances, commitSeating, currentInstances, seatingPositions, completedBassAuthority, onRecalculate, shared]);

  const handleApplyLever = useCallback((lever) => {
    setLeverApplyBusy(lever?.key || null);
    try {
      commitLeverChange(lever, "to");
    } finally {
      setLeverApplyBusy(null);
    }
  }, [commitLeverChange]);

  const handleUndoLever = useCallback((lever) => {
    setLeverApplyBusy(lever?.key || null);
    try {
      commitLeverChange(lever, "from");
    } finally {
      setLeverApplyBusy(null);
    }
  }, [commitLeverChange]);

  // The MEASURED after value is only reported once a DIFFERENT authoritative
  // result has been published. Until then the card states that recalculation is
  // running — the predicted improvement is never presented as achieved.
  const leverOutcomeResolved = useMemo(() => {
    if (!leverOutcome) return null;
    if (leverOutcome.after) return leverOutcome;
    const current = readAuthoritativeP20Headline(completedBassAuthority);
    if (!current?.fingerprint) return leverOutcome;
    if (leverOutcome.before?.fingerprint === current.fingerprint) return leverOutcome;
    return { ...leverOutcome, after: current };
  }, [leverOutcome, completedBassAuthority]);

  // ── The physical changes ADI found but must not apply ──
  // Stated under their own heading, from the same canonically confirmed stage
  // results the placement panel acts on — never applied by ADI itself.
  const designChanges = useMemo(
    () => buildDesignChangeRecommendations({
      baseline: v2State?.currentResult || null,
      subPositionResult: recommendations?.subPositions || null,
      seatingResult: recommendations?.seating || null,
    }),
    [v2State?.currentResult, recommendations?.subPositions, recommendations?.seating],
  );

  // ── Render ──
  // ONE panel — the Bass Optimisation card. Every ADI outcome (no run, running,
  // stale, no useful improvement, incomplete, failed, or an evaluated change
  // that is available) renders this same card, and the canonical presentation
  // state owns its status pill, copy, evidence and actions. A second
  // recommendation surface and a separate plan panel can therefore never appear
  // beside it.
  const { recommendation, outcome, intent } = adiDecision || {};

  // The evaluated, applicable action — the ONLY path by which anything becomes
  // available. It requires a confirmed winner whose current and proposed values
  // are known and whose Apply action is usable.
  const hasAppliedLever = !!leverOutcomeResolved?.appliedLever;
  const actionableSubPositions = intent === RECOMMENDATION_INTENT.DESIGN
    && isSubPositionLever && hasSubPositions && hasCanonicalInstances && !hasAppliedLever;
  const actionableSeating = intent === RECOMMENDATION_INTENT.DESIGN
    && isSeatingLever && hasSeating && !hasAppliedLever;
  const actionableEvaluation = {
    available: actionableSubPositions || actionableSeating,
    summary: actionableSubPositions && subDisplacement
      ? `Move the subwoofers ${subDisplacement.distanceMm} mm ${subDisplacement.direction}.`
      : null,
    reason: recommendation?.why || null,
  };

  // ── ONE presentation state for the whole card ──
  // Status pill, headline, explanation, lever rows, Apply controls, re-run
  // control, candidate evidence and rejection reason all come from this.
  const optimiserPresentation = resolveOptimiserPresentationState({
    planView: optimiserPlanView,
    runStatus: optimisationRunStatus || "idle",
    runError: optimisationRunError || null,
    actionable: actionableEvaluation,
    runBlocked: !!optimisationRunBlockReason,
  });

  // A design that cannot meet its selected target states the remaining
  // limitation in one line beside the status, rather than withholding it.
  const designLimitation = outcome === ADI_OUTCOME.TARGET_NOT_ACHIEVED
    ? (recommendation?.remainingLimitation || recommendation?.action || null)
    : null;

  return (
    <AdiOptimisationJourney
      projectId={projectId}
      versionId={versionId}
      completedBassAuthority={completedBassAuthority}
      currentDesignFingerprint={shared?.cacheKey || null}
      instances={currentInstances}
      seatingPositions={seatingPositions}
      seatCount={seatCount}
      roomDims={roomDims}
      limitingFactorSentence={limitingFactorSentence}
      designLimitation={designLimitation}
      runBlockReason={optimisationRunBlockReason || null}
      runStatus={optimisationRunStatus || "idle"}
      runError={optimisationRunError || null}
      onRunOptimisationPlan={onRunOptimisationPlan}
      onCalculateBassPerformance={onCalculateBassPerformance || null}
      onApplyLever={handleApplyLever}
      onUndoLever={handleUndoLever}
      leverApplyBusy={leverApplyBusy}
      leverOutcome={leverOutcomeResolved}
      assessment={recommendation?.assessment || null}
      why={recommendation?.why || null}
      presentation={optimiserPresentation}
      // What ADI applied on its own this run (settings, objective, canonical
      // before/after) and the physical changes that remain the designer's call.
      appliedCalibrationEvidence={autoApplied?.calibration || null}
      designChanges={designChanges}
    />
  );
}