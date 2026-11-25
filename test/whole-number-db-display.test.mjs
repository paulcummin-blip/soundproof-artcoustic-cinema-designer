// test/whole-number-db-display.test.mjs
// Focused tests for the Sound Proof whole-number dB display policy.
//
// Verifies:
//   - roundDbValue rounds conventional half-away-from-zero for + and - values.
//   - formatDb renders the whole-number integer with a dB suffix, or an em dash.
//   - Full-precision values are NOT mutated by the display helpers.
//
// Run: node --import ./test/_alias-register.mjs test/whole-number-db-display.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { roundDbValue, formatWholeNumberDb, formatSplDisplay } from "@/components/utils/splDisplayFormatter";
import { formatDb } from "@/components/utils/formatDb";

test("roundDbValue: positive values round to nearest whole dB (half away from zero)", () => {
  assert.strictEqual(roundDbValue(3.2), 3);
  assert.strictEqual(roundDbValue(5.9), 6);
  assert.strictEqual(roundDbValue(0.4), 0);
  assert.strictEqual(roundDbValue(117.5), 118);
  assert.strictEqual(roundDbValue(2.5), 3);
});

test("roundDbValue: negative values round to nearest whole dB (half away from zero)", () => {
  assert.strictEqual(roundDbValue(-9.8), -10);
  assert.strictEqual(roundDbValue(-13.5), -14);
  assert.strictEqual(roundDbValue(-0.4), 0);
  assert.strictEqual(roundDbValue(-2.5), -3);
  assert.strictEqual(roundDbValue(-0.5), -1);
});

test("roundDbValue: null / undefined / non-finite return null", () => {
  assert.strictEqual(roundDbValue(null), null);
  assert.strictEqual(roundDbValue(undefined), null);
  assert.strictEqual(roundDbValue(""), null);
  assert.strictEqual(roundDbValue(NaN), null);
  assert.strictEqual(roundDbValue(Infinity), null);
  assert.strictEqual(roundDbValue(true), null);
});

test("roundDbValue: zero is preserved as 0 (not -0)", () => {
  const v = roundDbValue(0);
  assert.strictEqual(v, 0);
  assert.strictEqual(Object.is(v, -0), false);
});

test("formatDb: renders whole-number dB or em dash fallback", () => {
  assert.strictEqual(formatDb(3.2), "3 dB");
  assert.strictEqual(formatDb(-9.8), "-10 dB");
  assert.strictEqual(formatDb(117.5), "118 dB");
  assert.strictEqual(formatDb(null), "—");
  assert.strictEqual(formatDb(undefined), "—");
});

test("formatWholeNumberDb / formatSplDisplay: unit suffix and fallback", () => {
  assert.strictEqual(formatWholeNumberDb(3.2), "3 dB");
  assert.strictEqual(formatWholeNumberDb(-9.8, { unit: "dBC" }), "-10 dBC");
  assert.strictEqual(formatSplDisplay(112.4), "112 dBC");
  assert.strictEqual(formatWholeNumberDb(null), "—");
});

test("roundDbValue does not mutate the input value (precision preserved for maths)", () => {
  const original = 117.49;
  const displayed = roundDbValue(original);
  assert.strictEqual(displayed, 117);
  // The caller's own value is untouched — the function is pure and returns a new number.
  assert.strictEqual(original, 117.49);
});