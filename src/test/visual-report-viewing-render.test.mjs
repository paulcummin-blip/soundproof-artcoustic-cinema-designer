// visual-report-viewing-render.test.mjs
// ---------------------------------------------------------------------------
// Renders the REAL Viewing Experience page (ClientScreenSeating) through
// react-dom/server — both the screen card and the printed page parts — and
// inspects the actual markup the client and the PDF receive.
//
//   TEST 1  The RP23 result block leads with its heading
//   TEST 2  Seat pills are laid out row by row, in seating-plan order
//   TEST 3  Each seat keeps its viewing angle beneath its pill
//   TEST 4  Row labels name the physical rows
//   TEST 5  The interpretation reads the published levels
//   TEST 6  The linear Seat 1…N row is gone
//   TEST 7  Pills use the canonical L1–L4 grading treatment
//   TEST 8  Hierarchy: result, interpretation, then projector output — no level key
//   TEST 9  The printed page keeps the result, the angles and the output
//   TEST 10 A television shows no projector panel, lumens or gain copy
// ---------------------------------------------------------------------------
import { test } from 'vitest';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import ClientScreenSeating from '../components/report/client/ClientScreenSeating.jsx';
import { groupSeatsIntoRows } from '../components/report/client/seatRowGrouping.js';
import { buildViewingInterpretation } from '../components/report/client/viewingResultCopy.js';
import { RP22_GRADE_TOKENS } from '../components/utils/rp22Colors.jsx';

const roomDims = { widthM: 5.2, lengthM: 7.3, heightM: 2.8 };
const rsp = { x: 2.6, y: 4.5 };

// 4 front-row seats at Level 4 (63.5°), 5 rear-row seats at Level 3 (44.4°).
const publishedSeats = [
  { id: 'f1', x: 1.6, y: 3.6, level: 'l4', levelLabel: 'L4', formatted: '63.5°', isPrimary: false },
  { id: 'f2', x: 2.2, y: 3.6, level: 'l4', levelLabel: 'L4', formatted: '63.5°', isPrimary: false },
  { id: 'f3', x: 2.8, y: 3.6, level: 'l4', levelLabel: 'L4', formatted: '63.5°', isPrimary: true },
  { id: 'f4', x: 3.4, y: 3.6, level: 'l4', levelLabel: 'L4', formatted: '63.5°', isPrimary: false },
  { id: 'r1', x: 1.3, y: 5.4, level: 'l3', levelLabel: 'L3', formatted: '44.4°', isPrimary: false },
  { id: 'r2', x: 1.9, y: 5.4, level: 'l3', levelLabel: 'L3', formatted: '44.4°', isPrimary: false },
  { id: 'r3', x: 2.5, y: 5.4, level: 'l3', levelLabel: 'L3', formatted: '44.4°', isPrimary: false },
  { id: 'r4', x: 3.1, y: 5.4, level: 'l3', levelLabel: 'L3', formatted: '44.4°', isPrimary: false },
  { id: 'r5', x: 3.7, y: 5.4, level: 'l3', levelLabel: 'L3', formatted: '44.4°', isPrimary: false },
];

const rows = groupSeatsIntoRows(publishedSeats);
const interpretation = buildViewingInterpretation(rows);

const renderPage = (extra = {}) => renderToStaticMarkup(
  React.createElement(ClientScreenSeating, {
    roomDims,
    seats: publishedSeats,
    rows,
    rsp,
    screenFrontPlaneM: 0.2,
    screenWidthM: 3.2,
    zones: [],
    explanation: interpretation,
    projectorLumens: 2600,
    // A projection screen is the default presentation here; the television case
    // is proved separately below.
    displayType: 'projector_screen',
    ...extra,
  }),
);

const SCREEN = renderPage();
const PRINT_DRAWING = renderPage({ print: true, printPart: 'drawing' });
const PRINT_SUPPORT = renderPage({ print: true, printPart: 'support' });

const textOf = (markup) => markup.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

test('the RP23 result block leads with its heading', () => {
  assert.ok(SCREEN.includes('RP23 Viewing Result'), 'the result block is headed');
  assert.ok(SCREEN.includes('Viewing Experience'), 'the page heading is intact');
  // The block heading appears above the pills, and the pills above the legend.
  const heading = SCREEN.indexOf('RP23 Viewing Result');
  const firstPill = SCREEN.indexOf('L4');
  assert.ok(heading < firstPill, 'heading precedes the seat pills');
});

test('seat pills are laid out row by row, in seating-plan order', () => {
  const text = textOf(SCREEN);
  const front = text.indexOf('Front row');
  const rear = text.indexOf('Rear row');
  assert.ok(front !== -1 && rear !== -1, 'both physical rows are labelled');
  assert.ok(front < rear, 'front row is shown first');

  // Bound the pills to the result region — the level key below the projector
  // card also prints L1–L4 swatch labels and is not part of the seat rows.
  const resultEnd = text.indexOf(interpretation);
  assert.ok(resultEnd > rear, 'the interpretation follows the seat rows');
  const frontBlock = text.slice(front, rear);
  const rearBlock = text.slice(rear, resultEnd);
  assert.equal((frontBlock.match(/\bL4\b/g) || []).length, 4, 'four front-row Level 4 pills');
  assert.equal((rearBlock.match(/\bL3\b/g) || []).length, 5, 'five rear-row Level 3 pills');
});

test('each seat keeps its viewing angle beneath its pill', () => {
  const text = textOf(SCREEN);
  assert.equal((text.match(/63\.5°/g) || []).length, 4, 'front row angles shown');
  assert.equal((text.match(/44\.4°/g) || []).length, 5, 'rear row angles shown');
});

test('the interpretation reads the published levels', () => {
  assert.ok(SCREEN.includes(interpretation), 'the page shows the interpretation');
  assert.match(textOf(SCREEN), /Front row seats achieve Level 4 viewing immersion\./);
  assert.match(textOf(SCREEN), /Rear row seats achieve Level 3 viewing immersion, giving a comfortable wider-room viewing position\./);
});

test('the linear Seat 1…N row is gone', () => {
  assert.ok(!SCREEN.includes('Seat 1'), 'no linear seat numbering remains');
  assert.ok(!/<table/i.test(SCREEN), 'no seat table remains');
});

test('pills use the canonical L1–L4 grading treatment', () => {
  // The pill colours come from the one grading authority — L4 green, L3 slate.
  assert.ok(SCREEN.includes(RP22_GRADE_TOKENS.L4.bg), 'L4 pill uses the canonical fill');
  assert.ok(SCREEN.includes(RP22_GRADE_TOKENS.L4.border), 'L4 pill uses the canonical border');
  assert.ok(SCREEN.includes(RP22_GRADE_TOKENS.L3.bg), 'L3 pill uses the canonical fill');
  assert.ok(SCREEN.includes(RP22_GRADE_TOKENS.L3.border), 'L3 pill uses the canonical border');
});

test('hierarchy: result, interpretation, then projector output — and no level key', () => {
  const heading = SCREEN.indexOf('RP23 Viewing Result');
  const pills = SCREEN.indexOf('Front row');
  const text = SCREEN.indexOf(interpretation);
  const projector = SCREEN.indexOf('Projector Light Output');
  assert.ok(heading < pills && pills < text, 'result then interpretation');
  assert.ok(text < projector, 'projector output sits below the viewing result');

  // The level key is gone. The seat pills state each result on its own, and the
  // page no longer repeats the same grades as a legend beneath them: every level
  // the page prints is a seat result.
  assert.ok(!SCREEN.includes('Below L1'), 'no legend swatch on the page');
  assert.ok(!SCREEN.includes('Level key'), 'no legend block on the page');
  assert.equal(
    (SCREEN.match(/>L[1-4]</g) || []).length,
    publishedSeats.length,
    'exactly one pill per assessed seat — no second row of level pills',
  );
});

test('the printed page keeps the result, the angles and the projector output', () => {
  const supportText = textOf(PRINT_SUPPORT);
  assert.ok(supportText.includes('RP23 Viewing Result'), 'printed result heading');
  assert.ok(supportText.includes('Front row'), 'printed front row');
  assert.ok(supportText.includes('Rear row'), 'printed rear row');
  assert.ok(supportText.includes('63.5°') && supportText.includes('44.4°'), 'printed angles');
  assert.ok(supportText.includes('Projector Light Output'), 'printed projector output');
  assert.ok(supportText.includes('2,600 lumens'), 'printed lumen figure');
  assert.ok(!supportText.includes('Seat 1'), 'no linear seat numbering in print');
  // The interpretation is carried by the printed result region, not duplicated
  // inside the drawing support area.
  assert.ok(!supportText.includes('Front row seats achieve'), 'no duplicate interpretation in print');
  // The drawing part carries the seating plan only.
  assert.ok(PRINT_DRAWING.includes('<svg'), 'printed drawing part renders the plan');
  assert.ok(!textOf(PRINT_DRAWING).includes('RP23 Viewing Result'), 'drawing part carries no result block');
});

test('a television shows no projector panel, lumens or gain copy', () => {
  // The page is handed a projector figure anyway: the canonical display authority
  // refuses it, so a television can never be shown projector-only information.
  const tv = renderPage({ displayType: 'tv' });
  const tvText = textOf(tv);

  assert.ok(!tvText.includes('Projector Light Output'), 'no projector panel');
  assert.ok(!tvText.includes('lumens'), 'no lumen figure');
  assert.ok(!/gain/i.test(tvText), 'no screen-gain copy');
  assert.ok(!/calibrated|calibration/i.test(tvText), 'no projector calibration wording');
  assert.ok(!/projector/i.test(tvText), 'no projector wording at all');

  // The RP23 results and the viewing angles are untouched.
  assert.ok(tv.includes('RP23 Viewing Result'), 'the RP23 result block remains');
  assert.ok(tvText.includes('63.5°') && tvText.includes('44.4°'), 'the viewing angles remain');
  assert.ok(
    tv.includes(RP22_GRADE_TOKENS.L4.border) && tv.includes(RP22_GRADE_TOKENS.L3.border),
    'the seat result pills remain',
  );
  assert.ok(!tvText.includes('Below L1'), 'no legend row on a television page');

  // The display is named as a television, never as a screen.
  assert.ok(tvText.includes('TV'), 'the page names the television');
  assert.ok(!tvText.includes('SCREEN'), 'no screen wording on a television page');

  // The printed page follows the same rule, on both printed parts.
  for (const part of [{ print: true, printPart: 'drawing' }, { print: true, printPart: 'support' }]) {
    const printed = textOf(renderPage({ displayType: 'tv', ...part }));
    assert.ok(!printed.includes('Projector Light Output'), 'printed television page has no projector panel');
    assert.ok(!/lumens|gain/i.test(printed), 'printed television page states no lumens or gain');
  }
});