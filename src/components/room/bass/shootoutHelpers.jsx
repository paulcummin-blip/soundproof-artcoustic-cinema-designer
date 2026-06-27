// shootoutHelpers.js
// Shared data and helpers for ImageSourceParityShootout.
// Diagnostic only — no production solver changes.

// --- Hardcoded estimated REW reference (screenshot-derived, approximate) ---
// IMPORTANT: This is NOT exact measurement data. Do not use for calibration.
export const REW_ESTIMATE = [
  { frequency: 20,  spl: 92.9 },
  { frequency: 25,  spl: 95.1 },
  { frequency: 30,  spl: 82.7 },
  { frequency: 35,  spl: 86.4 },
  { frequency: 40,  spl: 89.3 },
  { frequency: 45,  spl: 96.8 },
  { frequency: 50,  spl: 99.4 },
  { frequency: 55,  spl: 90.4 },
  { frequency: 60,  spl: 81.8 },
  { frequency: 65,  spl: 78.2 },
  { frequency: 70,  spl: 91.4 },
  { frequency: 75,  spl: 92.3 },
  { frequency: 80,  spl: 96.9 },
  { frequency: 85,  spl: 97.7 },
  { frequency: 90,  spl: 88.7 },
  { frequency: 95,  spl: 94.4 },
  { frequency: 100, spl: 81.5 },
  { frequency: 105, spl: 89.6 },
  { frequency: 110, spl: 96.4 },
  { frequency: 115, spl: 98.3 },
  { frequency: 120, spl: 94.9 },
  { frequency: 125, spl: 80.0 },
  { frequency: 130, spl: 91.1 },
  { frequency: 135, spl: 97.2 },
  { frequency: 140, spl: 99.5 },
  { frequency: 145, spl: 99.5 },
  { frequency: 150, spl: 93.7 },
  { frequency: 155, spl: 99.8 },
  { frequency: 160, spl: 99.1 },
  { frequency: 165, spl: 95.8 },
  { frequency: 170, spl: 89.2 },
  { frequency: 175, spl: 86.8 },
  { frequency: 180, spl: 97.3 },
  { frequency: 185, spl: 97.6 },
  { frequency: 190, spl: 95.3 },
  { frequency: 195, spl: 97.2 },
  { frequency: 200, spl: 97.8 },
  { frequency: 205, spl: 85.1 },
  { frequency: 210, spl: 85.0 },
  { frequency: 215, spl: 89.6 },
  { frequency: 220, spl: 86.9 },
];

export const TRACE_CONFIG = [
  { id: 'modal_only',       label: 'Current modal-only parity',              color: '#213428', strokeWidth: 2,   dash: '0'   },
  { id: 'image_only_rigid', label: 'Rigid image-source only (order 4)',       color: '#0891b2', strokeWidth: 2,   dash: '0'   },
  { id: 'hybrid_rigid',     label: 'Rigid hybrid (modal + image, order 4)',   color: '#7c3aed', strokeWidth: 2,   dash: '0'   },
  { id: 'rew',              label: 'Imported REW overlay',                    color: '#f97316', strokeWidth: 2,   dash: '6 3' },
  { id: 'rew_estimate',     label: 'Estimated REW reference (approx.)',       color: '#dc2626', strokeWidth: 1.5, dash: '4 2' },
];

export function fmt1(v) {
  return v !== null && Number.isFinite(v) ? v.toFixed(1) : '—';
}

export function computeMAE(freqsHz, splDb, rewData) {
  if (!rewData || rewData.length < 2) return null;
  const sorted = [...rewData].sort((a, b) => a.frequency - b.frequency);
  let sum = 0, count = 0;
  for (let i = 0; i < freqsHz.length; i++) {
    const f = freqsHz[i];
    if (f < 20 || f > 220) continue;
    let rewDb = null;
    for (let j = 0; j < sorted.length - 1; j++) {
      if (f >= sorted[j].frequency && f <= sorted[j + 1].frequency) {
        const t = (f - sorted[j].frequency) / (sorted[j + 1].frequency - sorted[j].frequency);
        rewDb = sorted[j].spl + t * (sorted[j + 1].spl - sorted[j].spl);
        break;
      }
    }
    if (rewDb !== null && Number.isFinite(splDb[i])) {
      sum += Math.abs(splDb[i] - rewDb);
      count++;
    }
  }
  return count > 0 ? sum / count : null;
}

export function analyseResponse(freqsHz, splDb) {
  const band = freqsHz
    .map((f, i) => ({ f, db: splDb[i] }))
    .filter(p => p.f >= 20 && p.f <= 80 && Number.isFinite(p.db));
  if (band.length < 3) return { nullFreq: null, nullDb: null, peakFreq: null, peakDb: null, swing: null };
  let nullPt = band[0], peakPt = band[0];
  for (const pt of band) {
    if (pt.db < nullPt.db) nullPt = pt;
    if (pt.db > peakPt.db) peakPt = pt;
  }
  return { nullFreq: nullPt.f, nullDb: nullPt.db, peakFreq: peakPt.f, peakDb: peakPt.db, swing: peakPt.db - nullPt.db };
}

function countMajorDips(freqsHz, splDb) {
  const pts = freqsHz.map((f, i) => ({ f, db: splDb[i] }))
    .filter(p => p.f >= 20 && p.f <= 200 && Number.isFinite(p.db));
  if (pts.length < 5) return 0;
  let dips = 0;
  for (let i = 2; i < pts.length - 2; i++) {
    const local = (pts[i-2].db + pts[i-1].db + pts[i+1].db + pts[i+2].db) / 4;
    if (local - pts[i].db > 6) dips++;
  }
  return dips;
}

function computeSwingInRange(freqsHz, splDb, fMin, fMax) {
  const pts = freqsHz.map((f, i) => ({ f, db: splDb[i] }))
    .filter(p => p.f >= fMin && p.f <= fMax && Number.isFinite(p.db));
  if (pts.length < 2) return null;
  return Math.max(...pts.map(p => p.db)) - Math.min(...pts.map(p => p.db));
}

export function computeEstimateMetrics(freqsHz, splDb) {
  const maeEst  = computeMAE(freqsHz, splDb, REW_ESTIMATE);
  const dipsEst = countMajorDips(REW_ESTIMATE.map(p => p.frequency), REW_ESTIMATE.map(p => p.spl));
  const dipsSim = countMajorDips(freqsHz, splDb);
  const swingEst = computeSwingInRange(REW_ESTIMATE.map(p => p.frequency), REW_ESTIMATE.map(p => p.spl), 20, 200);
  const swingSim = computeSwingInRange(freqsHz, splDb, 20, 200);
  const swingDiff = (swingEst !== null && swingSim !== null) ? Math.abs(swingSim - swingEst) : null;
  return { maeEst, dipsEst, dipsSim, swingEst, swingSim, swingDiff };
}

export function estimateMatchVerdict(metrics) {
  if (!metrics || metrics.maeEst === null) return '—';
  const { maeEst, dipsEst, dipsSim, swingDiff } = metrics;
  const dipMatch   = Math.abs(dipsSim - dipsEst) <= 1;
  const swingMatch = swingDiff !== null && swingDiff < 6;
  if (maeEst < 5  && dipMatch && swingMatch) return 'strong match';
  if (maeEst < 8  && (dipMatch || swingMatch)) return 'partial match';
  if (maeEst < 12) return 'rough alignment';
  return 'poor match';
}