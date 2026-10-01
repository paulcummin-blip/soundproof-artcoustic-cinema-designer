// adi-visual-report-summary.test.mjs
// ----------------------------------
// The Visual Report presents a COMPLETED design. Its ADI Design Summary is
// therefore strength-led:
//
//   Intro (ADI has reviewed the completed design) · strength sentences ·
//   one Bass Optimiser review line when a result exists · closing pointer to
//   the Technical Report.
//
// Short rule: the Visual Report sells the completed design, the Technical
// Report explains the engineering, Bass Optimiser improves the design.
//
// These tests pin the product rules: no limiting factor, no parameter code or
// level, no worst-affected seat, no "next step", no un-applied design advice,
// no speculative improvement claim — and the engineering guidance block still
// in place everywhere it belongs.

import { test, expect } from 'vitest';
import fs from 'node:fs';
import {
  ADI_VISUAL_INTRO,
  ADI_VISUAL_CLOSING,
  ADI_VISUAL_NO_STRENGTHS_FALLBACK,
  ADI_VISUAL_OPTIMISER_REVIEWED,
  ADI_VISUAL_STRENGTH_SENTENCES,
  ADI_VISUAL_PARAGRAPH_LIMIT,
  buildStrengthSentences,
  buildAdiVisualReportSummary,
  resolveOptimiserStatusLine,
} from '../components/adi/designGuidance/adiVisualReportCopy.js';
import { selectClientAdiStrengths } from '../components/report/client/selectClientAdiStrengths.js';
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

/** The published engineering summary shape the strengths selector reads. */
const engineeringSummary = ({ room = {}, seat = {} } = {}) => ({
  roomResultsByParameter: Object.fromEntries(
    Object.entries(room).map(([number, level]) => [Number(number), { level }]),
  ),
  project: {
    reportCounts: {
      seatResultsByParameter: Object.fromEntries(
        Object.entries(seat).map(([key, level]) => [key, [{ level }]]),
      ),
    },
  },
});

const summaryText = (summary) =>
  Object.values(summary).flat().filter((value) => typeof value === 'string').join(' \n ');

const strengthsFor = (fixture) =>
  selectClientAdiStrengths(engineeringSummary(fixture), { limit: 6 });

/* ── Shape ────────────────────────────────────────────────────────────── */

test('the Visual Report summary is an ADI review of the completed design', () => {
  const summary = buildAdiVisualReportSummary({ strengths: strengthsFor({ room: { 14: 'L4' } }) });

  expect(summary.heading).toBe('ADI Design Summary');
  expect(Object.keys(summary)).toEqual([
    'heading',
    'intro',
    'body',
    'optimiserStatus',
    'closing',
  ]);
  expect(summary.intro).toBe(ADI_VISUAL_INTRO);
  expect(summary.intro).toMatch(/has reviewed the completed cinema design/);
  expect(summary.intro).toMatch(/strongest engineering qualities/);
  expect(summary.closing).toBe(ADI_VISUAL_CLOSING);
  expect(summary.closing).toMatch(/present[^.]*as assessed/i);
  expect(summary.closing).toMatch(/Technical Report/);
  expect(summary.optimiserStatus).toBeNull();
  // Short: a summary of the design, not a re-flow of the engineering guidance.
  expect(summaryText(summary).length).toBeLessThan(700);
});

test('no limitations report shape survives on the Visual Report', () => {
  const summary = buildAdiVisualReportSummary({ strengths: strengthsFor({ room: { 14: 'L4' } }) });

  expect(summary.primaryLimitation).toBeUndefined();
  expect(summary.currentResult).toBeUndefined();
  expect(summary.worstAffected).toBeUndefined();
  expect(summary.interpretation).toBeUndefined();
  expect(summary.nextStep).toBeUndefined();
});

/* ── Strength-led vocabulary ───────────────────────────────────────────── */

test('the summary never leads with a limitation, a level or a next step', () => {
  const text = summaryText(buildAdiVisualReportSummary({
    strengths: strengthsFor({
      room: { 14: 'L4', 18: 'L3' },
      seat: { p4: 'L3', p20: 'L1', p19: 'L2' },
    }),
  }));

  [
    'Primary limitation',
    'Primary limitation:',
    'Worst affected',
    'Next step',
    'Use Bass Optimiser',
    'in the design workflow',
    'before finalising',
    'before finalizing',
    'could be improved',
    'limitation',
  ].forEach((phrase) => expect(text).not.toContain(phrase));

  // No parameter code, no performance level, no worst-case language.
  expect(text).not.toMatch(/\bP\d{1,2}\b/);
  expect(text).not.toMatch(/\bL[1-4]\b/);
  expect(text).not.toMatch(/worst/i);
  expect(text).not.toMatch(/fail/i);
});

test('only genuinely strong parameters are described', () => {
  // P20 L1 (the reported weak result) and P19 L2 are NOT strengths.
  const strengths = strengthsFor({
    room: { 14: 'L4', 12: 'L3' },
    seat: { p4: 'L3', p20: 'L1', p19: 'L2' },
  });
  const summary = buildAdiVisualReportSummary({ strengths });
  const text = summaryText(summary);

  expect(text).toContain('strong low-frequency output capability');
  expect(text).toContain('screen wall speakers are closely matched');

  // Nothing about the weaker results — not even in softened language.
  expect(text).not.toContain(ADI_VISUAL_STRENGTH_SENTENCES[20]);
  expect(text).not.toContain(ADI_VISUAL_STRENGTH_SENTENCES[19]);
  expect(text).not.toMatch(/consistency/i);
  expect(text).not.toMatch(/varies|variance|deviation/i);
});

test('the strongest qualities lead, and the paragraph stays short', () => {
  const strengths = [
    { number: 14 },
    { number: 4 },
    { number: 18 },
    { number: 6 },
  ];
  const summary = buildAdiVisualReportSummary({ strengths });

  expect(summary.body).toHaveLength(ADI_VISUAL_PARAGRAPH_LIMIT);
  expect(summary.body[0]).toBe(ADI_VISUAL_STRENGTH_SENTENCES[14]);
  expect(summary.body[1]).toBe(ADI_VISUAL_STRENGTH_SENTENCES[4]);
  expect(buildStrengthSentences(strengths, 1)).toEqual([ADI_VISUAL_STRENGTH_SENTENCES[14]]);
  expect(buildStrengthSentences(null)).toEqual([]);
});

test('a design with no strength-band result still reads as assessed, not as failing', () => {
  const strengths = strengthsFor({ seat: { p20: 'L1', p19: 'L1', p6: 'L1' } });
  expect(strengths).toEqual([]);

  const summary = buildAdiVisualReportSummary({ strengths });
  expect(summary.body).toEqual([ADI_VISUAL_NO_STRENGTHS_FALLBACK]);

  const text = summaryText(summary);
  expect(text).not.toMatch(/limitation|weaker|weak|fail|improv|optimis/i);
  expect(text).toMatch(/assessed in full/);
  expect(text).toMatch(/reported on the following pages/);
});

test('no strengths supplied at all means no block', () => {
  // A caller with no strengths to offer gets no block at all.
  expect(buildAdiVisualReportSummary({ strengths: null })).toBeNull();
  // No strengths selected is a real answer: the design is assessed, just not
  // graded strong on any published parameter.
  expect(buildAdiVisualReportSummary({}).body).toEqual([ADI_VISUAL_NO_STRENGTHS_FALLBACK]);
  expect(buildAdiVisualReportSummary({ strengths: [] }).body).toEqual([ADI_VISUAL_NO_STRENGTHS_FALLBACK]);
});

/* ── Bass Optimiser line ──────────────────────────────────────────────── */

test('no optimiser record means no optimiser claim', () => {
  expect(resolveOptimiserStatusLine(null)).toBeNull();
  expect(resolveOptimiserStatusLine({})).toBeNull();
  expect(buildAdiVisualReportSummary({ strengths: [] }).optimiserStatus).toBeNull();
});

test('a completed optimiser review is stated as a review, never as pending work', () => {
  const applied = {
    recordKind: OPTIMISER_RECORD_KIND.PLAN,
    applied: { placement: OPTIMISER_LEVER_STATE.APPLIED },
  };
  const plan = {
    recordKind: OPTIMISER_RECORD_KIND.PLAN,
    applied: { placement: OPTIMISER_LEVER_STATE.NOT_APPLIED },
  };
  const nothingToApply = {
    recordKind: OPTIMISER_RECORD_KIND.RUN_EVIDENCE,
    terminalOutcome: OPTIMISER_TERMINAL_OUTCOME.NO_USEFUL_IMPROVEMENT,
  };

  expect(resolveOptimiserStatusLine(applied)).toBe(ADI_VISUAL_OPTIMISER_REVIEWED);
  expect(resolveOptimiserStatusLine(plan)).toBe(ADI_VISUAL_OPTIMISER_REVIEWED);
  expect(resolveOptimiserStatusLine(nothingToApply)).toBe(ADI_VISUAL_OPTIMISER_REVIEWED);
  expect(ADI_VISUAL_OPTIMISER_REVIEWED)
    .toBe('Bass Optimiser has reviewed the subwoofer layout as part of the design process.');
  expect(ADI_VISUAL_OPTIMISER_REVIEWED).not.toMatch(/worth applying|panel|may be considered/i);
});

test('a failed or incomplete run tells the client nothing', () => {
  expect(resolveOptimiserStatusLine({
    recordKind: OPTIMISER_RECORD_KIND.RUN_EVIDENCE,
    terminalOutcome: OPTIMISER_TERMINAL_OUTCOME.FAILED,
  })).toBeNull();
  expect(resolveOptimiserStatusLine({
    recordKind: OPTIMISER_RECORD_KIND.RUN_EVIDENCE,
    terminalOutcome: OPTIMISER_TERMINAL_OUTCOME.EVALUATION_INCOMPLETE,
  })).toBeNull();
});

/* ── The copy module carries no design action ─────────────────────────── */

test('the module can no longer name a next step or offer design advice', () => {
  expect(COPY).toMatch(/ADI_VISUAL_OPTIMISER_REVIEWED/);
  expect(COPY).not.toMatch(/ADI_VISUAL_NEXT_STEP/);
  expect(COPY).not.toMatch(/before finalising/);
  expect(COPY).not.toMatch(/worth applying/);
  expect(COPY).not.toMatch(/may be considered/);
  expect(COPY).not.toMatch(/GUIDANCE_LABELS|changeFirst|expectedImprovement|lowerValueChanges|remainingLimitation/);
  expect(COPY).not.toMatch(/re-place|move the seating/i);
  expect(COPY).not.toMatch(/buildAdiDesignGuidance/);
});

/* ── Wiring: only the Visual Report changed ───────────────────────────── */

test('the Visual Report renders the strength-led summary, not the guidance block', () => {
  expect(VISUAL_PAGE).toMatch(/import ClientAdiVisualSummary from "\.\/ClientAdiVisualSummary"/);
  expect(VISUAL_PAGE).toMatch(/<ClientAdiVisualSummary/);
  expect(VISUAL_PAGE).not.toMatch(/AdiDesignGuidanceBlock/);
  expect(VISUAL_PAGE).toMatch(/Where this design is strong/);
});

test('the summary block is presentation only: published strengths, no guidance maths', () => {
  expect(SUMMARY_BLOCK).toMatch(/buildAdiVisualReportSummary/);
  expect(SUMMARY_BLOCK).toMatch(/selectClientAdiStrengths/);
  expect(SUMMARY_BLOCK).toMatch(/useOptimiserPlanAuthority\(projectId, versionId\)/);
  expect(SUMMARY_BLOCK).not.toMatch(/buildAdiDesignGuidance/);
  expect(SUMMARY_BLOCK).not.toMatch(/Primary limitation|Worst affected|Next step|primaryLimitation/);
  expect(SUMMARY_BLOCK).not.toMatch(/changeFirst|expectedImprovement|lowerValueChanges/);
});

test('the report page still hands the block the version it belongs to', () => {
  expect(REPORT_PAGE).toMatch(/projectId=\{projectId\}/);
  expect(REPORT_PAGE).toMatch(/versionId=\{authority\.versionId \|\| null\}/);
  expect(REPORT_PAGE).toMatch(/engineeringSummary=\{engineeringSummary\}/);
});

test('the Technical Report and design workflow keep the full guidance block', () => {
  expect(TECHNICAL).toMatch(/AdiDesignGuidanceBlock/);
  expect(LONG_BLOCK).toMatch(/Best first change/);
  expect(LONG_BLOCK).toMatch(/Expected improvement/);
  expect(LONG_BLOCK).toMatch(/What remains limited/);
});