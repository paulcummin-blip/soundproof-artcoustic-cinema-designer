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
  p19Headline = null,  // canonical RSP headline; defaults to worst primary seat
  p20Headline = null,  // canonical worst-seat headline; defaults to worst seat
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
  // Canonical headline P19 (RSP raw deviation) and P20 (worst-seat raw deviation).
  // These are the fields extractAuthoritativeMetrics uses for Pareto selection.
  const achievedP19VariationDb = p19Headline ?? Math.max(...p19VariationBySeat.map((v) => Math.abs(v)));
  const achievedP20VariationDb = p20Headline ?? Math.max(...p20VariationBySeat.map((v) => Math.abs(v)));
  return {
    finalistId,
    familyId,
    quantity,
    coordinates,
    perSeatP19,
    perSeatP20,
    achievedP19VariationDb,
    achievedP19Level: p19Levels[0] ?? 3,
    achievedP20VariationDb,
    achievedP20Level: p20Levels[0] ?? 3,
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
  p19Headline = null,
  p20Headline = null,
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
  const achievedP19VariationDb = p19Headline ?? Math.max(...p19VariationBySeat.map((v) => Math.abs(v)));
  const achievedP20VariationDb = p20Headline ?? Math.max(...p20VariationBySeat.map((v) => Math.abs(v)));
  return {
    id: "current-canonical-layout",
    name: "Current positions",
    sources,
    metrics: {
      sourceCount: sources.length,
      perSeatP19,
      perSeatP20,
      achievedP19VariationDb,
      achievedP19Level: p19Levels[0] ?? 3,
      achievedP20VariationDb,
      achievedP20Level: p20Levels[0] ?? 3,
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

// ---------------------------------------------------------------------------
// Canonical headline P19/P20 authority tests
// ---------------------------------------------------------------------------

test("Canonical RSP P19 is used for Pareto comparison, not per-seat proxy", () => {
  // Finalist has GOOD per-seat P19 (low variation) but BAD canonical RSP P19
  // headline. The selection must use the canonical headline, so this finalist
  // should NOT be selected as a joint improvement over current.
  const currentLayout = makeCurrentLayout({
    sources: [{ id: "sub-1", x: 0, y: 0 }, { id: "sub-2", x: 0, y: 6 }],
    p19Headline: 2.0,
    p20Headline: 3.0,
  });
  const quantityResult = {
    evaluatedFinalists: [
      makeFinalist({
        finalistId: "finalist-misleading-per-seat",
        p19VariationBySeat: [0.5, 0.6],  // good per-seat P19
        p20VariationBySeat: [0.5, 0.6],  // good per-seat P20
        p19Headline: 4.0,  // BAD canonical RSP P19 — worse than current
        p20Headline: 5.0,  // BAD canonical worst-seat P20 — worse than current
      }),
    ],
  };

  const selection = selectAuthoritativeFinalist(quantityResult, ROOM_B, currentLayout);
  // The finalist is worse on BOTH canonical headlines, so current must win.
  assert.equal(selection.isCurrent, true,
    "Canonical RSP P19 headline (not per-seat proxy) must govern selection");
  assert.equal(selection.winner, null);
});

test("Canonical worst-seat P20 is used, not primary-seat-only proxy", () => {
  // Current has a good canonical P20 headline. A finalist has a good
  // primary-seat P20 but a bad canonical worst-seat P20 (a secondary seat
  // has a large variation). The selection must use the canonical worst-seat
  // P20, so the finalist should NOT be selected as a joint improvement.
  const currentLayout = makeCurrentLayout({
    sources: [{ id: "sub-1", x: 0, y: 0 }, { id: "sub-2", x: 0, y: 6 }],
    p19Headline: 2.0,
    p20Headline: 3.0,
  });
  const quantityResult = {
    evaluatedFinalists: [
      makeFinalist({
        finalistId: "finalist-bad-worst-seat-p20",
        p19VariationBySeat: [0.5, 0.6],
        p20VariationBySeat: [0.5, 0.6],  // good primary-seat P20
        p19Headline: 1.0,  // good canonical P19
        p20Headline: 6.0,  // BAD canonical worst-seat P20 — worse than current
      }),
    ],
  };

  const selection = selectAuthoritativeFinalist(quantityResult, ROOM_B, currentLayout);
  // P19 improves (2.0 → 1.0) but P20 worsens (3.0 → 6.0). This is a trade-off,
  // not a joint improvement. The finalist should be labelled as a trade-off.
  assert.equal(selection.isCurrent, false, "Trade-off candidate can be selected");
  assert.equal(selection.isTradeOff, true,
    "Canonical worst-seat P20 must detect the trade-off, not the primary-seat proxy");
  assert.ok(selection.winner, "Trade-off winner should be returned");
  assert.equal(selection.winner.finalistId, "finalist-bad-worst-seat-p20");
});

test("Primary-seat-only metric cannot override canonical headline authority", () => {
  // Two finalists: one has better per-seat P19 but worse canonical RSP P19.
  // The canonical headline must win — the finalist with better canonical P19
  // should be preferred for P19, even if its per-seat P19 looks worse.
  const currentLayout = makeCurrentLayout({
    sources: [{ id: "sub-1", x: 0, y: 0 }, { id: "sub-2", x: 0, y: 6 }],
    p19Headline: 5.0,
    p20Headline: 5.0,
  });
  const quantityResult = {
    evaluatedFinalists: [
      makeFinalist({
        finalistId: "finalist-good-headline",
        p19VariationBySeat: [3.0, 3.5],  // worse per-seat P19
        p20VariationBySeat: [1.0, 1.2],
        p19Headline: 1.0,  // GOOD canonical RSP P19
        p20Headline: 1.0,
      }),
      makeFinalist({
        finalistId: "finalist-bad-headline",
        p19VariationBySeat: [0.5, 0.6],  // better per-seat P19
        p20VariationBySeat: [4.0, 4.5],
        p19Headline: 4.0,  // BAD canonical RSP P19
        p20Headline: 4.0,
      }),
    ],
  };

  const selection = selectAuthoritativeFinalist(quantityResult, ROOM_B, currentLayout);
  assert.equal(selection.isCurrent, false);
  assert.equal(selection.winner.finalistId, "finalist-good-headline",
    "Finalist with better canonical RSP P19 headline must win, even with worse per-seat P19");
});

test("Room B 2-sub: delay-only trade-off is surfaced (not auto-replaced)", () => {
  // Current: P19 ≈ 3.986, P20 ≈ 10.717
  // Delay-only: P19 ≈ 4.198 (slight regression), P20 ≈ 7.485 (big improvement)
  // This is a trade-off — it must be eligible but does not have to replace current.
  const currentLayout = makeCurrentLayout({
    sources: [{ id: "sub-1", x: 0, y: 0 }, { id: "sub-2", x: 0, y: 6 }],
    p19Headline: 3.986,
    p20Headline: 10.717,
  });
  const quantityResult = {
    evaluatedFinalists: [
      makeFinalist({
        finalistId: "finalist-delay-only-tradeoff",
        p19VariationBySeat: [4.198, 4.198],
        p20VariationBySeat: [7.485, 7.485],
        p19Headline: 4.198,
        p20Headline: 7.485,
      }),
    ],
  };

  const selection = selectAuthoritativeFinalist(quantityResult, ROOM_B, currentLayout);
  // P19 worsens slightly (3.986 → 4.198), P20 improves a lot (10.717 → 7.485).
  // This is a trade-off. It must be eligible (on the Pareto front).
  assert.ok(selection.paretoFinalistIds.includes("finalist-delay-only-tradeoff"),
    "Room B 2-sub delay-only trade-off must be on the Pareto front (eligible)");
  // It's a trade-off, so it CAN be selected but doesn't have to auto-replace current.
  assert.equal(selection.isTradeOff, true,
    "Room B 2-sub delay-only must be labelled as a trade-off");
});

test("Room B 4-sub: level+delay wins over current (big P20 improvement)", () => {
  // Current: P19 ≈ 4.922, P20 ≈ 18.501
  // Level+delay: P19 ≈ 4.905, P20 ≈ 6.442
  // P19 improves slightly, P20 improves massively → joint improvement.
  const currentLayout = makeCurrentLayout({
    sources: [
      { id: "sub-1", x: 0, y: 0 }, { id: "sub-2", x: 0, y: 6 },
      { id: "sub-3", x: 2, y: 0 }, { id: "sub-4", x: 2, y: 6 },
    ],
    p19Headline: 4.922,
    p20Headline: 18.501,
  });
  const quantityResult = {
    evaluatedFinalists: [
      makeFinalist({
        finalistId: "finalist-level-delay",
        quantity: 4,
        coordinates: [{ x: 0, y: 0 }, { x: 0, y: 6 }, { x: 2, y: 0 }, { x: 2, y: 6 }],
        p19VariationBySeat: [4.905, 4.905],
        p20VariationBySeat: [6.442, 6.442],
        p19Headline: 4.905,
        p20Headline: 6.442,
      }),
    ],
  };

  const selection = selectAuthoritativeFinalist(quantityResult, ROOM_B, currentLayout);
  assert.equal(selection.isCurrent, false, "Room B 4-sub: level+delay must win over current");
  assert.ok(selection.winner, "Room B 4-sub: winner must be returned");
  assert.equal(selection.winner.finalistId, "finalist-level-delay",
    "Room B 4-sub: level+delay finalist must be the winner");
  assert.equal(selection.isTradeOff, false,
    "Room B 4-sub: level+delay is a joint improvement, not a trade-off");
});

test("Room C 2-sub: Current remains winner (non-regression control)", () => {
  // Current: P19 ≈ 4.192, P20 ≈ 10.347
  // Delay: P19 ≈ 4.271 (slight regression), P20 ≈ 12.636 (regression)
  // Both regress → current must win.
  const currentLayout = makeCurrentLayout({
    sources: [{ id: "sub-1", x: 0, y: 0 }, { id: "sub-2", x: 0, y: 7 }],
    p19Headline: 4.192,
    p20Headline: 10.347,
  });
  const quantityResult = {
    evaluatedFinalists: [
      makeFinalist({
        finalistId: "finalist-delay-regression",
        p19VariationBySeat: [4.271, 4.271],
        p20VariationBySeat: [12.636, 12.636],
        p19Headline: 4.271,
        p20Headline: 12.636,
      }),
    ],
  };

  const selection = selectAuthoritativeFinalist(quantityResult, ROOM_C, currentLayout);
  assert.equal(selection.isCurrent, true,
    "Room C 2-sub: Current must remain winner when delay regresses both axes");
  assert.equal(selection.winner, null);
});

test("Room C 4-sub: delay-only wins over current (big P20 improvement)", () => {
  // Current: P19 ≈ 5.169, P20 ≈ 20.946
  // Delay-only: P19 ≈ 5.222 (slight regression), P20 ≈ 10.298 (big improvement)
  // P20 improvement is material; P19 regression is within tolerance → trade-off eligible.
  const currentLayout = makeCurrentLayout({
    sources: [
      { id: "sub-1", x: 0, y: 0 }, { id: "sub-2", x: 0, y: 7 },
      { id: "sub-3", x: 2, y: 0 }, { id: "sub-4", x: 2, y: 7 },
    ],
    p19Headline: 5.169,
    p20Headline: 20.946,
  });
  const quantityResult = {
    evaluatedFinalists: [
      makeFinalist({
        finalistId: "finalist-delay-only",
        quantity: 4,
        coordinates: [{ x: 0, y: 0 }, { x: 0, y: 7 }, { x: 2, y: 0 }, { x: 2, y: 7 }],
        p19VariationBySeat: [5.222, 5.222],
        p20VariationBySeat: [10.298, 10.298],
        p19Headline: 5.222,
        p20Headline: 10.298,
      }),
    ],
  };

  const selection = selectAuthoritativeFinalist(quantityResult, ROOM_C, currentLayout);
  // P19 worsens slightly (5.169 → 5.222, within 0.05 tolerance), P20 improves massively.
  // This should be eligible and win.
  assert.equal(selection.isCurrent, false,
    "Room C 4-sub: delay-only must win (big P20 improvement, negligible P19 regression)");
  assert.ok(selection.winner, "Room C 4-sub: winner must be returned");
  assert.equal(selection.winner.finalistId, "finalist-delay-only",
    "Room C 4-sub: delay-only finalist must be the winner");
});