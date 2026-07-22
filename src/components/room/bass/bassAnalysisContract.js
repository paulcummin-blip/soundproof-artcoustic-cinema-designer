// bassAnalysisContract.js — Phase 1A/1C: Shared, versioned, serializable
// BassAnalysisResult contract, factory, and validation.
//
// The adapter function lives in bassAnalysisAdapter.js (extracted to keep
// this module under 600 lines). This module re-exports it for backward
// compatibility with existing imports.
//
// This module is PURE and SIDE-EFFECT FREE. It does NOT:
//   - Change simulation maths, EQ fitting, candidate generation, or ranking.
//   - Recalculate P14/P18/P19/P20. It maps existing values only.
//   - Start any background work.
//   - Modify the production UI.
//
// It exists alongside the current implementation and has zero visible effect.

import { isValidFingerprint } from "@/components/room/bass/bassAnalysisFingerprints";
import { levelP20_lfConsistency, numericRp22Level } from "@/components/utils/rp22/levels";

export { isValidFingerprint };

// ---------------------------------------------------------------------------
// 1. Canonical optimisation modes
// ---------------------------------------------------------------------------

export const BASS_MODE_BALANCED = "balanced";
export const BASS_MODE_HOUSE_CURVE_ACCURACY = "house_curve_accuracy";
export const BASS_MODE_DEPTH = "depth";
export const BASS_MODE_SPL = "spl";

export const CANONICAL_BASS_MODES = [
  BASS_MODE_BALANCED,
  BASS_MODE_HOUSE_CURVE_ACCURACY,
  BASS_MODE_DEPTH,
  BASS_MODE_SPL,
];

// Current internal mode names used by selectCandidateFromPool / selectBestCandidate:
//   "balanced", "spl", "extension", "accuracy"
const INTERNAL_TO_CANONICAL = {
  balanced: BASS_MODE_BALANCED,
  spl: BASS_MODE_SPL,
  extension: BASS_MODE_DEPTH,
  accuracy: BASS_MODE_HOUSE_CURVE_ACCURACY,
};

const CANONICAL_TO_INTERNAL = {
  [BASS_MODE_BALANCED]: "balanced",
  [BASS_MODE_SPL]: "spl",
  [BASS_MODE_DEPTH]: "extension",
  [BASS_MODE_HOUSE_CURVE_ACCURACY]: "accuracy",
};

export function toCanonicalMode(internalMode) {
  if (!internalMode) return BASS_MODE_BALANCED;
  return INTERNAL_TO_CANONICAL[internalMode] || BASS_MODE_BALANCED;
}

export function toInternalMode(canonicalMode) {
  if (!canonicalMode) return "balanced";
  return CANONICAL_TO_INTERNAL[canonicalMode] || "balanced";
}

// Unified normalizer: accepts EITHER a current internal mode OR a canonical
// mode and always returns a valid canonical mode. Unknown/missing → balanced.
export function normalizeMode(mode) {
  if (!mode) return BASS_MODE_BALANCED;
  if (CANONICAL_TO_INTERNAL[mode]) return mode; // already canonical
  return INTERNAL_TO_CANONICAL[mode] || BASS_MODE_BALANCED;
}

// ---------------------------------------------------------------------------
// 2. Bass parameter result
// ---------------------------------------------------------------------------

export const PARAM_P14 = "P14";
export const PARAM_P18 = "P18";
export const PARAM_P19 = "P19";
export const PARAM_P20 = "P20";

export const PARAM_STATUS_UNCALCULATED = "uncalculated";
export const PARAM_STATUS_CALCULATING = "calculating";
export const PARAM_STATUS_UPDATING = "updating";
export const PARAM_STATUS_COMPLETE = "complete";
export const PARAM_STATUS_NOT_APPLICABLE = "not_applicable";
export const PARAM_STATUS_ERROR = "error";

// Product-analysis section statuses (distinct from per-parameter statuses).
// productAnalysis.status must use ONLY these values — never "calculating".
export const PRODUCT_STATUS_UNCALCULATED = "uncalculated";
export const PRODUCT_STATUS_QUEUED = "queued";
export const PRODUCT_STATUS_RUNNING = "running";
export const PRODUCT_STATUS_COMPLETE = "complete";
export const PRODUCT_STATUS_ERROR = "error";
export const PRODUCT_STATUS_STALE = "stale";

export const VALID_PRODUCT_STATUSES = [
  PRODUCT_STATUS_UNCALCULATED,
  PRODUCT_STATUS_QUEUED,
  PRODUCT_STATUS_RUNNING,
  PRODUCT_STATUS_COMPLETE,
  PRODUCT_STATUS_ERROR,
  PRODUCT_STATUS_STALE,
];

/**
 * Pure factory for a BassParameterResult.
 * Does not infer levels from raw values — the caller must supply the
 * already-calculated level.
 */
export function createBassParameterResult({
  parameter,
  status = PARAM_STATUS_UNCALCULATED,
  level = null,
  value = null,
  unit = null,
  passedL1 = null,
  isStale = false,
  reason = null,
  recommendedLevel = null,
  recommendedDetail = null,
} = {}) {
  const finiteValue = Number.isFinite(value) ? value : null;
  const authoritativeLevel = parameter === PARAM_P20 && finiteValue != null && [PARAM_STATUS_COMPLETE, PARAM_STATUS_UPDATING].includes(status)
    ? numericRp22Level(levelP20_lfConsistency(finiteValue))
    : level;
  return {
    parameter,
    status,
    level: authoritativeLevel == null ? null : Math.max(0, Math.min(4, Math.round(authoritativeLevel))),
    value: finiteValue,
    unit,
    passedL1,
    isStale: !!isStale,
    reason,
    recommendedLevel: recommendedLevel == null ? null : Math.max(0, Math.min(4, Math.round(recommendedLevel))),
    recommendedDetail,
  };
}

/**
 * Pure presentation formatter.
 * Returns { text, isUpdating } so timers are never baked into the text.
 */
export function formatParameterResult(result) {
  if (!result || typeof result !== "object") return { text: "—", isUpdating: false };
  const { parameter, status, level, isStale } = result;
  const label = parameter || "P";

  // isUpdating is true ONLY when a calculation is actively running over a
  // previous result. A stale result (OUT_OF_DATE / CANCELLED) is NOT updating.
  const isUpdating = status === PARAM_STATUS_UPDATING;

  if (status === PARAM_STATUS_NOT_APPLICABLE) return { text: `${label} —`, isUpdating: false };
  if (status === PARAM_STATUS_UNCALCULATED) return { text: `${label} —`, isUpdating: false };
  if (status === PARAM_STATUS_ERROR) return { text: `${label} —`, isUpdating: false };

  // Calculating with no previous level → ellipsis, not updating.
  if (status === PARAM_STATUS_CALCULATING && level == null) return { text: `${label} …`, isUpdating: false };

  // Updating / stale / complete with a level present — never display "L0".
  if (level != null) {
    const text = level === 0 ? `${label} FAIL` : `${label} L${level}`;
    return { text, isUpdating };
  }

  // Calculating with no level (defensive).
  if (status === PARAM_STATUS_CALCULATING) return { text: `${label} …`, isUpdating: false };
  return { text: `${label} —`, isUpdating: false };
}

// ---------------------------------------------------------------------------
// 3. Versioned contract factory
// ---------------------------------------------------------------------------

export const BASS_ANALYSIS_CONTRACT_VERSION = 1;

export function createBassAnalysisResult() {
  return {
    version: BASS_ANALYSIS_CONTRACT_VERSION,
    analysisId: null,

    fingerprints: {
      geometry: null,
      product: null,
      calibration: null,
    },

    job: {
      status: "idle",
      lifecycleStatus: "idle",
      calculationId: null,
      currentJobFingerprint: null,
      resultFingerprint: null,
      queuedAtMs: null,
      startedAtMs: null,
      completedAtMs: null,
      elapsedMs: null,
      cacheStatus: "none",
      cacheRejectionReason: null,
      engineVersion: null,
      resultSchemaVersion: null,
      progress: null, // number 0–1 or null — never an object
      phase: null, // genuine worker phase text only
      message: null,
      errorMessage: null,
      isRefreshingPreviousResult: false,
      previousResultStale: false,
      lastHeartbeatAtMs: null,
      lastHeartbeatAgeMs: null,
      stalled: false,
      terminalOutcome: null,
    },

    roomResponse: {
      status: "uncalculated",
      responseDomain: "unavailable",
      productIndependent: null,
      geometryFingerprint: null,
      rspCurve: [],
      seatCurves: [],
      sourceLayout: null,
      usableLfHz: null,
    },

    layoutRecommendations: {
      status: "uncalculated",
      geometryFingerprint: null,
      recommendations: [],
    },

    productAnalysis: {
      status: "uncalculated",
      productFingerprint: null,
      selectedProductSummary: null,
      selectedLayoutSummary: null,
      parameters: {
        p14: createBassParameterResult({ parameter: PARAM_P14 }),
        p18: createBassParameterResult({ parameter: PARAM_P18 }),
        p19: createBassParameterResult({ parameter: PARAM_P19 }),
        p20: createBassParameterResult({ parameter: PARAM_P20 }),
      },
    },

    modeCandidates: {
      [BASS_MODE_BALANCED]: null,
      [BASS_MODE_HOUSE_CURVE_ACCURACY]: null,
      [BASS_MODE_DEPTH]: null,
      [BASS_MODE_SPL]: null,
    },

    selectedMode: BASS_MODE_BALANCED,
    selectedCandidateId: null,
    selectedCandidate: null,

    provenance: {
      poolId: null,
      candidateSignature: null,
      filterBankSignature: null,
      postEqCurveSignature: null,
      engineVersion: null,
      realSeatCount: 0,
      assessmentPosition: "rsp",
      createdAtMs: null,
    },
  };
}

// ---------------------------------------------------------------------------
// 4. Current-result adapter (extracted to bassAnalysisAdapter.js)
// ---------------------------------------------------------------------------

// The adapter function and its helpers live in bassAnalysisAdapter.js to keep
// this module under 600 lines. Re-exported here for backward compatibility.
export { adaptCurrentBassOptimisationResult } from "@/components/room/bass/bassAnalysisAdapter";

// ---------------------------------------------------------------------------
// 5. Structured-clone safety validation
// ---------------------------------------------------------------------------

// Detect values that break structured clone. Uses an active recursion stack
// (not a global visited set) so that a shared reference visited from two
// different parents is NOT reported as circular — only a genuine back-edge
// to an ancestor currently on the stack is.
function findUnsafeValues(obj, path = "$root", stack = new WeakSet()) {
  const issues = [];
  if (obj == null) return issues;
  if (typeof obj === "function") {
    issues.push({ path, type: "function" });
    return issues;
  }
  if (typeof obj === "number" && !Number.isFinite(obj)) {
    issues.push({ path, type: Number.isNaN(obj) ? "NaN" : "Infinity" });
    return issues;
  }
  if (typeof obj !== "object") return issues;
  // Genuine circular: this object is an ancestor of itself on the current path.
  if (stack.has(obj)) {
    issues.push({ path, type: "circular" });
    return issues;
  }
  stack.add(obj);
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      issues.push(...findUnsafeValues(obj[i], `${path}[${i}]`, stack));
    }
  } else {
    for (const key of Object.keys(obj)) {
      issues.push(...findUnsafeValues(obj[key], `${path}.${key}`, stack));
    }
  }
  stack.delete(obj);
  return issues;
}

export function validateStructuredCloneSafe(obj) {
  const issues = findUnsafeValues(obj);
  return { safe: issues.length === 0, issues };
}