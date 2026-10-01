// optimiser-actionability-gating.test.mjs
// ---------------------------------------------------------------------------
// The product rule under test, stated once:
//
//   A winner is not actionable unless it contains an independently evaluated,
//   applyable change with at least 1 dB useful improvement.
//
// Four consequences are asserted here, plus the two save sites that apply the
// rule and the seating Apply/Undo path that touches nothing but seat
// coordinates:
//
//   1. a winner whose change was not retained        → evaluation_incomplete
//   2. an 0.82 dB improvement                        → no_useful_improvement, no Apply
//   3. a 1.2 dB improvement, legal destinations      → actionable, Apply available
//   4. seating Apply / Undo                          → seat y only, exact restore
//   5. both save sites                               → gated through one authority
//
// Nothing here recalculates acoustics, and nothing here changes the materiality
// gate: the tests ask the existing verdict authority exactly as the product does.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildOptimiserResultForSave,
  leverIsOfferable,
  resolvePlanActionability,
  WINNING_CHANGE_NOT_RETAINED_REASON,
} from '../src/components/room/bass/optimiserPlan/optimiserPlanSave.js';
import { OPTIMISER_TERMINAL_OUTCOME } from '../src/components/room/bass/optimiserPlan/optimiserPlanConstants.js';
import {
  buildSeatingApplyPositions,
  buildSeatingUndoPositions,
} from '../src/components/room/bass/optimiserPlan/optimiserPlanLeverApply.js';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, '..');
const read = (path) => readFileSync(join(SRC, path), 'utf8');

const SAVE_SITES = [
  'src/components/room/bass/optimiseWorkflow/useRunOptimisationPlan.js',
  'src/components/room/bass/optimiseWorkflow/OptimiseAndCalculate.jsx',
];

/** The design's own P19/P20 headline. Both L2, so P20 is the limiting metric. */
const BASELINE = { p20Level: 2, p19Level: 2, p20VariationDb: 4 };

/** One evaluated PLACEMENT lever with a given P20 delta. */
const placementLever = ({ p20DeltaDb, variationDb, destinationsValid = true }) => ({
  lever: 'placement',
  evaluated: true,
  notEvaluated: false,
  evidenceStatus: 'evaluated',
  changes: [{ subId: 'sub-front-1', fromX: 1.29, toX: 1.1, fromY: 0.14, toY: 0.4 }],
  effect: {
    p20Level: 2,
    p20VariationDb: variationDb,
    p20DeltaDb,
    p19DeltaDb: null,
    p14DeltaDb: null,
  },
  validation: {
    destinationsValid,
    basis: 'room bounds and screen clearance',
    reason: destinationsValid ? null : 'the destination subwoofer position is outside the room.',
  },
});

const planWith = (placement) => ({
  version: 3,
  levers: { placement },
  baseline: BASELINE,
});

/** A winning candidate with no retained change of its own. */
const WINNER_ONLY_SELECTION = {
  winner: { candidateId: 'combined-1', candidateKind: 'combined' },
  evaluationIncomplete: false,
};

describe('a winner is not actionable without a retained, material change', () => {
  it('saves a winner with no retained change as evaluation_incomplete', () => {
    const result = resolvePlanActionability({ plan: null, selection: WINNER_ONLY_SELECTION });

    expect(result.actionable).toBe(false);
    expect(result.terminalOutcome).toBe(OPTIMISER_TERMINAL_OUTCOME.EVALUATION_INCOMPLETE);
    expect(result.reason).toBe(WINNING_CHANGE_NOT_RETAINED_REASON);
    expect(result.offerableLevers).toEqual([]);
  });

  it('saves an 0.82 dB improvement as no_useful_improvement with no Apply', () => {
    const plan = planWith(placementLever({ p20DeltaDb: -0.82, variationDb: 3.18 }));
    const lever = plan.levers.placement;

    // The materiality gate itself: 0.82 dB is not a meaningful change.
    expect(leverIsOfferable(lever, BASELINE)).toBe(false);

    const result = resolvePlanActionability({ plan, selection: { winner: { candidateId: 'combined-1' } } });
    expect(result.actionable).toBe(false);
    expect(result.terminalOutcome).toBe(OPTIMISER_TERMINAL_OUTCOME.NO_USEFUL_IMPROVEMENT);
    expect(result.offerableLevers).toEqual([]);
    // No offer means no Apply path is ever presented for this run.
    expect(plan.levers.placement.changes.length).toBeGreaterThan(0);
    expect(leverIsOfferable(lever, BASELINE)).toBe(false);
  });

  it('saves a 1.2 dB improvement with legal destinations as actionable', () => {
    const plan = planWith(placementLever({ p20DeltaDb: -1.2, variationDb: 2.8 }));
    const lever = plan.levers.placement;

    expect(leverIsOfferable(lever, BASELINE)).toBe(true);

    const result = resolvePlanActionability({ plan, selection: { winner: { candidateId: 'position-4' } } });
    expect(result.actionable).toBe(true);
    expect(result.terminalOutcome).toBeNull();
    expect(result.offerableLevers).toEqual(['placement']);
  });

  it('never offers a material change whose destination geometry is invalid', () => {
    const plan = planWith(placementLever({ p20DeltaDb: -2.4, variationDb: 1.6, destinationsValid: false }));
    const result = resolvePlanActionability({ plan, selection: { winner: { candidateId: 'position-4' } } });

    expect(leverIsOfferable(plan.levers.placement, BASELINE)).toBe(false);
    expect(result.actionable).toBe(false);
    expect(result.terminalOutcome).toBe(OPTIMISER_TERMINAL_OUTCOME.NO_USEFUL_IMPROVEMENT);
    expect(String(result.reason)).toContain('cannot be applied');
  });
});

describe('what the run is saved as', () => {
  it('saves a plan only when it is actionable, and terminal evidence otherwise', () => {
    const actionable = buildOptimiserResultForSave({
      plan: planWith(placementLever({ p20DeltaDb: -1.2, variationDb: 2.8 })),
      selection: { winner: { candidateId: 'position-4' } },
      identity: { projectId: 'p', versionId: 'v1' },
    });
    expect(actionable.actionablePlan).not.toBeNull();
    expect(actionable.actionablePlan.run).toBeTruthy();
    expect(actionable.runEvidence).toBeNull();

    const subMaterial = buildOptimiserResultForSave({
      plan: planWith(placementLever({ p20DeltaDb: -0.82, variationDb: 3.18 })),
      selection: { winner: { candidateId: 'combined-1' } },
      identity: { projectId: 'p', versionId: 'v1' },
    });
    expect(subMaterial.actionablePlan).toBeNull();
    expect(subMaterial.runEvidence?.terminalOutcome).toBe(OPTIMISER_TERMINAL_OUTCOME.NO_USEFUL_IMPROVEMENT);

    const incomplete = buildOptimiserResultForSave({
      plan: null,
      selection: WINNER_ONLY_SELECTION,
      identity: { projectId: 'p', versionId: 'v1' },
    });
    expect(incomplete.actionablePlan).toBeNull();
    // The outcome is stated on the record itself and repeated inside the run
    // summary, which is what the card reads after reopen.
    expect(incomplete.runEvidence?.terminalOutcome).toBe(OPTIMISER_TERMINAL_OUTCOME.EVALUATION_INCOMPLETE);
    expect(incomplete.runEvidence?.run?.outcome).toBe(OPTIMISER_TERMINAL_OUTCOME.EVALUATION_INCOMPLETE);
    expect(incomplete.runEvidence?.run?.rejectionReasons).toContain(WINNING_CHANGE_NOT_RETAINED_REASON);
    expect(incomplete.runEvidence?.run?.actionablePlanProduced).toBe(false);
  });
});

describe('both save sites are gated through the one authority', () => {
  SAVE_SITES.forEach((path) => {
    it(`${path} saves through buildOptimiserResultForSave`, () => {
      const source = read(path);
      expect(source).toContain('buildOptimiserResultForSave');
      expect(source).toContain('actionablePlan: persistedPlan');
      // The raw builders must no longer be called directly from a save site:
      // that is exactly how a winner became "actionable" on its own.
      expect(source).not.toContain('buildActionableOptimiserRunSummary');
      expect(source).not.toContain('buildOptimiserRunEvidence');
    });
  });
});

describe('seating Apply and Undo touch only seat coordinates', () => {
  const SEATS = [
    { id: 'seat-1', x: 1.5, y: 4.0, rowNumber: 1, earHeightM: 1.2, label: 'Row 1 · Left' },
    { id: 'seat-2', x: 2.6, y: 4.0, rowNumber: 1, earHeightM: 1.2, label: 'Row 1 · Centre' },
    { id: 'seat-3', x: 3.7, y: 5.8, rowNumber: 2, earHeightM: 1.2, label: 'Row 2 · Right' },
  ];
  const SEATING_LEVER = {
    lever: 'seating',
    evaluated: true,
    changes: [
      { lever: 'seating', seatId: 'seat-1', fromY: 4.0, toY: 3.9, deltaMm: -100, direction: 'toward the screen' },
      { lever: 'seating', seatId: 'seat-2', fromY: 4.0, toY: 3.9, deltaMm: -100, direction: 'toward the screen' },
    ],
    seating: { seatingOffsetMm: -100, wholeBlockMoved: true, seatIds: ['seat-1', 'seat-2'] },
  };

  it('writes the evaluated y only, leaving every other seat field intact', () => {
    const applied = buildSeatingApplyPositions({ lever: SEATING_LEVER, seatingPositions: SEATS });

    expect(applied.ok).toBe(true);
    expect(applied.affectedSeatIds).toEqual(['seat-1', 'seat-2']);
    expect(Object.keys(applied)).not.toContain('instances');

    expect(applied.seatingPositions[0].y).toBe(3.9);
    expect(applied.seatingPositions[1].y).toBe(3.9);
    // Untouched seat, untouched values.
    expect(applied.seatingPositions[2]).toEqual(SEATS[2]);
    // Every other field of a moved seat survives unchanged.
    const { y: appliedY, ...appliedRest } = applied.seatingPositions[0];
    const { y: originalY, ...originalRest } = SEATS[0];
    expect(appliedY).not.toBe(originalY);
    expect(appliedRest).toEqual(originalRest);
    // The design's own array is never mutated in place.
    expect(SEATS[0].y).toBe(4.0);
  });

  it('restores the exact starting positions on Undo', () => {
    const applied = buildSeatingApplyPositions({ lever: SEATING_LEVER, seatingPositions: SEATS });
    const undone = buildSeatingUndoPositions({
      lever: SEATING_LEVER,
      seatingPositions: applied.seatingPositions,
    });

    expect(undone.ok).toBe(true);
    expect(undone.seatingPositions).toEqual(SEATS);
  });

  it('refuses to apply a seating movement with no evaluated change', () => {
    const blocked = buildSeatingApplyPositions({
      lever: { lever: 'seating', evaluated: true, changes: [] },
      seatingPositions: SEATS,
    });

    expect(blocked.ok).toBe(false);
    expect(blocked.seatingPositions).toEqual(SEATS);
  });
});