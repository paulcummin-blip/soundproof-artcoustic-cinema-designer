import { normalizeP14TargetBasis } from "@/components/utils/p14CapabilityAuthority";
import {
  assessShadowPairedP14P18,
  SHADOW_P18_FREQUENCIES,
  SHADOW_SEVERE_NULL_DEPTH_DB,
} from "@/components/utils/shadowPairedP14P18Authority";

export const PAIRED_P14_P18_AUTHORITY_METHOD = "position-aware-paired-p14-p18";
export const PAIRED_P14_P18_AUTHORITY_VERSION = "1.0.0";
export const PAIRED_P14_P18_CONTRACT_SCHEMA_VERSION = "paired-p14-p18-production-contract:v1";
export const PAIRED_ASSESSMENT_STATUSES = Object.freeze(["PASS", "FAIL", "INCOMPLETE DATA"]);

const STATUS_VOCABULARY_VERSION = "paired-compliance-status:v1";
const LEVELS = Object.freeze(["L1", "L2", "L3", "L4"]);
const LEVELS_DESC = Object.freeze([...LEVELS].reverse());
const finite = (value) => Number.isFinite(Number(value));
const numberOrNull = (value) => finite(value) ? Number(value) : null;

function interpolate(points, frequency, valueKey = "spl") {
  const sorted = (points || []).filter((point) => finite(point?.frequency) && finite(point?.[valueKey])).sort((a, b) => a.frequency - b.frequency);
  if (!sorted.length || frequency < sorted[0].frequency || frequency > sorted[sorted.length - 1].frequency) return null;
  const upperIndex = sorted.findIndex((point) => point.frequency >= frequency);
  if (upperIndex <= 0) return Number(sorted[0][valueKey]);
  const low = sorted[upperIndex - 1];
  const high = sorted[upperIndex];
  const ratio = (frequency - low.frequency) / (high.frequency - low.frequency);
  return Number(low[valueKey]) + (Number(high[valueKey]) - Number(low[valueKey])) * ratio;
}

function cleanCurve(curve, keys = []) {
  return (curve || []).map((point) => {
    const cleaned = { frequency: numberOrNull(point?.frequency), spl: numberOrNull(point?.spl) };
    keys.forEach((key) => { cleaned[key] = numberOrNull(point?.[key]); });
    return cleaned;
  }).filter((point) => point.frequency != null && point.spl != null);
}

function incompleteLevel(level, shadowLevel = null) {
  return {
    level,
    levelNumber: Number(level.slice(1)),
    cutoffHz: numberOrNull(shadowLevel?.cutoffHz ?? SHADOW_P18_FREQUENCIES[level]),
    targetDb: numberOrNull(shadowLevel?.targetDb),
    status: "INCOMPLETE DATA",
    passes: null,
    targetEnvelope: [],
    worstCapabilityDb: null,
    limitingFrequencyHz: null,
    marginDb: null,
    shortfallDb: null,
    broadMiss: null,
    severeNull: null,
    smoothedUnderTargetRegions: [],
    unsmoothedUnderTargetRegions: [],
    missingDataReason: shadowLevel?.reason || "Required paired capability data is unavailable.",
  };
}

function enrichLevel(level, shadowLevel, smoothedCurve) {
  if (!shadowLevel || shadowLevel.status === "INCOMPLETE DATA") return incompleteLevel(level, shadowLevel);
  const targetEnvelope = cleanCurve(shadowLevel.targetEnvelope);
  const margins = targetEnvelope.map((target) => {
    const deliveredDb = interpolate(smoothedCurve, target.frequency);
    return deliveredDb == null ? null : { frequency: target.frequency, deliveredDb, targetDb: target.spl, marginDb: deliveredDb - target.spl };
  }).filter(Boolean);
  if (!margins.length) return incompleteLevel(level, { ...shadowLevel, reason: "No complete target-envelope margin could be calculated." });
  const limiting = margins.reduce((worst, point) => !worst || point.marginDb < worst.marginDb ? point : worst, null);
  const marginDb = numberOrNull(limiting.marginDb);
  return {
    level,
    levelNumber: Number(level.slice(1)),
    cutoffHz: numberOrNull(shadowLevel.cutoffHz),
    targetDb: numberOrNull(shadowLevel.targetDb),
    status: shadowLevel.status,
    passes: shadowLevel.status === "PASS",
    targetEnvelope,
    worstCapabilityDb: numberOrNull(limiting.deliveredDb),
    limitingFrequencyHz: numberOrNull(limiting.frequency),
    marginDb,
    shortfallDb: marginDb == null ? null : Math.max(0, -marginDb),
    broadMiss: (shadowLevel.smoothedUnderTargetRegions || []).some((region) => region.broad === true),
    severeNull: (shadowLevel.unsmoothedUnderTargetRegions || []).some((region) => region.severe === true),
    smoothedUnderTargetRegions: shadowLevel.smoothedUnderTargetRegions || [],
    unsmoothedUnderTargetRegions: shadowLevel.unsmoothedUnderTargetRegions || [],
    missingDataReason: null,
  };
}

function buildAssessment(shadow) {
  const shadowByLevel = Object.fromEntries((shadow.levelResults || []).map((result) => [result.level, result]));
  const levels = Object.fromEntries(LEVELS.map((level) => [level, enrichLevel(level, shadowByLevel[level], shadow.smoothedDeliveredCurve || [])]));
  const winner = LEVELS_DESC.map((level) => levels[level]).find((result) => result.status === "PASS") || null;
  const fallback = LEVELS_DESC.map((level) => levels[level]).find((result) => result.status === "FAIL") || null;
  const limitingLevel = winner || fallback;
  return {
    status: winner ? "PASS" : fallback ? "FAIL" : "INCOMPLETE DATA",
    winningLevel: winner?.level ?? null,
    winningLevelNumber: winner?.levelNumber ?? null,
    p14: {
      worstCapabilityDb: limitingLevel?.worstCapabilityDb ?? null,
      limitingFrequencyHz: limitingLevel?.limitingFrequencyHz ?? null,
    },
    p18: {
      extensionHz: winner?.cutoffHz ?? null,
      level: winner?.level ?? null,
    },
    levels,
  };
}

function rangesFromSources(sourceDiagnostics, key) {
  return (sourceDiagnostics || []).map((source) => ({ sourceId: source.sourceId, rangeHz: source[key] || [null, null] }));
}

function buildCoverage({ minimumShadow, recommendedShadow, activeSubs, transfers, upperFrequencyHz }) {
  const sourceDiagnostics = minimumShadow.sourceDiagnostics || recommendedShadow.sourceDiagnostics || [];
  const productDataRangeBySource = rangesFromSources(sourceDiagnostics, "productRangeHz");
  const transferDataRangeBySource = sourceDiagnostics.length
    ? rangesFromSources(sourceDiagnostics, "transferRangeHz")
    : (transfers || []).map((transfer) => {
      const frequencies = (transfer?.points || []).map((point) => Number(point?.frequency)).filter(Number.isFinite);
      return { sourceId: transfer?.sourceId || null, rangeHz: frequencies.length ? [Math.min(...frequencies), Math.max(...frequencies)] : [null, null] };
    });
  const allRanges = [...productDataRangeBySource, ...transferDataRangeBySource].map((entry) => entry.rangeHz).filter((range) => finite(range?.[0]) && finite(range?.[1]));
  const sharedFrequencyRangeHz = allRanges.length
    ? [Math.max(...allRanges.map((range) => Number(range[0]))), Math.min(upperFrequencyHz, ...allRanges.map((range) => Number(range[1])))]
    : [null, null];
  const missingRequiredFrequencies = LEVELS.filter((level) => {
    const cutoff = SHADOW_P18_FREQUENCIES[level];
    return [minimumShadow, recommendedShadow].some((shadow) => shadow.levelResults?.find((item) => item.level === level)?.status === "INCOMPLETE DATA")
      || !finite(sharedFrequencyRangeHz[0]) || sharedFrequencyRangeHz[0] > cutoff || sharedFrequencyRangeHz[1] < upperFrequencyHz;
  }).map((level) => ({ level, cutoffHz: SHADOW_P18_FREQUENCIES[level] }));
  const reason = minimumShadow.reason || recommendedShadow.reason || (missingRequiredFrequencies.length ? "One or more target levels lack required product or transfer coverage." : null);
  return { upperFrequencyHz, sharedFrequencyRangeHz, productDataRangeBySource, transferDataRangeBySource, missingRequiredFrequencies, missingDataReason: reason, activeSourceCount: activeSubs.length };
}

function selectedLevelResult(assessment) {
  if (assessment.winningLevel) return assessment.levels[assessment.winningLevel];
  return LEVELS_DESC.map((level) => assessment.levels[level]).find((result) => result.status === "FAIL") || null;
}

function buildLimitingResult(assessment, shadow) {
  const selected = selectedLevelResult(assessment);
  if (!selected) return { level: null, cutoffHz: null, targetDb: null, worstCapabilityDb: null, limitingFrequencyHz: null, marginDb: null, shortfallDb: null, broadMiss: null, severeNull: null, longestContiguousUnderTarget: null, smoothedUnderTargetRegions: [], unsmoothedUnderTargetRegions: [], heuristicCauses: [] };
  const longest = [...selected.unsmoothedUnderTargetRegions].sort((a, b) => Number(b.bandwidthOctaves) - Number(a.bandwidthOctaves) || Number(b.depthDb) - Number(a.depthDb))[0] || null;
  return {
    level: selected.level,
    cutoffHz: selected.cutoffHz,
    targetDb: selected.targetDb,
    worstCapabilityDb: selected.worstCapabilityDb,
    limitingFrequencyHz: selected.limitingFrequencyHz,
    marginDb: selected.marginDb,
    shortfallDb: selected.shortfallDb,
    broadMiss: selected.broadMiss,
    severeNull: selected.severeNull,
    longestContiguousUnderTarget: longest,
    smoothedUnderTargetRegions: selected.smoothedUnderTargetRegions,
    unsmoothedUnderTargetRegions: selected.unsmoothedUnderTargetRegions,
    heuristicCauses: shadow.heuristicLimitingCause || [],
  };
}

function buildEqHeadroom(shadow, upperFrequencyHz, selectedEqBankIdentity) {
  const points = (shadow.postEqDeliveredCurve || []).filter((point) => point.frequency >= 20 && point.frequency <= Math.min(120, upperFrequencyHz));
  const maximum = points.reduce((best, point) => Number(point.positiveEqCostDb) > best.costDb ? { costDb: Number(point.positiveEqCostDb), frequencyHz: Number(point.frequency) } : best, { costDb: 0, frequencyHz: null });
  return { assessmentRangeHz: [20, Math.min(120, upperFrequencyHz)], maximumPositiveEqCostDb: maximum.costDb, maximumPositiveEqCostFrequencyHz: maximum.frequencyHz, selectedEqBankIdentity: selectedEqBankIdentity ?? null };
}

function buildSourceResult(activeSubs, transfers, sourceDiagnostics) {
  const activeSourceIds = (activeSubs || []).map((sub) => typeof sub?.id === "string" ? sub.id.trim() : "");
  const transferIds = (transfers || []).map((transfer) => typeof transfer?.sourceId === "string" ? transfer.sourceId.trim() : "");
  const activeSet = new Set(activeSourceIds);
  return {
    activeSourceIds,
    matchedSourceIds: transferIds.filter((id) => id && activeSet.has(id)),
    sourceDiagnostics: (sourceDiagnostics || []).map((source) => ({
      sourceId: source.sourceId,
      modelKey: source.modelKey,
      amplifierLimitDb: numberOrNull(source.amplifierLimitDb),
      transferRangeHz: source.transferRangeHz,
      productRangeHz: source.productRangeHz,
      capabilityCurve: cleanCurve(source.capabilityCurve),
    })),
  };
}

export function calculatePairedP14P18ProductionAuthority(inputs = {}) {
  const activeSubs = Array.isArray(inputs.activeSubs) ? inputs.activeSubs : [];
  const perSourceComplexTransfers = Array.isArray(inputs.perSourceComplexTransfers) ? inputs.perSourceComplexTransfers : [];
  const combinedEqCurve = Array.isArray(inputs.combinedEqCurve) ? inputs.combinedEqCurve : [];
  const selectedTargetBasis = normalizeP14TargetBasis(inputs.targetBasis ?? "minimum");
  const upperFrequencyHz = finite(inputs.upperFrequencyHz) ? Number(inputs.upperFrequencyHz) : 120;
  const common = { activeSubs, perSourceComplexTransfers, combinedEqCurve, upperFrequencyHz };
  const minimumShadow = assessShadowPairedP14P18({ ...common, targetBasis: "minimum" });
  const recommendedShadow = assessShadowPairedP14P18({ ...common, targetBasis: "recommended" });
  const minimum = buildAssessment(minimumShadow);
  const recommended = buildAssessment(recommendedShadow);
  const selectedAssessment = selectedTargetBasis === "recommended" ? recommended : minimum;
  const selectedShadow = selectedTargetBasis === "recommended" ? recommendedShadow : minimumShadow;
  const sourceDiagnostics = minimumShadow.sourceDiagnostics || recommendedShadow.sourceDiagnostics || [];
  const coverage = buildCoverage({ minimumShadow, recommendedShadow, activeSubs, transfers: perSourceComplexTransfers, upperFrequencyHz });
  const reason = selectedShadow.reason || coverage.missingDataReason || null;
  return {
    schemaVersion: PAIRED_P14_P18_CONTRACT_SCHEMA_VERSION,
    authority: { method: PAIRED_P14_P18_AUTHORITY_METHOD, version: PAIRED_P14_P18_AUTHORITY_VERSION, statusVocabularyVersion: STATUS_VOCABULARY_VERSION },
    status: selectedAssessment.status,
    reason,
    selectedTargetBasis,
    assessments: { minimum, recommended },
    curves: {
      rawDeliveredCurve: cleanCurve(selectedShadow.rawDeliveredCurve, ["re", "im", "energeticSpl"]),
      postEqDeliveredCurve: cleanCurve(selectedShadow.postEqDeliveredCurve, ["positiveEqCostDb"]),
      smoothedDeliveredCurve: cleanCurve(selectedShadow.smoothedDeliveredCurve, ["sampleCount", "lowerHz", "upperHz"]),
      selectedTargetEnvelope: selectedLevelResult(selectedAssessment)?.targetEnvelope || [],
    },
    coverage,
    limitingResult: buildLimitingResult(selectedAssessment, selectedShadow),
    eqHeadroom: buildEqHeadroom(selectedShadow, upperFrequencyHz, inputs.selectedEqBankIdentity),
    sources: buildSourceResult(activeSubs, perSourceComplexTransfers, sourceDiagnostics),
    methodDiagnostics: {
      smoothing: selectedShadow.method?.smoothing || "one-third-octave power mean: mean(10^(dB/10)), then 10log10",
      smoothingBounds: selectedShadow.method?.smoothingBounds || "centre / 2^(1/6) through centre × 2^(1/6)",
      transition: selectedShadow.method?.transition || "log-frequency ramp from target −3 dB at cutoff to full target one-third octave above",
      contiguousGuardOctaves: selectedShadow.method?.contiguousGuardOctaves ?? 1 / 6,
      severeNullDepthDb: selectedShadow.method?.severeNullDepthDb ?? SHADOW_SEVERE_NULL_DEPTH_DB,
      normalization: selectedShadow.method?.normalization || "engine complex amplitude relative to 20 µPa divided by 10^(94/20), yielding dimensionless transfer",
      referenceSourceDb: selectedShadow.method?.referenceSourceDb ?? 94,
      referenceSourceAmplitude: selectedShadow.method?.referenceSourceAmplitude ?? Math.pow(10, 94 / 20),
    },
    fingerprints: { normalizedTransferFingerprint: inputs.normalizedTransferFingerprint ?? null, calibrationFingerprint: inputs.calibrationFingerprint ?? null },
    legacyScalarDiagnostic: { authoritative: false, value: inputs.legacyScalarDiagnostic ?? null },
  };
}

function validateLevel(level, expectedLevel, errors, coverage) {
  if (!level || level.level !== expectedLevel) { errors.push(`Missing or mismatched ${expectedLevel} assessment.`); return; }
  if (!PAIRED_ASSESSMENT_STATUSES.includes(level.status)) errors.push(`Unknown ${expectedLevel} status.`);
  if (level.status === "PASS" && level.passes !== true) errors.push(`${expectedLevel} PASS must set passes=true.`);
  if (level.status === "INCOMPLETE DATA" && level.passes !== null) errors.push(`${expectedLevel} incomplete data must set passes=null.`);
  if (finite(level.marginDb) && (!finite(level.shortfallDb) || Math.abs(Number(level.shortfallDb) - Math.max(0, -Number(level.marginDb))) > 1e-9)) errors.push(`${expectedLevel} shortfall is inconsistent with margin.`);
  const lower = Number(coverage?.sharedFrequencyRangeHz?.[0]);
  if (level.status === "PASS" && finite(lower) && lower > Number(level.cutoffHz)) errors.push(`${expectedLevel} is unsupported but marked PASS.`);
}

export function validatePairedP14P18ProductionAuthorityResult(result) {
  const errors = [];
  if (!result || typeof result !== "object") return { valid: false, reason: "Result must be an object.", errors: ["Result must be an object."] };
  if (result.schemaVersion !== PAIRED_P14_P18_CONTRACT_SCHEMA_VERSION) errors.push("Unknown schema version.");
  if (!result.authority) errors.push("Missing authority metadata.");
  if (result.authority?.method !== PAIRED_P14_P18_AUTHORITY_METHOD) errors.push("Unknown authority method.");
  if (result.authority?.version !== PAIRED_P14_P18_AUTHORITY_VERSION) errors.push("Unknown authority version.");
  if (result.authority?.statusVocabularyVersion !== STATUS_VOCABULARY_VERSION) errors.push("Unknown status vocabulary version.");
  if (!PAIRED_ASSESSMENT_STATUSES.includes(result.status)) errors.push("Unknown result status.");
  ["minimum", "recommended"].forEach((basis) => {
    const assessment = result.assessments?.[basis];
    if (!assessment || !PAIRED_ASSESSMENT_STATUSES.includes(assessment.status)) errors.push(`Unknown or missing ${basis} assessment status.`);
    if (assessment?.status === "INCOMPLETE DATA" && (assessment.winningLevel != null || assessment.winningLevelNumber != null)) errors.push(`${basis} incomplete assessment has a winning grade.`);
    if (assessment?.status === "PASS" && (!LEVELS.includes(assessment.winningLevel) || !finite(assessment.winningLevelNumber))) errors.push(`${basis} PASS has no winning level.`);
    LEVELS.forEach((level) => validateLevel(assessment?.levels?.[level], level, errors, result.coverage));
  });
  Object.entries(result.curves || {}).forEach(([name, curve]) => {
    if (!Array.isArray(curve)) { errors.push(`${name} is not a curve array.`); return; }
    if (curve.some((point) => !finite(point?.frequency) || !finite(point?.spl))) errors.push(`${name} contains a non-finite point.`);
  });
  const activeIds = result.sources?.activeSourceIds;
  const matchedIds = result.sources?.matchedSourceIds;
  if (!Array.isArray(activeIds) || !Array.isArray(matchedIds)) errors.push("Missing source ID arrays.");
  if (Array.isArray(activeIds) && new Set(activeIds).size !== activeIds.length) errors.push("Duplicate active source IDs.");
  if (Array.isArray(matchedIds) && new Set(matchedIds).size !== matchedIds.length) errors.push("Duplicate matched source IDs.");
  const limiting = result.limitingResult;
  if (finite(limiting?.marginDb) && (!finite(limiting?.shortfallDb) || Math.abs(Number(limiting.shortfallDb) - Math.max(0, -Number(limiting.marginDb))) > 1e-9)) errors.push("Limiting shortfall is inconsistent with margin.");
  const valid = errors.length === 0;
  return { valid, reason: valid ? null : errors[0], errors };
}