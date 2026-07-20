import { applyBassSmoothing } from "@/components/room/bass/bassGraphSmoothing";
import { getSourceDomainBoostAllowance } from "@/components/utils/subwooferCapability";
import { artcousticHouseCurveOffsetAt } from "@/components/utils/artcousticHouseCurve";

const isNumber = (value) => Number.isFinite(Number(value));
const DESIGN_EQ_SAMPLE_RATE = 48000;
let __bankEvaluationCounter = 0;

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

function findRegions(points, kind, peakThresholdDb = 3) {
  const threshold = kind === "peak" ? peakThresholdDb : -2;
  const matches = (point) => kind === "peak" ? point.deviationDb >= threshold : point.deviationDb <= threshold;
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
  const frequencies = [filter.startHz, (filter.startHz + filter.frequencyHz) / 2, filter.frequencyHz, (filter.frequencyHz + filter.endHz) / 2, filter.endHz];
  const allowed = frequencies.map((frequency) => getSourceDomainBoostAllowance({
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

// Evaluate the completed provisional bank across all raw-curve frequencies (20–200 Hz).
// Checks: aggregate boost ≤ +6.05 dB, aggregate boost ≤ source-domain headroom + 0.05 dB,
// and aggregate cut ≥ −10.05 dB. These limits apply to the completed bank, not per filter.
function evaluateProvisionalBankLimits(filters, raw, activeSubs, usableLfHz, requestedSystemOutputDb) {
  __bankEvaluationCounter++;
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
    if (aggregateDb > 6.05) boostLimitOk = false;
    if (aggregateDb < -10.05) cutLimitOk = false;
    if (aggregateDb > 0) {
      const allowed = getSourceDomainBoostAllowance({ frequency: point.frequency, requestedBoostDb: 6, activeSubs, usableLfHz, maxBoostDb: 6, requestedSystemOutputDb });
      const permitted = Number.isFinite(allowed?.allowedBoostDb) ? allowed.allowedBoostDb : 6;
      if (aggregateDb > permitted + 0.05) sourceDomainHeadroomOk = false;
    }
  }
  if (maxAggregateBoostHz !== null && maxAggregateBoostDb > 0) {
    const allowed = getSourceDomainBoostAllowance({ frequency: maxAggregateBoostHz, requestedBoostDb: 6, activeSubs, usableLfHz, maxBoostDb: 6, requestedSystemOutputDb });
    limitingPermittedBoostDb = Number.isFinite(allowed?.allowedBoostDb) ? allowed.allowedBoostDb : 6;
  }
  return { maxAggregateBoostDb, maxAggregateBoostHz, maxAggregateCutDb, maxAggregateCutHz, limitingPermittedBoostDb, boostLimitOk, cutLimitOk, sourceDomainHeadroomOk, allOk: boostLimitOk && cutLimitOk && sourceDomainHeadroomOk };
}

// Scale a candidate's gain via binary search so the completed bank (existing + candidate)
// satisfies all aggregate limits. Returns null filter if the scaled gain is ≤ 0.1 dB.
function scaleCandidateForBankLimits(candidate, existingFilters, raw, activeSubs, usableLfHz, requestedSystemOutputDb) {
  const proposedGainDb = candidate.gainDb;
  const initial = evaluateProvisionalBankLimits([...existingFilters, candidate], raw, activeSubs, usableLfHz, requestedSystemOutputDb);
  if (initial.allOk) return { filter: candidate, scaled: false, limits: initial };
  const isBoost = proposedGainDb > 0;
  let lo = 0;
  let hi = Math.abs(proposedGainDb);
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    const scaledGain = isBoost ? mid : -mid;
    const scaledLimits = evaluateProvisionalBankLimits([...existingFilters, { ...candidate, gainDb: scaledGain }], raw, activeSubs, usableLfHz, requestedSystemOutputDb);
    if (scaledLimits.allOk) lo = mid; else hi = mid;
  }
  const scaledGainDb = isBoost ? lo : -lo;
  if (Math.abs(scaledGainDb) <= 0.1) return { filter: null, scaled: true, limits: initial };
  const scaledFilter = { ...candidate, gainDb: scaledGainDb };
  const scaledLimits = evaluateProvisionalBankLimits([...existingFilters, scaledFilter], raw, activeSubs, usableLfHz, requestedSystemOutputDb);
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

// Part A: Scale a revision's gain delta via binary search so the completed bank
// (with the revised filter replacing the existing one) satisfies all aggregate
// limits. The existing gain is the known-safe lower bound; the proposed revised
// gain is the upper bound. Returns null filter if the accepted delta is ≤ 0.1 dB.
function scaleRevisionForBankLimits(existingFilter, proposedGainDelta, filterIndex, existingFilters, raw, activeSubs, usableLfHz, requestedSystemOutputDb) {
  const proposedGain = existingFilter.gainDb + proposedGainDelta;
  const clampedGain = existingFilter.gainDb > 0
    ? Math.min(6, proposedGain)
    : Math.max(-10, proposedGain);
  const clampedDelta = clampedGain - existingFilter.gainDb;
  if (Math.abs(clampedDelta) <= 0.1) return { filter: null, scaled: false, limits: null, acceptedDelta: 0 };
  const revisedFilter = { ...existingFilter, gainDb: clampedGain };
  const provisionalFilters = existingFilters.map((f, i) => i === filterIndex ? revisedFilter : f);
  const initial = evaluateProvisionalBankLimits(provisionalFilters, raw, activeSubs, usableLfHz, requestedSystemOutputDb);
  if (initial.allOk) return { filter: revisedFilter, scaled: false, limits: initial, acceptedDelta: clampedDelta };
  const isBoost = clampedDelta > 0;
  let lo = 0;
  let hi = Math.abs(clampedDelta);
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    const scaledDelta = isBoost ? mid : -mid;
    const scaledFilter = { ...existingFilter, gainDb: existingFilter.gainDb + scaledDelta };
    const scaledFilters = existingFilters.map((f, i) => i === filterIndex ? scaledFilter : f);
    const scaledLimits = evaluateProvisionalBankLimits(scaledFilters, raw, activeSubs, usableLfHz, requestedSystemOutputDb);
    if (scaledLimits.allOk) lo = mid; else hi = mid;
  }
  const acceptedDelta = isBoost ? lo : -lo;
  if (Math.abs(acceptedDelta) <= 0.1) return { filter: null, scaled: true, limits: initial, acceptedDelta: 0 };
  const acceptedFilter = { ...existingFilter, gainDb: existingFilter.gainDb + acceptedDelta };
  const acceptedFilters = existingFilters.map((f, i) => i === filterIndex ? acceptedFilter : f);
  const acceptedLimits = evaluateProvisionalBankLimits(acceptedFilters, raw, activeSubs, usableLfHz, requestedSystemOutputDb);
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

function buildCheckpoint({ filters, curve, originalTrend, assessmentStartHz, assessmentEndHz, anchorDb, fittingToleranceDb, requestedSystemOutputDb }) {
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
  };
}

export function calculateDesignEqCurve(curveData, usableLfHz, activeSubs = [], options = {}) {
  const raw = normaliseCurve(curveData);
  if (!raw.length) return { curve: curveData || [], diagnostics: [], filters: emptyFilters([]), combinedEqCurve: [] };

  const thirdOctave = applyBassSmoothing(raw, "third");
  const referenceBand = thirdOctave.filter((point) => point.frequency >= 150 && point.frequency <= 200);
  const rawAnchorDb = median((referenceBand.length ? referenceBand : thirdOctave).map((point) => point.spl));
  const anchorDb = isNumber(options.targetAnchorDb) ? Number(options.targetAnchorDb) : rawAnchorDb;
  if (!isNumber(anchorDb)) return { curve: raw, diagnostics: [], filters: emptyFilters([]), combinedEqCurve: [] };

  const assessmentStartHz = Number.isFinite(Number(options.assessmentStartHz)) ? Number(options.assessmentStartHz) : 20;
  const assessmentEndHz = Number.isFinite(Number(options.assessmentEndHz)) ? Number(options.assessmentEndHz) : 200;
  const requestedFittingToleranceDb = Number.isFinite(Number(options.fittingToleranceDb))
    ? Number(options.fittingToleranceDb)
    : 2;
  const fittingToleranceDb = Math.max(1, Math.min(5, requestedFittingToleranceDb));
  const requestedSystemOutputDb = Number(options.requestedSystemOutputDb);
  const collectDiagnostics = options.collectDiagnostics !== false;
  __bankEvaluationCounter = 0;
  const filters = [];
  let curve = raw;
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
  })];
  const iterationTrace = [];
  let bankLimitScaledCount = 0;
  let bankLimitRejectedCount = 0;
  let nearDuplicateRejectedCount = 0;
  let sameRegionRejectedCount = 0;
  let revisionAttemptCount = 0;
  let revisionPassedAcceptanceCount = 0;
  let selectedRevisionOperationCount = 0;
  const revisionAttempts = [];
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

    const peakDiscoveryThresholdDb = Math.max(1, Math.min(3, fittingToleranceDb));
    const regions = [
      ...findRegions(trendPoints, "peak", peakDiscoveryThresholdDb),
      ...findRegions(trendPoints, "valley"),
    ].sort((a, b) => b.severityDb - a.severityDb);
    if (!regions.length) break;

    const currentMinimumSpl = minimumSplAcrossBand(curve, assessmentStartHz, assessmentEndHz);
    const currentP14MinimumSpl = minimumSplAcrossBand(trend, assessmentStartHz, assessmentEndHz);
    if (!Number.isFinite(currentMinimumSpl)) break;
    const acceptableCandidates = [];
    const gainScales = [1, 0.75, 0.5];
    const qMultipliers = [1, 1.5, 2, 3];
    for (const region of regions) {
      const isPeak = region.kind === "peak";
      const requestedGainDb = isPeak
        ? -Math.min(10, region.severityDb * 0.85)
        : Math.min(6, region.severityDb * 0.75);
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
          const bankResult = scaleCandidateForBankLimits(candidate, filters, raw, activeSubs, usableLfHz, options.requestedSystemOutputDb);
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
          const acceptable = localImprovementDb >= 0.05
            && nextMetrics.maximumAbsoluteDeviationDb <= currentMetrics.maximumAbsoluteDeviationDb + 0.05
            && (maximumDeviationReductionDb >= 0.10 || rmsReductionDb >= 0.10);
          if (acceptable) regionAppendCandidates.push({
            action: "append", filter: finalCandidate, replacedFilterIndex: null,
            oldGainDb: null, newGainDb: finalCandidate.gainDb, gainDeltaDb: finalCandidate.gainDb,
            oldQ: null, newQ: finalCandidate.Q, curve: nextCurve,
            maximumDeviationReductionDb, rmsReductionDb, localImprovementDb,
            gainBeforeBankLimiting, gainAfterBankLimiting, bankLimits: bankResult.limits,
            regionSameSignCount,
          });
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
              const revisionResult = scaleRevisionForBankLimits(existingFilter, proposedGainDelta, filterIndex, filters, raw, activeSubs, usableLfHz, options.requestedSystemOutputDb);
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
              const acceptable = localImprovementDb >= 0.05
                && revisedMetrics.maximumAbsoluteDeviationDb <= currentMetrics.maximumAbsoluteDeviationDb + 0.05
                && (maximumDeviationReductionDb >= 0.10 || rmsReductionDb >= 0.10);
              attempt.passedRules = acceptable;
              if (!acceptable) attempt.rejectionReason = "Did not meet complete-band acceptance rules";
              if (collectDiagnostics) revisionAttempts.push(attempt);
              if (acceptable) {
                revisionPassedAcceptanceCount++;
                acceptableCandidates.push({
                  action: "revise", filter: revisedFilter, replacedFilterIndex: filterIndex,
                  oldGainDb: existingFilter.gainDb, newGainDb: revisedFilter.gainDb,
                  gainDeltaDb: revisedFilter.gainDb - existingFilter.gainDb,
                  oldQ: existingFilter.Q, newQ: existingFilter.Q, curve: revisedCurve,
                  maximumDeviationReductionDb, rmsReductionDb, localImprovementDb,
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
    acceptableCandidates.sort((a, b) => {
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
    });
    checkpoints.push(checkpoint);
    if (collectDiagnostics) iterationTrace.push({
      iteration: operations + 1, action: chosen.action, replacedFilterIndex: chosen.replacedFilterIndex,
      selectedFrequencyHz: chosen.filter.frequencyHz, gainDb: chosen.filter.gainDb, Q: chosen.filter.Q,
      oldGainDb: chosen.oldGainDb, newGainDb: chosen.newGainDb, gainDeltaDb: chosen.gainDeltaDb,
      oldQ: chosen.oldQ, newQ: chosen.newQ,
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

  // Part A: Safe-checkpoint path — preserve existing ranking when one or more
  // checkpoints satisfy p14Safe && !broadBelowTargetWorsening.
  const safeCheckpoints = checkpoints.filter((checkpoint) => checkpoint.p14Safe && !checkpoint.broadBelowTargetWorsening);
  const baselineCheckpoint = checkpoints[0];
  const baselineP14MinimumSpl = baselineCheckpoint?.p14MinimumSpl;
  const nonBroadWorsening = checkpoints.filter((cp) => !cp.broadBelowTargetWorsening);
  const fallbackPool = nonBroadWorsening.length ? nonBroadWorsening : checkpoints;
  const preservationBand = Number.isFinite(baselineP14MinimumSpl)
    ? fallbackPool.filter((cp) => Number.isFinite(cp.p14MinimumSpl) && cp.p14MinimumSpl >= baselineP14MinimumSpl - 0.25)
    : fallbackPool;
  const safePathTaken = safeCheckpoints.length > 0;

  let selectedCheckpoint;
  let selectionReason = null;
  if (safePathTaken) {
    const rankedSafe = [...safeCheckpoints].sort((a, b) =>
      a.maximumAbsoluteDeviationDb - b.maximumAbsoluteDeviationDb
      || a.rmsDeviationDb - b.rmsDeviationDb
      || a.filters.length - b.filters.length);
    selectedCheckpoint = rankedSafe[0];
    if (collectDiagnostics) selectionReason = `P14-safe checkpoint selected: lowest maximum absolute deviation (${selectedCheckpoint.maximumAbsoluteDeviationDb.toFixed(2)} dB), then RMS (${selectedCheckpoint.rmsDeviationDb.toFixed(2)} dB), then fewest filters (${selectedCheckpoint.filters.length}).`;
  } else if (preservationBand.length) {
    const rankedFallback = [...preservationBand].sort((a, b) =>
      a.maximumAbsoluteDeviationDb - b.maximumAbsoluteDeviationDb
      || a.rmsDeviationDb - b.rmsDeviationDb
      || b.p14MinimumSpl - a.p14MinimumSpl
      || a.filters.length - b.filters.length);
    selectedCheckpoint = rankedFallback[0];
    if (collectDiagnostics) selectionReason = `Best credible calibrated attempt (P14 FAIL retained): selected for lowest maximum absolute deviation (${selectedCheckpoint.maximumAbsoluteDeviationDb.toFixed(2)} dB) and RMS (${selectedCheckpoint.rmsDeviationDb.toFixed(2)} dB) within the 0.25 dB preservation band of the zero-filter P14 minimum (${baselineP14MinimumSpl?.toFixed(2)} dB). Selected P14 minimum: ${selectedCheckpoint.p14MinimumSpl?.toFixed(2)} dB, ${selectedCheckpoint.filters.length} filters.`;
  } else {
    selectedCheckpoint = baselineCheckpoint;
    if (collectDiagnostics) selectionReason = `No checkpoint within 0.25 dB of zero-filter P14 minimum (${baselineP14MinimumSpl?.toFixed(2)} dB); returning zero-filter checkpoint to avoid worsening product capability. P14 FAIL retained.`;
  }

  // Part C: Checkpoint summaries for every generated checkpoint.
  const checkpointSummaries = collectDiagnostics ? checkpoints.map((checkpoint, index) => {
    const isSelected = checkpoint === selectedCheckpoint;
    let selectionEligibility;
    let reasonExcluded = null;
    if (isSelected) {
      selectionEligibility = "selected";
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
    const allowance = getSourceDomainBoostAllowance({
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

  const finalBankLimits = evaluateProvisionalBankLimits(selectedFilters, raw, activeSubs, usableLfHz, options.requestedSystemOutputDb);
  const sameRegionFilterCount = maxSameRegionFilterCount(selectedFilters);

  return {
    curve,
    filters: filterBank,
    combinedEqCurve,
    iterationTrace,
    stopReason,
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
    worstResidualDiagnostics,
    selectionReason,
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