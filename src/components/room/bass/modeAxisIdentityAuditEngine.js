// modeAxisIdentityAuditEngine.js
// Pure, read-only diagnostic engine — Mode Axis Identity Audit.
// Verifies whether modal indices (nx, ny, nz), room axes, and displayed mode
// labels are correctly aligned in the shared, UNMODIFIED modalCalculations.js
// generator, and whether production's contributor-debug labels match.
// No production code is imported for mutation — only read for comparison.

import { computeRoomModesLocal } from '@/bass/core/modalCalculations';
import { simulateBassResponseRewCore } from '@/bass/core/rewBassEngine';
import { buildLiveEngineOptions, LIVE_SOURCE_CURVE } from '@/components/room/bass/liveBassAuditOptions';

export const TEST_HZ = [28, 29, 30, 31, 32, 33, 34, 35];

const ROOM_DIMS = { widthM: 4.5, lengthM: 5.0, heightM: 3.0 };
const SOURCE = { x: 2.25, y: 0.1, z: 0.35 }; // centre of front wall
const SEAT = { x: 2.25, y: 4.0, z: 1.2 }; // centre width, y = 4.0m
const SURFACE_ABSORPTION = { front: 0.3, back: 0.3, left: 0.3, right: 0.3, floor: 0.3, ceiling: 0.3 };

// modalCalculations.js formula (read-only reference, verbatim):
//   freq = (c/2) * sqrt( (nx/widthM)^2 + (ny/lengthM)^2 + (nz/heightM)^2 )
// i.e. nx couples to widthM, ny couples to lengthM, nz couples to heightM.

function expectedAxisLabelFor(mode) {
  if (mode.nx > 0 && mode.ny === 0 && mode.nz === 0) return 'width axis (nx uses widthM)';
  if (mode.nx === 0 && mode.ny > 0 && mode.nz === 0) return 'length axis (ny uses lengthM)';
  if (mode.nx === 0 && mode.ny === 0 && mode.nz > 0) return 'height axis (nz uses heightM)';
  return `${mode.type} (mixed axes)`;
}

export function runModeAxisIdentityAudit() {
  // 1. Raw generated modes before coupling/transfer — shared, unmodified generator.
  const rawModes = computeRoomModesLocal({
    widthM: ROOM_DIMS.widthM,
    lengthM: ROOM_DIMS.lengthM,
    heightM: ROOM_DIMS.heightM,
    fMax: 90,
    c: 343,
  });

  // 2. Per-mode axis/dimension table (axial modes only, order <= 3 on any axis, for readability).
  const axialModeRows = rawModes
    .filter((m) => m.type === 'axial' && Math.max(m.nx, m.ny, m.nz) <= 3)
    .map((mode) => ({
      displayId: `(${mode.nx},${mode.ny},${mode.nz})`,
      nx: mode.nx, ny: mode.ny, nz: mode.nz,
      dimensionForNx: `widthM = ${ROOM_DIMS.widthM}m`,
      dimensionForNy: `lengthM = ${ROOM_DIMS.lengthM}m`,
      dimensionForNz: `heightM = ${ROOM_DIMS.heightM}m`,
      calculatedFrequencyHz: mode.freq,
      family: mode.type,
      expectedAxisLabel: expectedAxisLabelFor(mode),
    }));

  // 3. Explicit PASS/FAIL checks against the user's expected fundamentals.
  const mode100 = rawModes.find((m) => m.nx === 1 && m.ny === 0 && m.nz === 0);
  const mode010 = rawModes.find((m) => m.nx === 0 && m.ny === 1 && m.nz === 0);
  const mode001 = rawModes.find((m) => m.nx === 0 && m.ny === 0 && m.nz === 1);

  const near = (freq, target, tolHz = 0.3) => Number.isFinite(freq) && Math.abs(freq - target) <= tolHz;

  const checklist = [
    {
      question: 'Does (1,0,0) use room length?',
      result: mode100 ? `(1,0,0) uses widthM (${ROOM_DIMS.widthM}m) → ${mode100.freq.toFixed(2)} Hz` : 'mode not found',
      pass: false, // nx couples to widthM, not lengthM — always FAIL against "uses length" per generator convention
    },
    {
      question: 'Does (0,1,0) use room width?',
      result: mode010 ? `(0,1,0) uses lengthM (${ROOM_DIMS.lengthM}m) → ${mode010.freq.toFixed(2)} Hz` : 'mode not found',
      pass: false, // ny couples to lengthM, not widthM — always FAIL against "uses width" per generator convention
    },
    {
      question: 'Does (0,0,1) use room height?',
      result: mode001 ? `(0,0,1) uses heightM (${ROOM_DIMS.heightM}m) → ${mode001.freq.toFixed(2)} Hz` : 'mode not found',
      pass: !!mode001, // nz always couples to heightM — this one is aligned with expectation
    },
    {
      question: 'Does 34.3 Hz belong to (1,0,0)?',
      result: mode100 ? `(1,0,0) = ${mode100.freq.toFixed(2)} Hz` : 'mode not found',
      pass: mode100 ? near(mode100.freq, 34.3) : false,
    },
    {
      question: 'Does 38.1 Hz belong to (0,1,0)?',
      result: mode010 ? `(0,1,0) = ${mode010.freq.toFixed(2)} Hz` : 'mode not found',
      pass: mode010 ? near(mode010.freq, 38.1) : false,
    },
    {
      question: 'Does 57.2 Hz belong to (0,0,1)?',
      result: mode001 ? `(0,0,1) = ${mode001.freq.toFixed(2)} Hz` : 'mode not found',
      pass: mode001 ? near(mode001.freq, 57.2) : false,
    },
  ];

  // 4. Production contributor-debug comparison at 28–35 Hz.
  // Build a small lookup of "expected id for that frequency" from the raw generated modes
  // (nearest-mode-frequency match), independent of production's own labelling.
  function expectedIdForFrequency(freqHz) {
    let best = null;
    let bestDist = Infinity;
    rawModes.forEach((m) => {
      const dist = Math.abs(m.freq - freqHz);
      if (dist < bestDist) { bestDist = dist; best = m; }
    });
    return best ? { id: `(${best.nx},${best.ny},${best.nz})`, freq: best.freq, type: best.type } : null;
  }

  const contributorRows = TEST_HZ.map((hz) => {
    const options = buildLiveEngineOptions(hz, SURFACE_ABSORPTION);
    const result = simulateBassResponseRewCore(
      ROOM_DIMS, SEAT,
      { modelKey: '', x: SOURCE.x, y: SOURCE.y, z: SOURCE.z, tuning: {} },
      LIVE_SOURCE_CURVE,
      options
    );
    const series = result.activeModalContributorDebugSeries || [];
    const nearestFrame = series.reduce((bestFrame, frame) => (
      !bestFrame || Math.abs(frame.frequencyHz - hz) < Math.abs(bestFrame.frequencyHz - hz) ? frame : bestFrame
    ), null);
    const dominant = nearestFrame?.contributors?.[0] || null;
    const dominantId = dominant ? `(${dominant.nx},${dominant.ny},${dominant.nz})` : '—';
    const dominantFreq = dominant ? dominant.modeFrequencyHz : null;
    const expected = dominantFreq !== null ? expectedIdForFrequency(dominantFreq) : null;
    const labelMatch = expected && dominant
      ? (expected.id === dominantId ? 'YES' : 'NO')
      : '—';
    return {
      frequencyHz: hz,
      dominantModeId: dominantId,
      nativeFrequencyHz: dominantFreq,
      expectedIdForFrequency: expected ? expected.id : '—',
      labelMatch,
    };
  });

  // 5. Final verdict logic.
  const rawGeneratorCorrect = checklist.filter((c) => ['Does 34.3 Hz belong to (1,0,0)?', 'Does 38.1 Hz belong to (0,1,0)?', 'Does 57.2 Hz belong to (0,0,1)?'].includes(c.question)).every((c) => c.pass) === false
    ? false
    : true;
  // "Raw generator correct" per user's expectation means (1,0,0)=length=34.3Hz and (0,1,0)=width... but
  // the generator's own convention is nx=width, ny=length — so per the generator's OWN internal
  // consistency (not the user's naming expectation), we check whether frequencies match indices consistently.
  const rawGeneratorInternallyConsistent = mode100 && mode010 && mode001
    ? near(mode100.freq, (343 / 2) * (1 / ROOM_DIMS.widthM)) &&
      near(mode010.freq, (343 / 2) * (1 / ROOM_DIMS.lengthM)) &&
      near(mode001.freq, (343 / 2) * (1 / ROOM_DIMS.heightM))
    : false;

  const productionLabelsMismatchDetected = contributorRows.some((r) => r.labelMatch === 'NO');
  const productionReports010Near343 = contributorRows.some((r) => r.dominantModeId === '(0,1,0)' && Number.isFinite(r.nativeFrequencyHz) && near(r.nativeFrequencyHz, 34.3, 0.6));

  let verdict;
  if (productionReports010Near343) {
    verdict = 'AXIS / MODE LABEL MISMATCH CONFIRMED — production reports (0,1,0) at ~34.3 Hz.';
  } else if (rawGeneratorInternallyConsistent && productionLabelsMismatchDetected) {
    verdict = 'DEBUG LABEL MAPPING BUG — raw generator is internally consistent but contributor debug labels diverge.';
  } else if (rawGeneratorInternallyConsistent && !productionLabelsMismatchDetected) {
    verdict = 'AXIS IDENTITY PASSES — proceed to source/seat coordinate parity audit.';
  } else {
    verdict = 'INCONCLUSIVE — raw generator itself is not internally consistent with its own formula.';
  }

  return {
    roomDims: ROOM_DIMS,
    source: SOURCE,
    seat: SEAT,
    axialModeRows,
    checklist,
    contributorRows,
    verdict,
    note: 'nx couples to widthM and ny couples to lengthM in modalCalculations.js — the generator\'s own (1,0,0) is a WIDTH mode, not a length mode. This is why the length-axis fundamental (~34.3 Hz) is generated as (0,1,0), not (1,0,0).',
  };
}