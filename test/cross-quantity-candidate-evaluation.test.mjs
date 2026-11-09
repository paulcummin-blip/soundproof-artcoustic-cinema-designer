// test/cross-quantity-candidate-evaluation.test.mjs
// Focused tests for candidate-owned cross-quantity V2 evaluation.
//
// Validates that:
//   - buildCandidateDesignContext produces synthetic source IDs and instances
//     matching the candidate's quantity (not the installed quantity).
//   - validationContextForCandidate uses the candidate's own source IDs.
//   - gatherCandidates with crossQuantityQuantities produces cross-quantity
//     candidates with design contexts, bounded to the shortlist limit.
//   - gatherCandidates without crossQuantityQuantities preserves existing
//     behaviour (no cross-quantity candidates, no design contexts).
//   - bindTuningToSourceIds works with the candidate's own source IDs.
//   - effectiveConfigurationKey works with the candidate's synthetic instances.
//   - extractCalibrationTuning returns null for a cross-quantity winner (the
//     installed project must not be changed merely to evaluate a candidate).
//
// Run: node --import ./test/_alias-register.mjs test/cross-quantity-candidate-evaluation.test.mjs

import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCandidateDesignContext,
  validationContextForCandidate,
  MAX_CROSS_QUANTITY_CANDIDATES_PER_QUANTITY,
} from "../src/components/room/bass/improveBassV2/candidateDesignContext.js";
import { gatherCandidates } from "../src/components/room/bass/improveBassV2/improveBassV2Engine.js";
import { bindTuningToSourceIds } from "../src/components/room/bass/improveBassV2/improveBassV2ApplyCalibration.js";
import { effectiveConfigurationKey } from "../src/components/room/bass/improveBassV2/confirmedCandidateValidity.js";
import { extractCalibrationTuning } from "../src/components/room/bass/optimiseWorkflow/optimiseWorkflowOrchestrator.js";

// ── Fixtures ────────────────────────────────────────────────────────────

const ROOM_DIMS = { widthM: 4.5, lengthM: 6.0, heightM: 2.4 };

const TWO_SUB_INSTANCES = [
  { id: "inst-front-left", model: "sub3-12", enabled: true, position: { x: 1.5, y: 0.3, z: 0 }, bottomHeightM: 0.1, rotationDeg: 0, delayMs: 0, gainDb: 0, polarity: 0, phaseControlDeg: 0 },
  { id: "inst-rear-right", model: "sub3-12", enabled: true, position: { x: 3.0, y: 5.7, z: 0 }, bottomHeightM: 0.1, rotationDeg: 0, delayMs: 0, gainDb: 0, polarity: 0, phaseControlDeg: 0 },
];

const SEATING_POSITIONS = [
  { id: "seat-r1-c1", x: 1.5, y: 3.4, z: 1.2, priority: "primary" },
  { id: "seat-r1-c2", x: 3.0, y: 3.4, z: 1.2, priority: "primary" },
];

const RSP_POSITION = { x: 2.25, y: 3.4, z: 1.2 };

const CROSSOVER = { frequencyHz: 95, speakerHpSlopeDbPerOct: 24, subwooferLpSlopeDbPerOct: 24, linkFrequencies: true, subwooferFrequencyHz: 95 };

// A 4-sub Stage 2 finalist (physical cabinet centres).
const FOUR_SUB_COORDS = [
  { x: 1.0, y: 0.3 },
  { x: 3.5, y: 0.3 },
  { x: 1.0, y: 5.7 },
  { x: 3.5, y: 5.7 },
];

// A Stage 2 result with a 4-sub evaluated finalist.
function makeStage2Result() {
  const fourSubFinalist = {
    finalistId: "RP22_F_4sub",
    familyId: "RP22_F",
    quantity: 4,
    coordinates: FOUR_SUB_COORDS,
    selectedProduct: "sub3-12",
    physicalValidation: { passed: true },
    requestedP14Pass: true,
    achievedP19Level: 4,
    achievedP20Level: 1,
  };
  const twoSubFinalist = {
    finalistId: "RP22_F_2sub",
    familyId: "RP22_F",
    quantity: 2,
    coordinates: [{ x: 2.25, y: 0.3 }, { x: 2.25, y: 5.7 }],
    selectedProduct: "sub3-12",
    physicalValidation: { passed: true },
    requestedP14Pass: true,
    achievedP19Level: 3,
    achievedP20Level: 2,
  };
  return {
    four_sub_result: {
      evaluatedFinalists: [fourSubFinalist],
    },
    two_sub_result: {
      evaluatedFinalists: [twoSubFinalist],
    },
    one_sub_result: null,
    three_sub_result: null,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────

test("1. buildCandidateDesignContext produces 4 synthetic source IDs and instances for a 4-sub candidate", () => {
  const ctx = buildCandidateDesignContext({
    finalistId: "RP22_F_4sub",
    quantity: 4,
    coordinates: FOUR_SUB_COORDS,
    selectedSubModel: "sub3-12",
    subwooferBottomHeightM: 0.1,
    seatingPositions: SEATING_POSITIONS,
    rspPosition: RSP_POSITION,
    crossover: CROSSOVER,
    autoAlignEnabled: true,
  });

  assert.equal(ctx.isCrossQuantity, true, "flagged as cross-quantity");
  assert.equal(ctx.quantity, 4, "quantity is 4");
  assert.equal(ctx.sourceIds.length, 4, "4 source IDs");
  assert.equal(ctx.instances.length, 4, "4 synthetic instances");
  assert.ok(ctx.sourceIds.every((id) => id.startsWith("cand-RP22_F_4sub-src-")), "synthetic source ID prefix");
  assert.equal(new Set(ctx.sourceIds).size, 4, "source IDs are unique");
  assert.equal(ctx.instances[0].id, ctx.sourceIds[0], "instance IDs match source IDs");
  assert.equal(ctx.candidateIdentity, "cross-quantity:4sub:RP22_F_4sub", "candidate identity");
});

test("2. validationContextForCandidate uses the design context source IDs", () => {
  const ctx = buildCandidateDesignContext({
    finalistId: "RP22_F_4sub",
    quantity: 4,
    coordinates: FOUR_SUB_COORDS,
    selectedSubModel: "sub3-12",
    subwooferBottomHeightM: 0.1,
    seatingPositions: SEATING_POSITIONS,
    rspPosition: RSP_POSITION,
    crossover: CROSSOVER,
  });
  const fallback = { seats: SEATING_POSITIONS, sourceIds: ["inst-front-left", "inst-rear-right"], inputIdentity: "fp123" };
  const result = validationContextForCandidate({ designContext: ctx }, fallback);

  assert.deepEqual(result.sourceIds, ctx.sourceIds, "uses candidate's own source IDs");
  assert.equal(result.inputIdentity, "fp123", "preserves run input identity");
});

test("3. validationContextForCandidate falls back to installed context when no design context", () => {
  const fallback = { seats: SEATING_POSITIONS, sourceIds: ["inst-front-left", "inst-rear-right"], inputIdentity: "fp123" };
  const result = validationContextForCandidate({}, fallback);
  assert.deepEqual(result, fallback, "falls back to installed context");
});

test("4. gatherCandidates with crossQuantityQuantities=[4] produces a 4-sub cross-quantity candidate", () => {
  const stage2Result = makeStage2Result();
  const candidates = gatherCandidates({
    projectId: "p1",
    versionId: "v1",
    subwooferInstances: TWO_SUB_INSTANCES,
    roomDims: ROOM_DIMS,
    stage2Result,
    placementFingerprint: null,
    crossQuantityQuantities: [4],
    selectedSubModel: "sub3-12",
    subwooferBottomHeightM: 0.1,
    frontOrientation: null,
    rearOrientation: null,
    seatingPositions: SEATING_POSITIONS,
    rspPosition: RSP_POSITION,
    crossover: CROSSOVER,
    autoAlignEnabled: true,
  });

  const crossQty = candidates.filter((c) => c.designContext?.isCrossQuantity);
  assert.ok(crossQty.length > 0, "cross-quantity candidate present");
  const fourSub = crossQty.find((c) => c.designContext.quantity === 4);
  assert.ok(fourSub, "4-sub candidate found");
  assert.equal(fourSub.designContext.sourceIds.length, 4, "4 candidate-owned source IDs");
  assert.equal(fourSub.designContext.instances.length, 4, "4 synthetic instances");
});

test("5. gatherCandidates without crossQuantityQuantities preserves existing behaviour (no cross-quantity candidates)", () => {
  const stage2Result = makeStage2Result();
  const candidates = gatherCandidates({
    projectId: "p1",
    versionId: "v1",
    subwooferInstances: TWO_SUB_INSTANCES,
    roomDims: ROOM_DIMS,
    stage2Result,
    placementFingerprint: null,
    selectedSubModel: "sub3-12",
    subwooferBottomHeightM: 0.1,
    frontOrientation: null,
    rearOrientation: null,
    seatingPositions: SEATING_POSITIONS,
    rspPosition: RSP_POSITION,
    crossover: CROSSOVER,
    autoAlignEnabled: true,
  });

  const crossQty = candidates.filter((c) => c.designContext?.isCrossQuantity);
  assert.equal(crossQty.length, 0, "no cross-quantity candidates when not requested");
});

test("6. gatherCandidates bounds cross-quantity candidates to the shortlist limit", () => {
  // Build a Stage 2 result with more than MAX finalists.
  const manyFinalists = Array.from({ length: 10 }, (_, i) => ({
    finalistId: `RP22_F_4sub_${i}`,
    familyId: "RP22_F",
    quantity: 4,
    coordinates: [
      { x: 1, y: 0.3 }, { x: 3.5, y: 0.3 }, { x: 1, y: 5.7 }, { x: 3.5, y: 5.7 },
    ],
    selectedProduct: "sub3-12",
    physicalValidation: { passed: true },
    requestedP14Pass: true,
  }));
  const stage2Result = {
    four_sub_result: { evaluatedFinalists: manyFinalists },
    two_sub_result: { evaluatedFinalists: [] },
    one_sub_result: null,
    three_sub_result: null,
  };

  const candidates = gatherCandidates({
    projectId: "p1", versionId: "v1",
    subwooferInstances: TWO_SUB_INSTANCES,
    roomDims: ROOM_DIMS,
    stage2Result,
    placementFingerprint: null,
    crossQuantityQuantities: [4],
    selectedSubModel: "sub3-12",
    subwooferBottomHeightM: 0.1,
    seatingPositions: SEATING_POSITIONS,
    rspPosition: RSP_POSITION,
    crossover: CROSSOVER,
  });

  const crossQty = candidates.filter((c) => c.designContext?.isCrossQuantity);
  assert.equal(crossQty.length, MAX_CROSS_QUANTITY_CANDIDATES_PER_QUANTITY, "bounded to shortlist limit");
});

test("7. bindTuningToSourceIds works with the candidate's 4 source IDs", () => {
  const ctx = buildCandidateDesignContext({
    finalistId: "RP22_F_4sub",
    quantity: 4,
    coordinates: FOUR_SUB_COORDS,
    selectedSubModel: "sub3-12",
    subwooferBottomHeightM: 0.1,
    seatingPositions: SEATING_POSITIONS,
    rspPosition: RSP_POSITION,
    crossover: CROSSOVER,
  });
  const tuning = [
    { delayMs: 5, gainDb: 0, polarity: 0 },
    { delayMs: 3, gainDb: 0, polarity: 0 },
    { delayMs: 0, gainDb: 0, polarity: 0 },
    { delayMs: 2, gainDb: 0, polarity: 0 },
  ];
  const bound = bindTuningToSourceIds(tuning, ctx.sourceIds);
  assert.equal(bound.length, 4, "4 tuning entries");
  assert.deepEqual(bound.map((t) => t.sourceId), ctx.sourceIds, "each tuning entry bound to candidate source ID");
});

test("8. effectiveConfigurationKey works with the candidate's synthetic instances", () => {
  const ctx = buildCandidateDesignContext({
    finalistId: "RP22_F_4sub",
    quantity: 4,
    coordinates: FOUR_SUB_COORDS,
    selectedSubModel: "sub3-12",
    subwooferBottomHeightM: 0.1,
    seatingPositions: SEATING_POSITIONS,
    rspPosition: RSP_POSITION,
    crossover: CROSSOVER,
  });
  const tuning = ctx.sourceIds.map((id) => ({ sourceId: id, delayMs: 0, gainDb: 0, polarity: 0, phaseControlDeg: 0 }));
  const key = effectiveConfigurationKey(ctx.instances, tuning);
  assert.ok(typeof key === "string" && key.length > 0, "configuration key is a non-empty string");
  assert.ok(key.includes("cand-RP22_F_4sub-src-"), "key contains candidate source IDs");
});

test("9. extractCalibrationTuning returns null for a cross-quantity winner (installed project not changed)", () => {
  const crossQtyWinner = {
    isCrossQuantity: true,
    appliedTuning: [
      { sourceId: "cand-src-1", delayMs: 5, gainDb: 0, polarity: 0 },
      { sourceId: "cand-src-2", delayMs: 3, gainDb: 0, polarity: 0 },
      { sourceId: "cand-src-3", delayMs: 0, gainDb: 0, polarity: 0 },
      { sourceId: "cand-src-4", delayMs: 2, gainDb: 0, polarity: 0 },
    ],
  };
  const tuning = extractCalibrationTuning({ winner: crossQtyWinner });
  assert.equal(tuning, null, "cross-quantity winner tuning is not extracted for auto-apply");
});

test("10. extractCalibrationTuning returns tuning for a same-quantity winner (existing behaviour preserved)", () => {
  const sameQtyWinner = {
    appliedTuning: [
      { sourceId: "inst-front-left", delayMs: 5, gainDb: 0, polarity: 0 },
      { sourceId: "inst-rear-right", delayMs: 3, gainDb: 0, polarity: 0 },
    ],
  };
  const tuning = extractCalibrationTuning({ winner: sameQtyWinner });
  assert.ok(Array.isArray(tuning) && tuning.length === 2, "same-quantity tuning extracted");
});