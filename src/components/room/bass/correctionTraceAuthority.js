// correctionTraceAuthority.js
//
// Persisted correction trace for the current/winning bass calculation.
//
// PURPOSE
//   Explains, per frequency, why the EQ correction stopped short of the target
//   at whatever point the designer hovers. Every trace value is READ from, or
//   SUBTRACTED between, curves the calculation has ALREADY produced. Nothing is
//   recomputed, re-smoothed, re-limited, re-graded or re-targeted here.
//
// WHERE IT IS BUILT (one build site)
//   finalOptimisedBassResponse.applyAuthorityToCanonicalResult — on the FINAL
//   post-alignment response. The same object is persisted into the completed
//   graph payload and rehydrated by finishedGraphAdapter, so the live tooltip
//   and the cached tooltip read one identical trace.
//
// VALUE SOURCES (no value is invented; unavailable values stay null)
//   rawRspDb                    rspBeforePeqAtOperatingLevel, else physicalRawResponseCurve
//   targetDb                    canonicalTargetCurve (the plotted house-curve target)
//   requestedCorrectionDb       target - rawRsp — the deficit the EQ was asked to close
//   correctionAfterSmoothingDb  correctionCurve — the applied EQ bank
//   appliedCorrectionDb         finalPostEq - rawRsp — what the response actually moved by
//   finalPostEqDb               postEqRspCurve (post-alignment)
//   residualDb                  finalPostEq - target
//   capabilityLimited           frequency falls inside a capabilityLimitedRegions span
//   protectedNull               isProtectedFrequency — the SAME authority the fitter uses
//   boostLimitDb / cutLimitDb   the correction-envelope limits exported by the
//                               correction model itself (never re-declared here)
//
// correctionSmoothingApplied is a PIPELINE fact, not a measurement: the applied
// envelope (correctionCurve) is produced by the correction model's smoothing
// stage (realisticPostCalibrationPrediction Stage 4), which always runs on this
// path. The requested-vs-applied difference is carried per frequency so the
// engineer can see the actual effect rather than trusting the flag.
//
// The three global adjustment scalars are system-wide by nature — one trim for
// every seat and every frequency — so they are carried in the header, never
// duplicated per frequency.

import { isProtectedFrequency } from "@/components/utils/houseCurveFitProtection";
import { MAX_BOOST_DB, MAX_CUT_DB } from "@/components/utils/realisticPostCalibrationPrediction";

export const CORRECTION_TRACE_SCHEMA_VERSION = 1;

// Shown when the loaded result predates the trace.
export const CORRECTION_TRACE_UNAVAILABLE_COPY =
  "Detailed correction trace is available after recalculation.";

// The RP22 P19 assessment basis (1/3-octave), carried so the tooltip can label
// the official basis alongside the display smoothing.
export const OFFICIAL_P19_SMOOTHING_BASIS = "third";

const MAX_RECORDS = 120;

const round2 = (value) => (Number.isFinite(value) ? Math.round(value * 100) / 100 : null);

// A missing adjustment must stay missing. Number(null) is 0, so a bare
// finite-check would publish "0.0 dB" where the value was never provided.
const toScalarOrNull = (value) => {
  if (value === null || value === undefined || value === "") return null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
};

/**
 * Log-frequency linear sampler over an already-computed curve. Returns null
 * outside the curve's own domain — it never extrapolates.
 */
function prepareSampler(curve) {
  const points = (Array.isArray(curve) ? curve : [])
    .map((point) => ({ frequency: Number(point?.frequency), spl: Number(point?.spl) }))
    .filter((point) => Number.isFinite(point.frequency) && Number.isFinite(point.spl) && point.frequency > 0)
    .sort((left, right) => left.frequency - right.frequency);
  if (!points.length) return null;

  return (frequency) => {
    if (!Number.isFinite(frequency) || frequency <= 0) return null;
    if (frequency < points[0].frequency || frequency > points[points.length - 1].frequency) return null;
    let low = 0;
    let high = points.length - 1;
    while (high - low > 1) {
      const mid = (low + high) >> 1;
      if (points[mid].frequency <= frequency) low = mid;
      else high = mid;
    }
    const a = points[low];
    const b = points[high];
    if (a.frequency === b.frequency) return a.spl;
    const ratio = Math.log(frequency / a.frequency) / Math.log(b.frequency / a.frequency);
    return a.spl + (b.spl - a.spl) * ratio;
  };
}

function regionCovers(regions, frequency) {
  return (Array.isArray(regions) ? regions : []).some((region) => {
    const start = Number(region?.startHz);
    const end = Number(region?.endHz);
    return Number.isFinite(start) && Number.isFinite(end)
      && frequency >= start && frequency <= end;
  });
}

/**
 * Build the persisted correction trace from the final response.
 *
 * @param {object} params
 * @param {Array}  params.postEqRspCurve            final (post-alignment) post-EQ RSP curve
 * @param {Array}  params.rawRspCurve               pre-EQ RSP response at the operating level
 * @param {Array}  params.targetCurve               the house-curve target
 * @param {Array}  params.correctionCurve           applied EQ correction envelope
 * @param {Array}  [params.capabilityLimitedRegions]
 * @param {Array}  [params.protectedNullRegions]
 * @param {number} [params.initialOperatingAdjustmentDb]
 * @param {number} [params.finalGlobalAlignmentTrimDb]
 * @returns {object|null} trace, or null when the final curve is unavailable
 */
export function buildCorrectionTrace({
  postEqRspCurve,
  rawRspCurve,
  targetCurve,
  correctionCurve,
  capabilityLimitedRegions = [],
  protectedNullRegions = [],
  initialOperatingAdjustmentDb = null,
  finalGlobalAlignmentTrimDb = null,
} = {}) {
  const finalSampler = prepareSampler(postEqRspCurve);
  if (!finalSampler) return null;

  const rawSampler = prepareSampler(rawRspCurve);
  const targetSampler = prepareSampler(targetCurve);
  const correctionSampler = prepareSampler(correctionCurve);

  const grid = (Array.isArray(postEqRspCurve) ? postEqRspCurve : [])
    .map((point) => Number(point?.frequency))
    .filter((frequency) => Number.isFinite(frequency) && frequency > 0)
    .sort((left, right) => left - right);
  if (!grid.length) return null;

  const stride = Math.max(1, Math.ceil(grid.length / MAX_RECORDS));
  const records = [];
  for (let index = 0; index < grid.length; index += stride) {
    const frequency = grid[index];
    const finalPostEqDb = finalSampler(frequency);
    if (!Number.isFinite(finalPostEqDb)) continue;

    const rawRspDb = rawSampler ? rawSampler(frequency) : null;
    const targetDb = targetSampler ? targetSampler(frequency) : null;
    const correctionDb = correctionSampler ? correctionSampler(frequency) : null;
    const hasRaw = Number.isFinite(rawRspDb);
    const hasTarget = Number.isFinite(targetDb);

    records.push({
      frequency: round2(frequency),
      rawRspDb: hasRaw ? round2(rawRspDb) : null,
      targetDb: hasTarget ? round2(targetDb) : null,
      requestedCorrectionDb: hasRaw && hasTarget ? round2(targetDb - rawRspDb) : null,
      correctionAfterSmoothingDb: Number.isFinite(correctionDb) ? round2(correctionDb) : null,
      appliedCorrectionDb: hasRaw ? round2(finalPostEqDb - rawRspDb) : null,
      finalPostEqDb: round2(finalPostEqDb),
      residualDb: hasTarget ? round2(finalPostEqDb - targetDb) : null,
      capabilityLimited: regionCovers(capabilityLimitedRegions, frequency),
      protectedNull: isProtectedFrequency(frequency, protectedNullRegions),
    });
  }
  if (!records.length) return null;

  const initial = toScalarOrNull(initialOperatingAdjustmentDb);
  const trim = toScalarOrNull(finalGlobalAlignmentTrimDb);

  return {
    schemaVersion: CORRECTION_TRACE_SCHEMA_VERSION,
    officialP19SmoothingBasis: OFFICIAL_P19_SMOOTHING_BASIS,
    correctionSmoothingApplied: true,
    boostLimitDb: MAX_BOOST_DB,
    cutLimitDb: -Math.abs(MAX_CUT_DB),
    initialOperatingAdjustmentDb: round2(initial),
    finalGlobalAlignmentTrimDb: round2(trim),
    finalEffectiveAdjustmentDb: initial !== null && trim !== null ? round2(initial + trim) : null,
    bandStartHz: records[0].frequency,
    bandEndHz: records[records.length - 1].frequency,
    records,
  };
}

/**
 * Read the trace record nearest a cursor frequency. Returns null when the trace
 * has no record within tolerance — callers then report the value as unavailable
 * rather than interpolating a claim.
 */
export function readCorrectionTraceAtFrequency(trace, frequency) {
  const records = trace?.records;
  if (!Array.isArray(records) || !records.length || !Number.isFinite(Number(frequency))) return null;
  const target = Number(frequency);
  let nearest = null;
  let nearestDistance = Infinity;
  for (const record of records) {
    const distance = Math.abs(Number(record?.frequency) - target);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = record;
    }
  }
  if (!nearest) return null;
  const tolerance = Math.max(1, Number(nearest.frequency) * 0.05);
  return nearestDistance <= tolerance ? nearest : null;
}

/** Deep clone for persistence — keeps the payload independent of live state. */
export function cloneCorrectionTrace(trace) {
  if (!trace?.records?.length) return null;
  return { ...trace, records: trace.records.map((record) => ({ ...record })) };
}

/** True when a stored result predates the trace. */
export function isCorrectionTraceUnavailable(trace) {
  return !trace?.records?.length;
}