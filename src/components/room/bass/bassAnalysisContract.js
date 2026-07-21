// bassAnalysisContract.js — Phase 1A: Shared, versioned, serializable BassAnalysisResult
// contract and current-result adapter.
//
// This module is PURE and SIDE-EFFECT FREE. It does NOT:
//   - Change simulation maths, EQ fitting, candidate generation, or ranking.
//   - Recalculate P14/P18/P19/P20. It maps existing values only.
//   - Start any background work.
//   - Modify the production UI.
//
// It exists alongside the current implementation and has zero visible effect.

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
} = {}) {
  return {
    parameter,
    status,
    level: level == null ? null : Math.max(0, Math.min(4, Math.round(level))),
    value: Number.isFinite(value) ? value : null,
    unit,
    passedL1,
    isStale: !!isStale,
    reason,
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
      status: "uncalculated",
      calculationId: null,
      startedAtMs: null,
      completedAtMs: null,
      elapsedMs: null,
      progress: null, // number 0–1 or null — never an object
      phase: null, // current phase text string
      message: null,
      errorMessage: null,
      isRefreshingPreviousResult: false,
    },

    roomResponse: {
      status: "uncalculated",
      productIndependent: true,
      geometryFingerprint: null,
      rspCurve: [],
      seatCurves: [],
      sourceLayout: null,
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
      realSeatCount: 0,
      assessmentPosition: "rsp",
      createdAtMs: null,
    },
  };
}

// ---------------------------------------------------------------------------
// 4. Current-result adapter
// ---------------------------------------------------------------------------

// Parse a legacy level string ("L2", "FAIL", "L0") into a numeric level.
// Returns null if the input is missing/unparseable.
function parseLegacyLevel(legacy) {
  if (legacy == null) return null;
  if (typeof legacy === "number") return Number.isFinite(legacy) ? Math.max(0, Math.min(4, Math.round(legacy))) : null;
  const s = String(legacy).trim();
  if (s === "" || s === "FAIL" || s === "L0" || s === "0") return 0;
  const m = s.match(/^L?(\d)$/);
  return m ? Math.max(0, Math.min(4, parseInt(m[1], 10))) : null;
}

// Count real seats, excluding RSP and synthetic RSP entries.
function countRealSeats(perSeatRawCurves) {
  if (!Array.isArray(perSeatRawCurves)) return 0;
  return perSeatRawCurves.filter((s) => {
    if (!s || !s.seatId) return false;
    if (s.seatId === "rsp") return false;
    if (s.__isSyntheticRsp) return false;
    return true;
  }).length;
}

// Map the detailed-calculation hook status to contract job status.
function mapJobStatus(detailedStatus, hasResult) {
  switch (detailedStatus) {
    case "CALCULATING":
      return "running";
    case "COMPLETE":
      return "complete";
    case "OUT_OF_DATE":
      return "stale";
    case "CANCELLED":
      return "stale";
    case "ERROR":
      return "error";
    case "IDLE":
    default:
      return hasResult ? "complete" : "uncalculated";
  }
}

// Map the detailed-calculation hook status to productAnalysis section status.
// Uses ONLY valid product statuses — never "calculating".
function mapProductAnalysisStatus(detailedStatus, hasResult) {
  switch (detailedStatus) {
    case "CALCULATING":
      return PRODUCT_STATUS_RUNNING;
    case "COMPLETE":
      return PRODUCT_STATUS_COMPLETE;
    case "OUT_OF_DATE":
      return hasResult ? PRODUCT_STATUS_STALE : PRODUCT_STATUS_UNCALCULATED;
    case "CANCELLED":
      return hasResult ? PRODUCT_STATUS_STALE : PRODUCT_STATUS_UNCALCULATED;
    case "ERROR":
      return PRODUCT_STATUS_ERROR;
    case "IDLE":
    default:
      return hasResult ? PRODUCT_STATUS_COMPLETE : PRODUCT_STATUS_UNCALCULATED;
  }
}

// Convert detailedProgress (object with completed/total) to a 0–1 number.
function progressToNumber(detailedProgress) {
  if (!detailedProgress || typeof detailedProgress !== "object") return null;
  const completed = Number(detailedProgress.completedRequests ?? detailedProgress.completedTasks);
  const total = Number(detailedProgress.totalRequests ?? detailedProgress.totalTasks);
  if (!Number.isFinite(completed) || !Number.isFinite(total) || total <= 0) return null;
  return Math.max(0, Math.min(1, completed / total));
}

// Build a compact candidate reference (no large curve arrays duplicated).
function buildCandidateRef(candidate) {
  if (!candidate) return null;
  return {
    id: null, // Phase 1A: no stable ID yet; signature covers identity
    designEqFitProfile: candidate.designEqFitProfile || "standard",
    requestedP14Level: candidate.requestedP14Level ?? null,
    requestedP18Level: candidate.requestedP18Level ?? null,
    requestedP19Level: candidate.requestedP19Level ?? null,
    achievedP14Level: typeof candidate.achievedP14Level === "number" ? candidate.achievedP14Level : parseLegacyLevel(candidate.achievedP14Level),
    achievedP14Db: Number.isFinite(candidate.achievedP14Db) ? candidate.achievedP14Db : null,
    achievedP18Level: typeof candidate.achievedP18Level === "number" ? candidate.achievedP18Level : parseLegacyLevel(candidate.achievedP18Level),
    achievedP18FrequencyHz: Number.isFinite(candidate.achievedP18FrequencyHz) ? candidate.achievedP18FrequencyHz : null,
    achievedP19Level: typeof candidate.achievedP19Level === "number" ? candidate.achievedP19Level : parseLegacyLevel(candidate.achievedP19Level),
    achievedP19VariationDb: Number.isFinite(candidate.achievedP19VariationDb) ? candidate.achievedP19VariationDb : null,
    achievedP20Level: typeof candidate.achievedP20Level === "number" ? candidate.achievedP20Level : parseLegacyLevel(candidate.achievedP20Level),
    achievedP20VariationDb: Number.isFinite(candidate.achievedP20VariationDb) ? candidate.achievedP20VariationDb : null,
    p20Available: !!candidate.p20Available,
    meetsRequestedEnvelope: candidate.meetsRequestedEnvelope ?? null,
    filterCount: Array.isArray(candidate.generatedFilterBank) ? candidate.generatedFilterBank.filter((f) => f?.enabled).length : 0,
  };
}

// Coerce a possibly-missing/numeric-string value to a finite number for formatting.
function toFiniteOrZero(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

// Build a candidate signature string for provenance (compact, no curves).
// Hardened: never throws on partial/malformed filter data (numeric strings,
// missing fields, nulls). All values are coerced to finite numbers first.
function buildProvenanceSignature(candidate, poolId) {
  if (!candidate) return null;
  const filters = (Array.isArray(candidate.generatedFilterBank) ? candidate.generatedFilterBank : [])
    .filter((f) => f?.enabled)
    .map((f) => {
      const freq = toFiniteOrZero(f?.frequencyHz).toFixed(2);
      const gain = toFiniteOrZero(f?.gainDb).toFixed(2);
      const q = toFiniteOrZero(f?.Q).toFixed(2);
      return `${freq}/${gain}/Q${q}`;
    })
    .join("|");
  return `Pool:${poolId || "—"}|Profile:${candidate.designEqFitProfile || "standard"}|Filters:[${filters || "(none)"}]`;
}

/**
 * Adapt the current live bass optimisation result into the new contract.
 * Pure, defensive, no recalculation. Tolerates missing/partial data.
 */
export function adaptCurrentBassOptimisationResult({
  optimisationResult = null,
  detailedStatus = null,
  detailedProgress = null,
  detailedElapsedMs = null,
  perSeatRawCurves = [],
  canonicalPriorityMode = null,
  fingerprints = null,
} = {}) {
  const contract = createBassAnalysisResult();

  // --- Fingerprints (Phase 1B) ---
  // Copy only valid string fingerprints supplied by the caller. Missing or
  // invalid fingerprints remain null. The adapter never computes fingerprints.
  if (fingerprints && typeof fingerprints === "object") {
    if (isValidFingerprintString(fingerprints.geometry)) {
      contract.fingerprints.geometry = fingerprints.geometry;
    }
    if (isValidFingerprintString(fingerprints.product)) {
      contract.fingerprints.product = fingerprints.product;
    }
    if (isValidFingerprintString(fingerprints.calibration)) {
      contract.fingerprints.calibration = fingerprints.calibration;
    }
  }

  const hasResult = !!optimisationResult && !!optimisationResult.selectedCandidate;
  const realSeatCount = countRealSeats(perSeatRawCurves);
  const selectedCandidate = optimisationResult?.selectedCandidate || null;
  const poolId = optimisationResult?.poolId || null;

  // --- Job status ---
  const jobStatus = mapJobStatus(detailedStatus, hasResult);
  contract.job.status = jobStatus;
  contract.job.elapsedMs = Number.isFinite(detailedElapsedMs) ? detailedElapsedMs : (optimisationResult?.performanceSummary?.totalOptimiserTimeMs ?? null);
  contract.job.progress = progressToNumber(detailedProgress); // number 0–1 or null
  contract.job.phase = (detailedProgress && typeof detailedProgress === "object" && typeof detailedProgress.phase === "string") ? detailedProgress.phase : null;
  contract.job.message = optimisationResult?.warningMessage || null;
  contract.job.errorMessage = null;
  contract.job.isRefreshingPreviousResult = detailedStatus === "CALCULATING" && hasResult;

  // --- Selected mode (normalize both internal and canonical inputs) ---
  const rawMode = canonicalPriorityMode || optimisationResult?.selectedMode || null;
  contract.selectedMode = normalizeMode(rawMode);

  // --- Selected candidate ---
  contract.selectedCandidate = buildCandidateRef(selectedCandidate);
  contract.selectedCandidateId = null;

  // --- Provenance ---
  contract.provenance.poolId = poolId;
  contract.provenance.candidateSignature = buildProvenanceSignature(selectedCandidate, poolId);
  contract.provenance.realSeatCount = realSeatCount;
  contract.provenance.createdAtMs = null;

  // --- Mode candidates (where already available in selectedByMode) ---
  const selectedByMode = optimisationResult?.selectedByMode || {};
  contract.modeCandidates[BASS_MODE_BALANCED] = buildCandidateRef(selectedByMode.balanced || null);
  contract.modeCandidates[BASS_MODE_HOUSE_CURVE_ACCURACY] = buildCandidateRef(selectedByMode.accuracy || null);
  contract.modeCandidates[BASS_MODE_DEPTH] = buildCandidateRef(selectedByMode.extension || null);
  contract.modeCandidates[BASS_MODE_SPL] = buildCandidateRef(selectedByMode.spl || null);

  // --- Product analysis status (valid product statuses only — never "calculating") ---
  contract.productAnalysis.status = mapProductAnalysisStatus(detailedStatus, hasResult);

  // --- Parameters (mapped from existing values, never recalculated) ---
  // isStale: OUT_OF_DATE / CANCELLED with a previous result. NOT updating.
  // isUpdating: CALCULATING with a previous result (refresh in progress).
  const isStale = (detailedStatus === "OUT_OF_DATE" || detailedStatus === "CANCELLED") && hasResult;
  const isUpdating = contract.job.isRefreshingPreviousResult;

  // Helper: choose parameter status from level + stale/updating state.
  // - level present + updating → "updating" (isStale=false)
  // - level present + stale    → "complete" with isStale=true (NOT updating)
  // - level present + normal   → "complete"
  // - level null + CALCULATING → "calculating"
  // - level null otherwise      → "uncalculated"
  function paramStatus(levelPresent) {
    if (levelPresent) {
      if (isUpdating) return PARAM_STATUS_UPDATING;
      return PARAM_STATUS_COMPLETE;
    }
    return detailedStatus === "CALCULATING" ? PARAM_STATUS_CALCULATING : PARAM_STATUS_UNCALCULATED;
  }

  // P14
  const p14Level = selectedCandidate
    ? (typeof selectedCandidate.achievedP14Level === "number" ? selectedCandidate.achievedP14Level : parseLegacyLevel(optimisationResult?.achievedP14Level))
    : parseLegacyLevel(optimisationResult?.achievedP14Level);
  const p14Value = Number.isFinite(selectedCandidate?.achievedP14Db) ? selectedCandidate.achievedP14Db : (Number.isFinite(optimisationResult?.achievedP14Db) ? optimisationResult.achievedP14Db : null);
  contract.productAnalysis.parameters.p14 = createBassParameterResult({
    parameter: PARAM_P14,
    status: paramStatus(p14Level != null),
    level: p14Level,
    value: p14Value,
    unit: "dB",
    passedL1: p14Level != null ? p14Level >= 1 : null,
    isStale,
  });

  // P18
  const p18Level = selectedCandidate
    ? (typeof selectedCandidate.achievedP18Level === "number" ? selectedCandidate.achievedP18Level : parseLegacyLevel(optimisationResult?.achievedP18Level))
    : parseLegacyLevel(optimisationResult?.achievedP18Level);
  const p18Value = Number.isFinite(selectedCandidate?.achievedP18FrequencyHz) ? selectedCandidate.achievedP18FrequencyHz : (Number.isFinite(optimisationResult?.achievedP18FrequencyHz) ? optimisationResult.achievedP18FrequencyHz : null);
  contract.productAnalysis.parameters.p18 = createBassParameterResult({
    parameter: PARAM_P18,
    status: paramStatus(p18Level != null),
    level: p18Level,
    value: p18Value,
    unit: "Hz",
    passedL1: p18Level != null ? p18Level >= 1 : null,
    isStale,
  });

  // P19
  const p19Level = selectedCandidate
    ? (typeof selectedCandidate.achievedP19Level === "number" ? selectedCandidate.achievedP19Level : parseLegacyLevel(optimisationResult?.achievedP19Level))
    : parseLegacyLevel(optimisationResult?.achievedP19Level);
  const p19Value = Number.isFinite(selectedCandidate?.achievedP19VariationDb) ? selectedCandidate.achievedP19VariationDb : (Number.isFinite(optimisationResult?.achievedP19VariationDb) ? optimisationResult.achievedP19VariationDb : null);
  contract.productAnalysis.parameters.p19 = createBassParameterResult({
    parameter: PARAM_P19,
    status: paramStatus(p19Level != null),
    level: p19Level,
    value: p19Value,
    unit: "dB",
    passedL1: p19Level != null ? p19Level >= 1 : null,
    isStale,
  });

  // P20 — not_applicable when fewer than 2 real seats
  if (realSeatCount < 2) {
    contract.productAnalysis.parameters.p20 = createBassParameterResult({
      parameter: PARAM_P20,
      status: PARAM_STATUS_NOT_APPLICABLE,
      level: null,
      value: null,
      unit: "dB",
      passedL1: null,
      isStale: false,
      reason: "Fewer than two real seats",
    });
  } else if (selectedCandidate && selectedCandidate.p20Available) {
    const p20Level = typeof selectedCandidate.achievedP20Level === "number" ? selectedCandidate.achievedP20Level : parseLegacyLevel(selectedCandidate.achievedP20Level);
    const p20Value = Number.isFinite(selectedCandidate.achievedP20VariationDb) ? selectedCandidate.achievedP20VariationDb : null;
    contract.productAnalysis.parameters.p20 = createBassParameterResult({
      parameter: PARAM_P20,
      status: paramStatus(p20Level != null),
      level: p20Level,
      value: p20Value,
      unit: "dB",
      passedL1: p20Level != null ? p20Level >= 1 : null,
      isStale,
    });
  } else {
    contract.productAnalysis.parameters.p20 = createBassParameterResult({
      parameter: PARAM_P20,
      status: detailedStatus === "CALCULATING" ? PARAM_STATUS_CALCULATING : PARAM_STATUS_UNCALCULATED,
      level: null,
      value: null,
      unit: "dB",
      passedL1: null,
      isStale,
    });
  }

  // --- Room response ---
  // Phase 1A does not supply rspRawCurve to the adapter, so rspCurve and
  // seatCurves remain empty. A section cannot be "complete" while its
  // authoritative data is absent — leave status as "uncalculated" until
  // Phase 1C maps real room-response data.
  // (No status override here.)

  return contract;
}

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

// ---------------------------------------------------------------------------
// 6. Fingerprint validation (for adapter copy-in)
// ---------------------------------------------------------------------------

// Returns true if a fingerprint string is well-formed: non-empty string with
// a version prefix and hex hash suffix. Does not decode the hash.
function isValidFingerprintString(fp) {
  if (typeof fp !== "string" || fp.length === 0) return false;
  const parts = fp.split(":");
  if (parts.length < 3) return false;
  if (!["geo", "prod", "cal"].includes(parts[0])) return false;
  if (!parts[1].startsWith("v")) return false;
  if (!/^[0-9a-f]+$/.test(parts[parts.length - 1])) return false;
  return true;
}