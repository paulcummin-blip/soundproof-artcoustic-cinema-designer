// evaluated-arrangement-match.test.mjs
// Focused tests for the complete active-arrangement matcher that backs the
// "Applied" badge on the Subwoofer Design recommendation cards.
//
// Locks in the critical correction: isApplied must compare the COMPLETE active
// subwoofer arrangement — enabled quantity, exact active cabinet positions,
// subwoofer model, cabinet orientation, cabinet height — not coordinates
// alone. Disabled or historical instances must never produce a false match.
//
// Run: node --import ./test/_alias-register.mjs --test test/evaluated-arrangement-match.test.mjs

import assert from 'node:assert/strict';

import { arrangementMatchesOption } from '../src/components/room/bass/bda/EvaluatedLayoutCards.jsx';

const OPTION = {
  quantity: 2,
  model: 'SUB4-12',
  bottomHeightM: 0.05,
  coordinates: [
    { x: 1.0, y: 0.3, placement: 'front' },
    { x: 3.0, y: 0.3, placement: 'front' },
  ],
};

function inst(overrides) {
  return {
    id: overrides.id,
    enabled: true,
    model: 'SUB4-12',
    position: { x: overrides.x, y: overrides.y },
    bottomHeightM: 0.05,
    rotationDeg: overrides.rotationDeg ?? 0,
    legacyGroup: overrides.legacyGroup ?? 'front',
    ...overrides,
  };
}

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

// 1. Exact arrangement matches.
check(
  'exact arrangement matches',
  arrangementMatchesOption([
    inst({ id: 'a', x: 1.0, y: 0.3 }),
    inst({ id: 'b', x: 3.0, y: 0.3 }),
  ], OPTION),
  true,
);

// 2. Disabled instances do not cause a false match.
check(
  'disabled extra instance ignored',
  arrangementMatchesOption([
    inst({ id: 'a', x: 1.0, y: 0.3 }),
    inst({ id: 'b', x: 3.0, y: 0.3 }),
    inst({ id: 'c', x: 2.0, y: 5.0, enabled: false }),
  ], OPTION),
  true,
);

// 3. Wrong quantity (extra enabled) does not match.
check(
  'extra enabled instance no match',
  arrangementMatchesOption([
    inst({ id: 'a', x: 1.0, y: 0.3 }),
    inst({ id: 'b', x: 3.0, y: 0.3 }),
    inst({ id: 'c', x: 2.0, y: 0.3 }),
  ], OPTION),
  false,
);

// 4. Same coordinates but different model does not match.
check(
  'different model no match',
  arrangementMatchesOption([
    inst({ id: 'a', x: 1.0, y: 0.3, model: 'SUB3-12' }),
    inst({ id: 'b', x: 3.0, y: 0.3, model: 'SUB3-12' }),
  ], OPTION),
  false,
);

// 5. Same coordinates but wrong orientation does not match.
check(
  'wrong orientation no match',
  arrangementMatchesOption([
    inst({ id: 'a', x: 1.0, y: 0.3, rotationDeg: 180 }),
    inst({ id: 'b', x: 3.0, y: 0.3, rotationDeg: 180 }),
  ], OPTION),
  false,
);

// 6. Same coordinates but different height does not match.
check(
  'different height no match',
  arrangementMatchesOption([
    inst({ id: 'a', x: 1.0, y: 0.3, bottomHeightM: 0.4 }),
    inst({ id: 'b', x: 3.0, y: 0.3, bottomHeightM: 0.4 }),
  ], OPTION),
  false,
);

// 7. No enabled instances does not match.
check(
  'no enabled instances no match',
  arrangementMatchesOption([
    inst({ id: 'a', x: 1.0, y: 0.3, enabled: false }),
    inst({ id: 'b', x: 3.0, y: 0.3, enabled: false }),
  ], OPTION),
  false,
);

// 8. Coordinates alone (within tolerance) but mismatched placement group does not match.
check(
  'mismatched placement group no match',
  arrangementMatchesOption([
    inst({ id: 'a', x: 1.0, y: 0.3, legacyGroup: 'rear', rotationDeg: 180 }),
    inst({ id: 'b', x: 3.0, y: 0.3, legacyGroup: 'rear', rotationDeg: 180 }),
  ], OPTION),
  false,
);

// 9. null option does not match.
check('null option no match', arrangementMatchesOption([], null), false);

if (passes === tests) {
  console.log('evaluated-arrangement-match: all checks passed');
} else {
  console.error(`${passes}/${tests} checks passed`);
  process.exit(1);
}