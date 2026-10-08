// p20-wording-guard.test.mjs
// ---------------------------------------------------------------------------
// P20 WORDING GUARD — the prohibited bass wording cannot reach a client.
//
// P20 states how far each seat's low-frequency response sits from the reference
// seating position. When that result is weak (Level 1) the design may not be
// described as consistent, uniform, even or controlled across the seats: the
// honest statement is that the bass level varies between seats.
//
// These tests change no calculation, no grading and no scoring. They assert the
// wording guards that already ship, and the phrase-level policy they refuse.
// The proposal evidence pack's own bass-wording authority is asserted in
// test/proposal-evidence-pack.test.mjs, alongside the pack it guards.
// ---------------------------------------------------------------------------
import { test, expect } from 'vitest';
import fs from 'node:fs';

import { buildAdiAssessment } from '../components/report/technical/adiAssessmentBuilder.js';
import {
  buildHighlightDisplayRows,
  comparisonClientMeaning,
} from '../components/proposal/keyPerformanceHighlightsAuthority.js';
import { selectClientBassPerformance } from '../components/report/client/selectClientBassPerformance.js';
import { resolveP20SeatDisplay } from '../components/room/bass/p20DisplayAuthority.js';

/** The prohibited P20 wording, as the wording policy lists it. */
const PROHIBITED = Object.freeze([
  ['consistent across all seats', /consistent\s+across\s+(?:all|every)\s+seats?/i],
  ['uniform', /\buniform\b/i],
  ['even across all seats', /\beven\s+across\s+(?:all|every)\s+seats?/i],
  ['controlled across the room', /controlled\s+(?:across|throughout)\s+the\s+room/i],
  ['controlled across the seating area', /controlled\s+(?:across|throughout)\s+the\s+seating\s+area/i],
  ['powerful and controlled across the seating area', /powerful\s+and\s+controlled\s+(?:across|throughout)/i],
  ['smooth across all seats', /smooth(?:ly)?\s+(?:across|throughout)\s+(?:all|every)\s+seats?/i],
  ['improved seat-to-seat consistency', /improved?\s+seat[- ]to[- ]seat\s+consisten\w*/i],
  ['more uniform bass response across all seating positions', /more\s+uniform\s+bass\s+response\s+across\s+all\s+seating\s+positions?/i],
]);

/** The prohibited labels a piece of shipped copy carries. */
function prohibitedIn(text) {
  const value = typeof text === 'string' ? text : JSON.stringify(text ?? null);
  if (!value) return [];
  return PROHIBITED.filter(([, pattern]) => pattern.test(value)).map(([label]) => label);
}

/** One P20 highlight row, as the proposal table receives it. */
function p20Row(gain, level) {
  return [{
    key: 'p20',
    area: 'Bass',
    parameter: 'P20 bass consistency',
    result: '±15.6 dB',
    level,
    what_the_room_gains: gain,
  }];
}

const WEAK_PHRASES = Object.freeze([
  'The bass stays consistent across all seats.',
  'The low-frequency response is uniform.',
  'The bass response is even across all seats.',
  'The bass is controlled across the room.',
  'The bass is controlled across the seating area.',
  'The bass is powerful and controlled across the seating area.',
  'Bass stays smooth across all seats.',
  'The design brings improved seat-to-seat consistency.',
  'The design gives a more uniform bass response across all seating positions.',
]);

test('no prohibited P20 phrase reaches a shipped line at Level 1', () => {
  for (const phrase of WEAK_PHRASES) {
    const [row] = buildHighlightDisplayRows(p20Row(phrase, 'L1'));
    expect(row, phrase).toBeTruthy();
    expect(prohibitedIn(row.gain), phrase).toEqual([]);
    // The strength-shaped sentence is replaced, never printed as it stands.
    expect(row.gain, phrase).not.toBe(phrase);
  }
});

test('a supported P20 result keeps its own consistent wording', () => {
  const [row] = buildHighlightDisplayRows(p20Row('Consistent bass from seat to seat.', 'L4'));
  expect(row.gain).toBe('Consistent bass from seat to seat.');
  expect(prohibitedIn(row.gain)).toEqual([]);
});

test('the shipped P20 and P19 client-facing lines carry no prohibited wording', () => {
  const lines = [
    comparisonClientMeaning({ key: 'p20', values: ['L1', 'L1'] }),
    comparisonClientMeaning({ key: 'p20', values: ['L3', 'L4'] }),
    comparisonClientMeaning({ key: 'p20', values: ['L4', 'L4'], identical: true }),
    comparisonClientMeaning({ key: 'p19', values: ['L1', 'L1'] }),
  ];
  for (const line of lines) {
    expect(typeof line, String(line)).toBe('string');
    expect(prohibitedIn(line), line).toEqual([]);
  }
  // P19 is RSP-scoped, so its honest line never claims evenness across the seats.
  expect(comparisonClientMeaning({ key: 'p19', values: ['L1', 'L1'] })).not.toMatch(/across the (main )?seats/i);
});

test('the ADI assessment describes a weak P20 without a consistency claim', () => {
  const weakP20 = {
    engineeringSummary: {
      primary: { categories: [] },
      secondary: { categories: [] },
      project: {
        rating: null,
        designPerformanceIndex: 62,
        reportCounts: { compromisedSeatCount: 0 },
        coverage: null,
      },
      parameterSummaries: { primary: { p19: { level: 'L3' }, p20: { level: 'L1' } } },
    },
  };
  let assessment;
  try {
    assessment = buildAdiAssessment(weakP20, { seats: [], geometry: {}, system: {} });
  } catch (error) {
    throw new Error(`buildAdiAssessment threw on a sparse authority: ${error.message}`);
  }
  expect(assessment).toBeTruthy();
  expect(prohibitedIn([
    ...assessment.highlights,
    ...assessment.improvements.map((item) => `${item.action} ${item.why} ${item.benefit}`),
    assessment.overallAssessment,
  ])).toEqual([]);
});

test('the shipped P20 wording surfaces carry no prohibited phrase', () => {
  const surfaces = [
    'src/components/proposal/keyPerformanceHighlightsAuthority.js',
    'src/components/proposal/proposalIntelligence/deriveProducts.js',
    'src/components/report/technical/adiAssessmentBuilder.js',
    'src/components/report/client/selectClientBassPerformance.js',
  ];
  for (const file of surfaces) {
    const source = fs.readFileSync(file, 'utf8');
    expect(prohibitedIn(source), file).toEqual([]);
  }
});

test('P20 is read only from the published per-seat rows, never from P14 or the subwoofer count', () => {
  const p14Only = {
    roomResultsByParameter: {
      14: { level: 'L3', value: 105, achievedCapabilityDb: 105, isAuthoritative: true },
      18: { level: 'L3', value: 30, designHz: 30, isAuthoritative: true },
    },
    parameterSummaries: { project: {} },
    project: { reportCounts: { seatResultsByParameter: {} } },
    // Four subwoofers and a published P14 result do not amount to a P20 result.
    subwooferInstances: [{}, {}, {}, {}],
  };
  const withoutP20 = selectClientBassPerformance(p14Only, []);
  expect(withoutP20).toBeTruthy();
  expect(withoutP20.p14.achievedLevel).toBe('L3');
  expect(withoutP20.p20).toBe(null);

  const withP20 = selectClientBassPerformance({
    roomResultsByParameter: {
      ...p14Only.roomResultsByParameter,
      // P19 is published as one result for the reference seating position. The
      // legacy per-seat P19 row below is deliberately never read.
      19: { level: 'L3', value: 4.2, isAuthoritative: true },
    },
    parameterSummaries: { project: { p20: { level: 'L1' } } },
    project: {
      reportCounts: {
        seatResultsByParameter: {
          p19: [{ seatId: 's1', level: 'L1', value: 15.6 }],
          p20: [
            { seatId: 's1', level: 'L1', value: 15.6, priority: 'primary' },
            { seatId: 's2', level: 'L2', value: 9.1, priority: 'secondary' },
          ],
        },
      },
    },
  }, []);
  expect(withP20.p20.achievedLevel).toBe('L1');
  expect(withP20.p20.perSeatResults).toHaveLength(2);
  // P19 stays RSP-only: the legacy per-seat P19 row is never read or presented.
  expect(withP20.p19.scope).toBe('rsp');
  expect(withP20.p19.achievedLevel).toBe('L3');
  expect(withP20.p19.perSeatResults).toBeUndefined();
});

test('the P20 result values and grades are unchanged', () => {
  const display = resolveP20SeatDisplay({ seatId: 's1', level: 'L1', variationDbRaw: 15.6 });
  expect(display.level).toBe('L1');
  // Display-only whole-dB design value; the exact deviation is kept alongside it.
  expect(display.displayVariationText).toBe('±15 dB');
  expect(display.exactVariationText).toBe('±15.6 dB');
});