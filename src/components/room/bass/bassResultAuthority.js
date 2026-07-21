export const HOUSE_CURVE_ENGINE_VERSION = "house-curve-rsp-v2-minus15-plus6";
export const BASS_RESULT_SCHEMA_VERSION = 2;
export const HOUSE_CURVE_LIMITS = Object.freeze({ maximumCutDb: 15, maximumAggregateBoostDb: 6 });

function hashText(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

const fixed = (value) => Number.isFinite(Number(value)) ? Number(value).toFixed(4) : "null";

export function buildFilterBankSignature(candidate) {
  return (Array.isArray(candidate?.generatedFilterBank) ? candidate.generatedFilterBank : [])
    .filter((filter) => filter?.enabled)
    .map((filter) => `${fixed(filter.frequencyHz)}/${fixed(filter.gainDb)}/Q${fixed(filter.Q)}`)
    .join("|") || "(none)";
}

export function buildCurveSignature(curve) {
  const points = Array.isArray(curve) ? curve : [];
  if (!points.length) return "curve:empty";
  const indexes = [...new Set([0, Math.floor(points.length / 4), Math.floor(points.length / 2), Math.floor(points.length * 3 / 4), points.length - 1])];
  return `curve:${points.length}:${hashText(indexes.map((index) => `${fixed(points[index]?.frequency)}/${fixed(points[index]?.spl)}`).join("|"))}`;
}

export function candidateStartStrategy(candidate) {
  return candidate?.startStrategy || (candidate?.designEqFitProfile === "house_curve" ? "multi-start" : "single");
}

export function buildCandidateId(candidate) {
  if (!candidate) return null;
  const identity = [
    candidate.designEqFitProfile || "standard",
    candidateStartStrategy(candidate),
    candidate.requestedP14Level, candidate.requestedP18Level, candidate.requestedP19Level,
    fixed(candidate.assessmentStartHz), fixed(candidate.assessmentEndHz),
    buildFilterBankSignature(candidate), buildCurveSignature(candidate.finalPostEqCurve),
  ].join("|");
  return `bass-candidate:${hashText(identity)}`;
}

export function buildBassResultCacheKey(calibrationFingerprint) {
  return [
    calibrationFingerprint || "cal:none",
    "mode:all-canonical-priorities",
    `engine:${HOUSE_CURVE_ENGINE_VERSION}`,
    `result-schema:${BASS_RESULT_SCHEMA_VERSION}`,
  ].join("|");
}

export function stampCandidateAuthority(candidate) {
  if (!candidate) return candidate;
  const filterBankSignature = buildFilterBankSignature(candidate);
  const postEqCurveSignature = buildCurveSignature(candidate.finalPostEqCurve);
  return {
    ...candidate,
    candidateId: buildCandidateId(candidate),
    filterBankSignature,
    postEqCurveSignature,
    startStrategy: candidateStartStrategy(candidate),
  };
}

export function stampPoolAuthority(pool) {
  if (!pool) return pool;
  const candidates = (Array.isArray(pool.candidates) ? pool.candidates : []).map(stampCandidateAuthority);
  const byId = new Map(candidates.map((candidate) => [candidate.candidateId, candidate]));
  const selectablePool = (Array.isArray(pool.selectablePool) ? pool.selectablePool : [])
    .map((candidate) => byId.get(buildCandidateId(candidate)) || stampCandidateAuthority(candidate));
  return {
    ...pool,
    candidates,
    selectablePool,
    engineVersion: HOUSE_CURVE_ENGINE_VERSION,
    resultSchemaVersion: BASS_RESULT_SCHEMA_VERSION,
  };
}

export function validateCachedBassResult(result) {
  if (!result) return { valid: false, reason: "missing-result" };
  if (result.engineVersion !== HOUSE_CURVE_ENGINE_VERSION) return { valid: false, reason: "engine-version-mismatch" };
  if (result.resultSchemaVersion !== BASS_RESULT_SCHEMA_VERSION) return { valid: false, reason: "result-schema-version-mismatch" };
  const pool = result.pool;
  if (!pool || pool.engineVersion !== HOUSE_CURVE_ENGINE_VERSION || pool.resultSchemaVersion !== BASS_RESULT_SCHEMA_VERSION) {
    return { valid: false, reason: "pool-version-mismatch" };
  }
  const candidates = Array.isArray(pool.candidates) ? pool.candidates : [];
  if (candidates.some((candidate) => candidate.filterBankSignature !== buildFilterBankSignature(candidate))) {
    return { valid: false, reason: "candidate-filter-signature-mismatch" };
  }
  const houseCandidates = candidates.filter((candidate) => candidate.designEqFitProfile === "house_curve");
  if (!houseCandidates.length) return { valid: false, reason: "house-curve-candidate-missing" };
  const incompatibleHouseCandidate = houseCandidates.find((candidate) => (
    candidateStartStrategy(candidate) !== "multi-start"
    || candidate.designEqFitProfileConfig?.maximumCutDb !== HOUSE_CURVE_LIMITS.maximumCutDb
    || candidate.designEqFitProfileConfig?.maximumAggregateBoostDb !== HOUSE_CURVE_LIMITS.maximumAggregateBoostDb
  ));
  if (incompatibleHouseCandidate) return { valid: false, reason: "house-curve-candidate-incompatible" };
  if (result.contractCandidateId && result.productionCandidateId && result.contractCandidateId !== result.productionCandidateId) {
    return { valid: false, reason: "contract-production-candidate-mismatch" };
  }
  if (result.graphFilterBankSignature && result.filterBankSignature && result.graphFilterBankSignature !== result.filterBankSignature) {
    return { valid: false, reason: "graph-filter-signature-mismatch" };
  }
  return { valid: true, reason: null };
}

export function completedStatusesEquivalent(left, right) {
  const normalize = (status) => ["ready", "complete"].includes(status) ? "complete" : status;
  return normalize(left) === normalize(right);
}