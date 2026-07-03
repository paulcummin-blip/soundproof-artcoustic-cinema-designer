// sourceExcitationRealityAuditEngine.js
// Pure, read-only diagnostic engine — Source Excitation Reality Audit.
// Measures whether the modal engine over-excites room modes vs REW by testing
// alternative source-curve / modal-drive scaling variants. No production
// physics, coefficients, or graph changes — variants B–J are computed by
// re-running the unmodified production engine (source-curve variants A–D) or
// by post-hoc, read-only rescaling of the engine's own exposed per-mode
// contributor vectors (variants E–J), never by editing rewBassEngine.js.

import { simulateBassResponseRewCore } from '@/bass/core/rewBassEngine';
import { getSubwooferCurve } from '@/components/models/speakers/registry';
import { buildLiveEngineOptions } from '@/components/room/bass/liveBassAuditOptions';

export const TARGET_HZ = [29.5, 30, 32, 35, 40, 40.6, 45, 50, 57, 58];

const FLAT_CURVE = [{ hz: 20, db: 94 }, { hz: 200, db: 94 }];
const GENTLE_FALL_CURVE = [
  { hz: 20, db: 90 }, { hz: 30, db: 92 }, { hz: 40, db: 94 },
  { hz: 60, db: 94 }, { hz: 100, db: 94 }, { hz: 200, db: 94 },
];
const REW_LIKE_LF_ROLLOFF_CURVE = [
  { hz: 20, db: 78 }, { hz: 25, db: 84 }, { hz: 30, db: 88 }, { hz: 35, db: 91 },
  { hz: 40, db: 93 }, { hz: 45, db: 94 }, { hz: 50, db: 94.5 },
  { hz: 60, db: 94.5 }, { hz: 100, db: 94.5 }, { hz: 200, db: 94.5 },
];

function mag(re, im) { return Math.sqrt((re || 0) * (re || 0) + (im || 0) * (im || 0)); }
function toDb(m) { return 20 * Math.log10(Math.max(m, 1e-10)); }

function nearest(rows, freqHz, key = 'frequencyHz') {
  let best = null, bestDist = Infinity;
  (rows || []).forEach((row) => {
    const dist = Math.abs(row[key] - freqHz);
    if (dist < bestDist) { bestDist = dist; best = row; }
  });
  return best;
}

// Runs the unmodified production engine at freqHz using the exact live engine
// options (buildLiveEngineOptions) with the given source curve substituted in.
function runEngineAtFrequency(roomDims, seatPos, sub, curve, surfaceAbsorption, freqHz) {
  const options = buildLiveEngineOptions(freqHz, surfaceAbsorption);
  const result = simulateBassResponseRewCore(roomDims, seatPos, sub, curve, options);
  const vecRow = nearest(result.perFrequencyVectorDebug, freqHz);
  const contribRow = nearest(result.activeModalContributorDebugSeries, freqHz);
  const curveDb = vecRow ? 20 * Math.log10(mag(vecRow.directRe, vecRow.directIm) || 1) : null; // fallback only
  return { vecRow, contributors: contribRow?.contributors || [] };
}

function interpolateCurveDb(curve, hz) {
  const pts = [...curve].sort((a, b) => a.hz - b.hz);
  if (hz <= pts[0].hz) return pts[0].db;
  if (hz >= pts[pts.length - 1].hz) return pts[pts.length - 1].db;
  for (let i = 0; i < pts.length - 1; i++) {
    if (hz >= pts[i].hz && hz <= pts[i + 1].hz) {
      const ratio = (hz - pts[i].hz) / (pts[i + 1].hz - pts[i].hz);
      return pts[i].db + (pts[i + 1].db - pts[i].db) * ratio;
    }
  }
  return pts[0].db;
}

// Post-hoc, read-only per-mode rescale — reconstructs the modal sum from the
// production engine's own exposed contributor vectors (activeReal/activeImag),
// applies a variant-specific scalar per mode, and recombines with the
// production direct+reflection field. Does not alter the engine.
function rescaleModalSum(contributors, scaleFn) {
  let re = 0, im = 0;
  contributors.forEach((c) => {
    const s = scaleFn(c);
    re += (c.activeReal || 0) * s;
    im += (c.activeImag || 0) * s;
  });
  return { re, im };
}

const VARIANTS = [
  { key: 'A', label: 'A. Current production' },
  { key: 'B', label: 'B. Flat source curve' },
  { key: 'C', label: 'C. Gently falling LF curve' },
  { key: 'D', label: 'D. REW-like sub curve w/ LF rolloff' },
  { key: 'E', label: 'E. Reduced modal drive < 50 Hz' },
  { key: 'F', label: 'F. Reduced modal drive for modes > 50 Hz native' },
  { key: 'G', label: 'G. Modal drive ∝ 1/√(mode order)' },
  { key: 'H', label: 'H. Modal drive ∝ 1/native frequency' },
  { key: 'I', label: 'I. Modal drive ∝ 1/transfer-magnitude cap' },
  { key: 'J', label: 'J. Modal/Direct ratio clamp' },
];

function variantScaleFn(variantKey, freqHz) {
  switch (variantKey) {
    case 'E': return (c) => (freqHz < 50 ? 0.6 : 1.0);
    case 'F': return (c) => (c.modeFrequencyHz > 50 ? 0.6 : 1.0);
    case 'G': return (c) => {
      const order = Math.abs(c.nx) + Math.abs(c.ny) + Math.abs(c.nz);
      return 1 / Math.sqrt(Math.max(1, order));
    };
    case 'H': return (c) => 1 / Math.max(1, c.modeFrequencyHz);
    case 'I': return (c) => {
      const cap = 8; // transfer magnitude cap — diagnostic only
      const tm = c.modalTransferMagnitude || c.activeTransferMagnitudeAtNull || 0;
      return tm > cap ? cap / tm : 1.0;
    };
    default: return () => 1.0;
  }
}

// Runs all target frequencies for one seat and returns per-variant per-frequency rows.
export function runSourceExcitationAudit(roomDims, seatPos, sub, surfaceAbsorption) {
  const productCurve = getSubwooferCurve(sub?.modelKey) || FLAT_CURVE;

  const rows = TARGET_HZ.map((freqHz) => {
    // Base production run (curve A) — gives us direct/reflection field + contributor list
    // shared by variants A and E–J (which only alter modal drive, not source curve).
    const base = runEngineAtFrequency(roomDims, seatPos, sub, productCurve, surfaceAbsorption, freqHz);
    if (!base.vecRow) return null;

    const preModalRe = base.vecRow.directRe + base.vecRow.reflectionRe;
    const preModalIm = base.vecRow.directIm + base.vecRow.reflectionIm;

    const variantResults = {};

    // A — production, unmodified.
    variantResults.A = {
      finalMag: mag(base.vecRow.finalRe, base.vecRow.finalIm),
      sourceCurveDb: interpolateCurveDb(productCurve, freqHz),
      transferMag: base.contributors[0]?.modalTransferMagnitude ?? null,
      sourceCoupling: base.contributors[0]?.sourceCoupling ?? null,
      receiverCoupling: base.contributors[0]?.receiverCoupling ?? null,
    };

    // B/C/D — alternate source curves. curveDb is a common linear multiplier on
    // direct/reflection/modal amplitude alike, so re-running the actual engine
    // gives the exact result (not an approximation).
    const curveVariants = { B: FLAT_CURVE, C: GENTLE_FALL_CURVE, D: REW_LIKE_LF_ROLLOFF_CURVE };
    Object.entries(curveVariants).forEach(([key, curve]) => {
      const r = runEngineAtFrequency(roomDims, seatPos, sub, curve, surfaceAbsorption, freqHz);
      variantResults[key] = {
        finalMag: r.vecRow ? mag(r.vecRow.finalRe, r.vecRow.finalIm) : null,
        sourceCurveDb: interpolateCurveDb(curve, freqHz),
      };
    });

    // E–J — post-hoc modal-only rescale of the production contributor vectors.
    ['E', 'F', 'G', 'H', 'I'].forEach((key) => {
      const scaleFn = variantScaleFn(key, freqHz);
      const { re: modalRe, im: modalIm } = rescaleModalSum(base.contributors, scaleFn);
      const finalRe = preModalRe + modalRe;
      const finalIm = preModalIm + modalIm;
      variantResults[key] = { finalMag: mag(finalRe, finalIm), sourceCurveDb: variantResults.A.sourceCurveDb };
    });

    // J — modal/direct ratio clamp: cap modal magnitude to at most 1.5x direct magnitude.
    {
      const directMag = mag(base.vecRow.directRe, base.vecRow.directIm);
      const modalRe = base.vecRow.modalSumRe;
      const modalIm = base.vecRow.modalSumIm;
      const modalMagBase = mag(modalRe, modalIm);
      const capMag = directMag * 1.5;
      const clampScale = modalMagBase > capMag && modalMagBase > 0 ? capMag / modalMagBase : 1.0;
      const finalRe = preModalRe + modalRe * clampScale;
      const finalIm = preModalIm + modalIm * clampScale;
      variantResults.J = { finalMag: mag(finalRe, finalIm), sourceCurveDb: variantResults.A.sourceCurveDb };
    }

    return { frequencyHz: freqHz, variants: variantResults };
  }).filter(Boolean);

  return rows;
}

export function buildDeltaTable(rows) {
  return rows.map((row) => {
    const prodDb = toDb(row.variants.A.finalMag);
    const deltas = {};
    VARIANTS.forEach(({ key }) => {
      const v = row.variants[key];
      deltas[key] = v?.finalMag != null ? toDb(v.finalMag) - prodDb : null;
    });
    return { frequencyHz: row.frequencyHz, productionDb: prodDb, deltas };
  });
}

// Pass-criteria evaluation per variant across seats.
export function evaluateVariants(deltaTablesBySeat) {
  const seats = Object.keys(deltaTablesBySeat);
  return VARIANTS.filter((v) => v.key !== 'A').map(({ key, label }) => {
    let worksForAllSeats = true;
    let reduceOk = true, preserve5758Ok = true, no50NotchWorse = true;
    seats.forEach((seatLabel) => {
      const table = deltaTablesBySeat[seatLabel];
      const lowBandRows = table.filter((r) => r.frequencyHz >= 30 && r.frequencyHz <= 45);
      const maxReduction = Math.min(0, ...lowBandRows.map((r) => r.deltas[key] ?? 0));
      if (maxReduction > -3) reduceOk = false;

      const peakRows = table.filter((r) => r.frequencyHz === 57 || r.frequencyHz === 58);
      peakRows.forEach((r) => { if (Math.abs(r.deltas[key] ?? 0) > 2) preserve5758Ok = false; });

      const fiftyRow = table.find((r) => r.frequencyHz === 50);
      if (fiftyRow && (fiftyRow.deltas[key] ?? 0) < -2) no50NotchWorse = false;
    });
    worksForAllSeats = reduceOk && preserve5758Ok && no50NotchWorse;
    return {
      key, label,
      reduceOk, preserve5758Ok, no50NotchWorse,
      passesAll: worksForAllSeats,
      severity: worksForAllSeats ? 'PASS' : (!reduceOk ? 'insufficient reduction' : !preserve5758Ok ? 'peak damaged' : 'new notch'),
    };
  }).sort((a, b) => (b.passesAll ? 1 : 0) - (a.passesAll ? 1 : 0));
}

export { VARIANTS };