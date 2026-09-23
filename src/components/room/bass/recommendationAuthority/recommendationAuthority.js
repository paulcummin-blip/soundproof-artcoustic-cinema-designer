// recommendationAuthority.js
// ---------------------------------------------------------------------------
// Recommendation Authority — the lifecycle layer that owns engineering
// recommendations produced by the optimiser. A recommendation is a PROPOSAL,
// not the current design. It never writes to subwooferInstances, delay,
// gain, polarity, or phase.
//
// DESIGN PRINCIPLE:
//   "Sound Proof owns recommendations. The designer owns the design.
//    Engineering predictions are always made from the designer's chosen
//    design, never directly from the optimiser's recommendations."
//
// Four authorities (frozen architecture):
//   1. Geometry              (Designer)           — physical room/listener/source geometry
//   2. Recommendation        (Sound Proof)        — optimiser recommendations (THIS MODULE)
//   3. Applied Calibration   (Designer/Installer) — calibration accepted into the design
//   4. Engineering Prediction (Sound Proof)      — P14/P18/P19/P20 from Geometry + Applied Calibration
//
// A recommendation is IMMUTABLE. Only its lifecycle status changes.
// recommendationValues are frozen at creation time and never mutated.
//
// Lifecycle:
//   Generated  → Stale       (geometry changed)
//   Generated  → Declined     (designer rejected)
//   Generated  → Accepted     (designer accepted — terminal)
//   Generated  → Superseded   (newer recommendation for same geometry)
//   Stale      → Declined     (designer rejects stale recommendation)
//   Stale      → Superseded   (newer recommendation replaces stale one)
//   Declined   → Stale       (geometry changes after decline)
//
//   Declined is NOT permanent — it belongs only to the geometry against which
//   it was declined. If geometry changes, a new Generated recommendation may
//   be created even if it proposes the same action.
//
//   Accepted and Superseded are terminal — no further transitions.
//
// Intent:
//   Calibration   — adjust delay, gain, polarity, phase (no physical change)
//   Design        — move subwoofers, move seating, change layout
//   Specification — add/remove/replace subwoofers, change products
//
// This module is PURE: no React, no side effects, no I/O.
// It produces recommendation objects and resolves/ transitions their status.
// ---------------------------------------------------------------------------

// ── Intent enum ──────────────────────────────────────────────────────────

export const RECOMMENDATION_INTENT = {
  CALIBRATION: "Calibration",
  DESIGN: "Design",
  SPECIFICATION: "Specification",
};

// ── Lifecycle status enum ─────────────────────────────────────────────────

export const RECOMMENDATION_STATUS = {
  GENERATED: "Generated",
  STALE: "Stale",
  SUPERSEDED: "Superseded",
  DECLINED: "Declined",
  ACCEPTED: "Accepted",
};

// ── Terminal statuses ────────────────────────────────────────────────────
//
// Accepted is terminal — the designer accepted it into the design.
// Superseded is terminal — a newer recommendation replaced it for the same
// geometry. Neither can transition further.

const TERMINAL_STATUSES = new Set([
  RECOMMENDATION_STATUS.ACCEPTED,
  RECOMMENDATION_STATUS.SUPERSEDED,
]);

// ── Valid transitions ───────────────────────────────────────────────────
//
// Each status maps to the set of statuses it may transition TO.
// Terminal statuses map to empty sets (no transitions out).

const VALID_TRANSITIONS = {
  [RECOMMENDATION_STATUS.GENERATED]: new Set([
    RECOMMENDATION_STATUS.STALE,
    RECOMMENDATION_STATUS.DECLINED,
    RECOMMENDATION_STATUS.ACCEPTED,
    RECOMMENDATION_STATUS.SUPERSEDED,
  ]),
  [RECOMMENDATION_STATUS.STALE]: new Set([
    RECOMMENDATION_STATUS.DECLINED,
    RECOMMENDATION_STATUS.SUPERSEDED,
  ]),
  [RECOMMENDATION_STATUS.DECLINED]: new Set([
    RECOMMENDATION_STATUS.STALE,
    RECOMMENDATION_STATUS.SUPERSEDED,
  ]),
  [RECOMMENDATION_STATUS.ACCEPTED]: new Set(),
  [RECOMMENDATION_STATUS.SUPERSEDED]: new Set(),
};

// ── ID generation ───────────────────────────────────────────────────────

let idCounter = 0;

function generateRecommendationId() {
  idCounter += 1;
  return `rec-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

// ── Recommendation creation ─────────────────────────────────────────────

/**
 * Create a new immutable Recommendation object.
 *
 * recommendationValues are frozen at creation time and never mutated.
 * Only the lifecycle status changes (via transitionRecommendationStatus).
 *
 * The returned object is frozen — no property can be reassigned.
 *
 * @param {object} params
 * @param {string} [params.recommendationId] - unique ID (auto-generated if omitted)
 * @param {string} params.geometryFingerprint - geometry fingerprint at generation time
 * @param {string} [params.generatedBy] - what generated this (e.g. "Bass Optimiser V2")
 * @param {string} params.intent - one of RECOMMENDATION_INTENT
 * @param {object|Array} params.recommendationValues - immutable values (frozen)
 *        For Calibration: [{ id, delayMs, gainDb, polarity, phaseControlDeg }]
 *        For Design:      { subPositions: [...], seatingPositions: [...] }
 *        For Specification: { subwooferChanges: [...] }
 * @param {object} [params.engineeringReasoning] - why this recommendation exists
 * @param {string} [params.originatingCandidateId] - optimiser candidate that produced it
 * @returns {object} immutable recommendation object (frozen)
 */
export function createRecommendation(params) {
  const p = params || {};

  const values = Array.isArray(p.recommendationValues)
    ? [...p.recommendationValues]
    : { ...(p.recommendationValues || {}) };

  const recommendation = {
    recommendationId: String(p.recommendationId || generateRecommendationId()),
    geometryFingerprint: String(p.geometryFingerprint || ""),
    generatedTimestamp: p.generatedTimestamp || Date.now(),
    generatedBy: String(p.generatedBy || "Bass Optimiser"),
    intent: p.intent || RECOMMENDATION_INTENT.CALIBRATION,
    recommendationValues: Object.freeze(values),
    engineeringReasoning: p.engineeringReasoning || null,
    originatingCandidateId: String(p.originatingCandidateId || ""),
    lifecycleStatus: RECOMMENDATION_STATUS.GENERATED,
  };

  return Object.freeze(recommendation);
}

// ── Status resolution ────────────────────────────────────────────────────

/**
 * Resolve the effective recommendation status by comparing its geometry
 * fingerprint against the current geometry fingerprint.
 *
 * If the fingerprints differ AND the recommendation is not terminal, the
 * effective status is Stale — geometry changed since the recommendation
 * was generated.
 *
 * Terminal recommendations (Accepted, Superseded) never become effectively
 * Stale — their status is permanent regardless of geometry changes.
 *
 * The stored status is NOT changed by this function. Use
 * transitionRecommendationStatus to change the stored status.
 *
 * @param {object} recommendation - recommendation object
 * @param {string} currentGeometryFingerprint - current geometry fingerprint
 * @returns {{ status: string, isStale: boolean }}
 */
export function resolveRecommendationStatus(recommendation, currentGeometryFingerprint) {
  if (!recommendation || !recommendation.geometryFingerprint) {
    return { status: RECOMMENDATION_STATUS.GENERATED, isStale: false };
  }

  if (!currentGeometryFingerprint) {
    return {
      status: recommendation.lifecycleStatus || RECOMMENDATION_STATUS.GENERATED,
      isStale: false,
    };
  }

  const fingerprintsMatch = recommendation.geometryFingerprint === currentGeometryFingerprint;

  if (fingerprintsMatch) {
    return {
      status: recommendation.lifecycleStatus || RECOMMENDATION_STATUS.GENERATED,
      isStale: false,
    };
  }

  // Fingerprints differ — geometry changed since generation.
  // Terminal recommendations keep their stored status (not effectively stale).
  if (TERMINAL_STATUSES.has(recommendation.lifecycleStatus)) {
    return {
      status: recommendation.lifecycleStatus,
      isStale: false,
    };
  }

  // Non-terminal recommendation with different geometry → effectively Stale
  return {
    status: RECOMMENDATION_STATUS.STALE,
    isStale: true,
  };
}

// ── Status transitions ───────────────────────────────────────────────────

/**
 * Transition a recommendation to a new lifecycle status.
 *
 * Returns a NEW frozen recommendation object with the updated status.
 * recommendationValues are carried over unchanged (immutable).
 *
 * Throws if the transition is invalid (e.g. from a terminal status, or to
 * a status not in the valid transition set).
 *
 * @param {object} recommendation - existing recommendation object
 * @param {string} newStatus - one of RECOMMENDATION_STATUS
 * @returns {object} new frozen recommendation object with updated status
 */
export function transitionRecommendationStatus(recommendation, newStatus) {
  if (!recommendation) {
    throw new Error("Cannot transition status of a null recommendation");
  }

  const currentStatus = recommendation.lifecycleStatus || RECOMMENDATION_STATUS.GENERATED;

  if (currentStatus === newStatus) {
    return recommendation;
  }

  const allowed = VALID_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.has(newStatus)) {
    throw new Error(
      `Invalid recommendation transition: ${currentStatus} → ${newStatus}`
    );
  }

  return Object.freeze({
    ...recommendation,
    lifecycleStatus: newStatus,
  });
}

/**
 * Check whether a recommendation is stale relative to the current geometry.
 *
 * Terminal recommendations (Accepted, Superseded) are never stale.
 *
 * @param {object} recommendation - recommendation object
 * @param {string} currentGeometryFingerprint - current geometry fingerprint
 * @returns {boolean}
 */
export function isRecommendationStale(recommendation, currentGeometryFingerprint) {
  const { isStale } = resolveRecommendationStatus(recommendation, currentGeometryFingerprint);
  return isStale;
}

/**
 * Check whether a recommendation is terminal (no further transitions).
 *
 * Accepted and Superseded are terminal.
 *
 * @param {object} recommendation - recommendation object
 * @returns {boolean}
 */
export function isRecommendationTerminal(recommendation) {
  if (!recommendation) return true;
  return TERMINAL_STATUSES.has(recommendation.lifecycleStatus);
}