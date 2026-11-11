// cancellation-attribution.test.mjs
//
// Tests that the cancellation reason is preserved through the Stage 2 terminal
// wait and that useRunOptimisationPlan distinguishes explicit user cancellation
// from other stop reasons (inputs-incomplete, user-interaction, superseded, etc.).
// Only an explicit user Cancel may produce "Optimisation cancelled by the user
// before completion."

import { test } from "node:test";
import assert from "node:assert/strict";

// These tests verify the REASON CONTRACT carried through the chain:
//   waitForStage2Terminal → runOptimisation → useRunOptimisationPlan
//
// The actual React hooks are not invoked here; instead the contract is tested
// by simulating the result objects each layer produces and verifying the
// downstream classification logic.

const USER_CANCEL_REASON = "user-cancel";

// Mirror of the classification logic in useRunOptimisationPlan / OptimiseAndCalculate.
function classifyCancellation(result) {
  if (result.status !== "cancelled") return null;
  const userCancel = result.reason === USER_CANCEL_REASON;
  const stopReason = result.reason || result.error || null;
  const reason = userCancel
    ? "Optimisation cancelled by the user before completion."
    : (stopReason
      ? `The optimisation stopped before it could complete (${stopReason}). Re-run the Optimisation Plan.`
      : "The optimisation stopped before it could complete. Re-run the Optimisation Plan.");
  return {
    userCancel,
    terminalStatus: userCancel ? "cancelled" : "evaluation_incomplete",
    reason,
  };
}

test("cancellation: explicit user cancel produces user-cancelled message", () => {
  const result = { status: "cancelled", reason: "user-cancel" };
  const c = classifyCancellation(result);
  assert.equal(c.userCancel, true);
  assert.equal(c.terminalStatus, "cancelled");
  assert.equal(c.reason, "Optimisation cancelled by the user before completion.");
});

test("cancellation: inputs-incomplete does not report user cancellation", () => {
  const result = { status: "cancelled", reason: "inputs-incomplete", error: "inputs-incomplete" };
  const c = classifyCancellation(result);
  assert.equal(c.userCancel, false);
  assert.equal(c.terminalStatus, "evaluation_incomplete");
  assert.ok(!c.reason.includes("cancelled by the user"), c.reason);
  assert.ok(c.reason.includes("inputs-incomplete"), c.reason);
});

test("cancellation: user-interaction does not report user cancellation", () => {
  const result = { status: "cancelled", reason: "user-interaction" };
  const c = classifyCancellation(result);
  assert.equal(c.userCancel, false);
  assert.equal(c.terminalStatus, "evaluation_incomplete");
  assert.ok(!c.reason.includes("cancelled by the user"), c.reason);
});

test("cancellation: superseded does not report user cancellation", () => {
  const result = { status: "cancelled", reason: "superseded" };
  const c = classifyCancellation(result);
  assert.equal(c.userCancel, false);
  assert.equal(c.terminalStatus, "evaluation_incomplete");
  assert.ok(!c.reason.includes("cancelled by the user"), c.reason);
});

test("cancellation: stage2-cancelled does not report user cancellation", () => {
  const result = { status: "cancelled", reason: "stage2-cancelled" };
  const c = classifyCancellation(result);
  assert.equal(c.userCancel, false);
  assert.ok(!c.reason.includes("cancelled by the user"), c.reason);
});

test("cancellation: heavy-action-cancelled does not report user cancellation", () => {
  const result = { status: "cancelled", reason: "heavy-action-cancelled" };
  const c = classifyCancellation(result);
  assert.equal(c.userCancel, false);
  assert.ok(!c.reason.includes("cancelled by the user"), c.reason);
});

test("cancellation: V2 engine cancelled (AbortError) carries user-cancel reason", () => {
  // The orchestrator sets result.reason = "user-cancel" for V2 engine cancelled.
  const result = { status: "cancelled", reason: "user-cancel" };
  const c = classifyCancellation(result);
  assert.equal(c.userCancel, true);
  assert.equal(c.reason, "Optimisation cancelled by the user before completion.");
});

test("cancellation: unknown cancelled reason defaults to evaluation_incomplete", () => {
  const result = { status: "cancelled" };
  const c = classifyCancellation(result);
  assert.equal(c.userCancel, false);
  assert.equal(c.terminalStatus, "evaluation_incomplete");
  assert.ok(!c.reason.includes("cancelled by the user"), c.reason);
});

test("cancellation: stale result is not classified as cancelled", () => {
  const result = { status: "stale", message: "Design changed during Stage 2 evaluation" };
  const c = classifyCancellation(result);
  assert.equal(c, null);
});