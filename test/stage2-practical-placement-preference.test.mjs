// stage2-practical-placement-preference.test.mjs
// Focused regression tests for the practical placement preference at the
// final recommendation selection boundary.
//
// The confirmed six-seat case:
//   FOUR_THIRD_PAIRS (front/rear): P19 L4 / 0.665 dB, P20 Primary L1 / 7.584 dB
//   RP22_B_LAST_RESORT (mixed):   P19 L4 / 1.384 dB, P20 Primary L1 / 6.725 dB,
//                                                       P20 Secondary L2 / 4.518 dB
// B wins the acoustic ranking on floored Primary deviation (6 < 7 dB) even
// though both remain Primary P20 Level 1. The practical preference must
// select FOUR_THIRD_PAIRS as the default four-sub recommendation.
//
// Exception paths:
//   - Whole Primary P20 Level improvement (L1 -> L2) -> side/mixed may win.
//   - Whole P19 RSP Level improvement (L3 -> L4) -> side/mixed may win.
//   - Secondary-only Level improvement -> front/rear still wins.
//   - No viable front/rear -> existing acoustic winner stands.
//   - Confirmed shared-null resolution -> side/mixed may win.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { selectPracticalBest, isSideOrMixedWallFamily } from "../src/components/room/bass/stage2/stage2PracticalPlacementPreference.js";
import { FAMILY_IDS } from "../src/components/room/bass/stage1/stage1FamilyRegistry.js";

// ── Helpers ─────────────────────────────────────────────────────────────

// Build a ranking tuple matching stage2Ranking.buildStage2RankingTuple.
// Tuple fields used by compareStage2Results:
//   [0] -totalFailingSeats, [1] worstPrimaryCombined, [2] primaryL4Count,
//   [3] primaryL3PlusCount, [4] -worstPrimaryP19Deviation, [5] -worstPrimaryP20Deviation,
//   ... [12] -familyRank, [16] coordKey
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

describe("Practical Placement Preference — confirmed six-seat case", () => {
  it("selects FOUR_THIRD_PAIRS over B_LAST_RESORT when both remain Primary P20 L1", () => {
    // B ranks higher acoustically: floored Primary P20 deviation 6 < 7 dB.
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
    // Acoustic ranking puts B first (floored 6 < 7).
    const ranked = [bMixed, frontRear];
    const best = selectPracticalBest(ranked);
    assert.equal(best.familyId, FAMILY_IDS.FOUR_THIRD_PAIRS, "FOUR_THIRD_PAIRS must be the default recommendation");
    assert.notEqual(best.familyId, FAMILY_IDS.RP22_B_LAST_RESORT, "B must not win solely on its 0.86 dB Primary advantage");
  });
});

describe("Practical Placement Preference — exceptions", () => {
  it("side/mixed wins with a whole Primary P20 Level improvement (L1 -> L2) and no P19 regression", () => {
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
    const ranked = [side, frontRear]; // side ranks higher acoustically
    const best = selectPracticalBest(ranked);
    assert.equal(best.familyId, FAMILY_IDS.RP22_D, "Side-wall with whole Primary P20 L1->L2 improvement may displace front/rear");
  });

  it("side/mixed wins with a whole P19 RSP Level improvement (L3 -> L4) and no Primary P20 regression", () => {
    // Side ranks higher acoustically on floored Primary P20 deviation (6 < 7),
    // both remain Primary P20 L1. Side also has a whole P19 RSP L3->L4
    // improvement — a compelling benefit that may justify side-wall installation.
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
    assert.equal(best.familyId, FAMILY_IDS.RP22_D, "Side-wall with whole P19 L3->L4 improvement may displace front/rear");
  });

  it("front/rear wins when side/mixed has only a Secondary P20 Level improvement", () => {
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
    const best = selectPracticalBest(ranked);
    assert.equal(best.familyId, FAMILY_IDS.FOUR_THIRD_PAIRS, "Secondary-only Level improvement must not override front/rear");
  });

  it("front/rear wins when side/mixed P19 regresses even if Primary P20 improves", () => {
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
    const best = selectPracticalBest(ranked);
    assert.equal(best.familyId, FAMILY_IDS.FOUR_THIRD_PAIRS, "P19 regression must block the Primary P20 exception");
  });

  it("falls back to acoustic winner when no viable front/rear candidate exists", () => {
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
    const ranked = [frontRear, side]; // conventional ranks higher
    const best = selectPracticalBest(ranked);
    assert.equal(best.familyId, FAMILY_IDS.FOUR_THIRD_PAIRS);
  });

  it("returns null for an empty ranked list", () => {
    assert.equal(selectPracticalBest([]), null);
  });
});

describe("Practical Placement Preference — shared-null exception", () => {
  it("side/mixed wins when conventional has a confirmed shared null and side/mixed does not", () => {
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
    // Both remain Primary P20 L1 and P19 L4 — no Level improvement. The only
    // path to the exception is the confirmed shared-null resolution.
    const confirmedRaw = {
      rspRawCurve: [
        { frequency: 30, spl: 90 }, { frequency: 40, spl: 70 }, { frequency: 50, spl: 90 },
      ],
      perSeatRawCurves: [
        { seatId: "p1", responseData: [{ frequency: 30, spl: 90 }, { frequency: 40, spl: 68 }, { frequency: 50, spl: 90 }] },
        { seatId: "p2", responseData: [{ frequency: 30, spl: 90 }, { frequency: 40, spl: 69 }, { frequency: 50, spl: 90 }] },
      ],
    };
    const cleanRaw = {
      rspRawCurve: [{ frequency: 30, spl: 90 }, { frequency: 40, spl: 88 }, { frequency: 50, spl: 90 }],
      perSeatRawCurves: [
        { seatId: "p1", responseData: [{ frequency: 30, spl: 90 }, { frequency: 40, spl: 87 }, { frequency: 50, spl: 90 }] },
        { seatId: "p2", responseData: [{ frequency: 30, spl: 90 }, { frequency: 45, spl: 85 }, { frequency: 50, spl: 90 }] },
      ],
    };
    const getRawTransfer = (result) => (result.finalistId === "ftp" ? confirmedRaw : cleanRaw);
    const ranked = [side, frontRear];
    const best = selectPracticalBest(ranked, { getRawTransfer });
    assert.equal(best.familyId, FAMILY_IDS.RP22_D, "Resolving a confirmed shared null is a compelling benefit");
  });

  it("front/rear wins when no raw transfers are available (shared-null best-effort)", () => {
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
    const best = selectPracticalBest(ranked); // no getRawTransfer
    assert.equal(best.familyId, FAMILY_IDS.FOUR_THIRD_PAIRS, "Without shared-null evidence, default to front/rear");
  });
});