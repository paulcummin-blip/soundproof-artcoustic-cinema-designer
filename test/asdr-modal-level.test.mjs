// Modal achieved-level aggregation for the redesigned ASDR scorecard.
// Pure presentation helpers in designRatingPresentation.js — unweighted
// "most often achieved" level, NOT an ASDR-weighted aggregation.
import test from "node:test";
import assert from "node:assert/strict";
import {
  getModalLevelForContribs,
  formatModalLevels,
  formatLevelDistribution,
} from "../src/components/report/technical/designRatingPresentation.js";

test("modal level — single-level contributions, clear modal", () => {
  const r = getModalLevelForContribs([
    { resultLevel: "L4" },
    { resultLevel: "L3" },
    { resultLevel: "L3" },
    { resultLevel: "L3" },
    { resultLevel: "L2" },
  ]);
  assert.deepEqual(r.modalLevels, ["L3"]);
  assert.equal(r.distribution.L4, 1);
  assert.equal(r.distribution.L3, 3);
  assert.equal(r.distribution.L2, 1);
  assert.equal(r.hasFail, false);
});

test("modal level — adjacent tie shows both levels", () => {
  const r = getModalLevelForContribs([
    { resultLevel: "L3" },
    { resultLevel: "L3" },
    { resultLevel: "L2" },
    { resultLevel: "L2" },
  ]);
  // L3 and L2 tie at 2 each → both modal
  assert.deepEqual(r.modalLevels, ["L2", "L3"]);
});

test("modal level — non-adjacent tie shows both explicitly", () => {
  const r = getModalLevelForContribs([
    { resultLevel: "L4" },
    { resultLevel: "L4" },
    { resultLevel: "L1" },
    { resultLevel: "L1" },
  ]);
  assert.deepEqual(r.modalLevels, ["L1", "L4"]);
});

test("modal level — seat-scope distribution parsed into counts", () => {
  const r = getModalLevelForContribs([
    { resultLevel: "3×L4 · 2×L3 · 1×L1" },
  ]);
  assert.equal(r.distribution.L4, 3);
  assert.equal(r.distribution.L3, 2);
  assert.equal(r.distribution.L1, 1);
  assert.deepEqual(r.modalLevels, ["L4"]);
});

test("modal level — FAIL tracked but not reported as achieved modal", () => {
  const r = getModalLevelForContribs([
    { resultLevel: "L3" },
    { resultLevel: "FAIL" },
  ]);
  assert.equal(r.hasFail, true);
  assert.deepEqual(r.modalLevels, ["L3"]);
  assert.equal(r.distribution.FAIL, 1);
});

test("formatModalLevels — single, adjacent range, non-adjacent explicit", () => {
  assert.equal(formatModalLevels(["L3"]), "Level 3");
  assert.equal(formatModalLevels(["L2", "L3"]), "Level 2–3");
  assert.equal(formatModalLevels(["L1", "L3"]), "Level 1 · Level 3");
  assert.equal(formatModalLevels([]), null);
  assert.equal(formatModalLevels(null), null);
});

test("formatLevelDistribution — ordered L4→L1, FAIL appended", () => {
  assert.equal(
    formatLevelDistribution({ L4: 1, L3: 3, L2: 1, L1: 0, FAIL: 0 }),
    "1× L4 · 3× L3 · 1× L2",
  );
  assert.equal(
    formatLevelDistribution({ L4: 0, L3: 0, L2: 5, L1: 2, FAIL: 1 }),
    "5× L2 · 2× L1 · 1× FAIL",
  );
  assert.equal(formatLevelDistribution(null), null);
});

test("modal level — empty / undefined contributions", () => {
  const r = getModalLevelForContribs([]);
  assert.deepEqual(r.modalLevels, []);
  assert.equal(r.total, 0);
  const r2 = getModalLevelForContribs(undefined);
  assert.deepEqual(r2.modalLevels, []);
});