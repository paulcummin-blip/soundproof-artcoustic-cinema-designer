// sourceCurveABCAuditEngine.js
// Pure, read-only diagnostic engine — Source Curve A/B/C Audit.
// Compares production source curve (A), the uploaded SUB4-12 INFRA max-SPL
// FRD (B), and the generic REW-like falling LF curve (C, from the earlier
// Source Curve Root Cause Audit) across R1S1–R1S3 and target frequencies.
// Read-only: re-runs the unmodified production engine with alternate curve
// inputs only — no physics/coefficient/graph changes.

import { simulateBassResponseRewCore } from '@/bass/core/rewBassEngine';
import { getSubwooferCurve } from '@/components/models/speakers/registry';
import { buildLiveEngineOptions } from '@/components/room/bass/liveBassAuditOptions';

export const TARGET_HZ = [29.5, 30, 32, 35, 40, 40.6, 45, 50, 57, 58];

// Verbatim uploaded SUB4-12 INFRA max SPL FRD (Hz, dB) — no smoothing/normalisation.
export const SUB4_12_FRD_CURVE = [
  { hz: 20.000000, db: 122.203406 }, { hz: 20.962263, db: 122.230291 }, { hz: 21.970823, db: 122.275232 },
  { hz: 23.027908, db: 122.348335 }, { hz: 24.135853, db: 122.517668 }, { hz: 25.297104, db: 122.721037 },
  { hz: 26.514227, db: 122.987299 }, { hz: 27.789910, db: 123.319257 }, { hz: 29.126970, db: 123.703170 },
  { hz: 30.528359, db: 124.105171 }, { hz: 31.997174, db: 124.489330 }, { hz: 33.536659, db: 124.823002 },
  { hz: 35.150212, db: 125.079653 }, { hz: 36.841399, db: 125.247681 }, { hz: 38.613955, db: 125.328553 },
  { hz: 40.471793, db: 125.327746 }, { hz: 42.419018, db: 125.265057 }, { hz: 44.459930, db: 125.168933 },
  { hz: 46.599036, db: 125.061387 }, { hz: 48.841062, db: 124.959607 }, { hz: 51.190958, db: 124.874106 },
  { hz: 53.653916, db: 124.807075 }, { hz: 56.235374, db: 124.761673 }, { hz: 58.941034, db: 124.739009 },
  { hz: 61.776872, db: 124.727366 }, { hz: 64.749151, db: 124.724221 }, { hz: 67.864435, db: 124.731556 },
  { hz: 71.129606, db: 124.745880 }, { hz: 74.551874, db: 124.773284 }, { hz: 78.138799, db: 124.812802 },
  { hz: 81.898301, db: 124.863403 }, { hz: 85.838685, db: 124.929551 }, { hz: 89.968653, db: 125.007623 },
  { hz: 94.297327, db: 125.096738 }, { hz: 98.834267, db: 125.196316 }, { hz: 103.589494, db: 125.300756 },
  { hz: 108.573509, db: 125.401665 }, { hz: 113.797321, db: 125.484736 }, { hz: 119.272466, db: 125.529215 },
  { hz: 125.011039, db: 125.504315 }, { hz: 131.025711, db: 125.368729 }, { hz: 137.329769, db: 125.080393 },
  { hz: 143.937135, db: 124.594082 }, { hz: 150.862401, db: 123.872803 }, { hz: 158.120864, db: 122.894385 },
  { hz: 165.728555, db: 121.647625 }, { hz: 173.702275, db: 120.138515 }, { hz: 182.059636, db: 119.416501 },
  { hz: 190.819095, db: 118.597614 }, { hz: 200.000000, db: 117.690453 },
];

// REW-like generic falling LF source curve (the Variant D curve used in the earlier
// Source Curve Root Cause Audit) — kept verbatim for parity between audits.
export const REW_LIKE_LF_ROLLOFF_CURVE = [
  { hz: 20, db: 78 }, { hz: 25, db: 84 }, { hz: 30, db: 88 }, { hz: 35, db: 91 },
  { hz: 40, db: 93 }, { hz: 45, db: 94 }, { hz: 50, db: 94.5 },
  { hz: 60, db: 94.5 }, { hz: 100, db: 94.5 }, { hz: 200, db: 94.5 },
];

function mag(re, im) { return Math.sqrt((re || 0) * (re || 0) + (im || 0) * (im || 0)); }
function toDb(m) { return 20 * Math.log10(Math.max(m, 1e-10)); }
function nearest(rows, freqHz, key = 'frequencyHz') {
  let best = null, bestDist = Infinity;
  (rows || []).forEach((row) => { const d = Math.abs(row[key] - freqHz); if (d < bestDist) { bestDist = d; best = row; } });
  return best;
}

function runEngineAt(roomDims, seatPos, sub, curve, surfaceAbsorption, freqHz) {
  const options = buildLiveEngineOptions(freqHz, surfaceAbsorption);
  const result = simulateBassResponseRewCore(roomDims, seatPos, sub, curve, options);
  const vecRow = nearest(result.perFrequencyVectorDebug, freqHz);
  if (!vecRow) return null;
  const finalRe = vecRow.directRe + vecRow.reflectionRe + vecRow.modalRe;
  const finalIm = vecRow.directIm + vecRow.reflectionIm + vecRow.modalIm;
  return toDb(mag(finalRe, finalIm));
}

function severityFor(freqHz, deltaDb) {
  const inRecoveryBand = freqHz >= 30 && freqHz <= 45;
  const inGuardBand = freqHz === 57 || freqHz === 58;
  if (inGuardBand) {
    if (Math.abs(deltaDb) <= 0.5) return 'PASS';
    if (Math.abs(deltaDb) <= 1.5) return 'WATCH';
    return 'FAIL — guard band damaged';
  }
  if (inRecoveryBand) {
    if (deltaDb <= -2) return 'PASS — meaningful reduction';
    if (deltaDb <= -0.5) return 'WATCH — partial reduction';
    return 'FAIL — no reduction';
  }
  if (Math.abs(deltaDb) <= 1.0) return 'PASS';
  return 'WATCH';
}

function nextTestFor(severity) {
  if (severity.startsWith('PASS')) return 'Proceed to Test 7 gain-normalisation check';
  if (severity.startsWith('WATCH')) return 'Re-run with tighter frequency step around this Hz';
  return 'Run root-cause isolation (Tests 1-4) at this Hz';
}

export function runSourceCurveABCAudit(roomDims, seatPos, sub) {
  const productionCurve = getSubwooferCurve(sub?.modelKey) || REW_LIKE_LF_ROLLOFF_CURVE;
  const surfaceAbsorption = undefined;

  return TARGET_HZ.map((freqHz) => {
    const actualA = runEngineAt(roomDims, seatPos, sub, productionCurve, surfaceAbsorption, freqHz);
    const actualB = runEngineAt(roomDims, seatPos, sub, SUB4_12_FRD_CURVE, surfaceAbsorption, freqHz);
    const actualC = runEngineAt(roomDims, seatPos, sub, REW_LIKE_LF_ROLLOFF_CURVE, surfaceAbsorption, freqHz);
    if (actualA === null) return null;

    const deltaB = actualB !== null ? actualB - actualA : null;
    const deltaC = actualC !== null ? actualC - actualA : null;
    const severityB = deltaB !== null ? severityFor(freqHz, deltaB) : 'N/A';
    const severityC = deltaC !== null ? severityFor(freqHz, deltaC) : 'N/A';

    return {
      frequencyHz: freqHz,
      expected: actualA, // Variant A (current production) is the baseline B/C are judged against
      actualB, deltaB, severityB, nextTestB: nextTestFor(severityB),
      actualC, deltaC, severityC, nextTestC: nextTestFor(severityC),
    };
  }).filter(Boolean);
}