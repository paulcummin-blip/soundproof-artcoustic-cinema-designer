// stage2-practical-placement-preference.test.mjs
// Focused regression tests for the practical placement preference and the
// exceptional side/mixed-wall alternative qualifier at the final
// recommendation selection boundary.
//
// Contract (new):
//   - selectPracticalBest ALWAYS returns the best conventional front/rear
//     candidate. A side/mixed-wall arrangement never displaces it, regardless
//     of any raw numerical advantage. When no conventional candidate exists,
//     the existing acoustic winner stands (the fallback may be side-wall).
//   - selectQualifyingAlternatives returns side/mixed candidates that deliver
//     an actual whole-Level improvement in P19 RSP or Primary P20 over the
//     practical best, with no regression in the other relevant Level.
//     Secondary-only improvements never qualify.
//
// The confirmed six-seat case:
//   FOUR_THIRD_PAIRS (front/rear): P19 L4 / 0.665 dB, P20 Primary L1 / 7.584 dB
//   RP22_B_LAST_RESORT (mixed):   P19 L4 / 1.384 dB, P20 Primary L1 / 6.725 dB,
//                                                       P20 Secondary L2 / 4.518 dB
// B ranks higher acoustically on floored Primary deviation (6 < 7 dB) even
// though both remain Primary P20 Level 1. The practical preference must
// select FOUR_THIRD_PAIRS as the normal four-sub recommendation. B does NOT
// qualify as an alternative (no whole-Level improvement).
//
// Run: node --import ./test/_alias-register.mjs --test test/stage2-practical-placement-preference.test.mjs

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  selectPracticalBest,
  selectQualifyingAlternatives,
  isSideOrMixedWallFamily,
} from "../src/components/room/bass/stage2/stage2PracticalPlacementPreference.js";
import { FAMILY_IDS } from "../src/components/room/bass/stage1/stage1FamilyRegistry.js";

// ── Helpers ─────────────────────────────────────────────────────────────

function makeRankingTuple({
  failSeats = 0,
  worstPrimaryCombined = 1,
  primaryL4 = 0,
  primaryL3Plus = 0,
  p19Dev = 0,
  p20Dev = 7,
  familyRank = 1,
  coordKey = "k",
} = {}) {
  return [
    -failSeats,
    worstPrimaryCombined,
    primaryL4,
    primaryL3Plus,
    -Math.floor(Math.abs(p19Dev)),
    -Math.floor(Math.abs(p20Dev)),
    0, 0, 0, 0, 0,
    -familyRank,
    0, 0, -0,
    coordKey,
  ];
}

function makeResult({
  familyId,
  finalistId,
  p19Level,
  primaryP20Levels = [1],
  secondaryP20Levels = [],
  rankingTuple,
}) {
  const primarySeats = primaryP20Levels.map((lvl, i) => ({ seatId: `p${i + 1}`, isPrimary: true, p20Level: lvl }));
  const secondarySeats = secondaryP20Levels.map((lvl, i) => ({ seatId: `s${i + 1}`, isPrimary: false, p20Level: lvl }));
  return {
    finalistId,
    familyId,
    achievedP19Level: p19Level,
    rankingData: {
      primarySummary: { seats: primarySeats },
      secondarySummary: { seats: secondarySeats },
      rankingTuple: rankingTuple || makeRankingTuple({ p20Dev: Math.max(...primaryP20Levels.map((l) => (l >= 4 ? 1.5 : l >= 3 ? 2.5 : l >= 2 ? 3.5 : 5.5))) }),
    },
  };
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("Practical Placement Preference — isSideOrMixedWallFamily", () => {
  it("classifies side-wall and mixed families", () => {
    assert.equal(isSideOrMixedWallFamily(FAMILY_IDS.ONE_SIDE_QUARTER), true);
    assert.equal(isSideOrMixedWallFamily(FAMILY_IDS.RP22_G), true);
    assert.equal(isSideOrMixedWallFamily(FAMILY_IDS.RP22_D), true);
    assert.equal(isSideOrMixedWallFamily(FAMILY_IDS.RP22_B_LAST_RESORT), true);
  });
  it("classifies conventional front/rear families as not side/mixed", () => {
    assert.equal(isSideOrMixedWallFamily(FAMILY_IDS.FOUR_THIRD_PAIRS), false);
    assert.equal(isSideOrMixedWallFamily(FAMILY_IDS.RP22_C), false);
    assert.equal(isSideOrMixedWallFamily(FAMILY_IDS.RP22_E), false);
    assert.equal(isSideOrMixedWallFamily(FAMILY_IDS.C_FRONT_PAIR), false);
    assert.equal(isSideOrMixedWallFamily(FAMILY_IDS.ONE_FRONT_MID), false);
    assert.equal(isSideOrMixedWallFamily(FAMILY_IDS.RP22_F), false);
  });
});

describe("Practical Placement Preference — selectPracticalBest always returns front/rear", () => {
  it("selects FOUR_THIRD_PAIRS over B_LAST_RESORT when both remain Primary P20 L1 (confirmed six-seat case)", () => {
    const frontRear = makeResult({
      familyId: FAMILY_IDS.FOUR_THIRD_PAIRS,
      finalistId: "ftp",
      p19Level: 4,
      primaryP20Levels: [1, 1],
      secondaryP20Levels: [1],
      rankingTuple: makeRankingTuple({ worstPrimaryCombined: 1, p19Dev: 0, p20Dev: 7.584, familyRank: 3 }),
    });
    const bMixed = makeResult({
      familyId: FAMILY_IDS.RP22_B_LAST_RESORT,
      finalistId: "b",
      p19Level: 4,
      primaryP20Levels: [1, 1],
      secondaryP20Levels: [2],
      rankingTuple: makeRankingTuple({ worstPrimaryCombined: 1, p19Dev: 1.384, p20Dev: 6.725, familyRank: 99 }),
    });
    const ranked = [bMixed, frontRear];
    const best = selectPracticalBest(ranked);
    assert.equal(best.familyId, FAMILY_IDS.FOUR_THIRD_PAIRS, "FOUR_THIRD_PAIRS must be the normal recommendation");
    assert.notEqual(best.familyId, FAMILY_IDS.RP22_B_LAST_RESORT, "B must never displace front/rear as the recommendation");
  });

  it("keeps front/rear even when side/mixed has a whole Primary P20 Level improvement (no displacement)", () => {
    const frontRear = makeResult({
      familyId: FAMILY_IDS.FOUR_THIRD_PAIRS,
      finalistId: "ftp",
      p19Level: 4,
      primaryP20Levels: [1, 1],
      rankingTuple: makeRankingTuple({ worstPrimaryCombined: 1, p20Dev: 7, familyRank: 3 }),
    });
    const side = makeResult({
      familyId: FAMILY_IDS.RP22_D,
      finalistId: "d",
      p19Level: 4,
      primaryP20Levels: [2, 2],
      rankingTuple: makeRankingTuple({ worstPrimaryCombined: 2, p20Dev: 3.5, familyRank: 4 }),
    });
    const ranked = [side, frontRear];
    const best = selectPracticalBest(ranked);
    assert.equal(best.familyId, FAMILY_IDS.FOUR_THIRD_PAIRS, "side/mixed never displaces front/rear as the recommendation");
  });

  it("keeps front/rear even when side/mixed has a whole P19 RSP Level improvement (no displacement)", () => {
    const frontRear = makeResult({
      familyId: FAMILY_IDS.FOUR_THIRD_PAIRS,
      finalistId: "ftp",
      p19Level: 3,
      primaryP20Levels: [1, 1],
      rankingTuple: makeRankingTuple({ worstPrimaryCombined: 1, p20Dev: 7, familyRank: 3 }),
    });
    const side = makeResult({
      familyId: FAMILY_IDS.RP22_D,
      finalistId: "d",
      p19Level: 4,
      primaryP20Levels: [1, 1],
      rankingTuple: makeRankingTuple({ worstPrimaryCombined: 1, p20Dev: 6, familyRank: 4 }),
    });
    const ranked = [side, frontRear];
    const best = selectPracticalBest(ranked);
    assert.equal(best.familyId, FAMILY_IDS.FOUR_THIRD_PAIRS, "side/mixed never displaces front/rear as the recommendation");
  });

  it("keeps conventional when it already ranks higher acoustically", () => {
    const frontRear = makeResult({
      familyId: FAMILY_IDS.FOUR_THIRD_PAIRS,
      finalistId: "ftp",
      p19Level: 4,
      primaryP20Levels: [2, 2],
      rankingTuple: makeRankingTuple({ worstPrimaryCombined: 2, p20Dev: 3, familyRank: 3 }),
    });
    const side = makeResult({
      familyId: FAMILY_IDS.RP22_D,
      finalistId: "d",
      p19Level: 3,
      primaryP20Levels: [2, 2],
      rankingTuple: makeRankingTuple({ worstPrimaryCombined: 2, p20Dev: 4, familyRank: 4 }),
    });
    const ranked = [frontRear, side];
    const best = selectPracticalBest(ranked);
    assert.equal(best.familyId, FAMILY_IDS.FOUR_THIRD_PAIRS);
  });

  it("falls back to the acoustic winner when no viable front/rear candidate exists", () => {
    const side1 = makeResult({
      familyId: FAMILY_IDS.RP22_D,
      finalistId: "d1",
      p19Level: 4,
      primaryP20Levels: [2, 2],
      rankingTuple: makeRankingTuple({ worstPrimaryCombined: 2, p20Dev: 3.5, familyRank: 4 }),
    });
    const side2 = makeResult({
      familyId: FAMILY_IDS.RP22_G,
      finalistId: "g1",
      p19Level: 3,
      primaryP20Levels: [2, 2],
      rankingTuple: makeRankingTuple({ worstPrimaryCombined: 2, p20Dev: 4, familyRank: 8 }),
    });
    const ranked = [side1, side2];
    const best = selectPracticalBest(ranked);
    assert.equal(best.familyId, FAMILY_IDS.RP22_D, "With no front/rear, the acoustic winner stands");
  });

  it("returns null for an empty ranked list", () => {
    assert.equal(selectPracticalBest([]), null);
  });
});

describe("Practical Placement Preference — selectQualifyingAlternatives", () => {
  it("qualifies a side/mixed alternative with a whole Primary P20 Level improvement and no P19 regression", () => {
    const frontRear = makeResult({
      familyId: FAMILY_IDS.FOUR_THIRD_PAIRS,
      finalistId: "ftp",
      p19Level: 4,
      primaryP20Levels: [1, 1],
      rankingTuple: makeRankingTuple({ worstPrimaryCombined: 1, p20Dev: 7, familyRank: 3 }),
    });
    const side = makeResult({
      familyId: FAMILY_IDS.RP22_D,
      finalistId: "d",
      p19Level: 4,
      primaryP20Levels: [2, 2],
      rankingTuple: makeRankingTuple({ worstPrimaryCombined: 2, p20Dev: 3.5, familyRank: 4 }),
    });
    const ranked = [side, frontRear];
    const alts = selectQualifyingAlternatives(ranked, frontRear);
    assert.equal(alts.length, 1, "side with Primary P20 L1->L2 qualifies");
    assert.equal(alts[0].familyId, FAMILY_IDS.RP22_D);
  });

  it("qualifies a side/mixed alternative with a whole P19 RSP Level improvement and no Primary P20 regression", () => {
    const frontRear = makeResult({
      familyId: FAMILY_IDS.FOUR_THIRD_PAIRS,
      finalistId: "ftp",
      p19Level: 3,
      primaryP20Levels: [1, 1],
      rankingTuple: makeRankingTuple({ worstPrimaryCombined: 1, p20Dev: 7, familyRank: 3 }),
    });
    const side = makeResult({
      familyId: FAMILY_IDS.RP22_D,
      finalistId: "d",
      p19Level: 4,
      primaryP20Levels: [1, 1],
      rankingTuple: makeRankingTuple({ worstPrimaryCombined: 1, p20Dev: 6, familyRank: 4 }),
    });
    const ranked = [side, frontRear];
    const alts = selectQualifyingAlternatives(ranked, frontRear);
    assert.equal(alts.length, 1, "side with P19 L3->L4 qualifies");
    assert.equal(alts[0].familyId, FAMILY_IDS.RP22_D);
  });

  it("does NOT qualify a side/mixed alternative when P19 regresses even if Primary P20 improves", () => {
    const frontRear = makeResult({
      familyId: FAMILY_IDS.FOUR_THIRD_PAIRS,
      finalistId: "ftp",
      p19Level: 4,
      primaryP20Levels: [1, 1],
      rankingTuple: makeRankingTuple({ worstPrimaryCombined: 1, p20Dev: 7, familyRank: 3 }),
    });
    const side = makeResult({
      familyId: FAMILY_IDS.RP22_D,
      finalistId: "d",
      p19Level: 3, // P19 regressed
      primaryP20Levels: [2, 2],
      rankingTuple: makeRankingTuple({ worstPrimaryCombined: 2, p20Dev: 3.5, familyRank: 4 }),
    });
    const ranked = [side, frontRear];
    const alts = selectQualifyingAlternatives(ranked, frontRear);
    assert.equal(alts.length, 0, "P19 regression blocks the alternative");
  });

  it("does NOT qualify a side/mixed alternative with only a Secondary P20 Level improvement", () => {
    const frontRear = makeResult({
      familyId: FAMILY_IDS.FOUR_THIRD_PAIRS,
      finalistId: "ftp",
      p19Level: 4,
      primaryP20Levels: [1, 1],
      secondaryP20Levels: [1],
      rankingTuple: makeRankingTuple({ worstPrimaryCombined: 1, p20Dev: 7, familyRank: 3 }),
    });
    const bMixed = makeResult({
      familyId: FAMILY_IDS.RP22_B_LAST_RESORT,
      finalistId: "b",
      p19Level: 4,
      primaryP20Levels: [1, 1],
      secondaryP20Levels: [2],
      rankingTuple: makeRankingTuple({ worstPrimaryCombined: 1, p20Dev: 6, familyRank: 99 }),
    });
    const ranked = [bMixed, frontRear];
    const alts = selectQualifyingAlternatives(ranked, frontRear);
    assert.equal(alts.length, 0, "Secondary-only Level improvement must not qualify");
  });

  it("does NOT qualify when both remain the same Level (numerical-only improvement)", () => {
    const frontRear = makeResult({
      familyId: FAMILY_IDS.FOUR_THIRD_PAIRS,
      finalistId: "ftp",
      p19Level: 4,
      primaryP20Levels: [1, 1],
      rankingTuple: makeRankingTuple({ worstPrimaryCombined: 1, p20Dev: 7, familyRank: 3 }),
    });
    const side = makeResult({
      familyId: FAMILY_IDS.RP22_D,
      finalistId: "d",
      p19Level: 4,
      primaryP20Levels: [1, 1],
      rankingTuple: makeRankingTuple({ worstPrimaryCombined: 1, p20Dev: 6, familyRank: 4 }),
    });
    const ranked = [side, frontRear];
    const alts = selectQualifyingAlternatives(ranked, frontRear);
    assert.equal(alts.length, 0, "same-Level numerical improvement must not qualify");
  });

  it("excludes the practical best and conventional candidates from alternatives", () => {
    const frontRear = makeResult({
      familyId: FAMILY_IDS.FOUR_THIRD_PAIRS,
      finalistId: "ftp",
      p19Level: 4,
      primaryP20Levels: [1, 1],
      rankingTuple: makeRankingTuple({ worstPrimaryCombined: 1, p20Dev: 7, familyRank: 3 }),
    });
    const side = makeResult({
      familyId: FAMILY_IDS.RP22_D,
      finalistId: "d",
      p19Level: 4,
      primaryP20Levels: [2, 2],
      rankingTuple: makeRankingTuple({ worstPrimaryCombined: 2, p20Dev: 3.5, familyRank: 4 }),
    });
    const ranked = [side, frontRear];
    const alts = selectQualifyingAlternatives(ranked, frontRear);
    assert.equal(alts.length, 1);
    assert.notEqual(alts[0].finalistId, "ftp", "practical best excluded");
    assert.ok(isSideOrMixedWallFamily(alts[0].familyId), "only side/mixed families qualify");
  });

  it("deduplicates by finalistId and preserves ranked order (best first)", () => {
    const frontRear = makeResult({
      familyId: FAMILY_IDS.FOUR_THIRD_PAIRS,
      finalistId: "ftp",
      p19Level: 3,
      primaryP20Levels: [1, 1],
      rankingTuple: makeRankingTuple({ worstPrimaryCombined: 1, p20Dev: 7, familyRank: 3 }),
    });
    const side1 = makeResult({
      familyId: FAMILY_IDS.RP22_D,
      finalistId: "d",
      p19Level: 4,
      primaryP20Levels: [1, 1],
      rankingTuple: makeRankingTuple({ worstPrimaryCombined: 1, p20Dev: 4, familyRank: 4 }),
    });
    const side1Dup = makeResult({
      familyId: FAMILY_IDS.RP22_D,
      finalistId: "d",
      p19Level: 4,
      primaryP20Levels: [1, 1],
      rankingTuple: makeRankingTuple({ worstPrimaryCombined: 1, p20Dev: 4, familyRank: 4 }),
    });
    const side2 = makeResult({
      familyId: FAMILY_IDS.RP22_G,
      finalistId: "g",
      p19Level: 4,
      primaryP20Levels: [2, 2],
      rankingTuple: makeRankingTuple({ worstPrimaryCombined: 2, p20Dev: 3, familyRank: 8 }),
    });
    const ranked = [side1, side1Dup, side2, frontRear];
    const alts = selectQualifyingAlternatives(ranked, frontRear);
    assert.equal(alts.length, 2, "duplicate finalistId deduped");
    assert.equal(alts[0].finalistId, "d", "ranked order preserved (best first)");
    assert.equal(alts[1].finalistId, "g");
  });

  it("returns no alternatives when the practical best is itself side/mixed (no front/rear fallback)", () => {
    const side1 = makeResult({
      familyId: FAMILY_IDS.RP22_D,
      finalistId: "d1",
      p19Level: 4,
      primaryP20Levels: [2, 2],
      rankingTuple: makeRankingTuple({ worstPrimaryCombined: 2, p20Dev: 3.5, familyRank: 4 }),
    });
    const side2 = makeResult({
      familyId: FAMILY_IDS.RP22_G,
      finalistId: "g1",
      p19Level: 3,
      primaryP20Levels: [2, 2],
      rankingTuple: makeRankingTuple({ worstPrimaryCombined: 2, p20Dev: 4, familyRank: 8 }),
    });
    const ranked = [side1, side2];
    // No front/rear practical — side1 is the fallback practical best.
    const practical = selectPracticalBest(ranked);
    const alts = selectQualifyingAlternatives(ranked, practical);
    // side2 has a P19 regression (L3 < L4), so it does not qualify.
    assert.equal(alts.length, 0);
  });

  it("returns an empty array for an empty ranked list", () => {
    assert.deepEqual(selectQualifyingAlternatives([], null), []);
  });

  // ── Screenshot acceptance cases ───────────────────────────────────────
  it("SCREENSHOT CASE 1: mixed-wall alt with Primary P20 L1→L2 (P19 L4=L4, Secondary L1=L1) qualifies", () => {
    const frontRear = makeResult({
      familyId: FAMILY_IDS.FOUR_THIRD_PAIRS,
      finalistId: "ftp",
      p19Level: 4,
      primaryP20Levels: [1, 1],
      secondaryP20Levels: [1],
      rankingTuple: makeRankingTuple({ worstPrimaryCombined: 1, p20Dev: 7.5, familyRank: 3 }),
    });
    const mixedAlt = makeResult({
      familyId: FAMILY_IDS.RP22_B_LAST_RESORT,
      finalistId: "b",
      p19Level: 4,
      primaryP20Levels: [2, 2],
      secondaryP20Levels: [1],
      rankingTuple: makeRankingTuple({ worstPrimaryCombined: 2, p20Dev: 3.5, familyRank: 99 }),
    });
    const ranked = [mixedAlt, frontRear];
    const practical = selectPracticalBest(ranked);
    assert.equal(practical.familyId, FAMILY_IDS.FOUR_THIRD_PAIRS, "front/rear remains the recommendation");
    const alts = selectQualifyingAlternatives(ranked, practical);
    assert.equal(alts.length, 1, "mixed-wall alternative remains visible — Primary P20 improved by one Level");
    assert.equal(alts[0].familyId, FAMILY_IDS.RP22_B_LAST_RESORT);
  });

  it("SCREENSHOT CASE 2: both P20 L1 despite a large numerical deviation reduction → alternative must NOT appear", () => {
    const frontRear = makeResult({
      familyId: FAMILY_IDS.FOUR_THIRD_PAIRS,
      finalistId: "ftp",
      p19Level: 4,
      primaryP20Levels: [1, 1],
      secondaryP20Levels: [1],
      rankingTuple: makeRankingTuple({ worstPrimaryCombined: 1, p20Dev: 7.5, familyRank: 3 }),
    });
    const mixedAlt = makeResult({
      familyId: FAMILY_IDS.RP22_D,
      finalistId: "d",
      p19Level: 4,
      primaryP20Levels: [1, 1], // same Level L1 despite a large numerical reduction
      secondaryP20Levels: [1],
      rankingTuple: makeRankingTuple({ worstPrimaryCombined: 1, p20Dev: 0.5, familyRank: 4 }),
    });
    const ranked = [mixedAlt, frontRear];
    const practical = selectPracticalBest(ranked);
    assert.equal(practical.familyId, FAMILY_IDS.FOUR_THIRD_PAIRS);
    const alts = selectQualifyingAlternatives(ranked, practical);
    assert.equal(alts.length, 0, "numerical-only gain at the same Level must not surface an alternative");
  });
});