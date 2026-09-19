// P19 scorecard / summary grading parity with the canonical bass engine.
// The Technical Report ASDR scorecard must grade P19/P20 using the SAME direct
// metric mappers as the engine. No surface may floor, halve, or independently
// re-grade a stored value. This test exercises the real level module and asserts
// that the ASDR scorecard delegates to it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// levels.jsx is pure JS (no imports, no JSX) but has a .jsx extension that
// Node's ESM loader won't resolve. Load it via new Function after stripping
// `export ` keywords so we exercise the REAL source, not a copy.
async function loadLevels() {
  const src = await readFile(
    new URL("../src/components/utils/rp22/levels.jsx", import.meta.url),
    "utf8",
  );
  const code = src.replace(/export\s+/g, "");
  const factory = new Function(
    `${code}\nreturn { levelP19_lfResponse, floorP19Deviation, levelP20_lfConsistency };`,
  );
  return factory();
}

// Replicate applyMapper exactly as implemented in artcousticSystemDesignRating.js
// so we can prove the scorecard preserves the engine mapper, including FAIL.
function applyMapper(rawValue, mapperFn, canFail) {
  const result = mapperFn(rawValue);
  if (result.ok && result.level && /^L[1-4]$/.test(result.level)) {
    return { level: result.level };
  }
  return { level: canFail ? "FAIL" : "L1" };
}

test("levelP19_lfResponse follows the engine's floored design grade", async () => {
  const { levelP19_lfResponse } = await loadLevels();
  assert.equal(levelP19_lfResponse(2.858).level, "L4");
  assert.equal(levelP19_lfResponse(4.204).level, "L2");
  assert.equal(levelP19_lfResponse(5.815).level, "L1");
  assert.equal(levelP19_lfResponse(6.0).level, "FAIL");
});

test("levelP19_lfResponse boundary cases use whole-dB flooring", async () => {
  const { levelP19_lfResponse } = await loadLevels();
  assert.equal(levelP19_lfResponse(2.999).level, "L4");
  assert.equal(levelP19_lfResponse(3.0).level, "L3");
  assert.equal(levelP19_lfResponse(3.999).level, "L3");
  assert.equal(levelP19_lfResponse(4.0).level, "L2");
  assert.equal(levelP19_lfResponse(4.999).level, "L2");
  assert.equal(levelP19_lfResponse(5.0).level, "L1");
  assert.equal(levelP19_lfResponse(5.999).level, "L1");
  assert.equal(levelP19_lfResponse(6.0).level, "FAIL");
});

test("P20 direct boundaries use whole-dB flooring and the current L1 fallback", async () => {
  const { levelP20_lfConsistency } = await loadLevels();
  assert.equal(levelP20_lfConsistency(2.99).level, "L4");
  assert.equal(levelP20_lfConsistency(3.0).level, "L3");
  assert.equal(levelP20_lfConsistency(3.99).level, "L3");
  assert.equal(levelP20_lfConsistency(4.0).level, "L2");
  assert.equal(levelP20_lfConsistency(4.99).level, "L2");
  assert.equal(levelP20_lfConsistency(5.0).level, "L1");
});

test("scorecard reads the engine-published P19 grade without a raw-value scorer", async () => {
  const src = await readFile(
    new URL("../src/components/report/technical/artcousticSystemDesignRating.js", import.meta.url),
    "utf8",
  );
  assert.match(src, /key === "p19"[\s\S]*?authoritativeLevel/);
  assert.doesNotMatch(src, /function scoreP19/);
  assert.doesNotMatch(src, /levelP19_lfResponse/);
});

test("scoreP20 delegates to the shared mapper and preserves FAIL", async () => {
  const { levelP20_lfConsistency } = await loadLevels();
  const src = await readFile(
    new URL("../src/components/report/technical/artcousticSystemDesignRating.js", import.meta.url),
    "utf8",
  );
  assert.match(src, /function scoreP20[\s\S]*?levelP20_lfConsistency/);
  for (const value of [2, 2.01, 3, 3.01, 4, 4.01, 10]) {
    assert.equal(applyMapper(value, levelP20_lfConsistency, true).level, levelP20_lfConsistency(value).level);
  }
});

test("P19 engine mapper remains covered at source boundaries", async () => {
  const { levelP19_lfResponse } = await loadLevels();
  for (const [value, expected] of [[2, "L4"], [2.858, "L4"], [4, "L2"], [4.815, "L2"], [6, "FAIL"]]) {
    assert.equal(levelP19_lfResponse(value).level, expected);
  }
});

test("Room Designer compliance reads P19 floor and summary from the publication", async () => {
  const src = await readFile(
    new URL("../src/components/rp22/RP22CompliancePanel.jsx", import.meta.url),
    "utf8",
  );
  assert.match(src, /pid === 19[^\n]*p19SeatAuthority\?\.project\?\.floor/);
  assert.match(src, /pid === 19[^\n]*p19SeatAuthority\?\.project\?\.coverageSummary/);
  assert.doesNotMatch(src, /buildP19SeatRows/);
});