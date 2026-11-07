/**
 * Focused automated acceptance tests for the ADI Subwoofer Design
 * preparation work: cross-quantity scope, physical vs processed evidence
 * separation, Primary/Secondary P20 subgroup summaries, shared destructive-
 * null safeguard, and quantity-aware Apply/Undo.
 *
 * Run: node test/subwoofer-design-prep.test.mjs
 *
 * Pure: no React, no database, no acoustic physics. Each module is tested in
 * isolation against controlled fixtures.
 */

import { register } from 'node:module';
register('./_alias-loader.mjs', import.meta.url);

import assert from 'node:assert/strict';

import {
  RECOMMENDATION_QUANTITIES,
  isRecommendationQuantitySet,
  normaliseRecommendationScope,
  resolveRecommendationQuantityOrder,
} from '../src/components/room/bass/stage1/stage1RecommendationScope.js';
import {
  buildZeroTuningPhysicalResponse,
  classifyCandidateEvidence,
} from '../src/components/room/bass/stage2/placementEvidenceAuthority.js';
import {
  buildP20SubgroupSummary,
  buildCandidateP20Subgroups,
} from '../src/components/room/bass/stage2/candidateP20SubgroupSummary.js';
import {
  assessSharedNullSafeguard,
} from '../src/components/room/bass/stage2/sharedNullSafeguard.js';
import {
  buildInstanceSnapshot,
  restoreInstanceSnapshot,
  isCandidateStale,
  buildQuantityApplyInstances,
  buildQuantityApplyProvenance,
  resolveQuantityApplyState,
} from '../src/components/room/bass/optimiserPlan/quantityPlacementApplyAuthority.js';

const results = [];
function test(name, fn) {
  try {
    fn();
    results.push(`PASS  ${name}`);
  } catch (error) {
    results.push(`FAIL  ${name}\n      ${error.message}`);
  }
}

// ── 1. Cross-quantity recommendation scope ────────────────────────────────────

test('1a. RECOMMENDATION_QUANTITIES is [1, 2, 4] and frozen', () => {
  assert.deepEqual([...RECOMMENDATION_QUANTITIES], [1, 2, 4]);
  assert.ok(Object.isFrozen(RECOMMENDATION_QUANTITIES));
});

test('1b. isRecommendationQuantitySet validates ascending unique 1/2/4', () => {
  assert.equal(isRecommendationQuantitySet([1, 2, 4]), true);
  assert.equal(isRecommendationQuantitySet([1, 4]), true);
  assert.equal(isRecommendationQuantitySet([2]), true);
  assert.equal(isRecommendationQuantitySet([1, 2, 3, 4]), false, '3 is excluded');
  assert.equal(isRecommendationQuantitySet([1, 2, 2, 4]), false, 'duplicates rejected');
  assert.equal(isRecommendationQuantitySet([4, 2, 1]), false, 'must be ascending');
  assert.equal(isRecommendationQuantitySet([]), false);
  assert.equal(isRecommendationQuantitySet(null), false);
});

test('1c. normaliseRecommendationScope normalises any valid subset to ascending', () => {
  assert.deepEqual(normaliseRecommendationScope([4, 1, 2]), [1, 2, 4]);
  assert.deepEqual(normaliseRecommendationScope([2, 4]), [2, 4]);
  assert.deepEqual(normaliseRecommendationScope([3, 1, 2, 4]), [1, 2, 4], '3 is filtered, not rejected entirely');
  assert.equal(normaliseRecommendationScope(null), null);
  assert.equal(normaliseRecommendationScope([]), null);
  assert.equal(normaliseRecommendationScope([3]), null, '3-only is not a recommendation scope');
});

test('1d. resolveRecommendationQuantityOrder: recommendation scope takes priority', () => {
  assert.deepEqual(resolveRecommendationQuantityOrder({ recommendationQuantities: [1, 2, 4] }), [1, 2, 4]);
  assert.deepEqual(resolveRecommendationQuantityOrder({ scopeQuantity: 2 }), [2]);
  assert.deepEqual(resolveRecommendationQuantityOrder({ recommendationQuantities: [1, 2, 4], scopeQuantity: 2 }), [1, 2, 4], 'rec wins over scope');
  assert.deepEqual(resolveRecommendationQuantityOrder({ defaultOrder: [2, 4, 1, 3] }), [2, 4, 1, 3]);
  assert.equal(resolveRecommendationQuantityOrder({}), null);
});

// ── 2. Physical vs processed evidence separation ────────────────────────────

function makeRawTransfer({ rspCurve = null, perSeatCurves = [], sources = [], coords = [] } = {}) {
  const rsp = rspCurve || [
    { frequency: 20, spl: 80 }, { frequency: 30, spl: 75 }, { frequency: 50, spl: 70 },
  ];
  return {
    finalistId: 'f1',
    familyId: 'C_FRONT_PAIR',
    quantity: 2,
    coordinates: coords,
    selectedProduct: 'sub3-12',
    rspRawCurve: rsp,
    perSeatRawCurves: perSeatCurves,
    sources: sources.map((s) => ({
      modelKey: 'sub3-12', bottomHeightM: 0, orientation: null, ...s,
      autoAlignDelayMs: s.autoAlignDelayMs ?? 2.5,
    })),
    perSourcePerSeatComplexTransfers: [], // populated by real engine; tests use the curve path
    perSourceRspComplexTransfers: [],
    seatIds: ['rsp', 'seat-1', 'seat-2'],
    seatingPositions: [],
    rspPosition: { id: 'rsp', x: 2.5, y: 3, z: 1.2, __isSyntheticRsp: true },
    autoAlignTuning: [],
    usableLfHz: 20,
    transitionHz: 120,
  };
}

test('2a. buildZeroTuningPhysicalResponse returns null when no per-source transfers', () => {
  const rt = makeRawTransfer();
  assert.equal(buildZeroTuningPhysicalResponse(rt), null);
});

test('2b. classifyCandidateEvidence records processing state honestly', () => {
  const rt = makeRawTransfer({
    sources: [{ x: 1, y: 0, z: 0.25, autoAlignDelayMs: 2.5 }],
    coords: [{ x: 1, y: 0.02 }],
  });
  const canonical = {
    finalistId: 'f1', quantity: 2, coordinates: [{ x: 1, y: 0.02 }],
    achievedP19VariationDb: 1.4, achievedP19Level: 3,
    achievedP20VariationDb: 2.1, achievedP20Level: 3,
    canonicalAuthorityReceipt: { poolId: 'p1' },
    tuningVariant: 'placement-only',
    limited: false,
  };
  const evidence = classifyCandidateEvidence(rt, canonical);
  assert.equal(evidence.physical, null, 'no per-source transfers → physical genuinely unavailable');
  assert.equal(evidence.processed.achievedP19VariationDb, 1.4);
  assert.ok(evidence.processingState.hasAutoAlignDelay, 'auto-align delay honestly recorded');
  assert.ok(evidence.processingState.hasEq, 'EQ honestly recorded');
  assert.equal(evidence.processingState.tuningVariant, 'placement-only');
  assert.equal(evidence.quantity, 2);
  assert.deepEqual(evidence.coordinates, [{ x: 1, y: 0.02 }]);
});

test('2c. classifyCandidateEvidence records models, orientation and heights', () => {
  const rt = makeRawTransfer({
    sources: [
      { x: 1, y: 0, z: 0.25, modelKey: 'sub3-12', bottomHeightM: 0, orientation: 'vertical' },
      { x: 4, y: 0, z: 0.25, modelKey: 'sub3-12', bottomHeightM: 0, orientation: 'vertical' },
    ],
  });
  const evidence = classifyCandidateEvidence(rt, null);
  assert.deepEqual(evidence.models, ['sub3-12', 'sub3-12']);
  assert.deepEqual(evidence.orientation, ['vertical', 'vertical']);
  assert.equal(evidence.heights.length, 2);
  assert.equal(evidence.heights[0].centreZ, 0.25);
});

// ── 3. Primary and Secondary P20 subgroup summaries ─────────────────────────

function makeSeat(id, priority) {
  return { id, x: 1, y: 2, priority };
}

function makePerSeatP20(seats, deviationBySeat) {
  return seats.map((seat) => ({
    seatId: seat.id,
    variationDbRaw: deviationBySeat[seat.id] ?? 1.5,
    level: deviationBySeat[seat.id] != null ? (deviationBySeat[seat.id] <= 2 ? 4 : deviationBySeat[seat.id] <= 3 ? 3 : 2) : 3,
    worstFrequencyHz: 50,
  }));
}

test('3a. buildP20SubgroupSummary: valid 2+ primary seats produce a floor', () => {
  const seats = [makeSeat('s1', 'primary'), makeSeat('s2', 'primary'), makeSeat('s3', 'secondary')];
  const perSeatP20 = makePerSeatP20(seats, { s1: 1.5, s2: 2.8, s3: 1.0 });
  const summary = buildP20SubgroupSummary(perSeatP20, seats, 'primary');
  assert.equal(summary.available, true);
  assert.equal(summary.seatCount, 2);
  assert.equal(summary.floor, 3, 'lowest level across the group (s2 at L3)');
  assert.equal(summary.reason, null);
});

test('3b. buildP20SubgroupSummary: missing P20 evidence returns unavailable', () => {
  const seats = [makeSeat('s1', 'primary'), makeSeat('s2', 'primary')];
  const perSeatP20 = [{ seatId: 's1', variationDbRaw: 1.5, level: 4 }];
  const summary = buildP20SubgroupSummary(perSeatP20, seats, 'primary');
  assert.equal(summary.available, false);
  assert.match(summary.reason, /missing-p20-evidence:s2/);
});

test('3c. buildP20SubgroupSummary: single-seat group returns unavailable (no consistency)', () => {
  const seats = [makeSeat('s1', 'primary'), makeSeat('s2', 'secondary'), makeSeat('s3', 'secondary')];
  const perSeatP20 = makePerSeatP20(seats, { s1: 1.5, s2: 1.0, s3: 1.2 });
  const summary = buildP20SubgroupSummary(perSeatP20, seats, 'primary');
  assert.equal(summary.available, false);
  assert.equal(summary.reason, 'single-seat-group-no-consistency');
});

test('3d. buildP20SubgroupSummary: empty group returns unavailable', () => {
  const seats = [makeSeat('s1', 'secondary'), makeSeat('s2', 'secondary')];
  const perSeatP20 = makePerSeatP20(seats, { s1: 1.0, s2: 1.2 });
  const summary = buildP20SubgroupSummary(perSeatP20, seats, 'primary');
  assert.equal(summary.available, false);
  assert.equal(summary.reason, 'no-seats-in-group');
});

test('3e. buildCandidateP20Subgroups preserves overall P20 unchanged', () => {
  const seats = [makeSeat('s1', 'primary'), makeSeat('s2', 'primary'), makeSeat('s3', 'secondary'), makeSeat('s4', 'secondary')];
  const canonical = {
    achievedP20VariationDb: 2.5, achievedP20Level: 3, worstP20SeatId: 's2',
    perSeatP20: makePerSeatP20(seats, { s1: 1.5, s2: 2.5, s3: 1.0, s4: 1.2 }),
  };
  const subgroups = buildCandidateP20Subgroups(canonical, seats);
  assert.equal(subgroups.overallUnchanged.achievedP20VariationDb, 2.5);
  assert.equal(subgroups.overallUnchanged.achievedP20Level, 3);
  assert.equal(subgroups.overallUnchanged.worstP20SeatId, 's2');
  assert.equal(subgroups.primary.available, true);
  assert.equal(subgroups.secondary.available, true);
});

test('3f. buildP20SubgroupSummary does NOT average levels — uses lowest floor', () => {
  const seats = [makeSeat('s1', 'primary'), makeSeat('s2', 'primary'), makeSeat('s3', 'primary')];
  const perSeatP20 = [
    { seatId: 's1', variationDbRaw: 1.5, level: 4 },
    { seatId: 's2', variationDbRaw: 2.8, level: 3 },
    { seatId: 's3', variationDbRaw: 4.5, level: 2 },
  ];
  const summary = buildP20SubgroupSummary(perSeatP20, seats, 'primary');
  assert.equal(summary.floor, 2, 'lowest level (L2), not an average');
  assert.equal(summary.seats.length, 3);
  assert.equal(summary.seats[2].level, 2);
});

// ── 4. Shared destructive-null safeguard ──────────────────────────────────────

function makeCurve(freq, spl) {
  return freq.map((f, i) => ({ frequency: f, spl: spl[i] }));
}

test('4a. no shared null → severity none', () => {
  const rt = {
    rspRawCurve: makeCurve([20, 30, 50, 80], [80, 78, 75, 72]),
    perSeatRawCurves: [
      { seatId: 's1', responseData: makeCurve([20, 30, 50, 80], [79, 77, 74, 71]) },
      { seatId: 's2', responseData: makeCurve([20, 30, 50, 80], [78, 76, 73, 70]) },
    ],
  };
  const safeguard = assessSharedNullSafeguard(rt, null);
  assert.equal(safeguard.sharedNullDetected, false);
  assert.equal(safeguard.severity, 'none');
});

test('4b. confirmed shared null across RSP + 2 seats at the same frequency', () => {
  // All curves have their deepest null at ~30 Hz (mean ~75, min ~55 → 20 dB depth).
  const rt = {
    rspRawCurve: makeCurve([20, 30, 50, 80], [75, 55, 75, 72]),
    perSeatRawCurves: [
      { seatId: 's1', responseData: makeCurve([20, 30, 50, 80], [74, 54, 74, 71]) },
      { seatId: 's2', responseData: makeCurve([20, 30, 50, 80], [73, 53, 73, 70]) },
    ],
  };
  const safeguard = assessSharedNullSafeguard(rt, { achievedP20Level: 3 });
  assert.equal(safeguard.sharedNullDetected, true);
  assert.equal(safeguard.severity, 'confirmed');
  assert.match(safeguard.reason, /Shared destructive null/);
  assert.match(safeguard.qualifyingNote, /shared-null-confirmed/);
  assert.match(safeguard.qualifyingNote, /strong-p20-needs-qualification/);
});

test('4c. indeterminate when only 2 curves share the null', () => {
  // RSP null at 30 Hz, one seat null at 30 Hz, other seat null at 50 Hz.
  const rt = {
    rspRawCurve: makeCurve([20, 30, 50, 80], [75, 55, 75, 72]),
    perSeatRawCurves: [
      { seatId: 's1', responseData: makeCurve([20, 30, 50, 80], [74, 54, 74, 71]) },
      { seatId: 's2', responseData: makeCurve([20, 30, 50, 80], [73, 73, 50, 70]) },
    ],
  };
  const safeguard = assessSharedNullSafeguard(rt, null);
  assert.equal(safeguard.sharedNullDetected, true);
  assert.equal(safeguard.severity, 'indeterminate');
  assert.match(safeguard.qualifyingNote, /shared-null-indeterminate/);
});

test('4d. nulls at different frequencies → no shared null', () => {
  const rt = {
    rspRawCurve: makeCurve([20, 30, 50, 80], [75, 55, 75, 72]),  // null at 30
    perSeatRawCurves: [
      { seatId: 's1', responseData: makeCurve([20, 30, 50, 80], [74, 74, 54, 71]) },  // null at 50
      { seatId: 's2', responseData: makeCurve([20, 30, 50, 80], [73, 73, 73, 50]) },  // null at 80
    ],
  };
  const safeguard = assessSharedNullSafeguard(rt, null);
  assert.equal(safeguard.sharedNullDetected, false);
  assert.equal(safeguard.severity, 'none');
});

test('4e. nulls below the serious threshold do not trigger the safeguard', () => {
  // 8 dB nulls — below the 12 dB "serious" threshold.
  const rt = {
    rspRawCurve: makeCurve([20, 30, 50, 80], [75, 67, 75, 72]),
    perSeatRawCurves: [
      { seatId: 's1', responseData: makeCurve([20, 30, 50, 80], [74, 66, 74, 71]) },
      { seatId: 's2', responseData: makeCurve([20, 30, 50, 80], [73, 65, 73, 70]) },
    ],
  };
  const safeguard = assessSharedNullSafeguard(rt, null);
  assert.equal(safeguard.sharedNullDetected, false);
});

test('4f. null rawTransfer returns none, not a fabricated result', () => {
  const safeguard = assessSharedNullSafeguard(null, null);
  assert.equal(safeguard.sharedNullDetected, false);
  assert.equal(safeguard.severity, 'none');
  assert.equal(safeguard.reason, null);
});

// ── 5. Quantity-aware Apply/Undo authority ────────────────────────────────────

function makeInstance(id, x, y, group, model = 'sub3-12') {
  return {
    id, model, enabled: true, position: { x, y }, bottomHeightM: 0,
    rotationDeg: 0, legacyGroup: group, gainDb: 0, delayMs: 0, polarity: 1,
  };
}

test('5a. buildInstanceSnapshot captures complete state', () => {
  const instances = [
    makeInstance('sub-front-1', 1, 0, 'front'),
    makeInstance('sub-rear-1', 1, 5, 'rear'),
  ];
  const snapshot = buildInstanceSnapshot(instances);
  assert.equal(snapshot.length, 2);
  assert.equal(snapshot[0].id, 'sub-front-1');
  assert.deepEqual(snapshot[0].position, { x: 1, y: 0 });
});

test('5b. restoreInstanceSnapshot produces an exact independent copy', () => {
  const instances = [makeInstance('sub-front-1', 1, 0, 'front')];
  const snapshot = buildInstanceSnapshot(instances);
  const restored = restoreInstanceSnapshot(snapshot);
  assert.deepEqual(restored, instances);
  restored[0].position.x = 999;
  assert.equal(snapshot[0].position.x, 1, 'snapshot is not mutated by restoring');
  assert.equal(instances[0].position.x, 1, 'original is not mutated');
});

test('5c. isCandidateStale detects room/seating changes', () => {
  assert.equal(isCandidateStale('fp-1', 'fp-1'), false);
  assert.equal(isCandidateStale('fp-1', 'fp-2'), true);
  assert.equal(isCandidateStale(null, 'fp-1'), true);
  assert.equal(isCandidateStale('fp-1', null), true);
});

test('5d. buildQuantityApplyInstances: reuse matching, create new, disable excess', () => {
  // Current: 1 front sub at (1, 0). Apply a 2-sub option at (1, 0.02) + (4, 0.02).
  const current = [makeInstance('sub-front-1', 1, 0.02, 'front')];
  const result = buildQuantityApplyInstances({
    coordinates: [{ x: 1, y: 0.02 }, { x: 4, y: 0.02 }],
    quantity: 2,
    instances: current,
    defaults: { model: 'sub3-12', bottomHeightM: 0, orientation: 'vertical' },
    frontCoords: [{ x: 1, y: 0.02 }, { x: 4, y: 0.02 }],
  });
  assert.equal(result.instances.length, 2, 'one reused + one created, no excess to disable');
  assert.equal(result.appliedCount, 1, 'existing instance reused');
  assert.equal(result.createdCount, 1, 'new instance created');
  assert.equal(result.disabledCount, 0);
  assert.equal(result.instances[0].id, 'sub-front-1', 'reused instance keeps its ID');
  assert.equal(result.instances[1].enabled, true);
  assert.equal(result.instances[1].legacyGroup, 'front');
});

test('5e. buildQuantityApplyInstances: disable excess when reducing quantity', () => {
  // Current: 4 subs. Apply a 1-sub option.
  const current = [
    makeInstance('sub-front-1', 1, 0.02, 'front'),
    makeInstance('sub-front-2', 4, 0.02, 'front'),
    makeInstance('sub-rear-1', 1, 5.98, 'rear'),
    makeInstance('sub-rear-2', 4, 5.98, 'rear'),
  ];
  const result = buildQuantityApplyInstances({
    coordinates: [{ x: 2.5, y: 0.02 }],
    quantity: 1,
    instances: current,
    defaults: { model: 'sub3-12', bottomHeightM: 0 },
    frontCoords: [{ x: 2.5, y: 0.02 }],
  });
  assert.equal(result.instances.filter((i) => i.enabled).length, 1, 'only one enabled');
  assert.equal(result.disabledCount, 4, 'all 4 existing disabled (no coordinate match)');
  assert.equal(result.createdCount, 1, 'new one created at the target coordinate');
});

test('5f. buildQuantityApplyInstances: preserve model/orientation/height on reused instances', () => {
  const current = [makeInstance('sub-front-1', 1, 0.02, 'front', 'sub4-12')];
  current[0].orientation = 'horizontal';
  current[0].bottomHeightM = 0.1;
  current[0].delayMs = 3.5;
  const result = buildQuantityApplyInstances({
    coordinates: [{ x: 1, y: 0.02 }],
    quantity: 1,
    instances: current,
    defaults: { model: 'sub3-12' },
  });
  assert.equal(result.instances[0].model, 'sub4-12', 'model preserved');
  assert.equal(result.instances[0].orientation, 'horizontal', 'orientation preserved');
  assert.equal(result.instances[0].bottomHeightM, 0.1, 'height preserved');
  assert.equal(result.instances[0].delayMs, 3.5, 'calibration preserved');
});

test('5g. buildQuantityApplyProvenance records candidate identity and snapshot', () => {
  const snapshot = buildInstanceSnapshot([makeInstance('sub-1', 1, 0, 'front')]);
  const provenance = buildQuantityApplyProvenance({
    snapshot,
    candidateId: 'cand-1',
    quantity: 2,
    coordinates: [{ x: 1, y: 0.02 }, { x: 4, y: 0.02 }],
    candidateFingerprint: 'fp-1',
  });
  assert.equal(provenance.candidateId, 'cand-1');
  assert.equal(provenance.quantity, 2);
  assert.equal(provenance.candidateFingerprint, 'fp-1');
  assert.equal(provenance.coordinates.length, 2);
  assert.equal(provenance.previousInstances.length, 1);
});

test('5h. resolveQuantityApplyState blocks stale candidates', () => {
  const state = resolveQuantityApplyState({
    candidateFingerprint: 'fp-1', currentFingerprint: 'fp-2',
    coordinates: [{ x: 1, y: 0.02 }], quantity: 2,
  });
  assert.equal(state.canApply, false);
  assert.equal(state.blockReason, 'stale-candidate-room-or-seating-changed');
});

test('5i. resolveQuantityApplyState blocks unsupported quantities', () => {
  const state = resolveQuantityApplyState({
    candidateFingerprint: 'fp-1', currentFingerprint: 'fp-1',
    coordinates: [{ x: 1, y: 0.02 }], quantity: 3,
  });
  assert.equal(state.canApply, false);
  assert.equal(state.blockReason, 'unsupported-quantity');
});

test('5j. resolveQuantityApplyState allows a valid current candidate', () => {
  const state = resolveQuantityApplyState({
    candidateFingerprint: 'fp-1', currentFingerprint: 'fp-1',
    coordinates: [{ x: 1, y: 0.02 }, { x: 4, y: 0.02 }], quantity: 2,
  });
  assert.equal(state.canApply, true);
  assert.equal(state.blockReason, null);
});

// ── 6. Round-trip: Apply then Undo restores exact state ──────────────────────

test('6a. Apply then Undo restores the exact previous instance state', () => {
  const original = [
    makeInstance('sub-front-1', 1, 0.02, 'front'),
    makeInstance('sub-front-2', 4, 0.02, 'front'),
    makeInstance('sub-rear-1', 1, 5.98, 'rear'),
    makeInstance('sub-rear-2', 4, 5.98, 'rear'),
  ];
  const snapshot = buildInstanceSnapshot(original);
  const provenance = buildQuantityApplyProvenance({
    snapshot, candidateId: 'c1', quantity: 1,
    coordinates: [{ x: 2.5, y: 0.02 }],
    candidateFingerprint: 'fp-1',
  });
  const applied = buildQuantityApplyInstances({
    coordinates: [{ x: 2.5, y: 0.02 }], quantity: 1,
    instances: original, defaults: { model: 'sub3-12' },
    frontCoords: [{ x: 2.5, y: 0.02 }],
  });
  // Undo restores from the provenance snapshot.
  const undone = restoreInstanceSnapshot(provenance.previousInstances);
  assert.deepEqual(undone, original, 'Undo restores exact previous state');
  assert.notDeepEqual(undone, applied.instances, 'applied state differs from original');
});

// ── Report ─────────────────────────────────────────────────────────────────

const failures = results.filter((line) => line.startsWith('FAIL'));
console.log(results.join('\n'));
console.log(`\n${results.length - failures.length}/${results.length} checks passed`);
if (failures.length > 0) process.exitCode = 1;