// src/components/utils/rp22/slidingOctaveEngine.jsx
// RP22 P17 MEASURED ENGINE — Stage 1 scaffolding.
// Reusable sliding one-octave consistency analysis utility.
//
// Compares a "seat" predicted response curve against a "reference" (RSP) predicted response
// curve across the 500 Hz – 16 kHz band, using a sliding one-octave window so isolated narrow
// frequency points never dominate the result. Returns the maximum SUSTAINED deviation and the
// frequency range in which it occurred (e.g. "3.2 dB, occurred 2.8–5.6 kHz").

const BAND_LOW_HZ = 500;
const BAND_HIGH_HZ = 16000;

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

// Linear interpolation lookup of a {frequency, spl} curve at an arbitrary frequency.
function interpAtFrequency(curve, freq) {
  if (!Array.isArray(curve) || !curve.length) return null;
  const sorted = [...curve].sort((a, b) => a.frequency - b.frequency);
  if (freq <= sorted[0].frequency) return sorted[0].spl;
  if (freq >= sorted[sorted.length - 1].frequency) return sorted[sorted.length - 1].spl;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (freq >= a.frequency && freq <= b.frequency) {
      const t = (freq - a.frequency) / (b.frequency - a.frequency);
      return a.spl + (b.spl - a.spl) * t;
    }
  }
  return null;
}

// Generates log-spaced test frequencies across the RP22 P17 analysis band.
function generateLogFrequencies(lowHz, highHz, pointsPerOctave = 12) {
  const freqs = [];
  const octaves = Math.log2(highHz / lowHz);
  const totalPoints = Math.max(1, Math.ceil(octaves * pointsPerOctave));
  for (let i = 0; i <= totalPoints; i++) {
    freqs.push(lowHz * Math.pow(2, (i / totalPoints) * octaves));
  }
  return freqs;
}

/**
 * Compare a seat predicted response curve against a reference (RSP) predicted response curve
 * using a sliding one-octave window across 500 Hz – 16 kHz.
 *
 * @param {Array<{frequency:number, spl:number}>} seatResponseCurve
 * @param {Array<{frequency:number, spl:number}>} referenceResponseCurve
 * @returns {{ maxDeviationDb: number|null, worstOctave: {lowHz:number, highHz:number}|null, sampleCount:number }}
 */
export function computeSlidingOctaveDeviation(seatResponseCurve, referenceResponseCurve) {
  if (
    !Array.isArray(seatResponseCurve) || !seatResponseCurve.length ||
    !Array.isArray(referenceResponseCurve) || !referenceResponseCurve.length
  ) {
    return { maxDeviationDb: null, worstOctave: null, sampleCount: 0 };
  }

  const testFreqs = generateLogFrequencies(BAND_LOW_HZ, BAND_HIGH_HZ);
  const deltas = testFreqs
    .map((f) => {
      const seatDb = interpAtFrequency(seatResponseCurve, f);
      const refDb = interpAtFrequency(referenceResponseCurve, f);
      if (!isNum(seatDb) || !isNum(refDb)) return null;
      return { frequency: f, deltaDb: seatDb - refDb };
    })
    .filter(Boolean);

  if (!deltas.length) return { maxDeviationDb: null, worstOctave: null, sampleCount: 0 };

  let maxDeviationDb = -Infinity;
  let worstOctave = null;

  // Slide a one-octave window (fLow -> fLow*2) across the band in 1/12-octave steps.
  let windowLowHz = BAND_LOW_HZ;
  while (windowLowHz * 2 <= BAND_HIGH_HZ) {
    const windowHighHz = windowLowHz * 2;
    const inWindow = deltas.filter((d) => d.frequency >= windowLowHz && d.frequency <= windowHighHz);
    if (inWindow.length) {
      // "Sustained" deviation = spread within the window (max - min), so a single narrow
      // frequency point cannot dominate the result.
      const dbValues = inWindow.map((d) => d.deltaDb);
      const spread = Math.max(...dbValues) - Math.min(...dbValues);
      if (spread > maxDeviationDb) {
        maxDeviationDb = spread;
        worstOctave = { lowHz: Math.round(windowLowHz), highHz: Math.round(windowHighHz) };
      }
    }
    windowLowHz *= Math.pow(2, 1 / 12);
  }

  if (maxDeviationDb === -Infinity) {
    return { maxDeviationDb: null, worstOctave: null, sampleCount: deltas.length };
  }

  return {
    maxDeviationDb: Number(maxDeviationDb.toFixed(2)),
    worstOctave,
    sampleCount: deltas.length,
  };
}