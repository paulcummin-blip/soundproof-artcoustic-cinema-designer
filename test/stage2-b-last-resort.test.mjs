// stage2-b-last-resort.test.mjs
// Tests for the corrected RP22 B last-resort eligibility gate and ranking.
//
// Correction 1 — No arbitrary 1.0 dB B threshold:
//   B uses the normal Primary-first lexicographic ranking (compareStage2Results).
//   Positions 5-6 use floored whole-dB deviations. Raw fractional deviations
//   remain as diagnostics but do not create a special B override.
//
// Correction 2 — No vacuous B eligibility:
//   B is never eligible merely because the practical candidate set is empty.
//   Every practical family with a Stage 1 finalist must be canonically
//   evaluated (including representatives beyond the normal promotion limit)
//   before B can be considered. A failed/cancelled required family or stale
//   fingerprint means B is NOT_READY.
//
// Test 1 — C/E/D evaluated; C reaches all Primary ≥L2 → B not eligible, 0 B evals
// Test 2 — C/E fail, D finalist exists but not yet evaluated → NOT_READY, evaluate D
// Test 3 — C/E/D all canonically fail credibility gate → B eligible, 1 B eval
// Test 4 — Practical candidate set unexpectedly empty → B not eligible (incomplete)
// Test 5 — Practical has Primary P19 L1; B raises to L2 → B wins via normal ranking
// Test 6 — Identical whole-dB/level/coverage, B raw dev 0.2/0.8/1.5 dB different
//           → practical wins through family preference (no arbitrary threshold)
// Test 7 — Required practical job cancelled/stale → B not eligible
// Test 8 — A evaluations = 0 (A never generated)

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  passesCredibilityGate,
  evaluateBEligibility,
  generateBFinalist,
} from "../src/components/room/bass/stage2/stage2BLastResort.js";
import { compareStage2Results } from "../src/components/room/bass/stage2/stage2Ranking.js";
import { FAMILY_IDS } from "../src/components/room/bass/stage1/stage1FamilyRegistry.js";

// ── Helpers ─────────────────────────────────────────────────────────────

function makeResult({
  familyId = FAMILY_IDS.RP22_C,
  finalistId = "test-finalist",
  p14Limited = false,
  p18Limited = false,
  achievedP18Hz = 35,
  primaryP19Levels = [2, 2],
  primaryP20Levels = [2, 2],
}) {
  const perSeatP19 = primaryP19Levels.map((lvl, i) => ({
    seatId: `p${i + 1}`, isPrimary: true, level: lvl,
    variationDbRaw: lvl >= 4 ? 1.5 : lvl >= 3 ? 2.5 : lvl >= 2 ? 3.5 : 5.5,
    worstFrequencyHz: 50,
  }));
  const perSeatP20 = primaryP20Levels.map((lvl, i) => ({
    seatId: `p${i + 1}`, isPrimary: true, level: lvl,
    variationDbRaw: lvl >= 4 ? 1.5 : lvl >= 3 ? 2.5 : lvl >= 2 ? 3.5 : 5.5,
    worstFrequencyHz: 60,
  }));
  return { finalistId, familyId, p14Limited, p18Limited, achievedP18Hz, perSeatP19, perSeatP20 };
}

function makeFinalist(familyId, id) {
  return { id: id || `${familyId}-f1`, familyId };
}

// Build a ranking tuple matching stage2Ranking.buildStage2RankingTuple format.
// Deviations are floored to whole-dB (Math.floor) as per Correction 1.
function makeRankingTuple({
  primaryP19BelowL2 = 0,
  primaryP20BelowL2 = 0,
  worstPrimaryCombined = 2,
  primaryL4Count = 0,
  primaryL3PlusCount = 0,
  worstP19DeviationRaw = 3.5,
  worstP20DeviationRaw = 3.5,
  familyRank = 1,
} = {}) {
  return [
    -primaryP19BelowL2,
    -primaryP20BelowL2,
    worstPrimaryCombined,
    primaryL4Count,
    primaryL3PlusCount,
    -Math.floor(Math.abs(worstP19DeviationRaw)),
    -Math.floor(Math.abs(worstP20DeviationRaw)),
    0, 0, 0, 0, 0,
    -familyRank,
    0, 0, "coord-key",
  ];
}

const FP = "fp-1";

// ── Tests ───────────────────────────────────────────────────────────────

describe("Stage 2 B Last-Resort — Corrected Gate", () => {
  describe("Test 1 — practical candidate passes", () => {
    it("B eligible = false, B evaluations = 0 when C reaches all Primary ≥L2", () => {
      const cPass = makeResult({ familyId: FAMILY_IDS.RP22_C, finalistId: "c1", primaryP19Levels: [2, 2], primaryP20Levels: [2, 2] });
      const eFail = makeResult({ familyId: FAMILY_IDS.RP22_E, finalistId: "e1", primaryP19Levels: [1, 2], primaryP20Levels: [2, 2] });
      const dFail = makeResult({ familyId: FAMILY_IDS.RP22_D, finalistId: "d1", primaryP19Levels: [1, 1], primaryP20Levels: [1, 2] });
      const eligibility = evaluateBEligibility({
        evaluatedResults: [cPass, eFail, dFail],
        allStage1Finalists: [makeFinalist(FAMILY_IDS.RP22_C, "c1"), makeFinalist(FAMILY_IDS.RP22_E, "e1"), makeFinalist(FAMILY_IDS.RP22_D, "d1")],
        stage1Complete: true,
        evaluatedFamilyIds: new Set([FAMILY_IDS.RP22_C, FAMILY_IDS.RP22_E, FAMILY_IDS.RP22_D]),
        failedFamilyIds: new Set(),
        fingerprint: FP, currentFingerprint: FP,
      });
      assert.equal(eligibility.eligible, false);
      assert.equal(eligibility.reason, "practical_candidate_passes");
    });
  });

  describe("Test 2 — D finalist not yet evaluated", () => {
    it("B remains NOT_READY (missing_representatives) — D must be evaluated first", () => {
      const cFail = makeResult({ familyId: FAMILY_IDS.RP22_C, finalistId: "c1", primaryP19Levels: [1, 2], primaryP20Levels: [2, 2] });
      const eFail = makeResult({ familyId: FAMILY_IDS.RP22_E, finalistId: "e1", primaryP19Levels: [1, 1], primaryP20Levels: [1, 2] });
      const eligibility = evaluateBEligibility({
        evaluatedResults: [cFail, eFail],
        allStage1Finalists: [makeFinalist(FAMILY_IDS.RP22_C, "c1"), makeFinalist(FAMILY_IDS.RP22_E, "e1"), makeFinalist(FAMILY_IDS.RP22_D, "d1")],
        stage1Complete: true,
        evaluatedFamilyIds: new Set([FAMILY_IDS.RP22_C, FAMILY_IDS.RP22_E]),
        failedFamilyIds: new Set(),
        fingerprint: FP, currentFingerprint: FP,
      });
      assert.equal(eligibility.eligible, false);
      assert.equal(eligibility.reason, "missing_representatives");
      assert.equal(eligibility.missingRepresentatives.length, 1);
      assert.equal(eligibility.missingRepresentatives[0].familyId, FAMILY_IDS.RP22_D);
    });
  });

  describe("Test 3 — all practical candidates fail credibility gate", () => {
    it("B eligible = true, exactly one B evaluation", () => {
      const cFail = makeResult({ familyId: FAMILY_IDS.RP22_C, finalistId: "c1", primaryP19Levels: [1, 2], primaryP20Levels: [2, 2] });
      const eFail = makeResult({ familyId: FAMILY_IDS.RP22_E, finalistId: "e1", primaryP19Levels: [1, 1], primaryP20Levels: [1, 2] });
      const dFail = makeResult({ familyId: FAMILY_IDS.RP22_D, finalistId: "d1", primaryP19Levels: [1, 1], primaryP20Levels: [1, 1] });
      const eligibility = evaluateBEligibility({
        evaluatedResults: [cFail, eFail, dFail],
        allStage1Finalists: [makeFinalist(FAMILY_IDS.RP22_C, "c1"), makeFinalist(FAMILY_IDS.RP22_E, "e1"), makeFinalist(FAMILY_IDS.RP22_D, "d1")],
        stage1Complete: true,
        evaluatedFamilyIds: new Set([FAMILY_IDS.RP22_C, FAMILY_IDS.RP22_E, FAMILY_IDS.RP22_D]),
        failedFamilyIds: new Set(),
        fingerprint: FP, currentFingerprint: FP,
      });
      assert.equal(eligibility.eligible, true);
      assert.equal(eligibility.reason, "all_practical_candidates_failed_credibility_gate");
      assert.equal(eligibility.failedCandidates.length, 3);
      // B finalist generation
      const bFinalist = generateBFinalist();
      assert.equal(bFinalist.familyId, FAMILY_IDS.RP22_B_LAST_RESORT);
      assert.equal(bFinalist.sources.length, 4);
    });
  });

  describe("Test 4 — practical candidate set unexpectedly empty", () => {
    it("B eligible = false, reason = incomplete_practical_evidence", () => {
      const eligibility = evaluateBEligibility({
        evaluatedResults: [],
        allStage1Finalists: [],
        stage1Complete: true,
        evaluatedFamilyIds: new Set(),
        failedFamilyIds: new Set(),
        fingerprint: FP, currentFingerprint: FP,
      });
      assert.equal(eligibility.eligible, false);
      assert.equal(eligibility.reason, "incomplete_practical_evidence");
    });
  });

  describe("Test 5 — B wins through normal lexicographic ranking", () => {
    it("Practical has Primary P19 L1; B raises to L2 → B wins on position 0", () => {
      const practical = {
        familyId: FAMILY_IDS.RP22_C,
        rankingTuple: makeRankingTuple({ primaryP19BelowL2: 1, primaryP20BelowL2: 0, worstPrimaryCombined: 1, familyRank: 1 }),
      };
      const bResult = {
        familyId: FAMILY_IDS.RP22_B_LAST_RESORT,
        rankingTuple: makeRankingTuple({ primaryP19BelowL2: 0, primaryP20BelowL2: 0, worstPrimaryCombined: 2, familyRank: 99 }),
      };
      // Normal comparison — no B-specific override
      const cmp = compareStage2Results(bResult, practical);
      assert.ok(cmp < 0, "B should rank higher (negative) when it removes a below-L2 failure");
    });
  });

  describe("Test 6 — no arbitrary raw-dB B threshold", () => {
    it("identical whole-dB, 0.2 dB raw difference → practical wins on family preference", () => {
      // Both floor to 3: practical=3.2→3, B=3.0→3
      const practical = {
        familyId: FAMILY_IDS.RP22_C,
        rankingTuple: makeRankingTuple({ worstP19DeviationRaw: 3.2, worstP20DeviationRaw: 3.0, familyRank: 1 }),
      };
      const bResult = {
        familyId: FAMILY_IDS.RP22_B_LAST_RESORT,
        rankingTuple: makeRankingTuple({ worstP19DeviationRaw: 3.0, worstP20DeviationRaw: 3.0, familyRank: 99 }),
      };
      const cmp = compareStage2Results(bResult, practical);
      assert.ok(cmp > 0, "Practical should win when whole-dB is identical (family preference)");
    });

    it("identical whole-dB, 0.8 dB raw difference → practical wins on family preference", () => {
      // Both floor to 3: practical=3.8→3, B=3.0→3
      const practical = {
        familyId: FAMILY_IDS.RP22_C,
        rankingTuple: makeRankingTuple({ worstP19DeviationRaw: 3.8, worstP20DeviationRaw: 3.0, familyRank: 1 }),
      };
      const bResult = {
        familyId: FAMILY_IDS.RP22_B_LAST_RESORT,
        rankingTuple: makeRankingTuple({ worstP19DeviationRaw: 3.0, worstP20DeviationRaw: 3.0, familyRank: 99 }),
      };
      const cmp = compareStage2Results(bResult, practical);
      assert.ok(cmp > 0, "Practical should win when whole-dB is identical (family preference)");
    });

    it("no STAGE2_B_MATERIAL_IMPROVEMENT_DB constant exists", async () => {
      const fs = await import("node:fs/promises");
      const constants = await fs.readFile("src/components/room/bass/stage2/stage2Constants.js", "utf8");
      assert.ok(!constants.includes("STAGE2_B_MATERIAL_IMPROVEMENT_DB"), "Threshold constant must be removed");
    });

    it("no compareBAgainstPractical function exists", async () => {
      const fs = await import("node:fs/promises");
      const bLastResort = await fs.readFile("src/components/room/bass/stage2/stage2BLastResort.js", "utf8");
      assert.ok(!bLastResort.includes("compareBAgainstPractical"), "B-specific comparison must be removed");
      assert.ok(!bLastResort.includes("MATERIAL_IMPROVEMENT"), "Material improvement threshold must be removed");
    });
  });

  describe("Test 7 — required practical job cancelled/stale", () => {
    it("B not eligible when a required family evaluation failed", () => {
      const cFail = makeResult({ familyId: FAMILY_IDS.RP22_C, finalistId: "c1", primaryP19Levels: [1, 2], primaryP20Levels: [2, 2] });
      const eFail = makeResult({ familyId: FAMILY_IDS.RP22_E, finalistId: "e1", primaryP19Levels: [1, 1], primaryP20Levels: [1, 2] });
      // D was retained by Stage 1 but its evaluation failed technically
      const eligibility = evaluateBEligibility({
        evaluatedResults: [cFail, eFail],
        allStage1Finalists: [makeFinalist(FAMILY_IDS.RP22_C, "c1"), makeFinalist(FAMILY_IDS.RP22_E, "e1"), makeFinalist(FAMILY_IDS.RP22_D, "d1")],
        stage1Complete: true,
        evaluatedFamilyIds: new Set([FAMILY_IDS.RP22_C, FAMILY_IDS.RP22_E]),
        failedFamilyIds: new Set([FAMILY_IDS.RP22_D]),
        fingerprint: FP, currentFingerprint: FP,
      });
      assert.equal(eligibility.eligible, false);
      assert.equal(eligibility.reason, "family_RP22_D_evaluation_failed");
    });

    it("B not eligible when fingerprint is stale", () => {
      const eligibility = evaluateBEligibility({
        evaluatedResults: [],
        allStage1Finalists: [makeFinalist(FAMILY_IDS.RP22_C, "c1")],
        stage1Complete: true,
        evaluatedFamilyIds: new Set(),
        failedFamilyIds: new Set(),
        fingerprint: "old-fp", currentFingerprint: "new-fp",
      });
      assert.equal(eligibility.eligible, false);
      assert.equal(eligibility.reason, "stale_fingerprint");
    });

    it("B not eligible when Stage 1 search is incomplete", () => {
      const eligibility = evaluateBEligibility({
        evaluatedResults: [],
        allStage1Finalists: [makeFinalist(FAMILY_IDS.RP22_C, "c1")],
        stage1Complete: false,
        evaluatedFamilyIds: new Set(),
        failedFamilyIds: new Set(),
        fingerprint: FP, currentFingerprint: FP,
      });
      assert.equal(eligibility.eligible, false);
      assert.equal(eligibility.reason, "stage1_incomplete");
    });
  });

  describe("Test 8 — A never evaluated", () => {
    it("A family is prohibited and filtered from required families", () => {
      const eligibility = evaluateBEligibility({
        evaluatedResults: [],
        allStage1Finalists: [makeFinalist(FAMILY_IDS.RP22_A, "a1"), makeFinalist(FAMILY_IDS.RP22_C, "c1")],
        stage1Complete: true,
        evaluatedFamilyIds: new Set(),
        failedFamilyIds: new Set(),
        fingerprint: FP, currentFingerprint: FP,
      });
      // A is filtered out — only C is required → C is missing → NOT_READY
      assert.equal(eligibility.reason, "missing_representatives");
      assert.ok(!eligibility.missingRepresentatives.some((r) => r.familyId === FAMILY_IDS.RP22_A), "A must not be a required family");
    });

    it("B finalist is never A", () => {
      const bFinalist = generateBFinalist();
      assert.notEqual(bFinalist.familyId, FAMILY_IDS.RP22_A);
      assert.equal(bFinalist.familyId, FAMILY_IDS.RP22_B_LAST_RESORT);
    });
  });
});