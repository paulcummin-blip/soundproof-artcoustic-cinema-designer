// coordinated-candidate-preconfirm-handoff.test.mjs
// Focused tests for the coordinated candidate pre-confirmation integration
// handoff. Verifies the pre-confirm gate validates the EXACT combined transfer
// canonical confirmation consumes — not a second independently reconstructed
// sub-only transfer.

import { test, describe, before } from "node:test";
import assert from "node:assert/strict";

import { buildRoomDBundle, ROOM_D_DIMS, ROOM_D_CROSSOVER, ROOM_D_P14_TARGET } from "../src/components/room/bass/improveBassV2/coordinatedCandidateFixture.js";
import { buildCandidateTransfer, evaluateCoordinatedCandidate } from "../src/components/room/bass/improveBassV2/coordinatedCandidateEvaluation.js";
import { checkPreConfirmIntegrity } from "../src/components/room/bass/improveBassV2/coordinatedCandidateIntegrityChecks.js";
import {
  runCoordinatedCandidateDeveloper,
  clearCoordinatedDeveloperRun,
} from "../src/components/room/bass/improveBassV2/coordinatedCandidateDeveloperRun.js";
import { BASS_NORMALIZED_PHYSICS_DEFAULTS } from "../src/components/room/bass/bassPhysicsDefaults.js";

// Three live LCR screen channels for Room D (FL/FC/FR), the same shape the
// panel's buildLcrIntegrationSources produces.
const ROOM_D_LCR_SOURCES = Object.freeze([
  { id: "lcr-FL", role: "FL", channelWeight: 1, modelKey: "sp-2-8", x: 0.5, y: 0.3, z: 1.2 },
  { id: "lcr-FC", role: "FC", channelWeight: 1, modelKey: "sp-2-8", x: 1.75, y: 0.3, z: 1.2 },
  { id: "lcr-FR", role: "FR", channelWeight: 1, modelKey: "sp-2-8", x: 3.0, y: 0.3, z: 1.2 },
]);

function makeRoomDIntegrationContext() {
  return {
    roomDims: ROOM_D_DIMS,
    seatingPositions: [], // filled by the bundle's proposed seating
    rspPosition: { x: 1.75, y: 3.4, z: 1.2 },
    speakerSources: ROOM_D_LCR_SOURCES,
    crossover: ROOM_D_CROSSOVER,
    physics: BASS_NORMALIZED_PHYSICS_DEFAULTS,
  };
}

// Canonical Room D saved seating (original rows 4.0/5.8 m) matching the accepted
// reference the developer acceptance bridge validates against.
function makeRoomDSavedSeating() {
  const seats = [];
  const rowY = [4.0, 5.8];
  const xs = [1.15, 1.75, 2.35];
  const earH = [1.2, 1.7];
  let n = 0;
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 3; c++) {
      n += 1;
      seats.push({
        id: `seat-r${r + 1}-c${c + 1}`,
        rowNumber: r + 1,
        priority: r === 0 ? "primary" : "secondary",
        x: xs[c],
        y: rowY[r],
        z: earH[r],
        earHeight: earH[r],
        platformHeight: 0.4,
      });
    }
  }
  return seats;
}

describe("coordinated candidate pre-confirmation integration handoff", () => {
  let bundle;
  let combinedTransfer;
  let builtResponseBasis;

  before(() => {
    const integrationContext = makeRoomDIntegrationContext();
    bundle = buildRoomDBundle({ integrationContext, responseBasis: "combined-lcr-sub", p14Target: ROOM_D_P14_TARGET });
    const built = buildCandidateTransfer({
      bundle,
      roomDims: ROOM_D_DIMS,
      amplifierPowerPerSubW: 500,
    });
    assert.equal(built.status, "built", `Combined transfer build failed: ${JSON.stringify(built.issues)}`);
    combinedTransfer = built.transfer;
    builtResponseBasis = built.responseBasis;
  });

  test("1. raw placement result without integration fails the combined pre-confirm check", () => {
    // A raw placement result carries no integration transfers — the shape the
    // developer runner USED to validate before the fix. The gate must reject it.
    const rawTransfer = { ...combinedTransfer, integrationTransfers: undefined };
    const gate = checkPreConfirmIntegrity(bundle, rawTransfer);
    assert.equal(gate.valid, false, "Raw sub-only transfer must fail the combined pre-confirm gate");
    assert.ok(
      gate.issues.some((i) => i.includes("no integration transfers")),
      `Expected 'no integration transfers' issue, got: ${JSON.stringify(gate.issues)}`,
    );
  });

  test("2. combined transfer with integration evidence passes the pre-confirm check", () => {
    const gate = checkPreConfirmIntegrity(bundle, combinedTransfer);
    assert.equal(gate.valid, true, `Combined transfer should pass pre-confirm: ${JSON.stringify(gate.issues)}`);
  });

  test("4. 95 Hz crossover survives the handoff", () => {
    assert.equal(combinedTransfer.crossover?.frequencyHz, 95);
    assert.equal(bundle.crossover?.frequencyHz, 95);
    // The gate verifies the match explicitly.
    const gate = checkPreConfirmIntegrity(bundle, combinedTransfer);
    assert.ok(gate.valid, "Crossover match should not produce an issue");
    assert.ok(!gate.issues.some((i) => i.includes("Crossover frequency")));
  });

  test("5. three live LCR sources survive the handoff", () => {
    assert.equal(combinedTransfer.integrationTransfers?.available, true);
    assert.equal(combinedTransfer.integrationTransfers?.speakerCount, 3);
    const gate = checkPreConfirmIntegrity(bundle, combinedTransfer);
    assert.ok(!gate.issues.some((i) => i.includes("LCR source count")));
  });

  test("6. candidate sub source IDs remain unchanged through the handoff", () => {
    const transferIds = (combinedTransfer.sources || []).map((s) => s.id);
    assert.deepEqual(transferIds, bundle.sourceIds);
    assert.equal(transferIds.length, 4);
    const gate = checkPreConfirmIntegrity(bundle, combinedTransfer);
    assert.ok(!gate.issues.some((i) => i.includes("Source order") || i.includes("source ID")));
  });

  test("7. seat and RSP identities remain unchanged through the handoff", () => {
    const transferSeatIds = (combinedTransfer.seatingPositions || []).map((s) => s.id).sort();
    const bundleSeatIds = bundle.seatingPositions.map((s) => s.id).sort();
    assert.deepEqual(transferSeatIds, bundleSeatIds);
    assert.equal(combinedTransfer.rspPosition.x, bundle.rspPosition.x);
    assert.equal(combinedTransfer.rspPosition.y, bundle.rspPosition.y);
    const gate = checkPreConfirmIntegrity(bundle, combinedTransfer);
    assert.ok(!gate.issues.some((i) => i.includes("seating") || i.includes("RSP")));
  });
});

describe("coordinated candidate pre-confirm handoff — evaluator reuse", () => {
  test("3. the same transfer object is used for validation and canonical confirmation", async () => {
    const integrationContext = (() => {
      const ctx = {
        roomDims: ROOM_D_DIMS,
        seatingPositions: [],
        rspPosition: { x: 1.75, y: 3.4, z: 1.2 },
        speakerSources: ROOM_D_LCR_SOURCES,
        crossover: ROOM_D_CROSSOVER,
        physics: BASS_NORMALIZED_PHYSICS_DEFAULTS,
      };
      return ctx;
    })();
    const bundle = buildRoomDBundle({ integrationContext, responseBasis: "combined-lcr-sub" });
    const built = buildCandidateTransfer({ bundle, roomDims: ROOM_D_DIMS, amplifierPowerPerSubW: 500 });
    assert.equal(built.status, "built");
    const gate = checkPreConfirmIntegrity(bundle, built.transfer);
    assert.equal(gate.valid, true, `Gate must pass before confirmation: ${JSON.stringify(gate.issues)}`);

    // Hand the EXACT pre-built transfer into the evaluator. Confirmation must
    // consume it and produce evaluated evidence — proving the same object
    // validated by the gate is the one canonical confirmation uses.
    const evalResult = await evaluateCoordinatedCandidate({
      bundle,
      roomDims: ROOM_D_DIMS,
      amplifierPowerPerSubW: 500,
      preBuiltTransfer: built.transfer,
      preBuiltResponseBasis: built.responseBasis,
    });
    assert.equal(evalResult.status, "evaluated", `Confirmation should succeed on the pre-built transfer: ${JSON.stringify(evalResult.issues)}`);
    assert.equal(evalResult.evidence.responseBasis, "combined-lcr-sub");
  });
});

describe("coordinated candidate pre-confirm handoff — sub-only fallback policy", () => {
  test("8. sub-only fallback remains prohibited when requireCombined=true", async () => {
    clearCoordinatedDeveloperRun();
    const result = await runCoordinatedCandidateDeveloper({
      integrationContext: null,
      requireCombined: true,
    });
    assert.equal(result.status, "rejected");
    assert.ok(
      result.issues.some((i) => i.includes("combined LCR/sub evaluation required")),
      `Expected combined-required rejection, got: ${JSON.stringify(result.issues)}`,
    );
    assert.equal(result.boundaries.preTransfer, null);
    assert.equal(result.boundaries.preConfirm, null);
    clearCoordinatedDeveloperRun();
  });

  test("9. existing sub-only source harness remains unchanged when combined mode is not required", async () => {
    clearCoordinatedDeveloperRun();
    const result = await runCoordinatedCandidateDeveloper({
      integrationContext: null,
      requireCombined: false,
    });
    // The sub-only path must NOT reject with the combined-required message.
    assert.ok(
      !result.issues.some((i) => i.includes("combined LCR/sub evaluation required")),
      "Sub-only harness must not reject as combined-required",
    );
    // It reaches the pre-confirm boundary (sub-only transfer validates).
    assert.ok(result.boundaries.preConfirm, "Sub-only run must still set the preConfirm boundary");
    assert.ok(["evaluated", "rejected", "error"].includes(result.status));
    clearCoordinatedDeveloperRun();
  });
});

describe("coordinated candidate pre-confirm handoff — end-to-end acceptance", () => {
  test("10. installed project and publication remain untouched; canonical confirmation reached", async () => {
    clearCoordinatedDeveloperRun();
    const savedSeating = makeRoomDSavedSeating();
    const result = await runCoordinatedCandidateDeveloper({
      integrationContext: makeRoomDIntegrationContext(),
      amplifierPowerPerSubW: 500,
      savedSeating,
      requireCombined: true,
    });

    // The acceptance boundary: pre-transfer PASS, pre-confirmation PASS,
    // canonical confirmation reached (postConfirm boundary set).
    assert.ok(result.boundaries.preTransfer?.valid, `pre-transfer should pass: ${JSON.stringify(result.boundaries.preTransfer?.issues)}`);
    assert.ok(result.boundaries.preConfirm?.valid, `pre-confirm should pass: ${JSON.stringify(result.boundaries.preConfirm?.issues)}`);
    assert.ok(result.boundaries.postConfirm, "postConfirm boundary must be set — canonical confirmation reached");

    // The runner is read-only: it carries no apply/publish side-effects.
    assert.equal(result.appliedGeometry, undefined);
    assert.equal(result.publishedEngineering, undefined);
    assert.equal(result.autosaved, undefined);
    clearCoordinatedDeveloperRun();
  });
});