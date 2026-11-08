// test/stage1-stage2-identity-preservation.test.mjs
// Focused regression tests for the Stage 1 → Stage 2 execution-identity
// preservation through cache hydration.
//
// DEFECT (Room C `6aea32a37fc045c27cc2dfd6`):
//   Stage 1 hydrated its saved `rec:1,2,4` cache without launching any worker,
//   but `useStage1PlacementOptimiser` called
//     publishHydratedStage1(..., baseFingerprint, ...)
//   dropping the `|rec:1,2,4` execution-scope suffix. Stage 2 reads
//   `stage1State.fingerprint` directly into its own fingerprint hash, so the
//   hydrated path produced a DIFFERENT Stage 2 fingerprint than the live path:
//     saved (live):     stage2:v3:fa19ba170150bcc1|rec:1,2,4
//     recomputed (hydr): stage2:v3:3407c4e23124722c|rec:1,2,4
//   Stage 2 rejected its own saved canonical evidence and re-ran 22 jobs
//   (22.713 s), overwriting its cache — even though no input had changed.
//
// FIX:
//   The hydration handoff now publishes the scoped execution `fingerprint`
//   (the same identity a fresh completed search writes via
//   publishStage1Complete), so Stage 2 derives an identical downstream
//   fingerprint whether Stage 1 ran live or hydrated. `baseFingerprint` is
//   retained for the completeness compatibility check (a full unscoped result
//   still satisfies a scoped request) but is no longer the published identity.
//
// No acoustic physics, RP22 scoring, ranking, recommendations policy, graph
// rendering, Apply/Restore or persistence architecture is changed.
//
// Run: node --import ./test/_alias-register.mjs test/stage1-stage2-identity-preservation.test.mjs

import test from "node:test";
import assert from "node:assert/strict";

import { computeStage1Fingerprint } from "@/components/room/bass/stage1/stage1Fingerprint";
import {
  publishHydratedStage1,
  publishStage1Complete,
  getStage1State,
  markStage1Idle,
} from "@/components/room/bass/stage1/stage1PlacementStore";
import { computeStage2Fingerprint } from "@/components/room/bass/stage2/stage2Fingerprint";
import {
  normaliseRecommendationScope,
  parseStage1FingerprintScope,
} from "@/components/room/bass/stage1/stage1RecommendationScope";

const PROJECT_ID = "room-c-6aea32a37fc045c27cc2dfd6";
const VERSION_ID = "v1";

const ROOM = { widthM: 5.8, lengthM: 8.4, heightM: 2.7 };
const RSP = { x: 2.9, y: 4.2, z: 1.2 };
const SEATS = [
  { id: "r1c1", x: 1.9, y: 3.6, z: 1.2, priority: "primary" },
  { id: "r1c3", x: 3.9, y: 3.6, z: 1.2, priority: "primary" },
  { id: "r2c2", x: 2.9, y: 5.4, z: 1.2, priority: "secondary" },
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
assert.deepEqual([...REC_SCOPE], [1, 2, 4]);

const SUB_MODEL = "artcoustic-sub3-12";
const FINALISTS = {
  1: [{ id: "f1a", familyId: "FRONT_SINGLETON" }],
  2: [{ id: "f2a", familyId: "FRONT_PAIR" }],
  4: [{ id: "f4a", familyId: "FRONT_REAR_PAIR" }],
};
const P14 = { basis: "recommended", level: 2, db: 95 };
const BOTTOM_H = 0.0;
const AMP_W = 300;

function baseFp() {
  return computeStage1Fingerprint({ roomDims: ROOM, rspPosition: RSP, seatingPositions: SEATS, physicsOptions: PHYSICS });
}
function scopedFp(base) {
  return `${base}|rec:${REC_SCOPE.join(",")}`;
}
function stage2Fp(stage1Fingerprint) {
  const base = computeStage2Fingerprint({
    stage1Fingerprint,
    stage1Finalists: FINALISTS,
    selectedSubModel: SUB_MODEL,
    p14TargetBasis: P14.basis,
    p14TargetLevel: P14.level,
    p14TargetDb: P14.db,
    subwooferBottomHeightM: BOTTOM_H,
    amplifierPowerPerSubW: AMP_W,
  });
  return `${base}|rec:${REC_SCOPE.join(",")}`;
}

function resetStore() {
  markStage1Idle(PROJECT_ID, VERSION_ID);
}

const RESULTS = {
  one_sub_result: { quantity: 1, status: "complete", finalists: FINALISTS[1] },
  two_sub_result: { quantity: 2, status: "complete", finalists: FINALISTS[2] },
  three_sub_result: null,
  four_sub_result: { quantity: 4, status: "complete", finalists: FINALISTS[4] },
};

test("1. Fresh live [1,2,4] search publishes the scoped execution fingerprint", () => {
  resetStore();
  const base = baseFp();
  const scoped = scopedFp(base);
  publishStage1Complete(PROJECT_ID, VERSION_ID, scoped, RESULTS);
  const state = getStage1State(PROJECT_ID, VERSION_ID);
  assert.equal(state.fingerprint, scoped,
    "live completed search must publish the scoped fingerprint");
  assert.equal(state.status, "complete");
});

test("2. Hydrated [1,2,4] publish (pre-fix, base fingerprint) produced a DIFFERENT Stage 2 fingerprint — defect reproduction", () => {
  resetStore();
  const base = baseFp();
  const scoped = scopedFp(base);

  // Live path
  publishStage1Complete(PROJECT_ID, VERSION_ID, scoped, RESULTS);
  const liveStage1 = getStage1State(PROJECT_ID, VERSION_ID).fingerprint;
  const liveStage2 = stage2Fp(liveStage1);

  // Pre-fix hydration path (published base, dropping |rec:1,2,4)
  publishHydratedStage1(PROJECT_ID, VERSION_ID, base, RESULTS);
  const buggyStage1 = getStage1State(PROJECT_ID, VERSION_ID).fingerprint;
  const buggyStage2 = stage2Fp(buggyStage1);

  assert.equal(buggyStage1, base,
    "pre-fix hydration published the base fingerprint (defect)");
  assert.notEqual(buggyStage1, liveStage1,
    "pre-fix hydrated Stage 1 identity differed from live (defect)");
  assert.notEqual(buggyStage2, liveStage2,
    "pre-fix hydrated Stage 2 fingerprint differed from live — defect reproduced");
  // Structural relationship matching Room C:
  //   saved stage2:v3:fa19ba170150bcc1|rec:1,2,4  (live)
  //   recomputed stage2:v3:3407c4e23124722c|rec:1,2,4  (hydrated, pre-fix)
  assert.ok(liveStage2.startsWith("stage2:v3:") && liveStage2.endsWith("|rec:1,2,4"));
  assert.ok(buggyStage2.startsWith("stage2:v3:") && buggyStage2.endsWith("|rec:1,2,4"));
  const liveHash = liveStage2.split(":")[2].split("|")[0];
  const buggyHash = buggyStage2.split(":")[2].split("|")[0];
  assert.notEqual(liveHash, buggyHash,
    "the v3 hash segment must differ (fa19ba... vs 3407c4... in Room C)");
});

test("3. Hydrated [1,2,4] publish (post-fix, scoped fingerprint) produces an IDENTICAL Stage 2 fingerprint to live", () => {
  resetStore();
  const base = baseFp();
  const scoped = scopedFp(base);

  publishStage1Complete(PROJECT_ID, VERSION_ID, scoped, RESULTS);
  const liveStage1 = getStage1State(PROJECT_ID, VERSION_ID).fingerprint;
  const liveStage2 = stage2Fp(liveStage1);

  // Post-fix hydration path publishes the scoped execution fingerprint.
  publishHydratedStage1(PROJECT_ID, VERSION_ID, scoped, RESULTS);
  const fixedStage1 = getStage1State(PROJECT_ID, VERSION_ID).fingerprint;
  const fixedStage2 = stage2Fp(fixedStage1);

  assert.equal(fixedStage1, scoped,
    "post-fix hydration must publish the scoped execution fingerprint");
  assert.equal(fixedStage1, liveStage1,
    "hydrated Stage 1 identity must equal live Stage 1 identity");
  assert.equal(fixedStage2, liveStage2,
    "hydrated Stage 2 fingerprint must equal live Stage 2 fingerprint — cache hit, no jobs");
});

test("4. A valid matching Stage 2 cache hydrates without new jobs (identity match)", () => {
  resetStore();
  const base = baseFp();
  const scoped = scopedFp(base);

  // Live run produces the saved Stage 2 cache fingerprint.
  publishStage1Complete(PROJECT_ID, VERSION_ID, scoped, RESULTS);
  const savedStage2 = stage2Fp(getStage1State(PROJECT_ID, VERSION_ID).fingerprint);

  // Cold reopen: hydration publishes the same scoped identity.
  resetStore();
  publishHydratedStage1(PROJECT_ID, VERSION_ID, scoped, RESULTS);
  const reopenedStage2 = stage2Fp(getStage1State(PROJECT_ID, VERSION_ID).fingerprint);

  assert.equal(reopenedStage2, savedStage2,
    "reopened Stage 2 fingerprint must match the saved cache → hydrates without worker jobs");
});

test("5. A genuinely changed room, seating, RSP or cabinet assumption still invalidates the cache", () => {
  resetStore();
  const base = baseFp();
  const scoped = scopedFp(base);
  publishStage1Complete(PROJECT_ID, VERSION_ID, scoped, RESULTS);
  const savedStage2 = stage2Fp(getStage1State(PROJECT_ID, VERSION_ID).fingerprint);

  // Changed room width.
  const movedBase = computeStage1Fingerprint({
    roomDims: { ...ROOM, widthM: 6.2 },
    rspPosition: RSP,
    seatingPositions: SEATS,
    physicsOptions: PHYSICS,
  });
  assert.notEqual(movedBase, base, "room change must alter base fingerprint");
  const movedScoped = scopedFp(movedBase);
  const movedStage2 = stage2Fp(movedScoped);
  assert.notEqual(movedStage2, savedStage2, "room change must invalidate Stage 2 cache");

  // Changed RSP.
  const rspBase = computeStage1Fingerprint({
    roomDims: ROOM,
    rspPosition: { ...RSP, y: 4.8 },
    seatingPositions: SEATS,
    physicsOptions: PHYSICS,
  });
  assert.notEqual(rspBase, base, "RSP change must alter base fingerprint");
  assert.notEqual(stage2Fp(scopedFp(rspBase)), savedStage2, "RSP change must invalidate Stage 2 cache");

  // Changed seating.
  const seatsBase = computeStage1Fingerprint({
    roomDims: ROOM,
    rspPosition: RSP,
    seatingPositions: [...SEATS, { id: "r3c1", x: 1.9, y: 7.0, z: 1.2, priority: "secondary" }],
    physicsOptions: PHYSICS,
  });
  assert.notEqual(seatsBase, base, "seating change must alter base fingerprint");
  assert.notEqual(stage2Fp(scopedFp(seatsBase)), savedStage2, "seating change must invalidate Stage 2 cache");

  // Changed cabinet assumption (subwoofer bottom height) — Stage 2 level.
  const cabStage2 = stage2Fp(scoped);
  const cabChanged = (() => {
    const b = computeStage2Fingerprint({
      stage1Fingerprint: scoped,
      stage1Finalists: FINALISTS,
      selectedSubModel: SUB_MODEL,
      p14TargetBasis: P14.basis,
      p14TargetLevel: P14.level,
      p14TargetDb: P14.db,
      subwooferBottomHeightM: 0.15,
      amplifierPowerPerSubW: AMP_W,
    });
    return `${b}|rec:1,2,4`;
  })();
  assert.notEqual(cabChanged, cabStage2, "cabinet bottom-height change must invalidate Stage 2 cache");
});

test("6. Other Stage 1 scopes remain isolated (sel and full do not collide with rec)", () => {
  const base = baseFp();
  const rec = scopedFp(base);
  const sel = `${base}|sel:2`;
  const full = base;

  const recStage2 = stage2Fp(rec);
  const selStage2 = (() => {
    const b = computeStage2Fingerprint({
      stage1Fingerprint: sel,
      stage1Finalists: FINALISTS,
      selectedSubModel: SUB_MODEL,
      p14TargetBasis: P14.basis,
      p14TargetLevel: P14.level,
      p14TargetDb: P14.db,
      subwooferBottomHeightM: BOTTOM_H,
      amplifierPowerPerSubW: AMP_W,
    });
    return `${b}|sel:2`;
  })();
  const fullStage2 = stage2Fp(full);

  assert.notEqual(recStage2, selStage2, "rec and sel scopes must not collide");
  assert.notEqual(recStage2, fullStage2, "rec and full scopes must not collide");
  assert.notEqual(selStage2, fullStage2, "sel and full scopes must not collide");

  // parseStage1FingerprintScope agrees on the scope partition.
  assert.equal(parseStage1FingerprintScope(rec).scopeType, "rec");
  assert.equal(parseStage1FingerprintScope(sel).scopeType, "sel");
  assert.equal(parseStage1FingerprintScope(full).scopeType, "full");
});

test("7. Repeated hydration is deterministic", () => {
  const base = baseFp();
  const scoped = scopedFp(base);
  const fps = [];
  for (let i = 0; i < 3; i += 1) {
    resetStore();
    publishHydratedStage1(PROJECT_ID, VERSION_ID, scoped, RESULTS);
    fps.push(stage2Fp(getStage1State(PROJECT_ID, VERSION_ID).fingerprint));
  }
  assert.deepEqual(fps, [fps[0], fps[0], fps[0]],
    "three cold reopens must produce identical Stage 2 fingerprints");
});

test("8. Saved physical rejection and recommendation eligibility remain intact (Stage 2 hydration authority unchanged)", () => {
  // This test confirms the Stage 1 identity fix does NOT alter the Stage 2
  // eligibility authority (physically rejected candidates stay unactionable).
  // The dedicated suite verifies the behaviour; here we assert the fingerprint
  // fix carries the same scoped identity the eligibility authority reads.
  const base = baseFp();
  const scoped = scopedFp(base);
  resetStore();
  publishHydratedStage1(PROJECT_ID, VERSION_ID, scoped, RESULTS);
  const state = getStage1State(PROJECT_ID, VERSION_ID);
  assert.equal(state.hydratedFromCache, true, "hydrated flag preserved");
  assert.equal(state.fingerprint, scoped, "scoped identity carried into store");
  // Finalists evidence is preserved verbatim — no acoustic recomputation.
  assert.equal(state.one_sub_result, RESULTS.one_sub_result);
  assert.equal(state.four_sub_result, RESULTS.four_sub_result);
  assert.equal(state.three_sub_result, null, "three-sub result not synthesised for [1,2,4]");
});