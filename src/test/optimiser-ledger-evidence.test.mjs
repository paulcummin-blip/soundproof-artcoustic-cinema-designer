// optimiser-ledger-evidence.test.mjs
// ---------------------------------------------------------------------------
// The ADI Bass Optimisation summary ledger, read from the real saved run
// evidence.
//
// What is verified here:
//   • a family the run evaluated is never shown as "Not evaluated"
//   • delay, gain and placement state the run's real outcome
//   • phase states the crossover-region model is not available
//   • polarity distinguishes combined-only evidence from a standalone result
//   • layout is reported as checked in the placement search
//   • sub option and seating state what they are, not "Not evaluated"
//   • a plan's own lever evidence wins over the family ledger
//   • the summary and Engineer details read the same evidence
//   • a zero, missing or invalid limiting frequency is never printed as "0 Hz"
//   • absorption advice still requires poor P20 and a real reason
//
// The fixtures are driven through the real builders (buildOptimiserRunEvidence
// → resolveOptimiserPlanStatus → buildAdiDesignerSummary), so the ledger is
// tested against the evidence the optimiser actually saves.
//
// Run: node --import ./test/_alias-register.mjs src/test/optimiser-ledger-evidence.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  buildActionableOptimiserRunSummary,
  buildOptimiserRunEvidence,
} from '../components/room/bass/optimiserPlan/buildOptimiserRunEvidence.js';
import { resolveOptimiserPlanStatus } from '../components/room/bass/optimiserPlan/resolveOptimiserPlanStatus.js';
import {
  buildAdiDesignerSummary,
  buildTestedOptionRows,
} from '../components/room/bass/optimiserPlan/adiDesignerSummary.js';
import { OPTIMISER_PLAN_VERSION } from '../components/room/bass/optimiserPlan/optimiserPlanConstants.js';
import {
  ADI_ROW_OUTCOME,
  ADI_ROW_STATUS,
  buildFamilyLedgerRows,
} from '../components/room/bass/optimiserPlan/optimiserFamilyLedgerRows.js';
import {
  MIN_VALID_FREQUENCY_HZ,
  frequencyText,
  validFrequencyHz,
} from '../components/room/bass/optimiserPlan/optimiserWholeNumberDb.js';
import {
  ABSORPTION_NO_FREQUENCY_REASON,
  ABSORPTION_STATUS,
  resolveAbsorptionAdvice,
} from '../components/room/bass/optimiserPlan/absorptionAdviceAuthority.js';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const SUMMARY_MODULE = read('components/room/bass/optimiserPlan/adiDesignerSummary.js');
const EVIDENCE_BLOCK = read('components/room/bass/optimiserPlan/OptimiserRunEvidenceBlock.jsx');

const INSTANCES = [
  { id: 'sub-1', model: 'SUB4-12', enabled: true, legacyGroup: 'front' },
  { id: 'sub-2', model: 'SUB4-12', enabled: true, legacyGroup: 'front' },
  { id: 'sub-3', model: 'SUB4-12', enabled: true, legacyGroup: 'rear' },
  { id: 'sub-4', model: 'SUB4-12', enabled: true, legacyGroup: 'rear' },
];

const IDENTITY = Object.freeze({
  projectId: 'marquee',
  versionId: 'v1',
  designFingerprint: 'fp-marquee-1',
  baseDesignFingerprint: 'fp-base',
  resultFingerprint: 'fp-result',
  engineVersion: '3',
});

/**
 * A completed run that confirmed candidates but produced no winner: placement,
 * delay and gain were searched; phase is unsupported; polarity was only ever
 * explored inside the combined candidate; seating was not needed.
 */
const terminalRun = (overrides = {}) => ({
  selection: {
    winner: null,
    currentResult: {
      achievedP20VariationDb: -9,
      achievedP19VariationDb: -3,
      p20Level: 1,
      p19Level: 1,
      perSeatP20: [
        { seatId: 's1', variationDbRaw: -9, level: 1, worstFrequencyHz: 0 },
        { seatId: 's2', variationDbRaw: -8, level: 1, worstFrequencyHz: 0 },
      ],
    },
    confirmedResults: [{ candidateId: 'c1' }, { candidateId: 'c2' }],
    evaluationIssues: [],
    canonicalJobsRun: 4200,
    positionOptimisation: { symmetric: { attempted: true, confirmed: 4 } },
    seatingDiagnostics: { confirmed: 0 },
    ...overrides.selection,
  },
  diagnostics: {
    currentResult: { score: { p20VariationDb: -9, p19VariationDb: -3 } },
    stages: [
      {
        name: 'Placement',
        candidatesEvaluated: { generated: 40, screened: 18, confirmed: 6 },
        bestScoreAfter: { p20VariationDb: -9, p20Level: 1, p19VariationDb: -3 },
        winningCandidate: { candidateId: 'p1' },
      },
      {
        name: 'Delay',
        candidatesEvaluated: { generated: 30, screened: 12, confirmed: 4 },
        bestScoreAfter: { p20VariationDb: -9, p20Level: 1, p19VariationDb: -3 },
      },
      {
        name: 'Gain',
        candidatesEvaluated: { generated: 11, screened: 5, confirmed: 3 },
        bestScoreAfter: { p20VariationDb: -8.7, p20Level: 1, p19VariationDb: -3 },
      },
    ],
    topCandidatesForWinningStage: [
      { candidateId: 'c1', candidateKind: 'placement', score: { p20VariationDb: -9, p20Level: 1, p19VariationDb: -3 } },
    ],
    ...overrides.diagnostics,
  },
});

/** The saved run evidence, then the plan status view the card reads. */
const planViewFromRun = ({ selection, diagnostics }) => {
  const evidence = buildOptimiserRunEvidence({ selection, diagnostics, identity: IDENTITY });
  return resolveOptimiserPlanStatus({
    plan: evidence,
    currentDesignFingerprint: IDENTITY.designFingerprint,
    instances: INSTANCES,
  });
};

const terminalPlanView = (overrides = {}) => planViewFromRun(terminalRun(overrides));

const summaryFor = (planView, overrides = {}) => buildAdiDesignerSummary({
  planView,
  presentation: { state: 'no_useful_improvement', statusLabel: 'No useful improvement found', showApply: false },
  instances: INSTANCES,
  seatCount: 8,
  currentP20Level: 1,
  currentP20Deviation: -9,
  limitingFrequencyHz: 0,
  ...overrides,
});

const rowFor = (summary, label) => summary.rows.find((row) => row.label === label) || null;
const allRowText = (summary) => summary.rows
  .map((row) => `${row.label} ${row.status} ${row.outcome || ''} ${row.actionText || ''}`)
  .join(' | ');

// ── The evidence actually reaches the ledger ─────────────────────────────────

test('the saved run evidence carries a per-family ledger', () => {
  const planView = terminalPlanView();
  const families = planView?.run?.families || [];
  assert.ok(families.length >= 8, 'every family is recorded');
  const familyKeys = families.map((entry) => entry.family);
  ['placement', 'delay', 'gain', 'polarity', 'phase', 'additional_positions', 'subwoofer_option', 'seat_movement']
    .forEach((key) => assert.ok(familyKeys.includes(key), `${key} is in the ledger`));

  const ledger = buildFamilyLedgerRows({ families, baseline: planView.baseline });
  assert.ok(ledger, 'the ledger rows resolve from the run evidence');
  assert.ok(Object.values(ledger).every(Boolean), 'every reported family has a row');
});

test('no row states "Not tested", "Not evaluated" or "Not available"', () => {
  const summary = summaryFor(terminalPlanView());
  assert.equal(summary.rows.length, 9, 'eight families plus absorption');
  const forbidden = /not tested|not evaluated|not available/i;
  assert.ok(
    !summary.rows.some((row) => forbidden.test(`${row.status} ${row.outcome || ''}`)),
    'no row carries forbidden copy after a run',
  );
  assert.deepEqual(
    Object.values(ADI_ROW_STATUS).filter((status) => forbidden.test(status)),
    [],
    'the ledger vocabulary itself contains none of the forbidden phrases',
  );
});

test('delay, gain and placement state the run’s real outcome', () => {
  const summary = summaryFor(terminalPlanView());
  ['Delay', 'Gain', 'Placement'].forEach((label) => {
    const row = rowFor(summary, label);
    assert.equal(row.status, ADI_ROW_STATUS.TESTED, `${label} was tested`);
    assert.equal(row.outcome, ADI_ROW_OUTCOME.NO_USEFUL, `${label} states no useful improvement`);
  });
  // The evidence behind those rows is the families the run confirmed.
  const tested = (summary.rows || []).filter((row) => row.status === ADI_ROW_STATUS.TESTED).map((row) => row.label);
  assert.deepEqual(tested, ['Delay', 'Gain', 'Placement']);
});

test('phase states that the crossover region is not modelled', () => {
  const row = rowFor(summaryFor(terminalPlanView()), 'Phase');
  assert.equal(row.status, ADI_ROW_STATUS.NOT_YET_SUPPORTED);
  assert.equal(row.outcome, ADI_ROW_OUTCOME.PHASE_NOT_MODELLED);
  assert.match(row.outcome, /crossover/i);
});

test('polarity states where its value came from', () => {
  // No proxy searches were recorded for this run, so there is no standalone
  // polarity search to apply: the row says exactly that.
  const row = rowFor(summaryFor(terminalPlanView()), 'Polarity');
  assert.equal(row.status, ADI_ROW_STATUS.NOT_YET_SUPPORTED);
  assert.equal(row.outcome, ADI_ROW_OUTCOME.NO_STANDALONE_SEARCH);
  assert.match(row.outcome, /combined candidate/i);
});

test('layout is reported as checked inside the placement search', () => {
  const row = rowFor(summaryFor(terminalPlanView()), 'Layout');
  assert.equal(row.status, ADI_ROW_STATUS.CHECKED_IN_PLACEMENT);
  assert.equal(row.outcome, ADI_ROW_OUTCOME.NO_BETTER_LAYOUT);
});

test('sub option and seating state what they are', () => {
  const summary = summaryFor(terminalPlanView());
  const sub = rowFor(summary, 'Sub option');
  assert.equal(sub.status, ADI_ROW_STATUS.NOT_YET_SUPPORTED_IN_RUN);
  assert.equal(sub.outcome, ADI_ROW_OUTCOME.COMPARE_SEPARATELY);
  assert.match(sub.outcome, /compare subwoofer models/i);

  const seating = rowFor(summary, 'Seating');
  assert.equal(seating.status, ADI_ROW_STATUS.NOT_YET_SUPPORTED_IN_RUN);
  assert.equal(seating.outcome, ADI_ROW_OUTCOME.SEATING_LAST_RESORT);
});

test('seating reports a tested outcome once the seating search ran', () => {
  const planView = terminalPlanView({
    selection: {
      seatingResult: {
        candidateId: 'seat-1',
        achievedP20VariationDb: -11,
        achievedP20Level: 1,
        achievedP19VariationDb: -4,
        p14AchievedDb: 118,
      },
    },
  });
  const seating = rowFor(summaryFor(planView), 'Seating');
  assert.equal(seating.status, ADI_ROW_STATUS.TESTED, 'a searched seating family is not "last resort"');
  assert.notEqual(seating.outcome, ADI_ROW_OUTCOME.SEATING_LAST_RESORT);
});

// ── Plan evidence wins, and both surfaces read the same field ─────────────────

test('a plan’s own lever evidence wins over the family ledger', () => {
  const planView = terminalPlanView();
  const withLever = {
    ...planView,
    levers: [
      {
        key: 'delay',
        lever: 'delay',
        evaluated: true,
        changes: [{ subId: 'sub-1', fromMs: 0, toMs: 3 }],
        effect: { p20VariationDb: -12, p20Level: 2, p20DeltaDb: -3 },
      },
    ],
  };
  const delay = rowFor({ rows: buildTestedOptionRows(withLever) }, 'Delay');
  assert.equal(delay.status, ADI_ROW_STATUS.TESTED);
  assert.match(String(delay.outcome), /12/, 'the lever’s own evaluated value is stated');
  assert.notEqual(delay.outcome, ADI_ROW_OUTCOME.NO_USEFUL);
});

test('an actionable run records the same family evidence', () => {
  const { selection, diagnostics } = terminalRun();
  const runSummary = buildActionableOptimiserRunSummary({
    selection: { ...selection, winner: { candidateId: 'p1', isPositionCandidate: true, positionCoordinates: [{ x: 1, y: 2 }] } },
    diagnostics,
  });
  assert.ok(runSummary, 'an actionable run produces a summary');
  assert.ok(Array.isArray(runSummary.families) && runSummary.families.length > 0,
    'the winning run states its per-family evidence too');
  const delay = runSummary.families.find((entry) => entry.family === 'delay');
  assert.equal(delay.tested, true, 'delay is recorded as tested');

  // And the card reads those families, so the ledger is never empty after a win.
  const planView = resolveOptimiserPlanStatus({
    plan: {
      planVersion: OPTIMISER_PLAN_VERSION,
      designFingerprint: IDENTITY.designFingerprint,
      run: runSummary,
      baseline: { p20Level: 1, p20VariationDb: -9, p19Level: 1, p19VariationDb: -3 },
      levers: {
        placement: {
          lever: 'placement',
          evaluated: true,
          changes: [{ subId: 'sub-1', distanceMm: 200 }],
          effect: { p20VariationDb: -12, p20Level: 2, p20DeltaDb: -3 },
        },
      },
      individualEffectsEvaluated: true,
    },
    currentDesignFingerprint: IDENTITY.designFingerprint,
    instances: INSTANCES,
  });
  const summary = buildAdiDesignerSummary({
    planView,
    presentation: { state: 'plan_available', statusLabel: 'Optimisation plan available', showApply: true },
    instances: INSTANCES,
    seatCount: 8,
    currentP20Level: 2,
    currentP20Deviation: -12,
    limitingFrequencyHz: 0,
  });
  assert.equal(rowFor(summary, 'Placement').status, ADI_ROW_STATUS.RECOMMENDED, 'the recommendation is stated');
  assert.equal(rowFor(summary, 'Delay').status, ADI_ROW_STATUS.TESTED, 'a tested family without a lever row is still stated');
  assert.ok(
    !summary.rows.some((row) => /not tested|not evaluated|not available/i
      .test(`${row.status} ${row.outcome || ''}`)),
    'no forbidden copy after a winning run',
  );
});

test('the summary ledger and Engineer details read the same evidence', () => {
  assert.match(SUMMARY_MODULE, /families: planView\?\.run\?\.families/,
    'the ledger reads the saved run evidence');
  assert.match(SUMMARY_MODULE, /absorptionLeverRows\(planView\)/,
    'the absorption checks read the plan levers, or the family ledger when there are none');
  assert.match(EVIDENCE_BLOCK, /evidence\.families/,
    'Engineer details renders the same families');
  assert.match(EVIDENCE_BLOCK, /resolveLeverVerdict/,
    'both surfaces classify the outcome through the same verdict authority');
});

// ── The frequency guard ──────────────────────────────────────────────────────

test('a zero, missing or invalid frequency is never printed as "0 Hz"', () => {
  assert.equal(MIN_VALID_FREQUENCY_HZ, 1);
  assert.equal(frequencyText(0), null, '0 Hz is not a frequency');
  assert.equal(frequencyText(null), null);
  assert.equal(frequencyText(undefined), null);
  assert.equal(frequencyText(""), null);
  assert.equal(frequencyText(-20), null);
  assert.equal(validFrequencyHz(0), null);
  assert.equal(frequencyText(69), '69 Hz', 'a real frequency is stated');

  const summary = summaryFor(terminalPlanView(), { limitingFrequencyHz: 0 });
  assert.ok(summary.absorption, 'the variation is still reported');
  assert.equal(summary.absorption.frequencyHz, null, 'no frequency is invented');
  assert.equal(summary.absorption.frequencyText, null);
  assert.equal(summary.absorption.reason, ABSORPTION_NO_FREQUENCY_REASON);
  assert.doesNotMatch(`${summary.absorption.reason} ${summary.absorption.headline}`, /0 Hz/);
  assert.doesNotMatch(allRowText(summary), /0 Hz/, 'no row states 0 Hz');
});

test('absorption names the frequency only when it is a real frequency', () => {
  const advice = resolveAbsorptionAdvice({
    p20Level: 1,
    leverRows: [{ lever: 'placement', evaluated: true }],
    limitingFrequencyHz: 69,
  });
  assert.equal(advice.frequencyHz, 69);
  assert.match(advice.reason, /Persistent modal issue around 69 Hz/);

  const zero = resolveAbsorptionAdvice({
    p20Level: 1,
    leverRows: [{ lever: 'placement', evaluated: true }],
    limitingFrequencyHz: 0,
  });
  assert.equal(zero.frequencyHz, null);
  assert.equal(zero.reason, ABSORPTION_NO_FREQUENCY_REASON);
  assert.doesNotMatch(zero.reason, /0 Hz/);
  assert.equal(zero.status, ABSORPTION_STATUS.CONSIDER, 'still advice, without a frequency');
});

test('a seat frequency of zero is not evidence of a shared frequency', () => {
  const advice = resolveAbsorptionAdvice({
    p20Level: 1,
    seats: [
      { seatId: 's1', p20WorstFrequencyHz: 0 },
      { seatId: 's2', p20WorstFrequencyHz: 0 },
    ],
    leverRows: [{ lever: 'placement', evaluated: true }],
    limitingFrequencyHz: null,
  });
  assert.equal(advice.frequencyHz, null);
  assert.equal(advice.affectedSeatCount, 0, 'a zero frequency is not a shared frequency');
  assert.equal(advice.status, ABSORPTION_STATUS.CONSIDER);
});

test('absorption advice still requires poor P20', () => {
  const summary = summaryFor(terminalPlanView(), {
    currentP20Level: 2,
    currentP20Deviation: -12,
  });
  assert.equal(summary.absorption, null, 'L2-or-better attracts no absorption advice');
  assert.equal(summary.rows.length, 8, 'only the practical families are listed');
});