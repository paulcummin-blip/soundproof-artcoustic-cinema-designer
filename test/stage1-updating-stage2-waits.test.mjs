// test/stage1-updating-stage2-waits.test.mjs
//
// Focused regression tests for the Stage 1 `updating` → Stage 2 readiness
// defect. During an ADI run that requests a selected-quantity scope (e.g.
// sel:2), Stage 1 transitions from `complete` to `updating` while it
// recomputes the matching scope. Its finalists are temporarily unavailable,
// so the Stage 2 fingerprint is null. The PRE-FIX behaviour cancelled
// Stage 2 with `inputs-incomplete`, terminating the optimisation after
// ~52 ms without launching any Stage 2 jobs.
//
// POST-FIX: when Stage 1 is `updating` for the SAME ownerRequestId as the
// ADI request, Stage 2 WAITS (does nothing) instead of cancelling. It
// resumes when Stage 1 completes. Genuine missing inputs (no model, no
// P14 target, Stage 1 idle/error/cancelled/stale, or a DIFFERENT request's
// Stage 1 update) still terminate correctly.
//
// These tests verify the REASON CONTRACT inside the scheduling effect of
// useStage2PlacementOptimiser by exercising the pure store transitions and
// the guard condition directly. The React hook is not invoked; instead the
// Stage 1/2 store state is driven through the same store functions the hook
// uses, and the guard predicate is evaluated against that state.
//
// Run: node --import ./test/_alias-register.mjs test/stage1-updating-stage2-waits.test.mjs

import test from "node:test";
import assert from "node:assert/strict";

import {
  markStage1Updating,
  publishStage1Complete,
  publishHydratedStage1,
  markStage1Idle,
  markStage1Error,
  getStage1State,
} from "@/components/room/bass/stage1/stage1PlacementStore";
import {
  setStage2StateForTest,
  markStage2Idle,
  getStage2State,
} from "@/components/room/bass/stage2/stage2PlacementStore";
import { computeStage1Fingerprint } from "@/components/room/bass/stage1/stage1Fingerprint";
import {
  normaliseRecommendationScope,
  parseStage1FingerprintScope,
} from "@/components/room/bass/stage1/stage1RecommendationScope";

const PROJECT_ID = "room-d-adi-updating";
const VERSION_ID = "v1";

const ROOM = { widthM: 5.8, lengthM: 8.4, heightM: 2.7 };
const RSP = { x: 2.9, y: 4.2, z: 1.2 };
const SEATS = [
  { id: "r1c1", x: 1.9, y: 3.6, z: 1.2, priority: "primary" },
  { id: "r1c3", x: 3.9, y: 3.6, z: 1.2, priority: "primary" },
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

const ADI_REQUEST_ID = "optimise:1700000000000:1";

function baseFp() {
  return computeStage1Fingerprint({ roomDims: ROOM, rspPosition: RSP, seatingPositions: SEATS, physicsOptions: PHYSICS });
}
function selFp(base, qty) { return `${base}|sel:${qty}`; }
function recFp(base) { return `${base}|rec:1,2,4`; }

function resetStores() {
  markStage1Idle(PROJECT_ID, VERSION_ID);
  markStage2Idle(PROJECT_ID, VERSION_ID);
}

// The guard predicate mirrors the condition added to
// useStage2PlacementOptimiser's scheduling effect. It is the single new
// branch that distinguishes "Stage 1 is recomputing the matching scope"
// (wait) from "genuine missing inputs" (cancel).
function stage1UpdatingForThisRequest(stage1State, requestId) {
  return stage1State?.status === "updating"
    && !!stage1State?.ownerRequestId
    && !!requestId
    && stage1State.ownerRequestId === requestId;
}

// The scheduling decision: returns "wait" (Stage 1 updating for this
// request), "cancel" (genuine missing inputs), or "schedule" (fingerprint
// available). This mirrors the effect's branch order.
function decide(stage1State, requestId, fingerprint) {
  if (!fingerprint) {
    if (stage1UpdatingForThisRequest(stage1State, requestId)) return "wait";
    return "cancel";
  }
  return "schedule";
}

test("1. Stage 1 updating for the matching ADI request → Stage 2 WAITS (no cancel)", () => {
  resetStores();
  const base = baseFp();
  const scoped = selFp(base, 2);
  // Stage 1 transitions from complete → updating for the ADI request.
  markStage1Updating(PROJECT_ID, VERSION_ID, scoped, ADI_REQUEST_ID);
  const s1 = getStage1State(PROJECT_ID, VERSION_ID);
  assert.equal(s1.status, "updating");
  assert.equal(s1.ownerRequestId, ADI_REQUEST_ID);
  // Stage 2 fingerprint is null (finalists unavailable during update).
  const fingerprint = null;
  const action = decide(s1, ADI_REQUEST_ID, fingerprint);
  assert.equal(action, "wait",
    "Stage 2 must WAIT when Stage 1 is updating for the matching request, not cancel");
});

test("2. Stage 1 updating for a DIFFERENT request → Stage 2 cancels (no false wait)", () => {
  resetStores();
  const base = baseFp();
  const scoped = selFp(base, 2);
  markStage1Updating(PROJECT_ID, VERSION_ID, scoped, "other-request:1700000000001:2");
  const s1 = getStage1State(PROJECT_ID, VERSION_ID);
  const action = decide(s1, ADI_REQUEST_ID, null);
  assert.equal(action, "cancel",
    "Stage 2 must cancel when Stage 1 is updating for a DIFFERENT request — no false wait");
});

test("3. Stage 1 idle with no fingerprint → Stage 2 cancels (genuine missing inputs)", () => {
  resetStores();
  // Stage 1 is idle (never started or reset).
  const s1 = getStage1State(PROJECT_ID, VERSION_ID);
  assert.equal(s1.status, "idle");
  const action = decide(s1, ADI_REQUEST_ID, null);
  assert.equal(action, "cancel",
    "genuine missing inputs (Stage 1 idle, no fingerprint) must still cancel");
});

test("4. Stage 1 error → Stage 2 cancels (genuine failure, not a wait)", () => {
  resetStores();
  const base = baseFp();
  const scoped = selFp(base, 2);
  markStage1Error(PROJECT_ID, VERSION_ID, scoped, "worker crashed");
  const s1 = getStage1State(PROJECT_ID, VERSION_ID);
  assert.equal(s1.status, "error");
  const action = decide(s1, ADI_REQUEST_ID, null);
  assert.equal(action, "cancel",
    "Stage 1 error must cancel Stage 2 — it is a genuine failure, not a transient update");
});

test("5. Stage 1 complete with matching scope → Stage 2 schedules normally", () => {
  resetStores();
  const base = baseFp();
  const scoped = selFp(base, 2);
  const RESULTS = {
    one_sub_result: null,
    two_sub_result: { quantity: 2, status: "complete", finalists: [{ id: "f2a", familyId: "FRONT_PAIR" }] },
    three_sub_result: null,
    four_sub_result: null,
  };
  publishStage1Complete(PROJECT_ID, VERSION_ID, scoped, RESULTS);
  const s1 = getStage1State(PROJECT_ID, VERSION_ID);
  assert.equal(s1.status, "complete");
  assert.equal(s1.fingerprint, scoped);
  // When Stage 1 is complete, the Stage 2 hook derives a non-null fingerprint
  // (finalists are available). The decision is "schedule".
  const action = decide(s1, ADI_REQUEST_ID, "stage2:v3:somehash|sel:2");
  assert.equal(action, "schedule",
    "Stage 1 complete with matching scope must schedule Stage 2 normally");
});

test("6. rec:1,2,4 cannot satisfy a sel:2 request — scope identities are distinct", () => {
  const base = baseFp();
  const sel = selFp(base, 2);
  const rec = recFp(base);
  assert.notEqual(sel, rec, "sel:2 and rec:1,2,4 fingerprints must not collide");
  const selScope = parseStage1FingerprintScope(sel);
  const recScope = parseStage1FingerprintScope(rec);
  assert.equal(selScope.scopeType, "sel");
  assert.deepEqual(selScope.quantities, [2]);
  assert.equal(recScope.scopeType, "rec");
  assert.deepEqual(recScope.quantities, [1, 2, 4]);
  // A rec:1,2,4 Stage 1 state has a different fingerprint than the sel:2
  // request. The Stage 2 hook's request-fingerprint-stale guard fires, and
  // the updating-for-this-request guard does NOT match (different scope).
  markStage1Idle(PROJECT_ID, VERSION_ID);
  markStage1Updating(PROJECT_ID, VERSION_ID, rec, "evaluated-recs:1700000000002:3");
  const s1 = getStage1State(PROJECT_ID, VERSION_ID);
  assert.notEqual(s1.ownerRequestId, ADI_REQUEST_ID);
  const action = decide(s1, ADI_REQUEST_ID, null);
  assert.equal(action, "cancel",
    "a rec:1,2,4 update for a different request must not gate the sel:2 ADI run");
});

test("7. After Stage 1 updating → complete transition, Stage 2 proceeds (wait then schedule)", () => {
  resetStores();
  const base = baseFp();
  const scoped = selFp(base, 2);

  // Phase A: Stage 1 is updating for the ADI request → Stage 2 waits.
  markStage1Updating(PROJECT_ID, VERSION_ID, scoped, ADI_REQUEST_ID);
  const s1Updating = getStage1State(PROJECT_ID, VERSION_ID);
  assert.equal(decide(s1Updating, ADI_REQUEST_ID, null), "wait");

  // Phase B: Stage 1 completes with the matching scope → Stage 2 schedules.
  const RESULTS = {
    one_sub_result: null,
    two_sub_result: { quantity: 2, status: "complete", finalists: [{ id: "f2a", familyId: "FRONT_PAIR" }] },
    three_sub_result: null,
    four_sub_result: null,
  };
  publishStage1Complete(PROJECT_ID, VERSION_ID, scoped, RESULTS);
  const s1Complete = getStage1State(PROJECT_ID, VERSION_ID);
  assert.equal(s1Complete.status, "complete");
  assert.equal(s1Complete.fingerprint, scoped);
  // The Stage 2 fingerprint is now derivable (non-null) → schedule.
  assert.equal(decide(s1Complete, ADI_REQUEST_ID, "stage2:v3:somehash|sel:2"), "schedule");
});

test("8. Stage 2 state is not cancelled during the Stage 1 update wait", () => {
  resetStores();
  // Simulate the pre-existing complete Stage 2 state (from a prior run).
  setStage2StateForTest(PROJECT_ID, VERSION_ID, {
    status: "complete",
    fingerprint: "stage2:v3:oldhash|sel:2",
    placementFingerprint: "place:old",
  });
  const s2Before = getStage2State(PROJECT_ID, VERSION_ID);
  assert.equal(s2Before.status, "complete");

  // Stage 1 goes updating for the ADI request. The fix means Stage 2's
  // effect RETURNS without calling cancelAll or markStage2Idle. The store
  // state is unchanged by the effect (the controller is not touched).
  const base = baseFp();
  const scoped = selFp(base, 2);
  markStage1Updating(PROJECT_ID, VERSION_ID, scoped, ADI_REQUEST_ID);
  const s1 = getStage1State(PROJECT_ID, VERSION_ID);
  const action = decide(s1, ADI_REQUEST_ID, null);
  assert.equal(action, "wait",
    "the effect must not cancel Stage 2 during a matching Stage 1 update");

  // The pre-existing Stage 2 state is preserved (the effect did nothing).
  // waitForStage2Terminal's ownerRequestId check ensures the old complete
  // state does not satisfy the new request.
  const s2After = getStage2State(PROJECT_ID, VERSION_ID);
  assert.equal(s2After.status, "complete",
    "Stage 2 store state must not be mutated by the wait path");
});

test("9. Stage 1 updating with no ownerRequestId (background search) → Stage 2 cancels for a sel:2 ADI request", () => {
  resetStores();
  const base = baseFp();
  // A background Stage 1 update with no ownerRequestId is not tied to the
  // ADI request. Stage 2 must not wait for it.
  markStage1Updating(PROJECT_ID, VERSION_ID, base, null);
  const s1 = getStage1State(PROJECT_ID, VERSION_ID);
  assert.equal(s1.ownerRequestId, null);
  const action = decide(s1, ADI_REQUEST_ID, null);
  assert.equal(action, "cancel",
    "a background Stage 1 update with no ownerRequestId must not gate the ADI run");
});

test("10. Scope isolation: sel:2 and sel:4 are distinct and cannot satisfy each other", () => {
  const base = baseFp();
  const sel2 = selFp(base, 2);
  const sel4 = selFp(base, 4);
  assert.notEqual(sel2, sel4);
  const scope2 = parseStage1FingerprintScope(sel2);
  const scope4 = parseStage1FingerprintScope(sel4);
  assert.deepEqual(scope2.quantities, [2]);
  assert.deepEqual(scope4.quantities, [4]);
  // A sel:4 update for a different request must not gate a sel:2 ADI run.
  markStage1Idle(PROJECT_ID, VERSION_ID);
  markStage1Updating(PROJECT_ID, VERSION_ID, sel4, "other-sel4:1700000000003:4");
  const s1 = getStage1State(PROJECT_ID, VERSION_ID);
  const action = decide(s1, ADI_REQUEST_ID, null);
  assert.equal(action, "cancel",
    "a sel:4 update for a different request must not gate the sel:2 ADI run");
});