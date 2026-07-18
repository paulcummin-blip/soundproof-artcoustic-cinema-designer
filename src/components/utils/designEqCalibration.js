import { applyBassSmoothing } from "@/components/room/bass/bassGraphSmoothing";
import { getSourceDomainBoostAllowance } from "@/components/utils/subwooferCapability";

const HOUSE_CURVE = [
  [15, 6], [30, 6], [40, 5], [50, 4], [63, 3], [80, 2.5],
  [100, 2], [120, 1.5], [150, 1.2], [200, 0.8], [400, 0],
];

const isNumber = (value) => Number.isFinite(Number(value));

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

function houseCurveOffset(frequency) {
  if (frequency <= HOUSE_CURVE[0][0]) return HOUSE_CURVE[0][1];
  for (let index = 1; index < HOUSE_CURVE.length; index += 1) {
    const [highFrequency, highOffset] = HOUSE_CURVE[index];
    const [lowFrequency, lowOffset] = HOUSE_CURVE[index - 1];
    if (frequency <= highFrequency) {
      const ratio = (frequency - lowFrequency) / (highFrequency - lowFrequency);
      return lowOffset + (highOffset - lowOffset) * ratio;
    }
  }
  return 0;
}

function median(values) {
  const sorted = values.filter(isNumber).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function deviationAt(curve, frequency, anchorDb) {
  const spl = interpolate(curve, frequency);
  return isNumber(spl) ? spl - (anchorDb + houseCurveOffset(frequency)) : null;
}

function octaveWidth(startHz, endHz) {
  return startHz > 0 && endHz > startHz ? Math.log2(endHz / startHz) : 0;
}

function findRegions(points, kind) {
  const threshold = kind === "peak" ? 3 : -2;
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

function bellResponseDb(frequencyHz, filter) {
  if (!filter.enabled || !isNumber(frequencyHz) || frequencyHz <= 0) return 0;
  const halfWidth = Math.max(filter.widthOctaves / 2, 0.05);
  const distance = Math.log2(frequencyHz / filter.frequencyHz) / halfWidth;
  return filter.gainDb * Math.exp(-0.5 * distance * distance);
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
  const trendPoints = thirdOctave
    .filter((point) => point.frequency >= assessmentStartHz && point.frequency <= assessmentEndHz)
    .map((point) => ({ ...point, deviationDb: deviationAt(thirdOctave, point.frequency, anchorDb) }));
  const peakRegions = findRegions(trendPoints, "peak").sort((a, b) => b.severityDb - a.severityDb);
  const valleyRegions = findRegions(trendPoints, "valley").sort((a, b) => b.severityDb - a.severityDb);
  // Remove the dominant broad excess first. A single filter is limited to -10 dB,
  // so a severe, broad peak can use two overlapping smooth bells before any valley fill.
  const regions = [peakRegions[0], ...valleyRegions, ...peakRegions.slice(1)].filter(Boolean);
  const filters = [];
  for (const region of regions) {
    if (filters.length >= 10) break;
    const isPeak = region.kind === "peak";
    const totalGainDb = isPeak
      ? -Math.min(20, region.severityDb * 0.9)
      : Math.min(6, region.severityDb * 0.75);
    const passes = isPeak ? Math.min(2, Math.ceil(Math.abs(totalGainDb) / 10)) : 1;
    for (let pass = 0; pass < passes && filters.length < 10; pass += 1) {
      const filter = {
        band: filters.length + 1,
        enabled: true,
        type: "Peak",
        frequencyHz: region.centrePoint.frequency,
        gainDb: totalGainDb / passes,
        Q: qForRegion(region),
        startHz: region.startHz,
        endHz: region.endHz,
        widthOctaves: region.widthOctaves,
        reason: isPeak
          ? `Broad peak reduction ${pass + 1}/${passes} above Artcoustic target`
          : "Broad valley below Artcoustic target",
      };
      const constrained = limitBoostForCapability(filter, activeSubs, usableLfHz, options.requestedSystemOutputDb);
      if (constrained.gainDb < -0.1 || constrained.gainDb > 0.1) filters.push(constrained);
    }
  }
  const filterBank = emptyFilters(filters);
  const combinedEqCurve = raw.map((point) => ({
    frequency: point.frequency,
    spl: filters.reduce((sum, filter) => sum + bellResponseDb(point.frequency, filter), 0),
  }));
  const curve = raw.map((point, index) => ({
    frequency: point.frequency,
    spl: point.spl + combinedEqCurve[index].spl,
  }));

  return {
    curve,
    filters: filterBank,
    combinedEqCurve,
    diagnostics: curve.map((point, index) => ({
      frequency: point.frequency,
      targetDb: anchorDb + houseCurveOffset(point.frequency),
      trendDb: interpolate(thirdOctave, point.frequency),
      appliedCorrectionDb: combinedEqCurve[index].spl,
    })),
  };
}

export function applyDesignEqCurve(curveData, usableLfHz, activeSubs = []) {
  return calculateDesignEqCurve(curveData, usableLfHz, activeSubs).curve;
}