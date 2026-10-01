// adi-calculation-count.test.mjs
// ---------------------------------------------------------------------------
// Regression tests for the ADI calculation-count disclosure.
//
// Product rule: before the run, the card states how many design calculations
// ADI will run for this design, derived from the optimiser's own declared
// search space — never an invented "hundreds" or "thousands". After the run,
// the actual confirmed count is stated, and the per-family breakdown uses honest
// labels rather than summing overlapping stage counters.
//
// Presentation only: no optimiser maths, scoring, grading or apply logic.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ACOUSTIC_ROUNDING_THRESHOLDS,
  ESTIMATE_BASIS_NOTE,
  OPTIMISER_SEARCH_STEPS,
  countActiveSources,
  estimateAcousticCalculations,
  estimateOptimiserCalculations,
  estimateSentence,
  formatCalculationCount,
  resolveSearchGroupCount,
  resultSentence,
} from '@/components/room/bass/optimiserPlan/optimiserCalculationEstimate.js';
import {
  OPTIMISER_FAMILY_SEQUENCE,
  OPTIMISER_LEVER_SEQUENCE,
} from '@/components/room/bass/optimiserPlan/optimiserLeverOrder.js';
import {
  ADI_OPTIMISER_ACTION,
  ADI_OPTIMISER_ACTION_LABEL,
  ADI_OPTIMISER_COPY,
} from '@/components/room/bass/optimiserPlan/resolveAdiOptimiserJourney.js';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, '..');
const read = (path) => readFileSync(join(SRC, path), 'utf8');

const subs = (count) => Array.from({ length: count }, (_, index) => ({
  id: `sub-${index + 1}`,
  enabled: true,
  position: { x: 1 + index, y: 1 + index },
}));

const FAMILY = (estimate, key) => estimate.families.find((family) => family.key === key);

describe('PRE-RUN ESTIMATED COUNT SHOWN', () => {
  it('states an estimated number of design calculations', () => {
    const estimate = estimateOptimiserCalculations({ instances: subs(4) });

    expect(estimate.available).toBe(true);
    expect(estimate.total).toBeGreaterThan(100);
    expect(estimateSentence(estimate)).toBe(
      `ADI will test approximately ${formatCalculationCount(estimate.total)} design options, `
      + `involving over ${formatCalculationCount(
        estimateAcousticCalculations({ designOptions: estimate.total }).claim,
      )} acoustic calculations across seats, frequencies and subwoofer settings.`,
    );
  });

  it('renders the estimate on the pre-run card, and only before a run', () => {
    const card = read('components/room/bass/optimiserPlan/AdiOptimisationJourney.jsx');
    expect(card).toMatch(/OptimiserCalculationEstimateLine/);
    expect(card).toMatch(/const showEstimate = isPreRun && !runEvidence;/);
  });

  it('falls back to the sequence sentence when the count cannot be derived', () => {
    const estimate = estimateOptimiserCalculations({ instances: subs(3) });

    expect(estimate.available).toBe(false);
    expect(estimate.total).toBeNull();
    expect(estimateSentence(estimate))
      .toBe('ADI will run a detailed optimisation sequence to improve bass consistency across the seats.');
  });

  it('states a detailed set below one hundred calculations', () => {
    expect(estimateSentence({ available: true, total: 42 }))
      .toBe('ADI will run a detailed set of design options to improve bass consistency across the seats.');
  });
});

describe('COUNT DERIVED FROM SEARCH SPACE', () => {
  it('reads every family count from the engine\'s declared search space', () => {
    expect(OPTIMISER_SEARCH_STEPS).toEqual({
      delayStepsPerGroup: 30,
      gainStepsPerGroup: 11,
      phaseStepsPerGroup: 36,
      polarityOptionsPerGroup: 2,
      seatingOffsetPositions: 11,
    });
  });

  it('derives the grouping from the design\'s own source count', () => {
    expect(resolveSearchGroupCount(1)).toBe(0);
    expect(resolveSearchGroupCount(2)).toBe(2);
    expect(resolveSearchGroupCount(4)).toBe(2);
    expect(resolveSearchGroupCount(3)).toBeNull();
    expect(countActiveSources([...subs(2), { id: 'off', enabled: false }])).toBe(2);
  });

  it('counts each family for a four-subwoofer design', () => {
    const estimate = estimateOptimiserCalculations({ instances: subs(4) });

    expect(FAMILY(estimate, 'delay').count).toBe(60);
    expect(FAMILY(estimate, 'gain').count).toBe(22);
    expect(FAMILY(estimate, 'phase').count).toBe(72);
    expect(FAMILY(estimate, 'polarity').count).toBe(4);
    expect(FAMILY(estimate, 'placement').count).toBe(192);
    expect(FAMILY(estimate, 'seating').count).toBe(11);
    expect(estimate.total).toBe(361);
  });

  it('counts a two-subwoofer design from the same search space', () => {
    const estimate = estimateOptimiserCalculations({ instances: subs(2) });
    expect(estimate.total).toBe(297);
  });

  it('does not invent an inter-sub search for a single source', () => {
    const estimate = estimateOptimiserCalculations({ instances: subs(1) });
    expect(FAMILY(estimate, 'delay')).toBeUndefined();
    expect(FAMILY(estimate, 'phase')).toBeUndefined();
    expect(estimate.total).toBe(107);
  });

  it('never sums overlapping stage counters', () => {
    const estimator = read('components/room/bass/optimiserPlan/optimiserCalculationEstimate.js');
    expect(estimator).not.toMatch(/candidatesEvaluated|generated|screened|promoted/);
  });
});

describe('NO UNSUPPORTED CLAIMS', () => {
  it('states the acoustic claim in a stated tier, never a raw derived figure', () => {
    for (const quantity of [1, 2, 4]) {
      const sentence = estimateSentence(estimateOptimiserCalculations({ instances: subs(quantity) }));
      expect(sentence).not.toMatch(/\d\.\d/);
      const claimed = ACOUSTIC_ROUNDING_THRESHOLDS
        .find((tier) => sentence.includes(tier.toLocaleString('en-GB')));
      expect(claimed, `no stated tier found in: ${sentence}`).toBeDefined();
    }
  });

  it('states the design option count as design options, never as calculations', () => {
    const estimate = estimateOptimiserCalculations({ instances: subs(4) });
    const sentence = estimateSentence(estimate);

    expect(sentence).toContain(`${formatCalculationCount(estimate.total)} design options`);
    expect(sentence).not.toMatch(/\d+ design calculations/);
  });

  it('states that the figure is an estimate from the search space', () => {
    expect(ESTIMATE_BASIS_NOTE).toMatch(/Estimated from the optimiser's declared search space/);
    const estimate = estimateOptimiserCalculations({ instances: subs(4) });
    expect(estimate.basisNote).toBe(ESTIMATE_BASIS_NOTE);
  });
});

describe('POST-RUN ACTUAL COUNT SHOWN', () => {
  it('states the confirmed design options and the acoustic work behind them', () => {
    const block = read('components/room/bass/optimiserPlan/OptimiserRunEvidenceBlock.jsx');
    expect(block).toMatch(/resultSentence\(evidence\.candidatesEvaluated/);
    expect(block).toMatch(/ADI completed \{evidence\.candidatesEvaluated\} confirmed design calculations/);
  });

  it('states the run headline as design options with the rounded acoustic claim', () => {
    const options = 361;
    expect(resultSentence(options, { seatCount: 9, activeSubwooferCount: 4 })).toBe(
      `ADI tested ${formatCalculationCount(options)} design options, involving over 250,000 acoustic `
      + 'calculations across seats, frequencies and subwoofer settings.',
    );
  });

  it('replaces the estimate with real evidence rather than showing both', () => {
    const card = read('components/room/bass/optimiserPlan/AdiOptimisationJourney.jsx');
    expect(card).toMatch(/!runEvidence/);
  });
});

describe('FAMILY BREAKDOWN HONEST', () => {
  it('labels each family row with what its counter counts', () => {
    const block = read('components/room/bass/optimiserPlan/OptimiserRunEvidenceBlock.jsx');
    expect(block).toMatch(/confirmed/);
    expect(block).toMatch(/proxy searches/);
    expect(block).toMatch(/STAGE OPERATIONS/);
  });

  it('never presents the pre-run estimate as a confirmed count', () => {
    const line = read('components/room/bass/optimiserPlan/OptimiserCalculationEstimateLine.jsx');
    expect(line).not.toMatch(/confirmed/);
  });
});

describe('LEVER ORDER CORRECT', () => {
  it('lists the eight levers least intrusive first', () => {
    expect(OPTIMISER_FAMILY_SEQUENCE).toEqual([
      'delay', 'gain', 'phase', 'polarity', 'placement', 'layout', 'subwoofer_option', 'seating',
    ]);
    expect(ADI_OPTIMISER_COPY.WILL_EVALUATE).toMatch(
      /delay · gain · phase\/crossover-region alignment · polarity · placement · alternative layouts · subwoofer option · seating/,
    );
  });

  it('keeps phase third', () => {
    expect(OPTIMISER_LEVER_SEQUENCE.indexOf('phase')).toBe(2);
  });
});

describe('PLACEMENT FIFTH', () => {
  it('keeps placement fifth in the order and the copy', () => {
    expect(OPTIMISER_LEVER_SEQUENCE.indexOf('placement')).toBe(4);
    expect(ADI_OPTIMISER_COPY.WILL_EVALUATE.indexOf('placement'))
      .toBeGreaterThan(ADI_OPTIMISER_COPY.WILL_EVALUATE.indexOf('polarity'));
  });
});

describe('COPY AND BUTTON', () => {
  it('uses the pre-run copy and the one Re-run Optimisation Plan control', () => {
    expect(ADI_OPTIMISER_ACTION_LABEL[ADI_OPTIMISER_ACTION.RUN]).toBe('Re-run Optimisation Plan');
    expect(ADI_OPTIMISER_COPY.RUN_EXPLANATION).toMatch(/checks electronic adjustments first/);
    expect(ADI_OPTIMISER_COPY.RUN_EXPLANATION).toMatch(/subwoofer placement, alternative layouts, different subwoofer capability, and seating changes/);
    expect(ADI_OPTIMISER_COPY.SYSTEMATIC_NOTE).toMatch(/P20 seat-to-seat consistency/);
    expect(ADI_OPTIMISER_COPY.SYSTEMATIC_NOTE).toMatch(/protecting P19 reference-seat smoothness/);
    expect(ADI_OPTIMISER_COPY.PHASE_BAND_NOTE).toMatch(/80 Hz and 150 Hz/);
  });
});

describe('NO OPTIMISER MATHS CHANGE', () => {
  it('estimates without touching any engine evaluation', () => {
    const estimator = read('components/room/bass/optimiserPlan/optimiserCalculationEstimate.js');
    expect(estimator).not.toMatch(/new Worker|resumWithTuning|scoreGrouped|canonicalConfirm|updateMany|base44/);
  });

  it('reads only declared constants from the engine', () => {
    const estimator = read('components/room/bass/optimiserPlan/optimiserCalculationEstimate.js');
    expect(estimator).toMatch(/STAGE1_CANDIDATE_BUDGETS/);
    expect(estimator).toMatch(/PHASE_CONTROL_MAX_DEG/);
  });
});