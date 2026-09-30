// phase-crossover-region-lever.test.mjs
// ---------------------------------------------------------------------------
// Regression tests for the phase / crossover-region lever.
//
// Product rule: main speakers are normally high-passed between 80 Hz and
// 150 Hz, so a problem in that band may be a crossover-region problem. ADI must
// state whether it tested that region — never omit the lever, never treat the
// band as outside bass optimisation, and never present a sub-only all-pass
// phase search as crossover-region alignment.
//
// These tests assert presentation and honesty only. No bass maths is exercised
// because none was changed.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  OPTIMISER_FAMILY_SEQUENCE,
  OPTIMISER_LEVER_SEQUENCE,
  PLAN_FAMILY_STATEMENTS,
} from '@/components/room/bass/optimiserPlan/optimiserLeverOrder.js';
import {
  OPTIMISER_RUN_FAMILY,
  buildFamilyLedger,
} from '@/components/room/bass/optimiserPlan/optimiserRunFamilies.js';
import {
  CROSSOVER_REGION_BAND_NOTE,
  CROSSOVER_REGION_HZ,
  CROSSOVER_REGION_NOT_EVALUATED_REASON,
  CROSSOVER_REGION_PHASE_SUPPORTED,
  CROSSOVER_REGION_PURPOSE,
  PHASE_CROSSOVER_REGION_TITLE,
  PHASE_LEVER_STATE,
  resolveCrossoverRegionPhaseRow,
  resolvePhaseLeverState,
} from '@/components/room/bass/optimiserPlan/crossoverRegionPhaseAuthority.js';
import { OPTIMISER_LEVER } from '@/components/room/bass/optimiserPlan/optimiserPlanConstants.js';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, '..', 'src');
const read = (path) => readFileSync(join(SRC, path), 'utf8');

const CURRENT = { p19VariationDb: 11.0, p20VariationDb: 11.5, p14AchievedDb: 121 };

/** A run that did search subwoofer-only phase. */
const PHASE_DIAGNOSTICS = {
  stages: [{
    name: 'Phase',
    bestScoreAfter: { p19VariationDb: 11.1, p20VariationDb: 11.4, p19Level: 2, p20Level: 2 },
    candidatesEvaluated: { confirmed: 12 },
    winningCandidate: { candidateId: 'grouped-phase:[a]:35' },
  }],
};

const phaseRow = (ledger) => ledger.find((family) => family.family === OPTIMISER_RUN_FAMILY.PHASE);

describe('PHASE IS LEVER 3', () => {
  it('places phase third in the lever order', () => {
    expect(OPTIMISER_LEVER_SEQUENCE.indexOf('phase')).toBe(2);
    expect(OPTIMISER_FAMILY_SEQUENCE.indexOf('phase')).toBe(2);
  });
});

describe('PLACEMENT IS LEVER 5', () => {
  it('keeps placement fifth, after every electronic lever', () => {
    expect(OPTIMISER_LEVER_SEQUENCE.indexOf('placement')).toBe(4);
    expect(OPTIMISER_FAMILY_SEQUENCE.indexOf('placement')).toBe(4);
    expect(OPTIMISER_LEVER_SEQUENCE.indexOf('placement'))
      .toBeGreaterThan(OPTIMISER_LEVER_SEQUENCE.indexOf('phase'));
  });
});

describe('PHASE ROW SHOWN — no silent omission', () => {
  it('always reports the phase/crossover-region family, even with no search data', () => {
    const ledger = buildFamilyLedger({ selection: null, diagnostics: null, current: CURRENT });
    const phase = phaseRow(ledger);

    expect(phase).toBeTruthy();
    expect(phase.label).toBe(PHASE_CROSSOVER_REGION_TITLE);
    expect(phase.crossoverRegion).toBeTruthy();
    expect(ledger.indexOf(phase)).toBe(2);
  });

  it('carries the row through the evidence builder to the card', () => {
    const evidenceSource = read('components/room/bass/optimiserPlan/buildOptimiserRunEvidence.js');
    expect(evidenceSource).toMatch(/buildFamilyLedger\(/);
  });
});

describe('80–150 HZ CROSSOVER REGION ACKNOWLEDGED', () => {
  it('states the band the crossover region occupies', () => {
    expect(CROSSOVER_REGION_HZ).toEqual({ low: 80, high: 150 });
    const row = resolveCrossoverRegionPhaseRow();
    expect(row.bandHz).toEqual({ low: 80, high: 150 });
    expect(row.slopeDbPerOct).toBe(24);
  });

  it('states that a problem in the band is not outside bass optimisation', () => {
    expect(CROSSOVER_REGION_BAND_NOTE).toMatch(/80 Hz/);
    expect(CROSSOVER_REGION_BAND_NOTE).toMatch(/150 Hz/);
    expect(CROSSOVER_REGION_BAND_NOTE).toMatch(/not only a placement problem/);
  });

  it('gives the lever its purpose in the card', () => {
    expect(CROSSOVER_REGION_PURPOSE).toMatch(/subwoofer phase and timing/);
    expect(CROSSOVER_REGION_PURPOSE).toMatch(/80–150 Hz/);
    const block = read('components/room/bass/optimiserPlan/CrossoverRegionPhaseEvidence.jsx');
    expect(block).toMatch(/region\.purpose/);
    expect(block).toMatch(/region\.bandNote/);
  });
});

describe('PHASE TESTED OR CLEARLY MARKED NOT EVALUATED', () => {
  it('is marked not evaluated, with the engine\'s own reason', () => {
    expect(CROSSOVER_REGION_PHASE_SUPPORTED).toBe(false);

    const ledger = buildFamilyLedger({
      selection: {},
      diagnostics: PHASE_DIAGNOSTICS,
      current: CURRENT,
    });
    const phase = phaseRow(ledger);

    expect(phase.crossoverRegion.state).toBe(PHASE_LEVER_STATE.NOT_TESTED_UNSUPPORTED);
    expect(phase.crossoverRegion.stateLabel)
      .toBe('Not tested — model does not yet evaluate crossover-region phase');
    expect(phase.statusLabel).toBe(phase.crossoverRegion.stateLabel);
    expect(phase.reason).toBe(CROSSOVER_REGION_NOT_EVALUATED_REASON);
    expect(phase.reason).toMatch(/does not model crossover-region phase between the main speakers and subwoofers/);
  });

  it('never presents a sub-only phase search as crossover-region alignment', () => {
    const ledger = buildFamilyLedger({
      selection: {},
      diagnostics: PHASE_DIAGNOSTICS,
      current: CURRENT,
    });
    const phase = phaseRow(ledger);

    expect(phase.tested).toBe(false);
    expect(phase.candidatesEvaluated).toBe(12);
    expect(phase.bestAttemptScope).toBe('subwoofer_phase_only');
    expect(phase.crossoverRegion.subPhaseOnly.tested).toBe(true);
    expect(phase.crossoverRegion.subPhaseOnly.note).toMatch(/not crossover-region alignment/);
    expect(phase.crossoverRegion.supportReason).toMatch(/no main-speaker high-pass path/);
  });

  it('has the wording ready for when the region can be evaluated', () => {
    expect(resolvePhaseLeverState({ supported: true, evaluated: true, verdict: 'recommended' }))
      .toBe(PHASE_LEVER_STATE.TESTED_RECOMMENDED);
    expect(resolvePhaseLeverState({ supported: true, evaluated: true, verdict: 'rejected' }))
      .toBe(PHASE_LEVER_STATE.TESTED_REJECTED);
    expect(resolvePhaseLeverState({ supported: true, evaluated: true }))
      .toBe(PHASE_LEVER_STATE.TESTED_NO_IMPROVEMENT);
    expect(resolvePhaseLeverState({ supported: false, evaluated: true }))
      .toBe(PHASE_LEVER_STATE.NOT_TESTED_UNSUPPORTED);
  });
});

describe('NO UNSAFE APPLY', () => {
  it('offers no phase lever for application', () => {
    expect(OPTIMISER_LEVER).not.toContain('phase');

    const ledger = buildFamilyLedger({
      selection: {},
      diagnostics: PHASE_DIAGNOSTICS,
      current: CURRENT,
    });
    expect(phaseRow(ledger).applicable).toBe(false);
    expect(ledger.every((family) => family.applicable === false)).toBe(true);
  });

  it('states in a saved plan that crossover-region phase is not evaluated', () => {
    const statement = PLAN_FAMILY_STATEMENTS.find((entry) => entry.key === 'phase');
    expect(statement).toBeTruthy();
    expect(statement.statement).toMatch(/not yet evaluated/);
  });

  it('keeps the evidence block free of any Apply control', () => {
    const block = read('components/room/bass/optimiserPlan/OptimiserRunEvidenceBlock.jsx');
    const phaseEvidence = read('components/room/bass/optimiserPlan/CrossoverRegionPhaseEvidence.jsx');
    expect(block).not.toMatch(/<Button|onApply|applyLever/);
    expect(phaseEvidence).not.toMatch(/<Button|onApply|applyLever/);
  });
});

describe('NO DECIMAL dB', () => {
  it('prints no decimal dB on the crossover-region row', () => {
    const phaseEvidence = read('components/room/bass/optimiserPlan/CrossoverRegionPhaseEvidence.jsx');
    expect(phaseEvidence).not.toMatch(/toFixed/);
    expect(phaseEvidence).not.toMatch(/\d\.\d\s*dB/);
  });
});