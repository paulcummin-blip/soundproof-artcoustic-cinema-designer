// evaluated-option-presentation.test.mjs
// Focused tests for the Subwoofer Design evaluated-option presentation.
//
// Locks in the contract that the Starting Layout cards never display invented
// or Stage 1 proxy-derived RP22 results: P19/P20 are surfaced only when the
// Stage 2 canonical evaluation genuinely carried them, and the option's
// fingerprint is stamped from the Stage 2 run for the Apply stale guard.
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

// ── 6. selectEvaluatedOptions only when complete; stamps fingerprint ───
{
  const completeState = {
    status: 'complete',
    fingerprint: 'stage2-rec-fp-123',
    one_sub_result: { bestFinalist: makeValidResult({ finalistId: 'f1', quantity: 1, coordinates: [{ x: 2.5, y: 0.3 }] }) },
    two_sub_result: { bestFinalist: makeValidResult({ finalistId: 'f2', quantity: 2 }) },
    four_sub_result: { bestFinalist: makeValidResult({ finalistId: 'f4', quantity: 4, coordinates: [{ x: 1.25, y: 0.3 }, { x: 3.75, y: 0.3 }, { x: 1.25, y: 5.7 }, { x: 3.75, y: 5.7 }] }) },
  };
  const options = selectEvaluatedOptions(completeState, seatPriorityMap, context);
  assert.equal(options.length, 3, 'three evaluated options for a complete 1/2/4 run');
  assert.deepEqual(options.map((o) => o.quantity).sort(), [1, 2, 4]);
  for (const o of options) {
    assert.equal(o.fingerprint, 'stage2-rec-fp-123', 'run fingerprint stamped on every option');
  }

  // Non-complete state → no options (no proxy-derived cards)
  assert.equal(selectEvaluatedOptions({ status: 'updating' }, seatPriorityMap, context).length, 0);
  assert.equal(selectEvaluatedOptions({ status: 'idle' }, seatPriorityMap, context).length, 0);
  assert.equal(selectEvaluatedOptions(null, seatPriorityMap, context).length, 0);
}

// ── 7. wall placement / orientation derivation ─────────────────────────
{
  const room = { widthM: 5, lengthM: 6 };
  assert.equal(wallPlacementForCoordinate({ x: 2.5, y: 0.3 }, room), 'front');
  assert.equal(wallPlacementForCoordinate({ x: 2.5, y: 5.7 }, room), 'rear');
  assert.equal(orientationForCoordinate({ x: 2.5, y: 0.3 }, room), 0);
  assert.equal(orientationForCoordinate({ x: 2.5, y: 5.7 }, room), 180);
}

console.log('evaluated-option-presentation: all checks passed');