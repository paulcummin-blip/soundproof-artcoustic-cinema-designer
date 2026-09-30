// stage2-p19-semantics-and-lever-apply.test.mjs
// ---------------------------------------------------------------------------
//   TEST 1  Stage 2 credibility accepts a valid candidate whose P19 is the
//           aggregate RSP result and which carries NO per-seat P19 rows
//   TEST 2  a genuine P19 failure still rejects a candidate
//   TEST 3  overall_best compares candidates instead of taking array order
//   TEST 4  no per-seat P19 rows are neutral in ranking (never Level 0)
//   TEST 5  apply placement changes only coordinates
//   TEST 6  apply delay changes only delay
//   TEST 7  apply gain changes only gain
//   TEST 8  apply polarity changes only polarity
//   TEST 9  combined-only polarity cannot be applied independently
//   TEST 10 a stale plan cannot be applied
//   TEST 11 undo restores only the applied lever's previous values
//   TEST 12 overall worst-seat P20 and a selected seat are stated separately
// ---------------------------------------------------------------------------
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { passesCredibilityGate } from '../components/room/bass/stage2/stage2BLastResort.js';
import { buildStage2RankingTuple } from '../components/room/bass/stage2/stage2Ranking.js';
import {
  betterOverallBest,
  selectOverallBest,
} from '../components/room/bass/stage2/stage2OverallBestSelection.js';
import {
  buildLeverApplyInstances,
  buildLeverUndoInstances,
  resolveLeverApplyState,
} from '../components/room/bass/optimiserPlan/optimiserPlanLeverApply.js';
import {
  OPTIMISER_LEVER,
  OPTIMISER_LEVER_EVIDENCE,
  OPTIMISER_PLAN_STATUS,
} from '../components/room/bass/optimiserPlan/optimiserPlanConstants.js';
import {
  buildP20SeatRows,
  formatWorstAllSeatP20Line,
  formatSelectedSeatP20Line,
} from '../components/room/bass/p20SeatPresentation.js';

// ── Fixtures ───────────────────────────────────────────────────────────────

const seatPriority = new Map([['R1S1', 'primary'], ['R2S4', 'secondary']]);

function stage2Result({ p19Level = 2, p20Level = 3, perSeatP19 = [] } = {}) {
  return {
    familyId: 'four-midpoints',
    p14Limited: false,
    p18Limited: false,
    achievedP18Hz: 22,
    achievedP19Level: p19Level,
    achievedP19VariationDb: 1.6,
    achievedP20Level: p20Level,
    achievedP20VariationDb: 12.24,
    p14HeadroomDb: 3,
    perSeatP19,
    perSeatP20: [
      { seatId: 'R1S1', isPrimary: true, level: p20Level, variationDbRaw: 12.24, worstFrequencyHz: 73.44 },
      { seatId: 'R2S4', isPrimary: false, level: p20Level, variationDbRaw: 10.24, worstFrequencyHz: 45.27 },
    ],
  };
}

function ranked(result) {
  return { ...result, rankingData: buildStage2RankingTuple(result, seatPriority) };
}

const INSTANCES = [
  {
    id: 'sub-a', model: 'SUB3-12', enabled: true, position: { x: 1, y: 2 },
    delayMs: 0, gainDb: 0, polarity: 1, bottomHeightM: 0.3,
  },
  {
    id: 'sub-b', model: 'SUB3-12', enabled: true, position: { x: 3, y: 2 },
    delayMs: 0, gainDb: 0, polarity: 1, bottomHeightM: 0.3,
  },
];

const LEVER_CHANGES = {
  [OPTIMISER_LEVER.PLACEMENT]: [{ lever: 'placement', subId: 'sub-a', fromX: 1, fromY: 2, toX: 1.4, toY: 2.6 }],
  [OPTIMISER_LEVER.DELAY]: [{ lever: 'delay', subId: 'sub-a', fromMs: 0, toMs: 3.5 }],
  [OPTIMISER_LEVER.GAIN]: [{ lever: 'gain', subId: 'sub-a', fromDb: 0, toDb: -2.5 }],
  [OPTIMISER_LEVER.POLARITY]: [{ lever: 'polarity', subId: 'sub-a', from: 1, to: -1 }],
};

const evaluatedLever = (leverKey) => ({
  evaluated: true,
  effect: { p20DeltaDb: -1.2 },
  evidenceStatus: OPTIMISER_LEVER_EVIDENCE.EVALUATED,
  changes: LEVER_CHANGES[leverKey],
});

// ── TEST 1 / 2: P19 credibility semantics ─────────────────────────────────

test('TEST 1: aggregate RSP P19 passes with no per-seat P19 rows', () => {
  const result = stage2Result({ p19Level: 2, p20Level: 3, perSeatP19: [] });
  assert.equal(result.perSeatP19.length, 0, 'fixture carries no per-seat P19');
  assert.equal(passesCredibilityGate(result), true, 'absence of per-seat P19 is not a failure');
});

test('TEST 2: a genuine P19 failure still rejects', () => {
  const belowL2 = stage2Result({ p19Level: 1, p20Level: 4 });
  assert.equal(passesCredibilityGate(belowL2), false, 'aggregate RSP P19 below L2 rejects');

  const noEvidence = stage2Result({ p19Level: null, p20Level: 4 });
  assert.equal(passesCredibilityGate(noEvidence), false, 'no P19 evidence at all rejects');

  const p20Below = stage2Result({ p19Level: 3, p20Level: 1 });
  assert.equal(passesCredibilityGate(p20Below), false, 'Primary P20 below L2 rejects');
});

// ── TEST 3: overall-best selection ───────────────────────────────────────

test('TEST 3: overall_best compares candidates, never array order', () => {
  const oneSub = ranked(stage2Result({ p19Level: 1, p20Level: 1 }));
  const fourSub = ranked(stage2Result({ p19Level: 4, p20Level: 4 }));

  // The one-sub candidate is processed first, and must still lose.
  const chosen = selectOverallBest({ 1: oneSub, 4: fourSub });
  assert.equal(chosen.quantity, 4, 'the better-ranked candidate wins regardless of order');

  // Reversing the input order changes nothing.
  assert.equal(
    betterOverallBest({ quantity: 4, ...fourSub }, { quantity: 1, ...oneSub }).quantity,
    4,
    'comparison is order-independent',
  );

  // A genuinely better one-sub candidate still wins on merit.
  const strongOneSub = ranked(stage2Result({ p19Level: 4, p20Level: 4 }));
  const weakFourSub = ranked(stage2Result({ p19Level: 1, p20Level: 1 }));
  assert.equal(selectOverallBest({ 1: strongOneSub, 4: weakFourSub }).quantity, 1,
    'the rule is merit-based, not quantity-based');
});

// ── TEST 4: ranking neutrality without per-seat P19 ──────────────────────

test('TEST 4: missing per-seat P19 is neutral, never Level 0', () => {
  const withoutSeatP19 = ranked(stage2Result({ p19Level: 4, p20Level: 4 }));
  const legacySeatP19 = ranked(stage2Result({
    p19Level: 4,
    p20Level: 4,
    perSeatP19: [{ seatId: 'R1S1', isPrimary: true, level: 4, wholeDbDeviation: 1.6 }],
  }));
  assert.equal(
    withoutSeatP19.rankingData.rankingTuple[0],
    legacySeatP19.rankingData.rankingTuple[0],
    'no-fail count is identical whether or not per-seat P19 rows exist',
  );
  assert.equal(
    withoutSeatP19.rankingData.primarySummary.worstCombinedLevel,
    4,
    'a Primary seat with aggregate-only P19 grades on its P20 level, not 0',
  );
});

// ── TEST 5-8: one lever at a time ────────────────────────────────────────

const untouched = (instances) => instances[1];

test('TEST 5: apply placement changes only coordinates', () => {
  const result = buildLeverApplyInstances({
    leverKey: OPTIMISER_LEVER.PLACEMENT,
    lever: evaluatedLever(OPTIMISER_LEVER.PLACEMENT),
    instances: INSTANCES,
  });
  assert.equal(result.ok, true);
  const applied = result.instances[0];
  assert.deepEqual(applied.position, { x: 1.4, y: 2.6 });
  assert.equal(applied.id, 'sub-a');
  assert.equal(applied.model, 'SUB3-12');
  assert.equal(applied.delayMs, 0);
  assert.equal(applied.gainDb, 0);
  assert.equal(applied.polarity, 1);
  assert.equal(untouched(result.instances), INSTANCES[1], 'other instances are untouched');
});

test('TEST 6: apply delay changes only delay', () => {
  const result = buildLeverApplyInstances({
    leverKey: OPTIMISER_LEVER.DELAY,
    lever: evaluatedLever(OPTIMISER_LEVER.DELAY),
    instances: INSTANCES,
  });
  const applied = result.instances[0];
  assert.equal(applied.delayMs, 3.5);
  assert.deepEqual(applied.position, { x: 1, y: 2 });
  assert.equal(applied.gainDb, 0);
  assert.equal(applied.polarity, 1);
});

test('TEST 7: apply gain changes only gain', () => {
  const result = buildLeverApplyInstances({
    leverKey: OPTIMISER_LEVER.GAIN,
    lever: evaluatedLever(OPTIMISER_LEVER.GAIN),
    instances: INSTANCES,
  });
  const applied = result.instances[0];
  assert.equal(applied.gainDb, -2.5);
  assert.deepEqual(applied.position, { x: 1, y: 2 });
  assert.equal(applied.delayMs, 0);
  assert.equal(applied.polarity, 1);
});

test('TEST 8: apply polarity changes only polarity', () => {
  const result = buildLeverApplyInstances({
    leverKey: OPTIMISER_LEVER.POLARITY,
    lever: evaluatedLever(OPTIMISER_LEVER.POLARITY),
    instances: INSTANCES,
  });
  const applied = result.instances[0];
  assert.equal(applied.polarity, -1);
  assert.equal(applied.delayMs, 0);
  assert.equal(applied.gainDb, 0);
  assert.deepEqual(applied.position, { x: 1, y: 2 });
});

// ── TEST 9-10: safety conditions ──────────────────────────────────────────

test('TEST 9: combined-only polarity cannot be applied separately', () => {
  const state = resolveLeverApplyState({
    leverKey: OPTIMISER_LEVER.POLARITY,
    lever: { ...evaluatedLever(OPTIMISER_LEVER.POLARITY), evidenceStatus: OPTIMISER_LEVER_EVIDENCE.COMBINED_ONLY },
    planStatus: OPTIMISER_PLAN_STATUS.CURRENT,
  });
  assert.equal(state.canApply, false);
  assert.equal(state.reason, 'Not independently evaluated — cannot apply separately.');
});

test('TEST 9b: an already-applied lever is not applyable again', () => {
  const state = resolveLeverApplyState({
    leverKey: OPTIMISER_LEVER.DELAY,
    lever: evaluatedLever(OPTIMISER_LEVER.DELAY),
    planStatus: OPTIMISER_PLAN_STATUS.CURRENT,
    applied: true,
  });
  assert.equal(state.canApply, false);
  assert.match(state.reason, /Already applied/);
});

test('TEST 9c: a missing subwoofer blocks the lever', () => {
  const state = resolveLeverApplyState({
    leverKey: OPTIMISER_LEVER.DELAY,
    lever: evaluatedLever(OPTIMISER_LEVER.DELAY),
    planStatus: OPTIMISER_PLAN_STATUS.CURRENT,
    missingSubIds: ['sub-a'],
  });
  assert.equal(state.canApply, false);
  assert.match(state.reason, /no longer exists/);
});

test('TEST 10: a stale plan cannot be applied', () => {
  const state = resolveLeverApplyState({
    leverKey: OPTIMISER_LEVER.DELAY,
    lever: evaluatedLever(OPTIMISER_LEVER.DELAY),
    planStatus: OPTIMISER_PLAN_STATUS.STALE,
  });
  assert.equal(state.canApply, false);
  assert.match(state.reason, /earlier design state/);
});

// ── TEST 11: undo ────────────────────────────────────────────────────────

test('TEST 11: undo restores only the applied lever previous values', () => {
  const applied = buildLeverApplyInstances({
    leverKey: OPTIMISER_LEVER.DELAY,
    lever: evaluatedLever(OPTIMISER_LEVER.DELAY),
    instances: INSTANCES,
  });
  const reverted = buildLeverUndoInstances({
    leverKey: OPTIMISER_LEVER.DELAY,
    lever: evaluatedLever(OPTIMISER_LEVER.DELAY),
    instances: applied.instances,
  });
  assert.equal(reverted.ok, true);
  assert.equal(reverted.instances[0].delayMs, 0, 'delay returns to its previous value');
  assert.deepEqual(reverted.instances[0].position, { x: 1, y: 2 });
  assert.equal(reverted.instances[0].gainDb, 0);
  assert.equal(reverted.instances[0].polarity, 1);

  const placementApplied = buildLeverApplyInstances({
    leverKey: OPTIMISER_LEVER.PLACEMENT,
    lever: evaluatedLever(OPTIMISER_LEVER.PLACEMENT),
    instances: INSTANCES,
  }).instances;
  const delayApplied = buildLeverApplyInstances({
    leverKey: OPTIMISER_LEVER.DELAY,
    lever: evaluatedLever(OPTIMISER_LEVER.DELAY),
    instances: placementApplied,
  }).instances;
  const delayUndone = buildLeverUndoInstances({
    leverKey: OPTIMISER_LEVER.DELAY,
    lever: evaluatedLever(OPTIMISER_LEVER.DELAY),
    instances: delayApplied,
  }).instances;
  assert.equal(delayUndone[0].delayMs, 0, 'undo reverts its own lever');
  assert.deepEqual(delayUndone[0].position, { x: 1.4, y: 2.6 },
    'the other applied lever is left in place');
});

// ── TEST 12: overall vs selected-seat P20 ────────────────────────────────

test('TEST 12: overall worst P20 and a selected seat are stated separately', () => {
  const seating = [
    { id: 'R1S1', row: 1, column: 1, x: 1 },
    { id: 'R2S4', row: 2, column: 4, x: 4 },
  ];
  const rows = buildP20SeatRows(seating, [
    { seatId: 'R1S1', level: 0, variationDbRaw: 12.24, worstFrequencyHz: 73.44 },
    { seatId: 'R2S4', level: 1, variationDbRaw: 10.24, worstFrequencyHz: 45.27 },
  ]);

  const overall = formatWorstAllSeatP20Line(rows);
  assert.match(overall, /^Worst all-seat P20: /);
  assert.match(overall, /R1S1/);
  assert.match(overall, /73 Hz/);

  const selected = formatSelectedSeatP20Line(rows, 'R2S4');
  assert.match(selected, /^Selected seat: R2S4 /);
  assert.match(selected, /45 Hz/);

  // Selecting a seat never replaces the overall result.
  assert.equal(formatWorstAllSeatP20Line(rows), overall);
  assert.equal(formatSelectedSeatP20Line(rows, null), null);
});