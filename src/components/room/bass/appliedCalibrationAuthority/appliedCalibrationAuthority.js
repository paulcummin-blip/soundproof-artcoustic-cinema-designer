// appliedCalibrationAuthority.js
// ---------------------------------------------------------------------------
// Applied Calibration Authority — the lifecycle layer that makes applied
// calibration (delay, gain, polarity, phase) a first-class, explainable
// engineering state with the same lifecycle discipline as every other
// authority in Sound Proof.
//
// DESIGN PRINCIPLE:
//   "Sound Proof owns recommendations. The designer owns the design.
//    Engineering predictions are always made from the designer's chosen
//    design, never directly from the optimiser's recommendations."
//
// Four authorities (frozen architecture):
//   1. Geometry              (Designer)            — physical room/listener/source geometry
//   2. Recommendation        (Sound Proof)         — optimiser recommendations (NOT the design)
//   3. Applied Calibration   (Designer/Installer)  — calibration accepted into the design
//   4. Engineering Prediction (Sound Proof)       — P14/P18/P19/P20 from Geometry + Applied Calibration
//
// Applied Calibration represents the calibration currently assumed by the
// engineering prediction. It is NOT the optimiser recommendation.
// Recommendations become Applied Calibration only through an explicit,
// designer-gated Accept transition (implemented in a later stage).
//
// Engineering results are only valid when both Geometry AND Applied
// Calibration are current. When Geometry changes, Applied Calibration
// becomes Stale, and Engineering becomes Stale. The user is informed and
// can Recalculate, Keep (User Accepted), or Reset.
//
// This module is PURE: no React, no side effects, no I/O.
// It produces authority objects and resolves their status from fingerprints.
// ---------------------------------------------------------------------------

import { normaliseModelKey } from "@/components/utils/modelKeyNormaliser";

// ── Status enum ──────────────────────────────────────────────────────────

export const APPLIED_CALIBRATION_STATUS = {
  CURRENT: "Current",
  STALE: "Stale",
  USER_ACCEPTED: "User Accepted",
  USER_MODIFIED: "User Modified",
  MANUAL: "Manual",
  OPTIMISER_GENERATED: "Optimiser Generated",
  IMPORTED: "Imported",
  UNKNOWN: "Unknown",
};

// ── Source enum ──────────────────────────────────────────────────────────

export const APPLIED_CALIBRATION_SOURCE = {
  OPTIMISER: "Bass Optimiser",
  MANUAL: "Manual Entry",
  IMPORTED: "Imported",
  UNKNOWN: "Unknown",
};

// ── Fingerprint version ──────────────────────────────────────────────────
//
// Bumped independently of bassAnalysisFingerprints.FINGERPRINT_VERSION.
// This fingerprint covers ONLY the engineering inputs that determine whether
// applied calibration is still valid — it does NOT include the calibration
// values themselves (delay, gain, polarity, phase). Changing calibration
// values must NOT change this fingerprint; changing geometry MUST.
//
// NOTE: The fingerprint string prefix "calbasis:v1:" is a persisted cache key
// and is deliberately NOT renamed. Changing it would invalidate existing
// caches — a behavioural change. The prefix is retained for compatibility.
const APPLIED_CALIBRATION_BASIS_VERSION = 1;

// ── Stable serialization (same approach as bassAnalysisFingerprints) ────

function num(v, decimals = 6) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const factor = Math.pow(10, decimals);
  return Math.round(n * factor) / factor;
}

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

// ── Applied Calibration basis fingerprint ─────────────────────────────────
//
// Hashes the GEOMETRY inputs that determine whether applied calibration
// is still valid. Deliberately EXCLUDES: delayMs, gainDb, polarity,
// phaseControlDeg (that IS the calibration). Includes: room dims, sub
// positions (x,y,z), sub count, sub model, sub rotation, sub enabled
// state, seating positions, RSP.
//
// P14/P18 targets are NOT included — they are Engineering Prediction
// inputs, not Geometry. The frozen authority model is:
//   Geometry → Applied Calibration → Engineering Prediction
// Applied Calibration depends only on Geometry. Changing P14/P18 targets
// does not invalidate the physical calibration; it only changes what the
// optimiser might recommend.

function sortById(arr) {
  return arr.slice().sort((a, b) => {
    const aId = a.id || "";
    const bId = b.id || "";
    if (aId < bId) return -1;
    if (aId > bId) return 1;
    return 0;
  });
}

/**
 * Compute the applied calibration basis fingerprint — a deterministic hash of
 * the engineering inputs that determine whether applied calibration is still
 * valid.
 *
 * This fingerprint changes when:
 *   - Room dimensions change
 *   - Active subwoofer count changes
 *   - Subwoofer positions change (x, y, bottomHeightM)
 *   - Subwoofer rotation changes
 *   - Subwoofer enabled/disabled state changes
 *   - Subwoofer model changes
 *   - Seating positions change
 *   - RSP position changes
 *
 * This fingerprint does NOT change when:
 *   - Delay, gain, polarity, or phase values change (that IS the calibration)
 *   - P14 or P18 targets change (Engineering Prediction, not Geometry)
 *   - UI state, overlay visibility, or graph settings change
 *
 * @param {object} inputs - { subwooferInstances, roomDims, seatingPositions, rspPosition, selectedSubModel }
 * @returns {string} deterministic fingerprint string "calbasis:v1:<hash>"
 */
export function computeAppliedCalibrationBasisFingerprint(inputs) {
  const i = inputs || {};

  const instances = Array.isArray(i.subwooferInstances)
    ? i.subwooferInstances.filter((s) => s.enabled !== false)
    : [];

  // Source geometry WITHOUT tuning — this is the key distinction
  const sources = sortById(instances.map((inst) => ({
    id: String(inst.id || ""),
    x: num(inst.position?.x),
    y: num(inst.position?.y),
    z: num(inst.bottomHeightM),
    rotationDeg: num(inst.rotationDeg, 3),
    modelKey: normaliseModelKey(inst.model || i.selectedSubModel),
  })));

  const seats = sortById(
    (Array.isArray(i.seatingPositions) ? i.seatingPositions : []).map((s) => ({
      id: String(s.id || ""),
      x: num(s.x),
      y: num(s.y),
      z: num(s.z),
    }))
  );

  const canonical = {
    room: {
      w: num(i.roomDims?.widthM),
      l: num(i.roomDims?.lengthM),
      h: num(i.roomDims?.heightM),
    },
    rsp: i.rspPosition
      ? {
          x: num(i.rspPosition.x),
          y: num(i.rspPosition.y),
          z: num(i.rspPosition.z),
          designatedRspSeatId: i.rspPosition.designatedRspSeatId ?? null,
        }
      : null,
    sources,
    sourceCount: sources.length,
    seats,
  };

  return `calbasis:v${APPLIED_CALIBRATION_BASIS_VERSION}:${fingerprint64(canonical)}`;
}

// ── Authority creation ───────────────────────────────────────────────────

/**
 * Create a new Applied Calibration Authority object.
 *
 * @param {object} params
 * @param {string} params.basisFingerprint - applied calibration basis fingerprint at creation time
 * @param {string} params.source - one of APPLIED_CALIBRATION_SOURCE
 * @param {string} [params.candidateId] - originating optimiser candidate ID
 * @param {string} [params.recommendationId] - originating recommendation ID
 * @param {Array} [params.values] - per-sub calibration values [{ id, delayMs, gainDb, polarity, phaseControlDeg }]
 * @param {string} [params.stageKey] - which stage produced this calibration
 * @returns {object} applied calibration authority object
 */
export function createAppliedCalibrationAuthority(params) {
  const p = params || {};
  return {
    basisFingerprint: String(p.basisFingerprint || ""),
    status: p.status || APPLIED_CALIBRATION_STATUS.UNKNOWN,
    source: p.source || APPLIED_CALIBRATION_SOURCE.UNKNOWN,
    candidateId: String(p.candidateId || ""),
    recommendationId: String(p.recommendationId || ""),
    stageKey: String(p.stageKey || ""),
    values: Array.isArray(p.values) ? p.values : [],
    timestamp: p.timestamp || Date.now(),
    version: 1,
    staleReason: null,
  };
}

/**
 * Extract per-subwoofer applied calibration values from subwooferInstances.
 *
 * @param {Array} subwooferInstances - current subwoofer instances (ALL)
 * @returns {Array} [{ id, delayMs, gainDb, polarity, phaseControlDeg }] for active subs
 */
export function extractAppliedCalibrationValues(subwooferInstances) {
  if (!Array.isArray(subwooferInstances)) return [];
  return subwooferInstances
    .filter((s) => s.enabled !== false)
    .map((s) => ({
      id: String(s.id || ""),
      delayMs: Number(s.delayMs) || 0,
      gainDb: Number(s.gainDb) || 0,
      polarity: Number(s.polarity) || 1,
      phaseControlDeg: Number(s.phaseControlDeg ?? s.phaseAdjust) || 0,
    }));
}

/**
 * Resolve the effective applied calibration status by comparing the
 * authority's stored basis fingerprint against the current basis fingerprint.
 *
 * If the fingerprints differ, the applied calibration is Stale regardless of
 * its stored status — geometry changed since the calibration was applied.
 *
 * User Modified, User Accepted, and Manual statuses are preserved even when
 * stale — the user's deliberate choices are not lost, but they are flagged as
 * needing recalculation.
 *
 * @param {object} authority - applied calibration authority object
 * @param {string} currentBasisFingerprint - current applied calibration basis fingerprint
 * @returns {{ status: string, isStale: boolean, staleReason: string|null }}
 */
export function resolveAppliedCalibrationStatus(authority, currentBasisFingerprint) {
  if (!authority || !authority.basisFingerprint) {
    return { status: APPLIED_CALIBRATION_STATUS.UNKNOWN, isStale: false, staleReason: null };
  }

  if (!currentBasisFingerprint) {
    return { status: authority.status || APPLIED_CALIBRATION_STATUS.UNKNOWN, isStale: false, staleReason: null };
  }

  const fingerprintsMatch = authority.basisFingerprint === currentBasisFingerprint;

  if (!fingerprintsMatch) {
    // User Accepted is a deliberate designer override — it persists
    // even when geometry has changed. The designer chose to keep this
    // calibration despite the geometry change, so it is not stale.
    if (authority.status === APPLIED_CALIBRATION_STATUS.USER_ACCEPTED) {
      return {
        status: APPLIED_CALIBRATION_STATUS.USER_ACCEPTED,
        isStale: false,
        staleReason: null,
      };
    }
    // Current calibration with different geometry → Stale
    return {
      status: APPLIED_CALIBRATION_STATUS.STALE,
      isStale: true,
      staleReason: "Current calibration belongs to an earlier version of this design and is no longer authoritative.",
    };
  }

  return {
    status: authority.status || APPLIED_CALIBRATION_STATUS.UNKNOWN,
    isStale: false,
    staleReason: null,
  };
}

/**
 * Check whether the applied calibration authority is current (not stale) and
 * can be safely consumed by engineering calculations.
 *
 * @param {object} authority - applied calibration authority object
 * @param {string} currentBasisFingerprint - current applied calibration basis fingerprint
 * @returns {boolean}
 */
export function isAppliedCalibrationConsumable(authority, currentBasisFingerprint) {
  if (!authority || !authority.basisFingerprint || !currentBasisFingerprint) return false;
  const { isStale } = resolveAppliedCalibrationStatus(authority, currentBasisFingerprint);
  return !isStale;
}

/**
 * Mark an Applied Calibration Authority as User Accepted — the designer's
 * explicit Keep decision after the calibration became Stale due to a
 * geometry change.
 *
 * This is the ONLY way Applied Calibration enters the User Accepted state.
 * It is never created directly by Accept Recommendation.
 *
 * @param {object} authority - existing applied calibration authority object
 * @returns {object} new authority object with status USER_ACCEPTED
 */
export function markAsUserAccepted(authority) {
  if (!authority) return authority;
  return { ...authority, status: APPLIED_CALIBRATION_STATUS.USER_ACCEPTED };
}