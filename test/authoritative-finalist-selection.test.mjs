import test from "node:test";
import assert from "node:assert/strict";

// Import the module under test
const {
  selectAuthoritativeFinalist,
  extractAuthoritativeMetrics,
  detectMutedSubs,
  classifyVersusCurrent,
} = await import("../src/components/room/bass/best-layout/authoritativeFinalistSelection.js");

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

/**
 * Build a Stage 2 finalist result with controllable P19/P20 seat variation.
 * All acoustic values are explicit — no hidden defaults — so the test asserts
 * ONLY the winner-selection logic, never the acoustic equations.
 */
function makeFinalist({
  finalistId,
  familyId = "front-rear",
  quantity = 2,
  coordinates = [{ x: 0, y: 0 }, { x: 0, y: 5 }],
  p19VariationBySeat = [1.0, 1.2],   // variationDbRaw per primary seat
  p20VariationBySeat = [2.0, 2.5],
  p19Levels = [3, 3],
  p20Levels = [3, 3],
  p18Level = 3,
  p18Hz = 28,
  p14Level = 3,
  p14Db = 95,
  isPrimary = [true, true],
}) {
  const perSeatP19 = p19VariationBySeat.map((variation, i) => ({
    seatId: `seat-${i + 1}`,
    isPrimary: isPrimary[i] ?? true,
    variationDbRaw: variation,
    level: p19Levels[i] ?? 3,
    worstFrequencyHz: 35,
  }));
  const perSeatP20 = p20VariationBySeat.map((variation, i) => ({
    seatId: `seat-${i + 1}`,
    isPrimary: isPrimary[i] ?? true,
    variationDbRaw: variation,
    level: p20Levels[i] ?? 3,
    worstFrequencyHz: 45,
  }));
  return {
    finalistId,
    familyId,
    quantity,
    coordinates,
    perSeatP19,
    perSeatP20,
    p18AchievedLevel: p18Level,
    achievedP18Hz: p18Hz,
    p14AchievedLevel: p14Level,
    p14AchievedDb: p14Db,
  };
}

/**
 * Build a "current layout" object matching the shape produced by
 * buildCurrentCanonicalLayout in stage2RecommendationAdapter.js.
 */
function makeCurrentLayout({
  sources,
  p19VariationBySeat = [1.5, 1.8],
  p20VariationBySeat = [3.0, 3.5],
  p19Levels = [3, 3],
  p20Levels = [3, 3],
  p18Level = 3,
  p18Hz = 28,
  p14Level = 3,
  p14Db = 95,
}) {
  const perSeatP19 = p19VariationBySeat.map((variation, i) => ({
    seatId: `seat-${i + 1}`,
    isPrimary: true,
    variationDbRaw: variation,
    level: p19Levels[i] ?? 3,
    worstFrequencyHz: 35,
  }));
  const perSeatP20 = p20VariationBySeat.map((variation, i) => ({
    seatId: `seat-${i + 1}`,
    isPrimary: true,
    variationDbRaw: variation,
    level: p20Levels[i] ?? 3,
    worstFrequencyHz: 45,
  }));
  return {
    id: "current-canonical-layout",
    name: "Current positions",
    sources,
    metrics: {
      sourceCount: sources.length,
      perSeatP19,
      perSeatP20,
      p18AchievedLevel: p18Level,
      achievedP18Hz: p18Hz,
      p14AchievedLevel: p14Level,
      p14AchievedDb: p14Db,
    },
    canonicalResult: {
      p18AchievedLevel: p18Level,
      achievedP18Hz: p18Hz,
      p14AchievedLevel: p14Level,
      p14AchievedDb: p14Db,
    },
  };
}

const ROOM_B = { widthM: 4.5, lengthM: 6.0, heightM: 2.4 };
const ROOM_C = { widthM: 5.5, lengthM: 7.0, heightM: 2.8 };

// ---------------------------------------------------------------------------
// Acceptance tests
// ---------------------------------------------------------------------------

test("Room B: Current is retained when every alternative is worse", () => {
  // Current has good P19 and P20; all finalists regress on both axes.
  const currentLayout = makeCurrentLayout({
    sources: [{ id: "sub-1", x: 0, y: 0 }, { id: "sub-2", x: 0, y: 6 }],
    p19VariationBySeat: [1.0, 1.0],
    p20VariationBySeat: [2.0, 2.0],
  });
  const quantityResult = {
    evaluatedFinalists: [
      makeFinalist({
        finalistId: "finalist-A",
        p19VariationBySeat: [2.5, 2.8],  // worse than current (1.0)
        p20VariationBySeat: [4.0, 4.5],  // worse than current (2.0)
      }),
      makeFinalist({
        finalistId: "finalist-B",
        p19VariationBySeat: [3.0, 3.2],
        p20VariationBySeat: [5.0, 5.5],
      }),
    ],
  };

  const selection = selectAuthoritativeFinalist(quantityResult, ROOM_B, currentLayout);
  assert.equal(selection.isCurrent, true, "Current should be retained when all alternatives regress");
  assert.equal(selection.winner, null, "No winner should be returned when current is best");
  assert.equal(selection.isTradeOff, false);
});

test("Room B: Joint P19/P20 improvements win over current", () => {
  // Current has mediocre P19/P20; one finalist improves both materially.
  const currentLayout = makeCurrentLayout({
    sources: [{ id: "sub-1", x: 0, y: 0 }, { id: "sub-2", x: 0, y: 6 }],
    p19VariationBySeat: [3.0, 3.5],
    p20VariationBySeat: [5.0, 5.5],
  });
  const quantityResult = {
    evaluatedFinalists: [
      makeFinalist({
        finalistId: "finalist-joint-improve",
        p19VariationBySeat: [1.0, 1.2],  // improves by ~2 dB
        p20VariationBySeat: [2.0, 2.5],  // improves by ~3 dB
      }),
      makeFinalist({
        finalistId: "finalist-partial",
        p19VariationBySeat: [2.8, 3.0],  // marginal P19 improvement
        p20VariationBySeat: [4.8, 5.0],  // marginal P20 improvement
      }),
    ],
  };

  const selection = selectAuthoritativeFinalist(quantityResult, ROOM_B, currentLayout);
  assert.equal(selection.isCurrent, false, "Current should not be retained when a joint improvement exists");
  assert.ok(selection.winner, "A winner should be selected");
  assert.equal(selection.winner.finalistId, "finalist-joint-improve",
    "The jointly-improving finalist should win");
  assert.equal(selection.isTradeOff, false, "A joint improvement is not a trade-off");
});

test("Room C: P19-vs-P20 trade-off is labelled, not presented as universally better", () => {
  // Current is balanced; one finalist improves P19 but worsens P20.
  const currentLayout = makeCurrentLayout({
    sources: [{ id: "sub-1", x: 0, y: 0 }, { id: "sub-2", x: 0, y: 7 }],
    p19VariationBySeat: [2.0, 2.2],
    p20VariationBySeat: [3.0, 3.2],
  });
  const quantityResult = {
    evaluatedFinalists: [
      makeFinalist({
        finalistId: "finalist-tradeoff",
        p19VariationBySeat: [0.8, 0.9],  // P19 improves by ~1.3 dB
        p20VariationBySeat: [4.5, 4.8],  // P20 worsens by ~1.5 dB
      }),
    ],
  };

  const selection = selectAuthoritativeFinalist(quantityResult, ROOM_C, currentLayout);
  assert.equal(selection.isCurrent, false, "A trade-off candidate can still be selected");
  assert.ok(selection.winner, "A trade-off winner should be returned");
  assert.equal(selection.winner.finalistId, "finalist-tradeoff");
  assert.equal(selection.isTradeOff, true, "Must be labelled as a trade-off");
  assert.ok(selection.tradeOffDescription, "Trade-off description must be present");
  assert.match(selection.tradeOffDescription, /Trade-off/i,
    "Description must explicitly say 'Trade-off'");
  assert.match(selection.tradeOffDescription, /not an unconditional/i,
    "Description must say it is not an unconditional improvement");
});

test("Delay-only finalists remain eligible (no acoustic penalty for delay-only tuning)", () => {
  // A finalist with the same P19/P20 as current but different coordinates
  // (representing a delay-only tuning change) should remain on the Pareto front.
  const currentLayout = makeCurrentLayout({
    sources: [{ id: "sub-1", x: 0, y: 0 }, { id: "sub-2", x: 0, y: 6 }],
    p19VariationBySeat: [1.5, 1.8],
    p20VariationBySeat: [2.5, 2.8],
  });
  const quantityResult = {
    evaluatedFinalists: [
      makeFinalist({
        finalistId: "finalist-delay-only",
        coordinates: [{ x: 0.5, y: 0 }, { x: 0.5, y: 6 }],  // different coords, same acoustic result
        p19VariationBySeat: [1.5, 1.8],  // identical to current
        p20VariationBySeat: [2.5, 2.8],  // identical to current
      }),
    ],
  };

  const selection = selectAuthoritativeFinalist(quantityResult, ROOM_B, currentLayout);
  // The delay-only finalist is on the Pareto front (neither dominates the other
  // since they are within tolerance). Current is also on the front.
  // Since the finalist doesn't materially improve, current should be retained.
  assert.equal(selection.isCurrent, true,
    "Delay-only finalist with identical acoustic result should not displace current");
  assert.equal(selection.winner, null);
  // But the finalist should appear in the Pareto front list
  assert.ok(selection.paretoFinalistIds.includes("finalist-delay-only"),
    "Delay-only finalist must remain on the Pareto front (eligible, not excluded)");
});

test("Muted sources are not counted as active capability", () => {
  // Current layout has 4 sources but 2 are effectively muted (gain ≤ -30 dB).
  // The active-sub count should be 2, not 4.
  const sources = [
    { id: "sub-1", x: 0, y: 0, tuning: { gainDb: 0 } },
    { id: "sub-2", x: 0, y: 6, tuning: { gainDb: 0 } },
    { id: "sub-3", x: 2, y: 0, tuning: { gainDb: -40 } },  // muted
    { id: "sub-4", x: 2, y: 6, tuning: { gainDb: -35 } },  // muted
  ];
  const mutedInfo = detectMutedSubs(sources);
  assert.equal(mutedInfo.activeCount, 2, "Only 2 subs should be active");
  assert.equal(mutedInfo.mutedCount, 2, "2 subs should be detected as muted");
  assert.deepEqual(mutedInfo.mutedIds, ["sub-3", "sub-4"]);

  // Verify in the metrics extraction
  const fakeResult = { quantity: 4, perSeatP19: [], perSeatP20: [] };
  const metrics = extractAuthoritativeMetrics(fakeResult, { sources });
  assert.equal(metrics.activeCount, 2,
    "extractAuthoritativeMetrics must use muted-adjusted active count");
});

test("Muted sources: modest gain trims are NOT flagged as muted", () => {
  // A sub with -6 dB trim is a legitimate level adjustment, not a mute.
  const sources = [
    { id: "sub-1", x: 0, y: 0, tuning: { gainDb: -3 } },
    { id: "sub-2", x: 0, y: 6, tuning: { gainDb: -6 } },
  ];
  const mutedInfo = detectMutedSubs(sources);
  assert.equal(mutedInfo.activeCount, 2, "Both subs should be active");
  assert.equal(mutedInfo.mutedCount, 0, "No subs should be muted");
});

test("No finalist's acoustic result changes — only the winner selection changes", () => {
  // This is a structural assertion: the selection function must not mutate
  // any finalist's perSeatP19, perSeatP20, or any other acoustic field.
  const finalist = makeFinalist({
    finalistId: "finalist-immutability",
    p19VariationBySeat: [1.5, 1.8],
    p20VariationBySeat: [2.5, 2.8],
  });
  const originalP19 = JSON.parse(JSON.stringify(finalist.perSeatP19));
  const originalP20 = JSON.parse(JSON.stringify(finalist.perSeatP20));
  const originalP18Hz = finalist.achievedP18Hz;
  const originalP14Db = finalist.p14AchievedDb;

  const currentLayout = makeCurrentLayout({
    sources: [{ id: "sub-1", x: 0, y: 0 }, { id: "sub-2", x: 0, y: 6 }],
    p19VariationBySeat: [3.0, 3.5],
    p20VariationBySeat: [4.0, 4.5],
  });

  selectAuthoritativeFinalist(
    { evaluatedFinalists: [finalist] },
    ROOM_B,
    currentLayout,
  );

  // Assert no mutation
  assert.deepEqual(finalist.perSeatP19, originalP19,
    "perSeatP19 must not be mutated by the selection function");
  assert.deepEqual(finalist.perSeatP20, originalP20,
    "perSeatP20 must not be mutated by the selection function");
  assert.equal(finalist.achievedP18Hz, originalP18Hz,
    "achievedP18Hz must not be mutated");
  assert.equal(finalist.p14AchievedDb, originalP14Db,
    "p14AchievedDb must not be mutated");
});

test("classifyVersusCurrent: joint improvement classification", () => {
  const current = {
    p19VariationDb: 3.0,
    p20VariationDb: 4.0,
  };
  const candidate = {
    p19VariationDb: 1.0,  // improves by 2.0
    p20VariationDb: 2.0,  // improves by 2.0
  };
  const classification = classifyVersusCurrent(candidate, current);
  assert.equal(classification.type, "improvement");
  assert.ok(classification.p19Delta > 0);
  assert.ok(classification.p20Delta > 0);
});

test("classifyVersusCurrent: trade-off classification", () => {
  const current = {
    p19VariationDb: 2.0,
    p20VariationDb: 3.0,
  };
  const candidate = {
    p19VariationDb: 0.5,  // improves by 1.5
    p20VariationDb: 5.0,  // worsens by 2.0
  };
  const classification = classifyVersusCurrent(candidate, current);
  assert.equal(classification.type, "trade-off");
  assert.ok(classification.p19Delta > 0, "P19 should improve");
  assert.ok(classification.p20Delta < 0, "P20 should worsen");
  assert.match(classification.description, /Trade-off/i);
});

test("classifyVersusCurrent: regression classification", () => {
  const current = {
    p19VariationDb: 1.0,
    p20VariationDb: 2.0,
  };
  const candidate = {
    p19VariationDb: 3.0,  // worsens
    p20VariationDb: 4.0,  // worsens
  };
  const classification = classifyVersusCurrent(candidate, current);
  assert.equal(classification.type, "regression");
});

test("Room B/C: Pareto front correctly identifies non-dominated finalists", () => {
  // Two finalists: one better on P19, one better on P20 — both on Pareto front.
  const currentLayout = makeCurrentLayout({
    sources: [{ id: "sub-1", x: 0, y: 0 }, { id: "sub-2", x: 0, y: 6 }],
    p19VariationBySeat: [3.0, 3.0],
    p20VariationBySeat: [3.0, 3.0],
  });
  const quantityResult = {
    evaluatedFinalists: [
      makeFinalist({
        finalistId: "finalist-p19-focused",
        p19VariationBySeat: [0.5, 0.6],  // excellent P19
        p20VariationBySeat: [4.0, 4.5],  // poor P20
      }),
      makeFinalist({
        finalistId: "finalist-p20-focused",
        p19VariationBySeat: [2.5, 2.8],  // modest P19
        p20VariationBySeat: [0.5, 0.6],  // excellent P20
      }),
    ],
  };

  const selection = selectAuthoritativeFinalist(quantityResult, ROOM_B, currentLayout);
  // Both finalists are on the Pareto front (neither dominates the other).
  // Current is dominated by both (both improve at least one axis materially).
  assert.ok(selection.paretoFinalistIds.includes("finalist-p19-focused"),
    "P19-focused finalist should be on Pareto front");
  assert.ok(selection.paretoFinalistIds.includes("finalist-p20-focused"),
    "P20-focused finalist should be on Pareto front");
  // The winner should be one of them (the one with better combined variation)
  assert.ok(
    selection.winner?.finalistId === "finalist-p19-focused" ||
    selection.winner?.finalistId === "finalist-p20-focused",
    "Winner should be one of the Pareto-front finalists",
  );
});

test("Side-wall finalist is deprioritised when a practical alternative is on the Pareto front", () => {
  // A side-wall finalist is better on P19, a front/rear finalist is better on P20.
  // Both are on the Pareto front (neither dominates the other). Both improve
  // over current. The practical (front/rear) one should be preferred.
  const currentLayout = makeCurrentLayout({
    sources: [{ id: "sub-1", x: 0, y: 0 }, { id: "sub-2", x: 0, y: 6 }],
    p19VariationBySeat: [3.0, 3.0],
    p20VariationBySeat: [4.0, 4.0],
  });
  const quantityResult = {
    evaluatedFinalists: [
      makeFinalist({
        finalistId: "finalist-sidewall",
        familyId: "side-wall",
        coordinates: [{ x: 0, y: 3 }, { x: 4.5, y: 3 }],  // on side walls
        p19VariationBySeat: [0.5, 0.6],  // excellent P19
        p20VariationBySeat: [2.5, 2.8],  // modest P20 (trade-off)
      }),
      makeFinalist({
        finalistId: "finalist-practical",
        familyId: "front-rear",
        coordinates: [{ x: 0, y: 0 }, { x: 0, y: 6 }],  // front/rear
        p19VariationBySeat: [1.0, 1.1],  // modest P19
        p20VariationBySeat: [0.8, 0.9],  // excellent P20
      }),
    ],
  };

  const selection = selectAuthoritativeFinalist(quantityResult, ROOM_B, currentLayout);
  assert.equal(selection.isCurrent, false);
  // Both are on the Pareto front and both improve over current.
  // The practical (non-side-wall) one should be preferred.
  assert.equal(selection.winner.finalistId, "finalist-practical",
    "Practical front/rear finalist should be preferred over side-wall when both are on the Pareto front");
});