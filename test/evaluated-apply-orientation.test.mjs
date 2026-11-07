// evaluated-apply-orientation.test.mjs
// Regression tests for the quantity-aware Apply authority's cabinet orientation.
//
// Locks in the confirmed correction: Apply must reproduce the exact evaluated
// cabinet orientation (rotationDeg) and the per-group cabinet axis orientation
// for every subwoofer. Rear cabinets face 180°, front cabinets 0°. The axis
// orientation comes from the project's front/rear group config, NEVER inferred
// as a facing rotation (the old bug passed orientation: 180).
//
// Run: node --import ./test/_alias-register.mjs --test test/evaluated-apply-orientation.test.mjs

import {
  buildQuantityApplyInstances,
  resolveQuantityApplyState,
  isCandidateStale,
} from '../src/components/room/bass/optimiserPlan/quantityPlacementApplyAuthority.js';

let tests = 0;
let passes = 0;
function check(name, actual, expected) {
  tests += 1;
  if (actual === expected) {
    passes += 1;
  } else {
    console.error(`FAIL ${name}: expected ${expected}, got ${actual}`);
  }
}
function checkDeep(name, actual, expected) {
  tests += 1;
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passes += 1;
  else console.error(`FAIL ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// 1. New rear cabinets are created with rotationDeg 180, front with 0.
{
  const coords = [
    { x: 1.0, y: 0.3, placement: 'front' },
    { x: 3.0, y: 0.3, placement: 'front' },
    { x: 1.0, y: 5.7, placement: 'rear' },
    { x: 3.0, y: 5.7, placement: 'rear' },
  ];
  const front = coords.filter((c) => c.placement === 'front');
  const rear = coords.filter((c) => c.placement === 'rear');

  const { instances, createdCount } = buildQuantityApplyInstances({
    coordinates: coords,
    quantity: 4,
    instances: [],
    defaults: {
      model: 'SUB3-12',
      bottomHeightM: 0.05,
      frontOrientation: 'vertical',
      rearOrientation: 'horizontal',
    },
    frontCoords: front,
    rearCoords: rear,
  });

  check('all four cabinets are new', createdCount, 4);
  const enabled = instances.filter((i) => i.enabled !== false);
  check('four enabled cabinets', enabled.length, 4);
  const frontInsts = enabled.filter((i) => i.legacyGroup === 'front');
  const rearInsts = enabled.filter((i) => i.legacyGroup === 'rear');
  check('two front cabinets', frontInsts.length, 2);
  check('two rear cabinets', rearInsts.length, 2);
  checkDeep('front rotations all 0', frontInsts.map((i) => i.rotationDeg), [0, 0]);
  checkDeep('rear rotations all 180', rearInsts.map((i) => i.rotationDeg), [180, 180]);
  checkDeep('front axis orientations', frontInsts.map((i) => i.orientation), ['vertical', 'vertical']);
  checkDeep('rear axis orientations', rearInsts.map((i) => i.orientation), ['horizontal', 'horizontal']);
}

// 2. Matched existing instance has its rotation re-stamped from the candidate wall group.
{
  const existingRear = {
    id: 'sub-rear-1',
    model: 'SUB3-12',
    enabled: true,
    position: { x: 1.0, y: 5.7 },
    bottomHeightM: 0.05,
    rotationDeg: 0, // stale — was a front-facing cabinet reused at the rear wall
    orientation: null,
    legacyGroup: 'rear',
  };
  const coords = [{ x: 1.0, y: 5.7, placement: 'rear' }];

  const { instances } = buildQuantityApplyInstances({
    coordinates: coords,
    quantity: 1,
    instances: [existingRear],
    defaults: {
      model: 'SUB3-12',
      bottomHeightM: 0.05,
      frontOrientation: 'vertical',
      rearOrientation: 'horizontal',
    },
    frontCoords: [],
    rearCoords: coords,
  });

  const enabled = instances.filter((i) => i.enabled !== false);
  check('existing instance reused', enabled.length, 1);
  check('existing instance id retained', enabled[0].id, 'sub-rear-1');
  check('rotation re-stamped to 180 for rear wall', enabled[0].rotationDeg, 180);
  check('axis orientation set from rear group', enabled[0].orientation, 'horizontal');
}

// 3. Axis orientation is never substituted with a facing rotation (180).
{
  const coords = [{ x: 1.0, y: 5.7, placement: 'rear' }];
  const { instances } = buildQuantityApplyInstances({
    coordinates: coords,
    quantity: 1,
    instances: [],
    defaults: {
      model: 'SUB3-12',
      bottomHeightM: 0.05,
      frontOrientation: 'vertical',
      rearOrientation: 'vertical',
    },
    frontCoords: [],
    rearCoords: coords,
  });
  const enabled = instances.filter((i) => i.enabled !== false);
  check('axis orientation is the group config value', enabled[0].orientation, 'vertical');
  check('axis orientation is never 180', enabled[0].orientation === 180, false);
  check('facing rotation lives on rotationDeg', enabled[0].rotationDeg, 180);
}

// 4. Excess instances are disabled (not deleted) so Undo can restore them.
{
  const existing = [
    { id: 'a', model: 'SUB3-12', enabled: true, position: { x: 1, y: 0.3 }, bottomHeightM: 0.05, rotationDeg: 0, orientation: 'vertical', legacyGroup: 'front' },
    { id: 'b', model: 'SUB3-12', enabled: true, position: { x: 3, y: 0.3 }, bottomHeightM: 0.05, rotationDeg: 0, orientation: 'vertical', legacyGroup: 'front' },
    { id: 'c', model: 'SUB3-12', enabled: true, position: { x: 5, y: 0.3 }, bottomHeightM: 0.05, rotationDeg: 0, orientation: 'vertical', legacyGroup: 'front' },
    { id: 'd', model: 'SUB3-12', enabled: true, position: { x: 7, y: 0.3 }, bottomHeightM: 0.05, rotationDeg: 0, orientation: 'vertical', legacyGroup: 'front' },
  ];
  const coords = [
    { x: 1, y: 0.3, placement: 'front' },
    { x: 3, y: 0.3, placement: 'front' },
  ];
  const { instances, disabledCount } = buildQuantityApplyInstances({
    coordinates: coords,
    quantity: 2,
    instances: existing,
    defaults: { model: 'SUB3-12', bottomHeightM: 0.05, frontOrientation: 'vertical', rearOrientation: 'horizontal' },
    frontCoords: coords,
    rearCoords: [],
  });
  const enabled = instances.filter((i) => i.enabled !== false);
  check('two enabled after 4→2', enabled.length, 2);
  check('two disabled after 4→2', disabledCount, 2);
  const disabled = instances.filter((i) => i.enabled === false);
  check('disabled retain their ids', disabled.map((i) => i.id).sort().join(','), 'c,d');
}

// 5. Stale candidate (fingerprint mismatch) is blocked from applying.
{
  const state = resolveQuantityApplyState({
    candidateFingerprint: 'fp-A',
    currentFingerprint: 'fp-B',
    coordinates: [{ x: 1, y: 0.3 }],
    quantity: 1,
  });
  check('stale candidate blocked', state.canApply, false);
  check('stale block reason', state.blockReason, 'stale-candidate-room-or-seating-changed');
}

// 6. Fresh candidate (matching fingerprint) is allowed.
{
  const state = resolveQuantityApplyState({
    candidateFingerprint: 'fp-A',
    currentFingerprint: 'fp-A',
    coordinates: [{ x: 1, y: 0.3 }],
    quantity: 1,
  });
  check('fresh candidate allowed', state.canApply, true);
}

// 7. isCandidateStale edge cases.
{
  check('missing candidate fingerprint is stale', isCandidateStale(null, 'fp'), true);
  check('missing current fingerprint is stale', isCandidateStale('fp', null), true);
  check('matching fingerprints not stale', isCandidateStale('fp', 'fp'), false);
  check('differing fingerprints stale', isCandidateStale('fp-a', 'fp-b'), true);
}

if (passes === tests) {
  console.log('evaluated-apply-orientation: all checks passed');
} else {
  console.error(`${passes}/${tests} checks passed`);
  process.exit(1);
}