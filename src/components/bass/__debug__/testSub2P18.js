// Temporary pure test harness — no UI, no React, no panels, no memo.
// Traces simulateResponseWithExtrasWrapper → applyDesignEqCurve → computeParam18BassExtension
// for a single fixed SUB2-12 case and returns raw/post-EQ SPL at key frequencies + P18 object.

import { simulateResponseWithExtrasWrapper } from '@/components/bass/bassSimulationEngine';
import { applyDesignEqCurve, computeParam18BassExtension } from '@/components/utils/rp22BassMetrics';

const FREQS = [15, 20, 25, 31.5, 40, 60, 80, 100];

function valAt(curve, f) {
  if (!Array.isArray(curve) || curve.length === 0) return null;
  if (f <= curve[0].frequency) return curve[0].spl;
  if (f >= curve[curve.length - 1].frequency) return curve[curve.length - 1].spl;
  for (let i = 0; i < curve.length - 1; i++) {
    if (f >= curve[i].frequency && f <= curve[i + 1].frequency) {
      const span = curve[i + 1].frequency - curve[i].frequency;
      if (span === 0) return curve[i].spl;
      const r = (f - curve[i].frequency) / span;
      return curve[i].spl + (curve[i + 1].spl - curve[i].spl) * r;
    }
  }
  return null;
}

export async function runSub2P18Test() {
  const roomDimensions = { width: 4, length: 6, height: 2.6 };
  const seatPosition = { x: 2.0, y: 1.6, z: 1.2 };
  const subwoofers = [{
    position: { x: 2.0, y: 0.1, z: 0.35 },
    model: 'sub2-12',
    enabled: true,
    gainDb: 0,
    phaseAdjust: 0,
    delay: 0,
    polarity: 1,
  }];

  const { responseData, rp22Analysis } = simulateResponseWithExtrasWrapper(
    subwoofers,
    seatPosition,
    roomDimensions
  );

  const rawAt = {};
  for (const f of FREQS) rawAt[f] = valAt(responseData, f);

  const postEqCurve = applyDesignEqCurve(responseData);
  const postEqAt = {};
  for (const f of FREQS) postEqAt[f] = valAt(postEqCurve, f);

  const p18 = computeParam18BassExtension(postEqCurve);

  return {
    responseDataLength: Array.isArray(responseData) ? responseData.length : 0,
    rawAt,
    postEqAt,
    p18,
    rp22Analysis,
  };
}

const _selfRunResult = await runSub2P18Test();
export { _selfRunResult };