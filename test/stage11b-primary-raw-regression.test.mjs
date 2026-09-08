// test/stage11b-primary-raw-regression.test.mjs
// Primary-seat same-level raw-regression guard tests.
//
// A primary seat that stays in the same displayed P19/P20 level but whose
// raw deviation worsens by MORE than 1.0 dB must be rejected.
//
// Examples:
//   6.92 → 7.90 dB  (delta +0.98, same L1) → ALLOWED
//   6.92 → 8.10 dB  (delta +1.18, same L1) → REJECTED
//
// Run: node --import ./test/_alias-register.mjs test/stage11b-primary-raw-regression.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { isMaterialImprovement } from "@/components/room/bass/improveBassV2/materialityGate";
import { hasPrimarySeatRegression } from "@/components/room/bass/best-layout/authoritativeFinalistSelection";

// ── Fixtures ─────────────────────────────────────────────────────────────

function makeResult({ p19Level, p20Level, perSeatP19 = [], perSeatP20 = [] }) {
  return {
    achievedP19Level: p19Level,
    achievedP20Level: p20Level,
    achievedP19VariationDb: 6.1,
    achievedP20VariationDb: 11.3,
    perSeatP19,
    perSeatP20,
  };
}

function makePrimarySeatP20(seatId, variationDbRaw, level = 1) {
  return { seatId, isPrimary: true, variationDbRaw, level };
}

// Current: r1-c1 P20 = 6.92 dB, L1
const currentPerSeatP20 = [
  makePrimarySeatP20("r1-c1", 6.92, 1),
  makePrimarySeatP20("r1-c2", 6.92, 1),
];

// ── Tests: materialityGate (via isMaterialImprovement) ───────────────────

test("0.98 dB same-level primary regression is ALLOWED by materialityGate", () => {
  const current = makeResult({
    p19Level: 0, p20Level: 1,
    perSeatP20: currentPerSeatP20,
  });
  // Candidate: r1-c1 worsens to 7.90 (delta +0.98), same L1
  const candidate = makeResult({
    p19Level: 0, p20Level: 1,
    achievedP20VariationDb: 8.2,
    perSeatP20: [
      makePrimarySeatP20("r1-c1", 7.90, 1),
      makePrimarySeatP20("r1-c2", 5.0, 1),
    ],
  });

  const mat = isMaterialImprovement(current, candidate);
  // Should NOT be vetoed by the primary raw-regression guard
  // (may still be material via path C: severe null reduction)
  assert.ok(!mat.reason.includes("same-level raw regression"),
    `Expected no same-level raw regression veto, got: ${mat.reason}`);
});

test("1.18 dB same-level primary regression is REJECTED by materialityGate", () => {
  const current = makeResult({
    p19Level: 0, p20Level: 1,
    perSeatP20: currentPerSeatP20,
  });
  // Candidate: r1-c1 worsens to 8.10 (delta +1.18), same L1
  const candidate = makeResult({
    p19Level: 0, p20Level: 1,
    achievedP20VariationDb: 8.2,
    perSeatP20: [
      makePrimarySeatP20("r1-c1", 8.10, 1),
      makePrimarySeatP20("r1-c2", 5.0, 1),
    ],
  });

  const mat = isMaterialImprovement(current, candidate);
  assert.strictEqual(mat.material, false,
    `Expected material=false for +1.18 dB same-level regression, got material=${mat.material}`);
  assert.ok(mat.reason.includes("same-level raw regression"),
    `Expected 'same-level raw regression' in reason, got: ${mat.reason}`);
});

// ── Tests: authoritativeFinalistSelection hasPrimarySeatRegression ──────

test("0.98 dB same-level primary regression is ALLOWED by authoritativeFinalistSelection", () => {
  const current = makeResult({ p19Level: 0, p20Level: 1, perSeatP20: currentPerSeatP20 });
  const candidate = makeResult({
    p19Level: 0, p20Level: 1,
    perSeatP20: [
      makePrimarySeatP20("r1-c1", 7.90, 1),
      makePrimarySeatP20("r1-c2", 5.0, 1),
    ],
  });

  const reg = hasPrimarySeatRegression(candidate, current);
  assert.strictEqual(reg.regressed, false,
    `Expected regressed=false for +0.98 dB, got: ${JSON.stringify(reg)}`);
});

test("1.18 dB same-level primary regression is REJECTED by authoritativeFinalistSelection", () => {
  const current = makeResult({ p19Level: 0, p20Level: 1, perSeatP20: currentPerSeatP20 });
  const candidate = makeResult({
    p19Level: 0, p20Level: 1,
    perSeatP20: [
      makePrimarySeatP20("r1-c1", 8.10, 1),
      makePrimarySeatP20("r1-c2", 5.0, 1),
    ],
  });

  const reg = hasPrimarySeatRegression(candidate, current);
  assert.strictEqual(reg.regressed, true,
    `Expected regressed=true for +1.18 dB, got: ${JSON.stringify(reg)}`);
  assert.ok(reg.reason && reg.reason.includes("same-level raw regression"),
    `Expected 'same-level raw regression' reason, got: ${reg.reason}`);
});

test("Level regression still takes priority over raw guard", () => {
  const current = makeResult({
    p19Level: 0, p20Level: 1,
    perSeatP20: [makePrimarySeatP20("r1-c1", 6.92, 2)],
  });
  // Candidate drops from L2 to L1 (level regression)
  const candidate = makeResult({
    p19Level: 0, p20Level: 1,
    perSeatP20: [makePrimarySeatP20("r1-c1", 7.0, 1)],
  });

  const reg = hasPrimarySeatRegression(candidate, current);
  assert.strictEqual(reg.regressed, true, "Level regression should fire");
  assert.ok(!reg.reason, "Should be level regression, not raw regression");
});