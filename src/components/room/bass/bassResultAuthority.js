import {
  BASS_OPTIMISER_POOL_VERSION,
  BASS_OPTIMISER_PROTOCOL_VERSION,
  BASS_OPTIMISER_VERSIONS,
  BASS_RESULT_SCHEMA_VERSION,
  HOUSE_CURVE_ENGINE_VERSION,
  describeOptimiserCompatibility,
  validateOptimiserVersions,
} from "./bassOptimiserWorkerProtocol";

export {
  BASS_OPTIMISER_POOL_VERSION,
  BASS_OPTIMISER_PROTOCOL_VERSION,
  BASS_RESULT_SCHEMA_VERSION,
  HOUSE_CURVE_ENGINE_VERSION,
};
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
    `protocol:${BASS_OPTIMISER_PROTOCOL_VERSION}`,
    `pool:${BASS_OPTIMISER_POOL_VERSION}`,
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
    ...BASS_OPTIMISER_VERSIONS,
  };
}

export function validateCachedBassResult(result, expectedIdentity = {}) {
  const expected = { ...BASS_OPTIMISER_VERSIONS, fingerprint: expectedIdentity?.fingerprint ?? null };
  const actual = {
    protocolVersion: result?.protocolVersion,
    poolVersion: result?.poolVersion,
    engineVersion: result?.engineVersion,
    resultSchemaVersion: result?.resultSchemaVersion,
    fingerprint: result?.fingerprint ?? result?.identity?.fingerprint ?? null,
  };
  if (!result) return { valid: false, reason: "missing-result", message: describeOptimiserCompatibility(expected, actual, "missing-result") };
  const resultVersions = validateOptimiserVersions(actual, expected);
  if (!resultVersions.valid) {
    const reason = resultVersions.field === "engineVersion" ? "engine-version-mismatch"
      : resultVersions.field === "resultSchemaVersion" ? "result-schema-version-mismatch"
      : resultVersions.field === "poolVersion" ? "pool-version-mismatch"
      : "protocol-version-mismatch";
    return { valid: false, reason, message: describeOptimiserCompatibility(expected, actual, reason), expected, actual };
  }
  if (expected.fingerprint && actual.fingerprint !== expected.fingerprint) {
    return { valid: false, reason: "fingerprint-mismatch", message: describeOptimiserCompatibility(expected, actual, "fingerprint-mismatch"), expected, actual };
  }
  const pool = result.pool;
  const poolActual = {
    protocolVersion: pool?.protocolVersion,
    poolVersion: pool?.poolVersion,
    engineVersion: pool?.engineVersion,
    resultSchemaVersion: pool?.resultSchemaVersion,
    fingerprint: actual.fingerprint,
  };
  const poolVersions = validateOptimiserVersions(poolActual, expected);
  if (!pool || !poolVersions.valid) {
    return { valid: false, reason: "pool-version-mismatch", message: describeOptimiserCompatibility(expected, poolActual, "pool-version-mismatch"), expected, actual: poolActual };
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