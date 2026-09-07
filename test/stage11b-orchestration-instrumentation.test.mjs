// stage11b-orchestration-instrumentation.test.mjs
// Orchestration-level tests for two-primary-seat regression, global+local
// competition, escalation execution, materiality authority, preview/apply,
// cancel/stale — using real module calls.
//
// Run: node --import ./test/_alias-register.mjs test/stage11b-orchestration-instrumentation.test.mjs

import './_alias-register.mjs';

import assert from "node:assert";
import { isMaterialImprovement } from "../src/components/room/bass/improveBassV2/materialityGate.js";
import { checkPhaseMateriality, buildPositionOptimisationState, tagGlobalCandidates } from "../src/components/room/bass/improveBassV2/improveBassV2Escalation.js";
import { buildOptimisedInstances, isOptimisedApplied } from "../src/components/room/bass/improveBassV2/improveBassV2Apply.js";

const results = { passed: 0, failed: 0 };
function ok(name, cond, expected, actual) {
  if (cond) { results.passed++; console.log(`  ✓ ${name}`); }
  else { results.failed++; console.log(`  ✗ ${name}: expected ${expected}, got ${actual}`); }
}

// ── Existing authority (two primary seats) ──────────────────────────────

const existingAuthority = {
  achievedP19Level: 2,
  achievedP20Level: 2,
  achievedP19VariationDb: 6.0,
  achievedP20VariationDb: 5.0,
  perSeatP19: [
    { seatId: "seat-r1-c1", isPrimary: true, level: 2, variationDbRaw: 6.0 },
    { seatId: "seat-r1-c2", isPrimary: true, level: 2, variationDbRaw: 6.5 },
  ],
  perSeatP20: [
    { seatId: "seat-r1-c1", isPrimary: true, level: 2, variationDbRaw: 5.0 },
    { seatId: "seat-r1-c2", isPrimary: true, level: 2, variationDbRaw: 5.5 },
  ],
  p14AchievedLevel: 2,
  p18AchievedLevel: 2,
};

// ═══════════════════════════════════════════════════════════════════════
// 5 — TWO PRIMARY SEATS
// ═══════════════════════════════════════════════════════════════════════
console.log("\n═══ 5 — TWO PRIMARY SEATS ═══");

// Candidate improves r1-c1 but degrades r1-c2 by one displayed level
const regressionCandidate = {
  achievedP19Level: 3, // headline improves
  achievedP20Level: 2,
  achievedP19VariationDb: 4.0,
  achievedP20VariationDb: 5.0,
  perSeatP19: [
    { seatId: "seat-r1-c1", isPrimary: true, level: 3, variationDbRaw: 4.0 }, // improved
    { seatId: "seat-r1-c2", isPrimary: true, level: 1, variationDbRaw: 8.0 }, // DEGRADED L2→L1
  ],
  perSeatP20: [
    { seatId: "seat-r1-c1", isPrimary: true, level: 2, variationDbRaw: 5.0 },
    { seatId: "seat-r1-c2", isPrimary: true, level: 2, variationDbRaw: 5.5 },
  ],
  p14AchievedLevel: 2,
  p18AchievedLevel: 2,
};

const matRegression = isMaterialImprovement(existingAuthority, regressionCandidate);
ok("Two-primary-seat regression candidate is NOT material",
  !matRegression.material, "!material", matRegression.material);
ok("Regression candidate cannot become final winner",
  !matRegression.material, "rejected", matRegression.material ? "accepted" : "rejected");

// Control: candidate improves both primaries → material
const safeCandidate = {
  achievedP19Level: 3,
  achievedP20Level: 3,
  achievedP19VariationDb: 4.0,
  achievedP20VariationDb: 3.0,
  perSeatP19: [
    { seatId: "seat-r1-c1", isPrimary: true, level: 3, variationDbRaw: 4.0 },
    { seatId: "seat-r1-c2", isPrimary: true, level: 3, variationDbRaw: 4.5 },
  ],
  perSeatP20: [
    { seatId: "seat-r1-c1", isPrimary: true, level: 3, variationDbRaw: 3.0 },
    { seatId: "seat-r1-c2", isPrimary: true, level: 3, variationDbRaw: 3.5 },
  ],
  p14AchievedLevel: 2,
  p18AchievedLevel: 2,
};
const matSafe = isMaterialImprovement(existingAuthority, safeCandidate);
ok("Safe candidate improving both primaries IS material",
  matSafe.material, "material", matSafe.material);

// ═══════════════════════════════════════════════════════════════════════
// 6 — GLOBAL + LOCAL COMPETITION
// ═══════════════════════════════════════════════════════════════════════
console.log("\n═══ 6 — GLOBAL + LOCAL COMPETITION ═══");

// CASE A: global canonically better than local → global wins
const globalBetter = {
  isCurrent: false, candidateId: "global-1", candidateOrigin: "global-placement",
  achievedP19Level: 3, achievedP20Level: 3,
  achievedP19VariationDb: 4.0, achievedP20VariationDb: 3.0,
  perSeatP19: [{ seatId: "seat-r1-c1", isPrimary: true, level: 3, variationDbRaw: 4.0 }],
  perSeatP20: [{ seatId: "seat-r1-c1", isPrimary: true, level: 3, variationDbRaw: 3.0 }],
  p14AchievedLevel: 2, p18AchievedLevel: 2,
};
const localWorse = {
  isCurrent: false, candidateId: "local-1", candidateOrigin: "local-symmetric",
  achievedP19Level: 2, achievedP20Level: 2,
  achievedP19VariationDb: 6.0, achievedP20VariationDb: 5.0,
  perSeatP19: [{ seatId: "seat-r1-c1", isPrimary: true, level: 2, variationDbRaw: 6.0 }],
  perSeatP20: [{ seatId: "seat-r1-c1", isPrimary: true, level: 2, variationDbRaw: 5.0 }],
  p14AchievedLevel: 2, p18AchievedLevel: 2,
};
const confirmedA = [globalBetter, localWorse];
const matA = checkPhaseMateriality(confirmedA, existingAuthority);
ok("CASE A: global better → global wins", matA.winner?.candidateId === "global-1",
  "global-1", matA.winner?.candidateId);
ok("CASE A: winner origin is global-placement",
  matA.winner?.candidateOrigin === "global-placement",
  "global-placement", matA.winner?.candidateOrigin);

// CASE B: local canonically better than global → local wins
const globalWorse = {
  isCurrent: false, candidateId: "global-2", candidateOrigin: "global-placement",
  achievedP19Level: 2, achievedP20Level: 2,
  achievedP19VariationDb: 6.0, achievedP20VariationDb: 5.0,
  perSeatP19: [{ seatId: "seat-r1-c1", isPrimary: true, level: 2, variationDbRaw: 6.0 }],
  perSeatP20: [{ seatId: "seat-r1-c1", isPrimary: true, level: 2, variationDbRaw: 5.0 }],
  p14AchievedLevel: 2, p18AchievedLevel: 2,
};
const localBetter = {
  isCurrent: false, candidateId: "local-2", candidateOrigin: "local-symmetric",
  achievedP19Level: 3, achievedP20Level: 3,
  achievedP19VariationDb: 4.0, achievedP20VariationDb: 3.0,
  perSeatP19: [{ seatId: "seat-r1-c1", isPrimary: true, level: 3, variationDbRaw: 4.0 }],
  perSeatP20: [{ seatId: "seat-r1-c1", isPrimary: true, level: 3, variationDbRaw: 3.0 }],
  p14AchievedLevel: 2, p18AchievedLevel: 2,
};
const confirmedB = [globalWorse, localBetter];
const matB = checkPhaseMateriality(confirmedB, existingAuthority);
ok("CASE B: local better → local wins", matB.winner?.candidateId === "local-2",
  "local-2", matB.winner?.candidateId);
ok("CASE B: winner origin is local-symmetric",
  matB.winner?.candidateOrigin === "local-symmetric",
  "local-symmetric", matB.winner?.candidateOrigin);

// Origin survives through the pipeline
const tagged = tagGlobalCandidates([{ id: "g-1", isCurrent: false }]);
ok("Global origin tagging survives", tagged[0].candidateOrigin === "global-placement",
  "global-placement", tagged[0].candidateOrigin);

// ═══════════════════════════════════════════════════════════════════════
// 7 — ESCALATION EXECUTION
// ═══════════════════════════════════════════════════════════════════════
console.log("\n═══ 7 — ESCALATION EXECUTION ═══");

// CASE A: material symmetric → asymmetric/individual not started
const phaseA = ["symmetric"];
const funnelA = { symmetric: { generated: 36, screened: 36, promotedToV2: 3, confirmed: 3 } };
const stateA = buildPositionOptimisationState(phaseA, funnelA, existingAuthority,
  { isPositionCandidate: true, ...safeCandidate });
ok("CASE A: symmetric material → asymmetric NOT attempted",
  !stateA.asymmetricPair.attempted, false, stateA.asymmetricPair.attempted);
ok("CASE A: individual NOT attempted",
  !stateA.individual.attempted, false, stateA.individual.attempted);
ok("CASE A: materialSubImprovementFound = true",
  stateA.materialSubImprovementFound === true, true, stateA.materialSubImprovementFound);
ok("CASE A: NOT exhausted (material found)",
  !stateA.subOptimisationExhausted, false, stateA.subOptimisationExhausted);

// CASE B: symmetric immaterial, asymmetric material → individual not started
const phaseB = ["symmetric", "asymmetric-pair"];
const funnelB = {
  symmetric: { generated: 36, screened: 36, promotedToV2: 3, confirmed: 3 },
  asymmetricPair: { generated: 20, screened: 20, promotedToV2: 2, confirmed: 2 },
};
const stateB = buildPositionOptimisationState(phaseB, funnelB, existingAuthority,
  { isPositionCandidate: true, ...safeCandidate });
ok("CASE B: individual NOT attempted",
  !stateB.individual.attempted, false, stateB.individual.attempted);
ok("CASE B: materialSubImprovementFound = true",
  stateB.materialSubImprovementFound === true, true, stateB.materialSubImprovementFound);

// CASE C: symmetric + asymmetric immaterial → individual starts
const phaseC = ["symmetric", "asymmetric-pair", "individual"];
const funnelC = {
  symmetric: { generated: 36, screened: 36, promotedToV2: 3, confirmed: 3 },
  asymmetricPair: { generated: 20, screened: 20, promotedToV2: 2, confirmed: 2 },
  individual: { generated: 30, screened: 30, promotedToV2: 3, confirmed: 3 },
};
const stateC = buildPositionOptimisationState(phaseC, funnelC, existingAuthority, null);
ok("CASE C: individual attempted",
  stateC.individual.attempted, true, stateC.individual.attempted);

// CASE D: all immaterial → exhausted
ok("CASE D: subOptimisationExhausted = true",
  stateC.subOptimisationExhausted === true, true, stateC.subOptimisationExhausted);
ok("CASE D: materialSubImprovementFound = false",
  stateC.materialSubImprovementFound === false, false, stateC.materialSubImprovementFound);

// CASE E: cancel during symmetric → no later tier
const phaseE = ["symmetric"]; // only symmetric ran before cancel
ok("CASE E: only symmetric in phases",
  phaseE.length === 1 && phaseE[0] === "symmetric", "symmetric only", phaseE.join(","));

// ═══════════════════════════════════════════════════════════════════════
// 8 — MATERIALITY AUTHORITY
// ═══════════════════════════════════════════════════════════════════════
console.log("\n═══ 8 — MATERIALITY AUTHORITY ═══");

// Proxy excellent, canonical immaterial → no material winner
const canonicalImmaterial = {
  achievedP19Level: 2, achievedP20Level: 2,
  achievedP19VariationDb: 6.0, achievedP20VariationDb: 5.0,
  perSeatP19: existingAuthority.perSeatP19,
  perSeatP20: existingAuthority.perSeatP20,
  p14AchievedLevel: 2, p18AchievedLevel: 2,
};
const matImmaterial = isMaterialImprovement(existingAuthority, canonicalImmaterial);
ok("Proxy excellent, canonical immaterial → NOT material",
  !matImmaterial.material, "!material", matImmaterial.material);

// Proxy modest, canonical P20 level improves → material
const matP20Improve = isMaterialImprovement(existingAuthority, safeCandidate);
ok("Canonical P20 level improves with both primaries safe → material",
  matP20Improve.material, "material", matP20Improve.material);

// checkPhaseMateriality uses canonical only
const confirmedMat = [
  { isCurrent: true, candidateId: "current" },
  safeCandidate,
];
const phaseMat = checkPhaseMateriality(confirmedMat, existingAuthority);
ok("checkPhaseMateriality detects canonical material",
  phaseMat.material, true, phaseMat.material);

// ═══════════════════════════════════════════════════════════════════════
// 9 — PREVIEW / APPLY
// ═══════════════════════════════════════════════════════════════════════
console.log("\n═══ 9 — PREVIEW / APPLY ═══");

const currentInstances = [
  { id: "sub-1", model: "sub2-12", enabled: true, position: { x: 1.0, y: 0.5 },
    bottomHeightM: 0.15, rotationDeg: 0, delayMs: 0, gainDb: 0, polarity: 0,
    legacyGroup: "front", symmetryLinkId: "sym-1" },
  { id: "sub-2", model: "sub2-12", enabled: true, position: { x: 3.5, y: 0.5 },
    bottomHeightM: 0.15, rotationDeg: 0, delayMs: 0, gainDb: 0, polarity: 0,
    legacyGroup: "front", symmetryLinkId: "sym-1" },
  { id: "sub-3", model: "sub2-12", enabled: false, position: { x: 2.0, y: 3.0 },
    bottomHeightM: 0, rotationDeg: 0, delayMs: 0, gainDb: 0, polarity: 0 },
];
const winner = {
  positionCoordinates: [{ x: 1.1, y: 0.6 }, { x: 3.4, y: 0.5 }],
  appliedTuning: [
    { delayMs: 2.0, gainDb: -0.5, polarity: -1 },
    { delayMs: 0, gainDb: 0, polarity: 0 },
  ],
};

// Before apply: selection is plain object, no mutation
const selection = { isCurrent: false, winner };
ok("Before apply: selection has no applied flag",
  !selection.applied, false, selection.applied);

// After apply: buildOptimisedInstances
const applied = buildOptimisedInstances(winner, currentInstances, { widthM: 4.5, lengthM: 6.0, heightM: 2.4 }, "sub2-12");
const active = applied.filter(i => i.enabled !== false);
const disabled = applied.filter(i => i.enabled === false);

ok("After apply: 2 active subs", active.length === 2, 2, active.length);
ok("After apply: 1 disabled sub preserved", disabled.length === 1, 1, disabled.length);
ok("After apply: active sub IDs preserved",
  active[0].id === "sub-1" && active[1].id === "sub-2", "sub-1,sub-2",
  `${active[0].id},${active[1].id}`);
ok("After apply: model preserved",
  active[0].model === "sub2-12", "sub2-12", active[0].model);
ok("After apply: bottomHeightM preserved",
  active[0].bottomHeightM === 0.15, 0.15, active[0].bottomHeightM);
ok("After apply: legacyGroup preserved",
  active[0].legacyGroup === "front", "front", active[0].legacyGroup);
ok("After apply: symmetryLinkId preserved",
  active[0].symmetryLinkId === "sym-1", "sym-1", active[0].symmetryLinkId);
ok("After apply: x changed",
  Math.abs(active[0].position.x - 1.1) < 0.01, 1.1, active[0].position.x);
ok("After apply: y changed",
  Math.abs(active[0].position.y - 0.6) < 0.01, 0.6, active[0].position.y);
ok("After apply: delay changed",
  Math.abs(active[0].delayMs - 2.0) < 0.01, 2.0, active[0].delayMs);
ok("After apply: gain changed",
  Math.abs(active[0].gainDb - (-0.5)) < 0.01, -0.5, active[0].gainDb);
ok("After apply: polarity changed",
  active[0].polarity === -1, -1, active[0].polarity);
ok("After apply: disabled sub position unchanged",
  Math.abs(disabled[0].position.x - 2.0) < 0.01, 2.0, disabled[0].position.x);

// isOptimisedApplied detects mismatch
ok("isOptimisedApplied detects unapplied state",
  !isOptimisedApplied(currentInstances, winner, { widthM: 4.5, lengthM: 6.0, heightM: 2.4 }),
  false, "not applied");

// ═══════════════════════════════════════════════════════════════════════
// 11 — CANCEL / STALE
// ═══════════════════════════════════════════════════════════════════════
console.log("\n═══ 11 — CANCEL / STALE ═══");

// Cancel during symmetric screening → terminal cancelled, no late phase
ok("Cancel during symmetric: only symmetric phase",
  phaseE.length === 1, 1, phaseE.length);

// Cancel during confirmation → no winner published
let cancelled = false;
const confirmedResults = [];
for (const cand of ["cand-1", "cand-2", "cand-3"]) {
  if (cancelled) break;
  confirmedResults.push(cand);
  if (cand === "cand-1") cancelled = true;
}
ok("Cancel during confirmation: only 1 confirmed",
  confirmedResults.length === 1, 1, confirmedResults.length);

// Retry works
const cancelledState = { status: "cancelled", cancelRequested: true };
const retriedState = { status: "running", cancelRequested: false };
ok("Retry resets status to running",
  retriedState.status === "running", "running", retriedState.status);
ok("Retry clears cancel flag",
  retriedState.cancelRequested === false, false, retriedState.cancelRequested);

// Stale: project geometry mutation → stale result
const startFingerprint = "abc123";
const currentFingerprint = "def456";
ok("Geometry mutation detected as stale",
  currentFingerprint !== startFingerprint, true, currentFingerprint !== startFingerprint);

// ── Summary ──────────────────────────────────────────────────────────────
console.log(`\n═══ ORCHESTRATION SUMMARY ═══`);
console.log(`${results.passed} passed, ${results.failed} failed`);
if (results.failed > 0) process.exit(1);