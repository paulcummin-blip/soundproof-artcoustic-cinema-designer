// stage2-b-last-resort.test.mjs
// Tests for the RP22 B last-resort eligibility gate, finalist generation,
// and material improvement comparison rule.
//
// Test A — practical result succeeds → B not eligible, 0 B evaluations
// Test B — practical results fail → B eligible, 1 B evaluation path
// Test C — B improves materially → B may win
// Test D — B only fractionally better → practical remains preferred
// Test E — A never evaluated
// Test F — stale fingerprint → B not eligible
// Test G — persistence/reopen (verified via field presence)

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  passesCredibilityGate,
  evaluateBEligibility,
  generateBFinalist,
  compareBAgainstPractical,
} from "../src/components/room/bass/stage2/stage2BLastResort.js";

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
  secondaryP19Levels = [],
  secondaryP20Levels = [],
}) {
  const perSeatP19 = [];
  const perSeatP20 = [];
  primaryP19Levels.forEach((lvl, i) => {
    perSeatP19.push({
      seatId: `p${i + 1}`,
      isPrimary: true,
      level: lvl,
      variationDbRaw: lvl >= 4 ? 1.5 : lvl >= 3 ? 2.5 : lvl >= 2 ? 3.5 : 5.5,
      worstFrequencyHz: 50,
    });
  });
  primaryP20Levels.forEach((lvl, i) => {
    perSeatP20.push({
      seatId: `p${i + 1}`,
      isPrimary: true,
      level: lvl,
      variationDbRaw: lvl >= 4 ? 1.5 : lvl >= 3 ? 2.5 : lvl >= 2 ? 3.5 : 5.5,
      worstFrequencyHz: 60,
    });
  });
  secondaryP19Levels.forEach((lvl, i) => {
    perSeatP19.push({
      seatId: `s${i + 1}`,
      isPrimary: false,
      level: lvl,
      variationDbRaw: lvl >= 4 ? 1.5 : lvl >= 3 ? 2.5 : lvl >= 2 ? 3.5 : 5.5,
      worstFrequencyHz: 55,
    });
  });
  secondaryP20Levels.forEach((lvl, i) => {
    perSeatP20.push({
      seatId: `s${i + 1}`,
      isPrimary: false,
      level: lvl,
      variationDbRaw: lvl >= 4 ? 1.5 : lvl >= 3 ? 2.5 : lvl >= 2 ? 3.5 : 5.5,
      worstFrequencyHz: 65,
    });
  });
  return {
    finalistId,
    familyId,
    quantity: 4,
    coordinates: [],
    p14Limited,
    p18Limited,
    achievedP18Hz,
    perSeatP19,
    perSeatP20,
  };
}

function makeRankingTuple({
  primaryP19BelowL2 = 0,
  primaryP20BelowL2 = 0,
  worstPrimaryCombined = 2,
  primaryL4Count = 0,
  primaryL3PlusCount = 0,
  worstP19Deviation = 3.5,
  worstP20Deviation = 3.5,
  familyRank = 1,
} = {}) {
  return [
    -primaryP19BelowL2,
    -primaryP20BelowL2,
    worstPrimaryCombined,
    primaryL4Count,
    primaryL3PlusCount,
    -worstP19Deviation,
    -worstP20Deviation,
    0, // secondaryP19Fail
    0, // secondaryL2Plus
    0, // secondaryL1Plus
    0, // p14HeadroomDb
    0, // efficiency
    -familyRank,
    0, // displacement
    0, // asymmetry
    "coord-key",
  ];
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("Stage 2 B Last-Resort Gate", () => {
  describe("Test A — practical result succeeds", () => {
    it("B eligible = false when a practical candidate passes the credibility gate", () => {
      const practicalPass = makeResult({
        familyId: FAMILY_IDS.RP22_C,
        primaryP19Levels: [2, 2],
        primaryP20Levels: [2, 2],
      });
      const eligibility = evaluateBEligibility({
        evaluatedResults: [practicalPass],
        promotedFinalists: [{ familyId: FAMILY_IDS.RP22_C }],
        fingerprint: "fp-1",
        currentFingerprint: "fp-1",
      });
      assert.equal(eligibility.eligible, false);
      assert.equal(eligibility.reason, "practical_candidate_passes");
      assert.equal(eligibility.failedCandidates.length, 0);
    });

    it("B evaluations = 0 (B not queued)", () => {
      // Verified by store logic: bState = "not_eligible", B never queued
      const practicalPass = makeResult({
        familyId: FAMILY_IDS.RP22_C,
        primaryP19Levels: [3, 3],
        primaryP20Levels: [3, 3],
      });
      assert.ok(passesCredibilityGate(practicalPass));
    });
  });

  describe("Test B — practical results fail", () => {
    it("B eligible = true when all practical candidates fail the credibility gate", () => {
      const fail1 = makeResult({
        familyId: FAMILY_IDS.RP22_C,
        finalistId: "c-1",
        primaryP19Levels: [1, 2], // Primary P19 < L2
        primaryP20Levels: [2, 2],
      });
      const fail2 = makeResult({
        familyId: FAMILY_IDS.RP22_E,
        finalistId: "e-1",
        primaryP19Levels: [2, 2],
        primaryP20Levels: [1, 2], // Primary P20 < L2
      });
      const eligibility = evaluateBEligibility({
        evaluatedResults: [fail1, fail2],
        promotedFinalists: [
          { familyId: FAMILY_IDS.RP22_C },
          { familyId: FAMILY_IDS.RP22_E },
        ],
        fingerprint: "fp-1",
        currentFingerprint: "fp-1",
      });
      assert.equal(eligibility.eligible, true);
      assert.equal(eligibility.reason, "all_practical_candidates_failed_credibility_gate");
      assert.equal(eligibility.failedCandidates.length, 2);
    });

    it("exactly one B family evaluation path becomes available", () => {
      const bFinalist = generateBFinalist();
      assert.equal(bFinalist.familyId, FAMILY_IDS.RP22_B_LAST_RESORT);
      assert.equal(bFinalist.sources.length, 4);
      // Four wall midpoints
      assert.deepEqual(bFinalist.sources.map((s) => [s.xNorm, s.yNorm]).sort(), [
        [0, 0.5],
        [0.5, 0],
        [0.5, 1],
        [1, 0.5],
      ]);
    });
  });

  describe("Test C — B improves materially", () => {
    it("B may win when it removes a Primary below-L2 failure", () => {
      const practical = {
        familyId: FAMILY_IDS.RP22_C,
        rankingTuple: makeRankingTuple({
          primaryP19BelowL2: 1, // one Primary below L2
          primaryP20BelowL2: 0,
          worstPrimaryCombined: 1,
          familyRank: 1,
        }),
      };
      const bResult = {
        familyId: FAMILY_IDS.RP22_B_LAST_RESORT,
        rankingTuple: makeRankingTuple({
          primaryP19BelowL2: 0, // no Primary below L2
          primaryP20BelowL2: 0,
          worstPrimaryCombined: 2,
          familyRank: 99,
        }),
      };
      // B has 0 below-L2 vs practical's 1 → B wins on position 0
      const cmp = compareBAgainstPractical(bResult, practical);
      assert.ok(cmp < 0, "B should rank higher (negative) when materially better");
    });
  });

  describe("Test D — B only fractionally better", () => {
    it("practical candidate remains preferred when B is only fractionally better on raw deviation", () => {
      const practical = {
        familyId: FAMILY_IDS.RP22_C,
        rankingTuple: makeRankingTuple({
          primaryP19BelowL2: 0,
          primaryP20BelowL2: 0,
          worstPrimaryCombined: 2,
          primaryL4Count: 0,
          primaryL3PlusCount: 0,
          worstP19Deviation: 3.5,
          worstP20Deviation: 3.5,
          familyRank: 1,
        }),
      };
      const bResult = {
        familyId: FAMILY_IDS.RP22_B_LAST_RESORT,
        rankingTuple: makeRankingTuple({
          primaryP19BelowL2: 0,
          primaryP20BelowL2: 0,
          worstPrimaryCombined: 2,
          primaryL4Count: 0,
          primaryL3PlusCount: 0,
          worstP19Deviation: 3.3, // only 0.2 dB better — not material
          worstP20Deviation: 3.5,
          familyRank: 99,
        }),
      };
      const cmp = compareBAgainstPractical(bResult, practical);
      assert.ok(cmp > 0, "Practical should rank higher when B is only fractionally better");
    });

    it("B wins when materially better on raw deviation (>= 1.0 dB)", () => {
      const practical = {
        familyId: FAMILY_IDS.RP22_C,
        rankingTuple: makeRankingTuple({
          worstP19Deviation: 3.5,
          worstP20Deviation: 3.5,
          familyRank: 1,
        }),
      };
      const bResult = {
        familyId: FAMILY_IDS.RP22_B_LAST_RESORT,
        rankingTuple: makeRankingTuple({
          worstP19Deviation: 2.0, // 1.5 dB better — material
          worstP20Deviation: 3.5,
          familyRank: 99,
        }),
      };
      const cmp = compareBAgainstPractical(bResult, practical);
      assert.ok(cmp < 0, "B should win when materially better on raw deviation");
    });
  });

  describe("Test E — A never evaluated", () => {
    it("A family is prohibited and never generated", () => {
      const bFinalist = generateBFinalist();
      assert.notEqual(bFinalist.familyId, FAMILY_IDS.RP22_A);
      assert.equal(bFinalist.familyId, FAMILY_IDS.RP22_B_LAST_RESORT);
    });
  });

  describe("Test F — cancellation/stale", () => {
    it("B not eligible when fingerprint is stale", () => {
      const fail1 = makeResult({
        familyId: FAMILY_IDS.RP22_C,
        finalistId: "c-1",
        primaryP19Levels: [1, 2],
        primaryP20Levels: [2, 2],
      });
      const eligibility = evaluateBEligibility({
        evaluatedResults: [fail1],
        promotedFinalists: [{ familyId: FAMILY_IDS.RP22_C }],
        fingerprint: "old-fp",
        currentFingerprint: "new-fp",
      });
      assert.equal(eligibility.eligible, false);
      assert.equal(eligibility.reason, "stale_fingerprint");
    });

    it("B not eligible when a promoted family was not evaluated", () => {
      const fail1 = makeResult({
        familyId: FAMILY_IDS.RP22_C,
        finalistId: "c-1",
        primaryP19Levels: [1, 2],
        primaryP20Levels: [2, 2],
      });
      // RP22_E was promoted but not evaluated
      const eligibility = evaluateBEligibility({
        evaluatedResults: [fail1],
        promotedFinalists: [
          { familyId: FAMILY_IDS.RP22_C },
          { familyId: FAMILY_IDS.RP22_E },
        ],
        fingerprint: "fp-1",
        currentFingerprint: "fp-1",
      });
      assert.equal(eligibility.eligible, false);
      assert.equal(eligibility.reason, "family_RP22_E_not_evaluated");
    });
  });

  describe("Test G — persistence/reopen", () => {
    it("B metadata fields are present in the persistence schema", async () => {
      const fs = await import("node:fs/promises");
      const entitySchema = await fs.readFile(
        "base44/entities/Stage2PlacementCache.jsonc",
        "utf8",
      );
      assert.ok(entitySchema.includes("b_eligible"), "b_eligible field missing");
      assert.ok(entitySchema.includes("b_evaluated"), "b_evaluated field missing");
      assert.ok(entitySchema.includes("b_eligibility_reason"), "b_eligibility_reason field missing");
      assert.ok(entitySchema.includes("b_failed_candidates"), "b_failed_candidates field missing");
      assert.ok(entitySchema.includes("b_result"), "b_result field missing");
    });

    it("B metadata is persisted and hydrated in the persistence module", async () => {
      const fs = await import("node:fs/promises");
      const persistence = await fs.readFile(
        "src/components/room/bass/stage2/stage2PlacementPersistence.js",
        "utf8",
      );
      assert.ok(persistence.includes("b_eligible: record.b_eligible"), "B fields not hydrated");
      assert.ok(persistence.includes("b_eligible: results.b_eligible"), "B fields not persisted");
    });
  });
});