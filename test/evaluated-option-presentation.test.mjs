// evaluated-option-presentation.test.mjs
// Focused tests for the Subwoofer Design evaluated-option presentation.
//
// Locks in the contract that the Starting Layout cards never display invented
// or Stage 1 proxy-derived RP22 results: P19/P20 are surfaced only when the
// Stage 2 canonical evaluation genuinely carried them, and the option's
// fingerprint is stamped from the Stage 2 run for the Apply stale guard.
//
// Also locks in that each quantity surfaces ONE practical front/rear option
// plus zero or more exceptional side/mixed-wall alternatives that deliver an
// actual whole-Level improvement.
//
// Run: node --import ./test/_alias-register.mjs --test test/evaluated-option-presentation.test.mjs

import assert from 'node:assert/strict';

import {
  buildEvaluatedOption,
  selectEvaluatedOptions,
  resultEvidenceIsValid,
  wallPlacementForCoordinate,
  orientationForCoordinate,
} from '../src/components/room/bass/bda/evaluatedOptionPresentation.js';
import { FAMILY_IDS } from '../src/components/room/bass/stage1/stage1FamilyRegistry.js';

const seatPriorityMap = new Map([
  ['seat-1', 'primary'],
  ['seat-2', 'primary'],
  ['seat-3', 'secondary'],
]);

const context = {
  roomDims: { widthM: 5, lengthM: 6, heightM: 2.4 },
  selectedSubModel: 'SUB2-12',
  subwooferBottomHeightM: 0.05,
};

function makeValidResult(overrides = {}) {
  return {
    finalistId: 'f1',
    familyId: 'front-pair',
    quantity: 2,
    coordinates: [{ x: 1.25, y: 0.3 }, { x: 3.75, y: 0.3 }],
    selectedProduct: 'SUB2-12',
    requestedP14Pass: true,
    terminal: false,
    physicalRejection: null,
    achievedP19Level: 3,
    achievedP19VariationDb: 2.5,
    perSeatP20: [
      { seatId: 'seat-1', level: 3, variationDbRaw: 2.1 },
      { seatId: 'seat-2', level: 2, variationDbRaw: 3.4 },
      { seatId: 'seat-3', level: 1, variationDbRaw: 5.0 },
    ],
    ...overrides,
  };
}

// ── 1. resultEvidenceIsValid ────────────────────────────────────────────
{
  assert.ok(resultEvidenceIsValid(makeValidResult()), 'a valid result is valid');
  assert.ok(!resultEvidenceIsValid(makeValidResult({ requestedP14Pass: false })),
    'a result that failed P14 is not valid for P19/P20');
  assert.ok(!resultEvidenceIsValid(makeValidResult({ terminal: true })),
    'a terminal result is not valid');
  assert.ok(!resultEvidenceIsValid(makeValidResult({ physicalRejection: { reason: 'x' } })),
    'a physically rejected result is not valid');
  assert.ok(!resultEvidenceIsValid(makeValidResult({ achievedP19Level: null })),
    'a result with no P19 level is not valid');
}

// ── 2. buildEvaluatedOption shapes and validity ─────────────────────────
{
  const option = buildEvaluatedOption(makeValidResult(), seatPriorityMap, context);
  assert.equal(option.quantity, 2);
  assert.equal(option.model, 'sub2-12', 'model is normalised through the registry');
  assert.equal(option.bottomHeightM, 0.05);
  assert.equal(option.coordinates.length, 2);
  assert.equal(option.coordinates[0].placement, 'front', 'front wall derived from y < length/2');
  assert.ok(option.valid, 'valid result → option.valid true');
  assert.ok(option.p19, 'P19 present for a valid result');
  assert.equal(option.p19.level, 3);
  assert.ok(option.p20Primary, 'P20 Primary present');
  assert.equal(option.p20Primary.level, 2, 'worst primary P20 level is the min across primary seats');
  assert.ok(option.p20Secondary, 'P20 Secondary present');
  assert.equal(option.p20Secondary.level, 1, 'worst secondary P20 level');
  assert.equal(option.placementKind, 'practical', 'default placementKind is practical');
  assert.equal(option.improvement, null, 'improvement null for practical option');
}

// ── 3. P19/P20 withheld when P14 failed (no invented RP22) ──────────────
{
  const option = buildEvaluatedOption(makeValidResult({ requestedP14Pass: false }), seatPriorityMap, context);
  assert.ok(!option.valid, 'invalid result → option.valid false');
  assert.equal(option.p19, null, 'P19 withheld when P14 failed');
  assert.equal(option.p20Primary, null, 'P20 Primary withheld when P14 failed');
  assert.equal(option.p20Secondary, null, 'P20 Secondary withheld when P14 failed');
}

// ── 4. terminal / physical rejection → null P19/P20 ────────────────────
{
  const term = buildEvaluatedOption(makeValidResult({ terminal: true, physicalRejection: { reason: 'overlap' } }), seatPriorityMap, context);
  assert.ok(!term.valid);
  assert.equal(term.p19, null);
  assert.equal(term.p20Primary, null);
  assert.equal(term.terminal, true);
}

// ── 5. no coordinates / unsupported quantity → null option ─────────────
{
  assert.equal(buildEvaluatedOption(null, seatPriorityMap, context), null);
  assert.equal(buildEvaluatedOption({ ...makeValidResult(), coordinates: [] }, seatPriorityMap, context), null);
  assert.equal(buildEvaluatedOption({ ...makeValidResult(), quantity: 3 }, seatPriorityMap, context), null);
}

// ── 6. selectEvaluatedOptions: practical only when no alternatives qualify
{
  const completeState = {
    status: 'complete',
    fingerprint: 'stage2-rec-fp-123',
    one_sub_result: {
      bestFinalist: makeValidResult({ finalistId: 'f1', quantity: 1, coordinates: [{ x: 2.5, y: 0.3 }] }),
      evaluatedFinalists: [makeValidResult({ finalistId: 'f1', quantity: 1, coordinates: [{ x: 2.5, y: 0.3 }] })],
    },
    two_sub_result: {
      bestFinalist: makeValidResult({ finalistId: 'f2', quantity: 2 }),
      evaluatedFinalists: [makeValidResult({ finalistId: 'f2', quantity: 2 })],
    },
    four_sub_result: {
      bestFinalist: makeValidResult({ finalistId: 'f4', quantity: 4, coordinates: [{ x: 1.25, y: 0.3 }, { x: 3.75, y: 0.3 }, { x: 1.25, y: 5.7 }, { x: 3.75, y: 5.7 }] }),
      evaluatedFinalists: [makeValidResult({ finalistId: 'f4', quantity: 4, coordinates: [{ x: 1.25, y: 0.3 }, { x: 3.75, y: 0.3 }, { x: 1.25, y: 5.7 }, { x: 3.75, y: 5.7 }] })],
    },
  };
  const options = selectEvaluatedOptions(completeState, seatPriorityMap, context);
  assert.equal(options.length, 3, 'three practical options, no qualifying alternatives');
  assert.deepEqual(options.map((o) => o.quantity).sort(), [1, 2, 4]);
  for (const o of options) {
    assert.equal(o.fingerprint, 'stage2-rec-fp-123', 'run fingerprint stamped on every option');
    assert.equal(o.placementKind, 'practical', 'all practical when no side/mixed qualifies');
  }

  // Non-complete state → no options (no proxy-derived cards)
  assert.equal(selectEvaluatedOptions({ status: 'updating' }, seatPriorityMap, context).length, 0);
  assert.equal(selectEvaluatedOptions({ status: 'idle' }, seatPriorityMap, context).length, 0);
  assert.equal(selectEvaluatedOptions(null, seatPriorityMap, context).length, 0);
}

// Helper: build rankingData.primarySummary.seats from perSeatP20 + the seat
// priority map, mirroring buildStage2RankingTuple so the qualifier can read
// Primary P20 levels.
function withRankingData(result) {
  const primarySeats = (result.perSeatP20 || [])
    .filter((row) => seatPriorityMap.get(row.seatId) === 'primary')
    .map((row) => ({ seatId: row.seatId, isPrimary: true, p20Level: row.level }));
  const secondarySeats = (result.perSeatP20 || [])
    .filter((row) => seatPriorityMap.get(row.seatId) === 'secondary')
    .map((row) => ({ seatId: row.seatId, isPrimary: false, p20Level: row.level }));
  return {
    ...result,
    rankingData: { primarySummary: { seats: primarySeats }, secondarySummary: { seats: secondarySeats } },
  };
}

// ── 7. selectEvaluatedOptions surfaces a qualifying side/mixed alternative
{
  const frontRear = withRankingData(makeValidResult({
    finalistId: 'ftp',
    familyId: FAMILY_IDS.FOUR_THIRD_PAIRS,
    quantity: 4,
    coordinates: [{ x: 1.25, y: 0.3 }, { x: 3.75, y: 0.3 }, { x: 1.25, y: 5.7 }, { x: 3.75, y: 5.7 }],
    achievedP19Level: 4,
    perSeatP20: [
      { seatId: 'seat-1', level: 1, variationDbRaw: 7.5 },
      { seatId: 'seat-2', level: 1, variationDbRaw: 7.2 },
      { seatId: 'seat-3', level: 1, variationDbRaw: 9.0 },
    ],
  }));
  const sideMixed = withRankingData(makeValidResult({
    finalistId: 'd',
    familyId: FAMILY_IDS.RP22_D,
    quantity: 4,
    coordinates: [{ x: 0, y: 2.0 }, { x: 0, y: 4.0 }, { x: 5, y: 2.0 }, { x: 5, y: 4.0 }],
    achievedP19Level: 4,
    perSeatP20: [
      { seatId: 'seat-1', level: 2, variationDbRaw: 3.5 },
      { seatId: 'seat-2', level: 2, variationDbRaw: 3.2 },
      { seatId: 'seat-3', level: 1, variationDbRaw: 8.0 },
    ],
  }));
  const completeState = {
    status: 'complete',
    fingerprint: 'stage2-rec-fp-alt',
    one_sub_result: null,
    two_sub_result: null,
    four_sub_result: {
      bestFinalist: frontRear,
      evaluatedFinalists: [frontRear, sideMixed],
    },
  };
  const options = selectEvaluatedOptions(completeState, seatPriorityMap, context);
  assert.equal(options.length, 2, 'practical + one qualifying alternative');
  assert.equal(options[0].placementKind, 'practical');
  assert.equal(options[0].familyId, FAMILY_IDS.FOUR_THIRD_PAIRS);
  assert.equal(options[1].placementKind, 'alternative');
  assert.equal(options[1].familyId, FAMILY_IDS.RP22_D);
  assert.ok(options[1].isSideOrMixed, 'alternative flagged as side/mixed');
  assert.ok(options[1].improvement, 'alternative carries improvement summary');
  assert.equal(options[1].improvement.primaryP20, true, 'Primary P20 L1->L2 improvement detected');
  assert.equal(options[1].improvement.p19, false, 'no P19 improvement in this fixture');
}

// ── 8. selectEvaluatedOptions omits a non-qualifying side/mixed (same Level)
{
  const frontRear = withRankingData(makeValidResult({
    finalistId: 'ftp',
    familyId: FAMILY_IDS.FOUR_THIRD_PAIRS,
    quantity: 4,
    coordinates: [{ x: 1.25, y: 0.3 }, { x: 3.75, y: 0.3 }, { x: 1.25, y: 5.7 }, { x: 3.75, y: 5.7 }],
    achievedP19Level: 4,
    perSeatP20: [
      { seatId: 'seat-1', level: 1, variationDbRaw: 7.5 },
      { seatId: 'seat-2', level: 1, variationDbRaw: 7.2 },
    ],
  }));
  const sideMixed = withRankingData(makeValidResult({
    finalistId: 'b',
    familyId: FAMILY_IDS.RP22_B_LAST_RESORT,
    quantity: 4,
    coordinates: [{ x: 0, y: 2.0 }, { x: 0, y: 4.0 }, { x: 5, y: 2.0 }, { x: 5, y: 4.0 }],
    achievedP19Level: 4,
    perSeatP20: [
      { seatId: 'seat-1', level: 1, variationDbRaw: 6.7 },
      { seatId: 'seat-2', level: 1, variationDbRaw: 6.5 },
      { seatId: 'seat-3', level: 2, variationDbRaw: 4.5 },
    ],
  }));
  const completeState = {
    status: 'complete',
    fingerprint: 'stage2-rec-fp-noalt',
    four_sub_result: {
      bestFinalist: frontRear,
      evaluatedFinalists: [frontRear, sideMixed],
    },
  };
  const options = selectEvaluatedOptions(completeState, seatPriorityMap, context);
  assert.equal(options.length, 1, 'no qualifying alternative (same Primary P20 L1, P19 L4) → practical only');
  assert.equal(options[0].placementKind, 'practical');
}

// ── 8b. Screenshot acceptance case 1: Primary P20 L1→L2 qualifies (P19 L4=L4)
//   Practical four-sub: P19 L4, P20 Primary L1, P20 Secondary L1
//   Mixed-wall alt:      P19 L4, P20 Primary L2, P20 Secondary L1
//   The alternative remains visible because Primary P20 improves by one Level.
{
  const frontRear = withRankingData(makeValidResult({
    finalistId: 'ftp',
    familyId: FAMILY_IDS.FOUR_THIRD_PAIRS,
    quantity: 4,
    coordinates: [{ x: 1.25, y: 0.3 }, { x: 3.75, y: 0.3 }, { x: 1.25, y: 5.7 }, { x: 3.75, y: 5.7 }],
    achievedP19Level: 4,
    perSeatP20: [
      { seatId: 'seat-1', level: 1, variationDbRaw: 7.5 },
      { seatId: 'seat-2', level: 1, variationDbRaw: 7.2 },
      { seatId: 'seat-3', level: 1, variationDbRaw: 9.0 },
    ],
  }));
  const mixedAlt = withRankingData(makeValidResult({
    finalistId: 'b',
    familyId: FAMILY_IDS.RP22_B_LAST_RESORT,
    quantity: 4,
    coordinates: [{ x: 0, y: 2.0 }, { x: 0, y: 4.0 }, { x: 5, y: 2.0 }, { x: 5, y: 4.0 }],
    achievedP19Level: 4,
    perSeatP20: [
      { seatId: 'seat-1', level: 2, variationDbRaw: 3.5 },
      { seatId: 'seat-2', level: 2, variationDbRaw: 3.2 },
      { seatId: 'seat-3', level: 1, variationDbRaw: 8.0 },
    ],
  }));
  const completeState = {
    status: 'complete',
    fingerprint: 'stage2-rec-fp-screenshot1',
    four_sub_result: { bestFinalist: frontRear, evaluatedFinalists: [frontRear, mixedAlt] },
  };
  const options = selectEvaluatedOptions(completeState, seatPriorityMap, context);
  assert.equal(options.length, 2, 'practical + qualifying mixed-wall alternative');
  assert.equal(options[1].placementKind, 'alternative');
  assert.equal(options[1].improvement.primaryP20, true, 'Primary P20 L1->L2 improvement');
  assert.equal(options[1].improvement.p19, false, 'P19 unchanged (L4=L4)');
  assert.deepEqual(options[1].compromises, [], 'no compromise: Secondary P20 L1=L1');
}

// ── 8c. Screenshot acceptance case 2: both P20 L1 despite a large numerical
//   reduction in deviation — the alternative must NOT appear for that gain.
{
  const frontRear = withRankingData(makeValidResult({
    finalistId: 'ftp',
    familyId: FAMILY_IDS.FOUR_THIRD_PAIRS,
    quantity: 4,
    coordinates: [{ x: 1.25, y: 0.3 }, { x: 3.75, y: 0.3 }, { x: 1.25, y: 5.7 }, { x: 3.75, y: 5.7 }],
    achievedP19Level: 4,
    perSeatP20: [
      { seatId: 'seat-1', level: 1, variationDbRaw: 7.5 },
      { seatId: 'seat-2', level: 1, variationDbRaw: 7.2 },
      { seatId: 'seat-3', level: 1, variationDbRaw: 9.0 },
    ],
  }));
  const mixedAlt = withRankingData(makeValidResult({
    finalistId: 'd',
    familyId: FAMILY_IDS.RP22_D,
    quantity: 4,
    coordinates: [{ x: 0, y: 2.0 }, { x: 0, y: 4.0 }, { x: 5, y: 2.0 }, { x: 5, y: 4.0 }],
    achievedP19Level: 4,
    // Large numerical reduction (7.5 → 0.5 dB) but SAME Level (L1) everywhere.
    perSeatP20: [
      { seatId: 'seat-1', level: 1, variationDbRaw: 0.5 },
      { seatId: 'seat-2', level: 1, variationDbRaw: 0.6 },
      { seatId: 'seat-3', level: 1, variationDbRaw: 1.0 },
    ],
  }));
  const completeState = {
    status: 'complete',
    fingerprint: 'stage2-rec-fp-screenshot2',
    four_sub_result: { bestFinalist: frontRear, evaluatedFinalists: [frontRear, mixedAlt] },
  };
  const options = selectEvaluatedOptions(completeState, seatPriorityMap, context);
  assert.equal(options.length, 1, 'numerical-only gain at the same Level must NOT surface an alternative');
  assert.equal(options[0].placementKind, 'practical');
}

// ── 8d. Compromise surfacing: a qualifying alternative (Primary P20 L1→L2)
//   that regresses Secondary P20 (L2→L1) carries the compromise descriptor.
{
  const frontRear = withRankingData(makeValidResult({
    finalistId: 'ftp',
    familyId: FAMILY_IDS.FOUR_THIRD_PAIRS,
    quantity: 4,
    coordinates: [{ x: 1.25, y: 0.3 }, { x: 3.75, y: 0.3 }, { x: 1.25, y: 5.7 }, { x: 3.75, y: 5.7 }],
    achievedP19Level: 4,
    perSeatP20: [
      { seatId: 'seat-1', level: 1, variationDbRaw: 7.5 },
      { seatId: 'seat-2', level: 1, variationDbRaw: 7.2 },
      { seatId: 'seat-3', level: 2, variationDbRaw: 4.0 },
    ],
  }));
  const mixedAlt = withRankingData(makeValidResult({
    finalistId: 'b',
    familyId: FAMILY_IDS.RP22_B_LAST_RESORT,
    quantity: 4,
    coordinates: [{ x: 0, y: 2.0 }, { x: 0, y: 4.0 }, { x: 5, y: 2.0 }, { x: 5, y: 4.0 }],
    achievedP19Level: 4,
    perSeatP20: [
      { seatId: 'seat-1', level: 2, variationDbRaw: 3.5 },
      { seatId: 'seat-2', level: 2, variationDbRaw: 3.2 },
      { seatId: 'seat-3', level: 1, variationDbRaw: 8.0 },
    ],
  }));
  const completeState = {
    status: 'complete',
    fingerprint: 'stage2-rec-fp-compromise',
    four_sub_result: { bestFinalist: frontRear, evaluatedFinalists: [frontRear, mixedAlt] },
  };
  const options = selectEvaluatedOptions(completeState, seatPriorityMap, context);
  assert.equal(options.length, 2, 'practical + qualifying alternative (Primary P20 improved)');
  assert.equal(options[1].improvement.primaryP20, true, 'Primary P20 L1->L2 qualifies despite Secondary regression');
  assert.ok(Array.isArray(options[1].compromises) && options[1].compromises.length === 1, 'one compromise surfaced');
  assert.equal(options[1].compromises[0].parameter, 'secondaryP20');
  assert.equal(options[1].compromises[0].fromLevel, 2);
  assert.equal(options[1].compromises[0].toLevel, 1);
}

// ── 9. wall placement / orientation derivation ─────────────────────────
{
  const room = { widthM: 5, lengthM: 6 };
  assert.equal(wallPlacementForCoordinate({ x: 2.5, y: 0.3 }, room), 'front');
  assert.equal(wallPlacementForCoordinate({ x: 2.5, y: 5.7 }, room), 'rear');
  assert.equal(orientationForCoordinate({ x: 2.5, y: 0.3 }, room), 0);
  assert.equal(orientationForCoordinate({ x: 2.5, y: 5.7 }, room), 180);
}

console.log('evaluated-option-presentation: all checks passed (incl. screenshot + compromise cases)');