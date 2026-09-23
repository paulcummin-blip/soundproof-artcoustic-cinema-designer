// acceptTransition.js
// ---------------------------------------------------------------------------
// Accept Transition — the explicit, designer-gated, TRANSACTIONAL transition
// from a Recommendation (Sound Proof's proposal) to Applied Calibration (the
// designer's accepted design).
//
// This is the single most important state transition in Sound Proof.
// It is treated like a database transaction: it either completes entirely
// or not at all. There must never be a state where Recommendation and
// Applied Calibration disagree because only half the transition succeeded.
//
// TRANSACTION GUARANTEE (atomicity):
//
//   Prepare  — validate recommendation, verify geometry, build new Applied
//              Calibration and Acceptance Record (pure, no side effects)
//   Phase 1  — write new Applied Calibration to the Applied Calibration store
//   Phase 2  — write Acceptance Record to the Acceptance Record store (audit)
//   Phase 3  — mark recommendation as Accepted (terminal) in the Recommendation store
//   Rollback — if any phase fails after earlier phases committed, restore
//              all earlier phases in reverse order so the authorities never
//              disagree and no partial audit record survives
//
// GEOMETRY VALIDATION:
//   The recommendation's geometryFingerprint MUST match the current geometry.
//   If it doesn't, the transition is rejected — the recommendation is stale.
//   The designer must re-optimise before accepting. Stale recommendations
//   are never silently accepted.
//
// ACCEPTANCE RECORD:
//   An immutable audit record is created linking the Recommendation to the
//   Applied Calibration. This is the proof that the transition occurred.
//
// Because all stores are synchronous in-memory Maps and JavaScript is
// single-threaded, no other code can run between phases. The only failure
// modes are thrown exceptions from the store operations themselves, which
// the rollback handles.
//
// The Accept Transition only handles Calibration intent (delay, gain,
// polarity, phase). Design and Specification intents transition to Geometry,
// which is a different authority and a different flow — not implemented here.
//
// Only the CURRENT recommendation can be accepted. If a recommendationId is
// provided, it must match the current recommendation's ID. This prevents
// accepting a historical recommendation that is no longer the active proposal.
//
// This module does NOT:
//   - Modify Geometry
//   - Change acoustics, RP22, or optimiser behaviour
//   - Auto-apply anything (the designer must explicitly call this)
//   - Render any UI
// ---------------------------------------------------------------------------

import { RECOMMENDATION_INTENT, RECOMMENDATION_STATUS } from "./recommendationAuthority.js";
import {
  getRecommendation,
  markRecommendationAccepted,
} from "./recommendationAuthorityStore.js";
import {
  APPLIED_CALIBRATION_STATUS,
  APPLIED_CALIBRATION_SOURCE,
  createAppliedCalibrationAuthority,
} from "../appliedCalibrationAuthority/appliedCalibrationAuthority.js";
import {
  getAppliedCalibrationAuthority,
  setAppliedCalibrationAuthority,
} from "../appliedCalibrationAuthority/appliedCalibrationAuthorityStore.js";
import {
  createAcceptanceRecord,
  computeRecommendationFingerprint,
} from "./acceptanceRecord.js";
import {
  getAcceptanceRecords,
  addAcceptanceRecord,
  _replaceAcceptanceRecords,
} from "./acceptanceRecordStore.js";

// ── ID generation ───────────────────────────────────────────────────────

let acIdCounter = 0;

function generateAppliedCalibrationId() {
  acIdCounter += 1;
  return `ac-${Date.now().toString(36)}-${acIdCounter.toString(36)}`;
}

// ── Validation (pure, no side effects) ───────────────────────────────────

/**
 * Validate that a recommendation can be accepted into Applied Calibration.
 *
 * Only Generated recommendations with Calibration intent can be accepted.
 * Stale, Declined, Accepted, and Superseded recommendations are rejected.
 * A Stale recommendation belongs to a previous geometry and must never be
 * accepted — the designer must re-optimise to produce a fresh recommendation.
 *
 * @param {object} recommendation - recommendation object
 * @throws if the recommendation cannot be accepted
 */
function validateForAcceptance(recommendation) {
  if (!recommendation) {
    throw new Error("Accept Transition: recommendation not found");
  }

  const status = recommendation.lifecycleStatus;

  if (status === RECOMMENDATION_STATUS.ACCEPTED) {
    throw new Error(
      `Accept Transition: recommendation ${recommendation.recommendationId} is already Accepted (terminal)`
    );
  }
  if (status === RECOMMENDATION_STATUS.SUPERSEDED) {
    throw new Error(
      `Accept Transition: recommendation ${recommendation.recommendationId} is Superseded (terminal)`
    );
  }
  if (status === RECOMMENDATION_STATUS.DECLINED) {
    throw new Error(
      `Accept Transition: recommendation ${recommendation.recommendationId} is Declined — cannot accept a declined recommendation`
    );
  }
  if (status === RECOMMENDATION_STATUS.STALE) {
    throw new Error(
      `Accept Transition: Recommendation is stale. Re-optimise required.`
    );
  }
  if (status !== RECOMMENDATION_STATUS.GENERATED) {
    throw new Error(
      `Accept Transition: recommendation ${recommendation.recommendationId} has invalid status '${status}'`
    );
  }

  if (recommendation.intent !== RECOMMENDATION_INTENT.CALIBRATION) {
    throw new Error(
      `Accept Transition: recommendation ${recommendation.recommendationId} has intent '${recommendation.intent}' — only Calibration intent can be accepted into Applied Calibration`
    );
  }

  if (!recommendation.geometryFingerprint) {
    throw new Error(
      `Accept Transition: recommendation ${recommendation.recommendationId} has no geometry fingerprint`
    );
  }

  if (!Array.isArray(recommendation.recommendationValues)) {
    throw new Error(
      `Accept Transition: recommendation ${recommendation.recommendationId} has no calibration values`
    );
  }
}

// ── Build Applied Calibration from Recommendation (pure) ────────────────

/**
 * Build a new Applied Calibration Authority object from a recommendation.
 *
 * The recommendation's geometryFingerprint becomes the Applied Calibration's
 * basisFingerprint — the calibration is current against the geometry that
 * the recommendation was generated for. If geometry has since changed, the
 * Applied Calibration will be Stale (resolved by the consumer via
 * resolveAppliedCalibrationStatus).
 *
 * The recommendation's recommendationValues (per-sub tuning) become the
 * Applied Calibration's values.
 *
 * The status is CURRENT — the calibration matches the geometry at the
 * moment of acceptance. USER_ACCEPTED is reserved for the designer's
 * explicit Keep decision after the calibration later becomes Stale.
 *
 * @param {object} recommendation - recommendation object
 * @returns {object} new Applied Calibration Authority object
 */
function buildAcceptedAuthority(recommendation, appliedCalibrationId) {
  const authority = createAppliedCalibrationAuthority({
    basisFingerprint: recommendation.geometryFingerprint,
    source: APPLIED_CALIBRATION_SOURCE.OPTIMISER,
    status: APPLIED_CALIBRATION_STATUS.CURRENT,
    candidateId: recommendation.originatingCandidateId,
    recommendationId: recommendation.recommendationId,
    values: recommendation.recommendationValues,
  });
  // Add the appliedCalibrationId for traceability. This does not modify
  // the Applied Calibration Authority module — it extends the object.
  return { ...authority, id: appliedCalibrationId };
}

// ── Accept Transition (transactional) ──────────────────────────────────

/**
 * Execute the Accept Transition: accept the current Recommendation into
 * Applied Calibration.
 *
 * This is a TRANSACTIONAL operation with three phases:
 *   Phase 1: Write recommendation values to Applied Calibration Authority
 *   Phase 2: Write Acceptance Record (immutable audit trail)
 *   Phase 3: Mark recommendation as Accepted (terminal)
 *   Rollback: If any phase fails after earlier phases committed, restore
 *            all earlier phases in reverse order.
 *
 * The transition either completes entirely or not at all. There is never
 * a state where Recommendation and Applied Calibration disagree, and no
 * partial Acceptance Record survives a failed transition.
 *
 * GEOMETRY VALIDATION:
 *   The recommendation's geometryFingerprint MUST match the current geometry
 *   (passed as currentGeometryFingerprint). If it doesn't, the transition
 *   is rejected — the recommendation is stale. The designer must re-optimise
 *   before accepting.
 *
 * Only the CURRENT recommendation can be accepted. If recommendationId is
 * provided, it must match the current recommendation's ID.
 *
 * Only Calibration intent is supported. Design and Specification intents
 * transition to Geometry, which is a different flow.
 *
 * @param {string} projectId
 * @param {string} versionId
 * @param {object} options
 * @param {string} options.currentGeometryFingerprint - REQUIRED: current geometry fingerprint for validation
 * @param {string} [options.recommendationId] - must match current recommendation's ID if provided
 * @param {string} [options.acceptedBy] - identity of the designer accepting (for audit)
 * @returns {{ accepted: true, recommendationId: string, appliedCalibrationId: string, acceptanceId: string, appliedCalibrationStatus: string }}
 * @throws if validation fails, geometry is stale, the recommendation is not
 *         current, or the transition fails (after rollback, the system is
 *         restored to its pre-transition state)
 */
export function acceptRecommendation(projectId, versionId, options = {}) {
  const opts = options || {};

  // ── Prepare: validate and build (pure, no side effects) ──────────────

  // 1. Get the current recommendation
  const currentRec = getRecommendation(projectId, versionId);
  if (!currentRec) {
    throw new Error("Accept Transition: no current recommendation to accept");
  }

  // 2. If recommendationId provided, verify it matches the current
  if (opts.recommendationId && opts.recommendationId !== currentRec.recommendationId) {
    throw new Error(
      `Accept Transition: recommendation ${opts.recommendationId} is not the current recommendation — only the current recommendation can be accepted`
    );
  }

  // 3. Validate the recommendation (throws if invalid — no state changed yet)
  validateForAcceptance(currentRec);

  // 4. Geometry validation — reject stale recommendations
  if (!opts.currentGeometryFingerprint) {
    throw new Error(
      "Accept Transition: currentGeometryFingerprint is required — cannot validate geometry without it"
    );
  }
  if (currentRec.geometryFingerprint !== opts.currentGeometryFingerprint) {
    throw new Error(
      `Accept Transition: Recommendation is stale. Re-optimise required.`
    );
  }

  // 5. Build the new Applied Calibration Authority (pure, no side effects)
  const appliedCalibrationId = generateAppliedCalibrationId();
  const newAuthority = buildAcceptedAuthority(currentRec, appliedCalibrationId);

  // 6. Build the Acceptance Record (pure, no side effects)
  const acceptanceRecord = createAcceptanceRecord({
    recommendationId: currentRec.recommendationId,
    appliedCalibrationId,
    geometryFingerprint: currentRec.geometryFingerprint,
    recommendationFingerprint: computeRecommendationFingerprint(currentRec.recommendationValues),
    acceptedBy: opts.acceptedBy || "Unknown",
    recommendationIntent: currentRec.intent,
    recommendationSource: currentRec.generatedBy,
  });

  // ── Transaction (3-phase with rollback) ──────────────────────────────

  // 7. Snapshot old state for rollback
  const oldAuthority = getAppliedCalibrationAuthority(projectId, versionId);
  const oldAcceptanceRecords = getAcceptanceRecords(projectId, versionId);

  let phase1Committed = false;
  let phase2Committed = false;

  try {
    // Phase 1: Write to Applied Calibration Authority
    setAppliedCalibrationAuthority(projectId, versionId, newAuthority);
    phase1Committed = true;

    // Phase 2: Write Acceptance Record (audit trail exists before
    // recommendation changes — if Phase 3 fails, we can roll this back)
    addAcceptanceRecord(projectId, versionId, acceptanceRecord);
    phase2Committed = true;

    // Phase 3: Mark recommendation as Accepted (terminal)
    // If this throws, the recommendation is NOT marked Accepted (the throw
    // happens before the store is updated). Roll back Phase 2 and Phase 1.
    markRecommendationAccepted(projectId, versionId);
  } catch (error) {
    // Rollback in reverse order
    if (phase2Committed) {
      _replaceAcceptanceRecords(projectId, versionId, oldAcceptanceRecords);
    }
    if (phase1Committed) {
      setAppliedCalibrationAuthority(projectId, versionId, oldAuthority);
    }
    throw new Error(
      `Accept Transition failed and was rolled back: ${error.message}`
    );
  }

  // ── Commit ────────────────────────────────────────────────────────────

  return {
    accepted: true,
    recommendationId: currentRec.recommendationId,
    appliedCalibrationId,
    acceptanceId: acceptanceRecord.acceptanceId,
    appliedCalibrationStatus: APPLIED_CALIBRATION_STATUS.CURRENT,
  };
}