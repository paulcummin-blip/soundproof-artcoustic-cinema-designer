// apply-freshness.test.mjs
// Focused tests for the candidate Apply freshness boundary.
//
// Verifies that resolveQuantityApplyState rejects a stale candidate when the
// current evaluation fingerprint (independently derived from the current
// design) differs from the candidate's saved run fingerprint, and accepts a
// current candidate whose fingerprints match. This is the Task 3 fix: the
// candidate's SAVED run fingerprint is compared with the CURRENTLY EXPECTED
// Stage 2 fingerprint — not two fingerprints from the same saved state.
//
// Run: node --import ./test/_alias-register.mjs --test test/apply-freshness.test.mjs

import assert from 'node:assert/strict';
import {
  resolveQuantityApplyState,
  isCandidateStale,
} from '@/components/room/bass/optimiserPlan/quantityPlacementApplyAuthority';

const ROOM = { widthM: 5, lengthM: 7, heightM: 2.6 };
const COORDS = [{ x: 1.25, y: 0.1375, placement: 'front' }, { x: 3.75, y: 0.1375, placement: 'front' }];
const MODEL = 'sub2-12';

function makeOption({ valid = true, terminal = false, physicalRejection = null } = {}) {
  return { valid, terminal, physicalRejection };
}

// 1. A stale candidate (saved fingerprint ≠ current expected) is rejected.
{
  const state = resolveQuantityApplyState({
    candidateFingerprint: 'stage2:v3:OLD_RUN',
    currentFingerprint: 'stage2:v3:NEW_EXPECTED',
    coordinates: COORDS,
    quantity: 2,
    option: makeOption(),
    roomDims: ROOM,
    model: MODEL,
  });
  assert.equal(state.canApply, false, 'stale candidate rejected');
  assert.equal(state.blockReason, 'stale-candidate-room-or-seating-changed');
  console.log('  ✔ Stale candidate (fingerprint mismatch) rejected at Apply');
}

// 2. A current candidate (saved fingerprint === current expected) is accepted.
{
  const state = resolveQuantityApplyState({
    candidateFingerprint: 'stage2:v3:CURRENT',
    currentFingerprint: 'stage2:v3:CURRENT',
    coordinates: COORDS,
    quantity: 2,
    option: makeOption(),
    roomDims: ROOM,
    model: MODEL,
  });
  assert.equal(state.canApply, true, 'current candidate accepted');
  assert.equal(state.blockReason, null);
  console.log('  ✔ Current candidate (matching fingerprints) accepted at Apply');
}

// 3. A null candidate fingerprint is always stale (no fallback to current).
{
  const state = resolveQuantityApplyState({
    candidateFingerprint: null,
    currentFingerprint: 'stage2:v3:CURRENT',
    coordinates: COORDS,
    quantity: 2,
    option: makeOption(),
    roomDims: ROOM,
    model: MODEL,
  });
  assert.equal(state.canApply, false, 'null candidate fingerprint rejected');
  assert.equal(state.blockReason, 'stale-candidate-room-or-seating-changed');
  console.log('  ✔ Null candidate fingerprint rejected (no fallback to current)');
}

// 4. A null current fingerprint (Stage 2 not yet evaluated) is stale.
{
  const state = resolveQuantityApplyState({
    candidateFingerprint: 'stage2:v3:OLD_RUN',
    currentFingerprint: null,
    coordinates: COORDS,
    quantity: 2,
    option: makeOption(),
    roomDims: ROOM,
    model: MODEL,
  });
  assert.equal(state.canApply, false, 'null current fingerprint rejected');
  console.log('  ✔ Null current fingerprint (Stage 2 not evaluated) rejected');
}

// 5. isCandidateStale directly: mismatch → stale, match → fresh, null → stale.
{
  assert.equal(isCandidateStale('a', 'b'), true, 'mismatch is stale');
  assert.equal(isCandidateStale('a', 'a'), false, 'match is fresh');
  assert.equal(isCandidateStale(null, 'a'), true, 'null candidate is stale');
  assert.equal(isCandidateStale('a', null), true, 'null current is stale');
  assert.equal(isCandidateStale(null, null), true, 'both null is stale');
  console.log('  ✔ isCandidateStale: mismatch/null → stale, match → fresh');
}

// 6. A physically rejected option is rejected even when fingerprints match.
{
  const state = resolveQuantityApplyState({
    candidateFingerprint: 'stage2:v3:CURRENT',
    currentFingerprint: 'stage2:v3:CURRENT',
    coordinates: COORDS,
    quantity: 2,
    option: makeOption({ physicalRejection: { reason: 'cabinet-boundary' } }),
    roomDims: ROOM,
    model: MODEL,
  });
  assert.equal(state.canApply, false, 'physically rejected option blocked');
  assert.equal(state.blockReason, 'physical-rejection');
  console.log('  ✔ Physically rejected option blocked at Apply');
}

// 7. A terminal option is rejected even when fingerprints match.
{
  const state = resolveQuantityApplyState({
    candidateFingerprint: 'stage2:v3:CURRENT',
    currentFingerprint: 'stage2:v3:CURRENT',
    coordinates: COORDS,
    quantity: 2,
    option: makeOption({ terminal: true }),
    roomDims: ROOM,
    model: MODEL,
  });
  assert.equal(state.canApply, false, 'terminal option blocked');
  assert.equal(state.blockReason, 'terminal-candidate');
  console.log('  ✔ Terminal option blocked at Apply');
}

// 8. An option with invalid evidence (valid === false) is rejected.
{
  const state = resolveQuantityApplyState({
    candidateFingerprint: 'stage2:v3:CURRENT',
    currentFingerprint: 'stage2:v3:CURRENT',
    coordinates: COORDS,
    quantity: 2,
    option: makeOption({ valid: false }),
    roomDims: ROOM,
    model: MODEL,
  });
  assert.equal(state.canApply, false, 'invalid-evidence option blocked');
  assert.equal(state.blockReason, 'missing-p19-p20-evidence');
  console.log('  ✔ Invalid-evidence option blocked at Apply');
}

console.log('\napply-freshness: all checks passed');