// calibrationAuthority.js
// ---------------------------------------------------------------------------
// Calibration Authority — the lifecycle layer that makes calibration
// (delay, gain, polarity, phase) a first-class, explainable engineering state
// with the same lifecycle discipline as every other authority in Sound Proof.
//
// DESIGN PRINCIPLE:
//   "Calibration is part of the design, not a hidden optimiser setting."
//
// Three separate authorities:
//   1. Geometry — physical room/listener/source geometry
//   2. Calibration — delay, gain, polarity, phase per active subwoofer
//   3. Engineering — P14/P18/P19/P20 results
//
// Engineering results are only valid when both Geometry AND Calibration are
// current. When Geometry changes, Calibration becomes Stale, and Engineering
// becomes Stale. The user is informed and can Recalculate or Reset.
//
// This module is PURE: no React, no side effects, no I/O.
// It produces authority objects and resolves their status from fingerprints.
// ---------------------------------------------------------------------------

import { normaliseModelKey } from "@/components/utils/modelKeyNormaliser";

// ── Status enum ──────────────────────────────────────────────────────────

export const CALIBRATION_STATUS = {
  CURRENT: "Current",
  STALE: "Stale",
  USER_MODIFIED: "User Modified",
  MANUAL: "Manual",
  OPTIMISER_GENERATED: "Optimiser Generated",
  IMPORTED: "Imported",
  UNKNOWN: "Unknown",
};

// ── Source enum ──────────────────────────────────────────────────────────

export const CALIBRATION_SOURCE = {
  OPTIMISER: "Bass Optimiser",
  MANUAL: "Manual Entry",
  IMPORTED: "Imported",
  UNKNOWN: "Unknown",
};

// ── Fingerprint version ──────────────────────────────────────────────────
//
// Bumped independently of bassAnalysisFingerprints.FINGERPRINT_VERSION.
// This fingerprint covers ONLY the engineering inputs that determine whether
// calibration is still valid — it does NOT include the calibration values
// themselves (delay, gain, polarity, phase). Changing calibration values
// must NOT change this fingerprint; changing geometry MUST.
const CALIBRATION_BASIS_VERSION = 1;

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

// ── Calibration basis fingerprint ─────────────────────────────────────────
//
// Hashes the engineering inputs that determine whether calibration is still
// valid. Deliberately EXCLUDES: delayMs, gainDb, polarity, phaseControlDeg.
// Includes: room dims, sub positions (x,y,z), sub count, sub model, sub
// rotation, sub enabled state, seating positions, RSP, P14/P18 targets.

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
 * Compute the calibration basis fingerprint — a deterministic hash of the
 * engineering inputs that determine whether calibration is still valid.
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
 *   - P14/P18 target changes
 *
 * This fingerprint does NOT change when:
 *   - Delay, gain, polarity, or phase values change (that IS the calibration)
 *   - UI state, overlay visibility, or graph settings change
 *
 * @param {object} inputs - { subwooferInstances, roomDims, seatingPositions, rspPosition, selectedSubModel, p14TargetBasis, p14TargetLevel, p14TargetDb, p18TargetBasis }
 * @returns {string} deterministic fingerprint string "calbasis:v1:<hash>"
 */
export function computeCalibrationBasisFingerprint(inputs) {
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
    p14Target: {
      basis: i.p14TargetBasis || null,
      level: i.p14TargetLevel ?? null,
      db: num(i.p14TargetDb),
    },
    p18Target: {
      basis: i.p18TargetBasis || null,
    },
  };

  return `calbasis:v${CALIBRATION_BASIS_VERSION}:${fingerprint64(canonical)}`;
}

// ── Authority creation ───────────────────────────────────────────────────

/**
 * Create a new Calibration Authority object.
 *
 * @param {object} params
 * @param {string} params.basisFingerprint - calibration basis fingerprint at creation time
 * @param {string} params.source - one of CALIBRATION_SOURCE
 * @param {string} [params.candidateId] - originating optimiser candidate ID
 * @param {string} [params.recommendationId] - originating recommendation ID
 * @param {Array} [params.values] - per-sub calibration values [{ id, delayMs, gainDb, polarity, phaseControlDeg }]
 * @param {string} [params.stageKey] - which stage produced this calibration
 * @returns {object} calibration authority object
 */
export function createCalibrationAuthority(params) {
  const p = params || {};
  return {
    basisFingerprint: String(p.basisFingerprint || ""),
    status: p.status || CALIBRATION_STATUS.UNKNOWN,
    source: p.source || CALIBRATION_SOURCE.UNKNOWN,
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
 * Extract per-subwoofer calibration values from subwooferInstances.
 *
 * @param {Array} subwooferInstances - current subwoofer instances (ALL)
 * @returns {Array} [{ id, delayMs, gainDb, polarity, phaseControlDeg }] for active subs
 */
export function extractCalibrationValues(subwooferInstances) {
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
 * Resolve the effective calibration status by comparing the authority's
 * stored basis fingerprint against the current basis fingerprint.
 *
 * If the fingerprints differ, the calibration is Stale regardless of its
 * stored status — geometry changed since the calibration was generated.
 *
 * User Modified and Manual statuses are preserved even when stale — the
 * user's manual edits are not lost, but they are flagged as needing
 * recalculation.
 *
 * @param {object} authority - calibration authority object
 * @param {string} currentBasisFingerprint - current calibration basis fingerprint
 * @returns {{ status: string, isStale: boolean, staleReason: string|null }}
 */
export function resolveCalibrationStatus(authority, currentBasisFingerprint) {
  if (!authority || !authority.basisFingerprint) {
    return { status: CALIBRATION_STATUS.UNKNOWN, isStale: false, staleReason: null };
  }

  if (!currentBasisFingerprint) {
    return { status: authority.status || CALIBRATION_STATUS.UNKNOWN, isStale: false, staleReason: null };
  }

  const fingerprintsMatch = authority.basisFingerprint === currentBasisFingerprint;

  if (!fingerprintsMatch) {
    // Geometry changed since calibration was generated → Stale
    // Preserve the original source info but flag as stale
    return {
      status: authority.status,
      isStale: true,
      staleReason: "Current calibration belongs to an earlier version of this design and is no longer authoritative.",
    };
  }

  return {
    status: authority.status || CALIBRATION_STATUS.UNKNOWN,
    isStale: false,
    staleReason: null,
  };
}

/**
 * Check whether the calibration authority is current (not stale) and can
 * be safely consumed by engineering calculations.
 *
 * @param {object} authority - calibration authority object
 * @param {string} currentBasisFingerprint - current calibration basis fingerprint
 * @returns {boolean}
 */
export function isCalibrationConsumable(authority, currentBasisFingerprint) {
  if (!authority || !authority.basisFingerprint || !currentBasisFingerprint) return false;
  const { isStale } = resolveCalibrationStatus(authority, currentBasisFingerprint);
  return !isStale;
}