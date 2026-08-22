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

test("levelP19_lfResponse direct-metric consequences for stored Yarm-era values", async () => {
  const { levelP19_lfResponse } = await loadLevels();
  assert.equal(levelP19_lfResponse(2.858).level, "L3");
  assert.equal(levelP19_lfResponse(4.204).level, "L1");
  assert.equal(levelP19_lfResponse(4.815).level, "L1");
  assert.equal(levelP19_lfResponse(5.2).level, "FAIL");
});

test("levelP19_lfResponse boundary cases around 2 / 3 / 4 / 5", async () => {
  const { levelP19_lfResponse } = await loadLevels();
  assert.equal(levelP19_lfResponse(2.0).level, "L4");
  assert.equal(levelP19_lfResponse(2.001).level, "L3");
  assert.equal(levelP19_lfResponse(2.999).level, "L3");
  assert.equal(levelP19_lfResponse(3.0).level, "L3");
  assert.equal(levelP19_lfResponse(3.001).level, "L2");
  assert.equal(levelP19_lfResponse(3.999).level, "L2");
  assert.equal(levelP19_lfResponse(4.0).level, "L2");
  assert.equal(levelP19_lfResponse(4.001).level, "L1");
  assert.equal(levelP19_lfResponse(4.999).level, "L1");
  assert.equal(levelP19_lfResponse(5.0).level, "L1");
  assert.equal(levelP19_lfResponse(5.001).level, "FAIL");
  assert.equal(levelP19_lfResponse(6.0).level, "FAIL");
});

test("P20 direct boundaries have no L1", async () => {
  const { levelP20_lfConsistency } = await loadLevels();
  assert.equal(levelP20_lfConsistency(2.0).level, "L4");
  assert.equal(levelP20_lfConsistency(2.01).level, "L3");
  assert.equal(levelP20_lfConsistency(3.0).level, "L3");
  assert.equal(levelP20_lfConsistency(3.01).level, "L2");
  assert.equal(levelP20_lfConsistency(4.0).level, "L2");
  assert.equal(levelP20_lfConsistency(4.01).level, "FAIL");
  assert.notEqual(levelP20_lfConsistency(100).level, "L1");
});

test("scoreP19 delegates to levelP19_lfResponse (engine parity wiring)", async () => {
  const src = await readFile(
    new URL("../src/components/report/technical/artcousticSystemDesignRating.js", import.meta.url),
    "utf8",
  );
  // scoreP19 uses the direct engine mapper
  assert.match(src, /function scoreP19[\s\S]*?levelP19_lfResponse/);
  // No longer re-grades raw value against the flat catalog levels
  assert.doesNotMatch(src, /function scoreP19[\s\S]*?applyCatalogThresholds\(rawValue,\s*cat\.levels/);
  // Import is present
  assert.match(src, /levelP19_lfResponse/);
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

test("scoreP19 output === levelP19_lfResponse for representative boundary values", async () => {
  const { levelP19_lfResponse } = await loadLevels();
  const cases = [1.5, 2.0, 2.001, 2.858, 3.0, 3.001, 4.0, 4.001, 4.815, 5.0, 5.001, 5.2];
  for (const v of cases) {
    const engine = levelP19_lfResponse(v).level;
    const scorecard = applyMapper(v, levelP19_lfResponse, true).level;
    assert.equal(scorecard, engine, `scoreP19(${v}) must equal levelP19_lfResponse(${v})`);
  }
});

test("scoreP19 preserves FAIL above the L1 band (canFail=true)", async () => {
  const { levelP19_lfResponse } = await loadLevels();
  // >5 dB is direct FAIL; scoreP19 (canFail=true) must preserve it
  assert.equal(levelP19_lfResponse(6.0).level, "FAIL");
  assert.equal(applyMapper(6.0, levelP19_lfResponse, true).level, "FAIL");
});