// stage2-tuning-variants.test.mjs
// Regression tests for Stage 2 tuning variant evaluation (delay-only,
// level+delay), per-source per-seat capture, muted-sub detection, and
// practicality-as-preference finalist selection.
//
// These tests assert ONLY the selection/tuning logic — never the acoustic
// equations, smoothing, house curve, or EQ rules.

import test from "node:test";
import assert from "node:assert/strict";

// ── Modules under test ────────────────────────────────────────────────────

const {
  searchDelayOnly,
  searchLevelAndDelay,
  resumWithTuning,
} = await import("../src/components/room/bass/stage2/stage2TuningSearch.js");

const {
  detectMutedSubs,
  selectAuthoritativeFinalist,
  classifyVersusCurrent,
} = await import("../src/components/room/bass/best-layout/authoritativeFinalistSelection.js");

// ── Fixture builders ──────────────────────────────────────────────────────

/**
 * Build per-source per-seat complex transfers with known values so the
 * tuning search can be tested deterministically.
 *
 * Each source produces a flat 94 dB transfer (re=const, im=0) so the
 * peak-to-peak score is driven entirely by the summation phase.
 */
function makePerSourceTransfers(sourceCount, seatIds, freqsHz = [20, 30, 40, 50, 60, 80, 100, 120]) {
  const transfers = [];
  for (const seatId of seatIds) {
    for (let s = 0; s < sourceCount; s++) {
      transfers.push({
        seatId,
        sourceIndex: s,
        sourceId: `src-${s + 1}`,
        points: freqsHz.map((f) => ({
          frequency: f,
          re: 1.0 / sourceCount, // equal contribution
          im: 0,
        })),
      });
    }
  }
  return transfers;
}

/**
 * Build per-source RSP transfers with a known null at 50 Hz for source 0
 * so the delay search has something to optimise.
 */
function makeRspTransfersWithNull(sourceCount, nullFreq = 50) {
  const freqsHz = [20, 30, 40, 50, 60, 80, 100, 120];
  const transfers = [];
  for (let s = 0; s < sourceCount; s++) {
    transfers.push({
      seatId: "rsp",
      sourceIndex: s,
      sourceId: `src-${s + 1}`,
      points: freqsHz.map((f) => {
        // Source 0 has a dip at nullFreq, source 1 is flat
        if (s === 0 && f === nullFreq) {
          return { frequency: f, re: 0.3, im: 0 };
        }
        return { frequency: f, re: 1.0 / sourceCount, im: 0 };
      }),
    });
  }
  return transfers;
}

function makeFinalist({
  finalistId,
  familyId = "front-rear",
  quantity = 2,
  coordinates = [{ x: 0, y: 0 }, { x: 0, y: 5 }],
  p19VariationBySeat = [1.0, 1.2],
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

// ── Tests ─────────────────────────────────────────────────────────────────

// TEST 1: Delay-only search returns a valid tuning array
test("delay-only search returns a tuning array with correct length", () => {
  const sources = [{ yNorm: 0.1 }, { yNorm: 0.9 }];
  const rspTransfers = makeRspTransfersWithNull(2);
  const result = searchDelayOnly(rspTransfers, sources);
  assert.ok(Array.isArray(result.tuning), "tuning should be an array");
  assert.equal(result.tuning.length, 2, "tuning should have one entry per source");
  assert.ok(Number.isFinite(result.bestDelayMs), "bestDelayMs should be finite");
  assert.ok(Number.isFinite(result.bestScore), "bestScore should be finite");
  // Tuning entries should have delayMs, gainDb, polarity
  for (const t of result.tuning) {
    assert.ok("delayMs" in t, "tuning entry should have delayMs");
    assert.ok("gainDb" in t, "tuning entry should have gainDb");
    assert.ok("polarity" in t, "tuning entry should have polarity");
  }
  // Delay-only should have zero gain
  for (const t of result.tuning) {
    assert.equal(t.gainDb, 0, "delay-only should have zero gainDb");
  }
});

// TEST 2: Level+delay search returns a valid tuning array with gain
test("level+delay search returns tuning with non-positive gain", () => {
  const sources = [{ yNorm: 0.1 }, { yNorm: 0.9 }];
  const rspTransfers = makeRspTransfersWithNull(2);
  const result = searchLevelAndDelay(rspTransfers, sources);
  assert.ok(Array.isArray(result.tuning), "tuning should be an array");
  assert.equal(result.tuning.length, 2);
  assert.ok(Number.isFinite(result.bestGainDb), "bestGainDb should be finite");
  // Gain should be in [LEVEL_MIN_DB, LEVEL_MAX_DB] = [-10, 0]
  for (const t of result.tuning) {
    assert.ok(t.gainDb <= 0 + 1e-6, "gainDb should be <= 0");
    assert.ok(t.gainDb >= -10 - 1e-6, "gainDb should be >= -10");
  }
});

// TEST 3: Re-summation with zero tuning matches direct sum
test("resumWithTuning with zero tuning matches direct sum", () => {
  const seatIds = ["rsp", "seat-1"];
  const transfers = makePerSourceTransfers(2, seatIds);
  const zeroTuning = [{ delayMs: 0, gainDb: 0, polarity: 0 }, { delayMs: 0, gainDb: 0, polarity: 0 }];
  const result = resumWithTuning(transfers, zeroTuning, seatIds);
  assert.ok(result.rsp, "should have rsp response");
  assert.ok(result["seat-1"], "should have seat-1 response");
  // With equal contributions of 0.5 per source, the sum should be 1.0
  // SPL = 20*log10(|1.0|) = 0 dB
  const rspSpl = result.rsp.splDb;
  for (const spl of rspSpl) {
    assert.ok(Math.abs(spl) < 1e-6, `rsp SPL should be ~0 dB with zero tuning, got ${spl}`);
  }
});

// TEST 4: Re-summation with delay applies phase rotation
test("resumWithTuning with delay changes the response", () => {
  const seatIds = ["rsp"];
  const transfers = makePerSourceTransfers(2, seatIds, [20, 50, 100]);
  const zeroTuning = [{ delayMs: 0, gainDb: 0, polarity: 0 }, { delayMs: 0, gainDb: 0, polarity: 0 }];
  const delayedTuning = [{ delayMs: 5, gainDb: 0, polarity: 0 }, { delayMs: 0, gainDb: 0, polarity: 0 }];
  const zeroResult = resumWithTuning(transfers, zeroTuning, seatIds);
  const delayedResult = resumWithTuning(transfers, delayedTuning, seatIds);
  // The delayed response should differ from the zero-delay response
  let anyDifference = false;
  for (let i = 0; i < zeroResult.rsp.splDb.length; i++) {
    if (Math.abs(zeroResult.rsp.splDb[i] - delayedResult.rsp.splDb[i]) > 0.01) {
      anyDifference = true;
      break;
    }
  }
  assert.ok(anyDifference, "delay should change the summed response");
});

// TEST 5: Re-summation with polarity inversion
test("resumWithTuning with polarity flip cancels equal sources", () => {
  const seatIds = ["rsp"];
  const transfers = makePerSourceTransfers(2, seatIds, [50]);
  const samePolarity = [{ delayMs: 0, gainDb: 0, polarity: 0 }, { delayMs: 0, gainDb: 0, polarity: 0 }];
  const flippedPolarity = [{ delayMs: 0, gainDb: 0, polarity: 0 }, { delayMs: 0, gainDb: 0, polarity: -1 }];
  const sameResult = resumWithTuning(transfers, samePolarity, seatIds);
  const flippedResult = resumWithTuning(transfers, flippedPolarity, seatIds);
  // With equal sources and flipped polarity, the sum should be ~0 (cancellation)
  // Same polarity: sum = 1.0 → 0 dB; Flipped: sum = 0 → -inf dB (clamped to -200)
  assert.ok(flippedResult.rsp.splDb[0] < -100, "flipped polarity should cancel equal sources");
  assert.ok(Math.abs(sameResult.rsp.splDb[0]) < 1e-6, "same polarity should sum to ~0 dB");
});

// TEST 6: Muted sub detection with preserved tuning
test("detectMutedSubs identifies subs with gainDb <= -30", () => {
  const sources = [
    { id: "sub-1", tuning: { gainDb: 0, delayMs: 0, polarity: 0 } },
    { id: "sub-2", tuning: { gainDb: -35, delayMs: 0, polarity: 0 } },
    { id: "sub-3", tuning: { gainDb: -3, delayMs: 2, polarity: 0 } },
    { id: "sub-4", tuning: { gainDb: -40, delayMs: 0, polarity: 1 } },
  ];
  const result = detectMutedSubs(sources);
  assert.equal(result.activeCount, 2, "should have 2 active subs (sub-1, sub-3)");
  assert.equal(result.mutedCount, 2, "should have 2 muted subs (sub-2, sub-4)");
  assert.ok(result.mutedIds.includes("sub-2"), "sub-2 should be muted");
  assert.ok(result.mutedIds.includes("sub-4"), "sub-4 should be muted");
});

// TEST 7: Muted sub detection with no tuning field (backward compat)
test("detectMutedSubs treats missing tuning as active (0 dB)", () => {
  const sources = [
    { id: "sub-1" },
    { id: "sub-2", tuning: { gainDb: -35 } },
  ];
  const result = detectMutedSubs(sources);
  assert.equal(result.activeCount, 1, "sub-1 should be active (no tuning = 0 dB)");
  assert.equal(result.mutedCount, 1, "sub-2 should be muted");
});

// TEST 8: Practicality preference — practical wins over side-wall on tie
test("practical layout preferred over side-wall when both on Pareto front and tied", () => {
  const roomDims = { widthM: 6, lengthM: 8 };
  const practical = makeFinalist({
    finalistId: "practical-1",
    coordinates: [{ x: 0, y: 0 }, { x: 0, y: 8 }], // front+rear (not side-wall)
    p19VariationBySeat: [1.0, 1.0],
    p20VariationBySeat: [2.0, 2.0],
  });
  const sideWall = makeFinalist({
    finalistId: "sidewall-1",
    coordinates: [{ x: 0, y: 4 }, { x: 6, y: 4 }], // left+right (side-wall)
    p19VariationBySeat: [1.0, 1.0],
    p20VariationBySeat: [2.0, 2.0],
  });
  const quantityResult = { evaluatedFinalists: [practical, sideWall] };
  const selection = selectAuthoritativeFinalist(quantityResult, roomDims, null);
  assert.ok(selection.winner, "should have a winner");
  assert.equal(selection.winner.finalistId, "practical-1", "practical should win on tie");
});

// TEST 9: Practicality preference — materially better side-wall is NOT vetoed
test("materially better side-wall candidate is not vetoed by practicality", () => {
  const roomDims = { widthM: 6, lengthM: 8 };
  const practical = makeFinalist({
    finalistId: "practical-1",
    coordinates: [{ x: 0, y: 0 }, { x: 0, y: 8 }],
    p19VariationBySeat: [3.0, 3.0],
    p20VariationBySeat: [4.0, 4.0],
  });
  const sideWall = makeFinalist({
    finalistId: "sidewall-1",
    coordinates: [{ x: 0, y: 4 }, { x: 6, y: 4 }],
    p19VariationBySeat: [0.5, 0.5],
    p20VariationBySeat: [0.5, 0.5],
  });
  const quantityResult = { evaluatedFinalists: [practical, sideWall] };
  const selection = selectAuthoritativeFinalist(quantityResult, roomDims, null);
  assert.ok(selection.winner, "should have a winner");
  // Side-wall is materially better on both axes — should win despite being side-wall
  assert.equal(selection.winner.finalistId, "sidewall-1", "materially better side-wall should win");
});

// TEST 10: Current layout kept when no finalist dominates it
test("current layout is kept when no finalist Pareto-dominates it", () => {
  const roomDims = { widthM: 6, lengthM: 8 };
  const current = makeFinalist({
    finalistId: "current",
    coordinates: [{ x: 0, y: 0 }, { x: 0, y: 8 }],
    p19VariationBySeat: [1.0, 1.0],
    p20VariationBySeat: [1.0, 1.0],
  });
  const worse = makeFinalist({
    finalistId: "worse-1",
    coordinates: [{ x: 0, y: 0 }, { x: 0, y: 8 }],
    p19VariationBySeat: [2.0, 2.0],
    p20VariationBySeat: [2.0, 2.0],
  });
  const quantityResult = { evaluatedFinalists: [worse] };
  const currentLayout = {
    sources: [{ x: 0, y: 0, tuning: { gainDb: 0 } }, { x: 0, y: 8, tuning: { gainDb: 0 } }],
    metrics: {
      perSeatP19: current.perSeatP19,
      perSeatP20: current.perSeatP20,
      p18AchievedLevel: current.p18AchievedLevel,
      achievedP18Hz: current.achievedP18Hz,
      p14AchievedLevel: current.p14AchievedLevel,
      p14AchievedDb: current.p14AchievedDb,
    },
  };
  const selection = selectAuthoritativeFinalist(quantityResult, roomDims, currentLayout);
  assert.equal(selection.isCurrent, true, "current should be kept when no finalist dominates");
  assert.equal(selection.winner, null, "no winner when current is best");
});

// TEST 11: classifyVersusCurrent identifies joint improvement
test("classifyVersusCurrent identifies joint improvement correctly", () => {
  const current = { p19VariationDb: 3.0, p20VariationDb: 4.0 };
  const candidate = { p19VariationDb: 1.0, p20VariationDb: 2.0 };
  const result = classifyVersusCurrent(candidate, current);
  assert.equal(result.type, "improvement", "both metrics improve → improvement");
  assert.ok(result.p19Delta > 0, "p19Delta should be positive (improvement)");
  assert.ok(result.p20Delta > 0, "p20Delta should be positive (improvement)");
});

// TEST 12: classifyVersusCurrent identifies trade-off
test("classifyVersusCurrent identifies trade-off correctly", () => {
  const current = { p19VariationDb: 2.0, p20VariationDb: 2.0 };
  const candidate = { p19VariationDb: 0.5, p20VariationDb: 4.0 };
  const result = classifyVersusCurrent(candidate, current);
  assert.equal(result.type, "trade-off", "one improves, one worsens → trade-off");
  assert.ok(result.p19Delta > 0, "p19 improves");
  assert.ok(result.p20Delta < 0, "p20 worsens");
});

// ── Additional edge case tests ────────────────────────────────────────────

// TEST 13: Delay search with single source (no front/rear split)
test("delay-only search with single source returns zero delay", () => {
  const sources = [{ yNorm: 0.1 }];
  const rspTransfers = makeRspTransfersWithNull(1);
  const result = searchDelayOnly(rspTransfers, sources);
  // With only front subs (no rear), delay search is trivial — best delay = 0
  assert.equal(result.bestDelayMs, 0, "single-group delay should be 0");
});

// TEST 14: Level+delay search with all rear sources (no front)
test("level+delay search with all-rear sources returns zero tuning", () => {
  const sources = [{ yNorm: 0.9 }, { yNorm: 0.8 }];
  const rspTransfers = makeRspTransfersWithNull(2);
  const result = searchLevelAndDelay(rspTransfers, sources);
  // No front subs → no delay/level search → all zero
  assert.equal(result.bestDelayMs, 0, "no front subs → zero delay");
  assert.equal(result.bestGainDb, 0, "no front subs → zero gain");
  for (const t of result.tuning) {
    assert.equal(t.delayMs, 0, "all tuning should be zero");
    assert.equal(t.gainDb, 0, "all gain should be zero");
  }
});

// TEST 15: Empty input handling
test("searchDelayOnly handles empty input gracefully", () => {
  const result = searchDelayOnly([], []);
  assert.ok(Array.isArray(result.tuning), "should return tuning array");
  assert.equal(result.tuning.length, 0, "empty input → empty tuning");
  assert.equal(result.bestDelayMs, 0, "empty input → zero delay");
});

// TEST 16: detectMutedSubs with empty input
test("detectMutedSubs handles empty input", () => {
  const result = detectMutedSubs([]);
  assert.equal(result.activeCount, 0);
  assert.equal(result.mutedCount, 0);
  assert.equal(result.mutedIds.length, 0);
});