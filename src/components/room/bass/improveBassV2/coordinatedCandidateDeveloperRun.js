// coordinatedCandidateDeveloperRun.js
// Bounded developer-only execution path for ONE coordinated candidate.
//
// This is an acceptance-test bridge, not a dealer-facing ADI feature. It:
//   1. Builds the Room D reference bundle from real candidate inputs.
//   2. Runs the three integrity gates (pre-transfer, pre-confirm, post-confirm).
//   3. Invokes evaluateCoordinatedCandidate exactly once.
//   4. Exposes the actual result, evidence and failure reason.
//
// It NEVER:
//   - runs the full V2 optimisation
//   - applies geometry, tuning or calibration
//   - autosaves or publishes engineering results
//   - triggers a project-wide recalculation
//
// The result is a temporary developer object held in a module-scoped store —
// it is not written into the saved optimiser plan or any persistent authority.

import { evaluateCoordinatedCandidate, buildCandidateTransfer } from "./coordinatedCandidateEvaluation";
import {
  buildRoomDBundle,
  ROOM_D_DIMS,
  ROOM_D_P14_TARGET,
  validateRoomDSavedSeatingReference,
} from "./coordinatedCandidateFixture";
import {
  checkPreTransferIntegrity,
  checkPreConfirmIntegrity,
  checkPostConfirmIntegrity,
} from "./coordinatedCandidateIntegrityChecks";
import { validateCoordinatedCandidateBundle } from "./coordinatedCandidateBundle";

let listeners = new Set();
let lastResult = null;

function publish() {
  listeners.forEach((l) => {
    try { l(); } catch { /* listener errors are non-fatal */ }
  });
}

export function subscribeCoordinatedDeveloperRun(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getCoordinatedDeveloperRunResult() {
  return lastResult;
}

export function clearCoordinatedDeveloperRun() {
  lastResult = null;
  publish();
}

/**
 * Run ONE coordinated candidate evaluation for the Room D reference.
 *
 * @param {object} [options]
 * @param {object} [options.integrationContext] — live LCR/sub integration context
 *   ({ roomDims, seatingPositions, rspPosition, speakerSources, crossover, physics })
 *   When null and requireCombined is false, the run falls back to sub-only.
 * @param {number} [options.amplifierPowerPerSubW] — amplifier power per sub
 * @param {boolean} [options.requireCombined] — when true (acceptance mode), a
 *   null integration context is an explicit rejection, never a silent sub-only
 *   fallback. Used by the developer panel so the browser acceptance test cannot
 *   pass as sub-only.
 * @returns {Promise<object>} { status, evidence, issues, boundaries }
 *   status: "evaluated" | "rejected" | "error"
 */
export async function runCoordinatedCandidateDeveloper(options = {}) {
  const {
    integrationContext = null,
    amplifierPowerPerSubW = 0,
    savedSeating = null,
    requireCombined = false,
    p14Target = null,
  } = options;

  // 0a. Acceptance mode: a combined LCR/sub evaluation is required. If the
  //     live LCR integration context is unavailable, reject the candidate
  //     explicitly — never fall back silently to sub-only for the acceptance
  //     test. Source-execution harnesses pass requireCombined=false so they
  //     can still exercise the sub-only path.
  if (requireCombined && !integrationContext) {
    lastResult = {
      status: "rejected",
      evidence: null,
      issues: ["Live LCR integration context unavailable — combined LCR/sub evaluation required for acceptance test"],
      boundaries: { preTransfer: null, preConfirm: null, postConfirm: null },
    };
    publish();
    return lastResult;
  }

  // 0b. P14 target authority. The candidate must inherit the project's
  //     authoritative operating target — the fixture never decides it. In
  //     acceptance mode a missing/unresolved target is an explicit rejection,
  //     never a 117 dB fixture default. Source-execution harnesses
  //     (requireCombined=false) fall back to the reference target so they can
  //     still exercise the pipeline without a live project.
  const resolvedP14Target = p14Target
    || (requireCombined ? null : ROOM_D_P14_TARGET);
  if (requireCombined && (!resolvedP14Target || !Number.isFinite(Number(resolvedP14Target.p14TargetDb)))) {
    lastResult = {
      status: "rejected",
      evidence: null,
      issues: ["Authoritative P14 operating target unavailable — cannot resolve the project's P14 target dB for the acceptance test. The fixture does not substitute a default."],
      boundaries: { preTransfer: null, preConfirm: null, postConfirm: null },
    };
    publish();
    return lastResult;
  }

  // 0. When live saved seating is supplied (the acceptance bridge), validate it
  //    strictly against the accepted Room D reference before building anything.
  //    A mismatch stops here with an explicit input-mismatch error — the bridge
  //    never silently falls back to synthetic listeners.
  if (savedSeating) {
    const ref = validateRoomDSavedSeatingReference(savedSeating);
    if (!ref.valid) {
      lastResult = {
        status: "error",
        evidence: null,
        issues: ["Room D saved seating reference mismatch:", ...ref.issues],
        boundaries: { preTransfer: null, preConfirm: null, postConfirm: null },
      };
      publish();
      return lastResult;
    }
  }

  // 1. Build the Room D bundle from real candidate inputs.
  let bundle;
  try {
    bundle = buildRoomDBundle({
      integrationContext,
      responseBasis: integrationContext ? "combined-lcr-sub" : "sub-only",
      savedSeating,
      p14Target: resolvedP14Target,
    });
  } catch (err) {
    lastResult = {
      status: "error",
      evidence: null,
      issues: [err?.message || "Bundle construction failed"],
      boundaries: { preTransfer: null, preConfirm: null, postConfirm: null },
    };
    publish();
    return lastResult;
  }

  const boundaries = { preTransfer: null, preConfirm: null, postConfirm: null };

  // 1b. Structural validation (from the bundle module).
  const structural = validateCoordinatedCandidateBundle(bundle);
  if (!structural.valid) {
    lastResult = {
      status: "rejected",
      evidence: null,
      issues: structural.issues,
      boundaries,
    };
    publish();
    return lastResult;
  }

  // 2. Pre-transfer integrity gate.
  const preTransfer = checkPreTransferIntegrity(bundle, ROOM_D_DIMS);
  boundaries.preTransfer = preTransfer;
  if (!preTransfer.valid) {
    lastResult = {
      status: "rejected",
      evidence: null,
      issues: preTransfer.issues,
      boundaries,
    };
    publish();
    return lastResult;
  }

  // 3. Build the candidate transfer ONCE through the shared transfer-building
  //    authority (placement → combined LCR/sub integration when the bundle
  //    requires it). The pre-confirmation gate validates this exact transfer
  //    object, and the same object is handed into canonical confirmation —
  //    never a second independently reconstructed transfer.
  let built;
  try {
    built = buildCandidateTransfer({
      bundle,
      roomDims: ROOM_D_DIMS,
      amplifierPowerPerSubW,
    });
  } catch (err) {
    lastResult = {
      status: "error",
      evidence: null,
      issues: [`Transfer build for pre-confirm gate failed: ${err?.message || err}`],
      boundaries,
    };
    publish();
    return lastResult;
  }

  // A terminal physical rejection or failed integration capture is a completed
  // outcome — report it without running the gate.
  if (built.status !== "built") {
    lastResult = {
      status: built.status,
      evidence: null,
      issues: built.issues,
      boundaries,
    };
    publish();
    return lastResult;
  }
  const candidateTransfer = built.transfer;

  // 3b. Pre-confirm integrity gate — validates the combined transfer that
  //     canonical confirmation will consume.
  const preConfirm = checkPreConfirmIntegrity(bundle, candidateTransfer);
  boundaries.preConfirm = preConfirm;
  if (!preConfirm.valid) {
    lastResult = {
      status: "rejected",
      evidence: null,
      issues: preConfirm.issues,
      boundaries,
    };
    publish();
    return lastResult;
  }

  // 4. Invoke the coordinated evaluator once, handing it the exact pre-built
  //    transfer so canonical confirmation consumes the same object the gate
  //    validated. The evaluator's internal post-confirmation identity check
  //    (validateCoordinatedCandidateIntegrity) guards source-ID continuity.
  const evalResult = await evaluateCoordinatedCandidate({
    bundle,
    roomDims: ROOM_D_DIMS,
    amplifierPowerPerSubW,
    preBuiltTransfer: candidateTransfer,
    preBuiltResponseBasis: built.responseBasis,
  });

  // 5. Post-confirm gate. We reconstruct a confirmation-shaped object from the
  //    evaluator's evidence for our independent check. When the evaluator
  //    rejected, we surface its issues directly.
  if (evalResult.status === "evaluated" && evalResult.evidence) {
    const postConfirm = checkPostConfirmEvidence(evalResult.evidence, bundle);
    boundaries.postConfirm = postConfirm;
    if (!postConfirm.valid) {
      lastResult = {
        status: "rejected",
        evidence: evalResult.evidence,
        issues: postConfirm.issues,
        boundaries,
      };
      publish();
      return lastResult;
    }
  } else {
    boundaries.postConfirm = {
      valid: false,
      issues: evalResult.issues || ["No evaluation evidence"],
    };
  }

  lastResult = {
    status: evalResult.status,
    evidence: evalResult.evidence,
    issues: evalResult.issues || [],
    boundaries,
  };
  publish();
  return lastResult;
}

/**
 * Independent post-confirmation evidence check from the evidence summary.
 * Verifies per-seat P20 ownership, P19 presence and receipt association
 * without the full confirmation object.
 */
function checkPostConfirmEvidence(evidence, bundle) {
  const issues = [];
  const bundleSeatIds = new Set(
    (Array.isArray(bundle?.seatingPositions) ? bundle.seatingPositions : [])
      .map((s) => String(s?.id || ""))
      .filter(Boolean),
  );
  const perSeatP20 = Array.isArray(evidence?.perSeatP20) ? evidence.perSeatP20 : [];
  if (perSeatP20.length === 0) {
    issues.push("No individual-seat P20 results in evidence");
  }
  for (const seat of perSeatP20) {
    const seatId = String(seat?.seatId || "");
    if (!seatId) {
      issues.push("A P20 row has no seatId");
      continue;
    }
    if (!bundleSeatIds.has(seatId)) {
      issues.push(`P20 seat ${seatId} not in proposed seating`);
    }
  }
  if (evidence?.p19?.level == null && evidence?.p19?.variationDb == null) {
    issues.push("No P19 evidence");
  }
  if (!evidence?.receipt?.selectedCandidateId) {
    issues.push("Canonical receipt missing selectedCandidateId");
  }
  return { valid: issues.length === 0, issues };
}