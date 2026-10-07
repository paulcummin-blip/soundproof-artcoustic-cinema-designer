// seat-dimensions-mode.test.mjs
// ---------------------------------------------------------------------------
// Dimensions mode: ONE seat's three measurements, taken from that seat's own
// listening position — nearest side wall, rear wall, screen plane.
//
//   TEST 1  The three measurements come from the seat itself
//   TEST 2  A different seat measures differently (never the block centre)
//   TEST 3  The plan guide draws that seat's three measurements and nothing else
//   TEST 4  The control offers HUD | Dimensions with exactly one active
//   TEST 5  One shared mode authority, HUD by default
//   TEST 6  The Plan View toolbar carries the control
//   TEST 7  The measurement authority is pure and carries no engineering state
// ---------------------------------------------------------------------------
import { test, afterEach } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { buildSeatWallMeasurements } from '../components/room/rv/utils/seatDimensionInfo.js';
import RvSeatDimensions from '../components/room/rv/render/RvSeatDimensions.jsx';
import SeatInfoModeToggle from '../components/roomdesigner/SeatInfoModeToggle.jsx';
import { getSeatInfoMode, setSeatInfoMode } from '../components/state/seatInfoModeStore.js';

const TOOLBAR_SRC = fs.readFileSync('src/components/roomdesigner/RoomDesignerPlanToolbar.jsx', 'utf8');

// 4.5 m × 6.0 m room, screen plane 0.35 m from the front wall.
const ROOM = { widthM: 4.5, lengthM: 6.0, screenFrontPlaneM: 0.35 };

afterEach(() => setSeatInfoMode('hud'));

test('TEST 1 — the three measurements come from the seat itself', () => {
  const measured = buildSeatWallMeasurements({ id: 'r1s1', x: 0.85, y: 5.5 }, ROOM);

  assert.equal(measured.side, 'left');
  assert.equal(measured.sideDist.toFixed(2), '0.85', 'nearest side wall');
  assert.equal(measured.rearDist.toFixed(2), '0.50', 'rear wall');
  assert.equal(measured.screenDist.toFixed(2), '5.15', 'screen plane');
});

test('TEST 2 — a different seat measures differently (never the block centre)', () => {
  const left = buildSeatWallMeasurements({ id: 'a', x: 0.7, y: 4.4 }, ROOM);
  const right = buildSeatWallMeasurements({ id: 'b', x: 3.8, y: 5.6 }, ROOM);

  assert.equal(right.side, 'right');
  assert.equal(right.sideDist.toFixed(2), '0.70');
  assert.notEqual(left.sideDist, right.sideDist);
  assert.notEqual(left.rearDist, right.rearDist);
  assert.notEqual(left.screenDist, right.screenDist);
});

test('TEST 3 — the plan guide draws that seat three measurements, only when selected', () => {
  const seat = { id: 'r2s1', x: 0.85, y: 5.5 };
  const markup = renderToStaticMarkup(React.createElement(RvSeatDimensions, {
    dimensions: buildSeatWallMeasurements(seat, ROOM),
    meterToCanvasX: (x) => x * 100,
    meterToCanvasY: (y) => y * 100,
    svgW: 500,
    svgH: 700,
  }));

  assert.match(markup, /data-layer="seat-dimensions"/);
  assert.match(markup, /Side wall 0\.85 m/);
  assert.match(markup, /Rear wall 0\.50 m/);
  assert.match(markup, /Screen 5\.15 m/);
  assert.match(markup, /pointer-events="none"/, 'the guides never capture seat interaction');
  assert.equal((markup.match(/<line/g) || []).length, 7, 'three leaders and their wall ticks');

  const empty = renderToStaticMarkup(React.createElement(RvSeatDimensions, {
    dimensions: null,
    meterToCanvasX: (x) => x,
    meterToCanvasY: (y) => y,
  }));
  assert.equal(empty, '', 'with nothing selected the plan shows no dimensions');
});

test('TEST 4 — the control offers HUD and Dimensions with exactly one active', () => {
  const hud = renderToStaticMarkup(React.createElement(SeatInfoModeToggle, { value: 'hud', onChange: () => {} }));
  assert.match(hud, /aria-label="Seat click mode"/);
  assert.match(hud, />HUD</);
  assert.match(hud, />Dimensions</);
  assert.equal((hud.match(/aria-pressed="true"/g) || []).length, 1, 'only one mode can be active');

  const dimensions = renderToStaticMarkup(React.createElement(SeatInfoModeToggle, { value: 'dimensions', onChange: () => {} }));
  assert.equal((dimensions.match(/aria-pressed="true"/g) || []).length, 1);
  assert.match(dimensions, /aria-pressed="true"[^>]*>Dimensions</);
});

test('TEST 5 — one shared mode authority, HUD by default', () => {
  assert.equal(getSeatInfoMode(), 'hud', 'the plan opens in HUD mode');

  setSeatInfoMode('dimensions');
  assert.equal(getSeatInfoMode(), 'dimensions');

  setSeatInfoMode('somethingElse');
  assert.equal(getSeatInfoMode(), 'hud', 'an unknown mode falls back to HUD');
});

test('TEST 6 — the Plan View toolbar carries the control', () => {
  assert.match(TOOLBAR_SRC, /import SeatInfoModeToggle from "@\/components\/roomdesigner\/SeatInfoModeToggle"/);
  assert.match(TOOLBAR_SRC, /<SeatInfoModeToggle value=\{seatInfoMode\} onChange=\{persistSeatInfoMode\} \/>/);
  assert.match(TOOLBAR_SRC, /subscribeSeatInfoMode/, 'the toolbar reads the one shared mode');
});

test('TEST 7 — the measurement authority is pure and carries no engineering state', () => {
  const seat = { id: 'r1s1', x: 1.1, y: 3.2 };

  assert.deepEqual(buildSeatWallMeasurements(seat, ROOM), buildSeatWallMeasurements(seat, ROOM));
  assert.deepEqual(
    Object.keys(buildSeatWallMeasurements(seat, ROOM)).sort(),
    ['lengthM', 'rearDist', 'screenDist', 'screenPlaneM', 'side', 'sideDist', 'visible', 'widthM', 'x', 'y'],
    'geometry only: no seating priority, RSP or RP22 input is involved'
  );
});