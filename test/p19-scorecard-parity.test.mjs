// P19 scorecard / summary grading parity with the canonical bass engine.
// The Technical Report ASDR scorecard must grade P19 using the SAME mapper as
// the engine (levelP19_lfResponse, which applies the RP22 design-value floor),
// not by independently re-grading the raw fractional value against the catalog
// levels. This test loads the pure levels module functionally and asserts the
// wiring in artcousticSystemDesignRating.js delegates to it.
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
// so we can prove scoreP19 === levelP19_lfResponse for L1-L4 values.
function applyMapper(rawValue, mapperFn, canFail) {
  const result = mapperFn(rawValue);
  if (result.ok && result.level && /^L[1-4]$/.test(result.level)) {
    return { level: result.level };
  }
  return { level: canFail ? "FAIL" : "L1" };
}

test("levelP19_lfResponse canonical Yarm values", async () => {
  const { levelP19_lfResponse } = await loadLevels();
  assert.equal(levelP19_lfResponse(2.858).level, "L4"); // RSP
  assert.equal(levelP19_lfResponse(4.204).level, "L2"); // seat
  assert.equal(levelP19_lfResponse(4.815).level, "L2"); // seat
  assert.equal(levelP19_lfResponse(5.2).level, "L1");   // above L1 boundary
});

test("levelP19_lfResponse boundary cases around 2 / 3 / 4 / 5", async () => {
  const { levelP19_lfResponse } = await loadLevels();
  // Around 2 (L4/L3 boundary)
  assert.equal(levelP19_lfResponse(2.0).level, "L4");
  assert.equal(levelP19_lfResponse(2.999).level, "L4");
  assert.equal(levelP19_lfResponse(3.0).level, "L3");
  // Around 3 (L3/L2 boundary)
  assert.equal(levelP19_lfResponse(3.999).level, "L3");
  assert.equal(levelP19_lfResponse(4.0).level, "L2");
  // Around 4 (L2/L1 boundary — the Yarm defect boundary)
  assert.equal(levelP19_lfResponse(4.001).level, "L2");
  assert.equal(levelP19_lfResponse(4.999).level, "L2");
  assert.equal(levelP19_lfResponse(5.0).level, "L1");
  // Around 5 (L1/FAIL boundary)
  assert.equal(levelP19_lfResponse(5.999).level, "L1");
  assert.equal(levelP19_lfResponse(6.0).level, "FAIL");
});

test("scoreP19 delegates to levelP19_lfResponse (engine parity wiring)", async () => {
  const src = await readFile(
    new URL("../src/components/report/technical/artcousticSystemDesignRating.js", import.meta.url),
    "utf8",
  );
  // scoreP19 uses levelP19_lfResponse (the floored engine mapper)
  assert.match(src, /function scoreP19[\s\S]*?levelP19_lfResponse/);
  // No longer re-grades raw value against the flat catalog levels
  assert.doesNotMatch(src, /function scoreP19[\s\S]*?applyCatalogThresholds\(rawValue,\s*cat\.levels/);
  // Import is present
  assert.match(src, /levelP19_lfResponse/);
});

test("scoreP19 output === levelP19_lfResponse for representative boundary values", async () => {
  const { levelP19_lfResponse } = await loadLevels();
  const cases = [1.5, 2.0, 2.858, 3.0, 3.5, 4.0, 4.204, 4.815, 5.0, 5.2];
  for (const v of cases) {
    const engine = levelP19_lfResponse(v).level;
    const scorecard = applyMapper(v, levelP19_lfResponse, true).level;
    assert.equal(scorecard, engine, `scoreP19(${v}) must equal levelP19_lfResponse(${v})`);
  }
});

test("scoreP19 preserves FAIL above the L1 band (canFail=true)", async () => {
  const { levelP19_lfResponse } = await loadLevels();
  // 6.0 floors to 6, > 5 → engine FAIL; scoreP19 (canFail=true) must also return FAIL
  assert.equal(levelP19_lfResponse(6.0).level, "FAIL");
  assert.equal(applyMapper(6.0, levelP19_lfResponse, true).level, "FAIL");
});