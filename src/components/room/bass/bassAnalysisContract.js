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
  const isUpdating = status === PARAM_STATUS_UPDATING || (isStale && status === PARAM_STATUS_CALCULATING);

  if (status === PARAM_STATUS_NOT_APPLICABLE) return { text: `${label} —`, isUpdating: false };
  if (status === PARAM_STATUS_UNCALCULATED) return { text: `${label} —`, isUpdating: false };
  if (status === PARAM_STATUS_ERROR) return { text: `${label} —`, isUpdating: false };
  if (status === PARAM_STATUS_CALCULATING && level == null) return { text: `${label} …`, isUpdating: false };
  if (isUpdating && level != null) {
    return { text: `${label} L${level}`, isUpdating: true };
  }
  if (status === PARAM_STATUS_CALCULATING) return { text: `${label} …`, isUpdating: false };
  if (status === PARAM_STATUS_COMPLETE || (level != null && status !== PARAM_STATUS_UNCALCULATED)) {
    if (level == null) return { text: `${label} —`, isUpdating: false };
    if (level === 0) return { text: `${label} FAIL`, isUpdating: false };
    return { text: `${label} L${level}`, isUpdating: false };
  }
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
      progress: null,
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
      return hasResult ? "running" : "running";
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

// Build a candidate signature string for provenance (compact, no curves).
function buildProvenanceSignature(candidate, poolId) {
  if (!candidate) return null;
  const filters = (Array.isArray(candidate.generatedFilterBank) ? candidate.generatedFilterBank : [])
    .filter((f) => f?.enabled)
    .map((f) => `${(f.frequencyHz ?? 0).toFixed(2)}/${(f.gainDb ?? 0).toFixed(2)}/Q${(f.Q ?? 0).toFixed(2)}`)
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
} = {}) {
  const contract = createBassAnalysisResult();

  const hasResult = !!optimisationResult && !!optimisationResult.selectedCandidate;
  const realSeatCount = countRealSeats(perSeatRawCurves);
  const selectedCandidate = optimisationResult?.selectedCandidate || null;
  const poolId = optimisationResult?.poolId || null;

  // --- Job status ---
  const jobStatus = mapJobStatus(detailedStatus, hasResult);
  contract.job.status = jobStatus;
  contract.job.elapsedMs = Number.isFinite(detailedElapsedMs) ? detailedElapsedMs : (optimisationResult?.performanceSummary?.totalOptimiserTimeMs ?? null);
  contract.job.progress = detailedProgress && typeof detailedProgress === "object"
    ? {
        phase: detailedProgress.phase || null,
        completedRequests: detailedProgress.completedRequests ?? null,
        totalRequests: detailedProgress.totalRequests ?? null,
      }
    : null;
  contract.job.message = optimisationResult?.warningMessage || null;
  contract.job.errorMessage = null;
  contract.job.isRefreshingPreviousResult = detailedStatus === "CALCULATING" && hasResult;

  // --- Selected mode ---
  const internalMode = optimisationResult?.selectedMode || toInternalMode(canonicalPriorityMode);
  contract.selectedMode = canonicalPriorityMode || toCanonicalMode(internalMode);

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

  // --- Product analysis status ---
  if (hasResult) {
    contract.productAnalysis.status = jobStatus === "stale" ? "stale" : "complete";
  } else if (detailedStatus === "CALCULATING") {
    contract.productAnalysis.status = "calculating";
  } else if (detailedStatus === "ERROR") {
    contract.productAnalysis.status = "error";
  }

  // --- Parameters (mapped from existing values, never recalculated) ---
  const isStale = jobStatus === "stale" || contract.job.isRefreshingPreviousResult;

  // P14
  const p14Level = selectedCandidate
    ? (typeof selectedCandidate.achievedP14Level === "number" ? selectedCandidate.achievedP14Level : parseLegacyLevel(optimisationResult?.achievedP14Level))
    : parseLegacyLevel(optimisationResult?.achievedP14Level);
  const p14Value = Number.isFinite(selectedCandidate?.achievedP14Db) ? selectedCandidate.achievedP14Db : (Number.isFinite(optimisationResult?.achievedP14Db) ? optimisationResult.achievedP14Db : null);
  contract.productAnalysis.parameters.p14 = createBassParameterResult({
    parameter: PARAM_P14,
    status: p14Level != null ? (isStale ? PARAM_STATUS_UPDATING : PARAM_STATUS_COMPLETE) : (detailedStatus === "CALCULATING" ? PARAM_STATUS_CALCULATING : PARAM_STATUS_UNCALCULATED),
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
    status: p18Level != null ? (isStale ? PARAM_STATUS_UPDATING : PARAM_STATUS_COMPLETE) : (detailedStatus === "CALCULATING" ? PARAM_STATUS_CALCULATING : PARAM_STATUS_UNCALCULATED),
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
    status: p19Level != null ? (isStale ? PARAM_STATUS_UPDATING : PARAM_STATUS_COMPLETE) : (detailedStatus === "CALCULATING" ? PARAM_STATUS_CALCULATING : PARAM_STATUS_UNCALCULATED),
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
      status: p20Level != null ? (isStale ? PARAM_STATUS_UPDATING : PARAM_STATUS_COMPLETE) : PARAM_STATUS_UNCALCULATED,
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

  // --- Room response (by reference — no duplication) ---
  if (hasResult) {
    contract.roomResponse.status = jobStatus === "stale" ? "stale" : "complete";
  }
  // rspCurve and seatCurves are left empty in Phase 1A — Phase 1B will populate them.

  return contract;
}

// ---------------------------------------------------------------------------
// 5. Structured-clone safety validation
// ---------------------------------------------------------------------------

function findUnsafeValues(obj, path = "$root", seen = new WeakSet()) {
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
  if (seen.has(obj)) {
    issues.push({ path, type: "circular" });
    return issues;
  }
  seen.add(obj);
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      issues.push(...findUnsafeValues(obj[i], `${path}[${i}]`, seen));
    }
  } else {
    for (const key of Object.keys(obj)) {
      issues.push(...findUnsafeValues(obj[key], `${path}.${key}`, seen));
    }
  }
  return issues;
}

export function validateStructuredCloneSafe(obj) {
  const issues = findUnsafeValues(obj);
  return { safe: issues.length === 0, issues };
}

// ---------------------------------------------------------------------------
// 6. Phase 1A fixtures
// ---------------------------------------------------------------------------

export function runContractFixtures() {
  const results = {};

  // 1. Empty contract produces four uncalculated parameters.
  {
    const c = createBassAnalysisResult();
    const params = c.productAnalysis.parameters;
    results.emptyContractUncalculated =
      params.p14.status === PARAM_STATUS_UNCALCULATED &&
      params.p18.status === PARAM_STATUS_UNCALCULATED &&
      params.p19.status === PARAM_STATUS_UNCALCULATED &&
      params.p20.status === PARAM_STATUS_UNCALCULATED &&
      params.p14.level === null && params.p18.level === null &&
      params.p19.level === null && params.p20.level === null;
  }

  // 2. Uncalculated formatter produces "—".
  {
    const f = formatParameterResult(createBassParameterResult({ parameter: PARAM_P14 }));
    results.uncalculatedFormatterDash = f.text === "P14 —" && f.isUpdating === false;
  }

  // 3. Calculating formatter produces "…".
  {
    const f = formatParameterResult(createBassParameterResult({ parameter: PARAM_P14, status: PARAM_STATUS_CALCULATING }));
    results.calculatingFormatterEllipsis = f.text === "P14 …" && f.isUpdating === false;
  }

  // 4. Level zero produces FAIL.
  {
    const f = formatParameterResult(createBassParameterResult({ parameter: PARAM_P14, status: PARAM_STATUS_COMPLETE, level: 0 }));
    results.levelZeroFail = f.text === "P14 FAIL" && f.isUpdating === false;
  }

  // 5. Levels 1–4 format correctly.
  {
    let ok = true;
    for (let lvl = 1; lvl <= 4; lvl++) {
      const f = formatParameterResult(createBassParameterResult({ parameter: PARAM_P14, status: PARAM_STATUS_COMPLETE, level: lvl }));
      if (f.text !== `P14 L${lvl}`) ok = false;
    }
    results.levelsOneToFour = ok;
  }

  // 6. One real seat makes P20 not applicable.
  {
    const adapted = adaptCurrentBassOptimisationResult({
      optimisationResult: { selectedCandidate: { p20Available: true, achievedP20Level: 2, generatedFilterBank: [] }, poolId: "p1" },
      perSeatRawCurves: [{ seatId: "seat-1" }],
    });
    results.oneSeatP20NotApplicable = adapted.productAnalysis.parameters.p20.status === PARAM_STATUS_NOT_APPLICABLE;
  }

  // 7. Two seats with P20 level zero produces FAIL.
  {
    const adapted = adaptCurrentBassOptimisationResult({
      optimisationResult: { selectedCandidate: { p20Available: true, achievedP20Level: 0, achievedP20VariationDb: 9.5, generatedFilterBank: [] }, poolId: "p1" },
      perSeatRawCurves: [{ seatId: "seat-1" }, { seatId: "seat-2" }],
    });
    const p20 = adapted.productAnalysis.parameters.p20;
    results.twoSeatsP20LevelZeroFail = p20.status === PARAM_STATUS_COMPLETE && p20.level === 0 && formatParameterResult(p20).text === "P20 FAIL";
  }

  // 8. Canonical/internal mode mappings round-trip correctly.
  {
    let ok = true;
    for (const canonical of CANONICAL_BASS_MODES) {
      const internal = toInternalMode(canonical);
      const back = toCanonicalMode(internal);
      if (back !== canonical) ok = false;
    }
    // Specific mappings
    if (toCanonicalMode("accuracy") !== BASS_MODE_HOUSE_CURVE_ACCURACY) ok = false;
    if (toCanonicalMode("extension") !== BASS_MODE_DEPTH) ok = false;
    if (toCanonicalMode("balanced") !== BASS_MODE_BALANCED) ok = false;
    if (toCanonicalMode("spl") !== BASS_MODE_SPL) ok = false;
    results.modeRoundTrip = ok;
  }

  // 9. Partial optimiser results do not throw.
  {
    let threw = false;
    try {
      adaptCurrentBassOptimisationResult({});
      adaptCurrentBassOptimisationResult({ optimisationResult: {} });
      adaptCurrentBassOptimisationResult({ optimisationResult: { selectedCandidate: null } });
      adaptCurrentBassOptimisationResult({ perSeatRawCurves: null });
    } catch (e) {
      threw = true;
    }
    results.partialResultsNoThrow = !threw;
  }

  // 10. Adapter output contains no functions or circular references.
  {
    const adapted = adaptCurrentBassOptimisationResult({
      optimisationResult: {
        selectedCandidate: { achievedP14Level: 2, achievedP14Db: 105, achievedP18Level: 2, achievedP18FrequencyHz: 35, achievedP19Level: 1, achievedP19VariationDb: 5.2, p20Available: true, achievedP20Level: 1, achievedP20VariationDb: 4.5, generatedFilterBank: [{ enabled: true, frequencyHz: 40, gainDb: 3, Q: 5 }], designEqFitProfile: "standard" },
        poolId: "test-pool",
        selectedMode: "balanced",
        selectedByMode: { balanced: { achievedP14Level: 2, generatedFilterBank: [] } },
      },
      perSeatRawCurves: [{ seatId: "seat-1" }, { seatId: "seat-2" }],
    });
    const validation = validateStructuredCloneSafe(adapted);
    results.noFunctionsOrCircular = validation.safe;
  }

  // 11. Recursively reject NaN and Infinity.
  {
    const bad = { a: NaN, b: Infinity, c: [1, { d: -Infinity }] };
    const validation = validateStructuredCloneSafe(bad);
    results.rejectsNaNAndInfinity = !validation.safe && validation.issues.length === 3;
  }

  // 12. structuredClone succeeds where supported.
  {
    const adapted = adaptCurrentBassOptimisationResult({
      optimisationResult: {
        selectedCandidate: { achievedP14Level: 3, achievedP14Db: 108, achievedP18Level: 3, achievedP18FrequencyHz: 30, achievedP19Level: 2, achievedP19VariationDb: 4.0, p20Available: false, generatedFilterBank: [], designEqFitProfile: "house_curve" },
        poolId: "clone-pool",
        selectedMode: "accuracy",
      },
      perSeatRawCurves: [{ seatId: "seat-1" }, { seatId: "seat-2" }, { seatId: "seat-3" }],
    });
    let ok = false;
    try {
      if (typeof structuredClone === "function") {
        const cloned = structuredClone(adapted);
        ok = cloned.selectedMode === BASS_MODE_HOUSE_CURVE_ACCURACY && cloned.productAnalysis.parameters.p14.level === 3;
      } else {
        // Fallback: JSON round-trip
        const json = JSON.stringify(adapted);
        ok = json != null && JSON.parse(json).productAnalysis.parameters.p14.level === 3;
      }
    } catch (e) {
      ok = false;
    }
    results.structuredCloneSucceeds = ok;
  }

  // 13. Existing P14/P18/P19/P20 fields map without changing their values or levels.
  {
    const adapted = adaptCurrentBassOptimisationResult({
      optimisationResult: {
        selectedCandidate: {
          achievedP14Level: 3, achievedP14Db: 107.5,
          achievedP18Level: 2, achievedP18FrequencyHz: 32,
          achievedP19Level: 1, achievedP19VariationDb: 5.0,
          p20Available: true, achievedP20Level: 2, achievedP20VariationDb: 3.5,
          generatedFilterBank: [{ enabled: true, frequencyHz: 45, gainDb: -3, Q: 4 }],
          designEqFitProfile: "standard",
        },
        achievedP14Level: "L3", achievedP14Db: 107.5,
        achievedP18Level: "L2", achievedP18FrequencyHz: 32,
        achievedP19Level: "L1", achievedP19VariationDb: 5.0,
        poolId: "parity-pool",
        selectedMode: "balanced",
      },
      perSeatRawCurves: [{ seatId: "seat-1" }, { seatId: "seat-2" }],
    });
    const p = adapted.productAnalysis.parameters;
    results.parityP14 = p.p14.level === 3 && p.p14.value === 107.5;
    results.parityP18 = p.p18.level === 2 && p.p18.value === 32;
    results.parityP19 = p.p19.level === 1 && p.p19.value === 5.0;
    results.parityP20 = p.p20.level === 2 && p.p20.value === 3.5;
    results.parityAll = results.parityP14 && results.parityP18 && results.parityP19 && results.parityP20;
  }

  return results;
}