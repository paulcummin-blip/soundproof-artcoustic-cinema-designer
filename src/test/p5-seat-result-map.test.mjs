// p5-seat-result-map.test.mjs
// ---------------------------------------------------------------------------
// P5 (maximum allowable horizontal angle between adjacent surround speakers)
// is assessed AT EVERY SEATING POSITION. The Visual Report page therefore keeps
// the RSP-centred design-view graphic AND shows the assessed seat-based result.
//
//   TEST 1  The RSP graphic is preserved and labelled as the design view
//   TEST 2  Every assessed seat carries a P5 level pill, laid out by row
//   TEST 3  Each seat keeps its published angle beneath its pill
//   TEST 4  The limiting seat / limiting angle block is NOT shown
//   TEST 5  The page states the project result, not the RSP result
//   TEST 6  The official RP22 Parameter 5 wording is used
//   TEST 7  The printed page (PDF) carries the graphic AND the seat map
//   TEST 8  No P5 calculation: published values pass through unchanged
//   TEST 9  No layout overflow: rows wrap, the result stays inside its card
// ---------------------------------------------------------------------------
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import ClientSoundAroundListener from '../components/report/client/ClientSoundAroundListener.jsx';
import PrintP5Content from '../components/report/client/print/PrintP5Content.jsx';
import { selectClientP5SeatResults } from '../components/report/client/selectClientP5SeatResults.js';
import { getOfficialRp22Title } from '../components/utils/rp22OfficialTitles.js';
import { RP22_GRADE_TOKENS } from '../components/utils/rp22Colors.jsx';

const RP22_P5_DESCRIPTION = 'Maximum allowable horizontal angle between adjacent surround speakers';
const DESIGN_VIEW_COPY =
  'The graphic shows the surround geometry from the reference seating position. The seat map '
  + 'below shows the assessed P5 result at each seating position.';

// ── Published authority fixture ────────────────────────────────────────────
// Front row: 4 seats, all assessed at L3. Rear row: 5 seats, all at L2, with the
// largest published angle at the middle seat (the limiting seat).
const FRONT = [
  { seatId: 'f1', level: 'L3', value: 44, valueFormatted: '44°' },
  { seatId: 'f2', level: 'L3', value: 46, valueFormatted: '46°' },
  { seatId: 'f3', level: 'L3', value: 48, valueFormatted: '48°' },
  { seatId: 'f4', level: 'L3', value: 45, valueFormatted: '45°' },
];
const REAR = [
  { seatId: 'r1', level: 'L2', value: 55, valueFormatted: '55°' },
  { seatId: 'r2', level: 'L2', value: 58, valueFormatted: '58°' },
  { seatId: 'r3', level: 'L2', value: 60, valueFormatted: '60°' },
  { seatId: 'r4', level: 'L2', value: 57, valueFormatted: '57°' },
  { seatId: 'r5', level: 'L2', value: 56, valueFormatted: '56°' },
];
// r6 is not scored — it must stay visible in the map with no level pill value.
const UNASSESSED = [{ seatId: 'r6', level: '—', value: null, valueFormatted: '—', status: 'not_calculated' }];

const publishedRows = [...FRONT, ...REAR, ...UNASSESSED].map((row, i) => ({
  ...row,
  row: i < 4 ? 1 : 2,
  column: i + 1,
  priority: 'primary',
  isPrimary: i === 0,
  status: row.status || 'scored',
}));

const engineeringSummary = {
  project: {
    reportCounts: {
      seatResultsByParameter: { p5: publishedRows },
      seatParameterDistributions: {
        p5: {
          levelCounts: { L4: 0, L3: 4, L2: 5, L1: 0, FAIL: 0, unassessed: 1 },
          assessedCount: 9,
          seatCount: 10,
          uniformLevel: null,
        },
      },
    },
  },
  // The published project result for P5 is the floor across the assessed seats.
  parameterSummaries: { project: { p5: { key: 'p5', scope: 'seat', state: 'scored', level: 'L2' } } },
};

const seatingPositions = [
  { id: 'f1', x: 1.6, y: 3.6 }, { id: 'f2', x: 2.2, y: 3.6 },
  { id: 'f3', x: 2.8, y: 3.6 }, { id: 'f4', x: 3.4, y: 3.6 },
  { id: 'r1', x: 1.3, y: 5.4 }, { id: 'r2', x: 1.9, y: 5.4 },
  { id: 'r3', x: 2.5, y: 5.4 }, { id: 'r4', x: 3.1, y: 5.4 },
  { id: 'r5', x: 3.7, y: 5.4 }, { id: 'r6', x: 4.3, y: 5.4 },
];

// The RSP design view resolves a different (better) level than the project
// floor — proving the card reads the seat-based project result, not the RSP.
const p5Snapshot = {
  rsp: { x: 2.5, y: 4 },
  level: 'L4',
  geometryWorstGapDeg: 170,
  speakersWithAzimuth: [
    { canon: 'FL', role: 'FL', position: { x: 1, y: 0.5 }, azimuth: -30 },
    { canon: 'FR', role: 'FR', position: { x: 4, y: 0.5 }, azimuth: 30 },
    { canon: 'SL', role: 'SL', position: { x: 0.3, y: 4 }, azimuth: -85 },
    { canon: 'SR', role: 'SR', position: { x: 4.7, y: 4 }, azimuth: 85 },
  ],
  gaps: [
    { fromTheta: 85, toTheta: 140, deg: 55, fromRole: 'SR', toRole: 'SBR' },
    { fromTheta: 140, toTheta: 275, deg: 135, fromRole: 'SBR', toRole: 'SL' },
    { fromTheta: 275, toTheta: 445, deg: 170, fromRole: 'SL', toRole: 'SR' },
  ],
};

const seatResults = selectClientP5SeatResults({ engineeringSummary, seatingPositions });

const props = {
  p5Snapshot,
  seatResults,
  roomDims: { widthM: 5, lengthM: 7, heightM: 2.8 },
  screen: { visibleWidthInches: 120 },
  screenFrontPlaneM: 0.2,
};

const SCREEN = renderToStaticMarkup(React.createElement(ClientSoundAroundListener, props));
const PRINT = renderToStaticMarkup(React.createElement(PrintP5Content, props));

const textOf = (markup) => markup.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const SCREEN_TEXT = textOf(SCREEN);
const PRINT_TEXT = textOf(PRINT);
const countOf = (haystack, needle) => haystack.split(needle).length - 1;

// Seat-map region: from the map heading up to the final result card, so the RSP
// arc labels can never be mistaken for seat pills or seat angles.
const RESULT_CARD_MARKER = 'Level 2';
const seatMapRegion = (text) => {
  const start = text.indexOf('P5 Seat Results');
  const end = text.indexOf(RESULT_CARD_MARKER, start);
  assert.ok(start !== -1 && end > start, 'the seat result map is present');
  return text.slice(start, end);
};
const SCREEN_MAP = seatMapRegion(SCREEN_TEXT);

test('the RSP graphic is preserved and labelled as the design view', () => {
  assert.ok(SCREEN.includes('<svg'), 'the drawing is still rendered');
  assert.ok(SCREEN_TEXT.includes('RSP'), 'the RSP marker remains');
  assert.ok(SCREEN_TEXT.includes('RSP design view'), 'the graphic is labelled as the design view');
  assert.ok(SCREEN_TEXT.includes('SL') && SCREEN_TEXT.includes('SR'), 'surround speakers remain labelled');
  assert.ok(SCREEN_TEXT.includes('170°'), 'the worst-gap arc value remains on the graphic');
  assert.ok(SCREEN_TEXT.includes(DESIGN_VIEW_COPY), 'the RSP design-view copy is shown');
  // Order: heading, design-view label + graphic + copy, then the seat map.
  const label = SCREEN_TEXT.indexOf('RSP design view');
  const svg = SCREEN.indexOf('<svg');
  const map = SCREEN_TEXT.indexOf('P5 Seat Results');
  assert.ok(label < map && svg !== -1 && svg < SCREEN.indexOf('P5 Seat Results'), 'the seat map follows the graphic');
});

test('every assessed seat carries a P5 level pill, laid out by row', () => {
  assert.ok(SCREEN_MAP.includes('Front row') && SCREEN_MAP.includes('Rear row'), 'both physical rows are mapped');
  const front = SCREEN_MAP.slice(SCREEN_MAP.indexOf('Front row'), SCREEN_MAP.indexOf('Rear row'));
  const rear = SCREEN_MAP.slice(SCREEN_MAP.indexOf('Rear row'));
  assert.equal(countOf(front, 'L3'), 4, 'four front-row L3 pills');
  assert.equal(countOf(rear, 'L2'), 5, 'five rear-row L2 pills');
  // The unassessed seat stays in the map, with no level claimed for it: a
  // neutral pill and a neutral value, never an invented level.
  assert.equal(countOf(rear, '—'), 2, 'the unassessed seat shows a neutral pill and value');
});

test('each seat keeps its published angle beneath its pill', () => {
  const front = SCREEN_MAP.slice(SCREEN_MAP.indexOf('Front row'), SCREEN_MAP.indexOf('Rear row'));
  const rear = SCREEN_MAP.slice(SCREEN_MAP.indexOf('Rear row'));
  for (const angle of ['44°', '46°', '48°', '45°']) {
    assert.ok(front.includes(angle), `front-row seat angle ${angle} shown`);
  }
  for (const angle of ['55°', '58°', '60°', '57°', '56°']) {
    assert.ok(rear.includes(angle), `rear-row seat angle ${angle} shown`);
  }
});

test('the limiting seat / limiting angle block is removed', () => {
  // The seat map already shows every seat's result, so the separate block was
  // clutter: it is gone from the screen page and from the printed page alike.
  for (const [label, text] of [['screen', SCREEN_TEXT], ['print', PRINT_TEXT]]) {
    assert.ok(!text.includes('Limiting seat'), `no limiting-seat block on the ${label} page`);
    assert.ok(!text.includes('Limiting angle'), `no limiting-angle block on the ${label} page`);
  }
  assert.ok(SCREEN_TEXT.includes('P5 Seat Results'), 'the seat result map remains');
  assert.ok(SCREEN_TEXT.includes('Level 2'), 'the final level result card remains');
});

test('the page states the project result, not the RSP result', () => {
  // The card reads the published project floor (L2), not the RSP design-view
  // level (L4) — so the page can never imply P5 is RSP-only.
  assert.ok(SCREEN_TEXT.includes('Level 2'), 'the card states the project level');
  assert.ok(!SCREEN_TEXT.includes('Level 4'), 'the RSP design-view level is not presented as the result');
  assert.ok(SCREEN_TEXT.includes('Assessed across the seating positions'), 'the assessment scope is stated');
  assert.equal(seatResults.level, 'L2', 'the project level comes from the published authority');
});

test('the official RP22 Parameter 5 wording is used', () => {
  assert.equal(getOfficialRp22Title(5), RP22_P5_DESCRIPTION, 'wording comes from the RP22 title authority');
  assert.ok(SCREEN_TEXT.includes(RP22_P5_DESCRIPTION), 'the official description is shown');
  assert.ok(PRINT_TEXT.includes(RP22_P5_DESCRIPTION), 'and on the printed page');
  assert.ok(SCREEN_TEXT.includes('RP22 Parameter 5'), 'the parameter is identified');
  assert.ok(!SCREEN_TEXT.includes('Horizontal speaker spacing'), 'the old shorthand is gone');
});

test('the printed page (PDF) carries the graphic AND the seat map', () => {
  assert.ok(PRINT.includes('<svg'), 'the design-view graphic prints');
  assert.ok(PRINT_TEXT.includes('RSP design view'), 'the design view is labelled in print');
  assert.ok(PRINT_TEXT.includes(DESIGN_VIEW_COPY), 'the copy prints');
  assert.ok(PRINT_TEXT.includes('P5 Seat Results'), 'the seat map prints');
  assert.ok(PRINT_TEXT.includes('60°'), 'the seat angles print beneath their pills');
  assert.ok(PRINT_TEXT.includes('Level 2'), 'the project result prints');
  assert.ok(PRINT_TEXT.includes('Assessed across the seating positions'), 'the scope line prints');
  // The PDF path forwards the seat results into the print page.
  const printPage = fs.readFileSync('src/components/report/client/ClientReportPage.jsx', 'utf8');
  assert.ok(printPage.includes('seatResults={printData.seatResults}'), 'print receives the seat results');
});

test('no P5 calculation: published values pass through unchanged', () => {
  // Levels, angles and counts are exactly what the authority published.
  assert.equal(seatResults.assessedCount, 9);
  assert.equal(seatResults.hasAnyValidResult, true);
  const byId = new Map(seatResults.seats.map((seat) => [seat.id, seat]));
  assert.equal(byId.get('f3').levelLabel, 'L3');
  assert.equal(byId.get('f3').formatted, '48°');
  assert.equal(byId.get('r3').levelLabel, 'L2');
  assert.equal(byId.get('r3').angleDeg, 60);
  assert.equal(byId.get('r6').applicable, false);
  assert.equal(byId.get('r6').levelLabel, null);
  // No grading, measurement or engine work was introduced anywhere in the path.
  for (const file of [
    'src/components/report/client/selectClientP5SeatResults.js',
    'src/components/report/client/P5SeatResultBlock.jsx',
    'src/components/report/client/ClientSoundAroundListener.jsx',
    'src/components/report/client/print/PrintP5Content.jsx',
  ]) {
    const src = fs.readFileSync(file, 'utf8');
    assert.ok(!src.includes('useRP22AnalysisEngine'), `${file} does not mount the RP22 engine`);
    assert.ok(!src.includes('rp22LevelForP5'), `${file} does not re-grade`);
    assert.ok(!src.includes('computeSurroundRingGaps'), `${file} does not recompute gaps`);
  }
});

test('no layout overflow: rows wrap and the pill styling is canonical', () => {
  // Each row of pills wraps rather than overflowing the page width. Inline
  // styles are read from the markup, since the text view strips them.
  // The seat map block sits between the graphic and the result card: it spans
  // the page column and its pill rows wrap rather than overflowing.
  const mapMarkup = SCREEN.slice(SCREEN.indexOf('</svg>'), SCREEN.indexOf(RESULT_CARD_MARKER));
  assert.ok(mapMarkup.includes('flex-wrap:wrap'), 'seat pills wrap within their row');
  assert.ok(mapMarkup.includes('width:100%'), 'the seat map stays inside the page column');
  // Pills keep the one canonical grading treatment — L3 slate, L2 stone.
  assert.ok(SCREEN.includes(RP22_GRADE_TOKENS.L3.bg), 'L3 pills use the canonical fill');
  assert.ok(SCREEN.includes(RP22_GRADE_TOKENS.L3.border), 'L3 pills use the canonical border');
  assert.ok(SCREEN.includes(RP22_GRADE_TOKENS.L2.bg), 'L2 pills use the canonical fill');
  assert.ok(SCREEN.includes(RP22_GRADE_TOKENS.L2.border), 'L2 pills use the canonical border');
});