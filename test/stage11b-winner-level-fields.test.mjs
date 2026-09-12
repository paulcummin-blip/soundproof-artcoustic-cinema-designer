// test/stage11b-winner-level-fields.test.mjs
// Tests that the canonical confirmation result includes achievedP19Level
// and achievedP20Level, and that materiality path A detects level improvements.
//
// Before fix: confirmation result omitted achievedP19Level/achievedP20Level,
// causing numericLevel(undefined) → 0, which broke path A (level improvement
// detection) and caused "FAIL → —" / "L1 → —" in the UI.
//
// After fix: confirmation result includes achievedP19Level/achievedP20Level
// from the canonical authority, and path A correctly detects improvements.
//
// Run: node --import ./test/_alias-register.mjs test/stage11b-winner-level-fields.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { isMaterialImprovement } from "@/components/room/bass/improveBassV2/materialityGate";

// ── Simulated confirmation results (matching the post-fix structure) ─────

function makeConfirmationResult({ p19Level, p20Level, p19Db = 6.0, p20Db = 8.0, perSeatP19 = [], perSeatP20 = [] }) {
  return {
    achievedP19Level: p19Level,
    achievedP20Level: p20Level,
    achievedP19VariationDb: p19Db,
    achievedP20VariationDb: p20Db,
    perSeatP19: perSeatP19.length ? perSeatP19 : perSeatP20.map(s=>({seatId:s.seatId,isPrimary:true,variationDbRaw:6.5,level:0})),
    perSeatP20,
  };
}

function makePrimarySeat(seatId, variationDbRaw, level, parameter = "P20") {
  const seat = { seatId, isPrimary: true, variationDbRaw, level };
  return parameter === "P19" ? { ...seat } : { ...seat };
}

// ── Tests ────────────────────────────────────────────────────────────────

test("Path A: P19 FAIL → L1 is detected as material improvement", () => {
  const current = makeConfirmationResult({
    p19Level: 0, p20Level: 1,
    perSeatP19: [makePrimarySeat("r1-c1", 6.1, 0, "P19")],
    perSeatP20: [makePrimarySeat("r1-c1", 6.9, 1)],
  });
  const candidate = makeConfirmationResult({
    p19Level: 1, p20Level: 1,
    p19Db: 3.5,
    perSeatP19: [makePrimarySeat("r1-c1", 5.5, 1, "P19")],
    perSeatP20: [makePrimarySeat("r1-c1", 6.9, 1)],
  });

  const mat = isMaterialImprovement(current, candidate);
  assert.strictEqual(mat.material, true, "Path A should fire for P19 FAIL → L1");
  assert.ok(mat.reason.includes("Level improvement"),
    `Expected 'Level improvement' in reason, got: ${mat.reason}`);
  assert.ok(mat.reason.includes("P19"),
    `Expected P19 in reason, got: ${mat.reason}`);
});

test("Path A: P20 L1 → L2 is detected as material improvement", () => {
  const current = makeConfirmationResult({
    p19Level: 0, p20Level: 1,
    perSeatP20: [makePrimarySeat("r1-c1", 6.9, 1)],
  });
  const candidate = makeConfirmationResult({
    p19Level: 0, p20Level: 2,
    p20Db: 3.5,
    perSeatP20: [makePrimarySeat("r1-c1", 4.5, 2)],
  });

  const mat = isMaterialImprovement(current, candidate);
  assert.strictEqual(mat.material, true, "Path A should fire for P20 L1 → L2");
  assert.ok(mat.reason.includes("P20"),
    `Expected P20 in reason, got: ${mat.reason}`);
});

test("Path A does NOT fire when levels are unchanged", () => {
  const current = makeConfirmationResult({
    p19Level: 0, p20Level: 1,
    perSeatP20: [makePrimarySeat("r1-c1", 6.9, 1)],
  });
  const candidate = makeConfirmationResult({
    p19Level: 0, p20Level: 1,
    p20Db: 6.5,
    perSeatP20: [makePrimarySeat("r1-c1", 6.5, 1)],
  });

  const mat = isMaterialImprovement(current, candidate);
  // Path A should NOT fire (same levels). Path B might fire if improvement >= 1.0 dB.
  assert.ok(!mat.reason.includes("Level improvement"),
    `Path A should not fire for same levels, got: ${mat.reason}`);
});

test("Confirmation result with achievedP19Level=undefined no longer silently passes path A", () => {
  // Simulate the OLD broken behavior: undefined level → numericLevel → 0
  // With the fix, the confirmation result should always have the level set.
  // This test documents the regression: if achievedP19Level is missing,
  // path A cannot fire (it treats it as 0).
  const current = {
    achievedP19Level: 0, achievedP20Level: 1,
    achievedP19VariationDb: 6.1, achievedP20VariationDb: 11.3,
    perSeatP19: [], perSeatP20: [],
  };
  const candidateBroken = {
    achievedP19Level: undefined, // MISSING — the old bug
    achievedP20Level: 1,
    achievedP19VariationDb: 3.5, achievedP20VariationDb: 8.0,
    perSeatP19: [], perSeatP20: [],
  };

  const mat = isMaterialImprovement(current, candidateBroken);
  // With undefined → 0, path A sees 0 > 0 = false, so it does NOT fire.
  // This documents WHY the fix is needed: the confirmation result MUST set the level.
  assert.strictEqual(mat.material, false,
    "With undefined achievedP19Level, path A cannot fire — documents the bug");
});

test("Headline level alone cannot qualify empty seat assessments", () => {
  // After fix: confirmation result has achievedP19Level set from authority
  const current = {
    achievedP19Level: 0, achievedP20Level: 1,
    achievedP19VariationDb: 6.1, achievedP20VariationDb: 11.3,
    perSeatP19: [], perSeatP20: [],
  };
  const candidateFixed = {
    achievedP19Level: 1, // NOW POPULATED from authority
    achievedP20Level: 1,
    achievedP19VariationDb: 3.5, achievedP20VariationDb: 8.0,
    perSeatP19: [], perSeatP20: [],
  };

  const mat = isMaterialImprovement(current, candidateFixed);
  assert.strictEqual(mat.material, false,
    "A headline level cannot qualify missing seat results");
  assert.ok(mat.reason.includes("Invalid or incomplete"), `Expected invalid seat data in reason: ${mat.reason}`);
});