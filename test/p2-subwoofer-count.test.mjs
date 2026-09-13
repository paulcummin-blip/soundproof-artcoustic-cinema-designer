// p2-subwoofer-count.test.mjs
// Tests that the P2 Visual Report selector counts subwoofers from the
// canonical subwooferInstances authority (not placedSpeakers), and that
// subwoofer count never affects the P2 level.

import { test } from "node:test";
import assert from "node:assert";

// Inline import of the selector — it's an ES module, use dynamic import
const { selectClientP2SystemArchitecture } = await import(
  "../src/components/report/client/selectClientP2SystemArchitecture.js"
);

// Mock analysisResult with a fixed P2 level so we can verify subwoofer
// changes do NOT change the level.
function makeAnalysisResult(level, discreteCount) {
  return {
    gradedParameters: {
      primary: {
        2: { level, value: discreteCount, configuration: "7.1.4" },
      },
    },
  };
}

// Mock placedSpeakers: 5 bed + 4 overhead = 9 channels (no subs)
function makePlacedSpeakers() {
  return [
    { role: "FL", position: { x: 1, y: 0.3 } },
    { role: "FC", position: { x: 2.25, y: 0.3 } },
    { role: "FR", position: { x: 3.5, y: 0.3 } },
    { role: "SL", position: { x: 0.3, y: 3 } },
    { role: "SR", position: { x: 4.2, y: 3 } },
    { role: "TFL", position: { x: 1, y: 0.5 } },
    { role: "TFR", position: { x: 3.5, y: 0.5 } },
    { role: "TRL", position: { x: 1, y: 5.5 } },
    { role: "TRR", position: { x: 3.5, y: 5.5 } },
  ];
}

function makeSub(id, x, y, enabled = true) {
  return { id, model: "SUB2-12", enabled, position: { x, y }, bottomHeightM: 0.05 };
}

test("P2 subwoofer count: 0 subs → report says 0", () => {
  const result = selectClientP2SystemArchitecture(
    makeAnalysisResult("L2", 9),
    makePlacedSpeakers(),
    [],
  );
  assert.equal(result.subCount, 0);
  assert.equal(result.bedCount, 5);
  assert.equal(result.overheadCount, 4);
  assert.equal(result.discreteCount, 9);
  assert.equal(result.level, "L2");
});

test("P2 subwoofer count: 2 subs → report says 2", () => {
  const subs = [makeSub("s1", 1, 5.5), makeSub("s2", 3.5, 5.5)];
  const result = selectClientP2SystemArchitecture(
    makeAnalysisResult("L2", 9),
    makePlacedSpeakers(),
    subs,
  );
  assert.equal(result.subCount, 2);
  assert.equal(result.bedCount, 5);
  assert.equal(result.overheadCount, 4);
  assert.equal(result.discreteCount, 9);
  assert.equal(result.subwoofers.length, 2);
});

test("P2 subwoofer count: 4 subs → report says 4", () => {
  const subs = [
    makeSub("s1", 1, 5.5),
    makeSub("s2", 3.5, 5.5),
    makeSub("s3", 1, 0.5),
    makeSub("s4", 3.5, 0.5),
  ];
  const result = selectClientP2SystemArchitecture(
    makeAnalysisResult("L2", 9),
    makePlacedSpeakers(),
    subs,
  );
  assert.equal(result.subCount, 4);
  assert.equal(result.bedCount, 5);
  assert.equal(result.overheadCount, 4);
  assert.equal(result.discreteCount, 9);
  assert.equal(result.subwoofers.length, 4);
});

test("P2 subwoofer count: disabled subs are not counted", () => {
  const subs = [
    makeSub("s1", 1, 5.5, true),
    makeSub("s2", 3.5, 5.5, false), // disabled
    makeSub("s3", 1, 0.5, true),
    makeSub("s4", 3.5, 0.5, false), // disabled
  ];
  const result = selectClientP2SystemArchitecture(
    makeAnalysisResult("L2", 9),
    makePlacedSpeakers(),
    subs,
  );
  assert.equal(result.subCount, 2);
  assert.equal(result.subwoofers.length, 2);
});

test("P2 level unchanged when sub count changes (0 → 4)", () => {
  const analysis = makeAnalysisResult("L2", 9);
  const speakers = makePlacedSpeakers();

  const r0 = selectClientP2SystemArchitecture(analysis, speakers, []);
  const r4 = selectClientP2SystemArchitecture(analysis, speakers, [
    makeSub("s1", 1, 5.5),
    makeSub("s2", 3.5, 5.5),
    makeSub("s3", 1, 0.5),
    makeSub("s4", 3.5, 0.5),
  ]);

  assert.equal(r0.level, r4.level, "P2 level must not change with sub count");
  assert.equal(r0.discreteCount, r4.discreteCount, "discrete count must not change");
  assert.equal(r0.bedCount, r4.bedCount);
  assert.equal(r0.overheadCount, r4.overheadCount);
  assert.notEqual(r0.subCount, r4.subCount, "sub count should differ");
});

test("P2 subwoofers have positions for plan rendering", () => {
  const subs = [makeSub("s1", 1.2, 5.5), makeSub("s2", 3.3, 5.5)];
  const result = selectClientP2SystemArchitecture(
    makeAnalysisResult("L2", 9),
    makePlacedSpeakers(),
    subs,
  );
  assert.ok(result.subwoofers.every((s) => Number.isFinite(s.x) && Number.isFinite(s.y)));
});

test("P2 returns null when analysisResult is null", () => {
  assert.equal(selectClientP2SystemArchitecture(null, makePlacedSpeakers(), []), null);
});

test("P2 handles undefined subwooferInstances gracefully", () => {
  const result = selectClientP2SystemArchitecture(
    makeAnalysisResult("L2", 9),
    makePlacedSpeakers(),
    undefined,
  );
  assert.equal(result.subCount, 0);
  assert.equal(result.subwoofers.length, 0);
});