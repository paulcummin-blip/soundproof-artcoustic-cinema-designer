import test from "node:test";
import assert from "node:assert/strict";

import {
  HOUSE_CURVE_MEMO_LIMITS,
  createHouseCurveEvaluationMemo,
  readExactMemo,
  writeExactMemo,
} from "../src/components/utils/houseCurveEvaluationMemo.js";

test("house-curve trial caches remain bounded", () => {
  const memo = createHouseCurveEvaluationMemo(true);
  const total = HOUSE_CURVE_MEMO_LIMITS.correctedCurves + 20;

  for (let index = 0; index < total; index += 1) {
    writeExactMemo(memo.correctedCurves, `bank-${index}`, { index }, true);
    writeExactMemo(memo.metrics, `bank-${index}`, { index }, true);
  }

  assert.equal(memo.correctedCurves.size, HOUSE_CURVE_MEMO_LIMITS.correctedCurves);
  assert.equal(memo.metrics.size, HOUSE_CURVE_MEMO_LIMITS.metrics);
  assert.equal(memo.correctedCurves.has("bank-0"), false);
  assert.equal(memo.correctedCurves.has(`bank-${total - 1}`), true);
});

test("exact reads promote an entry within the bounded working set", () => {
  const memo = createHouseCurveEvaluationMemo(true);
  const limit = HOUSE_CURVE_MEMO_LIMITS.correctedCurves;

  for (let index = 0; index < limit; index += 1) {
    memo.correctedCurves.set(`bank-${index}`, { index });
  }

  assert.deepEqual(readExactMemo(memo.correctedCurves, "bank-0"), { index: 0 });
  memo.correctedCurves.set("bank-new", { index: limit });

  assert.equal(memo.correctedCurves.has("bank-0"), true);
  assert.equal(memo.correctedCurves.has("bank-1"), false);
});

test("disabled memo writes do not retain trial results", () => {
  const memo = createHouseCurveEvaluationMemo(false);
  writeExactMemo(memo.correctedCurves, "bank", { value: 1 }, memo.enabled);
  assert.equal(memo.correctedCurves.size, 0);
});
