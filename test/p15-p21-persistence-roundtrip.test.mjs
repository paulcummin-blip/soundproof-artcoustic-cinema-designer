/**
 * Regression: legacy persistence cannot change the permanent P15/P21 defaults.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  getEffectiveAssumedLevel,
  getAssumedP15DisplayValue,
  getAssumedP21DisplayValue,
  resolveAssumedParameterResult,
} from "../src/components/utils/assumedParameterAuthority.js";

test("cold reopen resolves null stored values to permanent L2", () => {
  assert.equal(getEffectiveAssumedLevel(null), "L2");
  assert.equal(getAssumedP15DisplayValue(null), "NCB 22");
  assert.equal(getAssumedP21DisplayValue(null), "-8 dB");
});

test("cold reopen ignores historic selectable assumption values", () => {
  for (const stored of ["L1", "L3", "L4"]) {
    assert.equal(getEffectiveAssumedLevel(stored), "L2");
    assert.equal(getAssumedP15DisplayValue(stored), "NCB 22");
    assert.equal(getAssumedP21DisplayValue(stored), "-8 dB");
  }
});

test("P15 and P21 publish scored assumed results, never uncalculated placeholders", () => {
  const p15 = resolveAssumedParameterResult(15);
  const p21 = resolveAssumedParameterResult(21);
  for (const result of [p15, p21]) {
    assert.equal(result.level, "L2");
    assert.equal(result.state, "scored");
    assert.equal(result.status, "assumed");
    assert.notEqual(result.formatted, "Not Calculated");
    assert.notEqual(result.formatted, "—");
    assert.notEqual(result.formatted, "N/A");
  }
  assert.equal(p15.formatted, "NCB 22");
  assert.equal(p21.formatted, "Assumed");
});
