// coordinatedCandidateEvaluation.js
// Evaluate a coordinated candidate bundle through the existing canonical
// bass authority and retain the genuine post-EQ evidence.
//
// This module REUSES the existing Stage 2 canonical evaluation pipeline:
//   evaluateStage2Placement (modal simulation, raw transfer)
//   evaluateStage2ConfirmationWithTuning (EQ, P14/P18/P19/P20 authority)
//
// It does NOT add a new acoustic solver. It does NOT modify the installed
// design. The evaluation is read-only advice — the designer must explicitly
// approve any geometry change.
//
// For combined LCR/sub integration, the integration transfers are captured
// from the provided integration context (same path the V2 worker uses).

import { evaluateStage2Placement, evaluateStage2ConfirmationWithTuning } from "../stage2/stage2CanonicalEvaluation";
import { captureCombinedIntegrationTransfers } from "../combinedIntegrationEngine";
import { simulateAuthoritativeBassResponse } from "../authoritativeBassResponseEngine";
import { buildCoordinatedCandidateBundle, validateCoordinatedCandidateBundle, bundleToStage2Finalist, validateCoordinatedCandidateIntegrity } from "./coordinatedCandidateBundle";
import { summariseCoordinatedEvidence } from "./coordinatedCandidateEvidence";
import { diagnoseSharedCancellations } from "./sharedCancellationDiagnostic";

/**
 * Attach combined LCR/sub integration transfers to a raw transfer, using the
 * same path as the V2 worker's attachIntegration. This is the supported
 * combined integration authority — the raw sub-only transfer is not a
 * substitute for the combined result.
 *
 * @param {object} rawTransfer — sub-only raw transfer from evaluateStage2Placement
 * @param {object} integrationContext — { roomDims, seatingPositions, rspPosition, speakerSources, crossover, physics }
 * @returns {object|null} rawTransfer with integrationTransfers attached, or null on failure
 */
function attachCombinedIntegration(rawTransfer, integrationContext) {
  if (!rawTransfer?.sources?.length || !integrationContext?.speakerSources?.length) return null;

  const seatingPositions = rawTransfer.seatingPositions || integrationContext.seatingPositions;
  const rspPosition = rawTransfer.rspPosition || integrationContext.rspPosition;
  const payload = {
    roomDims: integrationContext.roomDims,
    seatingPositions,
    rspPosition,
    physics: integrationContext.physics,
    qStrategyOverride: "ab_corrected",
    sources: rawTransfer.sources,
  };

  // Capture per-source RSP complex transfers if not already present
  let flat = rawTransfer.perSourceRspComplexTransfers;
  if (!flat?.length) {
    const rspSim = simulateAuthoritativeBassResponse({ ...payload, seatingPositions: [] });
    flat = rspSim.perSourceRspComplexTransfers;
  }

  const integrationTransfers = captureCombinedIntegrationTransfers({
    ...payload,
    subSources: rawTransfer.sources,
    subTransfers: rawTransfer.perSourcePerSeatComplexTransfers,
    speakerSources: integrationContext.speakerSources,
  });

  if (!integrationTransfers?.available) return null;

  return {
    ...rawTransfer,
    perSourceRspComplexTransfers: flat,
    integrationTransfers,
    crossover: integrationContext.crossover || rawTransfer.crossover || null,
  };
}

/**
 * Build the candidate transfer (placement → combined LCR/sub integration when
 * the bundle requires it). This is the single transfer-building authority shared
 * by the evaluator and the developer pre-confirmation gate, so the gate validates
 * the exact transfer object canonical confirmation will consume — never a second
 * independently reconstructed transfer.
 *
 * @param {object} params
 * @param {object} params.bundle — from buildCoordinatedCandidateBundle
 * @param {object} params.roomDims — { widthM, lengthM, heightM }
 * @param {number} [params.amplifierPowerPerSubW]
 * @param {string} [params.frontOrientation]
 * @param {string} [params.rearOrientation]
 * @returns {{ status: "built"|"rejected"|"error", transfer: object|null, responseBasis: string|null, issues: string[] }}
 */
export function buildCandidateTransfer({ bundle, roomDims, amplifierPowerPerSubW = 0, frontOrientation = null, rearOrientation = null }) {
  const validation = validateCoordinatedCandidateBundle(bundle);
  if (!validation.valid) {
    return { status: "rejected", transfer: null, responseBasis: null, issues: validation.issues };
  }

  const finalist = bundleToStage2Finalist(bundle, roomDims);
  const rawTransfer = evaluateStage2Placement({
    finalist,
    roomDims,
    rspPosition: bundle.rspPosition,
    seatingPositions: bundle.seatingPositions,
    selectedSubModel: bundle.selectedSubModel,
    amplifierPowerPerSubW,
    subwooferBottomHeightM: bundle.subwooferBottomHeightM,
    frontOrientation,
    rearOrientation,
  });

  if (!rawTransfer) {
    return { status: "error", transfer: null, responseBasis: null, issues: ["Placement evaluation returned no raw transfer"] };
  }

  // A terminal physical rejection is a completed outcome, not missing evidence
  if (rawTransfer.physicalRejection) {
    return { status: "rejected", transfer: null, responseBasis: null, issues: [`Physical rejection: ${rawTransfer.physicalRejection.reason}`] };
  }

  let evalTransfer = rawTransfer;
  let responseBasis = "sub-only";
  if (bundle.responseBasis === "combined-lcr-sub" && bundle.integrationContext) {
    const combined = attachCombinedIntegration(rawTransfer, bundle.integrationContext);
    if (!combined) {
      return { status: "error", transfer: null, responseBasis: null, issues: ["Combined LCR/sub integration capture failed"] };
    }
    evalTransfer = combined;
    responseBasis = "combined-lcr-sub";
  }

  return { status: "built", transfer: evalTransfer, responseBasis, issues: [] };
}

/**
 * Evaluate a coordinated candidate bundle through the existing canonical engine.
 *
 * @param {object} params
 * @param {object} params.bundle — from buildCoordinatedCandidateBundle
 * @param {object} params.roomDims — { widthM, lengthM, heightM }
 * @param {number} [params.amplifierPowerPerSubW] — amplifier power per sub
 * @param {string} [params.frontOrientation] — front subwoofer orientation
 * @param {string} [params.rearOrientation] — rear subwoofer orientation
 * @param {object} [params.preBuiltTransfer] — a transfer already built by
 *   buildCandidateTransfer (the developer pre-confirmation gate path). When
 *   supplied, the evaluator reuses this exact object for canonical confirmation
 *   so the gate validates the same transfer confirmation consumes.
 * @param {string} [params.preBuiltResponseBasis] — response basis of the
 *   pre-built transfer ("sub-only" | "combined-lcr-sub").
 * @returns {Promise<object>} { status, evidence, issues }
 *   status: "evaluated" | "rejected" | "error"
 *   evidence: { p19, perSeatP20, primarySummary, secondarySummary, postEqCurves, receipt, crossover, responseBasis, sharedCancellations }
 */
export async function evaluateCoordinatedCandidate({
  bundle,
  roomDims,
  amplifierPowerPerSubW = 0,
  frontOrientation = null,
  rearOrientation = null,
  preBuiltTransfer = null,
  preBuiltResponseBasis = null,
}) {
  // 1. Validate the bundle before any evaluation
  const validation = validateCoordinatedCandidateBundle(bundle);
  if (!validation.valid) {
    return { status: "rejected", evidence: null, issues: validation.issues };
  }

  try {
    // 2. Obtain the transfer. When a pre-built transfer is supplied (the
    //    developer pre-confirmation gate path), reuse that exact object so the
    //    gate validates the same transfer canonical confirmation consumes —
    //    never a second independently reconstructed one. Otherwise build it
    //    here through the shared transfer-building authority.
    let evalTransfer;
    let responseBasis;
    if (preBuiltTransfer) {
      evalTransfer = preBuiltTransfer;
      responseBasis = preBuiltResponseBasis || bundle.responseBasis || "sub-only";
    } else {
      const built = buildCandidateTransfer({ bundle, roomDims, amplifierPowerPerSubW, frontOrientation, rearOrientation });
      if (built.status !== "built") {
        return { status: built.status, evidence: null, issues: built.issues };
      }
      evalTransfer = built.transfer;
      responseBasis = built.responseBasis;
    }

    // 3. Canonically confirm with the candidate's known tuning and crossover
    const p14 = bundle.p14Target || {};
    const confirmation = evaluateStage2ConfirmationWithTuning(evalTransfer, {
      tuning: bundle.tuning,
      tuningVariant: "delay-polarity-trim",
      crossover: bundle.crossover,
      p14TargetBasis: p14.p14TargetBasis || "minimum",
      p14TargetLevel: p14.p14TargetLevel || 2,
      p14TargetDb: p14.p14TargetDb || 117,
      p18TargetBasis: p14.p18TargetBasis || "minimum",
    });

    if (!confirmation) {
      return { status: "error", evidence: null, issues: ["Canonical confirmation returned no result"] };
    }

    // 3b. Validate post-evaluation identity integrity: the candidate-owned
    //     source IDs must survive through the transfer and confirmation
    //     without regeneration or substitution. Reject inconsistent candidates
    //     explicitly rather than silently regenerating IDs.
    const integrity = validateCoordinatedCandidateIntegrity(bundle, evalTransfer, confirmation);
    if (!integrity.valid) {
      return { status: "rejected", evidence: null, issues: integrity.issues };
    }

    // 4. Retain the genuine post-EQ evidence
    const evidence = summariseCoordinatedEvidence(confirmation, {
      candidateId: bundle.candidateId,
      responseBasis,
      crossover: bundle.crossover,
      tuning: bundle.tuning,
    });

    // 5. Inspect processed seat curves for shared cancellations
    evidence.sharedCancellations = diagnoseSharedCancellations(confirmation, {
      assessmentStartHz: confirmation.assessmentStartHz,
      assessmentEndHz: confirmation.assessmentEndHz,
    });

    return { status: "evaluated", evidence, issues: [] };
  } catch (err) {
    return { status: "error", evidence: null, issues: [err?.message || "Evaluation failed"] };
  }
}

/**
 * Convenience: build + validate + evaluate in one call.
 */
export async function buildAndEvaluateCoordinatedCandidate(params) {
  const bundle = buildCoordinatedCandidateBundle(params);
  const { roomDims, amplifierPowerPerSubW, frontOrientation, rearOrientation } = params;
  return evaluateCoordinatedCandidate({
    bundle, roomDims, amplifierPowerPerSubW, frontOrientation, rearOrientation,
  });
}