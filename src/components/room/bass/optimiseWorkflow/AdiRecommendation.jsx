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
import { buildAdiDecisionFromPersistedRecommendation } from "@/components/adi/persistedRecommendationAdapter";
import { buildAdiBassEvidence } from "@/components/adi/adiBassEvidenceBuilder";
import { RECOMMENDATION_INTENT } from "@/components/room/bass/recommendationAuthority/recommendationAuthority";
import { ADI_OUTCOME } from "@/components/adi/adiConstants";
import { buildOptimisedInstances } from "../improveBassV2/improveBassV2Apply";
import {
  buildLeverApplyInstances,
  buildLeverUndoInstances,
} from "../optimiserPlan/optimiserPlanLeverApply.js";
import { readAuthoritativeP20Headline } from "../optimiserPlan/optimiserPlanMetrics.js";
import { OPTIMISER_LEVER } from "../optimiserPlan/optimiserPlanConstants.js";
import { applyCalibrationTuning, isCalibrationApplied } from "../improveBassV2/improveBassV2ApplyCalibration";
import {
  computeAppliedCalibrationBasisFingerprint,
  resolveAppliedCalibrationStatus,
} from "../appliedCalibrationAuthority/appliedCalibrationAuthority";
import { resolveAdiAppliedState, ADI_APPLIED_STATE } from "@/components/adi/adiAppliedStateAuthority";
import { buildProvenance } from "../improveBassV2/appliedProvenance";
import { computeV2DesignFingerprint } from "../improveBassV2/improveBassV2Fingerprint";
import { buildAuthoritativeRspPosition } from "../authoritativeRspPosition";
import { useActiveProjectId } from "@/components/state/project-session";
import { useAppliedCalibrationAuthority } from "../appliedCalibrationAuthority/appliedCalibrationAuthorityStore";
import OptimisationPlanStatus from "@/components/room/bass/optimiserPlan/OptimisationPlanStatus.jsx";
import AdiOptimisationJourney from "@/components/room/bass/optimiserPlan/AdiOptimisationJourney.jsx";
import OptimiserRunEvidenceBlock from "@/components/room/bass/optimiserPlan/OptimiserRunEvidenceBlock.jsx";
import { firstSentence } from "@/components/room/bass/optimiserPlan/resolveAdiOptimiserJourney.js";
import { useOptimiserPlanView } from "@/components/room/bass/optimiserPlan/useOptimiserPlanView.js";
import {
  OPTIMISER_PRESENTATION_STATE,
  resolveOptimiserPresentationState,
} from "@/components/room/bass/optimiserPlan/resolveOptimiserPresentationState.js";

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
  if (Array.isArray(evidence) && evidence.length > 0) return evidence;
  return null;
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
  optimisationRunBlockReason,
  optimisationRunStatus,
  optimisationRunError,
  onRunOptimisationPlan,
}) {
  const [applying, setApplying] = useState(false);

  // The design's own seat count, so the acoustic estimate spans this design's
  // seats rather than an assumed number.
  const seatCount = Array.isArray(seatingPositions) ? seatingPositions.length : null;
  const [appliedStage, setAppliedStage] = useState(null);

  // Applied Calibration Authority — persisted per-project+version.
  // Derive the APPLIED badge from this so it survives a page refresh.
  // The transient `autoApplied` prop (from workflowState) covers the
  // in-session workflow; the persisted authority covers cold-load restore.
  const projectId = useActiveProjectId();
  const versionId = appState?.activeVersionId || null;
  const appliedCalibrationAuthority = useAppliedCalibrationAuthority(projectId, versionId);
  const hasPersistedAppliedCalibration = !!appliedCalibrationAuthority
    && Array.isArray(appliedCalibrationAuthority.values)
    && appliedCalibrationAuthority.values.length > 0
    && !appliedCalibrationAuthority.staleReason;

  // Does the CURRENT design still reflect the persisted calibration? A stale
  // authority (geometry changed since it was applied) or values that no longer
  // match the instances means the design does NOT reflect an applied
  // recommendation — APPLIED must not be claimed.
  const appliedCalibrationIsStale = useMemo(() => {
    if (!hasPersistedAppliedCalibration) return false;
    const basisFingerprint = computeAppliedCalibrationBasisFingerprint({
      subwooferInstances: currentInstances,
      roomDims,
      seatingPositions,
      rspPosition: null,
      selectedSubModel,
    });
    return resolveAppliedCalibrationStatus(appliedCalibrationAuthority, basisFingerprint).isStale === true;
  }, [hasPersistedAppliedCalibration, appliedCalibrationAuthority, currentInstances, roomDims, seatingPositions, selectedSubModel]);

  const appliedCalibrationIsInDesign = useMemo(
    () => (hasPersistedAppliedCalibration
      ? isCalibrationApplied(currentInstances, appliedCalibrationAuthority?.values || [])
      : false),
    [hasPersistedAppliedCalibration, currentInstances, appliedCalibrationAuthority],
  );

  // Persistent visibility: during calculation with a published result,
  // the ADI recommendation stays visible (greyed) rather than disappearing.
  const isCalculating = shared?.calculationInProgress === true;
  const hasPublishedResult = shared?.hasCurrentResult === true;
  const isCalculatingWithPublished = isCalculating && hasPublishedResult;

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

  const seatingDisplacement = useMemo(() => {
    if (!isSeatingLever || !hasSeating) return null;
    return computeSeatingDisplacement(seatingPositions, seatingWinner?.seatingPositions);
  }, [isSeatingLever, hasSeating, seatingPositions, seatingWinner]);

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
  });

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

  // ── Individual lever apply / undo ──
  // One lever at a time, through the SAME commit + recalculation path every
  // other apply uses. Only that lever's own field is written; the plan object is
  // left intact (it becomes stale because the design changed, which is what
  // disables the other levers until the plan is re-run).
  const [leverApplyBusy, setLeverApplyBusy] = useState(null);
  const [leverOutcome, setLeverOutcome] = useState(null);

  const commitLeverChange = useCallback((lever, build) => {
    if (!commitInstances || !lever?.key) return;
    const result = build({ leverKey: lever.key, lever, instances: currentInstances });
    if (!result.ok) return;
    const before = readAuthoritativeP20Headline(completedBassAuthority);
    commitInstances(
      result.instances,
      lever.key === OPTIMISER_LEVER.PLACEMENT
        ? { front: { placementMode: "manual", isManual: true }, rear: { placementMode: "manual", isManual: true } }
        : undefined,
    );
    setLeverOutcome({ leverKey: lever.key, label: lever.label || lever.key, before, after: null });
    if (typeof onRecalculate === "function") {
      onRecalculate({ previousCacheKey: shared?.cacheKey || null });
    }
  }, [commitInstances, currentInstances, completedBassAuthority, onRecalculate, shared]);

  const handleApplyLever = useCallback((lever) => {
    setLeverApplyBusy(lever?.key || null);
    try {
      commitLeverChange(lever, buildLeverApplyInstances);
    } finally {
      setLeverApplyBusy(null);
    }
  }, [commitLeverChange]);

  const handleUndoLever = useCallback((lever) => {
    setLeverApplyBusy(lever?.key || null);
    try {
      commitLeverChange(lever, buildLeverUndoInstances);
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

  if (!adiDecision?.recommendation) {
    return (
      <div className="rounded-lg border border-[#E0DCD5] bg-[#F4F1EC] px-4 py-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-[#213428]" />
          <span className="text-[13px] font-semibold text-[#1B1A1A]">Recommended Improvement</span>
        </div>
        <div className="mt-2 text-[12px] text-[#3E4349] leading-relaxed">
          No further engineering changes are recommended.
        </div>
      </div>
    );
  }

  const { recommendation, outcome, intent } = adiDecision;

  // No improvement case — first-class outcomes
  const isNoEngineering = outcome === ADI_OUTCOME.NO_FURTHER_ENGINEERING;
  const isNoEq = outcome === ADI_OUTCOME.NO_FURTHER_EQ;
  // FIX 4: Incomplete evaluation — bass evidence exists but the optimiser
  // could not confirm an improvement. Must NOT show APPLIED or an Apply button.
  const isIncomplete = outcome === ADI_OUTCOME.INCOMPLETE;

  // The evaluated, applicable action — the ONLY path by which anything becomes
  // available. It requires a confirmed winner whose current and proposed values
  // are known and whose Apply action is usable. Generic diagnosis text is never
  // an available recommendation.
  const actionableSubPositions = intent === RECOMMENDATION_INTENT.DESIGN
    && isSubPositionLever && hasSubPositions && hasCanonicalInstances && !appliedStage;
  const actionableSeating = intent === RECOMMENDATION_INTENT.DESIGN
    && isSeatingLever && hasSeating && !appliedStage;
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

  // FIX 4 (revised): an incomplete evaluation is never a dead end. The card
  // states the limiting factor, what is incomplete, the next action and what
  // that action will evaluate — resolved from the saved Optimisation Plan by
  // the ADI optimiser journey authority. It still shows no Apply button.
  if (isIncomplete) {
    return (
      <AdiOptimisationJourney
        projectId={projectId}
        versionId={versionId}
        completedBassAuthority={completedBassAuthority}
        currentDesignFingerprint={shared?.cacheKey || null}
        instances={currentInstances}
        seatCount={seatCount}
        limitingFactorSentence={limitingFactorSentence}
        runBlockReason={optimisationRunBlockReason || null}
        runStatus={optimisationRunStatus || "idle"}
        runError={optimisationRunError || null}
        onRunOptimisationPlan={onRunOptimisationPlan}
        onApplyLever={handleApplyLever}
        onUndoLever={handleUndoLever}
        leverApplyBusy={leverApplyBusy}
        leverOutcome={leverOutcomeResolved}
        why={recommendation?.why || null}
        presentation={optimiserPresentation}
      />
    );
  }

  // Target not achieved — the selected bass target is not met and the optimiser
  // found no winner. Must NOT show "No further engineering changes are
  // recommended", APPLIED, or an Apply button. Explain the limiting factor and
  // give practical options instead of reassuring closure.
  const isTargetNotAchieved = outcome === ADI_OUTCOME.TARGET_NOT_ACHIEVED;

  if (isTargetNotAchieved) {
    return (
      <div className="rounded-lg border border-[#E0DCD5] bg-[#F4F1EC] px-4 py-3 space-y-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-[#B91C1C]" />
          <span className="text-[13px] font-semibold text-[#1B1A1A]">Recommended Improvement</span>
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-[#B91C1C] px-2 py-0.5 text-[9px] font-semibold uppercase text-white">
            Target not achieved
          </span>
        </div>
        {recommendation?.assessment && (
          <div className="space-y-0.5">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">
              Assessment
            </div>
            <div className="text-[12px] font-semibold text-[#1B1A1A] leading-relaxed">
              {recommendation.assessment}
            </div>
          </div>
        )}
        <div className="text-[13px] font-semibold text-[#1B1A1A] leading-relaxed">
          {recommendation?.action}
        </div>
        {recommendation?.why && (
          <div className="space-y-0.5">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">
              Why
            </div>
            <div className="text-[11px] text-[#3E4349] leading-relaxed">
              {recommendation.why}
            </div>
          </div>
        )}
        {recommendation?.remainingLimitation && (
          <div className="space-y-0.5">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">
              Remaining Limitation
            </div>
            <div className="text-[11px] text-[#3E4349] leading-relaxed">
              {recommendation.remainingLimitation}
            </div>
          </div>
        )}
        {/* What the run actually evaluated, saved with this design version. */}
        <OptimiserRunEvidenceBlock
          evidence={optimiserPresentation.evidence}
          seatCount={seatCount}
          instances={currentInstances}
        />
      </div>
    );
  }

  if (isNoEngineering || isNoEq) {
    const noImprovementText = isNoEq
      ? recommendation?.action || "No further EQ is recommended."
      : "No further engineering changes are recommended.";
    const remainingText = isNoEq
      ? recommendation?.remainingLimitation || "The remaining limitation requires a physical change."
      : null;
    return (
      <div className="rounded-lg border border-[#E0DCD5] bg-[#F4F1EC] px-4 py-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-[#213428]" />
          <span className="text-[13px] font-semibold text-[#1B1A1A]">Recommended Improvement</span>
        </div>
        <div className="mt-2 text-[12px] text-[#3E4349] leading-relaxed">
          {noImprovementText}
        </div>
        {remainingText && (
          <div className="mt-1 text-[11px] text-[#625143] leading-relaxed">
            {remainingText}
          </div>
        )}
        {/* A run that found no improvement still states what it tested. */}
        <OptimiserRunEvidenceBlock
          evidence={optimiserPresentation.evidence}
          seatCount={seatCount}
          instances={currentInstances}
        />
      </div>
    );
  }

  // ── The canonical optimiser state owns the card ──
  // Whenever the resolved state is not an available, evaluated, applicable
  // change, the card is rendered from that state alone: one pill, one headline,
  // the run evidence, and no Apply action. Generic ADI diagnosis is shown as
  // diagnosis — it can never produce an available recommendation.
  if (optimiserPresentation.state !== OPTIMISER_PRESENTATION_STATE.PLAN_AVAILABLE) {
    return (
      <AdiOptimisationJourney
        projectId={projectId}
        versionId={versionId}
        completedBassAuthority={completedBassAuthority}
        currentDesignFingerprint={shared?.cacheKey || null}
        instances={currentInstances}
        seatCount={seatCount}
        limitingFactorSentence={limitingFactorSentence}
        runBlockReason={optimisationRunBlockReason || null}
        runStatus={optimisationRunStatus || "idle"}
        runError={optimisationRunError || null}
        onRunOptimisationPlan={onRunOptimisationPlan}
        onApplyLever={handleApplyLever}
        onUndoLever={handleUndoLever}
        leverApplyBusy={leverApplyBusy}
        leverOutcome={leverOutcomeResolved}
        assessment={recommendation?.assessment || null}
        why={recommendation?.why || null}
        presentation={optimiserPresentation}
      />
    );
  }

  // Determine the specific action text
  let actionText = recommendation.action;
  if (isSubPositionLever && subDisplacement) {
    actionText = `Move the subwoofers ${subDisplacement.distanceMm} mm ${subDisplacement.direction}.`;
  } else if (isSeatingLever && seatingDisplacement) {
    actionText = `Move the seating row ${seatingDisplacement.distanceMm} mm ${seatingDisplacement.direction}.`;
  }

  // Format RP22 evidence
  const rp22Changes = formatRp22Evidence(recommendation.rp22Evidence);

  // Determine if we need an Apply button
  const isCalibration = intent === RECOMMENDATION_INTENT.CALIBRATION;
  const isPhysical = intent === RECOMMENDATION_INTENT.DESIGN;
  const isSpecification = intent === RECOMMENDATION_INTENT.SPECIFICATION;

  const canApplySubPositions = actionableSubPositions;
  const canApplySeating = actionableSeating;
  // The Apply action exists only where the canonical presentation state says an
  // evaluated change is available and applicable.
  const showApplyButton = optimiserPresentation.showApply && (canApplySubPositions || canApplySeating);
  const applyHandler = canApplySubPositions ? handleApplySubPositions : canApplySeating ? handleApplySeating : null;

  // ── Applied state — ONE authority ──
  // APPLIED requires a specific recommendation to have been applied, the design
  // to still reflect it, no Apply action waiting, and a complete evaluation.
  // It is therefore mutually exclusive with an available Apply action.
  const adiAppliedState = resolveAdiAppliedState({
    outcome,
    hasRecommendation: !!recommendation,
    recommendationAction: actionText,
    applyActionAvailable: showApplyButton && !!applyHandler,
    appliedStage,
    workflowApplied: isCalibration ? autoApplied : null,
    appliedCalibration: appliedCalibrationAuthority,
    appliedCalibrationIsStale,
    appliedCalibrationIsInDesign,
  });
  const showAppliedBadge = adiAppliedState.showAppliedBadge;

  return (
    <div className="rounded-lg border border-[#E0DCD5] bg-[#F4F1EC] px-4 py-3 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Activity className="h-4 w-4 text-[#213428]" />
        <span className="text-[13px] font-semibold text-[#1B1A1A]">Recommended Improvement</span>
        {adiAppliedState.state !== ADI_APPLIED_STATE.NOT_APPLIED && (
          <span className={`ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase transition-opacity duration-300 ${isCalculatingWithPublished ? "opacity-60" : ""} ${showAppliedBadge ? "bg-[#213428] text-white" : "bg-[#E7E2DA] text-[#625143]"}`}>
            {showAppliedBadge && <CheckCircle2 className="h-2.5 w-2.5" />}
            {adiAppliedState.label}
          </span>
        )}
      </div>

      {/* Assessment — what is happening */}
      {recommendation?.assessment && (
        <div className="space-y-0.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">
            Assessment
          </div>
          <div className="text-[11px] text-[#3E4349] leading-relaxed">
            {recommendation.assessment}
          </div>
        </div>
      )}

      {/* The action — implicit recommendation, no label needed */}
      <div className="text-[14px] font-semibold text-[#1B1A1A] leading-relaxed">
        {actionText}
      </div>

      {/* Why — what physical behaviour caused this */}
      {recommendation?.why && (
        <div className="space-y-0.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">
            Why
          </div>
          <div className="text-[11px] text-[#3E4349] leading-relaxed">
            {recommendation.why}
          </div>
        </div>
      )}

      {/* Expected Result — visual before → after transitions */}
      {rp22Changes && (
        <div className="space-y-0.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">
            Expected Result
          </div>
          <div className="space-y-1">
            {rp22Changes.map((change, i) => (
              <div key={i} className="flex items-center gap-2 text-[11px]">
                <span className="font-semibold text-[#1B1A1A] w-8">{change.parameter}</span>
                <span className="text-[#8A7B6A]">{change.from}</span>
                <ArrowRight className="h-3 w-3 text-[#213428]" />
                <span className="font-semibold text-[#213428]">{change.to}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Remaining Limitation — what still cannot be improved */}
      {recommendation?.remainingLimitation && (
        <div className="space-y-0.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">
            Remaining Limitation
          </div>
          <div className="text-[11px] text-[#3E4349] leading-relaxed">
            {recommendation.remainingLimitation}
          </div>
        </div>
      )}

      {/* Optimisation Plan — the SAVED evaluated optimiser result, restored from
          the design version (or the published result) and never recomputed */}
      <OptimisationPlanStatus
        projectId={projectId}
        versionId={versionId}
        completedBassAuthority={completedBassAuthority}
        currentDesignFingerprint={shared?.cacheKey || null}
        instances={currentInstances}
        onApplyLever={handleApplyLever}
        onUndoLever={handleUndoLever}
        leverApplyBusy={leverApplyBusy}
        leverOutcome={leverOutcomeResolved}
      />

      {/* Apply button */}
      {showApplyButton && applyHandler && (
        <button
          type="button"
          onClick={applyHandler}
          disabled={applying}
          className={`inline-flex items-center gap-1.5 rounded-md bg-[#213428] px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-[#3E4349] disabled:opacity-50 ${isCalculatingWithPublished ? "opacity-60" : ""}`}
        >
          {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
          Apply
        </button>
      )}
    </div>
  );
}