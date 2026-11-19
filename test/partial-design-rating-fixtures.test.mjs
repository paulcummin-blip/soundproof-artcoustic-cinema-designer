// partial-design-rating-fixtures.test.mjs
// ---------------------------------------
// Validation fixtures for the Live Partial Artcoustic System Design Rating.
//
// Confirms that the EXISTING scoring core (buildArtcousticDesignRatingAuthority
// + calculateRoomDesignRating / calculateScopedRoomDesignRating) produces the
// correct partial contribution list from partial evidence, and that the new
// summarisePartialDesignRating coverage helper reports assessed vs unavailable
// parameters correctly without inventing scores for missing results.
//
// Run: node src/test/_p7-run.mjs test/partial-design-rating-fixtures.test.mjs
import { test } from 'vitest';
import assert from 'node:assert/strict';

import {
  buildArtcousticDesignRatingAuthority,
  calculateRoomDesignRating,
  calculateScopedRoomDesignRating,
  calculateSeatDesignRating,
} from '../src/components/report/technical/artcousticSystemDesignRating.js';
import { summarisePartialDesignRating } from '../src/components/report/technical/partialDesignRatingCoverage.js';

const approx = (a, b, t = 0.01) => Math.abs(a - b) < t;
const SEATS2 = [{ id: 's1' }, { id: 's2' }];

// ── 1. Valid partial room evidence: some room params scored, bass missing ──
test('P1: partial room evidence — P2/P12 scored, bass provisional', () => {
  const auth = buildArtcousticDesignRatingAuthority({
    seats: SEATS2,
    p2: { rawValue: 15 },                  // L4 (room, weight 8)
    p3: { rawValue: 0 },                    // L4 (room, weight 5)
    p12: { rawValue: 111, mode: 'minimum' },// L4 (room, weight 8)
    p13: { rawValue: 105, mode: 'minimum' },// L4 (room, weight 7)
    // p14/p18 not provided → provisional (bass not yet specified)
    // seat-scope p1/p4/p5/p6/p16/p17/screen not provided → provisional
    p7: { na: true },                       // no front wides → genuine N/A
  });
  const rating = calculateRoomDesignRating(auth);

  // Contributions must contain only the scored room params — no bass, no
  // invented provisional entries.
  const keys = (rating.contributions || []).map((c) => c.key);
  assert.ok(keys.includes('p2') && keys.includes('p12'));
  assert.ok(!keys.includes('p14') && !keys.includes('p18'));
  assert.ok(!keys.includes('p1') && !keys.includes('screen'));
  // P7 N/A excluded from contributions
  assert.ok(!keys.includes('p7'));

  // DPI is additive from scored params only: P2(8*12=96)+P3(3*12=36)+P12(8*12=96)+P13(7*12=84)=312 → /10 = 31
  assert.equal(rating.designPerformanceIndex, 31);
  assert.equal(rating.status, 'COMPLETE');

  // Coverage helper: bass unavailable, non-bass assessed.
  const cov = summarisePartialDesignRating(auth, auth.seatIds);
  assert.equal(cov.status, 'PARTIAL');
  assert.ok(cov.assessedWeight > 0);
  assert.ok(cov.fullApplicableWeight > cov.assessedWeight, 'applicable set larger than assessed (bass/seat params outstanding)');
  assert.ok(cov.bassUnavailable, 'bass reported unavailable');
  assert.ok(cov.bassUnavailableKeys.includes('p14'));
  assert.ok(cov.bassUnavailableKeys.includes('p18'));
  assert.ok(cov.coveragePercent > 0 && cov.coveragePercent < 100);
});

// ── 2. Valid partial seat evidence: some seats scored, some missing ──
//    The scorer scores a seat-scope param when at least one seat is scored;
//    missing seats are skipped INDIVIDUALLY (never excluding the whole param).
test('P2: partial seat evidence — one seat scored, one missing', () => {
  const auth = buildArtcousticDesignRatingAuthority({
    seats: SEATS2,
    p4: { s1: 1, s2: null },  // s1 L4, s2 missing → param scored (s2 skipped)
    p12: { rawValue: 111, mode: 'minimum' }, // room L4
  });
  assert.equal(auth.parameters.p4.state, 'scored');
  const rating = calculateRoomDesignRating(auth);
  // P4 is scored from s1 alone — it IS in contributions.
  const p4 = (rating.contributions || []).find((c) => c.key === 'p4');
  assert.ok(p4, 'P4 scored from the available seat');
  assert.equal(p4.resultLevel, 'L4');

  const cov = summarisePartialDesignRating(auth, auth.seatIds);
  assert.ok(cov.assessedParameterKeys.includes('p4'));
  assert.ok(!cov.unavailableParameterKeys.includes('p4'));

  // In a scope containing only the missing seat, P4 has no scored seat → unavailable.
  const covMissingOnly = summarisePartialDesignRating(auth, ['s2']);
  assert.ok(covMissingOnly.unavailableParameterKeys.includes('p4'));
});

// ── 3. Missing bass parameters: all bass provisional, non-bass scored ──
test('P3: missing bass does not suppress non-bass contributions', () => {
  const auth = buildArtcousticDesignRatingAuthority({
    seats: SEATS2,
    p2: { rawValue: 15 },
    p3: { rawValue: 0 },
    p12: { rawValue: 111, mode: 'minimum' },
    p13: { rawValue: 105, mode: 'minimum' },
    p1: { s1: 1.5, s2: 1.5 },   // L4 seat-scope
    p4: { s1: 1, s2: 1 },       // L4 seat-scope
    screen: { s1: 55, s2: 55 }, // L4 seat-scope
    // No bass at all (p14/p18/p19/p20) → all provisional
  });
  const rating = calculateRoomDesignRating(auth);
  const keys = (rating.contributions || []).map((c) => c.key);
  assert.ok(keys.includes('p1') && keys.includes('p4') && keys.includes('screen'));
  assert.ok(!keys.includes('p14') && !keys.includes('p18') && !keys.includes('p19') && !keys.includes('p20'));

  const cov = summarisePartialDesignRating(auth, auth.seatIds);
  assert.ok(cov.bassUnavailable);
  assert.deepEqual(cov.bassUnavailableKeys.sort(), ['p14', 'p18', 'p19', 'p20']);
  // Non-bass params are assessed
  assert.ok(cov.assessedParameterKeys.includes('p1'));
  assert.ok(cov.assessedParameterKeys.includes('p4'));
  assert.ok(cov.assessedParameterKeys.includes('screen'));
});

// ── 4. Missing individual-seat results: N/A seat excluded without provisional ──
test('P4: N/A seat excluded from coverage without making param unavailable', () => {
  const auth = buildArtcousticDesignRatingAuthority({
    seats: SEATS2,
    p9: { s1: 50, s2: 'na' },  // s1 scored, s2 genuine N/A → param scored
    p12: { rawValue: 111, mode: 'minimum' },
  });
  assert.equal(auth.parameters.p9.state, 'scored');
  const cov = summarisePartialDesignRating(auth, auth.seatIds);
  assert.ok(cov.assessedParameterKeys.includes('p9'));
  assert.ok(!cov.unavailableParameterKeys.includes('p9'));
});

// ── 5. Primary-only and mixed-priority seating scopes ──
test('P5: scoped coverage — Primary-only and mixed priorities', () => {
  const auth = buildArtcousticDesignRatingAuthority({
    seats: [
      { id: 'p1', priority: 'primary' },
      { id: 'p2', priority: 'primary' },
      { id: 's1', priority: 'secondary' },
    ],
    p4: { p1: 1, p2: 3, s1: null }, // p1 L4, p2 L3, s1 missing
    p12: { rawValue: 111, mode: 'minimum' },
  });
  const allCov = summarisePartialDesignRating(auth, auth.seatIds);
  // p4 is scored overall (p1/p2 scored) → assessed in All scope
  assert.ok(allCov.assessedParameterKeys.includes('p4'));

  // In a Secondary-only scope, p4 has no scored seat (s1 missing) → unavailable.
  const secCov = summarisePartialDesignRating(auth, ['s1']);
  assert.ok(secCov.unavailableParameterKeys.includes('p4'));
  assert.ok(!secCov.assessedParameterKeys.includes('p4'));

  // In a Primary-only scope, p4 has scored seats → assessed.
  const priCov = summarisePartialDesignRating(auth, ['p1', 'p2']);
  assert.ok(priCov.assessedParameterKeys.includes('p4'));
});

// ── 6. Changes to speaker/seat positions update the relevant score ──
test('P6: changing a seat input changes the contribution and DPI', () => {
  const before = buildArtcousticDesignRatingAuthority({
    seats: SEATS2,
    p4: { s1: 1, s2: 1 }, // L4 (12)
    p12: { rawValue: 111, mode: 'minimum' },
  });
  const beforeRating = calculateRoomDesignRating(before);
  const after = buildArtcousticDesignRatingAuthority({
    seats: SEATS2,
    p4: { s1: 7, s2: 7 }, // FAIL (-5) — position worsened
    p12: { rawValue: 111, mode: 'minimum' },
  });
  const afterRating = calculateRoomDesignRating(after);
  assert.ok(afterRating.designPerformanceIndex < beforeRating.designPerformanceIndex, 'DPI decreases when a seat result worsens');
  const afterP4 = (afterRating.contributions || []).find((c) => c.key === 'p4');
  assert.equal(afterP4.resultLevel, 'FAIL');
});

// ── 7. Room-level-null guard: a null room result excludes all seat values ──
//     This guard lives in buildDesignRatingInput, not the authority builder,
//     so here we verify the authority honours explicit null seat inputs.
test('P7: room-level-null guard — null seat input → provisional, not FAIL', () => {
  const auth = buildArtcousticDesignRatingAuthority({
    seats: SEATS2,
    p4: { s1: null, s2: null }, // both null → provisional
  });
  assert.equal(auth.parameters.p4.state, 'provisional');
  assert.equal(auth.parameters.p4.seats.s1.level, null);
  assert.notEqual(auth.parameters.p4.seats.s1.level, 'FAIL');
  const rating = calculateRoomDesignRating(auth);
  const hasP4 = (rating.contributions || []).some((c) => c.key === 'p4');
  assert.equal(hasP4, false);
});

// ── 8. Coverage NOT 100% when applicable-but-unassessed params exist ──
test('P8: coverage reflects outstanding applicable parameters', () => {
  const auth = buildArtcousticDesignRatingAuthority({
    seats: SEATS2,
    p2: { rawValue: 15 }, // L4 — one assessed room param
    // p3, p11, p12, p13, p14, p18, all seat params, screen all provisional/missing
  });
  const cov = summarisePartialDesignRating(auth, auth.seatIds);
  assert.ok(cov.coveragePercent < 100, 'coverage < 100% with outstanding params');
  assert.ok(cov.fullApplicableCount > cov.assessedCount);
  assert.ok(cov.unavailableGroups['Dynamic Range'], 'Dynamic Range group has unavailable params');
});

// ── 9. No valid evidence → NOT_ASSESSED, coverage zero ──
test('P9: no valid evidence → NOT_ASSESSED', () => {
  const auth = buildArtcousticDesignRatingAuthority({
    seats: SEATS2,
    // everything missing
  });
  const rating = calculateRoomDesignRating(auth);
  assert.equal(rating.status, 'NOT_ASSESSED');
  const cov = summarisePartialDesignRating(auth, auth.seatIds);
  assert.equal(cov.status, 'NOT_ASSESSED');
  assert.equal(cov.assessedWeight, 0);
  assert.equal(cov.coveragePercent, 0);
});

// ── 10. Individual seat rating from partial evidence ──
test('P10: individual seat rating uses only that seat + room evidence', () => {
  const auth = buildArtcousticDesignRatingAuthority({
    seats: SEATS2,
    p4: { s1: 1, s2: null },    // s1 scored, s2 missing
    p12: { rawValue: 111, mode: 'minimum' },
  });
  const r1 = calculateSeatDesignRating(auth, 's1');
  const r2 = calculateSeatDesignRating(auth, 's2');
  // s1 has P4 scored; s2 has P4 provisional (excluded) → s1 DPI > s2 DPI
  assert.ok(r1.designPerformanceIndex > r2.designPerformanceIndex);
  assert.equal(r1.status, 'COMPLETE');
});