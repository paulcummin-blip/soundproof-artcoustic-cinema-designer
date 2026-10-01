// p1-seat-map-result.test.mjs
// ---------------------------------------------------------------------------
// P1 (minimum distance between the listening area and the room walls) is
// assessed AT EVERY SEATING POSITION. The Visual Report page therefore keeps
// the boundary-zone drawing AND shows the assessed seat-based result.
//
//   TEST 1  The boundary-zone drawing is preserved and precedes the map
//   TEST 2  Seat results are laid out in the same shape as the seating plan
//   TEST 3  Each assessed seat keeps its published distance beneath its pill
//   TEST 4  The linear Seat 1 … Seat N table is gone
//   TEST 5  Front and rear rows are named and ordered front-to-back
//   TEST 6  A failure reads "Below L1" with the canonical FAIL colour
//   TEST 7  The seat map outranks the level legend, which stays as a footnote
//   TEST 8  The printed page (PDF) carries the drawing AND the seat map
//   TEST 9  No P1 calculation: published values pass through unchanged
//   TEST 10 No layout overflow: rows wrap inside the page column
// ---------------------------------------------------------------------------
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import ClientRecommendedSeatingPosition from '../components/report/client/ClientRecommendedSeatingPosition.jsx';
import P1SeatResultBlock from '../components/report/client/P1SeatResultBlock.jsx';
import ClientSeatResultRows from '../components/report/client/ClientSeatResultRows.jsx';
import {
  selectClientRecommendedSeatingPosition,
} from '../components/report/client/selectClientRecommendedSeatingPosition.js';
import { RP22_GRADE_TOKENS } from '../components/utils/rp22Colors.jsx';

// ── Published authority fixture ────────────────────────────────────────────
// Room 5.0 × 6.5 m. Front row (y = 3.6): the side walls bind, so the outer
// seats sit closest to a boundary and the inner pair furthest. Rear row
// (y = 4.8): the rear wall binds, so the outer seats are closest (and fail to
// reach L4) while the inner three hold L4.
//
// Every level and distance below is a PUBLISHED authority value. This suite
// asserts pass-through and layout — never physics, grading or measurement.
const ROOM = { widthM: 5.0, lengthM: 6.5, heightM: 2.6 };

const FRONT = [
  { seatId: 'f1', level: 'L4', value: 1.65, valueFormatted: '1.65 m' },
  { seatId: 'f2', level: 'L4', value: 2.30, valueFormatted: '2.30 m' },
  { seatId: 'f3', level: 'L4', value: 2.30, valueFormatted: '2.30 m' },
  { seatId: 'f4', level: 'L4', value: 1.65, valueFormatted: '1.65 m' },
];
const REAR = [
  { seatId: 'r1', level: 'L3', value: 1.70, valueFormatted: '1.70 m' },
  { seatId: 'r2', level: 'L4', value: 2.10, valueFormatted: '2.10 m' },
  { seatId: 'r3', level: 'L4', value: 2.50, valueFormatted: '2.50 m' },
  { seatId: 'r4', level: 'L4', value: 2.10, valueFormatted: '2.10 m' },
  { seatId: 'r5', level: 'L3', value: 1.70, valueFormatted: '1.70 m' },
];

const publishedRows = [...FRONT, ...REAR].map((row, i) => ({
  ...row,
  row: i < 4 ? 1 : 2,
  column: i + 1,
  priority: 'primary',
  isPrimary: i === 1,
  status: 'scored',
}));

const engineeringSummary = {
  project: { reportCounts: { seatResultsByParameter: { p1: publishedRows } } },
};

const seatingPositions = [
  { id: 'f1', x: 1.65, y: 3.6 }, { id: 'f2', x: 2.30, y: 3.6 },
  { id: 'f3', x: 2.70, y: 3.6 }, { id: 'f4', x: 3.35, y: 3.6 },
  { id: 'r1', x: 1.70, y: 4.8 }, { id: 'r2', x: 2.10, y: 4.8 },
  { id: 'r3', x: 2.50, y: 4.8 }, { id: 'r4', x: 2.90, y: 4.8 },
  { id: 'r5', x: 3.30, y: 4.8 },
];

const seatResults = selectClientRecommendedSeatingPosition({
  engineeringSummary,
  seatingPositions,
  rsp: { x: 2.50, y: 3.6 },
});

const props = {
  roomDims: ROOM,
  seats: seatResults.seats,
  rsp: { x: 2.50, y: 3.6 },
  screenFrontPlaneM: 0.2,
  screenWidthM: 3,
};

const SCREEN = renderToStaticMarkup(React.createElement(ClientRecommendedSeatingPosition, props));
const PRINT_DRAWING = renderToStaticMarkup(React.createElement(ClientRecommendedSeatingPosition, { ...props, print: true, printPart: 'drawing' }));
const PRINT_SUPPORT = renderToStaticMarkup(React.createElement(ClientRecommendedSeatingPosition, { ...props, print: true, printPart: 'support' }));
const PRINT_WHOLE = renderToStaticMarkup(React.createElement(ClientRecommendedSeatingPosition, { ...props, print: true }));

const textOf = (markup) => markup.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const SCREEN_TEXT = textOf(SCREEN);
const PRINT_TEXT = textOf(PRINT_WHOLE);
const countOf = (haystack, needle) => haystack.split(needle).length - 1;

// The seat-map region: from the map heading to the end of the page, so the
// drawing's zone labels can never be mistaken for seat pills or distances.
const mapRegion = (text) => {
  const start = text.indexOf('P1 Seat Results');
  assert.notEqual(start, -1, 'the P1 seat result map is present');
  return text.slice(start);
};
const SCREEN_MAP = mapRegion(SCREEN_TEXT);

test('the boundary-zone drawing is preserved and precedes the seat map', () => {
  assert.ok(SCREEN.includes('<svg'), 'the boundary-zone drawing is still rendered');
  assert.ok(SCREEN_TEXT.includes('SCREEN'), 'the screen wall remains marked');
  assert.ok(SCREEN_TEXT.includes('RSP'), 'the reference position marker remains');
  for (const zone of ['Below L1', 'L1', 'L2', 'L3', 'L4']) {
    assert.ok(SCREEN_TEXT.includes(zone), `the ${zone} boundary zone remains labelled`);
  }
  const svg = SCREEN.indexOf('<svg');
  const map = SCREEN_TEXT.indexOf('P1 Seat Results');
  assert.ok(svg !== -1 && svg < SCREEN.indexOf('P1 Seat Results'), 'the seat map follows the drawing');
  assert.ok(map > SCREEN_TEXT.indexOf('SCREEN'), 'the map sits below the drawing, not above it');
});

test('seat results are laid out in the same shape as the seating plan', () => {
  assert.ok(SCREEN_MAP.includes('Front row') && SCREEN_MAP.includes('Rear row'), 'both physical rows are mapped');
  // Stop at the legend, so its L1/L2/L3/L4 swatches can never be read as pills.
  const legendStart = SCREEN_MAP.indexOf('Below L1', SCREEN_MAP.indexOf('Rear row'));
  assert.notEqual(legendStart, -1, 'the legend follows the rows');
  const front = SCREEN_MAP.slice(SCREEN_MAP.indexOf('Front row'), SCREEN_MAP.indexOf('Rear row'));
  const rear = SCREEN_MAP.slice(SCREEN_MAP.indexOf('Rear row'), legendStart);
  assert.equal(countOf(front, 'L4'), 4, 'four front-row L4 pills');
  // Rear row reads left to right exactly as the seating plan does: L3, then
  // three L4, then L3 — the outer seats sit closest to the rear wall.
  const rearLevels = rear.match(/L[1-4]/g) || [];
  assert.deepEqual(rearLevels, ['L3', 'L4', 'L4', 'L4', 'L3'], 'the rear row keeps its physical level pattern');
  assert.equal(rearLevels.length, 5, 'five rear-row pills');
});

test('each assessed seat keeps its published distance beneath its pill', () => {
  const front = SCREEN_MAP.slice(SCREEN_MAP.indexOf('Front row'), SCREEN_MAP.indexOf('Rear row'));
  const rear = SCREEN_MAP.slice(SCREEN_MAP.indexOf('Rear row'));
  for (const distance of ['1.65 m', '2.30 m']) {
    assert.ok(front.includes(distance), `front-row distance ${distance} shown`);
  }
  for (const distance of ['1.70 m', '2.10 m', '2.50 m']) {
    assert.ok(rear.includes(distance), `rear-row distance ${distance} shown`);
  }
  // Every one of the nine assessed seats carries a distance value.
  assert.equal(countOf(SCREEN_MAP, ' m '), 9, 'a distance value beneath every seat');
});

test('the linear Seat 1 … Seat N table is gone', () => {
  assert.ok(!SCREEN.includes('<table'), 'no result table remains on the page');
  for (const label of ['Seat 1', 'Seat 2', 'Seat 3', 'Seat 9']) {
    assert.ok(!SCREEN_TEXT.includes(label), `${label} is no longer a result label`);
  }
  assert.ok(!SCREEN_TEXT.includes('P1 Distance'), 'the table row label is gone');
  assert.ok(SCREEN_TEXT.includes('P1 Seat Results'), 'the seat map is the result');
});

test('front and rear rows are named and ordered front-to-back', () => {
  const front = SCREEN_TEXT.indexOf('Front row');
  const rear = SCREEN_TEXT.indexOf('Rear row');
  assert.ok(front !== -1 && rear !== -1 && front < rear, 'the front row is stated before the rear row');
});

test('a failure reads "Below L1" with the canonical FAIL colour', () => {
  // A seat hard against a boundary is published as FAIL — the pill must carry
  // the canonical FAIL treatment while stating the report's own wording, the
  // same name the boundary-zone legend uses.
  const closeSeat = [{ seatId: 'x1', level: 'FAIL', value: 0.3, valueFormatted: '0.30 m', status: 'scored' }];
  const result = selectClientRecommendedSeatingPosition({
    engineeringSummary: { project: { reportCounts: { seatResultsByParameter: { p1: closeSeat } } } },
    seatingPositions: [{ id: 'x1', x: 0.3, y: 2.0 }],
    rsp: { x: 0.3, y: 2.0 },
  });
  assert.equal(result.seats[0].level, 'Below L1', 'the selector names a failure as Below L1');
  assert.equal(result.seats[0].levelRaw, 'FAIL', 'the raw published level is retained for the pill colour');

  const markup = renderToStaticMarkup(React.createElement(P1SeatResultBlock, { rows: result.rows }));
  const text = textOf(markup);
  assert.ok(text.includes('Below L1'), 'the pill states Below L1');
  assert.ok(!text.includes('FAIL'), 'the raw token is never shown to the client');
  assert.ok(markup.includes(RP22_GRADE_TOKENS.FAIL.bg), 'the pill uses the canonical FAIL fill');
  assert.ok(markup.includes(RP22_GRADE_TOKENS.FAIL.text), 'the pill uses the canonical FAIL text colour');
  assert.ok(text.includes('0.30 m'), 'the distance is preserved on the failing seat');
});

test('the seat map outranks the level legend, which stays as a footnote', () => {
  // Result first, legend after: the pills are the page's statement.
  const mapIndex = SCREEN.indexOf('P1 Seat Results');
  const legendSwatch = SCREEN.indexOf('width:14px');
  assert.notEqual(mapIndex, -1, 'the seat map is present');
  assert.notEqual(legendSwatch, -1, 'the boundary-zone legend remains');
  assert.ok(mapIndex < legendSwatch, 'the seat map precedes the legend');
  assert.ok(SCREEN_TEXT.lastIndexOf('Below L1') > SCREEN_TEXT.indexOf('P1 Seat Results'), 'the legend follows the map');
  // The legend is a footnote for the drawing's zones, not a second result.
  const legendRegion = SCREEN_TEXT.slice(SCREEN_TEXT.lastIndexOf('Below L1'));
  assert.ok(!legendRegion.includes('P1 Seat Results'), 'the legend carries no seat results');
});

test('the printed page (PDF) carries the drawing AND the seat map', () => {
  assert.ok(PRINT_DRAWING.includes('<svg'), 'the drawing prints on its own page region');
  assert.ok(!textOf(PRINT_DRAWING).includes('P1 Seat Results'), 'the drawing region carries no result text');
  assert.ok(textOf(PRINT_SUPPORT).includes('P1 Seat Results'), 'the seat map prints');
  assert.ok(textOf(PRINT_SUPPORT).includes('1.70 m'), 'the distances print beneath their pills');
  assert.ok(textOf(PRINT_SUPPORT).includes('Front row'), 'the rows print');
  assert.ok(PRINT_TEXT.includes('P1 Seat Results'), 'a whole-page print carries the map too');
  // The PDF path forwards the same published seats into the print page.
  const printPage = fs.readFileSync('src/components/report/client/ClientReportPage.jsx', 'utf8');
  assert.ok(printPage.includes('seats={printData.seats}'), 'print receives the seat results');
});

test('no P1 calculation: published values pass through unchanged', () => {
  assert.equal(seatResults.hasAny, true);
  const byId = new Map(seatResults.seats.map((seat) => [seat.id, seat]));
  assert.equal(byId.get('f2').level, 'L4');
  assert.equal(byId.get('f2').formatted, '2.30 m');
  assert.equal(byId.get('f2').distanceM, 2.3);
  assert.equal(byId.get('r1').level, 'L3');
  assert.equal(byId.get('r1').rank, 3);
  assert.equal(seatResults.rows.length, 2, 'two physical rows');
  assert.equal(seatResults.rows[1].seats.map((s) => s.id).join(','), 'r1,r2,r3,r4,r5', 'rear row ordered left-to-right');
  // No grading, measurement or engine work was introduced anywhere in the path.
  for (const file of [
    'src/components/report/client/selectClientRecommendedSeatingPosition.js',
    'src/components/report/client/P1SeatResultBlock.jsx',
    'src/components/report/client/ClientRecommendedSeatingPosition.jsx',
  ]) {
    const src = fs.readFileSync(file, 'utf8');
    assert.ok(!src.includes('useRP22AnalysisEngine'), `${file} does not mount the RP22 engine`);
    assert.ok(!src.includes('computeP1'), `${file} does not recompute P1`);
    assert.ok(!src.includes('LEVEL_BOUNDARIES'), `${file} does not re-derive thresholds`);
  }
  // The zones carry no thresholds beyond the ones the page already drew.
  const page = fs.readFileSync('src/components/report/client/ClientRecommendedSeatingPosition.jsx', 'utf8');
  assert.ok(page.includes('Thresholds match the canonical P1 grading authority'), 'zone insets remain the drawing authority');
});

test('no layout overflow: rows wrap and the pill styling is canonical', () => {
  assert.ok(SCREEN.includes('flex-wrap:wrap'), 'seat pills wrap rather than overflowing');
  assert.ok(SCREEN.includes('width:100%'), 'the seat map stays inside the page column');
  assert.ok(SCREEN.includes(RP22_GRADE_TOKENS.L4.bg), 'L4 pills use the canonical fill');
  assert.ok(SCREEN.includes(RP22_GRADE_TOKENS.L4.border), 'L4 pills use the canonical border');
  assert.ok(SCREEN.includes(RP22_GRADE_TOKENS.L3.bg), 'L3 pills use the canonical fill');
  assert.ok(SCREEN.includes(RP22_GRADE_TOKENS.L3.border), 'L3 pills use the canonical border');
  // The shared seat-result block is reused, not duplicated.
  const block = fs.readFileSync('src/components/report/client/P1SeatResultBlock.jsx', 'utf8');
  assert.ok(block.includes('ClientSeatResultRows'), 'P1 reuses the canonical seat-result block');
  const shared = fs.readFileSync('src/components/report/client/ClientSeatResultRows.jsx', 'utf8');
  assert.ok(shared.includes('pillTextKey'), 'the shared block supports report-specific pill wording');
  assert.ok(ClientSeatResultRows && typeof ClientSeatResultRows === 'function', 'the shared block is a component');
});