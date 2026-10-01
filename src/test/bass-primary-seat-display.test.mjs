// ---------------------------------------------------------------------------
// Bass Performance (Visual Report, RP22 P19/P20) — the seat map must mark every
// PRIMARY seat as primary, keep SECONDARY seats distinct, and show the
// reference seating position (RSP) separately.
//
//   TEST 1  Priority is the seat classification, never the RSP / MLP flag
//   TEST 2  All three primary seats are drawn with the primary keyline
//   TEST 3  Every seat keeps its P20 halo (no seat loses its marker)
//   TEST 4  The RSP is drawn separately, in its own glyph
//   TEST 5  The legend distinguishes Primary / Secondary / RSP / halo
//   TEST 6  The row result table preserves each seat's priority group
//   TEST 7  No P19/P20 value, grading or selector change
//   TEST 8  The printed page (PDF) carries the same map, legend and table
//   TEST 9  No layout overflow
// ---------------------------------------------------------------------------
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import ClientBassResponse from '../components/report/client/ClientBassResponse.jsx';
import PrintBassResponseContent from '../components/report/client/print/PrintBassResponseContent.jsx';
import { resolveSeatPriority } from '../components/utils/seatPriorityAuthority.js';

const COMPONENT_PATH = path.resolve('src/components/report/client/ClientBassResponse.jsx');
const source = fs.readFileSync(COMPONENT_PATH, 'utf8');

// ── The project's real data (Marquee Home) ──────────────────────────────────
// 9 seats: 3 PRIMARY, 6 SECONDARY. Only ONE seat carries the internal
// isPrimary RSP/MLP flag — that single flag is what the page used to draw as
// "the primary seat", which is the defect this suite locks down.
const seatingPositions = [
  { id: 'seat-r1-c1', priority: 'secondary', isPrimary: false, x: 1.69, y: 3.78 },
  { id: 'seat-r1-c2', priority: 'primary', isPrimary: true, x: 2.29, y: 3.78 },
  { id: 'seat-r1-c3', priority: 'primary', isPrimary: false, x: 2.89, y: 3.78 },
  { id: 'seat-r1-c4', priority: 'secondary', isPrimary: false, x: 3.49, y: 3.78 },
  { id: 'seat-r2-c1', priority: 'secondary', isPrimary: false, x: 1.39, y: 5.58 },
  { id: 'seat-r2-c2', priority: 'secondary', isPrimary: false, x: 1.99, y: 5.58 },
  { id: 'seat-r2-c3', priority: 'primary', isPrimary: false, x: 2.59, y: 5.58 },
  { id: 'seat-r2-c4', priority: 'secondary', isPrimary: false, x: 3.19, y: 5.58 },
  { id: 'seat-r2-c5', priority: 'secondary', isPrimary: false, x: 3.79, y: 5.58 },
];

// Published authority per-seat rows for P20 (all Level 1 in this project).
const publishedP20Rows = [
  { seatId: 'seat-r1-c1', priority: 'secondary', level: 'L1', value: 7.08 },
  { seatId: 'seat-r1-c2', priority: 'primary', level: 'L1', value: 6.83 },
  { seatId: 'seat-r1-c3', priority: 'primary', level: 'L1', value: 6.59 },
  { seatId: 'seat-r1-c4', priority: 'secondary', level: 'L1', value: 5.82 },
  { seatId: 'seat-r2-c1', priority: 'secondary', level: 'L1', value: 10.9 },
  { seatId: 'seat-r2-c2', priority: 'secondary', level: 'L1', value: 15.36 },
  { seatId: 'seat-r2-c3', priority: 'primary', level: 'L1', value: 16.85 },
  { seatId: 'seat-r2-c4', priority: 'secondary', level: 'L1', value: 15.06 },
  { seatId: 'seat-r2-c5', priority: 'secondary', level: 'L1', value: 10.05 },
];

const bassPerformance = {
  p19: null,
  p20: {
    achievedLevel: 'L1',
    perSeatResults: publishedP20Rows.map((row) => ({
      seatId: row.seatId,
      isPrimary: row.priority === 'primary',
      priority: row.priority,
      level: row.level,
      variationDbRaw: row.value,
    })),
  },
  seatLabelMap: new Map(),
};

// The RSP sits between the rows, at the room centreline — not at a seat.
const rsp = { x: 2.25, y: 4.6367, z: 1.2 };

const baseProps = {
  bassPerformance,
  roomDims: { widthM: 4.5, lengthM: 6.0, heightM: 2.4 },
  seatingPositions,
  rsp,
  screenFrontPlaneM: 0.2,
  screenWidthM: 3,
};

const render = (props = {}) => renderToStaticMarkup(
  React.createElement(ClientBassResponse, { ...baseProps, ...props }),
);

const SCREEN = render();
const SUPPORT = render({ print: true, printPart: 'support' });
const DRAWING = render({ print: true, printPart: 'drawing' });
const PRINT = renderToStaticMarkup(React.createElement(PrintBassResponseContent, baseProps));

const textOf = (markup) => markup.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const SCREEN_TEXT = textOf(SCREEN);
const SUPPORT_TEXT = textOf(SUPPORT);
const countOf = (haystack, needle) => haystack.split(needle).length - 1;

const firstSvg = (markup) => markup.slice(markup.indexOf('<svg'), markup.indexOf('</svg>'));
// All per-seat tables, one per physical seating row.
const tableOf = (markup) => {
  const start = markup.indexOf('<table');
  const end = markup.lastIndexOf('</table>');
  assert.ok(start !== -1 && end > start, 'the per-seat tables render');
  return markup.slice(start, end);
};

const PRIMARY_KEYLINE = 'stroke="#213428" stroke-width="3.5"';
const HALO_DISC = 'r="4" fill="#625143"';

test('priority is the seat classification, never the RSP / MLP flag', () => {
  // The project classifies 3 seats Primary and 6 Secondary.
  const primary = seatingPositions.filter((s) => resolveSeatPriority(s) === 'primary');
  const secondary = seatingPositions.filter((s) => resolveSeatPriority(s) === 'secondary');
  assert.equal(primary.length, 3, 'the project has three primary seats');
  assert.equal(secondary.length, 6, 'and six secondary seats');
  // Only one seat carries the internal RSP/MLP flag — it is NOT the priority.
  assert.equal(seatingPositions.filter((s) => s.isPrimary === true).length, 1);
  // The page no longer reads that flag as the priority group.
  assert.ok(!/isPrimary: !!s\.isPrimary/.test(source), 'the page does not use the RSP flag as priority');
  assert.ok(
    source.includes('resolveSeatPriority(s)'),
    'priority comes from the canonical seat priority authority',
  );
  // Two primaries carry no RSP flag at all, so they can only be drawn from priority.
  const rspFlagged = primary.filter((s) => s.isPrimary === true).length;
  assert.equal(rspFlagged, 1, 'exactly one primary seat also carries the RSP flag');
});

test('all three primary seats are drawn with the primary keyline', () => {
  const drawing = firstSvg(SCREEN);
  assert.equal(countOf(drawing, PRIMARY_KEYLINE), 3, 'three seats carry the bold primary keyline');
  assert.notEqual(countOf(drawing, PRIMARY_KEYLINE), 1, 'not only the RSP seat');
  // The same holds through the printed drawing region.
  assert.equal(countOf(firstSvg(DRAWING), PRIMARY_KEYLINE), 3, 'print draws the same three');
});

test('every seat keeps its P20 halo (no seat loses its marker)', () => {
  const drawing = firstSvg(SCREEN);
  assert.equal(countOf(drawing, HALO_DISC), 9, 'all nine assessed seats are drawn');
  // The halo band is present for each seat: 9 bands + 9 outlines + 3 primary
  // keylines + the reference ring.
  const noneCircles = countOf(drawing, 'fill="none"');
  assert.equal(noneCircles, 22, 'one P20 halo band and outline per seat');
  // Secondary seats are drawn too — they are not dropped from the map.
  const secondary = seatingPositions.filter((s) => resolveSeatPriority(s) === 'secondary');
  assert.equal(secondary.length, 6, 'six secondary seats remain in the map');
});

test('the RSP is drawn separately, in its own glyph', () => {
  const drawing = firstSvg(SCREEN);
  // The reference position has its own crosshair marker: two ticks, a ring and
  // a dot — never a seat halo, never a primary keyline.
  assert.equal(countOf(drawing, PRIMARY_KEYLINE), 3, 'the RSP adds no primary keyline');
  // The reference ring is drawn at its own weight, distinct from the seat keyline.
  assert.equal(
    countOf(drawing, 'stroke="#213428" stroke-width="2.5"'),
    1,
    'the RSP ring is its own glyph, not a seat keyline',
  );
  // Screen line + the two RSP crosshair ticks.
  assert.equal(countOf(drawing, '<line '), 3, 'the screen plus the reference crosshair');
  assert.ok(drawing.includes('RSP'), 'the reference position is labelled');
  // The reference position is not one of the seats in this project.
  const atRsp = seatingPositions.filter(
    (s) => Math.abs(s.x - rsp.x) < 1e-6 && Math.abs(s.y - rsp.y) < 1e-6,
  );
  assert.deepEqual(atRsp, [], 'the RSP is a separate point, not a seat coordinate');
});

test('the legend distinguishes Primary / Secondary / RSP / halo', () => {
  for (const entry of [
    'Primary seat',
    'Secondary seat',
    'Reference position (RSP)',
    'Halo — P20 seat consistency',
  ]) {
    assert.ok(SCREEN_TEXT.includes(entry), `the legend names ${entry}`);
    assert.ok(SUPPORT_TEXT.includes(entry), `the printed legend names ${entry}`);
  }
  assert.ok(source.includes('RspReferenceMarker'), 'the legend shows the reference glyph');
  assert.ok(source.includes('<RspReferenceMarker cx={rspPx.px}'), 'the map shows the reference glyph');
});

test('the row result table preserves each seat priority group', () => {
  const table = tableOf(SCREEN);
  const tableText = textOf(table);
  assert.equal(countOf(tableText, 'Primary'), 3, 'three seats are labelled Primary in the table');
  assert.equal(countOf(tableText, 'Secondary'), 6, 'six seats are labelled Secondary in the table');
  // Row layout is unchanged: two rows, seat numbers restart per row.
  assert.equal(countOf(SCREEN_TEXT, 'Row 1'), 1, 'the front row heading is unchanged');
  assert.equal(countOf(SCREEN_TEXT, 'Row 2'), 1, 'the second row heading is unchanged');
  assert.equal(countOf(table, 'Seat 1'), 2, 'seat numbering still restarts in each row');
  // The published P20 result is preserved for every seat.
  assert.equal(countOf(tableText, 'L1'), 9, 'each seat keeps its published P20 level');
});

test('no P19/P20 value, grading or selector change', () => {
  const gradingImports = /(bassGradingAuthority|rp22LevelCalculation|rp22BassMetrics|resolveRp22DesignValue|rp22BassOperatingDefinitions|canonicalBassResult)/;
  assert.ok(!gradingImports.test(source), 'no grading authority imported');
  assert.ok(!/function\s+\w*[Gg]rade/.test(source), 'no grading function added');
  assert.ok(source.includes('resolveP20SeatDisplay'), 'the P20 display authority is still the single source');
  assert.ok(source.includes('levelToLabel(p20Result.level)'), 'the published P20 level is passed through unchanged');
  // The map decides priority groups only — it never touches a result value.
  const mapBlock = source.slice(source.indexOf('function buildBassSeats'), source.indexOf('// ── Summary sentence ──'));
  assert.ok(!/level\s*=/.test(mapBlock), 'the seat map assigns no level');
  assert.ok(!/Math\./.test(mapBlock), 'the seat map performs no arithmetic');
});

test('the printed page (PDF) carries the same map, legend and table', () => {
  const printText = textOf(PRINT);
  for (const entry of ['Primary seat', 'Secondary seat', 'Reference position (RSP)', 'Halo — P20 seat consistency']) {
    assert.ok(printText.includes(entry), `the PDF legend names ${entry}`);
  }
  assert.equal(countOf(firstSvg(DRAWING), PRIMARY_KEYLINE), 3, 'the PDF map marks all three primary seats');
  const printTable = textOf(tableOf(PRINT));
  assert.equal(countOf(printTable, 'Primary'), 3, 'the PDF table labels three primary seats');
  assert.equal(countOf(printTable, 'Secondary'), 6, 'the PDF table labels six secondary seats');
});

test('no layout overflow', () => {
  // Legend and table stay inside the page column on screen, and use the full
  // printed width so a longer legend wraps rather than overflowing.
  assert.ok(SCREEN.includes('max-width:600px'), 'the screen column is capped');
  assert.ok(SCREEN.includes('flex-wrap:wrap'), 'the legend wraps instead of overflowing');
  assert.ok(SUPPORT.includes('width:100%'), 'the printed support block uses the page width');
  // The table keeps its fixed layout — added priority captions cannot push columns.
  assert.ok(SUPPORT.includes('table-layout:fixed'), 'the seat table keeps its fixed layout');
  // Screen and print render the identical drawing.
  const body = (markup) => {
    const svg = firstSvg(markup);
    return svg.slice(svg.indexOf('>') + 1);
  };
  assert.equal(body(SCREEN), body(DRAWING), 'one drawing for screen and PDF');
});