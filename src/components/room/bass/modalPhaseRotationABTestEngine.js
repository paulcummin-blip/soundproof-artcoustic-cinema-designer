// modalPhaseRotationABTestEngine.js
// Pure, read-only A/B test engine — Test A (production baseline) vs Test B
// (rewParityModalPhase: true, pureDeterministicModalSum: true).
// Uses the production simulateBassResponseRewCore engine unmodified for both runs.
// No changes to Q, damping, coupling, transfer function, source curve, summation, or smoothing.

import { simulateBassResponseRewCore } from '@/bass/core/rewBassEngine';
import { LIVE_SOURCE_CURVE, buildLiveEngineOptions } from '@/components/room/bass/liveBassAuditOptions';

export const TARGET_HZ = [29.5, 30, 32, 35, 40, 40.6, 45, 50, 57, 58];

function findClosestDb(freqsHz, splDbRaw, targetHz) {
  let bestIdx = -1;
  let bestDist = Infinity;
  for (let i = 0; i < freqsHz.length; i += 1) {
    const dist = Math.abs(freqsHz[i] - targetHz);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  return bestIdx >= 0 ? splDbRaw[bestIdx] : null;
}

// Runs both Test A and Test B for a single seat at a single target frequency,
// using a narrow freq window (matches convention used by other live audits).
function runSeatAtFrequency(roomDims, seatPos, source, surfaceAbsorption, frequencyHz) {
  const baseOptions = buildLiveEngineOptions(frequencyHz, surfaceAbsorption);

  // Test A: production baseline — exact same options as the live graph uses.
  const optionsA = { ...baseOptions };

  // Test B: disable modal propagation phase + deterministic modal phase perturbation only.
  // rewParityModalPhase forces disableModalPropagationPhase=true and propagationPhaseScale=0
  // inside the engine; pureDeterministicModalSum=true removes the deterministic per-mode
  // phase perturbation from the active modal sum. All other options are identical to Test A.
  const optionsB = {
    ...baseOptions,
    rewParityModalPhase: true,
    pureDeterministicModalSum: true,
  };

  const resultA = simulateBassResponseRewCore(roomDims, seatPos, source, LIVE_SOURCE_CURVE, optionsA);
  const resultB = simulateBassResponseRewCore(roomDims, seatPos, source, LIVE_SOURCE_CURVE, optionsB);

  const dbA = findClosestDb(resultA.freqsHz, resultA.splDbRaw, frequencyHz);
  const dbB = findClosestDb(resultB.freqsHz, resultB.splDbRaw, frequencyHz);

  return { dbA, dbB, deltaBMinusA: (Number.isFinite(dbA) && Number.isFinite(dbB)) ? (dbB - dbA) : null };
}

export function runModalPhaseRotationABTest(roomDims, seatsById, source, surfaceAbsorption) {
  const seatResults = {};

  Object.entries(seatsById).forEach(([label, seat]) => {
    if (!seat) {
      seatResults[label] = null;
      return;
    }
    const seatPos = { x: seat.x, y: seat.y, z: Number.isFinite(Number(seat.z)) ? Number(seat.z) : 1.2 };
    const rows = TARGET_HZ.map((hz) => {
      const { dbA, dbB, deltaBMinusA } = runSeatAtFrequency(roomDims, seatPos, source, surfaceAbsorption, hz);
      return { hz, dbA, dbB, deltaBMinusA };
    });
    seatResults[label] = rows;
  });

  return seatResults;
}

// Pass-criteria evaluation, applied per seat, over the produced rows.
export function evaluatePassCriteria(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { nullWidthImproved: null, peakPreserved: null, noNewNotch: null };
  }
  const getRow = (hz) => rows.find((r) => r.hz === hz) || null;

  // Null width improves 30–45 Hz: average dB across 30/32/35/40/40.6/45 should rise in Test B
  // relative to Test A (i.e. positive average delta = shallower/narrower null = "improved").
  const nullBandHz = [30, 32, 35, 40, 40.6, 45];
  const nullDeltas = nullBandHz.map((hz) => getRow(hz)?.deltaBMinusA).filter((v) => Number.isFinite(v));
  const avgNullDelta = nullDeltas.length > 0 ? nullDeltas.reduce((a, b) => a + b, 0) / nullDeltas.length : null;
  const nullWidthImproved = Number.isFinite(avgNullDelta) ? avgNullDelta < -0.1 : null;
  // Note: "improves" here is interpreted as recovery becoming LESS fast, i.e. dB in the
  // 30-45Hz band should drop (deeper/wider null) relative to production. A negative delta
  // (Test B lower than Test A) indicates the null is deeper/wider, i.e. slower recovery.

  // 57/58 Hz peak not destroyed: delta at 57/58 Hz should not collapse by more than 3 dB.
  const peak57 = getRow(57)?.deltaBMinusA;
  const peak58 = getRow(58)?.deltaBMinusA;
  const peakPreserved = [peak57, peak58].every((v) => !Number.isFinite(v) || v > -3);

  // No new artificial notch: no single frequency point should show an unexplained
  // isolated drop >6dB not present in adjacent points (crude local-outlier check).
  let noNewNotch = true;
  for (let i = 1; i < rows.length - 1; i += 1) {
    const prev = rows[i - 1]?.deltaBMinusA;
    const curr = rows[i]?.deltaBMinusA;
    const next = rows[i + 1]?.deltaBMinusA;
    if (![prev, curr, next].every((v) => Number.isFinite(v))) continue;
    const localDip = curr - Math.max(prev, next);
    if (localDip < -6) {
      noNewNotch = false;
      break;
    }
  }

  return { nullWidthImproved, peakPreserved, noNewNotch, avgNullDelta };
}