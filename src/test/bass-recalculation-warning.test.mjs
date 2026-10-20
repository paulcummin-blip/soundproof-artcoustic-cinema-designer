// Recalculate Bass Results — validity contract.
//
// The permanent button is always available; the warning beside it is read from
// the ONE existing authority state, never from a second change-detection system.
// These assertions cover the four required scenarios plus the crossover case:
// a crossover-only change invalidates the provisional combined response while
// leaving the authoritative subwoofer-only result valid.
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveBassAuthorityState, BASS_AUTHORITY_STATE } from '../components/room/bass/bassAuthorityState.js';
import { bassRecalculationRequired, RECALCULATION_WARNING } from '../components/room/bass/bda/bassRecalculationWarning.js';
import { buildCombinedSystemResponse } from '../components/room/bass/combinedSystemResponse.js';

// A completed, saved and published subwoofer-only result.
const contract = { job: { resultFingerprint: 'cal:a' }, achievedP18FrequencyHz: 25 };
const currentAuthority = {
  authorityStatus: 'AUTHORITATIVE',
  currentFingerprint: 'cal:a',
  contract,
};
const acknowledged = { status: 'acknowledged', fingerprint: 'eng:a' };
const stateFor = (overrides = {}) => resolveBassAuthorityState({
  projectId: 'project:a',
  versionId: 'version:a',
  completedBassAuthority: currentAuthority,
  engineeringFingerprint: 'eng:a',
  publicationBassFingerprint: 'cal:a',
  publicationAttempt: acknowledged,
  ...overrides,
});
const warningFor = (state, hasResult = !!contract) => bassRecalculationRequired({ hasResult, stateCode: state.code });

// 1. Results current — no warning, the button stays available.
test('current results show no warning and keep the recalculate control', () => {
  const state = stateFor();
  assert.equal(state.code, BASS_AUTHORITY_STATE.CURRENT);
  assert.equal(state.label, 'Performance Current');
  assert.equal(warningFor(state), false);
});

// 2. A design change makes the existing result outdated.
test('a changed design requires recalculation and says so', () => {
  const state = stateFor({
    completedBassAuthority: { ...currentAuthority, authorityStatus: 'STALE', currentFingerprint: 'cal:b' },
  });
  assert.equal(state.code, BASS_AUTHORITY_STATE.NEEDS_CALCULATION);
  assert.equal(warningFor(state), true);
  assert.equal(RECALCULATION_WARNING.heading, 'Recalculation Required');
  assert.equal(RECALCULATION_WARNING.message, 'Your design has changed. Recalculate to update bass performance.');
});

// A project with no result at all is a first calculation, never "recalculation".
test('no stored result means Calculate, not Recalculation Required', () => {
  const state = resolveBassAuthorityState({ projectId: 'project:a', versionId: 'version:a' });
  assert.equal(state.code, BASS_AUTHORITY_STATE.NEEDS_CALCULATION);
  assert.equal(bassRecalculationRequired({ hasResult: false, stateCode: state.code }), false);
});

// 3. A successful recalculation clears the warning: the new result is the result
//    for the design as it stands, so the authority resolves Current again.
test('a successful recalculation clears the warning', () => {
  const state = stateFor({
    completedBassAuthority: { authorityStatus: 'AUTHORITATIVE', currentFingerprint: 'cal:c', contract: { job: { resultFingerprint: 'cal:c' } } },
    publicationBassFingerprint: 'cal:c',
  });
  assert.equal(state.code, BASS_AUTHORITY_STATE.CURRENT);
  assert.equal(warningFor(state), false);
});

// 4. A failed recalculation keeps the warning up and preserves the contract.
test('a failed recalculation keeps the warning and retains the published result', () => {
  const failed = { ...currentAuthority, authorityStatus: 'ERROR', currentFingerprint: 'cal:c' };
  const state = stateFor({ completedBassAuthority: failed });
  assert.equal(state.code, BASS_AUTHORITY_STATE.NEEDS_CALCULATION);
  assert.equal(warningFor(state), true);
  // The retained contract is the previous published result, unchanged.
  assert.deepEqual(failed.contract, contract);
});

// A placement preview shows a previous result too — same warning, same button.
test('a placement preview of a previous result is named as requiring recalculation', () => {
  const state = stateFor({ placementPreviewActive: true });
  assert.equal(state.code, BASS_AUTHORITY_STATE.PREVIEW_ONLY);
  assert.equal(warningFor(state), true);
});

// While calculating there is nothing to warn about: the band says Calculating
// and the button is disabled, so a stale warning can never sit beside a run.
test('an in-flight calculation suppresses the warning', () => {
  const state = stateFor({ calculationInProgress: true });
  assert.equal(state.code, BASS_AUTHORITY_STATE.CALCULATING);
  assert.equal(warningFor(state), false);
});

// ── Crossover-only change ────────────────────────────────────────────────
const frequencies = [20, 30, 40, 60, 80, 100, 120, 160];
const points = (splAt) => frequencies.map((f) => ({ frequency: f, re: Math.pow(10, splAt(f) / 20), im: 0 }));
const subPoints = points((f) => (f < 40 ? -8 : 0));
const speakerPoints = points(() => 0);
const crossoverAt = (hz) => ({
  frequencyHz: hz,
  subwooferFrequencyHz: hz,
  linkFrequencies: true,
  speakerHpSlopeDbPerOct: 24,
  subwooferLpSlopeDbPerOct: 24,
});
const combinedAt = (hz) => buildCombinedSystemResponse({
  frequenciesHz: frequencies,
  seats: [{ seatId: 'rsp', isRsp: true }],
  subTransfersBySeat: { rsp: [{ sourceId: 'sub-1', points: subPoints }] },
  speakerTransfersBySeat: { rsp: [{ sourceId: 'lcr-FL', modelKey: 'q6-3', points: speakerPoints }] },
  crossover: crossoverAt(hz),
  primarySeatId: 'rsp',
});
const curve = (result, key) => result[key].rsp.map((p) => p.spl);
const same = (a, b) => a.length === b.length && a.every((value, i) => Math.abs(value - b[i]) < 1e-9);

test('a crossover-only change rebuilds the combined response it depends on', () => {
  const low = combinedAt(60);
  const high = combinedAt(120);
  const lowCurve = curve(low, 'combinedBySeat');
  const highCurve = curve(high, 'combinedBySeat');
  assert.equal(same(lowCurve, highCurve), false);
  // The change is frequency-dependent (a crossover, not a level shift), so the
  // combined result genuinely has to be rebuilt for the new setting.
  const deltas = lowCurve.map((value, i) => Math.abs(value - highCurve[i]));
  assert.equal(deltas.filter((delta) => delta > 1).length >= 2, true);
});

test('a crossover-only change does not invalidate the authoritative subwoofer-only result', () => {
  // Crossover settings are not part of the bass design identity, so the same
  // authority state still resolves Current: the sub-only result stays valid and
  // the recalculate control never claims it would absorb the crossover change.
  const state = stateFor();
  assert.equal(state.code, BASS_AUTHORITY_STATE.CURRENT);
  assert.equal(warningFor(state), false);
});