// acceptanceRecord.js
// ---------------------------------------------------------------------------
// Acceptance Record — an immutable audit record created when a Recommendation
// is accepted into Applied Calibration via the Accept Transition.
//
// This is an AUDIT record. It is created once, never mutated, and never
// deleted (except during transactional rollback, before it was ever visible).
//
// The Acceptance Record is the proof that the Accept Transition occurred:
// it links the Recommendation (what Sound Proof proposed) to the Applied
// Calibration (what the designer chose to build) at a specific point in time.
//
// Fields:
//   acceptanceId              — unique ID for this acceptance event
//   recommendationId          — ID of the accepted recommendation
//   appliedCalibrationId      — ID of the Applied Calibration created
//   geometryFingerprint       — geometry fingerprint at acceptance time
//   recommendationFingerprint — stable hash of the recommendation values
//   acceptedTimestamp         — when the transition occurred
//   acceptedBy                — who accepted (designer identity)
//   recommendationIntent      — Calibration / Design / Specification
//   recommendationSource      — what generated the recommendation
//
// This module is PURE: no React, no side effects, no I/O.
// ---------------------------------------------------------------------------

// ── ID generation ───────────────────────────────────────────────────────

let idCounter = 0;

function generateAcceptanceId() {
  idCounter += 1;
  return `acc-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

// ── Stable serialization (same approach as Applied Calibration Authority) ─

function stableStringify(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[" + value.map(stableStringify).join(",") + "]";
  }
  if (typeof value === "object") {
    const keys = Object.keys(value).sort();
    const parts = keys.map((k) => JSON.stringify(k) + ":" + stableStringify(value[k]));
    return "{" + parts.join(",") + "}";
  }
  return "null";
}

function fnv1a32Seeded(str, offsetBasis) {
  let hash = offsetBasis;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function fingerprint64(canonical) {
  const str = stableStringify(canonical);
  const hashA = fnv1a32Seeded(str, 0x811c9dc5);
  const hashB = fnv1a32Seeded(str, 0x40007a67);
  return hashA + hashB;
}

// ── Recommendation fingerprint ──────────────────────────────────────────

/**
 * Compute a stable fingerprint of a recommendation's calibration values.
 *
 * This hashes the per-subwoofer tuning values (delay, gain, polarity, phase)
 * in a deterministic order, producing a fingerprint that uniquely identifies
 * what was recommended — independent of array order.
 *
 * @param {Array} recommendationValues - [{ id, delayMs, gainDb, polarity, phaseControlDeg }]
 * @returns {string} fingerprint string "recval:<hash>" or "" if no values
 */
export function computeRecommendationFingerprint(recommendationValues) {
  if (!Array.isArray(recommendationValues) || recommendationValues.length === 0) return "";

  const sorted = [...recommendationValues].sort((a, b) => {
    const aId = String(a.id || "");
    const bId = String(b.id || "");
    return aId < bId ? -1 : aId > bId ? 1 : 0;
  });

  const canonical = sorted.map((v) => ({
    id: String(v.id || ""),
    delayMs: Number(v.delayMs) || 0,
    gainDb: Number(v.gainDb) || 0,
    polarity: Number(v.polarity) || 1,
    phaseControlDeg: Number(v.phaseControlDeg) || 0,
  }));

  return `recval:${fingerprint64(canonical)}`;
}

// ── Acceptance Record creation ──────────────────────────────────────────

/**
 * Create a new immutable Acceptance Record.
 *
 * The record is frozen — no field can be reassigned after creation.
 * This is an audit record: it is created once and never mutated.
 *
 * @param {object} params
 * @param {string} [params.acceptanceId] - unique ID (auto-generated if omitted)
 * @param {string} params.recommendationId - ID of the accepted recommendation
 * @param {string} params.appliedCalibrationId - ID of the Applied Calibration created
 * @param {string} params.geometryFingerprint - geometry fingerprint at acceptance time
 * @param {string} params.recommendationFingerprint - stable hash of recommendation values
 * @param {number} [params.acceptedTimestamp] - when the transition occurred
 * @param {string} [params.acceptedBy] - who accepted (designer identity)
 * @param {string} params.recommendationIntent - Calibration / Design / Specification
 * @param {string} [params.recommendationSource] - what generated the recommendation
 * @returns {object} immutable acceptance record (frozen)
 */
export function createAcceptanceRecord(params) {
  const p = params || {};

  const record = {
    acceptanceId: String(p.acceptanceId || generateAcceptanceId()),
    recommendationId: String(p.recommendationId || ""),
    appliedCalibrationId: String(p.appliedCalibrationId || ""),
    geometryFingerprint: String(p.geometryFingerprint || ""),
    recommendationFingerprint: String(p.recommendationFingerprint || ""),
    acceptedTimestamp: p.acceptedTimestamp || Date.now(),
    acceptedBy: String(p.acceptedBy || "Unknown"),
    recommendationIntent: String(p.recommendationIntent || ""),
    recommendationSource: String(p.recommendationSource || ""),
  };

  return Object.freeze(record);
}