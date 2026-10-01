// correctionTraceAuthority.js
//
// Persisted correction trace for the current/winning bass calculation.
//
// PURPOSE
//   Explains, per frequency, why the EQ correction stopped short of the target
//   at whatever point the designer hovers — and, for every recorded frequency,
//   which single mechanism actually limited the correction.
//
//   Every trace value is READ from, or SUBTRACTED between, curves the
//   calculation has ALREADY produced. Nothing is recomputed, re-smoothed,
//   re-limited, re-graded or re-targeted here. The one exception is the
//   counterfactual, which is built by its own authority
//   (correctionCounterfactualAuthority) and attached, never invented here.
//
// WHERE IT IS BUILT (one build site)
//   finalOptimisedBassResponse.applyAuthorityToCanonicalResult — on the FINAL
//   post-alignment response. The same object is persisted into the completed
//   graph payload and rehydrated by finishedGraphAdapter, so the live tooltip
//   and the cached tooltip read one identical trace.
//
// VALUE SOURCES (no value is invented; unavailable values stay null)
//   rawRspDb                      rspBeforePeqAtOperatingLevel, else physicalRawResponseCurve
//   houseTargetDb                 canonicalTargetCurve (the plotted house-curve target)
//   requestedCorrectionDb         houseTarget - rawRsp — the deficit the EQ was asked to close
//   correctionBeforeSmoothingDb   rawCorrectionCurve — the real pre-smoothing envelope
//   correctionAfterSmoothingDb    correctionCurve — the applied EQ bank
//   appliedCorrectionDb           finalPostEq - rawRsp — what the response actually moved by
//   finalPostEqDb                 postEqRspCurve (post-alignment)
//   finalResidualDb               finalPostEq - houseTarget
//   maxOutputDb                   maximumSplCurveAfterEq — the delivered-output ceiling
//   remainingHeadroomDb           maxOutputDb - finalPostEqDb
//   capabilityLimited             frequency falls inside a capabilityLimitedRegions span
//   protectedNull                 isProtectedFrequency — the SAME authority the fitter uses
//   boostLimitDb / cutLimitDb     the correction-envelope limits exported by the
//                                 correction model itself (never re-declared here)
//
// MECHANISM FLAGS (each one is a per-frequency curve comparison, never a
// pipeline-wide flag):
//   boostLimitActive        a boost was requested and the +6 dB envelope limit
//                           is what the applied correction reached
//   sourceBoostLimitActive  the source-domain allowance clipped the requested
//                           boost BELOW the +6 dB limit, the available headroom
//                           and the requested amount
//   smoothingLimited        the applied envelope differs materially from the
//                           pre-smoothing envelope in the direction that leaves
//                           a larger target residual
//   globalAlignmentLimited  nothing else limited the frequency: the permitted
//                           correction was reached, headroom remains, and the
//                           response still misses target — only the system-wide
//                           trim can explain the remainder
//   A flag is null (not false) when the curve evidence needed to decide it was
//   not available.
//
// REQUIRED RETENTION
//   The persisted trace always retains the inspection frequencies designers use
//   to audit low-frequency behaviour (16, 20, 23.8, 30, 40 Hz), plus the
//   official P19 worst frequency, the P20 worst frequency and the transition
//   edge — stride downsampling is never allowed to drop them. Each retained
//   record stores the frequency that was asked for (requestedFrequencyHz) as
//   well as the real engine grid frequency (frequency).
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

export const CORRECTION_TRACE_SCHEMA_VERSION = 2;

// Shown when the loaded result predates the trace.
export const CORRECTION_TRACE_UNAVAILABLE_COPY =
  "Detailed correction trace is available after recalculation.";

// The RP22 P19 assessment basis (1/3-octave), carried so the tooltip can label
// the official basis alongside the display smoothing.
export const OFFICIAL_P19_SMOOTHING_BASIS = "third";

// Frequencies a designer audits in the low-frequency band. These are retained
// even when the stride would otherwise skip them.
export const REQUIRED_INSPECTION_FREQUENCIES_HZ = [16, 20, 23.8, 30, 40];

export const RETENTION_REASONS = {
  REQUIRED: "required_frequency",
  P19_WORST: "p19_worst_frequency",
  P20_WORST: "p20_worst_frequency",
  TRANSITION_EDGE: "transition_edge",
};

const MAX_RECORDS = 120;
// A difference below this is measurement noise on a 0.01 dB grid, not a
// mechanism. Used for every flag decision so the flags cannot be set by
// floating-point dust.
const MATERIALITY_DB = 0.05;

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
 * The nearest real grid frequency to a requested inspection frequency. Returns
 * null when the grid is empty — a requested frequency is never fabricated.
 */
function nearestGridFrequency(grid, requested) {
  if (!Array.isArray(grid) || !grid.length || !Number.isFinite(requested)) return null;
  let nearest = grid[0];
  let distance = Math.abs(nearest - requested);
  for (const frequency of grid) {
    const candidate = Math.abs(frequency - requested);
    if (candidate < distance) {
      nearest = frequency;
      distance = candidate;
    }
  }
  return nearest;
}

/**
 * Decide the single mechanism that limited the correction at one frequency.
 * Ordered by the published vocabulary — the first mechanism that actually acted
 * is named; every decision is a curve comparison, never a generic flag.
 */
export function resolveLimitingMechanism(record) {
  if (!record) return null;
  if (record.protectedNull === true) return "protected_null";
  if (record.boostLimitActive === true) return "boost_limit";
  if (record.sourceBoostLimitActive === true) return "source_boost_limit";
  if (record.capabilityLimited === true) return "output_capability";
  if (record.smoothingLimited === true) return "smoothing";
  if (record.globalAlignmentLimited === true) return "global_alignment";
  return null;
}

/**
 * Build the persisted correction trace from the final response.
 *
 * @param {object} params
 * @param {Array}  params.postEqRspCurve            final (post-alignment) post-EQ RSP curve
 * @param {Array}  params.rawRspCurve               pre-EQ RSP response at the operating level
 * @param {Array}  params.targetCurve               the house-curve target
 * @param {Array}  params.correctionCurve           applied EQ correction envelope (post-smoothing)
 * @param {Array}  [params.rawCorrectionCurve]      the real pre-smoothing correction envelope
 * @param {Array}  [params.maximumOutputCurve]      maximumSplCurveAfterEq — delivered-output ceiling
 * @param {number} [params.globalTrimDb]            the predictor's global operating trim
 * @param {Array}  [params.capabilityLimitedRegions]
 * @param {Array}  [params.protectedNullRegions]
 * @param {number} [params.initialOperatingAdjustmentDb]
 * @param {number} [params.finalGlobalAlignmentTrimDb]
 * @param {number} [params.assessmentStartHz]
 * @param {number} [params.assessmentEndHz]
 * @param {number} [params.officialP19WorstFrequencyHz]
 * @param {number} [params.p20WorstFrequencyHz]
 * @param {number} [params.transitionEdgeHz]
 * @param {object} [params.counterfactual]          counterfactual examination (own authority)
 * @returns {object|null} trace, or null when the final curve is unavailable
 */
export function buildCorrectionTrace({
  postEqRspCurve,
  rawRspCurve,
  targetCurve,
  correctionCurve,
  rawCorrectionCurve,
  maximumOutputCurve,
  globalTrimDb = null,
  capabilityLimitedRegions = [],
  protectedNullRegions = [],
  initialOperatingAdjustmentDb = null,
  finalGlobalAlignmentTrimDb = null,
  assessmentStartHz = null,
  assessmentEndHz = null,
  officialP19WorstFrequencyHz = null,
  p20WorstFrequencyHz = null,
  transitionEdgeHz = null,
  counterfactual = null,
} = {}) {
  const finalSampler = prepareSampler(postEqRspCurve);
  if (!finalSampler) return null;

  const rawSampler = prepareSampler(rawRspCurve);
  const targetSampler = prepareSampler(targetCurve);
  const correctionSampler = prepareSampler(correctionCurve);
  const rawCorrectionSampler = prepareSampler(rawCorrectionCurve);
  const maximumOutputSampler = prepareSampler(maximumOutputCurve);

  const grid = (Array.isArray(postEqRspCurve) ? postEqRspCurve : [])
    .map((point) => Number(point?.frequency))
    .filter((frequency) => Number.isFinite(frequency) && frequency > 0)
    .sort((left, right) => left - right);
  if (!grid.length) return null;

  // Available boost headroom is a predictor scalar: M(f) - O(f) = -globalTrimDb.
  const trim = toScalarOrNull(globalTrimDb);
  const availableBoostHeadroomDb = trim === null ? null : Math.max(0, -trim);

  const buildRecord = (frequency, requestedFrequencyHz = null, retentionReason = null) => {
    const finalPostEqDb = finalSampler(frequency);
    if (!Number.isFinite(finalPostEqDb)) return null;

    const rawRspDb = rawSampler ? rawSampler(frequency) : null;
    const houseTargetDb = targetSampler ? targetSampler(frequency) : null;
    const correctionAfterSmoothingDb = correctionSampler ? correctionSampler(frequency) : null;
    const correctionBeforeSmoothingDb = rawCorrectionSampler ? rawCorrectionSampler(frequency) : null;
    const maxOutputDb = maximumOutputSampler ? maximumOutputSampler(frequency) : null;

    const hasRaw = Number.isFinite(rawRspDb);
    const hasTarget = Number.isFinite(houseTargetDb);
    const requestedCorrectionDb = hasRaw && hasTarget ? round2(houseTargetDb - rawRspDb) : null;
    const finalResidualDb = hasTarget ? round2(finalPostEqDb - houseTargetDb) : null;

    // ── Mechanism decisions — each one a direct curve comparison ──
    const protectedNull = isProtectedFrequency(frequency, protectedNullRegions);
    const capabilityLimited = regionCovers(capabilityLimitedRegions, frequency);

    let boostLimitActive = null;
    let sourceBoostLimitActive = null;
    let smoothingLimited = null;
    let globalAlignmentLimited = null;

    if (Number.isFinite(requestedCorrectionDb)) {
      const requestsBoost = requestedCorrectionDb > MATERIALITY_DB;
      const before = correctionBeforeSmoothingDb;
      const after = correctionAfterSmoothingDb;

      // The predictor's nominal boost is min(error, +6 dB, available headroom),
      // then clipped by the source-domain allowance. Declared in this scope
      // because the global-alignment decision below needs the same permission
      // ceiling (null when no boost was requested).
      const headroomCap = availableBoostHeadroomDb === null ? Infinity : availableBoostHeadroomDb;
      const nominalBoost = requestsBoost
        ? Math.min(requestedCorrectionDb, MAX_BOOST_DB, headroomCap)
        : null;

      if (requestsBoost) {
        if (Number.isFinite(before)) {
          boostLimitActive = requestedCorrectionDb > MAX_BOOST_DB + MATERIALITY_DB
            && before >= MAX_BOOST_DB - MATERIALITY_DB;
          sourceBoostLimitActive = Number.isFinite(nominalBoost)
            && before < nominalBoost - MATERIALITY_DB;
        } else {
          boostLimitActive = requestedCorrectionDb > MAX_BOOST_DB + MATERIALITY_DB;
          sourceBoostLimitActive = null;
        }
      } else {
        boostLimitActive = false;
        sourceBoostLimitActive = false;
      }

      // Smoothing limited: the applied envelope moved materially away from the
      // pre-smoothing envelope in the direction that leaves a LARGER residual.
      if (Number.isFinite(before) && Number.isFinite(after)) {
        const delta = after - before;
        smoothingLimited = Math.abs(delta) > MATERIALITY_DB
          && ((requestsBoost && delta < 0) || (!requestsBoost && delta > 0));
      } else {
        smoothingLimited = null;
      }

      // Global alignment limited: nothing else acted, headroom remains, the
      // permitted correction was reached, and the response still misses target.
      const noOtherLimit = protectedNull !== true
        && capabilityLimited !== true
        && boostLimitActive !== true
        && sourceBoostLimitActive !== true
        && smoothingLimited !== true;
      const permittedReached = Number.isFinite(before) && Number.isFinite(nominalBoost)
        && before >= Math.min(nominalBoost, MAX_BOOST_DB) - MATERIALITY_DB;
      const headroomRemains = Number.isFinite(maxOutputDb)
        ? maxOutputDb - finalPostEqDb > MATERIALITY_DB
        : true;
      globalAlignmentLimited = noOtherLimit
        && headroomRemains
        && (requestsBoost
          ? permittedReached
          : Math.abs(requestedCorrectionDb) <= MATERIALITY_DB)
        && Number.isFinite(finalResidualDb)
        && Math.abs(finalResidualDb) > MATERIALITY_DB
        && finalResidualDb < 0;
    }

    return {
      frequency: round2(frequency),
      requestedFrequencyHz: Number.isFinite(requestedFrequencyHz) ? requestedFrequencyHz : null,
      retention: retentionReason,
      rawRspDb: hasRaw ? round2(rawRspDb) : null,
      houseTargetDb: hasTarget ? round2(houseTargetDb) : null,
      requestedCorrectionDb,
      correctionBeforeSmoothingDb: Number.isFinite(correctionBeforeSmoothingDb)
        ? round2(correctionBeforeSmoothingDb) : null,
      correctionAfterSmoothingDb: Number.isFinite(correctionAfterSmoothingDb)
        ? round2(correctionAfterSmoothingDb) : null,
      globalAlignmentTrimDb: trim === null ? null : round2(trim),
      appliedCorrectionDb: hasRaw ? round2(finalPostEqDb - rawRspDb) : null,
      finalPostEqDb: round2(finalPostEqDb),
      finalResidualDb,
      maxOutputDb: Number.isFinite(maxOutputDb) ? round2(maxOutputDb) : null,
      remainingHeadroomDb: Number.isFinite(maxOutputDb)
        ? round2(maxOutputDb - finalPostEqDb) : null,
      boostLimitActive,
      sourceBoostLimitActive,
      capabilityLimited,
      protectedNull,
      smoothingLimited,
      globalAlignmentLimited,
      // Backwards-compatible alias kept for existing consumers.
      rawRsp: hasRaw ? round2(rawRspDb) : null,
      targetDb: hasTarget ? round2(houseTargetDb) : null,
      residualDb: finalResidualDb,
    };
  };

  // ── Required retention targets, resolved onto the real engine grid ──
  // Resolved BEFORE the stride so retention reserves capacity: the retained
  // rows are never displaced by the downsampled set, and the trace still obeys
  // the record bound.
  const retainedTargets = [
    ...REQUIRED_INSPECTION_FREQUENCIES_HZ.map((frequency) => ({
      requested: frequency,
      reason: RETENTION_REASONS.REQUIRED,
    })),
    { requested: officialP19WorstFrequencyHz, reason: RETENTION_REASONS.P19_WORST },
    { requested: p20WorstFrequencyHz, reason: RETENTION_REASONS.P20_WORST },
    {
      requested: Number.isFinite(transitionEdgeHz) ? transitionEdgeHz : assessmentEndHz,
      reason: RETENTION_REASONS.TRANSITION_EDGE,
    },
  ].map(({ requested, reason }) => ({
    requested: Number(requested),
    reason,
    gridFrequency: nearestGridFrequency(grid, Number(requested)),
  })).filter((entry) => entry.gridFrequency !== null);

  const retainedFrequencyCount = new Set(retainedTargets.map((entry) => entry.gridFrequency)).size;
  const capacity = Math.max(1, MAX_RECORDS - retainedFrequencyCount);

  // ── Strided pass ──
  const stride = Math.max(1, Math.ceil(grid.length / capacity));
  const byFrequency = new Map();
  for (let index = 0; index < grid.length && byFrequency.size < capacity; index += stride) {
    const record = buildRecord(grid[index]);
    if (record) byFrequency.set(record.frequency, record);
  }

  // ── Required retention — the stride is never allowed to drop these ──
  for (const { requested, reason, gridFrequency } of retainedTargets) {
    const record = buildRecord(gridFrequency, requested, reason);
    if (record) byFrequency.set(record.frequency, record);
  }

  const records = [...byFrequency.values()].sort((left, right) => left.frequency - right.frequency);
  if (!records.length) return null;

  records.forEach((record) => {
    record.limitingMechanism = resolveLimitingMechanism(record);
  });

  const initial = toScalarOrNull(initialOperatingAdjustmentDb);
  const alignment = toScalarOrNull(finalGlobalAlignmentTrimDb);

  return {
    schemaVersion: CORRECTION_TRACE_SCHEMA_VERSION,
    officialP19SmoothingBasis: OFFICIAL_P19_SMOOTHING_BASIS,
    correctionSmoothingApplied: true,
    boostLimitDb: MAX_BOOST_DB,
    cutLimitDb: -Math.abs(MAX_CUT_DB),
    initialOperatingAdjustmentDb: round2(initial),
    finalGlobalAlignmentTrimDb: round2(alignment),
    finalEffectiveAdjustmentDb: initial !== null && alignment !== null ? round2(initial + alignment) : null,
    predictorGlobalTrimDb: trim === null ? null : round2(trim),
    availableBoostHeadroomDb: availableBoostHeadroomDb === null ? null : round2(availableBoostHeadroomDb),
    assessmentStartHz: toScalarOrNull(assessmentStartHz),
    assessmentEndHz: toScalarOrNull(assessmentEndHz),
    officialP19WorstFrequencyHz: toScalarOrNull(officialP19WorstFrequencyHz),
    p20WorstFrequencyHz: toScalarOrNull(p20WorstFrequencyHz),
    bandStartHz: records[0].frequency,
    bandEndHz: records[records.length - 1].frequency,
    requiredInspectionFrequenciesHz: [...REQUIRED_INSPECTION_FREQUENCIES_HZ],
    hasPreSmoothingEnvelope: rawCorrectionSampler !== null,
    counterfactual: counterfactual || null,
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

/**
 * Read the retained record for a named inspection frequency. Unlike the cursor
 * reader this resolves the requested frequency against the retained grid, so
 * "23.8 Hz" always finds the row the designer asked about.
 */
export function readRetainedTraceRecord(trace, requestedFrequencyHz) {
  const records = trace?.records;
  const requested = Number(requestedFrequencyHz);
  if (!Array.isArray(records) || !records.length || !Number.isFinite(requested)) return null;
  const exact = records.filter((record) => Number(record?.requestedFrequencyHz) === requested);
  if (exact.length) return exact[0];
  const gridFrequency = nearestGridFrequency(
    records.map((record) => Number(record?.frequency)).filter(Number.isFinite),
    requested,
  );
  if (gridFrequency === null) return null;
  return records.find((record) => Number(record?.frequency) === gridFrequency) || null;
}

/** Deep clone for persistence — keeps the payload independent of live state. */
export function cloneCorrectionTrace(trace) {
  if (!trace?.records?.length) return null;
  return {
    ...trace,
    requiredInspectionFrequenciesHz: Array.isArray(trace.requiredInspectionFrequenciesHz)
      ? [...trace.requiredInspectionFrequenciesHz] : trace.requiredInspectionFrequenciesHz,
    counterfactual: trace.counterfactual ? JSON.parse(JSON.stringify(trace.counterfactual)) : null,
    records: trace.records.map((record) => ({ ...record })),
  };
}

/** True when a stored result predates the trace. */
export function isCorrectionTraceUnavailable(trace) {
  return !trace?.records?.length;
}