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

function broadRegionConfidence(octaveSpl, thirdOctaveSpl) {
  if (!isNumber(octaveSpl) || !isNumber(thirdOctaveSpl)) return 0;
  // A feature that changes materially between 1/3 and one octave is too local
  // for a client-facing correction filter; retain it as room character instead.
  return Math.max(0, Math.min(1, 1 - Math.abs(octaveSpl - thirdOctaveSpl) / 5));
}

export function calculateDesignEqCurve(curveData, usableLfHz, activeSubs = []) {
  const raw = normaliseCurve(curveData);
  if (!raw.length) return { curve: curveData || [], diagnostics: [] };

  const thirdOctave = applyBassSmoothing(raw, "third");
  const octaveTrend = applyBassSmoothing(raw, "octave");
  const referenceBand = octaveTrend.filter((point) => point.frequency >= 150 && point.frequency <= 200);
  const anchorDb = median((referenceBand.length ? referenceBand : octaveTrend).map((point) => point.spl));
  if (!isNumber(anchorDb)) return { curve: raw, diagnostics: [] };

  const curve = raw.map((point) => {
    const trendDb = interpolate(octaveTrend, point.frequency) ?? point.spl;
    const thirdOctaveDb = interpolate(thirdOctave, point.frequency);
    const targetDb = anchorDb + houseCurveOffset(point.frequency);
    const deviationDb = trendDb - targetDb;
    const broadness = broadRegionConfidence(trendDb, thirdOctaveDb);
    const excessDb = Math.max(0, Math.abs(deviationDb) - 2);

    // ARC/Dirac-style policy: leave a ±2 dB broad window untouched, partially
    // shape only octave-scale trends, and deliberately retain local cancellations.
    const cutDb = deviationDb > 2 ? -Math.min(6, excessDb * 0.65) * broadness : 0;
    const requestedBoostDb = deviationDb < -2
      ? Math.min(2.5, excessDb * 0.45) * broadness
      : 0;
    const allowance = getSourceDomainBoostAllowance({
      frequency: point.frequency,
      requestedBoostDb,
      activeSubs,
      usableLfHz,
      maxBoostDb: 2.5,
    });
    const appliedBoostDb = allowance.allowedBoostDb;
    const appliedCorrectionDb = cutDb + appliedBoostDb;

    return {
      frequency: point.frequency,
      spl: point.spl + appliedCorrectionDb,
      diagnostic: {
        targetDb,
        trendDb,
        thirdOctaveDb,
        deviationDb,
        broadness,
        requestedBoostDb,
        appliedBoostDb,
        appliedCutDb: cutDb,
        appliedCorrectionDb,
        allowance,
      },
    };
  });

  return {
    curve: curve.map(({ frequency, spl }) => ({ frequency, spl })),
    diagnostics: curve.map(({ frequency, diagnostic }) => ({ frequency, ...diagnostic })),
  };
}

export function applyDesignEqCurve(curveData, usableLfHz, activeSubs = []) {
  return calculateDesignEqCurve(curveData, usableLfHz, activeSubs).curve;
}