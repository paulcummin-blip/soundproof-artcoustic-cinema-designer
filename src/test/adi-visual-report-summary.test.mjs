// adi-visual-report-summary.test.mjs
// ----------------------------------
// The Visual Report presents a COMPLETED design and answers one question:
//
//   "This is a strong design for this room because…"
//
//   Lead (the framing line) · body (how the layout suits the room and its
//   seating, then the design's genuine strengths, then the balance statement) ·
//   one Bass Optimiser review line when a result exists · closing pointer to
//   the Technical Report.
//
// Short rule: the Visual Report says WHY this design works, the Technical
// Report says HOW the engineering measures, Bass Optimiser says how to improve
// it.
//
// These tests pin the product rules: no limiting factor, no parameter code or
// level, no worst-affected seat, no "next step", no speculative change, no
// improvement promise — and the engineering guidance block still in place
// everywhere it belongs.

import { test, expect } from 'vitest';
import fs from 'node:fs';
import {
  ADI_VISUAL_LEAD,
  ADI_VISUAL_BALANCE,
  ADI_VISUAL_CLOSING,
  ADI_VISUAL_NO_STRENGTHS_FALLBACK,
  ADI_VISUAL_OPTIMISER_REVIEWED,
  ADI_VISUAL_STRENGTH_SENTENCES,
  ADI_VISUAL_PARAGRAPH_LIMIT,
  buildRoomSentence,
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

/** The published room context the report page hands the block. */
const CONTEXT = {
  roomDims: { widthM: 4.5, lengthM: 6, heightM: 2.4 },
  seatCount: 8,
};

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

const build = (fixture, options = {}) =>
  buildAdiVisualReportSummary({
    strengths: strengthsFor(fixture),
    context: CONTEXT,
    ...options,
  });

/* ── Shape ────────────────────────────────────────────────────────────── */

test('the Visual Report summary answers why this is a strong design for this room', () => {
  const summary = build({ room: { 14: 'L4' } });

  expect(summary.heading).toBe('ADI Design Summary');
  expect(Object.keys(summary)).toEqual([
    'heading',
    'lead',
    'body',
    'optimiserStatus',
    'closing',
  ]);
  expect(summary.lead).toBe(ADI_VISUAL_LEAD);
  expect(summary.lead).toBe('This is a strong design for this room because:');
  expect(summary.optimiserStatus).toBeNull();
  expect(summary.closing).toBe(ADI_VISUAL_CLOSING);
  expect(summary.closing).toMatch(/Technical Report/);
  // A summary of the design, not a re-flow of the engineering guidance.
  expect(summaryText(summary).length).toBeLessThan(900);
});

test('no limitations report shape survives on the Visual Report', () => {
  const summary = build({ room: { 14: 'L4' } });

  expect(summary.primaryLimitation).toBeUndefined();
  expect(summary.currentResult).toBeUndefined();
  expect(summary.worstAffected).toBeUndefined();
  expect(summary.interpretation).toBeUndefined();
  expect(summary.nextStep).toBeUndefined();
});

/* ── Project-specific framing ─────────────────────────────────────────── */

test('the layout sentence uses the published room and seating, never invented numbers', () => {
  expect(buildRoomSentence(CONTEXT))
    .toContain('4.5 m × 6.0 m × 2.4 m');
  expect(buildRoomSentence(CONTEXT)).toContain('8 seating positions');
  expect(buildRoomSentence(CONTEXT)).toMatch(/rather than fighting them/);

  // Unknown geometry loses the dimension clause rather than guessing.
  expect(buildRoomSentence({ seatCount: 8 })).not.toMatch(/\dm/);
  expect(buildRoomSentence({ seatCount: 8 })).toContain('8 seating positions');
  expect(buildRoomSentence({})).toContain('the space available');

  // A single seat reads correctly.
  expect(buildRoomSentence({ seatCount: 1 })).toContain('1 seating position it has to serve');
  expect(buildRoomSentence({ seatCount: 1 })).not.toMatch(/positions/);
});

test('the body opens with the room and closes with the balance statement', () => {
  const summary = build({ room: { 14: 'L4' } });

  expect(summary.body[0]).toContain('4.5 m × 6.0 m × 2.4 m');
  expect(summary.body[summary.body.length - 1]).toBe(ADI_VISUAL_BALANCE);
  expect(ADI_VISUAL_BALANCE).toMatch(/architectural constraints/);
  expect(ADI_VISUAL_BALANCE).toMatch(/practical to install and credible to calibrate/);
});

test('only genuinely strong parameters are described', () => {
  // P20 L1 (the reported weak result) and P19 L2 are NOT strengths.
  const summary = build({
    room: { 14: 'L4', 12: 'L3' },
    seat: { p4: 'L3', p20: 'L1', p19: 'L2' },
  });
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
  const strengths = [{ number: 14 }, { number: 4 }, { number: 18 }, { number: 6 }];
  const summary = buildAdiVisualReportSummary({ strengths, context: CONTEXT });

  expect(summary.body).toHaveLength(ADI_VISUAL_PARAGRAPH_LIMIT + 2); // room + 3 strengths + balance
  expect(summary.body[1]).toBe(ADI_VISUAL_STRENGTH_SENTENCES[14]);
  expect(summary.body[2]).toBe(ADI_VISUAL_STRENGTH_SENTENCES[4]);
  expect(buildStrengthSentences(strengths, 1)).toEqual([ADI_VISUAL_STRENGTH_SENTENCES[14]]);
  expect(buildStrengthSentences(null)).toEqual([]);
});

test('a design with no strength-band result still reads as assessed, not as failing', () => {
  const strengths = strengthsFor({ seat: { p20: 'L1', p19: 'L1', p6: 'L1' } });
  expect(strengths).toEqual([]);

  const summary = buildAdiVisualReportSummary({ strengths, context: CONTEXT });
  expect(summary.body).toContain(ADI_VISUAL_NO_STRENGTHS_FALLBACK);

  const text = summaryText(summary);
  expect(text).not.toMatch(/limitation|weaker|weak result|fail|improv|optimis/i);
  expect(text).toMatch(/assessed in full/);
  expect(text).toMatch(/reported on the following pages/);
});

test('no strengths supplied at all means no block', () => {
  expect(buildAdiVisualReportSummary({ strengths: null })).toBeNull();
  expect(buildAdiVisualReportSummary({}).body).toContain(ADI_VISUAL_NO_STRENGTHS_FALLBACK);
});

/* ── Strength-led vocabulary ───────────────────────────────────────────── */

test('the summary never leads with a limitation, a level or a next step', () => {
  const text = summaryText(build({
    room: { 14: 'L4', 18: 'L3' },
    seat: { p4: 'L3', p20: 'L1', p19: 'L2' },
  }));

  [
    'Primary limitation',
    'Worst affected',
    'Next step',
    'Use Bass Optimiser',
    'in the design workflow',
    'before finalising',
    'before finalizing',
    'could be improved',
    'This could be improved',
    'Move the subs',
    'Move the seats',
    'Expected to reach',
    'limitation',
  ].forEach((phrase) => expect(text).not.toContain(phrase));

  // No parameter code, no performance level, no worst-case or prediction language.
  expect(text).not.toMatch(/\bP\d{1,2}\b/);
  expect(text).not.toMatch(/\bL[1-4]\b/);
  expect(text).not.toMatch(/worst/i);
  expect(text).not.toMatch(/fail/i);
  expect(text).not.toMatch(/expect/i);

  // Every strength sentence is itself free of parameter codes and levels.
  expect(Object.values(ADI_VISUAL_STRENGTH_SENTENCES).join(' ')).not.toMatch(/\bP\d{1,2}\b|\bL[1-4]\b/);
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
  expect(COPY).toMatch(/ADI_VISUAL_LEAD/);
  expect(COPY).toMatch(/ADI_VISUAL_OPTIMISER_REVIEWED/);
  expect(COPY).not.toMatch(/ADI_VISUAL_NEXT_STEP/);
  expect(COPY).not.toMatch(/before finalising/);
  expect(COPY).not.toMatch(/worth applying/);
  expect(COPY).not.toMatch(/may be considered/);
  expect(COPY).not.toMatch(/Expected to reach|Move the sub|Move the seat/);
  expect(COPY).not.toMatch(/GUIDANCE_LABELS|changeFirst|expectedImprovement|lowerValueChanges|remainingLimitation/);
  expect(COPY).not.toMatch(/buildAdiDesignGuidance/);
});

/* ── Wiring: only the Visual Report changed ───────────────────────────── */

test('the Visual Report renders the strength-led summary, not the guidance block', () => {
  expect(VISUAL_PAGE).toMatch(/import ClientAdiVisualSummary from "\.\/ClientAdiVisualSummary"/);
  expect(VISUAL_PAGE).toMatch(/<ClientAdiVisualSummary/);
  expect(VISUAL_PAGE).toMatch(/Why this design is strong for this room/);
  expect(VISUAL_PAGE).toMatch(/Where this design is strong/);
  expect(VISUAL_PAGE).toMatch(/seats=\{seats\}/);
  expect(VISUAL_PAGE).toMatch(/geometry=\{geometry\}/);
  expect(VISUAL_PAGE).toMatch(/system=\{system\}/);
  expect(VISUAL_PAGE).not.toMatch(/AdiDesignGuidanceBlock/);
});

test('the summary block is presentation only: published strengths and room, no guidance maths', () => {
  expect(SUMMARY_BLOCK).toMatch(/buildAdiVisualReportSummary/);
  expect(SUMMARY_BLOCK).toMatch(/selectClientAdiStrengths/);
  expect(SUMMARY_BLOCK).toMatch(/useOptimiserPlanAuthority\(projectId, versionId\)/);
  expect(SUMMARY_BLOCK).toMatch(/geometry\?\.roomDims/);
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