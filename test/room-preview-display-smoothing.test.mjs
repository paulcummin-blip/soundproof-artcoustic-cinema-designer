import test from 'node:test';
import assert from 'node:assert/strict';
import { smoothRoomPreviewThirdOctave as smooth } from '../src/components/room/bass/roomPreviewDisplaySmoothing.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const grid = ppo => Array.from({ length: 3 * ppo + 1 }, (_, i) => ({ frequency: 20 * 2 ** (i / ppo), spl: 80 }));
test('flat response, measured endpoints, and original frequency samples are preserved', () => {
  const raw = grid(8), result = smooth(raw);
  assert.deepEqual(result.map(p => p.frequency), raw.map(p => p.frequency));
  result.forEach(p => near(p.spl, 80));
  assert.deepEqual(smooth([]), []);
  assert.deepEqual(smooth([raw[0]]), [raw[0]]);
});
test('exact one-third-octave integral agrees with an analytic log-linear power response at both densities', () => {
  for (const ppo of [8, 96]) {
    const raw = grid(ppo).map(p => ({ ...p, spl: 10 * Math.log10(2 + Math.log2(p.frequency / 20)) }));
    for (const p of smooth(raw)) {
      const x = Math.log2(p.frequency / 20), a = Math.max(0, x - 1 / 6), b = Math.min(3, x + 1 / 6);
      near(p.spl, 10 * Math.log10(2 + (a + b) / 2));
    }
  }
});
test('subdividing the identical piecewise-linear power response does not change matched smoothed values', () => {
  const raw = grid(8).map((p, i) => ({ ...p, spl: 80 + (i === 9 ? 15 : i === 16 ? -20 : Math.sin(i)) }));
  const dense = [];
  for (let i = 0; i < raw.length - 1; i++) for (let j = 0; j < 12; j++) {
    const t = j / 12, a = raw[i], b = raw[i + 1];
    dense.push({ frequency: a.frequency * (b.frequency / a.frequency) ** t,
      spl: 10 * Math.log10((1 - t) * 10 ** (a.spl / 10) + t * 10 ** (b.spl / 10)) });
  }
  dense.push(raw.at(-1));
  const coarseResult = smooth(raw), denseResult = smooth(dense);
  coarseResult.forEach((p, i) => near(p.spl, denseResult[i * 12].spl));
});
test('fractional window edges are continuous when a sample crosses a boundary', () => {
  const base = [{ frequency: 20, spl: 80 }, { frequency: 40, spl: 95 },
    { frequency: 40 * 2 ** (1 / 6), spl: 65 }, { frequency: 60, spl: 80 }, { frequency: 100, spl: 80 }];
  const at = delta => smooth(base.map((p, i) => i === 2 ? { ...p, frequency: p.frequency * (1 + delta) } : p))[1].spl;
  near(at(-1e-8), at(1e-8), 1e-5);
});
test('raw input and separate listener level offsets are retained; broad peaks and nulls survive', () => {
  const raw = grid(96).map(p => ({ ...p, spl: p.frequency > 35 && p.frequency < 50 ? 92 : p.frequency > 65 && p.frequency < 95 ? 65 : 80 }));
  const snapshot = structuredClone(raw), a = smooth(raw), b = smooth(raw.map(p => ({ ...p, spl: p.spl - 5 })));
  assert.deepEqual(raw, snapshot);
  a.forEach((p, i) => near(p.spl - b[i].spl, 5));
  const closest = f => a.reduce((x, p) => Math.abs(p.frequency - f) < Math.abs(x.frequency - f) ? p : x);
  assert.ok(closest(42).spl > 90);
  assert.ok(closest(80).spl < 67);
  assert.ok(a.every(p => p.spl >= 65 - 1e-9 && p.spl <= 92 + 1e-9));
});
