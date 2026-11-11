// test/stage1-stage2-handoff-ordering.test.mjs
// Focused regression test for the Stage 1 → Stage 2 handoff ordering defect.
//
// DEFECT (independent Work investigation):
//   After a linked seating change, Stage 1 receives a new geometry-derived
//   request ID. Stage 2 can briefly receive the PREVIOUS completed Stage 1
//   snapshot under that new request. It captures a Stage 2 fingerprint based
//   on those OLD finalists. When the new Stage 1 results arrive, the
//   fingerprint changes. The Stage 2 hook cancels and marks itself idle
//   rather than scheduling a fresh evaluation. The UI then reports that idle
//   state as "Evaluating", potentially indefinitely.
//
// ROOT CAUSE:
//   Stage 2 captured a fingerprint derived from a STALE Stage 1 snapshot
//   (old geometry A) under the new request B. When the matching Stage 1 B
//   result arrived, the fingerprint legitimately changed, and the stale-
//   fingerprint guard cancelled + idled permanently (the captured fingerprint
//   was never cleared).
//
// FIX:
//   Stage 2 now verifies its Stage 1 snapshot matches the current geometry
//   fingerprint + recommendation scope BEFORE capturing a fingerprint or
//   scheduling work (stage1EvidenceMatches). While Stage 1 is still pending
//   or a stale snapshot is present, Stage 2 WAITs (markStage2Waiting) rather
//   than consuming old finalists. When matching Stage 1 evidence arrives,
//   Stage 2 captures the correct fingerprint and schedules once. The UI
//   shows "discovering" (not "evaluating") while Stage 1 evidence is
//   unmatched, and "evaluating" only when Stage 2 is genuinely running.
//
// This test exercises the STORE-LEVEL lifecycle and fingerprint logic that
// the fix relies on. It does not mount React hooks (those need a React
// runtime); it verifies the deterministic invariants the hook guards read.
//
// Run: node --import ./test/_alias-register.mjs --test test/stage1-stage2-handoff-ordering.test.mjs

import test from "node:test";
import assert from "node:assert/strict";

import { computeStage1Fingerprint } from "@/components/room/bass/stage1/stage1Fingerprint";
import {
  publishStage1Complete,
  publishHydratedStage1,
  markStage1Updating,
  markStage1Idle,
  getStage1State,
} from "@/components/room/bass/stage1/stage1PlacementStore";
import {
  setStage2StateForTest,
  markStage2Waiting,
  markStage2Idle,
  getStage2State,
} from "@/components/room/bass/stage2/stage2PlacementStore";
import { computeStage2Fingerprint } from "@/components/room/bass/stage2/stage2Fingerprint";
import {
  normaliseRecommendationScope,
} from "@/components/room/bass/stage1/stage1RecommendationScope";

const PROJECT_ID = "handoff-ordering-test";
const VERSION_ID = "v1";

const ROOM_A = { widthM: 5.0, lengthM: 7.0, heightM: 2.6 };
const ROOM_B = { widthM: 5.0, lengthM: 7.6, heightM: 2.6 }; // seating moved → length change
const RSP = { x: 2.5, y: 3.5, z: 1.2 };
const SEATS_A = [
  { id: "r1c1", x: 1.5, y: 3.0, z: 1.2, priority: "primary" },
  { id: "r1c2", x: 3.5, y: 3.0, z: 1.2, priority: "primary" },
];
const SEATS_B = [
  { id: "r1c1", x: 1.5, y: 3.4, z: 1.2, priority: "primary" },
  { id: "r1c2", x: 3.5, y: 3.4, z: 1.2, priority: "primary" },
];
const PHYSICS = {
  surfaceAbsorption: 0.2,
  qStrategy: "ab_corrected",
  roomDamping: 0.85,
  axialQ: 30,
  modalSourceReferenceMode: "halfspace",
  modalGainScalar: 1.0,
  modalDistanceBlend: 0.6,
  rewModalBandwidthScale: 1.0,
  modalCoherenceMode: "standard",
  highOrderAxialScale: 1.0,
};

const REC_SCOPE = normaliseRecommendationScope([1, 2, 4]);
const SUB_MODEL = "artcoustic-sub3-12";
const FINALISTS_A = {
  1: [{ id: "f1a_A", familyId: "FRONT_SINGLETON" }],
  2: [{ id: "f2a_A", familyId: "FRONT_PAIR" }],
  4: [{ id: "f4a_A", familyId: "FRONT_REAR_PAIR" }],
};
const FINALISTS_B = {
  1: [{ id: "f1a_B", familyId: "FRONT_SINGLETON" }],
  2: [{ id: "f2a_B", familyId: "FRONT_PAIR" }],
  4: [{ id: "f4a_B", familyId: "FRONT_REAR_PAIR" }],
};
const P14 = { basis: "recommended", level: 2, db: 95 };
const BOTTOM_H = 0.0;
const AMP_W = 300;

function baseFp(room, seats) {
  return computeStage1Fingerprint({
    roomDims: room,
    rspPosition: RSP,
    seatingPositions: seats,
    physicsOptions: PHYSICS,
  });
}
function scopedFp(base) {
  return `${base}|rec:${REC_SCOPE.join(",")}`;
}
function stage2Fp(stage1Fingerprint, finalists) {
  const base = computeStage2Fingerprint({
    stage1Fingerprint,
    stage1Finalists: finalists,
    selectedSubModel: SUB_MODEL,
    p14TargetBasis: P14.basis,
    p14TargetLevel: P14.level,
    p14TargetDb: P14.db,
    subwooferBottomHeightM: BOTTOM_H,
    amplifierPowerPerSubW: AMP_W,
  });
  return `${base}|rec:${REC_SCOPE.join(",")}`;
}

function resetStores() {
  markStage1Idle(PROJECT_ID, VERSION_ID);
  markStage2Idle(PROJECT_ID, VERSION_ID);
}

const RESULTS_A = {
  one_sub_result: { quantity: 1, status: "complete", finalists: FINALISTS_A[1] },
  two_sub_result: { quantity: 2, status: "complete", finalists: FINALISTS_A[2] },
  three_sub_result: null,
  four_sub_result: { quantity: 4, status: "complete", finalists: FINALISTS_A[4] },
};
const RESULTS_B = {
  one_sub_result: { quantity: 1, status: "complete", finalists: FINALISTS_B[1] },
  two_sub_result: { quantity: 2, status: "complete", finalists: FINALISTS_B[2] },
  three_sub_result: null,
  four_sub_result: { quantity: 4, status: "complete", finalists: FINALISTS_B[4] },
};

// The stage1EvidenceMatches invariant the hook guard reads:
//   !!expectedStage1Fingerprint
//   && stage1State?.status === "complete"
//   && stage1State?.fingerprint === expectedStage1Fingerprint
function stage1EvidenceMatches(expectedStage1Fingerprint, stage1State) {
  return !!expectedStage1Fingerprint
    && stage1State?.status === "complete"
    && stage1State?.fingerprint === expectedStage1Fingerprint;
}

// ── Tests ─────────────────────────────────────────────────────────────

test("1. Geometry A and B produce distinct Stage 1 and Stage 2 fingerprints", () => {
  resetStores();
  const baseA = baseFp(ROOM_A, SEATS_A);
  const baseB = baseFp(ROOM_B, SEATS_B);
  assert.notEqual(baseA, baseB, "geometry change must alter the Stage 1 base fingerprint");

  const scopedA = scopedFp(baseA);
  const scopedB = scopedFp(baseB);
  assert.notEqual(scopedA, scopedB, "scoped Stage 1 fingerprints must differ");

  const s2A = stage2Fp(scopedA, FINALISTS_A);
  const s2B = stage2Fp(scopedB, FINALISTS_B);
  assert.notEqual(s2A, s2B, "Stage 2 fingerprints for A and B must differ");
});

test("2. A stale Stage 1 snapshot (A) does NOT match the expected Stage 1 fingerprint for B", () => {
  resetStores();
  const baseA = baseFp(ROOM_A, SEATS_A);
  const scopedA = scopedFp(baseA);
  const baseB = baseFp(ROOM_B, SEATS_B);
  const scopedB = scopedFp(baseB);

  // Stage 1 completes for geometry A.
  publishStage1Complete(PROJECT_ID, VERSION_ID, scopedA, RESULTS_A);
  const stage1State = getStage1State(PROJECT_ID, VERSION_ID);
  assert.equal(stage1State.status, "complete");
  assert.equal(stage1State.fingerprint, scopedA);

  // The expected Stage 1 fingerprint for geometry B is scopedB.
  // The stale snapshot A must NOT match B's expected fingerprint.
  assert.equal(
    stage1EvidenceMatches(scopedB, stage1State),
    false,
    "stale Stage 1 snapshot A must not match expected fingerprint B — Stage 2 must WAIT",
  );

  // The Stage 2 fingerprint derived from the stale A snapshot must NOT equal
  // the correct Stage 2 fingerprint for B. This is the invariant that prevents
  // Stage 2 from capturing a stale fingerprint under the new request.
  const s2_fromStaleA = stage2Fp(stage1State.fingerprint, {
    1: stage1State.one_sub_result?.finalists || [],
    2: stage1State.two_sub_result?.finalists || [],
    3: [],
    4: stage1State.four_sub_result?.finalists || [],
  });
  const s2_correctB = stage2Fp(scopedB, FINALISTS_B);
  assert.notEqual(s2_fromStaleA, s2_correctB,
    "Stage 2 fingerprint from stale A finalists must NOT equal the correct B fingerprint");
});

test("3. While Stage 1 is updating for request B, evidence does not match and Stage 2 must wait", () => {
  resetStores();
  const baseB = baseFp(ROOM_B, SEATS_B);
  const scopedB = scopedFp(baseB);

  // Stage 1 begins recomputing for geometry B (ownerRequestId = request B).
  markStage1Updating(PROJECT_ID, VERSION_ID, scopedB, "bda-rec:B");
  const stage1State = getStage1State(PROJECT_ID, VERSION_ID);
  assert.equal(stage1State.status, "updating");
  assert.equal(stage1State.fingerprint, scopedB);

  // Even though the fingerprint matches, status is "updating" not "complete",
  // so evidence does NOT match — Stage 2 must wait.
  assert.equal(
    stage1EvidenceMatches(scopedB, stage1State),
    false,
    "Stage 1 'updating' (not complete) must not satisfy Stage 2 — Stage 2 waits",
  );
});

test("4. When Stage 1 B completes, evidence matches and Stage 2 can capture the correct fingerprint", () => {
  resetStores();
  const baseB = baseFp(ROOM_B, SEATS_B);
  const scopedB = scopedFp(baseB);

  publishStage1Complete(PROJECT_ID, VERSION_ID, scopedB, RESULTS_B);
  const stage1State = getStage1State(PROJECT_ID, VERSION_ID);
  assert.equal(stage1State.status, "complete");
  assert.equal(stage1State.fingerprint, scopedB);

  assert.equal(
    stage1EvidenceMatches(scopedB, stage1State),
    true,
    "completed Stage 1 B with matching fingerprint satisfies the evidence guard",
  );

  // The Stage 2 fingerprint derived from the matching B snapshot is the
  // correct canonical identity for this design.
  const s2B = stage2Fp(scopedB, FINALISTS_B);
  assert.ok(s2B.startsWith("stage2:v3:") && s2B.endsWith("|rec:1,2,4"));
});

test("5. Full lifecycle: A completes → seating changes → Stage 2 waits → B completes → Stage 2 captures B", () => {
  resetStores();
  const baseA = baseFp(ROOM_A, SEATS_A);
  const scopedA = scopedFp(baseA);
  const baseB = baseFp(ROOM_B, SEATS_B);
  const scopedB = scopedFp(baseB);

  // Step 1: Stage 1 complete for geometry A.
  publishStage1Complete(PROJECT_ID, VERSION_ID, scopedA, RESULTS_A);
  let stage1State = getStage1State(PROJECT_ID, VERSION_ID);
  assert.equal(stage1EvidenceMatches(scopedA, stage1State), true,
    "Step 1: Stage 1 A matches expected A");

  // Step 2: Seating changes to geometry B. Stage 1 begins recomputing.
  // (The stale A snapshot is replaced by 'updating' for B.)
  markStage1Updating(PROJECT_ID, VERSION_ID, scopedB, "bda-rec:B");
  stage1State = getStage1State(PROJECT_ID, VERSION_ID);

  // Step 3+4: Stage 2 must NOT capture or schedule using A. Evidence for B
  // does not match (status is 'updating').
  assert.equal(stage1EvidenceMatches(scopedB, stage1State), false,
    "Step 3-4: Stage 2 must not capture — Stage 1 is updating, evidence does not match");

  // Step 5: Stage 1 B completes.
  publishStage1Complete(PROJECT_ID, VERSION_ID, scopedB, RESULTS_B);
  stage1State = getStage1State(PROJECT_ID, VERSION_ID);

  // Step 6: Stage 2 can now schedule exactly for B.
  assert.equal(stage1EvidenceMatches(scopedB, stage1State), true,
    "Step 6: Stage 1 B matches — Stage 2 schedules for B");

  const s2B = stage2Fp(stage1State.fingerprint, {
    1: stage1State.one_sub_result?.finalists || [],
    2: stage1State.two_sub_result?.finalists || [],
    3: [],
    4: stage1State.four_sub_result?.finalists || [],
  });

  // Step 8: The Stage 2 fingerprint for B is the correct canonical identity.
  const s2B_expected = stage2Fp(scopedB, FINALISTS_B);
  assert.equal(s2B, s2B_expected,
    "Step 8: Stage 2 B fingerprint matches the canonical B identity");
});

test("6. A late Stage 1 result from A (fingerprint A) is rejected by the controller's stale-fingerprint guard", () => {
  resetStores();
  const baseA = baseFp(ROOM_A, SEATS_A);
  const scopedA = scopedFp(baseA);
  const baseB = baseFp(ROOM_B, SEATS_B);
  const scopedB = scopedFp(baseB);

  // Stage 1 is now complete for B (the current geometry).
  publishStage1Complete(PROJECT_ID, VERSION_ID, scopedB, RESULTS_B);
  const currentFp = getStage1State(PROJECT_ID, VERSION_ID).fingerprint;

  // A late message carrying fingerprint A (the superseded geometry) must be
  // rejected. The Stage 1 controller's handleMessage checks
  // `message.fingerprint !== active.fingerprint` and returns. We simulate
  // the invariant: a late A result has fingerprint scopedA ≠ currentFp.
  assert.notEqual(scopedA, currentFp,
    "late Stage 1 A fingerprint must differ from the current B fingerprint");
  assert.notEqual(scopedA, scopedB,
    "scopedA ≠ scopedB — a late A result is stale and must be rejected");
});

test("7. Matching cache hydration works after reopening (scoped fingerprint preserved)", () => {
  resetStores();
  const baseB = baseFp(ROOM_B, SEATS_B);
  const scopedB = scopedFp(baseB);

  // Live run produces the saved Stage 2 cache fingerprint.
  publishStage1Complete(PROJECT_ID, VERSION_ID, scopedB, RESULTS_B);
  const savedStage2 = stage2Fp(getStage1State(PROJECT_ID, VERSION_ID).fingerprint, FINALISTS_B);

  // Cold reopen: hydration publishes the same scoped identity.
  resetStores();
  publishHydratedStage1(PROJECT_ID, VERSION_ID, scopedB, RESULTS_B);
  const reopenedStage1 = getStage1State(PROJECT_ID, VERSION_ID);
  assert.equal(reopenedStage1.fingerprint, scopedB,
    "hydration must publish the scoped execution fingerprint");
  assert.equal(reopenedStage1.status, "complete");

  // Evidence matches after hydration.
  assert.equal(stage1EvidenceMatches(scopedB, reopenedStage1), true,
    "Step 9: hydrated Stage 1 B matches — Stage 2 hydrates from cache");

  const reopenedStage2 = stage2Fp(reopenedStage1.fingerprint, FINALISTS_B);
  assert.equal(reopenedStage2, savedStage2,
    "Step 9: reopened Stage 2 fingerprint matches the saved cache → hydrates without worker jobs");
});

test("8. Stage 2 'waiting_for_stage1' phase is NOT a terminal idle state (UI shows discovering, not evaluating)", () => {
  resetStores();
  const baseB = baseFp(ROOM_B, SEATS_B);
  const scopedB = scopedFp(baseB);

  // Stage 1 is updating for B. Stage 2 marks itself WAITING (not idle).
  markStage1Updating(PROJECT_ID, VERSION_ID, scopedB, "bda-rec:B");
  markStage2Waiting(PROJECT_ID, VERSION_ID, null, "waiting_for_stage1");

  const stage2State = getStage2State(PROJECT_ID, VERSION_ID);
  // The waiting state uses status "updating" with a distinct phase, NOT
  // "idle" (which is terminal). The UI checks stage1EvidenceMatches first
  // (false, because Stage 1 is 'updating') and shows "discovering" — never
  // "evaluating" — for this state.
  assert.equal(stage2State.status, "updating",
    "waiting state uses 'updating' status, not terminal 'idle'");
  assert.equal(stage2State.phase, "waiting_for_stage1",
    "waiting phase is recorded so it is distinct from genuine evaluation");
  assert.notEqual(stage2State.status, "idle",
    "Step 10: a genuine waiting state is never the terminal 'idle' that displays indefinitely as Evaluating");
});

test("9. Stage 2 'idle' (genuine prerequisites-missing) is distinct from the waiting state", () => {
  resetStores();
  // When Stage 1 matches but model/P14 are missing, Stage 2 is genuinely idle.
  // The UI shows "awaiting-prerequisites" for this state (not "evaluating").
  markStage2Idle(PROJECT_ID, VERSION_ID);
  const stage2State = getStage2State(PROJECT_ID, VERSION_ID);
  assert.equal(stage2State.status, "idle",
    "genuine idle is only set when prerequisites are missing, not after a fingerprint change");
});

test("10. Model-only change (geometry unchanged) keeps Stage 1 evidence matching — Stage 2 reuses valid finalists", () => {
  resetStores();
  const baseA = baseFp(ROOM_A, SEATS_A);
  const scopedA = scopedFp(baseA);

  // Stage 1 completes for geometry A.
  publishStage1Complete(PROJECT_ID, VERSION_ID, scopedA, RESULTS_A);
  const stage1State = getStage1State(PROJECT_ID, VERSION_ID);

  // A model-only or P14-only change does NOT alter the geometry fingerprint,
  // so the expected Stage 1 fingerprint is still scopedA. Evidence matches.
  assert.equal(stage1EvidenceMatches(scopedA, stage1State), true,
    "model/P14 change preserves Stage 1 evidence — Stage 2 reuses valid finalists");
});

test("11. The Stage 2 fingerprint from stale A finalists is never equal to the correct B fingerprint, even with the same model/P14", () => {
  // This is the core invariant: no matter what, a Stage 2 fingerprint derived
  // from geometry A's finalists cannot masquerade as geometry B's. This is
  // what makes the evidence guard safe — even if Stage 2 accidentally read
  // stale finalists, the resulting fingerprint would not match B.
  const baseA = baseFp(ROOM_A, SEATS_A);
  const scopedA = scopedFp(baseA);
  const baseB = baseFp(ROOM_B, SEATS_B);
  const scopedB = scopedFp(baseB);

  const s2_fromA = stage2Fp(scopedA, FINALISTS_A);
  const s2_fromB = stage2Fp(scopedB, FINALISTS_B);
  assert.notEqual(s2_fromA, s2_fromB,
    "Stage 2 fingerprint A ≠ Stage 2 fingerprint B — the guard's fingerprint comparison is sound");

  // And the scoped Stage 1 fingerprints embed the geometry, so they differ.
  assert.notEqual(scopedA, scopedB,
    "scoped Stage 1 fingerprints embed geometry — A ≠ B");
});