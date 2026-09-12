/**
 * p5-authority-consistency.test.mjs
 * ---------------------------------
 * Regression tests proving P5 Compliance and Design Rating consume the SAME
 * canonical per-seat engine authority, and that a calculated >80° P5 remains
 * L1 (never reinterpreted as N/A) while a genuinely unassessable P5 is excluded.
 *
 * Tests:
 *   A. P5 90° → Compliance L1
 *   B. P5 90° → Design Rating L1 (raw value included, not excluded)
 *   C. P5 90° → P5 appears as contributor where relevant
 *   D. genuinely unassessable P5 → Compliance N/A
 *   E. genuinely unassessable P5 → excluded from Design Rating
 *   F. changing from unassessable → 90° updates both surfaces in same render cycle
 *   G. changing from 90° → unassessable removes P5 from both surfaces
 *   H. switching away from Plan view does not leave Compliance stale
 *   I. all seat-scoped parameters use consistent current authority
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSeatMetric } from '@/components/rp22/resolveSeatMetric';
import { rp22LevelForP5 } from '@/components/utils/p5SurroundGaps';
import { buildDesignRatingInput } from '@/components/report/technical/buildDesignRatingInput';

// ── Helpers ──────────────────────────────────────────────────────────────

const SEAT_ID = 'seat-1';

/** Build a fresh engine P5 metric for a given gap in degrees */
function engineP5Metric(gapDeg) {
  return {
    valueDeg: gapDeg,
    level: rp22LevelForP5(gapDeg),
    formatted: `${Math.round(gapDeg)}°`,
  };
}

/** Build a stale UI-cache "Not Calculated" P5 metric */
function staleP5Metric() {
  return { value: null, formatted: 'Not Calculated', hudLabel: 'Not Calculated', level: '—' };
}

/** Build a "genuinely unassessable" P5 (no overheads / not_applicable) */
function naP5Metric() {
  return { value: null, formatted: 'N/A', level: 'N/A', status: 'not_applicable' };
}

/** Build an analysisResult with perSeatRp22 for one seat */
function analysisWithEngineP5(p5Metric) {
  return {
    perSeatRp22: {
      [SEAT_ID]: {
        rp22: {
          5: p5Metric,
        },
      },
    },
    gradedParameters: { primary: {} },
  };
}

/** Build a UI cache (seatSnapshotsById) with a stale P5 for one seat */
function staleUiCache(p5Metric) {
  return {
    [SEAT_ID]: {
      rp22: { p5: p5Metric },
    },
  };
}

// ── P5 Grading regression lock ───────────────────────────────────────────

test('P5 grading: 50° → L4', () => {
  assert.equal(rp22LevelForP5(50), 'L4');
});

test('P5 grading: 51° → L3', () => {
  assert.equal(rp22LevelForP5(51), 'L3');
});

test('P5 grading: 60° → L3', () => {
  assert.equal(rp22LevelForP5(60), 'L3');
});

test('P5 grading: 61° → L2', () => {
  assert.equal(rp22LevelForP5(61), 'L2');
});

test('P5 grading: 80° → L2', () => {
  assert.equal(rp22LevelForP5(80), 'L2');
});

test('P5 grading: 81° → L1', () => {
  assert.equal(rp22LevelForP5(81), 'L1');
});

test('P5 grading: 90° → L1', () => {
  assert.equal(rp22LevelForP5(90), 'L1');
});

test('P5 grading: 171° → L1', () => {
  assert.equal(rp22LevelForP5(171), 'L1');
});

// ── A. P5 90° → Compliance L1 (fresh engine preferred over stale cache) ──

test('A: P5 90° → Compliance resolves L1 from fresh engine, not stale cache', () => {
  const analysis = analysisWithEngineP5(engineP5Metric(90));
  const staleCache = staleUiCache(staleP5Metric()); // UI cache says "Not Calculated"

  const metric = resolveSeatMetric(SEAT_ID, 'p5', analysis, staleCache, 'mlp');

  assert.ok(metric, 'resolveSeatMetric must return the engine metric');
  assert.equal(metric.valueDeg, 90);
  assert.equal(metric.level, 'L1');
  assert.equal(metric.formatted, '90°');
});

// ── B. P5 90° → Design Rating L1 (raw value included, not excluded) ──────

test('B: P5 90° → Design Rating includes raw value (not excluded as na)', () => {
  const seats = [{ id: SEAT_ID }];
  const analysis = {
    perSeatRp22: {
      [SEAT_ID]: { rp22: { 5: engineP5Metric(90) } },
    },
    gradedParameters: { primary: {} }, // no room-level P5 null guard
  };

  // Build the same lightweight seat HUD that useAppDesignRating builds
  const reportSeatHudById = {
    [SEAT_ID]: { rp22: { p5: engineP5Metric(90) } },
  };

  const input = buildDesignRatingInput({
    seats,
    analysisResult: analysis,
    reportSeatHudById,
    completedBassAuthority: null,
    completedBassPresentation: { parameters: {} },
  });

  assert.ok(input.p5, 'P5 seat scope must exist');
  assert.equal(typeof input.p5[SEAT_ID], 'number');
  assert.equal(input.p5[SEAT_ID], 90);
  assert.notEqual(input.p5[SEAT_ID], 'na');
});

// ── C. P5 90° → P5 appears as contributor where relevant ────────────────

test('C: P5 90° raw value is a numeric contributor (not null, not "na")', () => {
  const seats = [{ id: SEAT_ID }];
  const analysis = {
    perSeatRp22: { [SEAT_ID]: { rp22: { 5: engineP5Metric(90) } } },
    gradedParameters: { primary: {} },
  };
  const reportSeatHudById = { [SEAT_ID]: { rp22: { p5: engineP5Metric(90) } } };

  const input = buildDesignRatingInput({
    seats,
    analysisResult: analysis,
    reportSeatHudById,
    completedBassAuthority: null,
    completedBassPresentation: { parameters: {} },
  });

  // A contributor is a finite numeric raw value — not null, not "na"
  const p5Val = input.p5[SEAT_ID];
  assert.equal(typeof p5Val, 'number');
  assert.ok(Number.isFinite(p5Val));
  assert.notEqual(p5Val, 'na');
  assert.notEqual(p5Val, null);
});

// ── D. genuinely unassessable P5 → Compliance N/A ────────────────────────

test('D: genuinely unassessable P5 → Compliance resolves N/A', () => {
  const analysis = analysisWithEngineP5(naP5Metric());
  const cache = {};

  const metric = resolveSeatMetric(SEAT_ID, 'p5', analysis, cache, 'mlp');

  assert.ok(metric);
  assert.equal(metric.level, 'N/A');
  assert.equal(metric.status, 'not_applicable');
});

// ── E. genuinely unassessable P5 → excluded from Design Rating ───────────

test('E: genuinely unassessable P5 → Design Rating excludes (na)', () => {
  const seats = [{ id: SEAT_ID }];
  const analysis = {
    perSeatRp22: { [SEAT_ID]: { rp22: { 5: naP5Metric() } } },
    gradedParameters: { primary: {} },
  };
  const reportSeatHudById = { [SEAT_ID]: { rp22: { p5: naP5Metric() } } };

  const input = buildDesignRatingInput({
    seats,
    analysisResult: analysis,
    reportSeatHudById,
    completedBassAuthority: null,
    completedBassPresentation: { parameters: {} },
  });

  assert.equal(input.p5[SEAT_ID], 'na');
});

// ── F. unassessable → 90° updates both surfaces in same render cycle ─────

test('F: transitioning from unassessable → 90° updates both Compliance and Design Rating', () => {
  // Before: unassessable
  const analysisBefore = analysisWithEngineP5(naP5Metric());
  const cacheBefore = {};
  const metricBefore = resolveSeatMetric(SEAT_ID, 'p5', analysisBefore, cacheBefore, 'mlp');
  assert.equal(metricBefore.level, 'N/A');

  const seats = [{ id: SEAT_ID }];
  const reportHudBefore = { [SEAT_ID]: { rp22: { p5: naP5Metric() } } };
  const inputBefore = buildDesignRatingInput({
    seats,
    analysisResult: analysisBefore,
    reportSeatHudById: reportHudBefore,
    completedBassAuthority: null,
    completedBassPresentation: { parameters: {} },
  });
  assert.equal(inputBefore.p5[SEAT_ID], 'na');

  // After: 90° (same render cycle — fresh engine result)
  const analysisAfter = analysisWithEngineP5(engineP5Metric(90));
  const cacheAfter = staleUiCache(staleP5Metric()); // stale UI cache still says "Not Calculated"
  const metricAfter = resolveSeatMetric(SEAT_ID, 'p5', analysisAfter, cacheAfter, 'mlp');
  assert.equal(metricAfter.level, 'L1');
  assert.equal(metricAfter.valueDeg, 90);

  const reportHudAfter = { [SEAT_ID]: { rp22: { p5: engineP5Metric(90) } } };
  const inputAfter = buildDesignRatingInput({
    seats,
    analysisResult: analysisAfter,
    reportSeatHudById: reportHudAfter,
    completedBassAuthority: null,
    completedBassPresentation: { parameters: {} },
  });
  assert.equal(inputAfter.p5[SEAT_ID], 90);
  assert.notEqual(inputAfter.p5[SEAT_ID], 'na');
});

// ── G. 90° → unassessable removes P5 from both surfaces ──────────────────

test('G: transitioning from 90° → unassessable removes P5 from both surfaces', () => {
  // Before: 90°
  const analysisBefore = analysisWithEngineP5(engineP5Metric(90));
  const metricBefore = resolveSeatMetric(SEAT_ID, 'p5', analysisBefore, {}, 'mlp');
  assert.equal(metricBefore.level, 'L1');

  // After: unassessable
  const analysisAfter = analysisWithEngineP5(naP5Metric());
  const metricAfter = resolveSeatMetric(SEAT_ID, 'p5', analysisAfter, {}, 'mlp');
  assert.equal(metricAfter.level, 'N/A');

  const seats = [{ id: SEAT_ID }];
  const reportHudAfter = { [SEAT_ID]: { rp22: { p5: naP5Metric() } } };
  const inputAfter = buildDesignRatingInput({
    seats,
    analysisResult: analysisAfter,
    reportSeatHudById: reportHudAfter,
    completedBassAuthority: null,
    completedBassPresentation: { parameters: {} },
  });
  assert.equal(inputAfter.p5[SEAT_ID], 'na');
});

// ── H. switching away from Plan view does not leave Compliance stale ──────

test('H: empty UI cache (Plan view not mounted) → Compliance still resolves from fresh engine', () => {
  // Simulate: Plan view not mounted → useSeatMetricsCacheEffect never ran →
  // seatSnapshotsById is EMPTY. The fresh engine result must still be used.
  const analysis = analysisWithEngineP5(engineP5Metric(90));
  const emptyCache = {}; // no UI cache at all

  const metric = resolveSeatMetric(SEAT_ID, 'p5', analysis, emptyCache, 'mlp');

  assert.ok(metric, 'must resolve from engine even with empty UI cache');
  assert.equal(metric.level, 'L1');
  assert.equal(metric.valueDeg, 90);
});

test('H2: stale UI cache with old "Not Calculated" → fresh engine L1 wins', () => {
  // Simulate: Plan view WAS mounted earlier (cache populated with old
  // "Not Calculated"), then user switched to Front Elevation. The engine
  // has since computed P5 = 90°. The stale cache must NOT override the
  // fresh engine result.
  const analysis = analysisWithEngineP5(engineP5Metric(90));
  const staleCache = staleUiCache(staleP5Metric());

  const metric = resolveSeatMetric(SEAT_ID, 'p5', analysis, staleCache, 'mlp');

  assert.equal(metric.level, 'L1');
  assert.equal(metric.valueDeg, 90);
  assert.notEqual(metric.formatted, 'Not Calculated');
});

// ── I. all seat-scoped parameters use consistent current authority ───────

test('I: all seat-scoped parameter keys prefer fresh engine over stale UI cache', () => {
  const seatParamKeys = ['p1', 'p4', 'p5', 'p6', 'p9', 'p10', 'p16', 'p17', 'p19', 'p20'];

  // Engine has real values for ALL seat-scoped params
  const engineRp22 = {};
  for (const key of seatParamKeys) {
    const numKey = parseInt(key.replace('p', ''), 10);
    engineRp22[numKey] = { valueDeg: 90, level: 'L1', formatted: '90°', _source: 'engine' };
  }

  const analysis = {
    perSeatRp22: { [SEAT_ID]: { rp22: engineRp22 } },
    gradedParameters: { primary: {} },
  };

  // UI cache has stale "Not Calculated" for ALL seat-scoped params
  const staleCache = {};
  const staleRp22 = {};
  for (const key of seatParamKeys) {
    staleRp22[key] = { value: null, formatted: 'Not Calculated', level: '—', _source: 'cache' };
  }
  staleCache[SEAT_ID] = { rp22: staleRp22 };

  for (const key of seatParamKeys) {
    const metric = resolveSeatMetric(SEAT_ID, key, analysis, staleCache, 'mlp');
    assert.ok(metric, `${key} must resolve`);
    assert.equal(metric._source, 'engine', `${key} must come from fresh engine, not stale cache`);
    assert.equal(metric.level, 'L1', `${key} must show L1 from engine`);
  }
});

test('I2: locally-computed params (P16) fall back to UI cache when engine lacks them', () => {
  // P16 is locally computed by buildSeatHudSnapshot when the engine doesn't
  // publish it. The UI cache must still be used as a fallback.
  const analysis = {
    perSeatRp22: { [SEAT_ID]: { rp22: {} } }, // engine has no P16
    gradedParameters: { primary: {} },
  };
  const cache = {
    [SEAT_ID]: {
      rp22: {
        p16: { value: null, formatted: 'FL 35°', level: 'L2', _source: 'cache', worstRole: 'FL', worstAngleDeg: 35 },
      },
    },
  };

  const metric = resolveSeatMetric(SEAT_ID, 'p16', analysis, cache, 'mlp');
  assert.ok(metric, 'P16 must resolve from UI cache fallback');
  assert.equal(metric._source, 'cache');
  assert.equal(metric.level, 'L2');
});

// ── "mlp" synthetic seat resolution ───────────────────────────────────────

test('mlp synthetic seat resolves from engine perSeatRp22["mlp"]', () => {
  const analysis = {
    perSeatRp22: {
      mlp: { rp22: { 5: engineP5Metric(90) } },
    },
    gradedParameters: { primary: {} },
  };

  const metric = resolveSeatMetric('mlp', 'p5', analysis, {}, 'mlp');
  assert.ok(metric);
  assert.equal(metric.level, 'L1');
  assert.equal(metric.valueDeg, 90);
});

test('real seat ID resolves from engine, not from "mlp" fallback', () => {
  const analysis = {
    perSeatRp22: {
      [SEAT_ID]: { rp22: { 5: engineP5Metric(90) } }, // real seat: 90° L1
      mlp: { rp22: { 5: engineP5Metric(45) } },      // mlp: 45° L4
    },
    gradedParameters: { primary: {} },
  };

  const metric = resolveSeatMetric(SEAT_ID, 'p5', analysis, {}, 'mlp');
  assert.equal(metric.valueDeg, 90, 'must resolve the real seat, not the mlp fallback');
  assert.equal(metric.level, 'L1');
});