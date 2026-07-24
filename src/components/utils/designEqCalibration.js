import { applyBassSmoothing } from "@/components/room/bass/bassGraphSmoothing";
import { artcousticHouseCurveOffsetAt } from "@/components/utils/artcousticHouseCurve";
import {
  buildLfCapabilityContext,
  buildLfCapabilityProtectionDiagnostics,
  calculateLfCapabilityPenalty,
  getEqCapabilityBoostAllowance,
} from "@/components/utils/lfCapabilityProtection";
import { isProtectedFrequency } from "@/components/utils/houseCurveFitProtection";

const isNumber = (value) => Number.isFinite(Number(value));
const DESIGN_EQ_SAMPLE_RATE = 48000;
let __bankEvaluationCounter = 0;

// Part A: Explicit fitting profiles. Standard preserves current behaviour (P14-safe
// checkpoint selection, ±2 dB discovery, −10 dB cut ceiling). Accuracy trades P14/P18
// preservation for closer house-curve alignment (±1 dB discovery, −15 dB cut ceiling).
// Positive magnitudes configure boost; cuts are applied as negative gain.
export const DESIGN_EQ_FIT_PROFILES = {
  standard: {
    id: "standard",
    preserveP14: true,
    fittingToleranceDb: 2,
    maximumCutDb: 10,
    maximumAggregateBoostDb: 6,
    peakDiscoveryThresholdDb: 2,
    valleyDiscoveryThresholdDb: 2,
  },
  accuracy: {
    id: "accuracy",
    preserveP14: false,
    fittingToleranceDb: 1,
    maximumCutDb: 15,
    maximumAggregateBoostDb: 6,
    peakDiscoveryThresholdDb: 1,
    valleyDiscoveryThresholdDb: 1,
  },
};

export function getDesignEqFitProfile(profileId) {
  return DESIGN_EQ_FIT_PROFILES[profileId] || DESIGN_EQ_FIT_PROFILES.standard;
}

function normaliseCurve(curveData) {
  return (Array.isArray(curveData) ? curveData : [])
    .map((point) => ({ frequency: Number(point?.frequency), spl: Number(point?.spl) }))
    .filter((point) => isNumber(point.frequency) && isNumber(point.spl) && point.frequency > 0)
    .sort((a, b) => a.frequency - b.frequency);
}

function interpolate(curve, frequency) {
  if (!curve.length) return null;
  if (frequency <= curve[0].frequency) return curve[0].spl;
  if (frequency >= curve[curve.length - 1].frequency) return curve[curve.length - 1].spl;
  const upperIndex = curve.findIndex((point) => point.frequency >= frequency);
  const low = curve[upperIndex - 1];
  const high = curve[upperIndex];
  const ratio = (frequency - low.frequency) / (high.frequency - low.frequency);
  return low.spl + (high.spl - low.spl) * ratio;
}


function median(values) {
  const sorted = values.filter(isNumber).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function deviationAt(curve, frequency, anchorDb) {
  const spl = interpolate(curve, frequency);
  return isNumber(spl) ? spl - (anchorDb + artcousticHouseCurveOffsetAt(frequency)) : null;
}

function octaveWidth(startHz, endHz) {
  return startHz > 0 && endHz > startHz ? Math.log2(endHz / startHz) : 0;
}

// Part D: Peak and valley discovery thresholds are now profile-driven. Standard
// preserves the original ±2 dB behaviour; Accuracy uses ±1 dB so a ±1 dB target
// can discover materially correctable residuals.
function findRegions(points, kind, peakThresholdDb = 2, valleyThresholdDb = 2) {
  // Part A: Peak deviations >= +peakThresholdDb; valley deviations <= -valleyThresholdDb.
  // The previous implementation used `-threshold` for valleys, which became positive
  // and accepted deviations up to +valleyThresholdDb as valleys. This is now corrected.
  const matches = (point) =>
    kind === "peak"
      ? point.deviationDb >= peakThresholdDb
      : point.deviationDb <= -valleyThresholdDb;
  const minimumWidth = kind === "peak" ? 1 / 6 : 1 / 3;
  const regions = [];
  let current = [];
  const finish = () => {
    if (!current.length) return;
    const startHz = current[0].frequency;
    const endHz = current[current.length - 1].frequency;
    const width = octaveWidth(startHz, endHz);
    if (width >= minimumWidth) {
      const centrePoint = current.reduce((best, point) => kind === "peak"
        ? (point.deviationDb > best.deviationDb ? point : best)
        : (point.deviationDb < best.deviationDb ? point : best));
      regions.push({ kind, startHz, endHz, widthOctaves: width, centrePoint, severityDb: Math.abs(centrePoint.deviationDb) });
    }
    current = [];
  };
  points.forEach((point) => {
    if (matches(point)) current.push(point);
    else finish();
  });
  finish();
  return regions;
}

// Part A: Deterministic checks proving the valley threshold sign is correct.
// A +0.5 dB point must NOT be an Accuracy valley; a −0.9 dB point must NOT be
// an Accuracy valley; a −1.0 dB point MUST be an Accuracy valley. Uses a band
// of points spanning > 1/3 octave so the minimum-width requirement is met.
export function getDesignEqValleyThresholdValidation() {
  const peakThresholdDb = 1;
  const valleyThresholdDb = 1;
  // 40–63 Hz ≈ 0.66 octaves — exceeds the 1/3-octave valley minimum width.
  const bandFreqs = [40, 45, 50, 56, 63];
  const bandPoints = (deviationDb) => bandFreqs.map((f) => ({ frequency: f, deviationDb }));
  const isValley = (deviationDb) =>
    findRegions(bandPoints(deviationDb), "valley", peakThresholdDb, valleyThresholdDb).length > 0;
  const isPeak = (deviationDb) =>
    findRegions(bandPoints(deviationDb), "peak", peakThresholdDb, valleyThresholdDb).length > 0;
  return {
    plusHalfDbIsNotValley: !isValley(0.5),
    minusZeroNineDbIsNotValley: !isValley(-0.9),
    minusOneDbIsValley: isValley(-1.0),
    plusOneDbIsPeak: isPeak(1.0),
    plusHalfDbIsNotPeak: !isPeak(0.5),
  };
}

function qForRegion(region) {
  const bandwidthHz = Math.max(region.endHz - region.startHz, 0.01);
  return Math.max(0.5, Math.min(10, region.centrePoint.frequency / bandwidthHz));
}

export function peakingEqResponseDb(frequencyHz, filter) {
  const evaluationHz = Number(frequencyHz);
  const requestedCentreHz = Number(filter?.frequencyHz);
  const centreHz = Math.min(requestedCentreHz, DESIGN_EQ_SAMPLE_RATE * 0.45);
  const gainDb = Number(filter?.gainDb);
  const q = Number(filter?.Q);

  if (!filter?.enabled
    || !Number.isFinite(evaluationHz) || evaluationHz <= 0
    || !Number.isFinite(centreHz) || centreHz <= 0
    || !Number.isFinite(q) || q <= 0
    || !Number.isFinite(gainDb)) return 0;

  const A = 10 ** (gainDb / 40);
  const w0 = 2 * Math.PI * centreHz / DESIGN_EQ_SAMPLE_RATE;
  const alpha = Math.sin(w0) / (2 * q);
  const unnormalisedB0 = 1 + alpha * A;
  const unnormalisedB1 = -2 * Math.cos(w0);
  const unnormalisedB2 = 1 - alpha * A;
  const a0 = 1 + alpha / A;
  const unnormalisedA1 = -2 * Math.cos(w0);
  const unnormalisedA2 = 1 - alpha / A;

  if (![A, w0, alpha, unnormalisedB0, unnormalisedB1, unnormalisedB2, a0, unnormalisedA1, unnormalisedA2].every(Number.isFinite) || a0 === 0) return 0;

  const b0 = unnormalisedB0 / a0;
  const b1 = unnormalisedB1 / a0;
  const b2 = unnormalisedB2 / a0;
  const a1 = unnormalisedA1 / a0;
  const a2 = unnormalisedA2 / a0;
  const w = 2 * Math.PI * evaluationHz / DESIGN_EQ_SAMPLE_RATE;
  const numeratorReal = b0 + b1 * Math.cos(w) + b2 * Math.cos(2 * w);
  const numeratorImag = -(b1 * Math.sin(w) + b2 * Math.sin(2 * w));
  const denominatorReal = 1 + a1 * Math.cos(w) + a2 * Math.cos(2 * w);
  const denominatorImag = -(a1 * Math.sin(w) + a2 * Math.sin(2 * w));
  const numeratorMagnitude = Math.hypot(numeratorReal, numeratorImag);
  const denominatorMagnitude = Math.hypot(denominatorReal, denominatorImag);

  if (![b0, b1, b2, a1, a2, numeratorMagnitude, denominatorMagnitude].every(Number.isFinite)
    || denominatorMagnitude <= 0 || numeratorMagnitude <= 0) return 0;

  const responseDb = 20 * Math.log10(numeratorMagnitude / denominatorMagnitude);
  return Number.isFinite(responseDb) ? responseDb : 0;
}

export function getDesignEqPeakingResponseValidation() {
  const cases = [
    { label: "35 Hz, -6 dB, Q 1", filter: { enabled: true, frequencyHz: 35, gainDb: -6, Q: 1 }, centreHz: 35 },
    { label: "35 Hz, -6 dB, Q 4", filter: { enabled: true, frequencyHz: 35, gainDb: -6, Q: 4 }, centreHz: 35 },
    { label: "50 Hz, +3 dB, Q 2", filter: { enabled: true, frequencyHz: 50, gainDb: 3, Q: 2 }, centreHz: 50 },
    { label: "0 dB gain", filter: { enabled: true, frequencyHz: 50, gainDb: 0, Q: 2 }, centreHz: 50 },
  ];
  const qOne = cases[0].filter;
  const qFour = cases[1].filter;
  return {
    centreResponses: cases.map(({ label, filter, centreHz }) => ({ label, responseDb: peakingEqResponseDb(centreHz, filter) })),
    offCentre35Hz: {
      q1At40Hz: peakingEqResponseDb(40, qOne),
      q4At40Hz: peakingEqResponseDb(40, qFour),
    },
  };
}

function limitBoostForCapability(filter, activeSubs, usableLfHz, requestedSystemOutputDb) {
  if (filter.gainDb <= 0) return filter;
  const frequencies = [filter.startHz, (filter.startHz + filter.frequencyHz) / 2, filter.frequencyHz, (filter.frequencyHz + filter.endHz) / 2, filter.endHz]
    .filter(isNumber);
  const allowed = frequencies.map((frequency) => getEqCapabilityBoostAllowance({
    frequency,
    requestedBoostDb: filter.gainDb,
    activeSubs,
    usableLfHz,
    maxBoostDb: 6,
    requestedSystemOutputDb,
  }).allowedBoostDb).filter(isNumber);
  const gainDb = allowed.length ? Math.min(filter.gainDb, ...allowed) : filter.gainDb;
  return { ...filter, gainDb };
}

// Aggregate filter-bank response at a single frequency — sums RBJ peaking responses
// for every enabled filter. Used to enforce completed-bank capability limits.
function aggregateResponseDbAt(frequency, filters) {
  return filters.reduce((sum, filter) => sum + peakingEqResponseDb(frequency, filter), 0);
}

// Part B: Evaluate the completed provisional bank across all raw-curve frequencies
// (20–200 Hz). Checks: aggregate boost ≤ +6.05 dB, aggregate boost ≤ source-domain
// headroom + 0.05 dB, and aggregate cut ≥ profile cut floor. The cut floor is
// profile-driven (−10.05 dB standard, −15.05 dB accuracy). These limits apply to
// the completed bank, not per filter. Cuts do not require product headroom.
function evaluateProvisionalBankLimits(filters, raw, activeSubs, usableLfHz, requestedSystemOutputDb, profile) {
  __bankEvaluationCounter++;
  const maximumAggregateBoostDb = (profile?.maximumAggregateBoostDb ?? 6) + 0.05;
  const aggregateCutFloorDb = -((profile?.maximumCutDb ?? 10) + 0.05);
  const bandPoints = raw.filter((p) => p.frequency >= 20 && p.frequency <= 200);
  let maxAggregateBoostDb = 0;
  let maxAggregateBoostHz = null;
  let maxAggregateCutDb = 0;
  let maxAggregateCutHz = null;
  let limitingPermittedBoostDb = 6;
  let boostLimitOk = true;
  let cutLimitOk = true;
  let sourceDomainHeadroomOk = true;
  for (const point of bandPoints) {
    const aggregateDb = aggregateResponseDbAt(point.frequency, filters);
    if (aggregateDb > maxAggregateBoostDb) { maxAggregateBoostDb = aggregateDb; maxAggregateBoostHz = point.frequency; }
    if (aggregateDb < maxAggregateCutDb) { maxAggregateCutDb = aggregateDb; maxAggregateCutHz = point.frequency; }
    if (aggregateDb > maximumAggregateBoostDb) boostLimitOk = false;
    if (aggregateDb < aggregateCutFloorDb) cutLimitOk = false;
    if (aggregateDb > 0) {
      const allowed = getEqCapabilityBoostAllowance({ frequency: point.frequency, requestedBoostDb: 6, activeSubs, usableLfHz, maxBoostDb: 6, requestedSystemOutputDb });
      const permitted = Number.isFinite(allowed?.allowedBoostDb) ? allowed.allowedBoostDb : 6;
      if (aggregateDb > permitted + 0.05) sourceDomainHeadroomOk = false;
    }
  }
  if (maxAggregateBoostHz !== null && maxAggregateBoostDb > 0) {
    const allowed = getEqCapabilityBoostAllowance({ frequency: maxAggregateBoostHz, requestedBoostDb: 6, activeSubs, usableLfHz, maxBoostDb: 6, requestedSystemOutputDb });
    limitingPermittedBoostDb = Number.isFinite(allowed?.allowedBoostDb) ? allowed.allowedBoostDb : 6;
  }
  return { maxAggregateBoostDb, maxAggregateBoostHz, maxAggregateCutDb, maxAggregateCutHz, limitingPermittedBoostDb, boostLimitOk, cutLimitOk, sourceDomainHeadroomOk, allOk: boostLimitOk && cutLimitOk && sourceDomainHeadroomOk };
}

// Scale a candidate's gain via binary search so the completed bank (existing + candidate)
// satisfies all aggregate limits. Returns null filter if the scaled gain is ≤ 0.1 dB.
function scaleCandidateForBankLimits(candidate, existingFilters, raw, activeSubs, usableLfHz, requestedSystemOutputDb, profile) {
  const proposedGainDb = candidate.gainDb;
  const initial = evaluateProvisionalBankLimits([...existingFilters, candidate], raw, activeSubs, usableLfHz, requestedSystemOutputDb, profile);
  if (initial.allOk) return { filter: candidate, scaled: false, limits: initial };
  const isBoost = proposedGainDb > 0;
  let lo = 0;
  let hi = Math.abs(proposedGainDb);
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    const scaledGain = isBoost ? mid : -mid;
    const scaledLimits = evaluateProvisionalBankLimits([...existingFilters, { ...candidate, gainDb: scaledGain }], raw, activeSubs, usableLfHz, requestedSystemOutputDb, profile);
    if (scaledLimits.allOk) lo = mid; else hi = mid;
  }
  const scaledGainDb = isBoost ? lo : -lo;
  if (Math.abs(scaledGainDb) <= 0.1) return { filter: null, scaled: true, limits: initial };
  const scaledFilter = { ...candidate, gainDb: scaledGainDb };
  const scaledLimits = evaluateProvisionalBankLimits([...existingFilters, scaledFilter], raw, activeSubs, usableLfHz, requestedSystemOutputDb, profile);
  return { filter: scaledFilter, scaled: true, limits: scaledLimits };
}

// Near-duplicate guard: reject if centre-frequency separation ≤ 1/24 octave AND
// Q ratio ≤ 1.25 vs any existing same-sign filter.
function isNearDuplicate(candidate, existingFilters) {
  const candidateSign = candidate.gainDb > 0 ? 1 : -1;
  for (const filter of existingFilters) {
    if (!filter.enabled) continue;
    const filterSign = filter.gainDb > 0 ? 1 : -1;
    if (filterSign !== candidateSign) continue;
    const freqRatio = Math.log2(Math.max(candidate.frequencyHz, filter.frequencyHz) / Math.min(candidate.frequencyHz, filter.frequencyHz));
    const qRatio = Math.max(candidate.Q, filter.Q) / Math.min(candidate.Q, filter.Q);
    if (freqRatio <= 1 / 24 && qRatio <= 1.25) return true;
  }
  return false;
}

// Count same-sign filters within 1/12 octave of the candidate. No more than 2 total
// (including the candidate) are permitted.
function countSameSignFiltersInRegion(candidate, existingFilters) {
  const candidateSign = candidate.gainDb > 0 ? 1 : -1;
  let count = 0;
  for (const filter of existingFilters) {
    if (!filter.enabled) continue;
    const filterSign = filter.gainDb > 0 ? 1 : -1;
    if (filterSign !== candidateSign) continue;
    const freqRatio = Math.log2(Math.max(candidate.frequencyHz, filter.frequencyHz) / Math.min(candidate.frequencyHz, filter.frequencyHz));
    if (freqRatio <= 1 / 12) count++;
  }
  return count;
}

// Maximum same-sign filter count within any 1/12-octave region (for diagnostics).
function maxSameRegionFilterCount(filters) {
  let maxCount = 0;
  for (let i = 0; i < filters.length; i++) {
    if (!filters[i].enabled) continue;
    const sign = filters[i].gainDb > 0 ? 1 : -1;
    let count = 1;
    for (let j = 0; j < filters.length; j++) {
      if (i === j || !filters[j].enabled) continue;
      const signJ = filters[j].gainDb > 0 ? 1 : -1;
      if (signJ !== sign) continue;
      const ratio = Math.log2(Math.max(filters[i].frequencyHz, filters[j].frequencyHz) / Math.min(filters[i].frequencyHz, filters[j].frequencyHz));
      if (ratio <= 1 / 12) count++;
    }
    if (count > maxCount) maxCount = count;
  }
  return maxCount;
}

// Part B: Shared helper — constructs a curve from raw response + sum of every
// filter in the provisional bank. Used for both append and revision candidates
// so a replaced filter's previous response does not remain in the curve.
function buildCurveFromBank(raw, filters) {
  return raw.map((point) => ({
    frequency: point.frequency,
    spl: point.spl + filters.reduce((sum, filter) => sum + peakingEqResponseDb(point.frequency, filter), 0),
  }));
}

// Part B: Scale a revision's gain delta via binary search so the completed bank
// (with the revised filter replacing the existing one) satisfies all aggregate
// limits. The existing gain is the known-safe lower bound; the proposed revised
// gain is the upper bound. The per-filter cut clamp and aggregate cut floor are
// profile-driven (−10 dB / −15 dB). Returns null filter if the accepted delta is
// ≤ 0.1 dB.
function scaleRevisionForBankLimits(existingFilter, proposedGainDelta, filterIndex, existingFilters, raw, activeSubs, usableLfHz, requestedSystemOutputDb, profile) {
  const maximumCutDb = profile?.maximumCutDb ?? 10;
  const maximumAggregateBoostDb = profile?.maximumAggregateBoostDb ?? 6;
  const proposedGain = existingFilter.gainDb + proposedGainDelta;
  const clampedGain = existingFilter.gainDb > 0
    ? Math.min(maximumAggregateBoostDb, proposedGain)
    : Math.max(-maximumCutDb, proposedGain);
  const clampedDelta = clampedGain - existingFilter.gainDb;
  if (Math.abs(clampedDelta) <= 0.1) return { filter: null, scaled: false, limits: null, acceptedDelta: 0 };
  const revisedFilter = { ...existingFilter, gainDb: clampedGain };
  const provisionalFilters = existingFilters.map((f, i) => i === filterIndex ? revisedFilter : f);
  const initial = evaluateProvisionalBankLimits(provisionalFilters, raw, activeSubs, usableLfHz, requestedSystemOutputDb, profile);
  if (initial.allOk) return { filter: revisedFilter, scaled: false, limits: initial, acceptedDelta: clampedDelta };
  const isBoost = clampedDelta > 0;
  let lo = 0;
  let hi = Math.abs(clampedDelta);
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    const scaledDelta = isBoost ? mid : -mid;
    const scaledFilter = { ...existingFilter, gainDb: existingFilter.gainDb + scaledDelta };
    const scaledFilters = existingFilters.map((f, i) => i === filterIndex ? scaledFilter : f);
    const scaledLimits = evaluateProvisionalBankLimits(scaledFilters, raw, activeSubs, usableLfHz, requestedSystemOutputDb, profile);
    if (scaledLimits.allOk) lo = mid; else hi = mid;
  }
  const acceptedDelta = isBoost ? lo : -lo;
  if (Math.abs(acceptedDelta) <= 0.1) return { filter: null, scaled: true, limits: initial, acceptedDelta: 0 };
  const acceptedFilter = { ...existingFilter, gainDb: existingFilter.gainDb + acceptedDelta };
  const acceptedFilters = existingFilters.map((f, i) => i === filterIndex ? acceptedFilter : f);
  const acceptedLimits = evaluateProvisionalBankLimits(acceptedFilters, raw, activeSubs, usableLfHz, requestedSystemOutputDb, profile);
  return { filter: acceptedFilter, scaled: true, limits: acceptedLimits, acceptedDelta };
}

function emptyFilters(filters) {
  return [...filters, ...Array.from({ length: Math.max(0, 10 - filters.length) }, (_, index) => ({
    band: filters.length + index + 1,
    enabled: false,
    type: "Peak",
    frequencyHz: null,
    gainDb: 0,
    Q: null,
    startHz: null,
    endHz: null,
    reason: "Unused",
  }))];
}

function completeBandResidualMetrics(trend, assessmentStartHz, assessmentEndHz, anchorDb) {
  const points = trend
    .filter((point) => point.frequency >= assessmentStartHz && point.frequency <= assessmentEndHz)
    .map((point) => ({
      frequency: point.frequency,
      deviationDb: deviationAt(trend, point.frequency, anchorDb),
    }))
    .filter((point) => isNumber(point.deviationDb));
  if (!points.length) return null;
  const worst = points.reduce((current, point) => Math.abs(point.deviationDb) > Math.abs(current.deviationDb) ? point : current);
  return {
    points,
    maximumAbsoluteDeviationDb: Math.abs(worst.deviationDb),
    rmsDeviationDb: Math.sqrt(points.reduce((sum, point) => sum + point.deviationDb ** 2, 0) / points.length),
    worstResidualFrequencyHz: worst.frequency,
  };
}

function createsBroadBelowTargetWorsening(beforeTrend, afterMetrics, anchorDb, fittingToleranceDb) {
  let regionStartHz = null;
  let regionEndHz = null;
  const closesMaterialRegion = () => {
    const isMaterial = regionStartHz !== null
      && regionEndHz !== null
      && octaveWidth(regionStartHz, regionEndHz) >= 1 / 6;
    regionStartHz = null;
    regionEndHz = null;
    return isMaterial;
  };

  for (const point of afterMetrics.points) {
    const beforeDeviationDb = deviationAt(beforeTrend, point.frequency, anchorDb);
    const isWorseBelowTarget = Number.isFinite(beforeDeviationDb)
      && point.deviationDb < -fittingToleranceDb
      && point.deviationDb <= beforeDeviationDb - 0.25;
    if (isWorseBelowTarget) {
      if (regionStartHz === null) regionStartHz = point.frequency;
      regionEndHz = point.frequency;
    } else if (closesMaterialRegion()) {
      return true;
    }
  }
  return closesMaterialRegion();
}

function minimumSplAcrossBand(curve, assessmentStartHz, assessmentEndHz) {
  const values = curve
    .filter((point) => point.frequency >= assessmentStartHz && point.frequency <= assessmentEndHz)
    .map((point) => Number(point.spl))
    .filter(Number.isFinite);
  return values.length ? Math.min(...values) : null;
}

function buildCheckpoint({ filters, curve, originalTrend, assessmentStartHz, assessmentEndHz, anchorDb, fittingToleranceDb, requestedSystemOutputDb, capabilityPenaltyCostDb = 0 }) {
  const trend = applyBassSmoothing(curve, "third");
  const metrics = completeBandResidualMetrics(trend, assessmentStartHz, assessmentEndHz, anchorDb);
  const rawMinimumSpl = minimumSplAcrossBand(curve, assessmentStartHz, assessmentEndHz);
  const p14MinimumSpl = minimumSplAcrossBand(trend, assessmentStartHz, assessmentEndHz);
  const broadBelowTargetWorsening = filters.length > 0 && metrics
    ? createsBroadBelowTargetWorsening(originalTrend, metrics, anchorDb, fittingToleranceDb)
    : false;
  const p14Safe = Number.isFinite(requestedSystemOutputDb)
    ? Number.isFinite(p14MinimumSpl) && p14MinimumSpl >= requestedSystemOutputDb - 0.05
    : Number.isFinite(p14MinimumSpl);
  return {
    filters: filters.map((filter) => ({ ...filter })),
    curve: curve.map((point) => ({ ...point })),
    trend: trend.map((point) => ({ ...point })),
    maximumAbsoluteDeviationDb: metrics?.maximumAbsoluteDeviationDb ?? Infinity,
    rmsDeviationDb: metrics?.rmsDeviationDb ?? Infinity,
    worstResidualFrequencyHz: metrics?.worstResidualFrequencyHz ?? null,
    rawMinimumSpl,
    p14MinimumSpl,
    minimumSpl: p14MinimumSpl, // compatibility alias for p14MinimumSpl
    broadBelowTargetWorsening,
    p14Safe,
    capabilityPenaltyCostDb,
    capabilityAdjustedMaximumDeviationDb: (metrics?.maximumAbsoluteDeviationDb ?? Infinity) + capabilityPenaltyCostDb,
  };
}

export function calculateDesignEqCurve(curveData, usableLfHz, activeSubs = [], options = {}) {
  const raw = normaliseCurve(curveData);
  if (!raw.length) return { curve: curveData || [], diagnostics: [], filters: emptyFilters([]), combinedEqCurve: [], designEqFitProfile: "standard" };

  const thirdOctave = applyBassSmoothing(raw, "third");
  const referenceBand = thirdOctave.filter((point) => point.frequency >= 150 && point.frequency <= 200);
  const rawAnchorDb = median((referenceBand.length ? referenceBand : thirdOctave).map((point) => point.spl));
  const anchorDb = isNumber(options.targetAnchorDb) ? Number(options.targetAnchorDb) : rawAnchorDb;
  if (!isNumber(anchorDb)) return { curve: raw, diagnostics: [], filters: emptyFilters([]), combinedEqCurve: [], designEqFitProfile: "standard" };

  const assessmentStartHz = Number.isFinite(Number(options.assessmentStartHz)) ? Number(options.assessmentStartHz) : 20;
  const assessmentEndHz = Number.isFinite(Number(options.assessmentEndHz)) ? Number(options.assessmentEndHz) : 200;
  const canonicalTargetCurve = Array.isArray(options.canonicalTargetCurve) ? options.canonicalTargetCurve : [];
  const protectedNullRegions = Array.isArray(options.protectedNullRegions) ? options.protectedNullRegions : [];
  // Part A: Resolve the fitting profile. Standard preserves current behaviour;
  // Accuracy trades P14/P18 preservation for closer target alignment.
  const profile = getDesignEqFitProfile(options.fitProfile);
  const capabilityContext = buildLfCapabilityContext(activeSubs, raw.map((point) => point.frequency), profile.id, options.requestedSystemOutputDb);
  const capabilityPenaltyForBank = (bank) => calculateLfCapabilityPenalty(
    bank, capabilityContext, (frequency, candidateBank) => aggregateResponseDbAt(frequency, candidateBank),
  );
  const profileFittingToleranceDb = Number.isFinite(Number(profile.fittingToleranceDb)) ? Number(profile.fittingToleranceDb) : 2;
  const requestedFittingToleranceDb = Number.isFinite(Number(options.fittingToleranceDb))
    ? Number(options.fittingToleranceDb)
    : profileFittingToleranceDb;
  const fittingToleranceDb = Math.max(1, Math.min(5, requestedFittingToleranceDb));
  const requestedSystemOutputDb = Number(options.requestedSystemOutputDb);
  const collectDiagnostics = options.collectDiagnostics !== false;
  // Accept initialFilters for seeded fits (Accuracy profile seeded from Standard).
  // Keep only valid, enabled filters. Limit to 10 filters.
  const initialFilters = Array.isArray(options.initialFilters)
    ? options.initialFilters
        .filter((f) => f && f.enabled && Number.isFinite(f.frequencyHz) && f.frequencyHz > 0
          && Number.isFinite(f.gainDb) && Number.isFinite(f.Q) && f.Q > 0)
        .slice(0, 10)
        .map((f) => ({ ...f }))
    : [];
  const hasInitialFilters = initialFilters.length > 0;
  __bankEvaluationCounter = 0;
  // Seed the filter bank from the Standard fit when provided (Accuracy profile).
  // The seeded state is the first checkpoint — it guarantees the Accuracy result
  // retains or improves the Standard checkpoint's maximum house-curve deviation.
  const filters = hasInitialFilters ? initialFilters.map((f) => ({ ...f })) : [];
  let curve = hasInitialFilters ? buildCurveFromBank(raw, filters) : raw;
  let stopReason = "no safe improvement remained";
  const checkpoints = [buildCheckpoint({
    filters,
    curve,
    originalTrend: thirdOctave,
    assessmentStartHz,
    assessmentEndHz,
    anchorDb,
    fittingToleranceDb,
    requestedSystemOutputDb,
    capabilityPenaltyCostDb: capabilityPenaltyForBank(filters),
    })];
  const iterationTrace = [];
  let bankLimitScaledCount = 0;
  let bankLimitRejectedCount = 0;
  let nearDuplicateRejectedCount = 0;
  let sameRegionRejectedCount = 0;
  let revisionAttemptCount = 0;
  let revisionPassedAcceptanceCount = 0;
  let capabilityPenaltyRejectedCount = 0;
  let capabilityPenaltyChangedSelectionCount = 0;
  let selectedRevisionOperationCount = 0;
  const revisionAttempts = [];
  const candidateAcceptanceDiagnostics = [];
  let operations = 0;
  const maxOperations = 30;
  const revisionScales = [1, 0.75, 0.5, 0.25];

  // Fit one broad residual at a time. Each pass re-smooths the cumulative curve.
  // When an append candidate is blocked by same-region/near-duplicate guards,
  // gain-only revision candidates are generated for existing same-sign filters
  // instead of appending a third overlapping filter.
  while (operations < maxOperations) {
    const trend = applyBassSmoothing(curve, "third");
    const trendPoints = trend
      .filter((point) => point.frequency >= assessmentStartHz && point.frequency <= assessmentEndHz)
      .map((point) => ({ ...point, deviationDb: deviationAt(trend, point.frequency, anchorDb) }));
    const currentMetrics = completeBandResidualMetrics(trend, assessmentStartHz, assessmentEndHz, anchorDb);
    if (!currentMetrics) break;
    if (currentMetrics.maximumAbsoluteDeviationDb <= fittingToleranceDb) {
      stopReason = "fitting tolerance achieved";
      break;
    }

    // Part D: Peak and valley discovery thresholds are profile-driven. Standard
    // preserves ±2 dB; Accuracy uses ±1 dB so a ±1 dB target can discover
    // materially correctable residuals.
    const peakDiscoveryThresholdDb = Math.max(0.5, Math.min(3, profile.peakDiscoveryThresholdDb ?? fittingToleranceDb));
    const valleyDiscoveryThresholdDb = Math.max(0.5, Math.min(3, profile.valleyDiscoveryThresholdDb ?? fittingToleranceDb));
    const regions = [
      ...findRegions(trendPoints, "peak", peakDiscoveryThresholdDb, valleyDiscoveryThresholdDb),
      ...findRegions(trendPoints, "valley", peakDiscoveryThresholdDb, valleyDiscoveryThresholdDb),
    ].sort((a, b) => b.severityDb - a.severityDb);
    if (!regions.length) break;

    const currentMinimumSpl = minimumSplAcrossBand(curve, assessmentStartHz, assessmentEndHz);
    const currentP14MinimumSpl = minimumSplAcrossBand(trend, assessmentStartHz, assessmentEndHz);
    const currentCapabilityPenaltyCostDb = capabilityPenaltyForBank(filters);
    if (!Number.isFinite(currentMinimumSpl)) break;
    const acceptableCandidates = [];
    const gainScales = [1, 0.75, 0.5];
    const qMultipliers = [1, 1.5, 2, 3];
    for (const region of regions) {
      const isPeak = region.kind === "peak";
      const isInsideProtectedNull = isProtectedFrequency(region.centrePoint.frequency, protectedNullRegions);
      if (!isPeak && isInsideProtectedNull) continue;
      // Part B: Per-filter cut clamp is profile-driven (−10 dB standard, −15 dB accuracy).
      const maximumCutDb = profile.maximumCutDb ?? 10;
      const maximumAggregateBoostDb = profile.maximumAggregateBoostDb ?? 6;
      const requestedGainDb = isPeak
        ? -Math.min(maximumCutDb, region.severityDb * 0.85)
        : Math.min(maximumAggregateBoostDb, region.severityDb * 0.75);
      const baseCandidate = limitBoostForCapability({
        band: filters.length + 1,
        enabled: true,
        type: "Peak",
        frequencyHz: region.centrePoint.frequency,
        gainDb: requestedGainDb,
        Q: qForRegion(region),
        startHz: region.startHz,
        endHz: region.endHz,
        widthOctaves: region.widthOctaves,
        reason: isPeak ? "Residual broad peak above Artcoustic target" : "Residual broad valley below Artcoustic target",
      }, activeSubs, usableLfHz, options.requestedSystemOutputDb);
      if (Math.abs(baseCandidate.gainDb) <= 0.1) continue;

      const regionSameSignCount = countSameSignFiltersInRegion(baseCandidate, filters);
      const regionAppendCandidates = [];
      const seenVariants = new Set();

      // Phase 1: Generate and evaluate every append gain/Q variant first.
      // A near-duplicate Q variant does not mean the entire region is append-blocked.
      // Skip append when the filter bank is already at the 10-filter ceiling —
      // only gain revisions to existing filters are tested.
      if (filters.length < 10) {
      for (const gainScale of gainScales) {
        for (const qMultiplier of qMultipliers) {
          const scaledCandidate = {
            ...baseCandidate,
            gainDb: baseCandidate.gainDb * gainScale,
            Q: Math.max(0.5, Math.min(10, baseCandidate.Q * qMultiplier)),
          };
          const candidate = scaledCandidate.gainDb > 0
            ? limitBoostForCapability(scaledCandidate, activeSubs, usableLfHz, options.requestedSystemOutputDb)
            : scaledCandidate;
          const variantKey = `${candidate.gainDb.toFixed(4)}:${candidate.Q.toFixed(4)}`;
          if (seenVariants.has(variantKey) || Math.abs(candidate.gainDb) <= 0.1) continue;
          seenVariants.add(variantKey);

          const isDuplicate = isNearDuplicate(candidate, filters);
          const sameRegionCount = countSameSignFiltersInRegion(candidate, filters);
          if (isDuplicate) nearDuplicateRejectedCount++;
          if (sameRegionCount >= 2) sameRegionRejectedCount++;
          if (isDuplicate || sameRegionCount >= 2) continue;

          const gainBeforeBankLimiting = candidate.gainDb;
          const bankResult = scaleCandidateForBankLimits(candidate, filters, raw, activeSubs, usableLfHz, options.requestedSystemOutputDb, profile);
          if (!bankResult.filter) { bankLimitRejectedCount++; continue; }
          if (bankResult.scaled) bankLimitScaledCount++;
          const finalCandidate = bankResult.filter;
          const gainAfterBankLimiting = finalCandidate.gainDb;
          const nextCurve = buildCurveFromBank(raw, [...filters, finalCandidate]);
          const nextTrend = applyBassSmoothing(nextCurve, "third");
          const nextMetrics = completeBandResidualMetrics(nextTrend, assessmentStartHz, assessmentEndHz, anchorDb);
          if (!nextMetrics) continue;
          const before = Math.abs(region.centrePoint.deviationDb);
          const after = Math.abs(deviationAt(nextTrend, region.centrePoint.frequency, anchorDb));
          const localImprovementDb = before - after;
          const maximumDeviationReductionDb = currentMetrics.maximumAbsoluteDeviationDb - nextMetrics.maximumAbsoluteDeviationDb;
          const rmsReductionDb = currentMetrics.rmsDeviationDb - nextMetrics.rmsDeviationDb;
          const capabilityPenaltyCostDb = capabilityPenaltyForBank([...filters, finalCandidate]);
          const incrementalCapabilityPenaltyCostDb = Math.max(0, capabilityPenaltyCostDb - currentCapabilityPenaltyCostDb);
          const capabilityAdjustedObjectiveDb = maximumDeviationReductionDb + 0.35 * rmsReductionDb - incrementalCapabilityPenaltyCostDb;
          const normalRefinementAcceptable = localImprovementDb >= 0.05
            && nextMetrics.maximumAbsoluteDeviationDb <= currentMetrics.maximumAbsoluteDeviationDb + 0.05
            && (maximumDeviationReductionDb >= 0.10 || rmsReductionDb >= 0.10);
          const isMajorModalCorrectionCandidate = region.kind === "peak"
            && region.severityDb >= 4
            && !isInsideProtectedNull
            && localImprovementDb >= 1;
          const candidateClassification = isMajorModalCorrectionCandidate ? "modal correction" : "normal refinement";
          const acousticAcceptable = isMajorModalCorrectionCandidate || normalRefinementAcceptable;
          const acceptable = isMajorModalCorrectionCandidate
            || (normalRefinementAcceptable && capabilityAdjustedObjectiveDb > 0.01);
          const acceptanceReason = acceptable
            ? `Accepted: ${candidateClassification} passed acceptance and capability checks.`
            : !acousticAcceptable
              ? `Rejected: normal refinement failed global improvement gate; modal gate ${region.kind !== "peak" ? "requires a peak" : region.severityDb < 4 ? "requires at least 4 dB severity" : isInsideProtectedNull ? "blocked by protected null" : "requires at least 1 dB local improvement"}.`
              : "Rejected: capability-adjusted objective did not remain positive.";
          if (collectDiagnostics) candidateAcceptanceDiagnostics.push({
            action: "append",
            classification: candidateClassification,
            frequencyHz: region.centrePoint.frequency,
            regionKind: region.kind,
            severityDb: region.severityDb,
            insideProtectedNull: isInsideProtectedNull,
            localImprovementDb,
            maximumDeviationReductionDb,
            rmsReductionDb,
            globalImprovement: { maximumDeviationReductionDb, rmsReductionDb },
            normalRefinementAcceptable,
            majorModalCorrectionAcceptable: isMajorModalCorrectionCandidate,
            capabilityAdjustedObjectiveDb,
            accepted: acceptable,
            reason: acceptanceReason,
          });
          if (acousticAcceptable && !acceptable) capabilityPenaltyRejectedCount++;
          if (acceptable) regionAppendCandidates.push({
            action: "append", filter: finalCandidate, replacedFilterIndex: null,
            oldGainDb: null, newGainDb: finalCandidate.gainDb, gainDeltaDb: finalCandidate.gainDb,
            oldQ: null, newQ: finalCandidate.Q, curve: nextCurve,
            maximumDeviationReductionDb, rmsReductionDb, localImprovementDb,
            candidateClassification, acceptanceReason,
            capabilityPenaltyCostDb, incrementalCapabilityPenaltyCostDb, capabilityAdjustedObjectiveDb,
            gainBeforeBankLimiting, gainAfterBankLimiting, bankLimits: bankResult.limits,
            regionSameSignCount,
          });
        }
      }
      }

      // Phase 2: Generate gain-revision candidates only when no append variant
      // passes all guards and acceptance rules, or the region already contains
      // two same-sign filters and cannot legally accept another filter.
      if (regionAppendCandidates.length === 0 || regionSameSignCount >= 2) {
        const seenRevisionsRegion = new Set();
        for (const gainScale of gainScales) {
          const correctionDelta = baseCandidate.gainDb * gainScale;
          if (Math.abs(correctionDelta) <= 0.1) continue;
          for (let filterIndex = 0; filterIndex < filters.length; filterIndex++) {
            const existingFilter = filters[filterIndex];
            if (!existingFilter.enabled) continue;
            const existingSign = existingFilter.gainDb > 0 ? 1 : -1;
            const correctionSign = correctionDelta > 0 ? 1 : -1;
            if (existingSign !== correctionSign) continue;
            const freqRatio = Math.log2(Math.max(baseCandidate.frequencyHz, existingFilter.frequencyHz) / Math.min(baseCandidate.frequencyHz, existingFilter.frequencyHz));
            if (freqRatio > 1 / 12) continue;
            for (const revisionScale of revisionScales) {
              const proposedGainDelta = correctionDelta * revisionScale;
              const revisionKey = `${region.centrePoint.frequency.toFixed(2)}:${filterIndex}:${proposedGainDelta.toFixed(4)}`;
              if (seenRevisionsRegion.has(revisionKey)) continue;
              seenRevisionsRegion.add(revisionKey);
              const proposedGainDb = existingFilter.gainDb + proposedGainDelta;
              const revisionResult = scaleRevisionForBankLimits(existingFilter, proposedGainDelta, filterIndex, filters, raw, activeSubs, usableLfHz, options.requestedSystemOutputDb, profile);
              revisionAttemptCount++;
              const attempt = {
                filterIndex, oldGainDb: existingFilter.gainDb, proposedGainDb,
                acceptedGainDb: revisionResult.filter ? revisionResult.filter.gainDb : existingFilter.gainDb,
                bankMaxBoostDb: revisionResult.limits?.maxAggregateBoostDb ?? null,
                bankMaxBoostHz: revisionResult.limits?.maxAggregateBoostHz ?? null,
                bankMaxCutDb: revisionResult.limits?.maxAggregateCutDb ?? null,
                bankMaxCutHz: revisionResult.limits?.maxAggregateCutHz ?? null,
                maximumDeviationBeforeDb: currentMetrics.maximumAbsoluteDeviationDb,
                maximumDeviationAfterDb: null, rmsBeforeDb: currentMetrics.rmsDeviationDb, rmsAfterDb: null,
                passedRules: false, rejectionReason: null,
              };
              if (!revisionResult.filter) {
                attempt.rejectionReason = "Gain change below 0.1 dB after bank limiting";
                if (collectDiagnostics) revisionAttempts.push(attempt);
                continue;
              }
              const revisedFilter = revisionResult.filter;
              const revisedFilters = filters.map((f, i) => i === filterIndex ? revisedFilter : f);
              const revisedCurve = buildCurveFromBank(raw, revisedFilters);
              const revisedTrend = applyBassSmoothing(revisedCurve, "third");
              const revisedMetrics = completeBandResidualMetrics(revisedTrend, assessmentStartHz, assessmentEndHz, anchorDb);
              if (!revisedMetrics) {
                attempt.rejectionReason = "Could not compute revised metrics";
                if (collectDiagnostics) revisionAttempts.push(attempt);
                continue;
              }
              attempt.maximumDeviationAfterDb = revisedMetrics.maximumAbsoluteDeviationDb;
              attempt.rmsAfterDb = revisedMetrics.rmsDeviationDb;
              const before = Math.abs(region.centrePoint.deviationDb);
              const after = Math.abs(deviationAt(revisedTrend, region.centrePoint.frequency, anchorDb));
              const localImprovementDb = before - after;
              const maximumDeviationReductionDb = currentMetrics.maximumAbsoluteDeviationDb - revisedMetrics.maximumAbsoluteDeviationDb;
              const rmsReductionDb = currentMetrics.rmsDeviationDb - revisedMetrics.rmsDeviationDb;
              const revisedFiltersForPenalty = filters.map((f, i) => i === filterIndex ? revisedFilter : f);
              const capabilityPenaltyCostDb = capabilityPenaltyForBank(revisedFiltersForPenalty);
              const incrementalCapabilityPenaltyCostDb = Math.max(0, capabilityPenaltyCostDb - currentCapabilityPenaltyCostDb);
              const capabilityAdjustedObjectiveDb = maximumDeviationReductionDb + 0.35 * rmsReductionDb - incrementalCapabilityPenaltyCostDb;
              const normalRefinementAcceptable = localImprovementDb >= 0.05
                && revisedMetrics.maximumAbsoluteDeviationDb <= currentMetrics.maximumAbsoluteDeviationDb + 0.05
                && (maximumDeviationReductionDb >= 0.10 || rmsReductionDb >= 0.10);
              const isMajorModalCorrectionCandidate = region.kind === "peak"
                && region.severityDb >= 4
                && !isInsideProtectedNull
                && localImprovementDb >= 1;
              const candidateClassification = isMajorModalCorrectionCandidate ? "modal correction" : "normal refinement";
              const acousticAcceptable = isMajorModalCorrectionCandidate || normalRefinementAcceptable;
              const acceptable = isMajorModalCorrectionCandidate
                || (normalRefinementAcceptable && capabilityAdjustedObjectiveDb > 0.01);
              const acceptanceReason = acceptable
                ? `Accepted: ${candidateClassification} passed acceptance and capability checks.`
                : !acousticAcceptable
                  ? `Rejected: normal refinement failed global improvement gate; modal gate ${region.kind !== "peak" ? "requires a peak" : region.severityDb < 4 ? "requires at least 4 dB severity" : isInsideProtectedNull ? "blocked by protected null" : "requires at least 1 dB local improvement"}.`
                  : "Rejected: capability-adjusted objective did not remain positive.";
              if (collectDiagnostics) candidateAcceptanceDiagnostics.push({
                action: "revise",
                classification: candidateClassification,
                frequencyHz: region.centrePoint.frequency,
                regionKind: region.kind,
                severityDb: region.severityDb,
                insideProtectedNull: isInsideProtectedNull,
                localImprovementDb,
                maximumDeviationReductionDb,
                rmsReductionDb,
                globalImprovement: { maximumDeviationReductionDb, rmsReductionDb },
                normalRefinementAcceptable,
                majorModalCorrectionAcceptable: isMajorModalCorrectionCandidate,
                capabilityAdjustedObjectiveDb,
                accepted: acceptable,
                reason: acceptanceReason,
              });
              if (acousticAcceptable && !acceptable) capabilityPenaltyRejectedCount++;
              attempt.classification = candidateClassification;
              attempt.localImprovementDb = localImprovementDb;
              attempt.maximumDeviationReductionDb = maximumDeviationReductionDb;
              attempt.rmsReductionDb = rmsReductionDb;
              attempt.passedRules = acceptable;
              if (!acceptable) attempt.rejectionReason = acceptanceReason;
              if (collectDiagnostics) revisionAttempts.push(attempt);
              if (acceptable) {
                revisionPassedAcceptanceCount++;
                acceptableCandidates.push({
                  action: "revise", filter: revisedFilter, replacedFilterIndex: filterIndex,
                  oldGainDb: existingFilter.gainDb, newGainDb: revisedFilter.gainDb,
                  gainDeltaDb: revisedFilter.gainDb - existingFilter.gainDb,
                  oldQ: existingFilter.Q, newQ: existingFilter.Q, curve: revisedCurve,
                  maximumDeviationReductionDb, rmsReductionDb, localImprovementDb,
                  candidateClassification, acceptanceReason,
                  capabilityPenaltyCostDb, incrementalCapabilityPenaltyCostDb, capabilityAdjustedObjectiveDb,
                  bankLimits: revisionResult.limits, regionSameSignCount,
                });
              }
            }
          }
        }
      }

      acceptableCandidates.push(...regionAppendCandidates);
    }

    // Part C: Candidate ranking — quantize max-deviation to 0.05 dB steps so
    // insignificant floating-point differences don't select a revision with
    // materially worse RMS. After max-deviation, RMS and local improvement,
    // prefer a legal append (preserves filter-shape flexibility), then lower
    // gain cost, then lower Q.
    const acousticBest = [...acceptableCandidates].sort((a, b) =>
      b.maximumDeviationReductionDb - a.maximumDeviationReductionDb
      || b.rmsReductionDb - a.rmsReductionDb
      || b.localImprovementDb - a.localImprovementDb)[0];
    acceptableCandidates.sort((a, b) => {
      if (Math.abs(b.capabilityAdjustedObjectiveDb - a.capabilityAdjustedObjectiveDb) > 0.01) return b.capabilityAdjustedObjectiveDb - a.capabilityAdjustedObjectiveDb;
      const aMaxDev = Math.round(a.maximumDeviationReductionDb / 0.05);
      const bMaxDev = Math.round(b.maximumDeviationReductionDb / 0.05);
      if (bMaxDev !== aMaxDev) return bMaxDev - aMaxDev;
      if (Math.abs(b.rmsReductionDb - a.rmsReductionDb) > 0.05) return b.rmsReductionDb - a.rmsReductionDb;
      if (Math.abs(b.localImprovementDb - a.localImprovementDb) > 0.05) return b.localImprovementDb - a.localImprovementDb;
      if (a.action !== b.action) return a.action === "append" ? -1 : 1;
      if (Math.abs(Math.abs(a.gainDeltaDb) - Math.abs(b.gainDeltaDb)) > 0.05) return Math.abs(a.gainDeltaDb) - Math.abs(b.gainDeltaDb);
      return a.filter.Q - b.filter.Q;
    });
    const chosen = acceptableCandidates[0];
    if (!chosen) break;
    if (acousticBest && chosen !== acousticBest) capabilityPenaltyChangedSelectionCount++;
    if (chosen.action === "append" && filters.length >= 10) {
      stopReason = "ten-band ceiling reached";
      break;
    }
    if (chosen.action === "append") {
      filters.push(chosen.filter);
    } else {
      filters[chosen.replacedFilterIndex] = chosen.filter;
      selectedRevisionOperationCount++;
    }
    curve = buildCurveFromBank(raw, filters);
    const checkpoint = buildCheckpoint({
      filters, curve, originalTrend: thirdOctave,
      assessmentStartHz, assessmentEndHz, anchorDb, fittingToleranceDb, requestedSystemOutputDb,
      capabilityPenaltyCostDb: capabilityPenaltyForBank(filters),
    });
    checkpoints.push(checkpoint);
    if (collectDiagnostics) iterationTrace.push({
      iteration: operations + 1, action: chosen.action, replacedFilterIndex: chosen.replacedFilterIndex,
      selectedFrequencyHz: chosen.filter.frequencyHz, gainDb: chosen.filter.gainDb, Q: chosen.filter.Q,
      oldGainDb: chosen.oldGainDb, newGainDb: chosen.newGainDb, gainDeltaDb: chosen.gainDeltaDb,
      oldQ: chosen.oldQ, newQ: chosen.newQ,
      candidateClassification: chosen.candidateClassification,
      localImprovementDb: chosen.localImprovementDb,
      maximumDeviationReductionDb: chosen.maximumDeviationReductionDb,
      rmsReductionDb: chosen.rmsReductionDb,
      acceptanceReason: chosen.acceptanceReason,
      maximumDeviationBeforeDb: currentMetrics.maximumAbsoluteDeviationDb,
      maximumDeviationAfterDb: checkpoint.maximumAbsoluteDeviationDb,
      rmsBeforeDb: currentMetrics.rmsDeviationDb, rmsAfterDb: checkpoint.rmsDeviationDb,
      rawMinimumSplBeforeDb: currentMinimumSpl, rawMinimumSplAfterDb: checkpoint.rawMinimumSpl,
      p14MinimumSplBeforeDb: currentP14MinimumSpl, p14MinimumSplAfterDb: checkpoint.p14MinimumSpl,
      minimumSplBeforeDb: currentP14MinimumSpl, minimumSplAfterDb: checkpoint.p14MinimumSpl,
      p14Safe: checkpoint.p14Safe, broadBelowTargetWorsening: checkpoint.broadBelowTargetWorsening,
      gainBeforeBankLimiting: chosen.gainBeforeBankLimiting, gainAfterBankLimiting: chosen.gainAfterBankLimiting,
      aggregateMaxBoostAfterDb: chosen.bankLimits?.maxAggregateBoostDb ?? 0,
      aggregateMaxBoostAfterHz: chosen.bankLimits?.maxAggregateBoostHz ?? null,
      aggregateMaxCutAfterDb: chosen.bankLimits?.maxAggregateCutDb ?? 0,
      aggregateMaxCutAfterHz: chosen.bankLimits?.maxAggregateCutHz ?? null,
    });
    operations++;
  }
  if (operations >= maxOperations && stopReason === "no safe improvement remained") stopReason = "operation ceiling reached";

  // Part C: Profile-aware checkpoint selection. Standard (preserveP14 === true)
  // preserves the existing P14-safe / 0.25 dB preservation-band path exactly.
  // Accuracy (preserveP14 === false) does not require p14Safe and does not
  // impose the 0.25 dB band; it selects from non-broad-worsening checkpoints
  // ranked by lowest max abs deviation, then RMS, then fewest filters. The
  // zero-filter checkpoint is used only if no credible Accuracy checkpoint
  // remains. P14 and P18 are still calculated and reported after selection.
  const baselineCheckpoint = checkpoints[0];
  const baselineP14MinimumSpl = baselineCheckpoint?.p14MinimumSpl;
  const nonBroadWorsening = checkpoints.filter((cp) => !cp.broadBelowTargetWorsening);
  const preserveP14 = profile.preserveP14 !== false;

  let selectedCheckpoint;
  let selectionReason = null;
  let safePathTaken = false;
  let accuracyPathTaken = false;

  if (preserveP14) {
    // Standard path — existing logic unchanged.
    const safeCheckpoints = nonBroadWorsening.filter((cp) => cp.p14Safe);
    const fallbackPool = nonBroadWorsening.length ? nonBroadWorsening : checkpoints;
    const preservationBand = Number.isFinite(baselineP14MinimumSpl)
      ? fallbackPool.filter((cp) => Number.isFinite(cp.p14MinimumSpl) && cp.p14MinimumSpl >= baselineP14MinimumSpl - 0.25)
      : fallbackPool;
    safePathTaken = safeCheckpoints.length > 0;
    if (safePathTaken) {
      const rawBestSafeCheckpoint = [...safeCheckpoints].sort((a, b) =>
        a.maximumAbsoluteDeviationDb - b.maximumAbsoluteDeviationDb
        || a.rmsDeviationDb - b.rmsDeviationDb
        || a.filters.length - b.filters.length)[0];
      const rankedSafe = [...safeCheckpoints].sort((a, b) =>
        a.capabilityAdjustedMaximumDeviationDb - b.capabilityAdjustedMaximumDeviationDb
        || a.maximumAbsoluteDeviationDb - b.maximumAbsoluteDeviationDb
        || a.rmsDeviationDb - b.rmsDeviationDb
        || a.filters.length - b.filters.length);
      selectedCheckpoint = rankedSafe[0];
      if (selectedCheckpoint !== rawBestSafeCheckpoint) capabilityPenaltyChangedSelectionCount++;
      if (collectDiagnostics) selectionReason = `P14-safe checkpoint selected: lowest maximum absolute deviation (${selectedCheckpoint.maximumAbsoluteDeviationDb.toFixed(2)} dB), then RMS (${selectedCheckpoint.rmsDeviationDb.toFixed(2)} dB), then fewest filters (${selectedCheckpoint.filters.length}).`;
    } else if (preservationBand.length) {
      const rawBestFallbackCheckpoint = [...preservationBand].sort((a, b) =>
        a.maximumAbsoluteDeviationDb - b.maximumAbsoluteDeviationDb
        || a.rmsDeviationDb - b.rmsDeviationDb
        || b.p14MinimumSpl - a.p14MinimumSpl
        || a.filters.length - b.filters.length)[0];
      const rankedFallback = [...preservationBand].sort((a, b) =>
        a.capabilityAdjustedMaximumDeviationDb - b.capabilityAdjustedMaximumDeviationDb
        || a.maximumAbsoluteDeviationDb - b.maximumAbsoluteDeviationDb
        || a.rmsDeviationDb - b.rmsDeviationDb
        || b.p14MinimumSpl - a.p14MinimumSpl
        || a.filters.length - b.filters.length);
      selectedCheckpoint = rankedFallback[0];
      if (selectedCheckpoint !== rawBestFallbackCheckpoint) capabilityPenaltyChangedSelectionCount++;
      if (collectDiagnostics) selectionReason = `Best credible calibrated attempt (P14 FAIL retained): selected for lowest maximum absolute deviation (${selectedCheckpoint.maximumAbsoluteDeviationDb.toFixed(2)} dB) and RMS (${selectedCheckpoint.rmsDeviationDb.toFixed(2)} dB) within the 0.25 dB preservation band of the zero-filter P14 minimum (${baselineP14MinimumSpl?.toFixed(2)} dB). Selected P14 minimum: ${selectedCheckpoint.p14MinimumSpl?.toFixed(2)} dB, ${selectedCheckpoint.filters.length} filters.`;
    } else {
      selectedCheckpoint = baselineCheckpoint;
      if (collectDiagnostics) selectionReason = `No checkpoint within 0.25 dB of zero-filter P14 minimum (${baselineP14MinimumSpl?.toFixed(2)} dB); returning zero-filter checkpoint to avoid worsening product capability. P14 FAIL retained.`;
    }
  } else {
    // Accuracy path — no P14 preservation, no 0.25 dB band.
    // broadBelowTargetWorsening is retained as diagnostic information only,
    // not a hard checkpoint exclusion. Every checkpoint with finite
    // maximum-deviation and RMS metrics is considered. The zero-filter
    // baseline is included but selected only if it genuinely wins.
    // This is safe because every accepted filter operation has already
    // passed complete-band max-deviation protection, RMS or max-deviation
    // improvement, local residual improvement, aggregate boost and cut
    // limits, product capability limits, and duplicate/same-region guards.
    accuracyPathTaken = true;
    const finiteCheckpoints = checkpoints.filter((cp) =>
      Number.isFinite(cp.maximumAbsoluteDeviationDb) && Number.isFinite(cp.rmsDeviationDb));
    if (finiteCheckpoints.length > 0) {
      const rawBestAccuracyCheckpoint = [...finiteCheckpoints].sort((a, b) =>
        a.maximumAbsoluteDeviationDb - b.maximumAbsoluteDeviationDb
        || a.rmsDeviationDb - b.rmsDeviationDb
        || a.filters.length - b.filters.length)[0];
      const rankedAccuracy = [...finiteCheckpoints].sort((a, b) =>
        a.capabilityAdjustedMaximumDeviationDb - b.capabilityAdjustedMaximumDeviationDb
        || a.maximumAbsoluteDeviationDb - b.maximumAbsoluteDeviationDb
        || a.rmsDeviationDb - b.rmsDeviationDb
        || a.filters.length - b.filters.length);
      selectedCheckpoint = rankedAccuracy[0];
      if (selectedCheckpoint !== rawBestAccuracyCheckpoint) capabilityPenaltyChangedSelectionCount++;
      if (collectDiagnostics) selectionReason = `Accuracy checkpoint selected (P14 preservation disabled): lowest maximum absolute deviation (${selectedCheckpoint.maximumAbsoluteDeviationDb.toFixed(2)} dB), then RMS (${selectedCheckpoint.rmsDeviationDb.toFixed(2)} dB), then fewest filters (${selectedCheckpoint.filters.length}). Broad-worsening diagnostic: ${selectedCheckpoint.broadBelowTargetWorsening ? "Yes" : "No"} (retained as diagnostic, not a hard exclusion). P14 minimum: ${selectedCheckpoint.p14MinimumSpl?.toFixed(2)} dB (may reduce — P14/P18 still reported).`;
    } else {
      selectedCheckpoint = baselineCheckpoint;
      if (collectDiagnostics) selectionReason = `No checkpoint with finite metrics; returning zero-filter checkpoint. P14 FAIL retained.`;
    }
  }

  // Part C: Checkpoint summaries for every generated checkpoint.
  const checkpointSummaries = collectDiagnostics ? checkpoints.map((checkpoint, index) => {
    const isSelected = checkpoint === selectedCheckpoint;
    let selectionEligibility;
    let reasonExcluded = null;
    if (isSelected) {
      selectionEligibility = "selected";
    } else if (accuracyPathTaken) {
      const hasFiniteMetrics = Number.isFinite(checkpoint.maximumAbsoluteDeviationDb) && Number.isFinite(checkpoint.rmsDeviationDb);
      if (!hasFiniteMetrics) {
        selectionEligibility = "non-finite-metrics";
        reasonExcluded = "Non-finite maximum-deviation or RMS — excluded from the Accuracy path.";
      } else {
        selectionEligibility = "accuracy-eligible";
        reasonExcluded = checkpoint.broadBelowTargetWorsening
          ? "Higher maximum absolute deviation, RMS, or filter count than the selected Accuracy checkpoint. (Broad-worsening diagnostic: Yes — retained as diagnostic, not a hard exclusion.)"
          : "Higher maximum absolute deviation, RMS, or filter count than the selected Accuracy checkpoint.";
      }
    } else if (safePathTaken) {
      if (checkpoint.p14Safe && !checkpoint.broadBelowTargetWorsening) {
        selectionEligibility = "safe";
        reasonExcluded = "Higher maximum absolute deviation, RMS, or filter count than the selected safe checkpoint.";
      } else if (!checkpoint.p14Safe) {
        selectionEligibility = "not-p14-safe";
        reasonExcluded = "P14 FAIL — not eligible for the safe path.";
      } else {
        selectionEligibility = "broad-worsening";
        reasonExcluded = "Broad below-target worsening — excluded from the safe path.";
      }
    } else {
      if (checkpoint.broadBelowTargetWorsening && nonBroadWorsening.length) {
        selectionEligibility = "excluded-broad-worsening";
        reasonExcluded = "Broad below-target worsening excluded from fallback (non-broad-worsening checkpoints available).";
      } else if (Number.isFinite(baselineP14MinimumSpl) && (!Number.isFinite(checkpoint.p14MinimumSpl) || checkpoint.p14MinimumSpl < baselineP14MinimumSpl - 0.25)) {
        selectionEligibility = "exceeded-preservation-band";
        reasonExcluded = `P14 minimum more than 0.25 dB below zero-filter baseline (${baselineP14MinimumSpl?.toFixed(2)} dB).`;
      } else if (checkpoint === baselineCheckpoint) {
        selectionEligibility = "zero-filter-baseline";
        reasonExcluded = "Zero-filter baseline — retained as ultimate fallback only if no checkpoint remains in the 0.25 dB band.";
      } else {
        selectionEligibility = "fallback-eligible";
        reasonExcluded = "Higher maximum absolute deviation, RMS, lower P14 minimum, or more filters than the selected fallback checkpoint.";
      }
    }
    return {
      index,
      enabledFilterCount: checkpoint.filters.length,
      p14MinimumSpl: checkpoint.p14MinimumSpl,
      p14Safe: checkpoint.p14Safe,
      maximumAbsoluteDeviationDb: checkpoint.maximumAbsoluteDeviationDb,
      rmsDeviationDb: checkpoint.rmsDeviationDb,
      worstResidualFrequencyHz: checkpoint.worstResidualFrequencyHz,
      broadBelowTargetWorsening: checkpoint.broadBelowTargetWorsening,
      capabilityPenaltyCostDb: checkpoint.capabilityPenaltyCostDb,
      selected: isSelected,
      selectionEligibility,
      reasonExcluded,
    };
  }) : [];

  const selectedFilters = selectedCheckpoint.filters;
  const filterBank = emptyFilters(selectedFilters);
  const combinedEqCurve = raw.map((point) => ({
    frequency: point.frequency,
    spl: selectedFilters.reduce((sum, filter) => sum + peakingEqResponseDb(point.frequency, filter), 0),
  }));
  curve = raw.map((point, index) => ({
    frequency: point.frequency,
    spl: point.spl + combinedEqCurve[index].spl,
  }));

  // Part D + E + F: Worst-residual capability diagnostics for the selected checkpoint.
  // Uses requested P19 tolerance for capability classification. Retains up to 8
  // distinct residual regions (1/12-octave separation) — diagnostic only.
  const requestedP19ToleranceDb = Number.isFinite(Number(options.targetToleranceDb)) ? Number(options.targetToleranceDb) : 0;
  const selectedTrend = selectedCheckpoint.trend;
  const sortedResidualPoints = (Array.isArray(selectedTrend) ? selectedTrend : [])
    .filter((point) => point.frequency >= assessmentStartHz && point.frequency <= assessmentEndHz)
    .map((point) => {
      const targetDb = anchorDb + artcousticHouseCurveOffsetAt(point.frequency);
      const signedResidualDb = point.spl - targetDb;
      return {
        frequency: point.frequency,
        targetDb,
        postEqSmoothedSpl: point.spl,
        signedResidualDb,
        absoluteResidualDb: Math.abs(signedResidualDb),
      };
    })
    .sort((a, b) => b.absoluteResidualDb - a.absoluteResidualDb);
  // Part F: Retain up to 8 distinct residual regions (1/12-octave separation)
  const distinctResidualPoints = [];
  for (const point of sortedResidualPoints) {
    const isDistinct = distinctResidualPoints.every((retained) =>
      Math.log2(Math.max(point.frequency, retained.frequency) / Math.min(point.frequency, retained.frequency)) > 1 / 12
    );
    if (isDistinct) distinctResidualPoints.push(point);
    if (distinctResidualPoints.length >= 8) break;
  }
  const worstResidualDiagnostics = collectDiagnostics ? distinctResidualPoints.map((point) => {
    const aggregateEqDb = aggregateResponseDbAt(point.frequency, selectedFilters);
    const allowance = getEqCapabilityBoostAllowance({
      frequency: point.frequency,
      requestedBoostDb: 6,
      activeSubs,
      usableLfHz,
      maxBoostDb: 6,
      requestedSystemOutputDb,
    });
    const sourceDomainAllowedBoostDb = Number.isFinite(allowance?.allowedBoostDb) ? allowance.allowedBoostDb : 6;
    const lfRampFraction = Number.isFinite(allowance?.lfRampFraction) ? allowance.lfRampFraction : 1;
    const remainingPointBoostDb = Math.max(0, Math.min(6, sourceDomainAllowedBoostDb) - Math.max(0, aggregateEqDb));
    const isBelowTarget = point.signedResidualDb < 0;
    const requiredBoostToTargetDb = isBelowTarget ? Math.abs(point.signedResidualDb) : 0;
    const requiredBoostToP19ToleranceDb = isBelowTarget ? Math.max(0, Math.abs(point.signedResidualDb) - requestedP19ToleranceDb) : 0;
    const fullTargetCapabilityLimited = isBelowTarget && requiredBoostToTargetDb > remainingPointBoostDb;
    const p19ToleranceCapabilityLimited = isBelowTarget && requiredBoostToP19ToleranceDb > remainingPointBoostDb;
    return {
      frequency: point.frequency,
      targetSpl: point.targetDb,
      postEqSmoothedSpl: point.postEqSmoothedSpl,
      signedResidualDb: point.signedResidualDb,
      absoluteResidualDb: point.absoluteResidualDb,
      aggregateEqContributionDb: aggregateEqDb,
      sourceDomainPermittedTotalBoostDb: sourceDomainAllowedBoostDb,
      remainingPointBoostDb,
      requiredBoostToTargetDb,
      requiredBoostToP19ToleranceDb,
      fullTargetCapabilityLimited,
      p19ToleranceCapabilityLimited,
      usableLfRampFraction: lfRampFraction,
    };
  }) : [];

  const finalBankLimits = evaluateProvisionalBankLimits(selectedFilters, raw, activeSubs, usableLfHz, options.requestedSystemOutputDb, profile);
  const sameRegionFilterCount = maxSameRegionFilterCount(selectedFilters);

  return {
    curve,
    filters: filterBank,
    combinedEqCurve,
    fitterHouseCurveTarget: canonicalTargetCurve.length
      ? canonicalTargetCurve.map((point) => ({ ...point }))
      : sortedResidualPoints.map(({ frequency, targetDb }) => ({ frequency, spl: targetDb })).sort((a, b) => a.frequency - b.frequency),
    iterationTrace,
    stopReason,
    // Part D: Effective profile contract — identifies the selected profile and
    // its configuration so callers can distinguish it from the requested P19
    // tolerance. Requested P19 tolerance is separate from the profile fitting
    // tolerance.
    designEqFitProfile: profile.id,
    designEqFitProfileConfig: {
      preserveP14: profile.preserveP14,
      fittingToleranceDb,
      maximumCutDb: profile.maximumCutDb,
      maximumAggregateBoostDb: profile.maximumAggregateBoostDb,
      peakDiscoveryThresholdDb: profile.peakDiscoveryThresholdDb,
      valleyDiscoveryThresholdDb: profile.valleyDiscoveryThresholdDb,
    },
    requestedP19ToleranceDb,
    selectedCheckpoint: {
      enabledFilterCount: selectedFilters.length,
      maximumAbsoluteDeviationDb: selectedCheckpoint.maximumAbsoluteDeviationDb,
      rmsDeviationDb: selectedCheckpoint.rmsDeviationDb,
      worstResidualFrequencyHz: selectedCheckpoint.worstResidualFrequencyHz,
      rawMinimumSpl: selectedCheckpoint.rawMinimumSpl,
      p14MinimumSpl: selectedCheckpoint.p14MinimumSpl,
      minimumSpl: selectedCheckpoint.p14MinimumSpl,
      p14Safe: selectedCheckpoint.p14Safe,
      broadBelowTargetWorsening: selectedCheckpoint.broadBelowTargetWorsening,
    },
    checkpointSummaries,
    candidateAcceptanceDiagnostics,
    worstResidualDiagnostics,
    selectionReason,
    lfCapabilityProtection: buildLfCapabilityProtectionDiagnostics(
      capabilityContext,
      capabilityPenaltyForBank(selectedFilters),
      {
        penaltyInfluencedSelectedFilters: capabilityPenaltyRejectedCount > 0 || capabilityPenaltyChangedSelectionCount > 0,
        candidatesRejectedByPenalty: capabilityPenaltyRejectedCount,
        selectionsChangedByPenalty: capabilityPenaltyChangedSelectionCount,
      },
    ),
    bankDiagnostics: {
      evaluatedVariantsScaledByBankLimit: bankLimitScaledCount,
      evaluatedVariantsRejectedByBankLimit: bankLimitRejectedCount,
      evaluatedVariantsRejectedAsNearDuplicates: nearDuplicateRejectedCount,
      evaluatedVariantsRejectedBySameRegionGuard: sameRegionRejectedCount,
      completedBankEvaluationCount: __bankEvaluationCounter,
      selectedBankLimits: {
        maxAggregateBoostDb: finalBankLimits.maxAggregateBoostDb,
        maxAggregateBoostHz: finalBankLimits.maxAggregateBoostHz,
        maxAggregateCutDb: finalBankLimits.maxAggregateCutDb,
        maxAggregateCutHz: finalBankLimits.maxAggregateCutHz,
        limitingPermittedBoostDb: finalBankLimits.limitingPermittedBoostDb,
        boostLimitOk: finalBankLimits.boostLimitOk,
        cutLimitOk: finalBankLimits.cutLimitOk,
        sourceDomainHeadroomOk: finalBankLimits.sourceDomainHeadroomOk,
        allOk: finalBankLimits.allOk,
        sameRegionFilterCount,
      },
    },
    revisionDiagnostics: {
      revisionAttemptCount,
      revisionPassedAcceptanceCount,
      selectedRevisionOperationCount,
      attempts: revisionAttempts,
    },
    diagnostics: collectDiagnostics ? curve.map((point, index) => ({
      frequency: point.frequency,
      targetDb: anchorDb + artcousticHouseCurveOffsetAt(point.frequency),
      trendDb: interpolate(thirdOctave, point.frequency),
      appliedCorrectionDb: combinedEqCurve[index].spl,
    })) : [],
  };
}

export function applyDesignEqCurve(curveData, usableLfHz, activeSubs = []) {
  return calculateDesignEqCurve(curveData, usableLfHz, activeSubs).curve;
}

// Shared utilities for the seat-aware house-curve fitter (houseCurveFitter.js).
export {
  normaliseCurve,
  findRegions,
  qForRegion,
  limitBoostForCapability,
  evaluateProvisionalBankLimits,
  scaleCandidateForBankLimits,
  isNearDuplicate,
  countSameSignFiltersInRegion,
  buildCurveFromBank,
  emptyFilters,
};