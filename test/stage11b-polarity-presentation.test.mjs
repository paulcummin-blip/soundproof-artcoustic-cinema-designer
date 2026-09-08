// test/stage11b-polarity-presentation.test.mjs
// Tests that buildWhatChanged surfaces polarity only when it changes.
//
// All-normal polarity → no polarity line.
// Any inverted sub → "Sub X inverted" surfaced.
//
// Run: node --import ./test/_alias-register.mjs test/stage11b-polarity-presentation.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { buildWhatChanged } from "@/components/room/bass/improveBassV2/improveBassV2WhatChanged";

const snapshot = {
  positions: [
    { x: 1.0, y: 0.3 },
    { x: 3.5, y: 0.3 },
  ],
  tuning: [
    { delayMs: 0, gainDb: 0, polarity: 0 },
    { delayMs: 0, gainDb: 0, polarity: 0 },
  ],
  eqSignature: "eq-v1",
};

const winnerCoords = [
  { x: 1.0, y: 0.3 },
  { x: 3.5, y: 0.3 },
];

test("All-normal polarity produces no polarity line", () => {
  const winner = {
    coordinates: winnerCoords,
    appliedTuning: [
      { delayMs: 0, gainDb: 0, polarity: 0 },
      { delayMs: 0, gainDb: 0, polarity: 0 },
    ],
    canonicalAuthorityReceipt: { filterBankSignature: "eq-v1" },
  };
  const whatChanged = buildWhatChanged(snapshot, winner);
  const calText = whatChanged.calibrationChanges.join(" ");
  assert.ok(!calText.includes("Polarity"),
    `Should NOT include polarity line, got: ${calText}`);
});

test("Inverted winner sub renders 'Sub X inverted'", () => {
  const winner = {
    coordinates: winnerCoords,
    appliedTuning: [
      { delayMs: 0, gainDb: 0, polarity: -1 }, // inverted
      { delayMs: 0, gainDb: 0, polarity: 0 },
    ],
    canonicalAuthorityReceipt: { filterBankSignature: "eq-v1" },
  };
  const whatChanged = buildWhatChanged(snapshot, winner);
  const calText = whatChanged.calibrationChanges.join(" ");
  assert.ok(calText.includes("Polarity"),
    `Should include polarity line, got: ${calText}`);
  assert.ok(calText.includes("Sub 1 inverted"),
    `Should mention 'Sub 1 inverted', got: ${calText}`);
});

test("Polarity change from inverted to normal is also surfaced", () => {
  const invertedSnapshot = {
    ...snapshot,
    tuning: [
      { delayMs: 0, gainDb: 0, polarity: -1 },
      { delayMs: 0, gainDb: 0, polarity: 0 },
    ],
  };
  const winner = {
    coordinates: winnerCoords,
    appliedTuning: [
      { delayMs: 0, gainDb: 0, polarity: 0 }, // back to normal
      { delayMs: 0, gainDb: 0, polarity: 0 },
    ],
    canonicalAuthorityReceipt: { filterBankSignature: "eq-v1" },
  };
  const whatChanged = buildWhatChanged(invertedSnapshot, winner);
  const calText = whatChanged.calibrationChanges.join(" ");
  assert.ok(calText.includes("Polarity"),
    `Should include polarity line for inversion change, got: ${calText}`);
});