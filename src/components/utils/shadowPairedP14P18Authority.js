import { getApprovedContinuousSplDb, getSubwooferCurve, normaliseModelKey } from "@/components/models/speakers/registry";
import { p14ThresholdsForBasis, normalizeP14TargetBasis } from "@/components/utils/p14CapabilityAuthority";
import { smoothThirdOctavePowerMean } from "@/components/utils/thirdOctavePowerMean";

export const SHADOW_P18_FREQUENCIES = Object.freeze({ L1: 30, L2: 25, L3: 18, L4: 15 });
export const SHADOW_SEVERE_NULL_DEPTH_DB = 10;
const LEVELS_DESC = ["L4", "L3", "L2", "L1"];
const REFERENCE_SOURCE_DB = 94;
const REFERENCE_SOURCE_AMPLITUDE = Math.pow(10, REFERENCE_SOURCE_DB / 20);
const CONTIGUOUS_GUARD_OCTAVES = 1 / 6;

const finite = (value) => Number.isFinite(Number(value));
const dbToAmplitude = (db) => Math.pow(10, Number(db) / 20);
const amplitudeToDb = (value) => 20 * Math.log10(Math.max(Number(value), 1e-12));

function sortedPoints(points, valueKey) {
  return (points || []).filter((point) => finite(point?.frequency) && finite(point?.[valueKey])).sort((a, b) => a.frequency - b.frequency);
}

function interpolateInRange(points, frequency, valueKey) {
  const sorted = sortedPoints(points, valueKey);
  if (!sorted.length || frequency < sorted[0].frequency || frequency > sorted[sorted.length - 1].frequency) return null;
  if (frequency === sorted[0].frequency) return sorted[0][valueKey];
  if (frequency === sorted[sorted.length - 1].frequency) return sorted[sorted.length - 1][valueKey];
  const upperIndex = sorted.findIndex((point) => point.frequency >= frequency);
  const low = sorted[upperIndex - 1];
  const high = sorted[upperIndex];
  const ratio = (frequency - low.frequency) / (high.frequency - low.frequency);
  return low[valueKey] + (high[valueKey] - low[valueKey]) * ratio;
}

function productCapabilityDefinition(sub) {
  if (Array.isArray(sub?.shadowCapabilityCurve) && sub.shadowCapabilityCurve.length >= 2) {
    const curve = sortedPoints(sub.shadowCapabilityCurve, "spl");
    return curve.length >= 2 ? { curve, amplifierLimitDb: null, modelKey: sub.modelKey || "synthetic" } : null;
  }
  const modelKey = normaliseModelKey(sub?.modelKey ?? sub?.model ?? "");
  const approvedDb = getApprovedContinuousSplDb(modelKey);
  const registryCurve = getSubwooferCurve(modelKey);
  if (!finite(approvedDb) || !Array.isArray(registryCurve) || registryCurve.length < 2) return null;
  const sourceCurve = registryCurve.map((point) => ({ frequency: Number(point.hz), spl: Number(point.db) }));
  const anchorBand = sourceCurve.filter((point) => point.frequency >= 30 && point.frequency <= 120);
  if (!anchorBand.length) return null;
  const shapeAnchorDb = Math.max(...anchorBand.map((point) => point.spl));
  const amplifierLimitDb = [sub?.amplifierLimitDb, sub?.amplifier?.continuousSplLimitDb, sub?.tuning?.amplifierLimitDb].find(finite);
  return {
    modelKey,
    amplifierLimitDb: finite(amplifierLimitDb) ? Number(amplifierLimitDb) : null,
    curve: sourceCurve.map((point) => ({
      frequency: point.frequency,
      spl: Math.min(Number(approvedDb) + point.spl - shapeAnchorDb, finite(amplifierLimitDb) ? Number(amplifierLimitDb) : Infinity),
    })),
  };
}

function validateSourceMapping(activeSubs, transfers) {
  const subIds = activeSubs.map((sub) => typeof sub?.id === "string" ? sub.id.trim() : "");
  const transferIds = transfers.map((transfer) => typeof transfer?.sourceId === "string" ? transfer.sourceId.trim() : "");
  if (subIds.some((id) => !id)) return { valid: false, reason: "Every active subwoofer requires a stable source ID." };
  if (transferIds.some((id) => !id)) return { valid: false, reason: "Every per-source transfer requires a stable source ID." };
  if (new Set(subIds).size !== subIds.length) return { valid: false, reason: "Duplicate active subwoofer source IDs were rejected." };
  if (new Set(transferIds).size !== transferIds.length) return { valid: false, reason: "Duplicate per-source transfer IDs were rejected." };
  const transferMap = new Map(transfers.map((transfer) => [transfer.sourceId.trim(), transfer]));
  const missing = subIds.filter((id) => !transferMap.has(id));
  if (missing.length) return { valid: false, reason: `Missing per-source transfer for ${missing.join(", ")}.` };
  const subSet = new Set(subIds);
  const orphans = transferIds.filter((id) => !subSet.has(id));
  if (orphans.length) return { valid: false, reason: `Orphan per-source transfer for ${orphans.join(", ")}.` };
  return { valid: true, matched: activeSubs.map((sub) => ({ sub, transfer: transferMap.get(sub.id.trim()) })) };
}

function targetAt(frequency, cutoffHz, targetDb) {
  const fullTargetHz = cutoffHz * Math.pow(2, 1 / 3);
  if (frequency <= cutoffHz) return targetDb - 3;
  if (frequency >= fullTargetHz) return targetDb;
  return targetDb - 3 + 3 * (Math.log2(frequency / cutoffHz) / (1 / 3));
}

function underTargetRegions(curve, cutoffHz, targetDb) {
  const misses = curve.filter((point) => point.frequency >= cutoffHz).map((point) => ({
    frequency: point.frequency,
    shortfallDb: targetAt(point.frequency, cutoffHz, targetDb) - point.spl,
  }));
  const regions = [];
  let active = [];
  const close = () => {
    if (!active.length) return;
    const startHz = active[0].frequency;
    const endHz = active[active.length - 1].frequency;
    const bandwidthOctaves = endHz > startHz ? Math.log2(endHz / startHz) : 0;
    const depthDb = Math.max(...active.map((point) => point.shortfallDb));
    const broad = bandwidthOctaves >= CONTIGUOUS_GUARD_OCTAVES;
    const severe = depthDb > SHADOW_SEVERE_NULL_DEPTH_DB;
    regions.push({ startHz, endHz, bandwidthHz: endHz - startHz, bandwidthOctaves, depthDb, broad, severe, classification: broad ? "broad miss" : severe ? "narrow severe miss" : "narrow shallow miss" });
    active = [];
  };
  misses.forEach((point) => point.shortfallDb > 0 ? active.push(point) : close());
  close();
  return regions;
}

function heuristicCauses({ worstFrequency, rawCurve, postEqCurve, sourceDiagnostics }) {
  const causes = [];
  const rawPoint = rawCurve.reduce((nearest, point) => !nearest || Math.abs(point.frequency - worstFrequency) < Math.abs(nearest.frequency - worstFrequency) ? point : nearest, null);
  const post = interpolateInRange(postEqCurve, worstFrequency, "spl");
  if (finite(rawPoint?.spl) && finite(post) && rawPoint.spl - post > 0.25) causes.push("EQ headroom");
  if (finite(rawPoint?.energeticSpl) && rawPoint.energeticSpl - rawPoint.spl > 3) causes.push("acoustic cancellation");
  const rolledOff = sourceDiagnostics.some((source) => {
    const atWorst = interpolateInRange(source.capabilityCurve, worstFrequency, "spl");
    const at80 = interpolateInRange(source.capabilityCurve, 80, "spl");
    return finite(atWorst) && finite(at80) && atWorst < at80 - 3;
  });
  if (rolledOff) causes.push("product roll-off");
  if (sourceDiagnostics.some((source) => !finite(source.amplifierLimitDb))) causes.push("missing amplifier data");
  return causes.length ? causes : ["no single cause identified"];
}

export function assessShadowPairedP14P18({ activeSubs = [], perSourceComplexTransfers = [], combinedEqCurve = [], targetBasis = "minimum", upperFrequencyHz = 120 } = {}) {
  const basis = normalizeP14TargetBasis(targetBasis);
  const transfers = Array.isArray(perSourceComplexTransfers) ? perSourceComplexTransfers : [];
  const mapping = validateSourceMapping(activeSubs, transfers);
  if (!mapping.valid) return { status: "INCOMPLETE DATA", reason: mapping.reason, targetBasis: basis, levelResults: [] };

  const invalidTransfer = mapping.matched.find(({ transfer }) => !Array.isArray(transfer?.points) || transfer.points.length < 2);
  if (invalidTransfer) return { status: "INCOMPLETE DATA", reason: `Missing complex transfer points for ${invalidTransfer.sub.id}.`, targetBasis: basis, levelResults: [] };
  const prepared = mapping.matched.map(({ sub, transfer }) => ({ sub, transfer: { ...transfer, points: sortedPoints(transfer.points, "re") }, capability: productCapabilityDefinition(sub) }));
  const missingCapability = prepared.find((entry) => !entry.capability);
  if (missingCapability) return { status: "INCOMPLETE DATA", reason: `Missing approved product capability data for ${missingCapability.sub.id}.`, targetBasis: basis, levelResults: [] };

  const frequencies = sortedPoints(prepared[0].transfer.points, "re").map((point) => point.frequency).filter((frequency) => frequency <= upperFrequencyHz);
  const sourceDiagnostics = prepared.map(({ sub, transfer, capability }) => ({
    sourceId: sub.id,
    modelKey: capability.modelKey,
    amplifierLimitDb: capability.amplifierLimitDb,
    transferRangeHz: [transfer.points[0].frequency, transfer.points[transfer.points.length - 1].frequency],
    productRangeHz: [capability.curve[0].frequency, capability.curve[capability.curve.length - 1].frequency],
    capabilityCurve: capability.curve,
  }));

  const rawDeliveredCurve = [];
  for (const frequency of frequencies) {
    let re = 0;
    let im = 0;
    let energeticPower = 0;
    let complete = true;
    for (const { transfer, capability } of prepared) {
      const transferRe = interpolateInRange(transfer.points, frequency, "re");
      const transferIm = interpolateInRange(transfer.points, frequency, "im");
      const capabilityDb = interpolateInRange(capability.curve, frequency, "spl");
      if (![transferRe, transferIm, capabilityDb].every(finite)) { complete = false; break; }
      // The engine constructs complexPressure with 10^(curveDb/20), where curveDb
      // is SPL amplitude relative to 20 µPa. The flat source is 94 dB, therefore
      // division by 10^(94/20) produces a dimensionless room transfer.
      const hRe = transferRe / REFERENCE_SOURCE_AMPLITUDE;
      const hIm = transferIm / REFERENCE_SOURCE_AMPLITUDE;
      const sourceAmplitude = dbToAmplitude(capabilityDb);
      const sourceRe = sourceAmplitude * hRe;
      const sourceIm = sourceAmplitude * hIm;
      re += sourceRe;
      im += sourceIm;
      energeticPower += sourceRe * sourceRe + sourceIm * sourceIm;
    }
    if (complete) rawDeliveredCurve.push({ frequency, spl: amplitudeToDb(Math.hypot(re, im)), re, im, energeticSpl: 10 * Math.log10(Math.max(energeticPower, 1e-24)) });
  }
  if (!rawDeliveredCurve.length) return { status: "INCOMPLETE DATA", reason: "No shared product-and-transfer frequency range is available.", targetBasis: basis, levelResults: [] };

  const postEqDeliveredCurve = rawDeliveredCurve.map((point) => {
    const eqValue = interpolateInRange(combinedEqCurve, point.frequency, "spl");
    const positiveEqCostDb = Math.max(0, finite(eqValue) ? Number(eqValue) : 0);
    return { frequency: point.frequency, spl: point.spl - positiveEqCostDb, positiveEqCostDb };
  });
  const smoothedDeliveredCurve = smoothThirdOctavePowerMean(postEqDeliveredCurve);
  const thresholds = p14ThresholdsForBasis(basis);
  const levelResults = LEVELS_DESC.map((level) => {
    const cutoffHz = SHADOW_P18_FREQUENCIES[level];
    const unsupported = sourceDiagnostics.filter((source) => source.transferRangeHz[0] > cutoffHz || source.productRangeHz[0] > cutoffHz || source.transferRangeHz[1] < upperFrequencyHz || source.productRangeHz[1] < upperFrequencyHz);
    if (unsupported.length) return { level, cutoffHz, status: "INCOMPLETE DATA", passes: null, reason: `Required ${cutoffHz}–${upperFrequencyHz} Hz data is unsupported for ${unsupported.map((source) => source.sourceId).join(", ")}.` };
    const assessed = smoothedDeliveredCurve.filter((point) => point.frequency >= cutoffHz && point.frequency <= upperFrequencyHz);
    const targetEnvelope = assessed.map((point) => ({ frequency: point.frequency, spl: targetAt(point.frequency, cutoffHz, thresholds[level]) }));
    const smoothedRegions = underTargetRegions(assessed, cutoffHz, thresholds[level]);
    const unsmoothedRegions = underTargetRegions(postEqDeliveredCurve.filter((point) => point.frequency <= upperFrequencyHz), cutoffHz, thresholds[level]);
    const failsBroad = smoothedRegions.some((region) => region.broad);
    const failsSevere = unsmoothedRegions.some((region) => region.severe);
    const passes = !failsBroad && !failsSevere;
    const worst = assessed.reduce((lowest, point) => !lowest || point.spl < lowest.spl ? point : lowest, null);
    return { level, cutoffHz, targetDb: thresholds[level], status: passes ? "PASS" : "FAIL", passes, targetEnvelope, smoothedUnderTargetRegions: smoothedRegions, unsmoothedUnderTargetRegions: unsmoothedRegions, worstCapabilityDb: worst?.spl ?? null, worstFrequencyHz: worst?.frequency ?? null };
  });

  const winner = levelResults.find((result) => result.status === "PASS") || null;
  const displayLevel = winner || levelResults.find((result) => result.status !== "INCOMPLETE DATA") || levelResults[levelResults.length - 1];
  const band = smoothedDeliveredCurve.filter((point) => point.frequency >= (displayLevel?.cutoffHz ?? 30) && point.frequency <= upperFrequencyHz);
  const worst = band.reduce((lowest, point) => !lowest || point.spl < lowest.spl ? point : lowest, null);
  const allRegions = displayLevel?.unsmoothedUnderTargetRegions || [];
  return {
    status: winner ? "PASS" : levelResults.some((result) => result.status === "FAIL") ? "FAIL" : "INCOMPLETE DATA",
    targetBasis: basis,
    pairedP14Grade: winner?.level ?? "FAIL",
    pairedP18Grade: winner?.level ?? "FAIL",
    rawDeliveredCurve,
    postEqDeliveredCurve,
    smoothedDeliveredCurve,
    selectedTargetEnvelope: displayLevel?.targetEnvelope || [],
    levelResults,
    worstCapabilityDb: worst?.spl ?? null,
    worstFrequencyHz: worst?.frequency ?? null,
    unsmoothedUnderTargetRegions: allRegions,
    longestContiguousUnderTarget: [...allRegions].sort((a, b) => b.bandwidthOctaves - a.bandwidthOctaves || b.depthDb - a.depthDb)[0] || null,
    eqHeadroomCostDb: Math.max(0, ...postEqDeliveredCurve.map((point) => point.positiveEqCostDb)),
    heuristicLimitingCause: heuristicCauses({ worstFrequency: worst?.frequency, rawCurve: rawDeliveredCurve, postEqCurve: postEqDeliveredCurve, sourceDiagnostics }),
    deliveredAtFrequencies: Object.fromEntries([15, 18, 25, 30].map((frequency) => [frequency, interpolateInRange(smoothedDeliveredCurve, frequency, "spl")])),
    sourceDiagnostics,
    method: {
      smoothing: "one-third-octave power mean: mean(10^(dB/10)), then 10log10",
      smoothingBounds: "centre / 2^(1/6) through centre × 2^(1/6)",
      transition: "log-frequency ramp from target −3 dB at cutoff to full target one-third octave above",
      contiguousGuardOctaves: CONTIGUOUS_GUARD_OCTAVES,
      severeNullDepthDb: SHADOW_SEVERE_NULL_DEPTH_DB,
      causeAttribution: "heuristic diagnostic only; multiple overlapping causes may be returned",
      upperFrequencyHz,
      normalization: "engine complex amplitude relative to 20 µPa divided by 10^(94/20), yielding dimensionless transfer",
      referenceSourceDb: REFERENCE_SOURCE_DB,
      referenceSourceAmplitude: REFERENCE_SOURCE_AMPLITUDE,
    },
  };
}