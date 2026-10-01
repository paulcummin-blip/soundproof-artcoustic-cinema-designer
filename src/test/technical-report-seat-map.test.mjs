// technical-report-seat-map.test.mjs
// ---------------------------------------------------------------------------
// ACCEPTANCE — seat-scoped results in the Technical Report are shown as a
// seat-layout result map, not as a linear "Row 1 - Seat 3 | 2.29m | L4" table.
//
//   TEST 1  The linear seat table is gone, the map is used (screen and print)
//   TEST 2  Values and levels are preserved, one band per seating row
//   TEST 3  Seats sit in physical order, not seat-id order
//   TEST 4  Primary seats carry the heavier outline, secondary the lighter
//   TEST 5  No seat identifier label and no per-seat "RSP" suffix
//   TEST 6  P19 is never presented as a per-seat map
//
// The fixture is the live published shape of the current project's P1 seat rows.
// ---------------------------------------------------------------------------
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import SeatResultMap from '../components/report/SeatResultMap.jsx';
import TechnicalSeatGrid from '../components/report/technical/TechnicalSeatGrid.jsx';
import { isSeatScopedParameterKey } from '../components/utils/rp22ParameterPresentation.js';

const TILE_SOURCE = fs.readFileSync(
  path.resolve('src/components/rp22/RP22ComplianceParameterTile.jsx'),
  'utf8',
);
const GRID_SOURCE = fs.readFileSync(
  path.resolve('src/components/report/RP22ReportParameterGrid.jsx'),
  'utf8',
);

// The published P1 row authority for this project, exactly as stored: the row
// seats arrive in descending seat-column order, and each carries its room x.
const ROWS = [
  {
    row: 1,
    seats: [
      { id: 'seat-r1-c4', indexInRow: 4, level: 'L4', value: '1.69m', isPrimary: false, priority: 'secondary', x: 3.49 },
      { id: 'seat-r1-c3', indexInRow: 3, level: 'L4', value: '2.29m', isPrimary: false, priority: 'primary', x: 2.89 },
      { id: 'seat-r1-c2', indexInRow: 2, level: 'L4', value: '2.29m', isPrimary: true, priority: 'primary', x: 2.29 },
      { id: 'seat-r1-c1', indexInRow: 1, level: 'L4', value: '1.69m', isPrimary: false, priority: 'secondary', x: 1.69 },
    ],
  },
  {
    row: 2,
    seats: [
      { id: 'seat-r2-c5', indexInRow: 5, level: 'L3', value: '1.39m', isPrimary: false, priority: 'secondary', x: 3.79 },
      { id: 'seat-r2-c3', indexInRow: 3, level: 'L4', value: '1.71m', isPrimary: false, priority: 'primary', x: 2.59 },
      { id: 'seat-r2-c1', indexInRow: 1, level: 'L3', value: '1.39m', isPrimary: false, priority: 'secondary', x: 1.39 },
    ],
  },
];

const markup = renderToStaticMarkup(React.createElement(SeatResultMap, { rows: ROWS }));
const textOf = (html) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const TEXT = textOf(markup);
const countOf = (haystack, needle) => haystack.split(needle).length - 1;

test('TEST 1 — the linear seat table is gone and the map is used', () => {
  assert.ok(!TILE_SOURCE.includes('<table'), 'the tile no longer renders a linear seat table');
  assert.ok(!TILE_SOURCE.includes('>Seat<'), 'the "Seat" column heading is gone');
  assert.ok(TILE_SOURCE.includes('<SeatResultMap rows={seatGridData} />'), 'the tile renders the seat-layout map');
  assert.ok(!TILE_SOURCE.includes('(RSP)'), 'primary seats are no longer suffixed "(RSP)" in the seat rows');

  // Print shares the one map implementation.
  const printMarkup = renderToStaticMarkup(React.createElement(TechnicalSeatGrid, { data: ROWS }));
  assert.ok(printMarkup.includes('Row 1'), 'the print variant renders the same map');
  assert.ok(!printMarkup.includes('<table'), 'the print variant is not a table');
});

test('TEST 2 — every result is preserved, one band per seating row', () => {
  assert.ok(TEXT.includes('Row 1'), 'the front row band is present');
  assert.ok(TEXT.includes('Row 2'), 'the rear row band is present');
  assert.equal(countOf(TEXT, '1.69m'), 2, 'both front-row outer seats state 1.69m');
  assert.equal(countOf(TEXT, '2.29m'), 2, 'both front-row inner seats state 2.29m');
  assert.equal(countOf(TEXT, '1.71m'), 1, 'the rear centre seat states 1.71m');
  assert.equal(countOf(TEXT, '1.39m'), 2, 'both rear outer seats state 1.39m');
  assert.ok(TEXT.includes('L4'), 'the L4 pills are still drawn');
  assert.ok(TEXT.includes('L3'), 'the L3 pills are still drawn');
});

test('TEST 3 — seats are laid out in their physical order', () => {
  // Purpose-built ordering fixture: the authority delivers the seats in reverse,
  // the map must present them left to right by room x.
  const reversed = [
    {
      row: 1,
      seats: [
        { id: 'c', level: 'L4', value: 'RIGHT', isPrimary: false, x: 3.0 },
        { id: 'b', level: 'L4', value: 'CENTRE', isPrimary: false, x: 2.0 },
        { id: 'a', level: 'L4', value: 'LEFT', isPrimary: false, x: 1.0 },
      ],
    },
  ];
  const order = textOf(renderToStaticMarkup(React.createElement(SeatResultMap, { rows: reversed })));
  assert.ok(
    order.indexOf('LEFT') < order.indexOf('CENTRE') && order.indexOf('CENTRE') < order.indexOf('RIGHT'),
    'seats are presented left to right, not in the order the authority delivered them',
  );
  // Without positions, seat column order is the fallback — still left to right.
  const noPositions = [
    {
      row: 1,
      seats: [
        { id: 'c', indexInRow: 3, level: 'L4', value: 'RIGHT', isPrimary: false, x: null },
        { id: 'a', indexInRow: 1, level: 'L4', value: 'LEFT', isPrimary: false, x: null },
      ],
    },
  ];
  const fallbackOrder = textOf(renderToStaticMarkup(React.createElement(SeatResultMap, { rows: noPositions })));
  assert.ok(fallbackOrder.indexOf('LEFT') < fallbackOrder.indexOf('RIGHT'), 'column order is the fallback');
});

test('TEST 4 — primary seats carry the heavier outline', () => {
  assert.equal(countOf(markup, 'border-width:2px'), 2, 'both primary seats carry a 2px outline');
  assert.equal(countOf(markup, 'border-width:1px'), 5, 'the five secondary seats carry a lighter outline');
});

test('TEST 5 — no seat identifier label and no per-seat RSP suffix', () => {
  assert.ok(!TEXT.includes('Seat 2'), 'no "Seat N" identifier is printed');
  assert.ok(!TEXT.includes('RSP'), 'no seat is labelled RSP in the map');
  assert.ok(!/S\d/.test(TEXT), 'no seat-number label is printed above the pills');
  assert.ok(!TEXT.includes('Seat'), 'the word "Seat" never appears in the map');
});

test('TEST 6 — P19 is never shown as a per-seat map', () => {
  // The scope authority decides, not a parameter number: the grid builds a
  // seat-layout map only for seat-scoped parameters, and P19 is RSP-scoped.
  assert.ok(
    GRID_SOURCE.includes('buildSeatGridData'),
    'the grid still builds the seat-layout map',
  );
  assert.ok(
    /param\?\.scope|param\.scope/.test(GRID_SOURCE),
    'the grid reads the presentation scope, not a parameter number',
  );
  assert.ok(
    !GRID_SOURCE.includes('!== 19'),
    'P19 is no longer special-cased by number anywhere in the grid',
  );
  assert.equal(isSeatScopedParameterKey('p19'), false, 'P19 is RSP-scoped, never seat-scoped');
  assert.equal(isSeatScopedParameterKey('p20'), true, 'P20 stays the seat parameter');
});