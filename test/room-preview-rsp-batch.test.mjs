// room-preview-rsp-batch.test.mjs — Numerical-equivalence and worker-response
// contract tests for enabling the existing exact batch evaluator for RSP
// room-only preview.
//
// Verifies that the batch evaluator preserves the COMPLETE RSP result contract,
// not just the summed response:
//   1. Raw summed RSP response across all frequency samples.
//   2. Individual per-source subwoofer transfer curves (re/im complex pressure).
//   3. Source identities and ordering.
//   4. Frequency grid.
//   5. Phase and complex-transfer evidence.
//   6. 121-point interactive preview density.
//   7. listenerSelection preserved in the output.
//
// Run: node --import ./test/_alias-register.mjs --test test/room-preview-rsp-batch.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { computeNormalizedRoomTransfer as calculate } from "../src/components/room/bass/normalizedRoomTransferEngine.js";
import { canUseExactRoomPreviewBatch } from "../src/components/room/bass/exactRoomPreviewBatch.js";
import { buildNormalizedPhysicsOptions } from "../src/components/room/bass/normalizedPhysicsOptionsBuilder.js";
import { BASS_NORMALIZED_PHYSICS_DEFAULTS } from "../src/components/room/bass/bassPhysicsDefaults.js";

const baseInput = {
  roomDims: { widthM: 4.5, lengthM: 6, heightM: 2.4 },
  rspPosition: { id: "rsp", x: 2.25, y: 4.82, z: 1.2 },
  seatingPositions: [1.65, 2.25, 2.85].map((x, i) => ({
    id: "seat-" + i, x, y: 5.28, z: 1.2, priority: i === 2 ? "secondary" : "primary",
  })),
  subsForSimulation: [{
    id: "sub-1", x: 1.125, y: 0.1375, z: 0.3,
    tuning: { gainDb: 0, delayMs: 0, polarity: 0, phaseControlDeg: 0 },
  }],
  physicsOptions: buildNormalizedPhysicsOptions(BASS_NORMALIZED_PHYSICS_DEFAULTS),
  pointsPerOctave: 32,
  listenerSelection: { mode: "rsp" },
};

// Compare RSP-mode batch vs reference for a given input. Returns the batch
// result. Asserts every element of the RSP result contract.
function compareRspContract(p) {
  const before = JSON.stringify(p);
  const reference = calculate(p);
  const actual = calculate({ ...p, useExactPreviewBatch: true });

  assert.equal(actual.status, "complete");
  assert.equal(actual.geometryFingerprint, reference.geometryFingerprint);

  // (4) Frequency grid — exact match.
  assert.deepEqual(actual.frequencies, reference.frequencies);

  // (3) Source identities and ordering — exact match.
  assert.deepEqual(actual.sourceLayout, reference.sourceLayout);

  // (7) listenerSelection preserved.
  assert.deepEqual(actual.listenerSelection, reference.listenerSelection);

  // (1) Raw summed RSP response — numerical equivalence.
  assert.equal(actual.rspCurve.length, reference.rspCurve.length);
  let maxSplDelta = 0;
  for (let i = 0; i < actual.rspCurve.length; i++) {
    assert.equal(actual.rspCurve[i].frequency, reference.rspCurve[i].frequency);
    maxSplDelta = Math.max(maxSplDelta,
      Math.abs(actual.rspCurve[i].spl - reference.rspCurve[i].spl));
  }
  assert.ok(maxSplDelta < 1e-9, "RSP summed response max delta " + maxSplDelta);

  // (2)+(5) Per-source complex transfers — numerical equivalence of re/im.
  const refSources = reference.perSourceRspComplexTransfers;
  const actSources = actual.perSourceRspComplexTransfers;
  assert.equal(actSources.length, refSources.length,
    "per-source count mismatch");
  let maxReDelta = 0;
  let maxImDelta = 0;
  for (let s = 0; s < refSources.length; s++) {
    assert.equal(actSources[s].sourceIndex, refSources[s].sourceIndex,
      "source index mismatch at " + s);
    assert.equal(actSources[s].sourceId, refSources[s].sourceId,
      "source id mismatch at " + s);
    assert.equal(actSources[s].points.length, refSources[s].points.length,
      "point count mismatch at source " + s);
    for (let i = 0; i < refSources[s].points.length; i++) {
      assert.equal(actSources[s].points[i].frequency, refSources[s].points[i].frequency);
      maxReDelta = Math.max(maxReDelta,
        Math.abs(actSources[s].points[i].re - refSources[s].points[i].re));
      maxImDelta = Math.max(maxImDelta,
        Math.abs(actSources[s].points[i].im - refSources[s].points[i].im));
    }
  }
  // Floating-point reordering tolerance (sum-of-products factoring). The
  // established batch-modal-parity tests use 1e-6 for per-source re/im; the
  // existing All Seats room-preview test uses 1e-9 for summed SPL. This is
  // floating-point reordering noise from the factored dot product, NOT an
  // acoustic approximation.
  assert.ok(maxReDelta < 1e-6, "per-source re max delta " + maxReDelta);
  assert.ok(maxImDelta < 1e-6, "per-source im max delta " + maxImDelta);

  // RSP mode must not produce seat curves.
  assert.equal(actual.seatCurves.length, 0);
  assert.equal(reference.seatCurves.length, 0);

  // Input not mutated.
  assert.equal(JSON.stringify(p), before);
  return { actual, reference, maxSplDelta, maxReDelta, maxImDelta };
}

test("RSP single-source 121-point batch matches reference across the full result contract", () => {
  assert.ok(canUseExactRoomPreviewBatch(baseInput.physicsOptions, baseInput.subsForSimulation),
    "batch must be eligible for default AB-corrected physics");
  const { actual, maxSplDelta, maxReDelta, maxImDelta } = compareRspContract(baseInput);
  assert.equal(actual.frequencies.length, 121, "121-point RSP preview");
  assert.ok(maxSplDelta < 1e-9, "summed SPL within precision");
  assert.ok(maxReDelta < 1e-6, "per-source re within precision");
  assert.ok(maxImDelta < 1e-6, "per-source im within precision");
});

test("RSP multi-source with gain, delay, polarity and phase preserves per-source evidence", () => {
  const multiSource = {
    ...baseInput,
    subsForSimulation: [
      { ...baseInput.subsForSimulation[0],
        tuning: { gainDb: -3, delayMs: 2.75, polarity: -1, phaseControlDeg: 35 } },
      { ...baseInput.subsForSimulation[0], id: "sub-2", x: 3.1, y: 5.7, z: 0.85,
        tuning: { gainDb: 1.5, delayMs: 0.3, polarity: 180, phaseAdjust: 95 } },
    ],
  };
  assert.ok(canUseExactRoomPreviewBatch(multiSource.physicsOptions, multiSource.subsForSimulation));
  const { actual, maxReDelta, maxImDelta } = compareRspContract(multiSource);
  assert.equal(actual.perSourceRspComplexTransfers.length, 2,
    "two per-source transfers");
  assert.equal(actual.sourceLayout.count, 2);
  assert.ok(maxReDelta < 1e-6, "per-source re within precision with tuning");
  assert.ok(maxImDelta < 1e-6, "per-source im within precision with tuning");
});

test("RSP four-sub front/rear arrangement preserves per-source ordering and evidence", () => {
  const fourSub = {
    ...baseInput,
    roomDims: { widthM: 6, lengthM: 10, heightM: 3.2 },
    subsForSimulation: [
      { x: 0.9, y: 0.145, z: 0.27, id: "s0", tuning: { gainDb: 0, delayMs: 0, polarity: 0 } },
      { x: 5.1, y: 0.145, z: 0.27, id: "s1", tuning: { gainDb: 0, delayMs: 0, polarity: 0 } },
      { x: 0.9, y: 9.855, z: 0.9, id: "s2", tuning: { gainDb: 0, delayMs: 0, polarity: 0 } },
      { x: 5.1, y: 9.855, z: 0.9, id: "s3", tuning: { gainDb: 0, delayMs: 0, polarity: 0 } },
    ],
  };
  assert.ok(canUseExactRoomPreviewBatch(fourSub.physicsOptions, fourSub.subsForSimulation));
  const { actual, maxSplDelta } = compareRspContract(fourSub);
  assert.equal(actual.perSourceRspComplexTransfers.length, 4);
  assert.equal(actual.sourceLayout.count, 4);
  assert.deepEqual(actual.sourceLayout.positions.map(p => p.id), ["s0", "s1", "s2", "s3"]);
  assert.ok(maxSplDelta < 1e-9);
});

test("RSP changed geometry produces a different fingerprint (no stale reuse)", () => {
  const first = compareRspContract(baseInput);
  const movedSub = compareRspContract({
    ...baseInput,
    subsForSimulation: baseInput.subsForSimulation.map(s => ({ ...s, x: s.x + 0.12 })),
  });
  assert.notEqual(movedSub.actual.geometryFingerprint, first.actual.geometryFingerprint);
  const movedRsp = compareRspContract({
    ...baseInput,
    rspPosition: { ...baseInput.rspPosition, y: 4.7 },
  });
  assert.notEqual(movedRsp.actual.geometryFingerprint, first.actual.geometryFingerprint);
});

test("unsupported physics falls back to the original per-source path for RSP", () => {
  for (const override of [
    { abGlobalQScale: 2 },
    { enableModes: false },
    { modalCoherenceMode: "incoherent" },
    { unknownFutureOption: true },
  ]) {
    const p = {
      ...baseInput,
      physicsOptions: { ...baseInput.physicsOptions, ...override },
    };
    assert.equal(canUseExactRoomPreviewBatch(p.physicsOptions, p.subsForSimulation), false,
      "batch must be ineligible for override " + JSON.stringify(override));
    // The engine with useExactPreviewBatch=true must still produce a valid
    // result (the canUseExactRoomPreviewBatch gate inside the engine falls
    // back to the original path), and it must match the reference.
    compareRspContract(p);
  }
});

test("worker gate enables batch for RSP and All Seats, not seat or refined", async () => {
  // Verify the gate logic by reading the worker source.
  const fs = await import("node:fs");
  const workerSrc = fs.readFileSync(
    new URL("../src/components/room/bass/normalizedRoomTransfer.worker.js", import.meta.url),
    "utf8",
  );
  assert.ok(workerSrc.includes('quality === "preview"'),
    "gate requires preview quality");
  assert.ok(workerSrc.includes('mode === "all"'),
    "gate includes All Seats");
  assert.ok(workerSrc.includes('mode === "rsp"'),
    "gate includes RSP");
  // Seat mode must NOT be in the gate (per-source evidence path differs for
  // seat selection — keep the existing single-listener engine path).
  assert.ok(!workerSrc.includes('mode === "seat"'),
    "gate must not include seat mode");
});