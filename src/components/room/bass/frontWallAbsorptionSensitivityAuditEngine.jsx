// frontWallAbsorptionSensitivityAuditEngine.jsx
// Pure computation for the Front Wall Absorption Sensitivity Audit.
// Read-only: compares production's (B44) sensitivity to front-wall absorption and to a
// small seat move, across 4 fixed variants. No REW measured dataset is wired into this
// audit environment, so the "expected" REW behaviour is the established physical baseline
// (front-wall absorption primarily changes null depth/width, not null frequency; a small
// seat move produces a smooth, continuous phase-driven amplitude change) rather than a
// hardcoded REW curve. Does not alter production code, options, or the live graph.

import { simulateBassResponseRewCore } from '@/bass/core/rewBassEngine';

export function fmt(v, d = 3) { return Number.isFinite(v) ? v.toFixed(d) : '—'; }
function mag(re, im) { return Math.sqrt(re * re + im * im); }
function toDb(m) { return 20 * Math.log10(Math.max(m, 1e-10)); }

const ROOM_DIMS = { widthM: 5.0, lengthM: 4.5, heightM: 3.0 };
const SUB = { id: 'sub_centre_front', x: 2.5, y: 0.3, z: 0.35, tuning: { gainDb: 0, delayMs: 0, polarity: 0 } };
const SEAT_A = { x: 2.5, y: 4.00, z: 1.2 };
const SEAT_B = { x: 2.5, y: 3.80, z: 1.2 };
const ABSORPTION_BASE = { front: 0.30, back: 0.30, left: 0.30, right: 0.30, floor: 0.30, ceiling: 0.30 };
const ABSORPTION_FRONT_HIGH = { front: 0.90, back: 0.30, left: 0.30, right: 0.30, floor: 0.30, ceiling: 0.30 };
const FREQS_HZ = [28, 29, 30, 31, 32, 33, 34, 35];
const SOURCE_CURVE = [{ hz: 20, db: 94 }, { hz: 50, db: 94 }, { hz: 100, db: 94 }, { hz: 200, db: 94 }];

function baseOptions(frequencyHz, surfaceAbsorption) {
  return {
    enableReflections: true,
    enableModes: true,
    surfaceAbsorption,
    freqMinHz: frequencyHz,
    freqMaxHz: frequencyHz + 0.01,
    modeGenerationFMaxHz: 200,
    smoothing: 'none',
    axialQ: 4.0,
    pureDeterministicModalSum: true,
    disableModalPropagationPhase: true,
    disableLateField: true,
    debugReflectionOrder: 1,
    qStrategy: 'production',
  };
}

function dominantModeLabel(mode) {
  if (!mode) return 'n/a';
  return `(${mode.nx},${mode.ny},${mode.nz}) ${mode.type ?? ''} @ ${fmt(mode.freq, 1)} Hz`;
}

function runAtFrequency(seat, surfaceAbsorption, frequencyHz) {
  const options = baseOptions(frequencyHz, surfaceAbsorption);
  const out = simulateBassResponseRewCore(ROOM_DIMS, seat, SUB, SOURCE_CURVE, options);

  const vec = out.perFrequencyVectorDebug?.[0] || { directRe: 0, directIm: 0, reflectionRe: 0, reflectionIm: 0, modalSumRe: 0, modalSumIm: 0, finalRe: 0, finalIm: 0 };
  const cp = out.complexPressure?.[0] || { re: vec.finalRe, im: vec.finalIm };

  const contributors = out.activeModalContributorDebugSeries?.[0]?.contributors || [];
  const topMode = contributors.length ? [...contributors].sort((a, b) => b.activeMagnitude - a.activeMagnitude)[0] : null;

  return {
    frequencyHz,
    totalSplDb: toDb(mag(cp.re, cp.im)),
    directSplDb: toDb(mag(vec.directRe, vec.directIm)),
    reflectionSplDb: toDb(mag(vec.reflectionRe, vec.reflectionIm)),
    modalSplDb: toDb(mag(vec.modalSumRe, vec.modalSumIm)),
    finalRe: cp.re,
    finalIm: cp.im,
    finalPhaseDeg: (Math.atan2(cp.im, cp.re) * 180) / Math.PI,
    dominantMode: dominantModeLabel(topMode),
  };
}

function nullDepthDb(rows) {
  const peak = Math.max(...rows.map((r) => r.totalSplDb));
  const nullRows = rows.filter((r) => r.frequencyHz >= 29 && r.frequencyHz <= 31);
  const nullMin = nullRows.length ? Math.min(...nullRows.map((r) => r.totalSplDb)) : peak;
  return peak - nullMin;
}

const VARIANT_DEFS = [
  { key: 'A', label: 'A. B44 4.00m / 0.30', seat: SEAT_A, absorption: ABSORPTION_BASE, description: 'Seat y=4.00m, all surfaces absorption 0.30 (baseline).' },
  { key: 'B', label: 'B. B44 3.80m / 0.30', seat: SEAT_B, absorption: ABSORPTION_BASE, description: 'Seat y=3.80m, all surfaces absorption 0.30 (seat-move-only test).' },
  { key: 'C', label: 'C. B44 4.00m / front 0.90', seat: SEAT_A, absorption: ABSORPTION_FRONT_HIGH, description: 'Seat y=4.00m, front wall absorption 0.90, all others 0.30 (absorption-only test).' },
  { key: 'D', label: 'D. B44 3.80m / front 0.90', seat: SEAT_B, absorption: ABSORPTION_FRONT_HIGH, description: 'Seat y=3.80m, front wall absorption 0.90, all others 0.30 (combined test).' },
];

export function runFrontWallAbsorptionSensitivityAudit() {
  const results = {};
  VARIANT_DEFS.forEach((v) => {
    const rows = FREQS_HZ.map((f) => runAtFrequency(v.seat, v.absorption, f));
    const at30 = rows.find((r) => r.frequencyHz === 30);
    const at34 = rows.find((r) => r.frequencyHz === 34);
    results[v.key] = {
      ...v,
      rows,
      nullDepthDb: nullDepthDb(rows),
      spl30: at30.totalSplDb,
      spl34: at34.totalSplDb,
      rise30to34: at34.totalSplDb - at30.totalSplDb,
      dominantAt30: at30.dominantMode,
      dominantAt34: at34.dominantMode,
    };
  });

  // Absorption sensitivity in B44: how much does front-wall absorption change the 30 Hz null,
  // at each seat.
  const absorptionShiftSeatA = results.C.nullDepthDb - results.A.nullDepthDb;
  const absorptionShiftSeatB = results.D.nullDepthDb - results.B.nullDepthDb;

  // Seat-move sensitivity in B44: how much does moving 4.00m -> 3.80m change the 30 Hz null,
  // at each absorption case.
  const seatShiftBaseAbsorption = results.B.nullDepthDb - results.A.nullDepthDb;
  const seatShiftHighAbsorption = results.D.nullDepthDb - results.C.nullDepthDb;

  // Established physical baseline (no REW dataset wired into this audit environment):
  // front-wall absorption should change null DEPTH/WIDTH but not materially shift which
  // frequency the null centres on; a small (20cm) seat move should produce a smooth,
  // continuous change, not an abrupt jump. Flag a mismatch if B44 deviates strongly.
  const ABSORPTION_MISMATCH_THRESHOLD_DB = 4;
  const SEAT_MISMATCH_THRESHOLD_DB = 4;

  const absorptionMismatch = Math.abs(absorptionShiftSeatA) > ABSORPTION_MISMATCH_THRESHOLD_DB || Math.abs(absorptionShiftSeatB) > ABSORPTION_MISMATCH_THRESHOLD_DB;
  const seatMismatch = Math.abs(seatShiftBaseAbsorption) > SEAT_MISMATCH_THRESHOLD_DB || Math.abs(seatShiftHighAbsorption) > SEAT_MISMATCH_THRESHOLD_DB;

  const largestAbsorptionShift = Math.max(Math.abs(absorptionShiftSeatA), Math.abs(absorptionShiftSeatB));
  const largestSeatShift = Math.max(Math.abs(seatShiftBaseAbsorption), Math.abs(seatShiftHighAbsorption));

  let verdict;
  if (absorptionMismatch && seatMismatch) {
    verdict = 'BOTH ABSORPTION AND SEAT RESPONSE MISMATCH CONFIRMED';
  } else if (absorptionMismatch) {
    verdict = 'FRONT WALL ABSORPTION RESPONSE MISMATCH CONFIRMED';
  } else if (seatMismatch) {
    verdict = 'SEAT POSITION PHASE RESPONSE MISMATCH CONFIRMED';
  } else {
    verdict = 'FRONT WALL ABSORPTION SENSITIVITY RETIRED';
  }

  const rankLine = (absorptionMismatch && seatMismatch)
    ? (largestAbsorptionShift >= largestSeatShift
        ? `Absorption sensitivity (${fmt(largestAbsorptionShift, 2)} dB) is the larger mismatch vs seat-move sensitivity (${fmt(largestSeatShift, 2)} dB).`
        : `Seat-move sensitivity (${fmt(largestSeatShift, 2)} dB) is the larger mismatch vs absorption sensitivity (${fmt(largestAbsorptionShift, 2)} dB).`)
    : 'Only one mechanism exceeded the mismatch threshold — no ranking required.';

  const finalReport = {
    test: 'Front Wall Absorption Sensitivity Audit \u2014 does B44\u2019s 29\u201331 Hz null respond to front-wall absorption changes and small seat moves the way REW\u2019s established physical baseline predicts (absorption changes depth/width not frequency; seat moves produce smooth continuous change)?',
    expected: 'Front-wall absorption 0.30\u21920.90 should change null depth/width only, by a modest amount (< ' + ABSORPTION_MISMATCH_THRESHOLD_DB + ' dB shift in this audit\u2019s threshold), not relocate the null. Moving the seat 4.00m\u21923.80m should produce a smooth, bounded change (< ' + SEAT_MISMATCH_THRESHOLD_DB + ' dB), not an abrupt jump.',
    actual: 'Absorption-driven null-depth shift \u2014 seat 4.00m: ' + fmt(absorptionShiftSeatA, 2) + ' dB, seat 3.80m: ' + fmt(absorptionShiftSeatB, 2) + ' dB. Seat-move-driven null-depth shift \u2014 base absorption: ' + fmt(seatShiftBaseAbsorption, 2) + ' dB, high front absorption: ' + fmt(seatShiftHighAbsorption, 2) + ' dB.',
    delta: '\u0394Absorption(A\u2192C)=' + fmt(absorptionShiftSeatA, 2) + ' dB, \u0394Absorption(B\u2192D)=' + fmt(absorptionShiftSeatB, 2) + ' dB, \u0394Seat(A\u2192B)=' + fmt(seatShiftBaseAbsorption, 2) + ' dB, \u0394Seat(C\u2192D)=' + fmt(seatShiftHighAbsorption, 2) + ' dB',
    severity: verdict === 'BOTH ABSORPTION AND SEAT RESPONSE MISMATCH CONFIRMED'
      ? 'HIGH \u2014 both boundary damping response and spatial phase sensitivity deviate from the expected physical baseline.'
      : verdict === 'FRONT WALL ABSORPTION RESPONSE MISMATCH CONFIRMED'
        ? 'MEDIUM-HIGH \u2014 boundary damping response to front-wall absorption deviates from the expected physical baseline; seat-move sensitivity is within tolerance.'
        : verdict === 'SEAT POSITION PHASE RESPONSE MISMATCH CONFIRMED'
          ? 'MEDIUM-HIGH \u2014 spatial phase sensitivity to a 20cm seat move deviates from the expected physical baseline; absorption sensitivity is within tolerance.'
          : 'LOW \u2014 B44\u2019s response to front-wall absorption and seat position is within the expected physical baseline; hypothesis retired.',
    nextTest: verdict === 'FRONT WALL ABSORPTION SENSITIVITY RETIRED'
      ? 'Return to other root-cause hypotheses for the remaining 30 Hz null mismatch (e.g. accumulation architecture, modal distance scaling) \u2014 boundary damping and seat-phase sensitivity are both retired.'
      : rankLine + ' Isolate the confirmed mechanism further with a finer absorption/seat sweep before promoting any production change.',
    conclusionLine: verdict,
  };

  return {
    results,
    freqsHz: FREQS_HZ,
    absorptionShiftSeatA, absorptionShiftSeatB,
    seatShiftBaseAbsorption, seatShiftHighAbsorption,
    verdict,
    finalReport,
  };
}