import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COMBINED_RESULT_STATE,
  buildCrossoverConfigurationSignature,
  readCombinedResultSignature,
  writeCombinedResultSignature,
  resolveCombinedResultState,
} from '../src/components/room/bass/combinedResultAuthority.js';
import {
  resolveBassAuthorityState,
  BASS_AUTHORITY_STATE,
} from '../src/components/room/bass/bassAuthorityState.js';

// ── storage stub (refresh / reopen) ────────────────────────────────────────
const store = new Map();
globalThis.window = {
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
  },
};

const saved = { frequencyHz: 100, speakerHpSlopeDbPerOct: 24, subwooferLpSlopeDbPerOct: 24, linkFrequencies: true, subwooferFrequencyHz: 100 };
const movedFrequency = { ...saved, frequencyHz: 120, subwooferFrequencyHz: 120 };
const movedSlope = { ...saved, speakerHpSlopeDbPerOct: 12 };

// A completed, current subwoofer-only authority.
const completedCurrent = {
  authorityStatus: 'AUTHORITATIVE',
  currentFingerprint: 'cal:a',
  contract: { job: { resultFingerprint: 'cal:a' } },
};

test('TEST 1 crossover frequency change needs combined recalculation only', () => {
  writeCombinedResultSignature('project:a', 'version:a', buildCrossoverConfigurationSignature(saved));
  const currentSignature = buildCrossoverConfigurationSignature(movedFrequency);
  const state = resolveCombinedResultState({
    savedSignature: readCombinedResultSignature('project:a', 'version:a'),
    currentSignature,
    subOnlyCurrent: true,
    hasCombinedResult: true,
  });
  assert.equal(state, COMBINED_RESULT_STATE.NEEDS_RECALCULATION);
  // The subwoofer-only authority is untouched by a crossover change.
  assert.equal(resolveBassAuthorityState({ completedBassAuthority: completedCurrent }).code, BASS_AUTHORITY_STATE.CALCULATED_NOT_PUBLISHED);
});

test('TEST 2 crossover slope change is a change too', () => {
  writeCombinedResultSignature('project:b', 'version:b', buildCrossoverConfigurationSignature(saved));
  assert.equal(
    resolveCombinedResultState({
      savedSignature: readCombinedResultSignature('project:b', 'version:b'),
      currentSignature: buildCrossoverConfigurationSignature(movedSlope),
      subOnlyCurrent: true,
      hasCombinedResult: true,
    }),
    COMBINED_RESULT_STATE.NEEDS_RECALCULATION,
  );
});

test('TEST 3 recalculation without changes leaves a current preview', () => {
  const signature = buildCrossoverConfigurationSignature(saved);
  writeCombinedResultSignature('project:c', 'version:c', signature);
  assert.equal(
    resolveCombinedResultState({ savedSignature: readCombinedResultSignature('project:c', 'version:c'), currentSignature: signature, subOnlyCurrent: true, hasCombinedResult: true }),
    COMBINED_RESULT_STATE.CURRENT_PREVIEW,
  );
});

test('TEST 4 a crossover change mid-calculation cannot become current', () => {
  // The request was made at 100 Hz, the design was edited to 120 Hz before the
  // calculation finished: the signature stamped is the one the calculation
  // actually completed on, so the current 120 Hz configuration stays unconfirmed.
  const pendingSignature = buildCrossoverConfigurationSignature(saved);
  writeCombinedResultSignature('project:d', 'version:d', pendingSignature);
  assert.equal(
    resolveCombinedResultState({
      savedSignature: readCombinedResultSignature('project:d', 'version:d'),
      currentSignature: buildCrossoverConfigurationSignature(movedFrequency),
      subOnlyCurrent: true,
      hasCombinedResult: true,
    }),
    COMBINED_RESULT_STATE.NEEDS_RECALCULATION,
  );
});

test('TEST 5 a failed calculation leaves the previous signature and the warning', () => {
  const signature = buildCrossoverConfigurationSignature(saved);
  writeCombinedResultSignature('project:e', 'version:e', signature);
  assert.equal(
    resolveCombinedResultState({
      savedSignature: readCombinedResultSignature('project:e', 'version:e'),
      currentSignature: buildCrossoverConfigurationSignature(movedFrequency),
      subOnlyCurrent: false, // calculation failed: no current result
      hasCombinedResult: true,
    }),
    COMBINED_RESULT_STATE.NEEDS_RECALCULATION,
  );
});

test('TEST 6 signature survives refresh and is per project version', () => {
  const signature = buildCrossoverConfigurationSignature(saved);
  writeCombinedResultSignature('project:f', 'version:f', signature);
  assert.equal(readCombinedResultSignature('project:f', 'version:f'), signature);
  assert.equal(readCombinedResultSignature('project:f', 'version:g'), null);
});

test('TEST 7 outdated result with a previous result asks for recalc, never crossover claims', () => {
  const stale = { ...completedCurrent, authorityStatus: 'STALE', currentFingerprint: 'cal:b' };
  const state = resolveBassAuthorityState({ completedBassAuthority: stale });
  assert.equal(state.code, BASS_AUTHORITY_STATE.NEEDS_CALCULATION);
  assert.equal(state.label, 'Needs recalculation');
  assert.equal(state.actionLabel, 'Recalculate Bass Results');
  assert.match(state.message, /Recalculate Bass Results/);
  assert.doesNotMatch(state.message, /crossover/i);
  assert.doesNotMatch(state.message, /P19|P20/);
});

test('TEST 8 no previous result still asks for a first calculation', () => {
  const state = resolveBassAuthorityState({ completedBassAuthority: null });
  assert.equal(state.code, BASS_AUTHORITY_STATE.NEEDS_CALCULATION);
  assert.equal(state.actionLabel, 'Calculate Bass Performance');
});

test('TEST 9 a current result is never called outdated by a crossover change', () => {
  const state = resolveBassAuthorityState({ completedBassAuthority: completedCurrent });
  assert.notEqual(state.code, BASS_AUTHORITY_STATE.NEEDS_CALCULATION);
  assert.notEqual(state.label, 'Needs recalculation');
});