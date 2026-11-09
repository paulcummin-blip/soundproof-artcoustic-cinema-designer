// test/coordinated-candidate-source-id-continuity.test.mjs
// Source tests for source-ID preservation through the finalist adapter,
// Stage 2 source builder, and integrity validation.
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildCoordinatedCandidateBundle,
  validateCoordinatedCandidateBundle,
  bundleToStage2Finalist,
  validateCoordinatedCandidateIntegrity,
} from "../components/room/bass/improveBassV2/coordinatedCandidateBundle.js";
import { buildStage2Sources } from "../components/room/bass/stage2/stage2CanonicalEvaluation.js";

const ROOM_D = {
  widthM: 3.5, lengthM: 8, heightM: 3,
};
const COORDS = [
  { x: 0.665, y: 0.1375 },
  { x: 2.835, y: 0.1375 },
  { x: 0.665, y: 7.8625 },
  { x: 2.835, y: 7.8625 },
];
const SEATS = [
  { id: "seat-1", x: 1.75, y: 3.4, z: 1.2, priority: "primary", rowNumber: 1 },
  { id: "seat-2", x: 0.875, y: 3.4, z: 1.2, priority: "primary", rowNumber: 1 },
  { id: "seat-3", x: 2.625, y: 3.4, z: 1.2, priority: "primary", rowNumber: 1 },
  { id: "seat-4", x: 1.75, y: 5.2, z: 1.2, priority: "secondary", rowNumber: 2 },
];
const P14 = { p14TargetBasis: "minimum", p14TargetLevel: 2, p14TargetDb: 117, p18TargetBasis: "minimum" };

function buildRoomDBundle() {
  return buildCoordinatedCandidateBundle({
    candidateId: "room-d-4sub-600mm",
    quantity: 4,
    coordinates: COORDS,
    selectedSubModel: "sub3-12",
    subwooferBottomHeightM: 0.05,
    seatingPositions: SEATS,
    designatedSeatId: "seat-1",
    roomWidthM: ROOM_D.widthM,
    crossover: { frequencyHz: 95, linkFrequencies: true },
    autoAlignEnabled: false,
    responseBasis: "combined-lcr-sub",
    p14Target: P14,
  });
}

describe("source-ID continuity — Room D coordinated candidate", () => {
  it("bundleToStage2Finalist carries the four candidate-owned source IDs", () => {
    const bundle = buildRoomDBundle();
    const finalist = bundleToStage2Finalist(bundle, ROOM_D);

    assert.equal(finalist.sources.length, 4);
    for (let i = 0; i < 4; i++) {
      assert.equal(finalist.sources[i].sourceId, bundle.sourceIds[i],
        `Source ${i} must carry the candidate-owned ID ${bundle.sourceIds[i]}`);
    }
  });

  it("buildStage2Sources builds four sources with exactly those IDs", () => {
    const bundle = buildRoomDBundle();
    const finalist = bundleToStage2Finalist(bundle, ROOM_D);
    const rspPosition = { x: 1.75, y: 3.4, z: 1.2 };
    const sources = buildStage2Sources(
      finalist, ROOM_D, bundle.selectedSubModel, 0,
      bundle.subwooferBottomHeightM, rspPosition, true, null, null,
    );

    assert.equal(sources.length, 4);
    for (let i = 0; i < 4; i++) {
      assert.equal(sources[i].id, bundle.sourceIds[i],
        `buildStage2Sources must preserve the candidate-owned ID ${bundle.sourceIds[i]} at index ${i}, got ${sources[i].id}`);
    }
  });

  it("does not generate stage2-src-N identities for a coordinated candidate", () => {
    const bundle = buildRoomDBundle();
    const finalist = bundleToStage2Finalist(bundle, ROOM_D);
    const sources = buildStage2Sources(
      finalist, ROOM_D, bundle.selectedSubModel, 0,
      bundle.subwooferBottomHeightM, { x: 1.75, y: 3.4, z: 1.2 }, true, null, null,
    );

    for (const src of sources) {
      assert.ok(!src.id.startsWith("stage2-src-"),
        `Coordinated candidate must not use stage2-src-N identities, got ${src.id}`);
    }
  });

  it("ordinary Stage 2 finalists without sourceIds still use stage2-src-N", () => {
    const ordinaryFinalist = {
      id: "ordinary-finalist",
      familyId: "front-rear-pair",
      sources: [
        { xNorm: 0.19, yNorm: 0.05, coordinateSpace: "cabinet_centre" },
        { xNorm: 0.81, yNorm: 0.05, coordinateSpace: "cabinet_centre" },
      ],
    };
    const sources = buildStage2Sources(
      ordinaryFinalist, ROOM_D, "sub3-12", 0, 0.05,
      { x: 1.75, y: 3.4, z: 1.2 }, true, null, null,
    );

    assert.equal(sources[0].id, "stage2-src-1");
    assert.equal(sources[1].id, "stage2-src-2");
  });

  it("integrity validation passes when transfer source IDs match the bundle", () => {
    const bundle = buildRoomDBundle();
    const finalist = bundleToStage2Finalist(bundle, ROOM_D);
    const sources = buildStage2Sources(
      finalist, ROOM_D, bundle.selectedSubModel, 0,
      bundle.subwooferBottomHeightM, { x: 1.75, y: 3.4, z: 1.2 }, true, null, null,
    );

    const rawTransfer = {
      sources,
      perSourcePerSeatComplexTransfers: sources.map((s, i) => ({
        seatId: "rsp",
        sourceIndex: i,
        sourceId: s.id,
        points: [],
      })),
    };
    const confirmation = { finalistId: bundle.candidateId };

    const result = validateCoordinatedCandidateIntegrity(bundle, rawTransfer, confirmation);
    assert.equal(result.valid, true, `Expected valid, issues: ${result.issues.join("; ")}`);
  });

  it("integrity validation rejects when transfer source IDs are regenerated", () => {
    const bundle = buildRoomDBundle();
    const badSources = bundle.sourceIds.map((_, i) => ({
      id: `stage2-src-${i + 1}`, // regenerated, not candidate-owned
    }));
    const rawTransfer = {
      sources: badSources,
      perSourcePerSeatComplexTransfers: badSources.map((s, i) => ({
        seatId: "rsp", sourceIndex: i, sourceId: s.id, points: [],
      })),
    };

    const result = validateCoordinatedCandidateIntegrity(bundle, rawTransfer, {});
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.includes("Source order mismatch")));
  });

  it("integrity validation rejects duplicate source IDs", () => {
    const bundle = buildRoomDBundle();
    const dupId = bundle.sourceIds[0];
    const badSources = bundle.sourceIds.map(() => ({ id: dupId }));
    const rawTransfer = {
      sources: badSources,
      perSourcePerSeatComplexTransfers: [],
    };

    const result = validateCoordinatedCandidateIntegrity(bundle, rawTransfer, {});
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.includes("Duplicate")));
  });

  it("integrity validation rejects incomplete source IDs", () => {
    const bundle = buildRoomDBundle();
    const badSources = bundle.sourceIds.map(() => ({ id: null }));
    const rawTransfer = { sources: badSources, perSourcePerSeatComplexTransfers: [] };

    const result = validateCoordinatedCandidateIntegrity(bundle, rawTransfer, {});
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.includes("null or empty")));
  });

  it("integrity validation rejects confirmation with wrong finalistId", () => {
    const bundle = buildRoomDBundle();
    const finalist = bundleToStage2Finalist(bundle, ROOM_D);
    const sources = buildStage2Sources(
      finalist, ROOM_D, bundle.selectedSubModel, 0,
      bundle.subwooferBottomHeightM, { x: 1.75, y: 3.4, z: 1.2 }, true, null, null,
    );
    const rawTransfer = {
      sources,
      perSourcePerSeatComplexTransfers: sources.map((s, i) => ({
        seatId: "rsp", sourceIndex: i, sourceId: s.id, points: [],
      })),
    };
    const confirmation = { finalistId: "some-other-candidate" };

    const result = validateCoordinatedCandidateIntegrity(bundle, rawTransfer, confirmation);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.includes("finalistId")));
  });

  it("source positions and orientations are unchanged by the identity fix", () => {
    const bundle = buildRoomDBundle();
    const finalist = bundleToStage2Finalist(bundle, ROOM_D);
    const sources = buildStage2Sources(
      finalist, ROOM_D, bundle.selectedSubModel, 0,
      bundle.subwooferBottomHeightM, { x: 1.75, y: 3.4, z: 1.2 }, true, null, null,
    );

    // The physical cabinet centres must match the known Room D coordinates
    assert.ok(Math.abs(sources[0].x - COORDS[0].x) < 1e-6);
    assert.ok(Math.abs(sources[0].y - COORDS[0].y) < 1e-6);
    assert.ok(Math.abs(sources[1].x - COORDS[1].x) < 1e-6);
    assert.ok(Math.abs(sources[1].y - COORDS[1].y) < 1e-6);
    assert.ok(Math.abs(sources[2].x - COORDS[2].x) < 1e-6);
    assert.ok(Math.abs(sources[2].y - COORDS[2].y) < 1e-6);
    assert.ok(Math.abs(sources[3].x - COORDS[3].x) < 1e-6);
    assert.ok(Math.abs(sources[3].y - COORDS[3].y) < 1e-6);
  });
});