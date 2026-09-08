// test/stage11b-eta-finalising.test.mjs
// Tests that ETA "Finalising…" only shows for the actual "finalising" phase,
// not when any intermediate phase reaches current === total.
//
// Run: node --import ./test/_alias-register.mjs test/stage11b-eta-finalising.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { computeEta, formatEta } from "@/components/room/bass/improveBassV2/etaCalculator";

test("Intermediate phase completion does NOT show 'Finalising…'", () => {
  // A screening phase completes (current === total) but is NOT the finalising phase
  const eta = computeEta([100, 110, 105, 120], 5, 5, "confirming_symmetric");
  assert.notStrictEqual(eta.status, "finalising",
    `Intermediate phase completion should not be 'finalising', got: ${eta.status}`);
});

test("Actual 'finalising' phase shows 'Finalising…'", () => {
  const eta = computeEta([], 0, 1, "finalising");
  assert.strictEqual(eta.status, "finalising",
    `Finalising phase should be 'finalising', got: ${eta.status}`);
});

test("formatEta shows 'Finalising…' only for finalising status", () => {
  assert.strictEqual(formatEta("finalising", null), "Finalising\u2026");
  assert.notStrictEqual(formatEta("estimating", null), "Finalising\u2026");
  assert.notStrictEqual(formatEta("measured", 30), "Finalising\u2026");
});

test("Phase with current < total and enough samples shows 'measured'", () => {
  const eta = computeEta([100, 110, 105, 120], 2, 10, "confirming_individual");
  assert.strictEqual(eta.status, "measured",
    `Should be 'measured' with enough samples, got: ${eta.status}`);
  assert.ok(eta.etaSeconds > 0, "Should have positive ETA seconds");
});

test("Phase with current < total and insufficient samples shows 'estimating'", () => {
  const eta = computeEta([100], 1, 10, "screening_symmetric");
  assert.strictEqual(eta.status, "estimating",
    `Should be 'estimating' with < MIN_ETA_SAMPLES, got: ${eta.status}`);
});

test("No phase argument defaults to non-finalising (backward compat)", () => {
  // When phase is undefined (older callers), should NOT be "finalising"
  const eta = computeEta([100, 110, 105], 5, 5);
  assert.notStrictEqual(eta.status, "finalising",
    `Undefined phase should not be 'finalising', got: ${eta.status}`);
});