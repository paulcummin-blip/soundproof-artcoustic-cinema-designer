// stage1-physical-arrangement-dedup.test.mjs
// Regression suite for physical-arrangement deduplication of Stage 1 finalists.
//
// Validates the acceptance conditions:
//   - Zero duplicate physical finalist slots.
//   - Stable ranking under candidate shuffling (engine flow: shuffle → sort → dedup).
//   - Up to five genuinely distinct finalists per quantity where enough valid
//     candidates exist.
//   - No valid distinct candidate is accidentally merged.
//
// Run: node --import ./test/_alias-register.mjs --test src/test/stage1-physical-arrangement-dedup.test.mjs

import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPhysicalArrangementFingerprint,
  dedupeByPhysicalArrangement,
} from "../components/room/bass/stage1/stage1PhysicalArrangementFingerprint.js";
import {
  compareScreeningResults,
} from "../components/room/bass/stage1/stage1Screening.js";
import {
  STAGE1_FINALIST_COUNT,
} from "../components/room/bass/stage1/stage1Constants.js";
import {
  generateStage1Candidates,
} from "../components/room/bass/stage1/stage1CandidateGenerator.js";

// ---------------------------------------------------------------------------
// Helpers

function mkCandidate(id, familyId, sources, screening = {}) {
  return {
    id,
    familyId,
    sources: sources.map((s) => ({ xNorm: s[0], yNorm: s[1] })),
    screening: {
      primarySevereProblemCount: 0,
      worstPrimarySpatialVariation: 0,
      primaryResponseSmoothness: 0,
      primaryRspCoherence: 0,
      secondarySpatialConsistency: 0,
      efficiencyIndicator: 0,
      familyPreferenceRank: 0,
      ...screening,
    },
  };
}

function fullScreening(overrides = {}) {
  return {
    primarySevereProblemCount: 0,
    worstPrimarySpatialVariation: 0,
    primaryResponseSmoothness: 0,
    primaryRspCoherence: 0,
    secondarySpatialConsistency: 0,
    efficiencyIndicator: 0,
    familyPreferenceRank: 0,
    ...overrides,
  };
}

function shuffle(arr, seed) {
  const out = [...arr];
  let s = seed % 100000;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Engine flow: generate (any order) → sort → dedup. Shuffling the input then
// re-sorting must yield the same deduped output.
function sortDedupe(candidates) {
  return dedupeByPhysicalArrangement([...candidates].sort(compareScreeningResults));
}

// ---------------------------------------------------------------------------
// Fingerprint contract
// ---------------------------------------------------------------------------

test.describe("physical-arrangement fingerprint", () => {
  test.it("is invariant under source permutation (identical subwoofers)", () => {
    const a = mkCandidate("a", "FAM_A", [[0.25, 0], [0.75, 0]]);
    const b = mkCandidate("b", "FAM_B", [[0.75, 0], [0.25, 0]]);
    assert.equal(buildPhysicalArrangementFingerprint(a), buildPhysicalArrangementFingerprint(b));
  });

  test.it("distinguishes different cabinet centres", () => {
    const a = mkCandidate("a", "FAM_A", [[0.25, 0], [0.75, 0]]);
    const b = mkCandidate("b", "FAM_B", [[0.30, 0], [0.70, 0]]);
    assert.notEqual(buildPhysicalArrangementFingerprint(a), buildPhysicalArrangementFingerprint(b));
  });

  test.it("distinguishes different quantities", () => {
    const two = mkCandidate("two", "FAM_A", [[0.25, 0], [0.75, 0]]);
    const four = mkCandidate("four", "FAM_A", [[0.25, 0], [0.75, 0], [0.25, 1], [0.75, 1]]);
    assert.notEqual(buildPhysicalArrangementFingerprint(two), buildPhysicalArrangementFingerprint(four));
  });

  test.it("collapses different family names at the same physical arrangement", () => {
    const cFront = mkCandidate("cfront", "C_FRONT_PAIR", [[0.25, 0], [0.75, 0]]);
    const frontThird = mkCandidate("frontthird", "FRONT_THIRD_PAIR", [[0.25, 0], [0.75, 0]]);
    assert.equal(buildPhysicalArrangementFingerprint(cFront), buildPhysicalArrangementFingerprint(frontThird));
  });

  test.it("distinguishes arrangements that differ only by orientation/height when present", () => {
    const a = { id: "a", familyId: "F", sources: [{ xNorm: 0.25, yNorm: 0, orientation: "horizontal", heightM: 0.2 }] };
    const b = { id: "b", familyId: "F", sources: [{ xNorm: 0.25, yNorm: 0, orientation: "vertical", heightM: 0.2 }] };
    assert.notEqual(buildPhysicalArrangementFingerprint(a), buildPhysicalArrangementFingerprint(b));
  });

  test.it("ignores absent optional fields (Stage 1 point sources)", () => {
    const a = mkCandidate("a", "F", [[0.25, 0]]);
    const b = { id: "b", familyId: "F", sources: [{ xNorm: 0.25, yNorm: 0 }] };
    assert.equal(buildPhysicalArrangementFingerprint(a), buildPhysicalArrangementFingerprint(b));
  });

  test.it("rounds to generator precision (0.001) without merging distinct positions", () => {
    const a = mkCandidate("a", "F", [[0.25, 0], [0.75, 0]]);
    const b = mkCandidate("b", "F", [[0.2504, 0], [0.75, 0]]);
    assert.equal(buildPhysicalArrangementFingerprint(a), buildPhysicalArrangementFingerprint(b));
    const c = mkCandidate("c", "F", [[0.255, 0], [0.75, 0]]);
    assert.notEqual(buildPhysicalArrangementFingerprint(a), buildPhysicalArrangementFingerprint(c));
  });
});

// ---------------------------------------------------------------------------
// Dedup contract
// ---------------------------------------------------------------------------

test.describe("dedupeByPhysicalArrangement", () => {
  test.it("keeps the highest-ranked representative of each physical arrangement", () => {
    // Two physically identical candidates; the better-ranked one must win.
    // Identical sources produce identical screening, so they tie and the id
    // tie-break orders them — the first in ranked order is kept.
    const better = mkCandidate("better", "C_FRONT_PAIR", [[0.25, 0], [0.75, 0]],
      fullScreening({ worstPrimarySpatialVariation: 0.1 }));
    const worse = mkCandidate("worse", "FRONT_THIRD_PAIR", [[0.25, 0], [0.75, 0]],
      fullScreening({ worstPrimarySpatialVariation: 0.5 }));
    const ranked = [...[better, worse].sort(compareScreeningResults)];
    const deduped = dedupeByPhysicalArrangement(ranked);
    assert.equal(deduped.length, 1);
    assert.equal(deduped[0].id, "better");
  });

  test.it("preserves deduped set under input shuffling (engine flow: shuffle → sort → dedup)", () => {
    const candidates = [];
    for (let i = 0; i < 12; i++) {
      candidates.push(mkCandidate(`c${i}`, `FAM_${i % 3}`, [[0.1 * i, 0], [0.1 * i + 0.3, 0]],
        fullScreening({ worstPrimarySpatialVariation: 0.01 * i, efficiencyIndicator: 80 + i })));
    }
    // Inject physical duplicates with different family names (identical sources
    // → identical screening → tie → id tie-break makes the order deterministic).
    candidates.push(mkCandidate("dup0", "FAM_DUP", [[0.0, 0], [0.3, 0]]));
    candidates.push(mkCandidate("dup1", "FAM_DUP2", [[0.1, 0], [0.4, 0]]));

    const baseline = sortDedupe(candidates).map((c) => c.id).join(",");
    for (let seed = 1; seed <= 50; seed++) {
      const shuffled = shuffle(candidates, seed);
      const ids = sortDedupe(shuffled).map((c) => c.id).join(",");
      assert.equal(ids, baseline, `dedup set changed under shuffle seed ${seed}`);
    }
  });

  test.it("does not merge genuinely distinct arrangements", () => {
    const a = mkCandidate("a", "F", [[0.25, 0], [0.75, 0]]);
    const b = mkCandidate("b", "F", [[0.30, 0], [0.70, 0]]);
    const c = mkCandidate("c", "F", [[0.25, 1], [0.75, 1]]);
    const d = mkCandidate("d", "F", [[0.25, 0], [0.75, 0]]); // duplicate of a
    const deduped = sortDedupe([a, b, c, d]);
    assert.equal(deduped.length, 3, "a/d collapse; b and c stay distinct");
    const ids = deduped.map((x) => x.id).sort();
    assert.ok(ids.includes("a") || ids.includes("d"));
    assert.ok(ids.includes("b"));
    assert.ok(ids.includes("c"));
  });
});

// ---------------------------------------------------------------------------
// Replay Room A / B / C: real generated candidates
// ---------------------------------------------------------------------------

function evaluatedCoarse(quantity) {
  const { candidates } = generateStage1Candidates(quantity);
  // Attach neutral screening. Real metrics differ per transfer, but identical
  // sources always yield identical screening, so neutral screening faithfully
  // surfaces every physical duplicate the dedup must collapse.
  return candidates.map((c) => ({ ...c, screening: fullScreening({ familyPreferenceRank: 0 }) }));
}

test.describe("Replay Room A / B / C — generated candidates", () => {
  test.it("every quantity yields zero duplicate physical arrangements after dedup", () => {
    for (const quantity of [1, 2, 3, 4]) {
      const deduped = sortDedupe(evaluatedCoarse(quantity));
      const fps = new Set();
      for (const c of deduped) {
        const fp = buildPhysicalArrangementFingerprint(c);
        assert.ok(!fps.has(fp), `quantity ${quantity}: duplicate fingerprint ${fp} survived dedup`);
        fps.add(fp);
      }
    }
  });

  test.it("shortlist (top STAGE1_FINALIST_COUNT) has zero duplicate physical arrangements", () => {
    for (const quantity of [1, 2, 3, 4]) {
      const deduped = sortDedupe(evaluatedCoarse(quantity));
      const limit = STAGE1_FINALIST_COUNT[quantity] || 5;
      const finalists = deduped.slice(0, limit);
      const fps = new Set();
      for (const c of finalists) {
        const fp = buildPhysicalArrangementFingerprint(c);
        assert.ok(!fps.has(fp), `quantity ${quantity}: duplicate finalist ${fp}`);
        fps.add(fp);
      }
    }
  });

  test.it("Room C proxy (quantity 4): RP22_C q=0.20 and FOUR_SYMMETRIC_BOUNDARY_CUSTOM collapse", () => {
    // Known cross-family physical duplicate in the coarse pool: RP22_C at
    // q=0.20 places (0.20,0)(0.80,0)(0.20,1)(0.80,1) — exactly the FOUR
    // SYMMETRIC_BOUNDARY_CUSTOM fallback arrangement.
    const evaluated = evaluatedCoarse(4);
    const rp22c = evaluated.find((c) =>
      c.familyId === "RP22_C" && c.sources[0].xNorm === 0.2);
    const fourSym = evaluated.find((c) => c.familyId === "FOUR_SYMMETRIC_BOUNDARY_CUSTOM");
    assert.ok(rp22c, "RP22_C q=0.20 present in coarse pool");
    assert.ok(fourSym, "FOUR_SYMMETRIC_BOUNDARY_CUSTOM present in coarse pool");
    assert.equal(
      buildPhysicalArrangementFingerprint(rp22c),
      buildPhysicalArrangementFingerprint(fourSym),
      "RP22_C q=0.20 and FOUR_SYMMETRIC_BOUNDARY_CUSTOM must be physical duplicates",
    );
    const deduped = sortDedupe(evaluated);
    const survived = deduped.filter((c) =>
      buildPhysicalArrangementFingerprint(c) === buildPhysicalArrangementFingerprint(rp22c));
    assert.equal(survived.length, 1, "exactly one representative of the duplicate arrangement survives");
  });

  test.it("coarse+fine cross-family duplicate collapses (Room A proxy, quantity 2)", () => {
    // The Room A duplicates arise when a fine-search candidate from one family
    // lands on the same coordinates as a coarse candidate from another family.
    // Construct that scenario explicitly: C_FRONT_PAIR fine q=0.23 and
    // FRONT_THIRD_PAIR coarse q=0.23 both place (0.23,0)&(0.77,0).
    const coarseFrontThird = mkCandidate("FRONT_THIRD_PAIR:0.23_0|0.77_0", "FRONT_THIRD_PAIR", [[0.23, 0], [0.77, 0]]);
    const fineCFront = mkCandidate("C_FRONT_PAIR:0.23_0|0.77_0", "C_FRONT_PAIR", [[0.23, 0], [0.77, 0]]);
    const deduped = sortDedupe([coarseFrontThird, fineCFront]);
    assert.equal(deduped.length, 1, "coarse+fine cross-family duplicate must collapse to one");
  });

  test.it("up to five genuinely distinct finalists per quantity", () => {
    for (const quantity of [1, 2, 3, 4]) {
      const deduped = sortDedupe(evaluatedCoarse(quantity));
      const limit = STAGE1_FINALIST_COUNT[quantity] || 5;
      const finalists = deduped.slice(0, limit);
      assert.ok(finalists.length <= limit, `quantity ${quantity}: finalist count exceeds limit`);
      assert.ok(finalists.length >= 1, `quantity ${quantity}: at least one finalist`);
    }
  });

  test.it("no valid distinct candidate is accidentally merged (distinct survive)", () => {
    for (const quantity of [1, 2, 3, 4]) {
      const evaluated = evaluatedCoarse(quantity);
      const distinctInPool = new Set(evaluated.map(buildPhysicalArrangementFingerprint));
      const deduped = sortDedupe(evaluated);
      const distinctInDedup = new Set(deduped.map(buildPhysicalArrangementFingerprint));
      assert.equal(distinctInDedup.size, distinctInPool.size,
        `quantity ${quantity}: dedup dropped a distinct arrangement`);
    }
  });

  test.it("deterministic: shuffling evaluated candidates does not change the deduped set", () => {
    for (const quantity of [1, 2, 3, 4]) {
      const evaluated = evaluatedCoarse(quantity);
      const baseline = sortDedupe(evaluated).map((c) => c.id).sort().join(",");
      for (let seed = 1; seed <= 20; seed++) {
        const shuffled = shuffle(evaluated, seed);
        const ids = sortDedupe(shuffled).map((c) => c.id).sort().join(",");
        assert.equal(ids, baseline, `quantity ${quantity}: deduped set changed under shuffle seed ${seed}`);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Before/after finalist counts (Room A / B / C proxy)
// ---------------------------------------------------------------------------

test.describe("before/after finalist counts", () => {
  function shortlistOldWay(ranked, limit) {
    // Replicates the family-diversity first pass from selectFinalists, on the
    // pre-dedup pool — the behaviour that allowed physical duplicates in.
    const finalists = [];
    const familiesSeen = new Set();
    for (const candidate of ranked) {
      if (finalists.length >= limit) break;
      if (!familiesSeen.has(candidate.familyId)) {
        finalists.push(candidate);
        familiesSeen.add(candidate.familyId);
      }
    }
    return finalists.slice(0, limit);
  }

  function countDuplicates(finalists) {
    const fps = new Map();
    let dupes = 0;
    for (const c of finalists) {
      const fp = buildPhysicalArrangementFingerprint(c);
      if (fps.has(fp)) dupes += 1;
      else fps.set(fp, true);
    }
    return dupes;
  }

  function countsFor(quantity) {
    const evaluated = evaluatedCoarse(quantity);
    const ranked = [...evaluated].sort(compareScreeningResults);
    const limit = STAGE1_FINALIST_COUNT[quantity] || 5;

    // BEFORE: duplicate physical arrangements present in the FULL ranked
    // pool (the defect — duplicates here can steal finalist slots under the
    // old family-diversity shortlist).
    const dupesInPool = countDuplicates(ranked);
    // AFTER: physical dedup, then the shortlist.
    const deduped = sortDedupe(evaluated);
    const afterFinalists = deduped.slice(0, limit);

    return {
      poolSize: ranked.length,
      dedupedSize: deduped.length,
      after: afterFinalists.length,
      dupesInPool,
      dupesAfter: countDuplicates(afterFinalists),
      dupesInDedup: countDuplicates(deduped),
    };
  }

  test.it("Room A proxy (quantity 2): after has zero duplicates, <= 5 finalists", () => {
    const r = countsFor(2);
    assert.equal(r.dupesInDedup, 0, `deduped pool still has duplicates: ${r.dupesInDedup}`);
    assert.equal(r.dupesAfter, 0, `after dupes: ${r.dupesAfter}`);
    assert.ok(r.after <= 5, `after finalists <= 5: ${r.after}`);
    assert.equal(r.dedupedSize, r.poolSize - r.dupesInPool, "dedup removed exactly the duplicates");
  });

  test.it("Room B proxy (quantity 4): RP22_C/FOUR_SYMMETRIC duplicate removed, after zero", () => {
    const r = countsFor(4);
    assert.ok(r.dupesInPool >= 1, `quantity 4: expected the RP22_C/FOUR_SYMMETRIC duplicate in the pool, got ${r.dupesInPool}`);
    assert.equal(r.dupesInDedup, 0, `deduped pool still has duplicates: ${r.dupesInDedup}`);
    assert.equal(r.dupesAfter, 0, `after dupes: ${r.dupesAfter}`);
    assert.ok(r.after <= 5, `after finalists <= 5: ${r.after}`);
    assert.equal(r.dedupedSize, r.poolSize - r.dupesInPool, "dedup removed exactly the duplicates");
  });

  test.it("Room C proxy (quantity 3): after has zero duplicates, <= 5 finalists", () => {
    const r = countsFor(3);
    assert.equal(r.dupesInDedup, 0, `deduped pool still has duplicates: ${r.dupesInDedup}`);
    assert.equal(r.dupesAfter, 0, `after dupes: ${r.dupesAfter}`);
    assert.ok(r.after <= 5, `after finalists <= 5: ${r.after}`);
  });

  test.it("single-sub (quantity 1): after has zero duplicates", () => {
    const r = countsFor(1);
    assert.equal(r.dupesAfter, 0, `after dupes: ${r.dupesAfter}`);
    assert.equal(r.dupesInDedup, 0, `deduped pool still has duplicates: ${r.dupesInDedup}`);
  });
});