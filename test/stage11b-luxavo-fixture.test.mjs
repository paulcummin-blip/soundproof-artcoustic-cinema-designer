// test/stage11b-luxavo-fixture.test.mjs
// Luxavo/Duffy winner regression fixture.
//
// Current:  front pair x = 1.0 / 3.0, rear pair unchanged
// Winner:   front pair x = 0.9 / 3.1, rear pair unchanged
//
// Current P20 worst ≈ 11.3 dB
// Winner  P20 worst ≈ 8.2 dB
//
// Primary r1-c1: 6.92 → ~7.90 dB (same L1, +0.98 dB)
//   → NOT vetoed by >1.0 dB guard
//   → candidate may remain material through Path C
//   → UI visibly exposes the primary-seat trade-off
//
// Also test: 6.92 → 8.10 dB (same L1, +1.18 dB) → REJECTED
//
// Run: node --import ./test/_alias-register.mjs test/stage11b-luxavo-fixture.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { isMaterialImprovement } from "@/components/room/bass/improveBassV2/materialityGate";
import { hasPrimarySeatRegression } from "@/components/room/bass/best-layout/authoritativeFinalistSelection";
import { buildWhatChanged } from "@/components/room/bass/improveBassV2/improveBassV2WhatChanged";

// ── Luxavo fixture ──────────────────────────────────────────────────────

const ROOM = { widthM: 4.5, lengthM: 6.0, heightM: 2.4 };

const currentInstances = [
  { id: "sub-1", model: "SUB2-12", enabled: true, position: { x: 1.0, y: 0.3 }, delayMs: 0, gainDb: 0, polarity: 0 },
  { id: "sub-2", model: "SUB2-12", enabled: true, position: { x: 3.5, y: 0.3 }, delayMs: 0, gainDb: 0, polarity: 0 },
  { id: "sub-3", model: "SUB2-12", enabled: true, position: { x: 1.0, y: 5.7 }, delayMs: 0, gainDb: 0, polarity: 0 },
  { id: "sub-4", model: "SUB2-12", enabled: true, position: { x: 3.5, y: 5.7 }, delayMs: 0, gainDb: 0, polarity: 0 },
];

const winnerCoordinates = [
  { x: 0.9, y: 0.3 },   // front-left moved 100mm outward
  { x: 3.6, y: 0.3 },   // front-right moved 100mm outward
  { x: 1.0, y: 5.7 },   // rear-left unchanged
  { x: 3.5, y: 5.7 },   // rear-right unchanged
];

const currentSnapshot = {
  positions: currentInstances.map((i) => ({ x: i.position.x, y: i.position.y })),
  tuning: currentInstances.map(() => ({ delayMs: 0, gainDb: 0, polarity: 0 })),
  eqSignature: "eq-v1",
};

const winner = {
  coordinates: winnerCoordinates,
  appliedTuning: currentInstances.map(() => ({ delayMs: 0, gainDb: 0, polarity: 0 })),
  canonicalAuthorityReceipt: { filterBankSignature: "eq-v1" },
  achievedP19Level: 0,
  achievedP20Level: 1,
  achievedP19VariationDb: 6.2,
  achievedP20VariationDb: 8.2,
  perSeatP19: [
    { seatId: "r1-c1", isPrimary: true, variationDbRaw: 6.2, level: 0 },
    { seatId: "r1-c2", isPrimary: true, variationDbRaw: 6.2, level: 0 },
    { seatId: "r2-c1", isPrimary: false, variationDbRaw: 6.2, level: 0 },
    { seatId: "r2-c2", isPrimary: false, variationDbRaw: 6.2, level: 0 },
    { seatId: "r2-c3", isPrimary: false, variationDbRaw: 6.2, level: 0 },
  ],
  perSeatP20: [
    { seatId: "r1-c1", isPrimary: true, variationDbRaw: 7.90, level: 1 },
    { seatId: "r1-c2", isPrimary: true, variationDbRaw: 5.0, level: 1 },
    { seatId: "r2-c1", isPrimary: false, variationDbRaw: 8.2, level: 1 },
    { seatId: "r2-c2", isPrimary: false, variationDbRaw: 8.0, level: 1 },
    { seatId: "r2-c3", isPrimary: false, variationDbRaw: 8.2, level: 1 },
  ],
};

const currentAuthority = {
  achievedP19Level: 0,
  achievedP20Level: 1,
  achievedP19VariationDb: 6.1,
  achievedP20VariationDb: 11.3,
  perSeatP19: [
    { seatId: "r1-c1", isPrimary: true, variationDbRaw: 6.1, level: 0 },
    { seatId: "r1-c2", isPrimary: true, variationDbRaw: 6.1, level: 0 },
    { seatId: "r2-c1", isPrimary: false, variationDbRaw: 6.1, level: 0 },
    { seatId: "r2-c2", isPrimary: false, variationDbRaw: 6.1, level: 0 },
    { seatId: "r2-c3", isPrimary: false, variationDbRaw: 6.1, level: 0 },
  ],
  perSeatP20: [
    { seatId: "r1-c1", isPrimary: true, variationDbRaw: 6.92, level: 1 },
    { seatId: "r1-c2", isPrimary: true, variationDbRaw: 6.92, level: 1 },
    { seatId: "r2-c1", isPrimary: false, variationDbRaw: 11.3, level: 1 },
    { seatId: "r2-c2", isPrimary: false, variationDbRaw: 11.2, level: 1 },
    { seatId: "r2-c3", isPrimary: false, variationDbRaw: 11.3, level: 1 },
  ],
};

// ── Tests ────────────────────────────────────────────────────────────────

test("Luxavo 0.98 dB trade-off: NOT vetoed by primary raw-regression guard", () => {
  const reg = hasPrimarySeatRegression(winner, currentAuthority);
  assert.strictEqual(reg.regressed, false,
    `+0.98 dB same-level should NOT be vetoed, got: ${JSON.stringify(reg)}`);
});

test("Luxavo 0.98 dB trade-off: material via path C (severe null reduction)", () => {
  const mat = isMaterialImprovement(currentAuthority, winner);
  assert.strictEqual(mat.material, true,
    `Should be material via path C (3.1 dB null reduction), got: ${mat.material}`);
  assert.ok(mat.reason.includes("null") || mat.reason.includes("dB"),
    `Expected null/dB reason, got: ${mat.reason}`);
});

test("Luxavo 1.18 dB trade-off: REJECTED by primary raw-regression guard", () => {
  const winnerRejected = {
    ...winner,
    perSeatP20: [
      { seatId: "r1-c1", isPrimary: true, variationDbRaw: 8.10, level: 1 },
      { seatId: "r1-c2", isPrimary: true, variationDbRaw: 5.0, level: 1 },
      ...winner.perSeatP20.filter(s=>!s.isPrimary),
    ],
  };
  const reg = hasPrimarySeatRegression(winnerRejected, currentAuthority);
  assert.strictEqual(reg.regressed, true,
    `+1.18 dB same-level should be REJECTED, got: ${JSON.stringify(reg)}`);
  assert.ok(reg.reason && reg.reason.includes("same-level raw regression"),
    `Expected raw regression reason: ${reg.reason}`);
});

test("Luxavo 1.18 dB trade-off: NOT material", () => {
  const winnerRejected = {
    ...winner,
    perSeatP20: [
      { seatId: "r1-c1", isPrimary: true, variationDbRaw: 8.10, level: 1 },
      { seatId: "r1-c2", isPrimary: true, variationDbRaw: 5.0, level: 1 },
      ...winner.perSeatP20.filter(s=>!s.isPrimary),
    ],
  };
  const mat = isMaterialImprovement(currentAuthority, winnerRejected);
  assert.strictEqual(mat.material, false,
    "Should be rejected by primary raw-regression guard");
  assert.ok(mat.reason.includes("same-level raw regression"),
    `Expected raw regression in reason: ${mat.reason}`);
});

test("Luxavo movement: 'Subs added' NOT shown — front pair moved, rear unchanged", () => {
  const whatChanged = buildWhatChanged(currentSnapshot, winner);
  assert.strictEqual(whatChanged.designChanges.length > 0, true,
    "Should have design changes");
  const allText = whatChanged.designChanges.join(" ");
  assert.ok(!allText.includes("added"),
    `Should NOT say 'added', got: ${allText}`);
  assert.ok(allText.includes("moved"),
    `Should say 'moved', got: ${allText}`);
});

test("Luxavo movement: rear pair unchanged not reported as moved", () => {
  const whatChanged = buildWhatChanged(currentSnapshot, winner);
  const allText = whatChanged.designChanges.join(" ");
  // Only 2 subs should be mentioned as moved (front pair), not all 4
  const movedCount = (allText.match(/Sub \d+ moved/g) || []).length;
  assert.strictEqual(movedCount, 2,
    `Expected 2 subs moved (front pair), got ${movedCount}: ${allText}`);
});

test("Luxavo winner has achievedP19Level and achievedP20Level populated", () => {
  assert.ok(winner.achievedP19Level != null,
    "achievedP19Level must be populated");
  assert.ok(winner.achievedP20Level != null,
    "achievedP20Level must be populated");
});