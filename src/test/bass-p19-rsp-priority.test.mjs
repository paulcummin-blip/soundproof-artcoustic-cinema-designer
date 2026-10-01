// ---------------------------------------------------------------------------
// Bass Performance (Visual Report, P19 page) — the seat plan must mark EVERY
// primary seat as primary, keep secondary seats distinct, and draw the
// reference seating position (RSP) as its own reference point.
//
//   TEST 1  Priority is the seat classification, never the RSP / MLP flag
//   TEST 2  All three primary seats are drawn as primary — not only the RSP seat
//   TEST 3  Secondary seats remain visually distinct
//   TEST 4  The RSP is drawn separately, in its own reference glyph
//   TEST 5  The legend distinguishes Primary / Secondary / Reference position
//   TEST 6  No P19 value, grading or selector change
//   TEST 7  Report seat serialisation keeps priority (nothing is lost)
//   TEST 8  The printed page (PDF) carries the same map and legend
//   TEST 9  No layout overflow
// ---------------------------------------------------------------------------
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import ClientP19RspPresentation from '../components/report/client/ClientP19RspPresentation.jsx';
import { normalizeSeat } from '../components/report/client/useClientReportAuthority.jsx';
import { resolveSeatPriority } from '../components/utils/seatPriorityAuthority.js';

const SOURCE = fs.readFileSync('src/components/report/client/ClientP19RspPresentation.jsx', 'utf8');

// ── The project's real data (Marquee Home) ──────────────────────────────────
// 9 seats: 3 PRIMARY, 6 SECONDARY. Only ONE seat carries the internal
// isPrimary RSP/MLP flag — reading that flag as the priority group is what made
// the page look as though the reference seat were the only primary seat.
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

// Published P19 rows — the reference-position result this page states.
const P19_LEVEL = 'L2';
const publishedP19Rows = seatingPositions.map((seat, i) => ({
  seatId: seat.id,
  priority: seat.priority,
  level: P19_LEVEL,
  value: 4 + i * 0.1,
  valueFormatted: `${Math.floor(4 + i * 0.1)} dB`,
}));

const bassPerformance = {
  p19: {
    achievedLevel: P19_LEVEL,
    perSeatResults: publishedP19Rows.map((row) => ({
      seatId: row.seatId,
      isPrimary: row.priority === 'primary',
      priority: row.priority,
      level: row.level,
      variationDbRaw: row.value,
      displayedValue: row.valueFormatted,
      worstFrequencyHz: 90,
    })),
  },
  p20: null,
  seatLabelMap: new Map(),
};

const baseProps = {
  bassPerformance,
  roomDims: { widthM: 4.5, lengthM: 6.0, heightM: 2.4 },
  seatingPositions,
  rsp: { x: 2.25, y: 4.6367 },
  screenFrontPlaneM: 0.2,
  screenWidthM: 3,
  subwooferInstances: [],
};

const render = (props = {}) => renderToStaticMarkup(
  React.createElement(ClientP19RspPresentation, { ...baseProps, ...props }),
);

const SCREEN = render();
const DRAWING = render({ print: true, printPart: 'drawing' });
const SUPPORT = render({ print: true, printPart: 'support' });

const textOf = (markup) => markup.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const SCREEN_TEXT = textOf(SCREEN);
const SUPPORT_TEXT = textOf(SUPPORT);
const countOf = (haystack, needle) => haystack.split(needle).length - 1;
const firstSvg = (markup) => markup.slice(markup.indexOf('<svg'), markup.indexOf('</svg>'));

// PositionMarker: Primary = dark disc + bold outer keyline; Secondary = muted
// disc, no keyline. The reference point has its own crosshair glyph.
const PRIMARY_KEYLINE = 'fill="none" stroke="#213428" stroke-width="3.5"';
const PRIMARY_DISC = 'fill="#213428" stroke="#F8F8F7"';
const SECONDARY_DISC = 'fill="#625143" stroke="#F8F8F7"';
const RSP_RING = 'fill="none" stroke="#213428" stroke-width="2.5"';

test('priority is the seat classification, never the RSP / MLP flag', () => {
  const primary = seatingPositions.filter((s) => resolveSeatPriority(s) === 'primary');
  assert.equal(primary.length, 3, 'the project has three primary seats');
  assert.equal(seatingPositions.filter((s) => s.isPrimary === true).length, 1, 'one seat carries the RSP flag');
  // The page reads the classification helper, not the flag.
  assert.ok(SOURCE.includes('resolveSeatPriority(seat)'), 'priority comes from the seat priority authority');
  assert.ok(!/isPrimary: !!seat\?\.isPrimary/.test(SOURCE), 'the RSP flag is no longer read as priority');
});

test('all three primary seats are drawn as primary — not only the RSP seat', () => {
  const drawing = firstSvg(SCREEN);
  assert.equal(countOf(drawing, PRIMARY_KEYLINE), 3, 'three seats carry the primary keyline');
  assert.notEqual(countOf(drawing, PRIMARY_KEYLINE), 1, 'not only the seat that holds the RSP flag');
  // Two of the three primaries carry no RSP flag at all, so they can only come
  // from the priority classification.
  assert.equal(seatingPositions.filter((s) => s.priority === 'primary' && s.isPrimary === false).length, 2);
  assert.equal(countOf(drawing, PRIMARY_DISC), 3, 'three primary discs');
  assert.equal(countOf(firstSvg(DRAWING), PRIMARY_KEYLINE), 3, 'the printed drawing marks the same three');
});

test('secondary seats remain visually distinct', () => {
  const drawing = firstSvg(SCREEN);
  assert.equal(countOf(drawing, SECONDARY_DISC), 6, 'six secondary seats are drawn');
  assert.equal(countOf(drawing, PRIMARY_DISC), 3, 'and exactly three are primary');
  assert.equal(countOf(drawing, PRIMARY_KEYLINE), 3, 'no secondary seat carries the primary keyline');
  // Every seat is still on the plan: three primary + six secondary.
  assert.equal(countOf(drawing, PRIMARY_DISC) + countOf(drawing, SECONDARY_DISC), 9);
});

test('the RSP is drawn separately, in its own reference glyph', () => {
  const drawing = firstSvg(SCREEN);
  // Its own ring weight, distinct from the seat keyline.
  assert.equal(countOf(drawing, RSP_RING), 1, 'the reference ring is its own glyph');
  // Crosshair ticks + the screen line: the reference point is not a seat marker.
  assert.equal(countOf(drawing, '<line '), 3, 'the screen plus the two reference ticks');
  assert.equal(countOf(drawing, PRIMARY_KEYLINE), 3, 'the reference point adds no primary keyline');
  assert.ok(drawing.includes('RSP'), 'the reference position is labelled');
  assert.ok(drawing.includes('r="8"'), 'the reference ring is drawn at its own radius');
  // The reference position is not a seat coordinate in this project.
  const atRsp = seatingPositions.filter(
    (s) => Math.abs(s.x - 2.25) < 1e-6 && Math.abs(s.y - 4.6367) < 1e-6,
  );
  assert.deepEqual(atRsp, [], 'the RSP is a separate point, not a seat');
});

test('the legend distinguishes Primary / Secondary / Reference position', () => {
  for (const entry of ['Primary seat', 'Secondary seat', 'Reference position (RSP)']) {
    assert.ok(SCREEN_TEXT.includes(entry), `the legend names ${entry}`);
    assert.ok(SUPPORT_TEXT.includes(entry), `the printed legend names ${entry}`);
  }
  assert.ok(SOURCE.includes('PRIORITY_LEGEND'), 'the priority key is the shared authority');
  assert.ok(SOURCE.includes('<RspReferenceMarker cx={rspPx.px}'), 'the map shows the reference glyph');
});

test('no P19 value, grading or selector change', () => {
  const gradingImports = /(bassGradingAuthority|rp22LevelCalculation|rp22BassMetrics|rp22BassOperatingDefinitions|canonicalBassResult)/;
  assert.ok(!gradingImports.test(SOURCE), 'no grading authority imported');
  assert.ok(!/function\s+\w*[Gg]rade/.test(SOURCE), 'no grading function added');
  assert.ok(SOURCE.includes('formatP19P20DeviationText'), 'the published deviation text authority is unchanged');
  assert.ok(SOURCE.includes('resolveCoordinate'), 'seat geometry resolution is unchanged');
  // The published level is stated exactly as published — the marker change
  // touches priority only.
  assert.equal(SCREEN_TEXT.includes(P19_LEVEL), true, 'the published P19 level is shown');
  assert.equal(countOf(SCREEN_TEXT, P19_LEVEL), countOf(textOf(DRAWING), P19_LEVEL) + 1, 'the drawing adds no level');
});

test('report seat serialisation keeps priority (nothing is lost)', () => {
  // The report normaliser must carry the classification: a normalised seat that
  // dropped it left pages with only the single RSP flag to fall back on.
  const normalized = seatingPositions.map(normalizeSeat);
  assert.equal(normalized.filter((s) => s.priority === 'primary').length, 3, 'three primary seats survive');
  assert.equal(normalized.filter((s) => s.priority === 'secondary').length, 6, 'six secondary seats survive');
  assert.equal(normalized.filter((s) => s.isPrimary === true).length, 1, 'the RSP flag is carried separately');
  // Geometry and identity are unchanged.
  const first = normalizeSeat(seatingPositions[0]);
  assert.equal(first.id, 'seat-r1-c1');
  assert.equal(first.x, 1.69);
  assert.equal(first.y, 3.78);
  // Legacy seats with no stored priority resolve to Primary, as before.
  assert.equal(normalizeSeat({ id: 'legacy', x: 1, y: 2 }).priority, 'primary');
});

test('the printed page (PDF) carries the same map and legend', () => {
  const supportText = textOf(SUPPORT);
  for (const entry of ['Primary seat', 'Secondary seat', 'Reference position (RSP)']) {
    assert.ok(supportText.includes(entry), `the PDF legend names ${entry}`);
  }
  assert.equal(countOf(firstSvg(DRAWING), PRIMARY_KEYLINE), 3, 'the PDF map marks all three primary seats');
  assert.equal(countOf(firstSvg(DRAWING), SECONDARY_DISC), 6, 'the PDF map keeps all six secondary seats');
  assert.equal(countOf(firstSvg(DRAWING), RSP_RING), 1, 'the PDF map draws the reference point separately');
  // The PDF path forwards the same seats into the print page.
  const printPage = fs.readFileSync('src/components/report/client/ClientReportPage.jsx', 'utf8');
  assert.ok(printPage.includes('seatingPositions={printData.seatingPositions}'), 'print receives the seats');
});

test('no layout overflow', () => {
  assert.ok(SCREEN.includes('flex-wrap:wrap'), 'the legend wraps rather than overflowing');
  assert.ok(SCREEN.includes('max-width:620px'), 'the result column stays capped');
  assert.ok(SUPPORT.includes('width:100%'), 'the printed support block uses the page width');
  // Screen and print render the identical drawing.
  const body = (markup) => {
    const svg = firstSvg(markup);
    return svg.slice(svg.indexOf('>') + 1);
  };
  assert.equal(body(SCREEN), body(DRAWING), 'one drawing for screen and PDF');
});