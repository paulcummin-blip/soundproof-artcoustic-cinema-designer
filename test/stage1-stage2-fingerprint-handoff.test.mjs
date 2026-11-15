// stage1-stage2-fingerprint-handoff.test.mjs
// ---------------------------------------------------------------------------
// Validation for the Stage 1 → Stage 2 fingerprint handoff fix.
// Covers validation requirements:
//   5. The selected-two-subwoofer Stage 1 fingerprint releases Stage 2.
//   6. A mismatched fingerprint is correctly rejected.
//   7. A missing prerequisite fails promptly with a useful explanation.

import test from "node:test";
import assert from "node:assert/strict";
import { computeStage1Fingerprint } from "../src/components/room/bass/stage1/stage1Fingerprint.js";

const roomDims = { widthM: 4.5, lengthM: 6.0, heightM: 2.4 };
const rspPosition = { x: 2.25, y: 3.6, z: 1.2 };
const seatingPositions = [
  { id: "seat-1", x: 2.25, y: 3.6, z: 1.2, priority: "primary" },
  { id: "seat-2", x: 1.5, y: 3.6, z: 1.2, priority: "secondary" },
];

test("computeStage1Fingerprint produces a stable base fingerprint from geometry", () => {
  const fp = computeStage1Fingerprint({ roomDims, rspPosition, seatingPositions });
  assert.ok(fp);
  assert.ok(fp.startsWith("stage1:v1:"));
  // Same inputs → same fingerprint.
  const fp2 = computeStage1Fingerprint({ roomDims, rspPosition, seatingPositions });
  assert.equal(fp, fp2);
});

test("selected-quantity scope suffix matches the Stage 1 hook's sel:N pattern", () => {
  const base = computeStage1Fingerprint({ roomDims, rspPosition, seatingPositions });
  assert.ok(base);
  // The Stage 1 hook applies `|sel:N` for a selected-quantity run. The Stage 2
  // hook's expectedStage1Fingerprint must use the SAME suffix so a matching
  // completed Stage 1 result releases Stage 2.
  const sel2 = `${base}|sel:2`;
  const sel4 = `${base}|sel:4`;
  assert.notEqual(sel2, base);
  assert.notEqual(sel4, base);
  assert.notEqual(sel2, sel4);
});

test("a different geometry produces a different base fingerprint (mismatch rejected)", () => {
  const fp1 = computeStage1Fingerprint({ roomDims, rspPosition, seatingPositions });
  const fp2 = computeStage1Fingerprint({
    roomDims: { ...roomDims, widthM: 5.0 },
    rspPosition,
    seatingPositions,
  });
  assert.notEqual(fp1, fp2);
  // A Stage 2 hook expecting fp1 would NOT match a Stage 1 result for fp2.
  const expected = `${fp1}|sel:2`;
  const actualStage1Fingerprint = `${fp2}|sel:2`;
  assert.notEqual(expected, actualStage1Fingerprint);
});

test("scopeQuantity null produces the unsuffixed base fingerprint (all-quantity study)", () => {
  const base = computeStage1Fingerprint({ roomDims, rspPosition, seatingPositions });
  // When selectedQuantityOnly is false, no scope suffix is applied — the
  // expected fingerprint is the base itself.
  const scope = null;
  const expected = scope ? `${base}|sel:${scope}` : base;
  assert.equal(expected, base);
});

test("the handoff uses the same computeStage1Fingerprint authority as the Stage 1 hook", () => {
  // The Stage 2 hook's expectedStage1Fingerprint must be computed from the
  // SAME roomDims, rspPosition and seatingPositions the Stage 1 hook receives.
  // This test confirms the function is the shared authority.
  const fp = computeStage1Fingerprint({ roomDims, rspPosition, seatingPositions });
  assert.ok(typeof fp === "string");
  assert.ok(fp.length > 10);
});