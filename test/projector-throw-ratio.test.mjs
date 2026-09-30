// Generic projector throw-ratio sanity check.
//   throwRatio = lens-to-screen distance / screen image width
//   caution when throwRatio < 1.30 or > 2.80
import assert from 'node:assert/strict';
import {
  calculateProjectorThrowRatio,
  GENERIC_THROW_RATIO_MIN,
  GENERIC_THROW_RATIO_MAX,
  THROW_RATIO_WARNING_TEXT,
} from '../src/components/room/rv/utils/projectorThrowRatio.js';

let failures = 0;
const check = (name, fn) => {
  try { fn(); console.log(`PASS  ${name}`); }
  catch (e) { failures += 1; console.error(`FAIL  ${name}\n      ${e.message}`); }
};

// TEST 1 — normal throw (spec example: 5.62 m / 3.50 m = 1.61)
check('TEST 1 normal throw → no warning', () => {
  const r = calculateProjectorThrowRatio({ lensY: 5.62, screenPlaneY: 0, screenWidthM: 3.50 });
  assert.equal(Number(r.throwRatio.toFixed(2)), 1.61);
  assert.equal(r.isOutsideGenericRange, false);
  assert.equal(r.reason, null);
});

// TEST 2 — too short (spec example: 5.62 m / 4.40 m = 1.28)
check('TEST 2 too short → warning', () => {
  const r = calculateProjectorThrowRatio({ lensY: 5.62, screenPlaneY: 0, screenWidthM: 4.40 });
  assert.equal(Number(r.throwRatio.toFixed(2)), 1.28);
  assert.equal(r.isOutsideGenericRange, true);
  assert.equal(r.reason, 'too_short');
});

// TEST 3 — too long
check('TEST 3 too long → warning', () => {
  const r = calculateProjectorThrowRatio({ lensY: 9.0, screenPlaneY: 1.0, screenWidthM: 2.5 });
  assert.equal(r.throwRatio, 3.2);
  assert.equal(r.isOutsideGenericRange, true);
  assert.equal(r.reason, 'too_long');
});

// Range boundaries are inclusive; distances are absolute (projector either side of the screen)
check('boundaries inclusive and direction agnostic', () => {
  assert.equal(calculateProjectorThrowRatio({ lensY: 3.9, screenPlaneY: 0, screenWidthM: 3 }).isOutsideGenericRange, false); // 1.30
  assert.equal(calculateProjectorThrowRatio({ lensY: 8.4, screenPlaneY: 0, screenWidthM: 3 }).isOutsideGenericRange, false); // 2.80
  assert.equal(calculateProjectorThrowRatio({ lensY: 3.89, screenPlaneY: 0, screenWidthM: 3 }).reason, 'too_short');
  assert.equal(calculateProjectorThrowRatio({ lensY: 8.41, screenPlaneY: 0, screenWidthM: 3 }).reason, 'too_long');
  const behind = calculateProjectorThrowRatio({ lensY: 0, screenPlaneY: 6.0, screenWidthM: 3.0 });
  assert.equal(behind.throwRatio, 2.0);
});

check('constants unchanged (1.30 / 2.80)', () => {
  assert.equal(GENERIC_THROW_RATIO_MIN, 1.30);
  assert.equal(GENERIC_THROW_RATIO_MAX, 2.80);
  assert.equal(THROW_RATIO_WARNING_TEXT, 'Check throw ratio');
});

check('missing or invalid geometry never warns', () => {
  for (const input of [
    { lensY: null, screenPlaneY: 0, screenWidthM: 3 },
    { lensY: 5, screenPlaneY: undefined, screenWidthM: 3 },
    { lensY: 5, screenPlaneY: 0, screenWidthM: 0 },
    { lensY: 5, screenPlaneY: 0, screenWidthM: null },
    { lensY: NaN, screenPlaneY: 0, screenWidthM: 3 },
  ]) {
    const r = calculateProjectorThrowRatio(input);
    assert.equal(r.isOutsideGenericRange, false);
    assert.equal(r.reason, null);
    assert.equal(r.throwRatio, null);
  }
});

if (failures) { console.error(`\n${failures} failing`); process.exit(1); }
console.log('\nAll projector throw-ratio checks passed.');