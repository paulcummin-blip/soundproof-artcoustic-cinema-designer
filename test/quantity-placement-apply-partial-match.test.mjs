// quantity-placement-apply-partial-match.test.mjs
// Focused regression tests for the quantity-aware Apply authority's
// one-to-one assignment and complete-arrangement validation.
//
// Locks in the confirmed correction to the partial-match geometry defect:
// the creation loop previously started at `next.length` and indexed into
// `targetCoords` from there, treating the number of matched instances as
// the index of the next unmatched coordinate. When matches were partial and
// not at the beginning (e.g. candidate positions 2–4 matched, position 1
// missing) that loop re-created an already matched coordinate and never
// created the missing one — producing a partial, duplicated arrangement that
// was still committed.
//
// The corrected authority:
//   - Assigns each candidate coordinate to exactly one existing compatible
//     instance (one-to-one; never reuses an instance for two coordinates).
//   - Creates an instance for every explicitly unmatched candidate position,
//     regardless of its index.
//   - Disables surplus instances.
//   - Validates the complete proposed arrangement against the candidate with
//     the existing authoritative unordered per-group position matcher, and
//     rejects Apply (returning the original instances unchanged) on any
//     mismatch — never committing, calculating or publishing a partial result.
//
// Run: node --import ./test/_alias-register.mjs --test test/quantity-placement-apply-partial-match.test.mjs

import { buildQuantityApplyInstances } from '../src/components/room/bass/optimiserPlan/quantityPlacementApplyAuthority.js';
import { coordinatesMatch } from '../src/components/room/bass/best-layout/applyRecommendationUtils.js';

let tests = 0;
let passes = 0;
function check(name, actual, expected) {
  tests += 1;
  const ok = actual === expected;
  if (ok) passes += 1;
  else console.error(`FAIL ${name}: expected ${expected}, got ${actual}`);
}
function checkDeep(name, actual, expected) {
  tests += 1;
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passes += 1;
  else console.error(`FAIL ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function ok(name, condition) {
  tests += 1;
  if (condition) passes += 1;
  else console.error(`FAIL ${name}: expected truthy`);
}

// Room 5.0 x 8.0 m. The reported four-sub candidate:
//   front-left  (0.40, 0.64)   front-right (4.60, 0.64)
//   rear-left   (0.40, 7.36)  rear-right  (4.60, 7.36)
const FRONT = [
  { x: 0.40, y: 0.64, placement: 'front' },
  { x: 4.60, y: 0.64, placement: 'front' },
];
const REAR = [
  { x: 0.40, y: 7.36, placement: 'rear' },
  { x: 4.60, y: 7.36, placement: 'rear' },
];
const FOUR = [...FRONT, ...REAR];

const DEFAULTS = {
  model: 'SUB3-12',
  bottomHeightM: 0.05,
  frontOrientation: 'vertical',
  rearOrientation: 'horizontal',
};

function enabledSources(instances) {
  return instances
    .filter((i) => i.enabled !== false)
    .map((i) => ({
      x: Number(i.position.x),
      y: Number(i.position.y),
      placement: i.legacyGroup === 'rear' ? 'rear' : 'front',
    }));
}

function enabledCount(instances) {
  return instances.filter((i) => i.enabled !== false).length;
}

// Every successful Apply must produce a complete one-to-one match with the
// evaluated candidate: the enabled positions, grouped by wall, match the
// candidate exactly (same count, same coordinates, unordered within group).
function assertCompleteMatch(name, result, candidateCoords) {
  ok(`${name}: result is valid`, result.valid === true);
  ok(`${name}: no error`, result.error === null);
  const candidateSources = candidateCoords.map((c) => ({
    x: Number(c.x),
    y: Number(c.y),
    placement: c.placement,
  }));
  ok(`${name}: complete one-to-one match`, coordinatesMatch(enabledSources(result.instances), candidateSources));
}

// 1. Zero existing matching instances — all four created, complete match.
{
  const result = buildQuantityApplyInstances({
    coordinates: FOUR,
    quantity: 4,
    instances: [],
    defaults: DEFAULTS,
    frontCoords: FRONT,
    rearCoords: REAR,
  });
  check('1: four created from empty', result.createdCount, 4);
  check('1: four enabled', enabledCount(result.instances), 4);
  check('1: none disabled', result.disabledCount, 0);
  assertCompleteMatch('1', result, FOUR);
}

// 2. All candidate positions already matched — all reused, none created.
{
  const existing = FOUR.map((c, i) => ({
    id: `sub-${i + 1}`,
    model: 'SUB3-12',
    enabled: true,
    position: { x: c.x, y: c.y },
    bottomHeightM: 0.05,
    rotationDeg: c.placement === 'rear' ? 180 : 0,
    orientation: c.placement === 'rear' ? 'horizontal' : 'vertical',
    legacyGroup: c.placement,
    gainDb: 0,
    delayMs: 0,
    polarity: 1,
  }));
  const result = buildQuantityApplyInstances({
    coordinates: FOUR,
    quantity: 4,
    instances: existing,
    defaults: DEFAULTS,
    frontCoords: FRONT,
    rearCoords: REAR,
  });
  check('2: none created when all match', result.createdCount, 0);
  check('2: four reused', result.appliedCount, 4);
  check('2: four enabled', enabledCount(result.instances), 4);
  checkDeep('2: existing ids preserved', result.instances.filter((i) => i.enabled !== false).map((i) => i.id).sort(), ['sub-1', 'sub-2', 'sub-3', 'sub-4']);
  assertCompleteMatch('2', result, FOUR);
}

// 3. Partial matches at the beginning (positions 1-2 matched, 3-4 missing).
{
  const existing = [
    { id: 'a', model: 'SUB3-12', enabled: true, position: { x: 0.40, y: 0.64 }, bottomHeightM: 0.05, rotationDeg: 0, orientation: 'vertical', legacyGroup: 'front' },
    { id: 'b', model: 'SUB3-12', enabled: true, position: { x: 4.60, y: 0.64 }, bottomHeightM: 0.05, rotationDeg: 0, orientation: 'vertical', legacyGroup: 'front' },
  ];
  const result = buildQuantityApplyInstances({
    coordinates: FOUR,
    quantity: 4,
    instances: existing,
    defaults: DEFAULTS,
    frontCoords: FRONT,
    rearCoords: REAR,
  });
  check('3: two created for the missing rear positions', result.createdCount, 2);
  check('3: four enabled', enabledCount(result.instances), 4);
  const enabled = result.instances.filter((i) => i.enabled !== false);
  const rearCreated = enabled.filter((i) => i.legacyGroup === 'rear' && !['a', 'b'].includes(i.id));
  check('3: rear cabinets created at exact coordinates', rearCreated.length, 2);
  checkDeep('3: rear created coordinates', rearCreated.map((i) => [i.position.x, i.position.y]).sort(), [[0.40, 7.36], [4.60, 7.36]]);
  assertCompleteMatch('3', result, FOUR);
}

// 4. Partial matches in the middle (positions 1 and 4 matched, 2-3 missing).
{
  const existing = [
    { id: 'a', model: 'SUB3-12', enabled: true, position: { x: 0.40, y: 0.64 }, bottomHeightM: 0.05, rotationDeg: 0, orientation: 'vertical', legacyGroup: 'front' },
    { id: 'd', model: 'SUB3-12', enabled: true, position: { x: 4.60, y: 7.36 }, bottomHeightM: 0.05, rotationDeg: 180, orientation: 'horizontal', legacyGroup: 'rear' },
  ];
  const result = buildQuantityApplyInstances({
    coordinates: FOUR,
    quantity: 4,
    instances: existing,
    defaults: DEFAULTS,
    frontCoords: FRONT,
    rearCoords: REAR,
  });
  check('4: two created for the missing middle positions', result.createdCount, 2);
  check('4: four enabled', enabledCount(result.instances), 4);
  assertCompleteMatch('4', result, FOUR);
  const enabled = result.instances.filter((i) => i.enabled !== false);
  ok('4: front-right (4.60,0.64) present exactly once', enabled.filter((i) => Math.abs(i.position.x - 4.60) < 0.01 && Math.abs(i.position.y - 0.64) < 0.01).length === 1);
  ok('4: rear-left (0.40,7.36) present exactly once', enabled.filter((i) => Math.abs(i.position.x - 0.40) < 0.01 && Math.abs(i.position.y - 7.36) < 0.01).length === 1);
}

// 5. Partial matches at the end (positions 3-4 matched, 1-2 missing).
{
  const existing = [
    { id: 'c', model: 'SUB3-12', enabled: true, position: { x: 0.40, y: 7.36 }, bottomHeightM: 0.05, rotationDeg: 180, orientation: 'horizontal', legacyGroup: 'rear' },
    { id: 'd', model: 'SUB3-12', enabled: true, position: { x: 4.60, y: 7.36 }, bottomHeightM: 0.05, rotationDeg: 180, orientation: 'horizontal', legacyGroup: 'rear' },
  ];
  const result = buildQuantityApplyInstances({
    coordinates: FOUR,
    quantity: 4,
    instances: existing,
    defaults: DEFAULTS,
    frontCoords: FRONT,
    rearCoords: REAR,
  });
  check('5: two created for the missing front positions', result.createdCount, 2);
  check('5: four enabled', enabledCount(result.instances), 4);
  assertCompleteMatch('5', result, FOUR);
  const enabled = result.instances.filter((i) => i.enabled !== false);
  ok('5: front-left (0.40,0.64) present exactly once', enabled.filter((i) => Math.abs(i.position.x - 0.40) < 0.01 && Math.abs(i.position.y - 0.64) < 0.01).length === 1);
  ok('5: front-right (4.60,0.64) present exactly once', enabled.filter((i) => Math.abs(i.position.x - 4.60) < 0.01 && Math.abs(i.position.y - 0.64) < 0.01).length === 1);
}

// 6. THE EXACT REPORTED CASE: positions 2-4 matched (as disabled instances),
//    position 1 (front-left) missing. The old loop created a DUPLICATE at
//    position 4 and never created position 1.
{
  const existing = [
    { id: 'b', model: 'SUB3-12', enabled: false, position: { x: 4.60, y: 0.64 }, bottomHeightM: 0.05, rotationDeg: 0, orientation: 'vertical', legacyGroup: 'front' },
    { id: 'c', model: 'SUB3-12', enabled: false, position: { x: 0.40, y: 7.36 }, bottomHeightM: 0.05, rotationDeg: 180, orientation: 'horizontal', legacyGroup: 'rear' },
    { id: 'd', model: 'SUB3-12', enabled: false, position: { x: 4.60, y: 7.36 }, bottomHeightM: 0.05, rotationDeg: 180, orientation: 'horizontal', legacyGroup: 'rear' },
  ];
  const result = buildQuantityApplyInstances({
    coordinates: FOUR,
    quantity: 4,
    instances: existing,
    defaults: DEFAULTS,
    frontCoords: FRONT,
    rearCoords: REAR,
  });
  check('6: exactly one created (the missing front-left)', result.createdCount, 1);
  check('6: three reused', result.appliedCount, 3);
  check('6: four enabled', enabledCount(result.instances), 4);
  const enabled = result.instances.filter((i) => i.enabled !== false);
  // Four DISTINCT enabled cabinets at the four evaluated coordinates.
  ok('6: front-left (0.40,0.64) present exactly once', enabled.filter((i) => Math.abs(i.position.x - 0.40) < 0.01 && Math.abs(i.position.y - 0.64) < 0.01).length === 1);
  ok('6: front-right (4.60,0.64) present exactly once', enabled.filter((i) => Math.abs(i.position.x - 4.60) < 0.01 && Math.abs(i.position.y - 0.64) < 0.01).length === 1);
  ok('6: rear-left (0.40,7.36) present exactly once', enabled.filter((i) => Math.abs(i.position.x - 0.40) < 0.01 && Math.abs(i.position.y - 7.36) < 0.01).length === 1);
  ok('6: rear-right (4.60,7.36) present exactly once', enabled.filter((i) => Math.abs(i.position.x - 4.60) < 0.01 && Math.abs(i.position.y - 7.36) < 0.01).length === 1);
  // The three matched disabled instances are re-enabled (reused), not duplicated.
  checkDeep('6: reused ids preserved', enabled.map((i) => i.id).filter((id) => ['b', 'c', 'd'].includes(id)).sort(), ['b', 'c', 'd']);
  assertCompleteMatch('6', result, FOUR);
}

// 7. Duplicate existing instances at the same coordinate — one matched, the
//    other disabled (never two enabled at the same candidate position).
{
  const existing = [
    { id: 'dup-1', model: 'SUB3-12', enabled: true, position: { x: 0.40, y: 0.64 }, bottomHeightM: 0.05, rotationDeg: 0, orientation: 'vertical', legacyGroup: 'front' },
    { id: 'dup-2', model: 'SUB3-12', enabled: true, position: { x: 0.40, y: 0.64 }, bottomHeightM: 0.05, rotationDeg: 0, orientation: 'vertical', legacyGroup: 'front' },
  ];
  const result = buildQuantityApplyInstances({
    coordinates: FRONT,
    quantity: 2,
    instances: existing,
    defaults: DEFAULTS,
    frontCoords: FRONT,
    rearCoords: [],
  });
  check('7: one matched, one disabled', result.disabledCount, 1);
  check('7: two enabled (one per candidate position)', enabledCount(result.instances), 2);
  const enabled = result.instances.filter((i) => i.enabled !== false);
  ok('7: exactly one enabled at (0.40,0.64)', enabled.filter((i) => Math.abs(i.position.x - 0.40) < 0.01 && Math.abs(i.position.y - 0.64) < 0.01).length === 1);
  ok('7: exactly one enabled at (4.60,0.64)', enabled.filter((i) => Math.abs(i.position.x - 4.60) < 0.01 && Math.abs(i.position.y - 0.64) < 0.01).length === 1);
  assertCompleteMatch('7', result, FRONT);
}

// 8. Surplus enabled AND disabled instances — surplus disabled, no creation.
{
  const existing = [
    { id: 'a', model: 'SUB3-12', enabled: true, position: { x: 0.40, y: 0.64 }, bottomHeightM: 0.05, rotationDeg: 0, orientation: 'vertical', legacyGroup: 'front' },
    { id: 'b', model: 'SUB3-12', enabled: true, position: { x: 4.60, y: 0.64 }, bottomHeightM: 0.05, rotationDeg: 0, orientation: 'vertical', legacyGroup: 'front' },
    { id: 'surplus-enabled', model: 'SUB3-12', enabled: true, position: { x: 2.5, y: 0.64 }, bottomHeightM: 0.05, rotationDeg: 0, orientation: 'vertical', legacyGroup: 'front' },
    { id: 'surplus-disabled', model: 'SUB3-12', enabled: false, position: { x: 2.5, y: 7.36 }, bottomHeightM: 0.05, rotationDeg: 180, orientation: 'horizontal', legacyGroup: 'rear' },
  ];
  const result = buildQuantityApplyInstances({
    coordinates: FRONT,
    quantity: 2,
    instances: existing,
    defaults: DEFAULTS,
    frontCoords: FRONT,
    rearCoords: [],
  });
  check('8: none created', result.createdCount, 0);
  check('8: two enabled', enabledCount(result.instances), 2);
  check('8: two disabled (surplus enabled + existing disabled)', result.disabledCount, 2);
  const disabled = result.instances.filter((i) => i.enabled === false);
  ok('8: surplus enabled instance disabled', disabled.some((i) => i.id === 'surplus-enabled'));
  ok('8: existing disabled instance stays disabled', disabled.some((i) => i.id === 'surplus-disabled'));
  assertCompleteMatch('8', result, FRONT);
}

// 9. Transitions 1→2, 2→4 and 4→1 preserve a complete one-to-one match.
{
  // Start: 1 sub at front-left.
  const one = [
    { id: 'a', model: 'SUB3-12', enabled: true, position: { x: 0.40, y: 0.64 }, bottomHeightM: 0.05, rotationDeg: 0, orientation: 'vertical', legacyGroup: 'front' },
  ];
  // 1 → 2: apply the two front positions.
  const r12 = buildQuantityApplyInstances({
    coordinates: FRONT, quantity: 2, instances: one, defaults: DEFAULTS, frontCoords: FRONT, rearCoords: [],
  });
  assertCompleteMatch('9:1->2', r12, FRONT);
  check('9:1->2: one created', r12.createdCount, 1);

  // 2 → 4: apply the four positions from the 2-sub result.
  const r24 = buildQuantityApplyInstances({
    coordinates: FOUR, quantity: 4, instances: r12.instances, defaults: DEFAULTS, frontCoords: FRONT, rearCoords: REAR,
  });
  assertCompleteMatch('9:2->4', r24, FOUR);
  check('9:2->4: two created (rear pair)', r24.createdCount, 2);

  // 4 → 1: apply a single front position from the 4-sub result.
  const single = [{ x: 0.40, y: 0.64, placement: 'front' }];
  const r41 = buildQuantityApplyInstances({
    coordinates: single, quantity: 1, instances: r24.instances, defaults: DEFAULTS, frontCoords: single, rearCoords: [],
  });
  assertCompleteMatch('9:4->1', r41, single);
  check('9:4->1: one enabled', enabledCount(r41.instances), 1);
  check('9:4->1: three disabled', r41.disabledCount, 3);
}

// 10. Preservation of orientation, rotation, model, height and allowed tuning
//     on a matched instance, and correct values on a created instance.
{
  const existing = [
    {
      id: 'keep',
      model: 'SUB3-12',
      enabled: true,
      position: { x: 0.40, y: 0.64 },
      bottomHeightM: 0.12, // preserved on match
      rotationDeg: 0,
      orientation: 'vertical',
      legacyGroup: 'front',
      gainDb: -2.5, // preserved tuning on match
      delayMs: 3.4,
      polarity: -1,
    },
  ];
  const result = buildQuantityApplyInstances({
    coordinates: FOUR,
    quantity: 4,
    instances: existing,
    defaults: DEFAULTS,
    frontCoords: FRONT,
    rearCoords: REAR,
  });
  const enabled = result.instances.filter((i) => i.enabled !== false);
  const matched = enabled.find((i) => i.id === 'keep');
  ok('10: matched instance retained', !!matched);
  check('10: matched model preserved', matched.model, 'SUB3-12');
  check('10: matched height preserved', matched.bottomHeightM, 0.12);
  check('10: matched gain preserved', matched.gainDb, -2.5);
  check('10: matched delay preserved', matched.delayMs, 3.4);
  check('10: matched polarity preserved', matched.polarity, -1);
  check('10: matched rotation re-stamped from wall group', matched.rotationDeg, 0);

  const createdRear = enabled.find((i) => i.legacyGroup === 'rear');
  ok('10: a rear cabinet was created', !!createdRear);
  check('10: created rear rotation is 180', createdRear.rotationDeg, 180);
  check('10: created rear orientation from rear group', createdRear.orientation, 'horizontal');
  check('10: created model from defaults', createdRear.model, 'SUB3-12');
  check('10: created height from defaults', createdRear.bottomHeightM, 0.05);
  check('10: created neutral gain', createdRear.gainDb, 0);
  check('10: created neutral delay', createdRear.delayMs, 0);
  check('10: created neutral polarity', createdRear.polarity, 1);
  assertCompleteMatch('10', result, FOUR);
}

// 11. Every successful Apply returns valid=true with no error, and the safety
//     contract holds across all quantity transitions: the built arrangement is
//     validated against the candidate, so a partial or mismatched result is
//     never committed. (With the corrected one-to-one assignment the built
//     arrangement always matches the candidate, so valid is always true here;
//     the validation is the defensive safety net that rejects any future
//     drift.)
{
  for (const [label, coords, qty, front, rear] of [
    ['1-sub', [{ x: 0.40, y: 0.64, placement: 'front' }], 1, [{ x: 0.40, y: 0.64, placement: 'front' }], []],
    ['2-sub', FRONT, 2, FRONT, []],
    ['4-sub', FOUR, 4, FRONT, REAR],
  ]) {
    const result = buildQuantityApplyInstances({
      coordinates: coords, quantity: qty, instances: [], defaults: DEFAULTS, frontCoords: front, rearCoords: rear,
    });
    ok(`11:${label}: valid true`, result.valid === true);
    ok(`11:${label}: no error`, result.error === null);
    assertCompleteMatch(`11:${label}`, result, coords);
  }
}

if (passes === tests) {
  console.log('quantity-placement-apply-partial-match: all checks passed');
} else {
  console.error(`${passes}/${tests} checks passed`);
  process.exit(1);
}