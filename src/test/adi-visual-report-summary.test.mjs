// adi-visual-report-summary.test.mjs
// ----------------------------------
// The Visual Report's ADI Design Summary presents the selected design:
//
//   Primary limitation · Current result · Worst affected ·
//   Design interpretation · Next step
//
// plus one optimiser status line when an evaluated optimiser result exists.
//
// It must NOT read like a design failure note. These tests pin the product
// rules: no un-applied design advice, no speculative P20 claim, no re-designed
// system, the honest RP22 result preserved, and Bass Optimiser named as the
// only action path.

import { test, expect } from 'vitest';
import fs from 'node:fs';
import {
  ADI_VISUAL_NEXT_STEP,
  ADI_VISUAL_OPTIMISER_APPLIED,
  ADI_VISUAL_OPTIMISER_AVAILABLE,
  ADI_VISUAL_OPTIMISER_NO_IMPROVEMENT,
  buildAdiVisualReportSummary,
  resolveOptimiserStatusLine,
} from '../components/adi/designGuidance/adiVisualReportCopy.js';
import { ADI_FACTOR_KIND } from '../components/adi/designGuidance/adiLimitingFactorRules.js';
import {
  OPTIMISER_LEVER_STATE,
  OPTIMISER_RECORD_KIND,
  OPTIMISER_TERMINAL_OUTCOME,
} from '../components/room/bass/optimiserPlan/optimiserPlanConstants.js';

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const COPY = read('src/components/adi/designGuidance/adiVisualReportCopy.js');
const SUMMARY_BLOCK = read('src/components/report/client/ClientAdiVisualSummary.jsx');
const VISUAL_PAGE = read('src/components/report/client/ClientAdiDesignSummary.jsx');
const REPORT_PAGE = read('src/pages/RP22ClientReport.jsx');
const LONG_BLOCK = read('src/components/adi/designGuidance/AdiDesignGuidanceBlock.jsx');
const TECHNICAL = read('src/components/report/technical/TechnicalAdiAssessment.jsx');

/** The canonical guidance output shape, as the engine produces it. */
const guidance = (overrides = {}) => ({
  available: true,
  kind: ADI_FACTOR_KIND.BASS_CONSISTENCY,
  parameterKey: 'p20',
  parameterNumber: 20,
  area: 'P20 Bass consistency',
  level: 'L1',
  severity: 'MEDIUM',
  headline: 'Seat-to-seat bass consistency',
  evidenceLines: [
    'P20 L1 — worst-seat deviation ±1.2 dB across 8 seats',
    'Next lowest result: P19 Bass response (L2)',
  ],
  rankedResults: [],
  incomplete: false,
  missingParameters: [],
  // The full engineering guidance the Visual Report must NOT print.
  whatIsWrong: 'Seat-to-seat bass consistency is the limiting factor of this design.',
  whyItIsHappening: 'A single subwoofer can only be correctly aligned to one listening position.',
  changeFirst: 'Move the seating first — pull row 2 forward, then re-place the subwoofers.',
  expectedImprovement: 'Expect the worst-seat deviation to fall into the L2 window, moving P20 toward L2 or better.',
  remainingLimitation: 'Any seat within about 0.6 m of a boundary keeps some error.',
  lowerValueChanges: 'Changing the loudspeakers or re-aiming the bed channels does not address P20.',
  ...overrides,
});

const summaryText = (summary) => Object.values(summary).filter((v) => typeof v === 'string').join(' \n ');

/* ── Shape and length ─────────────────────────────────────────────────── */

test('the Visual Report summary is four statements and a next step', () => {
  const summary = buildAdiVisualReportSummary({ guidance: guidance() });

  expect(summary.heading).toBe('ADI Design Summary');
  expect(Object.keys(summary)).toEqual([
    'heading',
    'primaryLimitation',
    'currentResult',
    'worstAffected',
    'interpretation',
    'nextStep',
    'optimiserStatus',
  ]);
  expect(summary.optimiserStatus).toBeNull();
  // Shorter than the engineering guidance it replaces, not a re-flow of it.
  expect(summaryText(summary).length).toBeLessThan(700);
});

test('the honest limitation and the measured result are preserved', () => {
  const summary = buildAdiVisualReportSummary({ guidance: guidance() });

  expect(summary.primaryLimitation).toBe('Seat-to-seat bass consistency');
  expect(summary.currentResult).toBe('P20: L1');
  expect(summary.worstAffected).toBe('worst-seat deviation ±1.2 dB across 8 seats');
});

test('an ungraded parameter states that rather than inventing a level', () => {
  const summary = buildAdiVisualReportSummary({
    guidance: guidance({ level: null, evidenceLines: [] }),
  });
  expect(summary.currentResult).toBe('P20: not calculated');
  expect(summary.worstAffected).toBeNull();
});

test('no guidance means no block', () => {
  expect(buildAdiVisualReportSummary({ guidance: null })).toBeNull();
  expect(buildAdiVisualReportSummary({ guidance: { available: false } })).toBeNull();
});

/* ── Product rules: no advice, no speculation ─────────────────────────── */

test('the engineering guidance is never printed', () => {
  const summary = buildAdiVisualReportSummary({ guidance: guidance() });
  const text = summaryText(summary);

  expect(text).not.toContain(guidance().changeFirst);
  expect(text).not.toContain(guidance().expectedImprovement);
  expect(text).not.toContain(guidance().whyItIsHappening);
  expect(text).not.toContain(guidance().lowerValueChanges);
  expect(text).not.toContain(guidance().remainingLimitation);
  expect(text).not.toContain(guidance().whatIsWrong);
});

test('no un-applied design change is presented as an action', () => {
  const text = summaryText(buildAdiVisualReportSummary({ guidance: guidance() }));

  [
    /re-place/i,
    /re-place the existing subwoofer/i,
    /move the seating/i,
    /pull .*row/i,
    /add a second subwoofer/i,
    /opposing (wall )?mid-points/i,
    /side-wall midpoint/i,
    /add the missing speaker/i,
    /change the seating distance/i,
    /step up the range/i,
  ].forEach((pattern) => expect(text).not.toMatch(pattern));
});

test('no speculative improvement claim, and no projected level', () => {
  const text = summaryText(buildAdiVisualReportSummary({ guidance: guidance() }));

  expect(text).not.toMatch(/expect/i);
  expect(text).not.toMatch(/\bL2\b/);
  expect(text).not.toMatch(/toward L\d/);
  expect(text).not.toMatch(/will reach/i);
  expect(text).not.toMatch(/should recover/i);
  expect(text).not.toMatch(/performance levels lost/i);
});

test('the module can only name Bass Optimiser as the action path', () => {
  const text = summaryText(buildAdiVisualReportSummary({ guidance: guidance() }));
  expect(text).toContain('Bass Optimiser');
  expect(COPY).not.toMatch(/GUIDANCE_LABELS|changeFirst|expectedImprovement|lowerValueChanges/);
  expect(COPY).toMatch(/export const ADI_VISUAL_NEXT_STEP/);
});

test('the interpretation names the cause without instructing a change', () => {
  const consistency = buildAdiVisualReportSummary({ guidance: guidance() });
  expect(consistency.interpretation).toMatch(/room-and-seat interaction/);
  expect(consistency.nextStep).toBe(ADI_VISUAL_NEXT_STEP);

  const collapse = buildAdiVisualReportSummary({
    guidance: guidance({ kind: ADI_FACTOR_KIND.ROW_COLLAPSE, parameterNumber: 5, key: 'p5' }),
  });
  expect(collapse.interpretation).toMatch(/seating and geometry interaction/);

  const balanced = buildAdiVisualReportSummary({ guidance: guidance({ kind: ADI_FACTOR_KIND.BALANCED }) });
  expect(balanced.interpretation).toMatch(/No single result is holding the design back/);

  const incomplete = buildAdiVisualReportSummary({ guidance: guidance({ kind: ADI_FACTOR_KIND.INCOMPLETE }) });
  expect(incomplete.interpretation).toMatch(/holds its conclusion/);
});

/* ── Optimiser status ─────────────────────────────────────────────────── */

test('no optimiser record means no optimiser claim', () => {
  expect(resolveOptimiserStatusLine(null)).toBeNull();
  expect(resolveOptimiserStatusLine({})).toBeNull();
  expect(
    buildAdiVisualReportSummary({ guidance: guidance(), optimiserRecord: null }).optimiserStatus,
  ).toBeNull();
});

test('an applied optimiser result is stated as applied', () => {
  const record = {
    recordKind: OPTIMISER_RECORD_KIND.PLAN,
    applied: { placement: OPTIMISER_LEVER_STATE.APPLIED },
  };
  expect(resolveOptimiserStatusLine(record)).toBe(ADI_VISUAL_OPTIMISER_APPLIED);
  expect(ADI_VISUAL_OPTIMISER_APPLIED).toMatch(/applied to this design/);
});

test('a confirmed but unapplied recommendation is offered, never asserted', () => {
  const record = {
    recordKind: OPTIMISER_RECORD_KIND.PLAN,
    applied: { placement: OPTIMISER_LEVER_STATE.NOT_APPLIED },
  };
  expect(resolveOptimiserStatusLine(record)).toBe(ADI_VISUAL_OPTIMISER_AVAILABLE);
  expect(ADI_VISUAL_OPTIMISER_AVAILABLE).toMatch(/Bass Optimiser panel/);
});

test('a run that found nothing worth applying says exactly that', () => {
  const record = {
    recordKind: OPTIMISER_RECORD_KIND.RUN_EVIDENCE,
    terminalOutcome: OPTIMISER_TERMINAL_OUTCOME.NO_USEFUL_IMPROVEMENT,
  };
  expect(resolveOptimiserStatusLine(record)).toBe(ADI_VISUAL_OPTIMISER_NO_IMPROVEMENT);
  expect(ADI_VISUAL_OPTIMISER_NO_IMPROVEMENT)
    .toBe('Bass Optimiser did not confirm a practical change worth applying. Low-frequency treatment or seating/subwoofer layout changes may be considered during detailed design.');
});

test('a failed or incomplete run makes no claim about the design', () => {
  expect(resolveOptimiserStatusLine({
    recordKind: OPTIMISER_RECORD_KIND.RUN_EVIDENCE,
    terminalOutcome: OPTIMISER_TERMINAL_OUTCOME.FAILED,
  })).toBeNull();
  expect(resolveOptimiserStatusLine({
    recordKind: OPTIMISER_RECORD_KIND.RUN_EVIDENCE,
    terminalOutcome: OPTIMISER_TERMINAL_OUTCOME.EVALUATION_INCOMPLETE,
  })).toBeNull();
});

/* ── Wiring: only the Visual Report changed ───────────────────────────── */

test('the Visual Report renders the short summary instead of the guidance block', () => {
  expect(VISUAL_PAGE).toMatch(/import ClientAdiVisualSummary from "\.\/ClientAdiVisualSummary"/);
  expect(VISUAL_PAGE).toMatch(/<ClientAdiVisualSummary/);
  expect(VISUAL_PAGE).not.toMatch(/AdiDesignGuidanceBlock/);
  expect(VISUAL_PAGE).not.toMatch(/Examples, powered by/);
});

test('the summary block is presentation only and reads the optimiser record', () => {
  expect(SUMMARY_BLOCK).toMatch(/buildAdiVisualReportSummary/);
  expect(SUMMARY_BLOCK).toMatch(/useOptimiserPlanAuthority\(projectId, versionId\)/);
  // No guidance field is printed by the block itself.
  expect(SUMMARY_BLOCK).not.toMatch(/changeFirst|expectedImprovement|lowerValueChanges/);
  expect(SUMMARY_BLOCK).toMatch(/Primary limitation/);
  expect(SUMMARY_BLOCK).toMatch(/Current result/);
  expect(SUMMARY_BLOCK).toMatch(/Design interpretation/);
  expect(SUMMARY_BLOCK).toMatch(/Next step/);
});

test('the report page hands the block the version it belongs to', () => {
  expect(REPORT_PAGE).toMatch(/projectId=\{projectId\}/);
  expect(REPORT_PAGE).toMatch(/versionId=\{authority\.versionId \|\| null\}/);
});

test('the Technical Report and design workflow keep the full guidance block', () => {
  expect(TECHNICAL).toMatch(/AdiDesignGuidanceBlock/);
  expect(LONG_BLOCK).toMatch(/Best first change/);
  expect(LONG_BLOCK).toMatch(/Expected improvement/);
});