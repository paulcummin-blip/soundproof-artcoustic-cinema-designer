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
//   Prepare  — validate recommendation, build new Applied Calibration (pure)
//   Phase 1  — write new Applied Calibration to the Applied Calibration store
//   Phase 2  — mark recommendation as Accepted (terminal) in the Recommendation store
//   Rollback — if Phase 2 fails after Phase 1 committed, restore the old
//              Applied Calibration so the two authorities never disagree
//
// Because both stores are synchronous in-memory Maps and JavaScript is
// single-threaded, no other code can run between Phase 1 and Phase 2. The
// only failure modes are thrown exceptions from the store operations
// themselves, which the rollback handles.
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

// ── Validation (pure, no side effects) ───────────────────────────────────

/**
 * Validate that a recommendation can be accepted into Applied Calibration.
 *
 * Only Generated or Stale recommendations with Calibration intent can be
 * accepted. Declined, Accepted, and Superseded recommendations are rejected.
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
  if (status !== RECOMMENDATION_STATUS.GENERATED && status !== RECOMMENDATION_STATUS.STALE) {
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
 * The status is USER_ACCEPTED — the designer explicitly accepted this
 * recommendation into the design.
 *
 * @param {object} recommendation - recommendation object
 * @returns {object} new Applied Calibration Authority object
 */
function buildAcceptedAuthority(recommendation) {
  return createAppliedCalibrationAuthority({
    basisFingerprint: recommendation.geometryFingerprint,
    source: APPLIED_CALIBRATION_SOURCE.OPTIMISER,
    status: APPLIED_CALIBRATION_STATUS.USER_ACCEPTED,
    candidateId: recommendation.originatingCandidateId,
    recommendationId: recommendation.recommendationId,
    values: recommendation.recommendationValues,
  });
}

// ── Accept Transition (transactional) ──────────────────────────────────

/**
 * Execute the Accept Transition: accept the current Recommendation into
 * Applied Calibration.
 *
 * This is a TRANSACTIONAL operation:
 *   Phase 1: Write recommendation values to Applied Calibration Authority
 *   Phase 2: Mark recommendation as Accepted (terminal)
 *   Rollback: If Phase 2 fails after Phase 1 committed, restore the old
 *            Applied Calibration so the two authorities never disagree.
 *
 * The transition either completes entirely or not at all.
 *
 * Only the CURRENT recommendation can be accepted. If recommendationId is
 * provided, it must match the current recommendation's ID.
 *
 * Only Calibration intent is supported. Design and Specification intents
 * transition to Geometry, which is a different flow.
 *
 * @param {string} projectId
 * @param {string} versionId
 * @param {object} [options]
 * @param {string} [options.recommendationId] - must match current recommendation's ID if provided
 * @returns {{ accepted: true, recommendationId: string, appliedCalibrationStatus: string }}
 * @throws if validation fails, the recommendation is not current, or the
 *         transition fails (after rollback, the system is restored to its
 *         pre-transition state)
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

  // 4. Build the new Applied Calibration Authority (pure, no side effects)
  const newAuthority = buildAcceptedAuthority(currentRec);

  // ── Transaction ───────────────────────────────────────────────────────

  // 5. Snapshot old Applied Calibration for rollback
  const oldAuthority = getAppliedCalibrationAuthority(projectId, versionId);

  let phase1Committed = false;

  try {
    // Phase 1: Write recommendation values to Applied Calibration Authority
    setAppliedCalibrationAuthority(projectId, versionId, newAuthority);
    phase1Committed = true;

    // Phase 2: Mark recommendation as Accepted (terminal)
    // If this throws (e.g. invalid transition), the catch block rolls back
    // Phase 1 so Applied Calibration and Recommendation never disagree.
    markRecommendationAccepted(projectId, versionId);
  } catch (error) {
    // Rollback: if Phase 1 committed, restore the old Applied Calibration
    // so the two authorities are back in their pre-transition state.
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
    appliedCalibrationStatus: APPLIED_CALIBRATION_STATUS.USER_ACCEPTED,
  };
}