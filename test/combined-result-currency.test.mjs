// Combined LCR + subwoofer result — currency contract.
//
// The combined result has NO stored identity of its own: it is derived on every
// render from the crossover configuration AND the authoritative room / speaker /
// subwoofer / seating transfers, and it is always provisional. Therefore it can
// never be presented as a Current, published result that lags the design — if
// either input changes, the combined result changes with it.
//
// These assertions pin that contract. They change no modelling: they call the
// existing pure modules and compare their own outputs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCombinedSystemResponse } from '../src/components/room/bass/combinedSystemResponse.js';
import { buildProvisionalCombinedAssessment } from '../src/components/room/bass/provisionalCombinedAssessment.js';

const frequencies = [20, 25, 30, 35, 40, 50, 60, 80, 100, 120, 160];
const transfer = (splAt) => frequencies.map((f) => {
  const magnitude = Math.pow(10, splAt(f) / 20);
  return { frequency: f, re: magnitude, im: 0 };
});
const subPoints = transfer((f) => (f < 40 ? -8 : 0));
const speakerPoints = transfer(() => 0);
const crossoverAt = (hz) => ({
  frequencyHz: hz,
  subwooferFrequencyHz: hz,
  linkFrequencies: true,
  speakerHpSlopeDbPerOct: 24,
  subwooferLpSlopeDbPerOct: 24,
});

const build = ({ crossover, sub = subPoints, speaker = speakerPoints, seats = ['rsp', 'seat-2'] }) =>
  buildCombinedSystemResponse({
    frequenciesHz: frequencies,
    seats: seats.map((seatId) => ({ seatId, isRsp: seatId === 'rsp' })),
    subTransfersBySeat: Object.fromEntries(seats.map((s) => [s, [{ sourceId: 'sub-1', points: sub }]])),
    speakerTransfersBySeat: Object.fromEntries(seats.map((s) => [s, [{ sourceId: 'lcr-FL', modelKey: 'q6-3', points: speaker }]])),
    crossover,
    primarySeatId: 'rsp',
  });

const at = (curve, hz) => curve.find((p) => p.frequency === hz)?.spl ?? null;
const curveOf = (result) => result.combinedBySeat.rsp.map((p) => p.spl);
const same = (a, b) => a.length === b.length && a.every((value, i) => Math.abs(value - b[i]) < 1e-9);

// 1. Crossover configuration is part of the result's identity.
test('a crossover frequency change produces a different combined result', () => {
  const low = build({ crossover: crossoverAt(60) });
  const high = build({ crossover: crossoverAt(120) });
  assert.equal(low.available, true);
  assert.equal(high.available, true);
  assert.equal(same(curveOf(low), curveOf(high)), false);
  assert.equal(Math.abs(at(low.combinedBySeat.rsp, 80) - at(high.combinedBySeat.rsp, 80)) > 0.5, true);
});

// 2. Crossover slope is part of the same identity.
test('a crossover slope change produces a different combined result', () => {
  const lr4 = build({ crossover: crossoverAt(100) });
  const lr2 = build({ crossover: { ...crossoverAt(100), speakerHpSlopeDbPerOct: 12, subwooferLpSlopeDbPerOct: 12 } });
  assert.equal(same(curveOf(lr4), curveOf(lr2)), false);
});

// 3. The underlying room / speaker / subwoofer / seating transfer identity is
//    part of the result's identity: different transfers, same crossover.
test('a changed underlying transfer produces a different combined result', () => {
  const reference = build({ crossover: crossoverAt(100) });
  const movedSub = build({ crossover: crossoverAt(100), sub: transfer((f) => (f < 40 ? -14 : -3)) });
  const movedSpeaker = build({ crossover: crossoverAt(100), speaker: transfer((f) => (f < 120 ? -6 : -2)) });
  assert.equal(same(curveOf(reference), curveOf(movedSub)), false);
  assert.equal(same(curveOf(reference), curveOf(movedSpeaker)), false);
});

// 4. There is no persisted combined result to name Current: the assessment says
//    so itself and carries no currency, fingerprint or publication field.
test('the combined assessment is provisional and carries no stored currency', () => {
  const combined = build({ crossover: crossoverAt(100) });
  const targetCurve = frequencies.map((f) => ({ frequency: f, spl: 0 }));
  const assessment = buildProvisionalCombinedAssessment({
    combined,
    achievedP18Hz: 30,
    transitionHz: 120,
    targetCurve,
  });
  assert.equal(assessment.provisional, true);
  for (const key of ['code', 'status', 'authorityStatus', 'resultFingerprint', 'publishedFingerprint']) {
    assert.equal(key in assessment, false, `combined assessment must not carry ${key}`);
  }
});

// 5. The provisional grading follows the published contract it is read against,
//    so a contract change is reflected rather than retained.
test('a changed published contract changes the provisional band and result', () => {
  const combined = build({ crossover: crossoverAt(100) });
  const targetCurve = frequencies.map((f) => ({ frequency: f, spl: 0 }));
  const lowP18 = buildProvisionalCombinedAssessment({ combined, achievedP18Hz: 25, transitionHz: 120, targetCurve });
  const highP18 = buildProvisionalCombinedAssessment({ combined, achievedP18Hz: 45, transitionHz: 120, targetCurve });
  assert.equal(lowP18.available, true);
  assert.equal(highP18.available, true);
  assert.notEqual(lowP18.band.lowerHz, highP18.band.lowerHz);
});

// 6. Seat identity participates: adding a seat changes the seat-to-seat result
//    rather than leaving the previous set in place.
test('the seat set is read from the current design, not retained', () => {
  const twoSeats = build({ crossover: crossoverAt(100) });
  const oneSeat = build({ crossover: crossoverAt(100), seats: ['rsp'] });
  assert.deepEqual(Object.keys(twoSeats.combinedBySeat), ['rsp', 'seat-2']);
  assert.deepEqual(Object.keys(oneSeat.combinedBySeat), ['rsp']);
});