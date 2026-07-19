import { applyBassSmoothing } from "@/components/room/bass/bassGraphSmoothing";
import { getSourceDomainBoostAllowance } from "@/components/utils/subwooferCapability";
import { artcousticHouseCurveOffsetAt } from "@/components/utils/artcousticHouseCurve";

const isNumber = (value) => Number.isFinite(Number(value));
const DESIGN_EQ_SAMPLE_RATE = 48000;

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

function createsBroadBelowTargetWorsening(beforeTrend, afterMetrics, anchorDb, targetToleranceDb) {
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
      && point.deviationDb < -targetToleranceDb
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
  const targetToleranceDb = Number.isFinite(Number(options.targetToleranceDb)) ? Number(options.targetToleranceDb) : 0;
  const filters = [];
  let curve = raw;

  // Fit one broad residual at a time. Each pass re-smooths the cumulative curve,
  // allowing a severe modal peak to receive a complementary filter when its first
  // wide correction leaves a physically meaningful residual.
  while (filters.length < 10) {
    const trend = applyBassSmoothing(curve, "third");
    const trendPoints = trend
      .filter((point) => point.frequency >= assessmentStartHz && point.frequency <= assessmentEndHz)
      .map((point) => ({ ...point, deviationDb: deviationAt(trend, point.frequency, anchorDb) }));
    const peakDiscoveryThresholdDb = Math.max(1, Math.min(3, targetToleranceDb));
    const regions = [
      ...findRegions(trendPoints, "peak", peakDiscoveryThresholdDb),
      ...findRegions(trendPoints, "valley"),
    ].sort((a, b) => b.severityDb - a.severityDb);
    if (!regions.length || regions[0].severityDb <= targetToleranceDb) break;

    const currentMetrics = completeBandResidualMetrics(trend, assessmentStartHz, assessmentEndHz, anchorDb);
    if (!currentMetrics) break;

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

      const seenVariants = new Set();
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

          const nextCurve = curve.map((point) => ({ ...point, spl: point.spl + peakingEqResponseDb(point.frequency, candidate) }));
          const nextTrend = applyBassSmoothing(nextCurve, "third");
          const nextMetrics = completeBandResidualMetrics(nextTrend, assessmentStartHz, assessmentEndHz, anchorDb);
          if (!nextMetrics) continue;

          const before = Math.abs(region.centrePoint.deviationDb);
          const after = Math.abs(deviationAt(nextTrend, region.centrePoint.frequency, anchorDb));
          const localImprovementDb = before - after;
          const maximumDeviationReductionDb = currentMetrics.maximumAbsoluteDeviationDb - nextMetrics.maximumAbsoluteDeviationDb;
          const rmsReductionDb = currentMetrics.rmsDeviationDb - nextMetrics.rmsDeviationDb;
          const createsWorseBelowTargetResidual = createsBroadBelowTargetWorsening(
            trend,
            nextMetrics,
            anchorDb,
            targetToleranceDb,
          );
          const acceptable = localImprovementDb >= 0.05
            && nextMetrics.maximumAbsoluteDeviationDb <= currentMetrics.maximumAbsoluteDeviationDb + 0.05
            && (maximumDeviationReductionDb >= 0.10 || rmsReductionDb >= 0.10)
            && !createsWorseBelowTargetResidual;
          if (acceptable) acceptableCandidates.push({
            filter: candidate,
            curve: nextCurve,
            maximumDeviationReductionDb,
            rmsReductionDb,
            localImprovementDb,
          });
        }
      }
    }

    acceptableCandidates.sort((a, b) =>
      b.maximumDeviationReductionDb - a.maximumDeviationReductionDb
      || b.rmsReductionDb - a.rmsReductionDb
      || b.localImprovementDb - a.localImprovementDb
      || Math.abs(a.filter.gainDb) - Math.abs(b.filter.gainDb)
      || a.filter.Q - b.filter.Q);
    const chosen = acceptableCandidates[0];
    if (!chosen) break;
    filters.push(chosen.filter);
    curve = chosen.curve;
  }

  const filterBank = emptyFilters(filters);
  const combinedEqCurve = raw.map((point) => ({
    frequency: point.frequency,
    spl: filters.reduce((sum, filter) => sum + peakingEqResponseDb(point.frequency, filter), 0),
  }));
  curve = raw.map((point, index) => ({
    frequency: point.frequency,
    spl: point.spl + combinedEqCurve[index].spl,
  }));

  return {
    curve,
    filters: filterBank,
    combinedEqCurve,
    diagnostics: curve.map((point, index) => ({
      frequency: point.frequency,
      targetDb: anchorDb + artcousticHouseCurveOffsetAt(point.frequency),
      trendDb: interpolate(thirdOctave, point.frequency),
      appliedCorrectionDb: combinedEqCurve[index].spl,
    })),
  };
}

export function applyDesignEqCurve(curveData, usableLfHz, activeSubs = []) {
  return calculateDesignEqCurve(curveData, usableLfHz, activeSubs).curve;
}