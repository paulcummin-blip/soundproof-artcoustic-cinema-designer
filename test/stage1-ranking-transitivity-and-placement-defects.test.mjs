// stage1-ranking-transitivity-and-placement-defects.test.mjs
// Regression suite for the three confirmed ADI subwoofer placement defects:
//
//   1. Non-transitive Stage 1 candidate ordering (circular preferences +
//      generation-order dependence).
//   2. Incorrect wall-reference coordinate handoff (inset positions rejected
//      as malformed wall references).
//   3. Missing cabinet-to-cabinet overlap rejection (physically impossible
//      overlapping cabinets passed into the recommendation shortlist).
//
// Run: node --import ./test/_alias-register.mjs --test test/stage1-ranking-transitivity-and-placement-defects.test.mjs

import test from "node:test";
import assert from "node:assert/strict";

import {
  compareScreeningResults,
  buildScreeningSortKey,
} from "../src/components/room/bass/stage1/stage1Screening.js";
import {
  isWallReferencePoint,
  resolveCabinetCentre,
  validateCabinetOverlap,
  COORDINATE_SPACE,
} from "../src/components/room/bass/stage2/installableWallCentreAuthority.js";

// ---------------------------------------------------------------------------
// Helpers

function mkCandidate(id, screening, familyId = "X") {
  return { id, familyId, sources: [], screening };
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

function rankedIds(candidates) {
  return [...candidates].sort(compareScreeningResults).map((c) => c.id);
}

// ---------------------------------------------------------------------------
// Defect 1: transitive, deterministic Stage 1 ranking
// ---------------------------------------------------------------------------

test.describe("Defect 1: Stage 1 ranking is transitive and deterministic", () => {
  test.it("produces no circular preferences on a tolerance-band edge case", () => {
    // Three candidates whose spatial-variation values sit one tolerance apart
    // (0, 0.15, 0.30 with tol 0.15). The OLD pairwise comparator produced:
    //   A~B (within tol), B~C (within tol), A vs C (0.30 > 0.15 → A wins)
    // and then fell through to family preference, creating a cycle.
    // The banded-key comparator must produce a total order.
    const A = mkCandidate("A", fullScreening({
      worstPrimarySpatialVariation: 0.0,
      familyPreferenceRank: 5,
    }));
    const B = mkCandidate("B", fullScreening({
      worstPrimarySpatialVariation: 0.15,
      familyPreferenceRank: 3,
    }));
    const C = mkCandidate("C", fullScreening({
      worstPrimarySpatialVariation: 0.30,
      familyPreferenceRank: 1,
    }));

    const pairs = [[A, B], [B, C], [A, C]];
    for (const [x, y] of pairs) {
      const xy = compareScreeningResults(x, y);
      const yx = compareScreeningResults(y, x);
      // Antisymmetry: reversing arguments must negate the result.
      assert.ok(Math.sign(xy) === -Math.sign(yx), `antisymmetry failed for ${x.id} vs ${y.id}`);
    }

    // Transitivity: if A <= B and B <= C then A <= C (no cycle).
    const ab = compareScreeningResults(A, B);
    const bc = compareScreeningResults(B, C);
    const ac = compareScreeningResults(A, C);
    const cyclicViaB = ab <= 0 && bc <= 0 && ac > 0;
    const cyclicViaC = ab >= 0 && bc >= 0 && ac < 0;
    assert.ok(!cyclicViaB && !cyclicViaC, "circular preference detected");
  });

  test.it("shuffling candidate input does not change the final ranking", () => {
    // 20 candidates with distinct metrics. Repeated shuffles must produce the
    // same sorted order.
    const candidates = [];
    for (let i = 0; i < 20; i++) {
      candidates.push(mkCandidate(`c${i}`, fullScreening({
        primarySevereProblemCount: i % 3,
        worstPrimarySpatialVariation: (i * 0.07) % 0.6,
        primaryResponseSmoothness: -((i * 0.05) % 0.4),
        primaryRspCoherence: -((i * 0.03) % 0.3),
        secondarySpatialConsistency: (i * 0.02) % 0.2,
        efficiencyIndicator: 80 + (i % 5),
        familyPreferenceRank: i % 4,
      })));
    }

    const baseline = rankedIds(candidates);
    for (let seed = 1; seed <= 50; seed++) {
      const shuffled = shuffle(candidates, seed);
      const order = rankedIds(shuffled);
      assert.deepEqual(order, baseline, `ranking changed under shuffle seed ${seed}`);
    }
  });

  test.it("reversing candidate input does not change the final ranking", () => {
    const candidates = [];
    for (let i = 0; i < 12; i++) {
      candidates.push(mkCandidate(`r${i}`, fullScreening({
        worstPrimarySpatialVariation: i * 0.04,
        efficiencyIndicator: 70 + i,
      })));
    }
    const baseline = rankedIds(candidates);
    const reversed = rankedIds([...candidates].reverse());
    assert.deepEqual(reversed, baseline, "reversing input changed ranking");
  });

  test.it("no NaN comparisons: missing screening fields do not poison the order", () => {
    const A = mkCandidate("A", fullScreening({ worstPrimarySpatialVariation: 0.1 }));
    const B = mkCandidate("B", fullScreening({ worstPrimarySpatialVariation: 0.1 }));
    // C has a NaN field (simulating a corrupt transfer).
    const C = mkCandidate("C", fullScreening({ worstPrimarySpatialVariation: NaN }));
    const result = compareScreeningResults(A, C);
    const result2 = compareScreeningResults(C, B);
    assert.ok(Number.isFinite(result), "NaN produced non-finite comparison");
    assert.ok(Number.isFinite(result2), "NaN produced non-finite comparison");
    // The order must still be a total order.
    const order = rankedIds([A, B, C]);
    assert.deepEqual([...new Set(order)], order, "duplicate ids in ranking");
  });

  test.it("preserves the intended hierarchy: severe count dominates", () => {
    const fewer = mkCandidate("fewer", fullScreening({
      primarySevereProblemCount: 0,
      efficiencyIndicator: 50,
    }));
    const more = mkCandidate("more", fullScreening({
      primarySevereProblemCount: 1,
      efficiencyIndicator: 999,
    }));
    assert.ok(compareScreeningResults(fewer, more) < 0, "severe count should dominate efficiency");
  });
});

// ---------------------------------------------------------------------------
// Defect 2: coordinate-domain handoff
// ---------------------------------------------------------------------------

test.describe("Defect 2: wall-reference vs cabinet-centre coordinate handoff", () => {
  test.it("classifies wall-boundary points as wall references", () => {
    assert.equal(isWallReferencePoint(0, 0.25), true, "left wall");
    assert.equal(isWallReferencePoint(1, 0.25), true, "right wall");
    assert.equal(isWallReferencePoint(0.25, 0), true, "front wall");
    assert.equal(isWallReferencePoint(0.25, 1), true, "rear wall");
    assert.equal(isWallReferencePoint(0, 0), true, "corner");
    assert.equal(isWallReferencePoint(1, 1), true, "opposite corner");
  });

  test.it("classifies inset points as cabinet centres (not wall references)", () => {
    // The reported defect: (0.08, 0.08) from RP22_E is an INSET position.
    assert.equal(isWallReferencePoint(0.08, 0.08), false);
    assert.equal(isWallReferencePoint(0.25, 0.25), false);
    assert.equal(isWallReferencePoint(0.5, 0.5), false);
  });

  test.it("resolves an inset position as a cabinet centre (not rejected)", () => {
    const roomDims = { widthM: 4.5, lengthM: 6.0, heightM: 2.4 };
    const centre = resolveCabinetCentre({
      roomDims,
      xNorm: 0.08,
      yNorm: 0.08,
      coordinateSpace: COORDINATE_SPACE.CABINET_CENTRE,
      modelKey: "sub3-12",
    });
    // A cabinet centre is used directly: x = 0.08 * W, y = 0.08 * L.
    assert.ok(Math.abs(centre.x - 0.08 * 4.5) < 1e-9, `inset x should be 0.08*W, got ${centre.x}`);
    assert.ok(Math.abs(centre.y - 0.08 * 6.0) < 1e-9, `inset y should be 0.08*L, got ${centre.y}`);
    assert.equal(centre.coordinateSpace, COORDINATE_SPACE.CABINET_CENTRE);
  });

  test.it("resolves a wall reference with the cabinet offset into the room", () => {
    const roomDims = { widthM: 4.5, lengthM: 6.0, heightM: 2.4 };
    const centre = resolveCabinetCentre({
      roomDims,
      xNorm: 0.25,
      yNorm: 0,
      coordinateSpace: COORDINATE_SPACE.WALL_REFERENCE,
      modelKey: "sub3-12",
    });
    // Front wall: y = buffer + depth/2 (offset into room), x = 0.25 * W.
    assert.ok(centre.y > 0, "wall reference must offset into the room");
    assert.ok(Math.abs(centre.x - 0.25 * 4.5) < 1e-9);
    assert.equal(centre.coordinateSpace, COORDINATE_SPACE.WALL_REFERENCE);
  });
});

// ---------------------------------------------------------------------------
// Defect 3: cabinet-to-cabinet overlap rejection
// ---------------------------------------------------------------------------

test.describe("Defect 3: cabinet-to-cabinet overlap rejection", () => {
  test.it("rejects the Room C defect: 1.70m horizontal subs 1.08m apart", () => {
    const sources = [
      { x: 1.0, y: 0.3, z: 0.4, cabinetWidthM: 1.70, cabinetDepthM: 0.44, cabinetHeightM: 0.44 },
      { x: 2.08, y: 0.3, z: 0.4, cabinetWidthM: 1.70, cabinetDepthM: 0.44, cabinetHeightM: 0.44 },
    ];
    const result = validateCabinetOverlap({ sources });
    assert.equal(result.valid, false, "1.08m gap with 1.70m cabinets must overlap");
    assert.equal(result.violations.length, 1);
    assert.equal(result.violations[0].reason, "cabinet-overlap");
  });

  test.it("rejects 1.32m centre gap for 1.70m horizontal subs", () => {
    const sources = [
      { x: 1.0, y: 0.3, z: 0.4, cabinetWidthM: 1.70, cabinetDepthM: 0.44, cabinetHeightM: 0.44 },
      { x: 2.32, y: 0.3, z: 0.4, cabinetWidthM: 1.70, cabinetDepthM: 0.44, cabinetHeightM: 0.44 },
    ];
    const result = validateCabinetOverlap({ sources });
    assert.equal(result.valid, false, "1.32m gap with 1.70m cabinets must overlap");
  });

  test.it("allows touching cabinets (gap equal to sum of half-widths)", () => {
    const sources = [
      { x: 0.0, y: 0.3, z: 0.4, cabinetWidthM: 1.70, cabinetDepthM: 0.44, cabinetHeightM: 0.44 },
      { x: 1.70, y: 0.3, z: 0.4, cabinetWidthM: 1.70, cabinetDepthM: 0.44, cabinetHeightM: 0.44 },
    ];
    const result = validateCabinetOverlap({ sources });
    assert.equal(result.valid, true, "touching cabinets must not be rejected");
  });

  test.it("allows non-overlapping cabinets with a clear gap", () => {
    const sources = [
      { x: 0.0, y: 0.3, z: 0.4, cabinetWidthM: 1.70, cabinetDepthM: 0.44, cabinetHeightM: 0.44 },
      { x: 2.0, y: 0.3, z: 0.4, cabinetWidthM: 1.70, cabinetDepthM: 0.44, cabinetHeightM: 0.44 },
    ];
    const result = validateCabinetOverlap({ sources });
    assert.equal(result.valid, true);
  });

  test.it("does not flag cabinets at different heights (stacked)", () => {
    // Same XY footprint, different Z — physically stacked, not overlapping.
    const sources = [
      { x: 1.0, y: 0.3, z: 0.2, cabinetWidthM: 0.44, cabinetDepthM: 0.44, cabinetHeightM: 0.44 },
      { x: 1.0, y: 0.3, z: 1.0, cabinetWidthM: 0.44, cabinetDepthM: 0.44, cabinetHeightM: 0.44 },
    ];
    const result = validateCabinetOverlap({ sources });
    assert.equal(result.valid, true, "stacked cabinets at different heights must not overlap");
  });

  test.it("rejects overlap only when all three dimensions intersect", () => {
    // Overlap in X and Z but NOT in Y (front vs rear wall) → no collision.
    const sources = [
      { x: 1.0, y: 0.2, z: 0.4, cabinetWidthM: 1.70, cabinetDepthM: 0.44, cabinetHeightM: 0.44 },
      { x: 1.5, y: 5.0, z: 0.4, cabinetWidthM: 1.70, cabinetDepthM: 0.44, cabinetHeightM: 0.44 },
    ];
    const result = validateCabinetOverlap({ sources });
    assert.equal(result.valid, true, "front + rear wall cabinets must not be flagged");
  });
});