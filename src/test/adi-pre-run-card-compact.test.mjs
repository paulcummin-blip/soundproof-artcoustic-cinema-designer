// adi-pre-run-card-compact.test.mjs
// ---------------------------------------------------------------------------
// Regression tests for the compact pre-run ADI bass optimisation card.
//
// Product rule: the default pre-run card sells the value. It shows how many
// design options ADI will test and the acoustic work behind them, one short line
// about what ADI checks first, and a prominent button. Every technical detail —
// lever order, per-family counts, what ADI compares against, and how the
// estimate was derived — sits behind a disclosure that is collapsed by default.
//
// Presentation only: no optimiser maths, scoring, grading or apply logic.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ADI_OPTIMISER_ACTION,
  ADI_OPTIMISER_ACTION_LABEL,
  ADI_OPTIMISER_COPY,
  ADI_OPTIMISER_JOURNEY_STATE,
  resolveAdiOptimiserJourney,
} from '@/components/room/bass/optimiserPlan/resolveAdiOptimiserJourney.js';
import { OPTIMISER_PLAN_STATUS } from '@/components/room/bass/optimiserPlan/optimiserPlanConstants.js';
import {
  OPTIMISER_FAMILY_SEQUENCE,
  OPTIMISER_LEVER_SEQUENCE,
  leverLabel,
} from '@/components/room/bass/optimiserPlan/optimiserLeverOrder.js';
import {
  estimateOptimiserCalculations,
  estimateSentence,
} from '@/components/room/bass/optimiserPlan/optimiserCalculationEstimate.js';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, '..');
const read = (path) => readFileSync(join(SRC, path), 'utf8');

const PLAN = 'components/room/bass/optimiserPlan/';
const subs = (count) => Array.from({ length: count }, (_, index) => ({ id: `s${index}`, enabled: true }));

const noPlan = () => resolveAdiOptimiserJourney({ planView: null });
const stalePlan = () => resolveAdiOptimiserJourney({
  planView: { status: OPTIMISER_PLAN_STATUS.STALE },
});

describe('PRE-RUN COPY SHORTENED', () => {
  it('shows no technical paragraph in the default pre-run card', () => {
    for (const journey of [noPlan(), stalePlan()]) {
      expect(journey.state === ADI_OPTIMISER_JOURNEY_STATE.OPTIMISATION_REQUIRED
        || journey.state === ADI_OPTIMISER_JOURNEY_STATE.REEVALUATION_REQUIRED).toBe(true);
      expect(journey.explanation).toBeNull();
      expect(journey.notes).toEqual([]);
    }
  });

  it('never renders the long-form technical statements by default', () => {
    for (const journey of [noPlan(), stalePlan()]) {
      const text = [journey.explanation, ...journey.notes].filter(Boolean).join(' ');
      expect(text).not.toContain(ADI_OPTIMISER_COPY.SYSTEMATIC_NOTE);
      expect(text).not.toContain(ADI_OPTIMISER_COPY.PHASE_BAND_NOTE);
      expect(text).not.toContain(ADI_OPTIMISER_COPY.WILL_EVALUATE);
    }
  });

  it('keeps the visible copy to the short summary', () => {
    expect(ADI_OPTIMISER_COPY.NO_PLAN.split(' ').length).toBeLessThan(15);
    expect(ADI_OPTIMISER_COPY.PRE_RUN_SUMMARY).toBe(
      'It checks delay, gain, phase and polarity before suggesting physical changes such as moving subwoofers or seats.',
    );
  });

  it('renders the short summary under the count', () => {
    const line = read(`${PLAN}OptimiserCalculationEstimateLine.jsx`);
    expect(line).toMatch(/ADI_OPTIMISER_COPY\.PRE_RUN_SUMMARY/);
  });

  it('does not explain candidate counting in the default view', () => {
    const line = read(`${PLAN}OptimiserCalculationEstimateLine.jsx`);
    expect(line).not.toMatch(/basisNote|scopeNote|families/);
    expect(line).not.toMatch(/canonically|design decision/);
  });
});

describe('CALCULATION COUNT STILL VISIBLE', () => {
  it('states the design options and the acoustic claim on the default card', () => {
    const estimate = estimateOptimiserCalculations({ instances: subs(4) });
    expect(estimateSentence(estimate)).toContain('361');
    expect(estimateSentence(estimate)).toContain('361 design options');
    expect(estimateSentence(estimate)).toContain('over 250,000 acoustic calculations');
  });

  it('is rendered in the pre-run card, before the action', () => {
    const card = read(`${PLAN}AdiOptimisationJourney.jsx`);
    const estimateAt = card.indexOf('<OptimiserCalculationEstimateLine');
    const actionAt = card.indexOf('{journey.actionLabel}');
    expect(estimateAt).toBeGreaterThan(-1);
    expect(estimateAt).toBeLessThan(actionAt);
  });
});

describe('DETAILS COLLAPSED BY DEFAULT', () => {
  it('uses a disclosure that is collapsed, not an open panel', () => {
    const detail = read(`${PLAN}OptimiserCalculationDetail.jsx`);
    expect(detail).toMatch(/<details/);
    expect(detail).toMatch(/<summary/);
    expect(detail).not.toMatch(/open=\{|open=/);
  });

  it('sits below the button, as the optional detail', () => {
    const card = read(`${PLAN}AdiOptimisationJourney.jsx`);
    const actionAt = card.indexOf('{journey.actionLabel}');
    const detailAt = card.indexOf('<OptimiserCalculationDetail instances={instances} seatCount={seatCount} />');
    expect(actionAt).toBeGreaterThan(-1);
    expect(detailAt).toBeGreaterThan(actionAt);
  });

  it('holds the lever order, the per-family counts and the comparison', () => {
    const detail = read(`${PLAN}OptimiserCalculationDetail.jsx`);
    expect(detail).toMatch(/OPTIMISER_FAMILY_SEQUENCE/);
    expect(detail).toMatch(/DISCLOSURE_ESTIMATE_LABEL/);
    expect(detail).toMatch(/DISCLOSURE_COMPARISON/);
    expect(detail).toMatch(/DISCLOSURE_TITLE/);
  });

  it('keeps the method notes behind the disclosure', () => {
    const detail = read(`${PLAN}OptimiserCalculationDetail.jsx`);
    expect(detail).toMatch(/basisNote/);
    expect(detail).toMatch(/scopeNote/);
  });

  it('is rendered only before a run, never beside real evidence', () => {
    const card = read(`${PLAN}AdiOptimisationJourney.jsx`);
    expect(card).toMatch(/\{showEstimate && <OptimiserCalculationDetail instances=\{instances\} seatCount=\{seatCount\} \/>\}/);
    expect(card).toMatch(/const showEstimate = isPreRun && !runEvidence;/);
  });
});

describe('BUTTON PROMINENT', () => {
  it('keeps the primary action and gives it the larger treatment', () => {
    const card = read(`${PLAN}AdiOptimisationJourney.jsx`);
    expect(card).toMatch(/onClick=\{onRunOptimisationPlan\}/);
    expect(card).toMatch(/px-5 py-2\.5 text-\[13px\]/);
    expect(card).toMatch(/bg-\[#213428\]/);
  });

  it('labels the one run control Bass Optimiser in every state', () => {
    // ONE feature name, identical in every state that offers the action.
    expect(ADI_OPTIMISER_ACTION_LABEL[ADI_OPTIMISER_ACTION.RUN]).toBe('Bass Optimiser');
    expect(ADI_OPTIMISER_ACTION_LABEL[ADI_OPTIMISER_ACTION.RERUN]).toBe('Bass Optimiser');
    expect(ADI_OPTIMISER_ACTION_LABEL[ADI_OPTIMISER_ACTION.COMPLETE]).toBe('Bass Optimiser');
    expect(noPlan().actionLabel).toBe('Bass Optimiser');
  });
});

describe('LEVER ORDER PRESERVED', () => {
  it('lists the eight levers least intrusive first in the disclosure', () => {
    const order = OPTIMISER_FAMILY_SEQUENCE.map((key) => leverLabel(key)).join(' · ');
    expect(order).toBe(
      'Delay · Gain · Phase · Polarity · Placement · Layout · Subwoofer option · Seating',
    );
  });

  it('keeps placement after every electronic lever', () => {
    expect(OPTIMISER_LEVER_SEQUENCE.indexOf('placement')).toBe(4);
    const order = OPTIMISER_FAMILY_SEQUENCE;
    expect(order.indexOf('placement')).toBeGreaterThan(order.indexOf('polarity'));
    expect(order.indexOf('placement')).toBeGreaterThan(order.indexOf('phase'));
    expect(order.indexOf('placement')).toBeLessThan(order.indexOf('seating'));
  });

  it('derives the disclosure list from the one sequence, never a copy', () => {
    const detail = read(`${PLAN}OptimiserCalculationDetail.jsx`);
    expect(detail).toMatch(/OPTIMISER_FAMILY_SEQUENCE\s*\n?\s*\.map/);
    expect(detail).not.toMatch(/"Delay · Gain · Phase · Polarity/);
  });
});

describe('NO LOGIC CHANGE', () => {
  it('keeps the same states, actions and run eligibility', () => {
    expect(noPlan().state).toBe(ADI_OPTIMISER_JOURNEY_STATE.OPTIMISATION_REQUIRED);
    expect(noPlan().action).toBe(ADI_OPTIMISER_ACTION.RUN);
    expect(noPlan().canRun).toBe(true);
    expect(stalePlan().state).toBe(ADI_OPTIMISER_JOURNEY_STATE.REEVALUATION_REQUIRED);
    expect(stalePlan().action).toBe(ADI_OPTIMISER_ACTION.RERUN);
  });

  it('still reports a blocked run with its stated reason', () => {
    const blocked = resolveAdiOptimiserJourney({
      planView: null,
      blockReason: { code: 'calculation_required', message: 'Calculate Performance first.' },
    });
    expect(blocked.canRun).toBe(false);
    expect(blocked.blockReason.message).toBe('Calculate Performance first.');
  });

  it('touches no engine, store or entity from the presentation components', () => {
    for (const file of ['OptimiserCalculationDetail.jsx', 'OptimiserCalculationEstimateLine.jsx']) {
      const source = read(`${PLAN}${file}`);
      expect(source).not.toMatch(/new Worker|base44|\.update\(|scoreGrouped|resumWithTuning/);
    }
  });
});