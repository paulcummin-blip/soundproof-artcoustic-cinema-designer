/**
 * Regression: P15/P21 permanent L2 assumption authority.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_ASSUMED_LEVEL,
  P15_ASSUMPTION_RESULT,
  P21_ASSUMPTION_RESULT,
  getEffectiveAssumedLevel,
  getAssumedP15DisplayValue,
  getAssumedP21DisplayValue,
  resolveAssumedP15Level,
  resolveAssumedP21Level,
  getAssumedLevelForRating,
  resolveAssumedParameterResult,
} from "../src/components/utils/assumedParameterAuthority.js";

test("unmeasured P15 is always Assumed L2 / NCB 22", () => {
  for (const legacy of [null, undefined, "", "L1", "L3", "L4", "garbage"]) {
    assert.equal(getEffectiveAssumedLevel(legacy), "L2");
    assert.equal(resolveAssumedP15Level(legacy), "L2");
    assert.equal(getAssumedP15DisplayValue(legacy), "NCB 22");
  }
  assert.deepEqual(P15_ASSUMPTION_RESULT, {
    parameter: 15,
    level: "L2",
    value: 22,
    formatted: "NCB 22",
    hudLabel: "NCB 22",
    status: "assumed",
    state: "scored",
    assumed: true,
    assumptionText: "Design target: NCB 22",
  });
});

test("unmeasured P21 is always Assumed L2 and never N/A", () => {
  for (const legacy of [null, undefined, "", "L1", "L3", "L4", "garbage"]) {
    assert.equal(getEffectiveAssumedLevel(legacy), "L2");
    assert.equal(resolveAssumedP21Level(legacy), "L2");
    assert.equal(getAssumedP21DisplayValue(legacy), "-8 dB");
    assert.notEqual(getAssumedP21DisplayValue(legacy), "N/A");
  }
  assert.equal(P21_ASSUMPTION_RESULT.level, "L2");
  assert.equal(P21_ASSUMPTION_RESULT.status, "assumed");
  assert.equal(P21_ASSUMPTION_RESULT.assumed, true);
  assert.match(P21_ASSUMPTION_RESULT.assumptionText, /not been measured/i);
});

test("Design Rating consumes permanent L2 for every legacy input", () => {
  assert.equal(DEFAULT_ASSUMED_LEVEL, "L2");
  for (const legacy of [null, "L1", "L2", "L3", "L4"]) {
    assert.equal(getAssumedLevelForRating(legacy), "L2");
  }
});

test("a genuine measured result replaces the assumption without an override", () => {
  const measured = {
    status: "measured",
    state: "scored",
    level: "L3",
    value: 18,
    formatted: "NCB 18",
  };
  const resolved = resolveAssumedParameterResult(15, measured);
  assert.equal(resolved.assumed, false);
  assert.equal(resolved.level, "L3");
  assert.equal(resolved.value, 18);
});

test("non-measured legacy results cannot displace the permanent assumption", () => {
  const legacy = { status: "ok", level: "L4", value: 15, formatted: "NCB 15" };
  assert.deepEqual(resolveAssumedParameterResult(15, legacy), { ...P15_ASSUMPTION_RESULT });
  assert.deepEqual(resolveAssumedParameterResult(21, legacy), { ...P21_ASSUMPTION_RESULT });
});
