// p7-app-geometry-parity.test.mjs
// ---------------------------------------------------------------------------
// ACCEPTANCE — the Visual Report P7 page draws the APP's OWN front-wide geometry.
//
// There is exactly one front-wide placement authority: computeFrontWideZonesStrict
// (src/components/utils/frontWideZones.jsx). The Room Designer's plan draws it, the
// analysis engine grades P7 against it, and this report now resolves the ideal
// median position by calling that same function. The report therefore carries no
// second, report-only geometry path: it never projects an angle of its own.
//
//   TEST 1  The app's own geometry          (authority parity, and the drawn point)
//   TEST 2  Actual / ideal not reversed      (live fixture)
//   TEST 3  Left / right not swapped         (live fixture)
//   TEST 4  Published deviation preserved    (card + drawing, verbatim)
//   TEST 5  Report matches the Room Designer (one implementation, no projection)
//   TEST 6  Old snapshot fallback safe       (absent inputs, no invented marker)
//
// The fixture is the live published shape of "Marquee Home": real room, real
// speaker coordinates, real canonical RSP, real published P7 result.
// ---------------------------------------------------------------------------
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import ClientP7FrontWides from '../components/report/client/ClientP7FrontWides.jsx';
import { selectClientP7FrontWides } from '../components/report/client/selectClientP7FrontWides.js';
import { computeFrontWideZonesStrict } from '../components/utils/frontWideZones.jsx';
import { getModelDimsM } from '../components/roomdesigner/utils/getModelDimsM.jsx';

const COMPONENT_PATH = path.resolve('src/components/report/client/ClientP7FrontWides.jsx');
const SELECTOR_PATH = path.resolve('src/components/report/client/selectClientP7FrontWides.js');
const RV_HOOK_PATH = path.resolve('src/components/room/rv/hooks/useFrontWideZonesComputed.jsx');
const RV_SHIM_PATH = path.resolve('src/components/room/utils/frontWideZones.jsx');
const componentSource = fs.readFileSync(COMPONENT_PATH, 'utf8');
const selectorSource = fs.readFileSync(SELECTOR_PATH, 'utf8');

// ── The live published fixture (Marquee Home) ───────────────────────────────
const ROOM = { widthM: 5.18, lengthM: 7.29, heightM: 2.8 };
// Canonical RSP: rsp_mode manual_position, centreline X — the same green dot the
// Room Designer draws, and the origin the engine measures the result from.
const RSP = { x: 2.59, y: 4.636746034861809 };
const PLACED = [
  { role: 'FL', model: 'q6-3', position: { x: 0.5943551088777212, y: 0.11594822653957142 } },
  { role: 'FR', model: 'q6-3', position: { x: 4.5856448911222785, y: 0.11594822653957142 } },
  { role: 'SL', model: 'evolve-2-1', position: { x: 0.05100000000000001, y: 4.7765326633165825 } },
  { role: 'SR', model: 'evolve-2-1', position: { x: 5.129, y: 4.7765326633165825 } },
  { role: 'LW', model: 'evolve-2-1', position: { x: 0.05100000000000001, y: 2.659413735343385 } },
  { role: 'RW', model: 'evolve-2-1', position: { x: 5.129, y: 2.6594137353433838 } },
];
// The published engineering summary exactly as stored for this project.
const SUMMARY = {
  roomResultsByParameter: {
    7: { status: 'scored', level: 'L2', value: 6.1, unit: 'deg (±)' },
  },
};

const selected = selectClientP7FrontWides(SUMMARY, PLACED, RSP, null, ROOM);

const baseProps = {
  p7Data: selected,
  roomDims: ROOM,
  screenFrontPlaneM: 0.29,
  screenWidthM: 2.657,
};
const SCREEN = renderToStaticMarkup(React.createElement(ClientP7FrontWides, baseProps));
const textOf = (markup) => markup.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const countOf = (haystack, needle) => haystack.split(needle).length - 1;
const drawingOf = (markup) => {
  const svg = markup.slice(markup.indexOf('<svg'), markup.indexOf('</svg>'));
  return svg.slice(svg.indexOf('>') + 1);
};
const DRAWING = drawingOf(SCREEN);

function parseMarkers(drawing) {
  const actual = [...drawing.matchAll(/<circle cx="([\d.-]+)" cy="([\d.-]+)" r="7"/g)]
    .map((match) => ({ x: Number(match[1]), y: Number(match[2]) }));
  const ideal = [...drawing.matchAll(/<rect x="([\d.-]+)" y="([\d.-]+)" width="9" height="9"/g)]
    .map((match) => ({ x: Number(match[1]) + 4.5, y: Number(match[2]) + 4.5 }));
  return { actual, ideal };
}

// The plan's one room-to-drawing transform, recomputed exactly as the page does.
const PADDING_M = 0.6;
const SVG_W = 760;
const SCALE = SVG_W / (ROOM.widthM + PADDING_M * 2);
const toPx = (point) => ({ x: (point.x + PADDING_M) * SCALE, y: (point.y + PADDING_M) * SCALE });
const ROOM_LEFT_PX = PADDING_M * SCALE;
const ROOM_RIGHT_PX = (ROOM.widthM + PADDING_M) * SCALE;
const ROOM_TOP_PX = PADDING_M * SCALE;
const ROOM_BOTTOM_PX = (ROOM.lengthM + PADDING_M) * SCALE;
const near = (a, b, tolerance = 0.5) => Math.abs(a - b) <= tolerance;
const positionOf = (role) => PLACED.find((speaker) => speaker.role === role).position;

// What the app itself resolves for this room — the expected geometry, computed by
// calling the authority directly, exactly as the Room Designer does.
const APP_ZONES = computeFrontWideZonesStrict({
  mlpPoint: RSP,
  dimensions: { width: ROOM.widthM, length: ROOM.lengthM },
  placedSpeakers: PLACED,
  getModelDimsM,
});

test('TEST 1 — the ideal marker uses the app geometry authority', () => {
  assert.equal(APP_ZONES.status, 'ok', 'the authority resolves this room');
  assert.equal(selected.idealSource, 'app_front_wide_zones', 'the ideal position comes from the authority');
  assert.deepEqual(
    selected.idealPoints,
    {
      LW: { x: APP_ZONES.left.xWall, y: APP_ZONES.left.medianY },
      RW: { x: APP_ZONES.right.xWall, y: APP_ZONES.right.medianY },
    },
    'the selector returns exactly the authority geometry — nothing is projected',
  );

  const { actual, ideal } = parseMarkers(DRAWING);
  assert.equal(actual.length, 2, 'both installed wides are drawn');
  assert.equal(ideal.length, 2, 'both ideal median positions are drawn');
  for (const [index, side] of ['LW', 'RW'].entries()) {
    const expected = toPx(selected.idealPoints[side]);
    assert.ok(
      near(ideal[index].x, expected.x) && near(ideal[index].y, expected.y),
      `${side} ideal marker is drawn at the app's own median position`,
    );
    const expectedActual = toPx(positionOf(side));
    assert.ok(
      near(actual[index].x, expectedActual.x) && near(actual[index].y, expectedActual.y),
      `${side} actual marker is drawn where the project puts it`,
    );
  }
});

test('TEST 2 — actual and ideal are never reversed', () => {
  const { actual, ideal } = parseMarkers(DRAWING);
  // Forward (towards the screen) is up in the plan. Both ideal medians sit forward
  // of their installed wide in this design, so a reversal is exactly this failing.
  assert.ok(ideal[0].y < actual[0].y, 'the left ideal is drawn forward of the installed LW');
  assert.ok(ideal[1].y < actual[1].y, 'the right ideal is drawn forward of the installed RW');
  // …and by the app's own distance, read from the authority itself.
  const drawnGapM = (actual[0].y - ideal[0].y) / SCALE;
  const appGapM = positionOf('LW').y - APP_ZONES.left.medianY;
  assert.ok(appGapM > 0, 'the app puts the ideal median forward of the installed LW');
  assert.ok(near(drawnGapM, appGapM, 0.02), `the drawn gap is the app's gap (${appGapM.toFixed(3)} m)`);
  // The published figure is the only deviation the page states.
  assert.equal(countOf(DRAWING, '>6.1° deviation<'), 1, 'the drawn deviation is the published one');
  assert.equal(countOf(textOf(SCREEN), '3.8'), 0, 'no stale per-side figure is printed');
});

test('TEST 3 — left and right are never swapped', () => {
  const { actual, ideal } = parseMarkers(DRAWING);
  // Each ideal stays on its own wall: the left ideal on the left wall, the right on
  // the right. A mirrored plan would cross these two over.
  assert.ok(ideal[0].x < actual[0].x, 'the LW ideal is on the left wall, outside the installed LW');
  assert.ok(ideal[1].x > actual[1].x, 'the RW ideal is on the right wall, outside the installed RW');
  assert.ok(ideal[0].x < ideal[1].x, 'left stays left of right');
  assert.ok(near(ideal[0].x - ROOM_LEFT_PX, 0.01 * SCALE), 'the left ideal sits on the left wall plane');
  assert.ok(near(ROOM_RIGHT_PX - ideal[1].x, 0.01 * SCALE), 'the right ideal sits on the right wall plane');
  // Symmetry: a centreline RSP mirrors the two sides exactly, so neither side may
  // be treated differently.
  assert.ok(
    near(actual[0].y - ideal[0].y, actual[1].y - ideal[1].y, 0.5),
    'both sides show the same forward distance',
  );
  for (const marker of [...actual, ...ideal]) {
    assert.ok(
      marker.x > ROOM_LEFT_PX && marker.x < ROOM_RIGHT_PX
        && marker.y > ROOM_TOP_PX && marker.y < ROOM_BOTTOM_PX,
      'every marker is inside the room',
    );
  }
  assert.equal(countOf(DRAWING, '>Ideal<'), 2, 'one ideal label per side');
});

test('TEST 4 — the published deviation and level are preserved verbatim', () => {
  assert.equal(selected.level, 'L2', 'the published level is passed through');
  assert.equal(selected.maxDeviation, 6.1, 'the published maximum deviation is passed through');
  const text = textOf(SCREEN);
  assert.ok(text.includes('Level 2'), 'the card still states the published level');
  assert.ok(text.includes('Maximum deviation from median: 6.1°'), 'the card still states the published figure');
  assert.ok(
    text.includes('Wide speakers maximum allowable horizontal deviation from median angle'),
    'the official RP22 wording is untouched',
  );
  // A summary with no published value must never become a drawn figure.
  const noValue = selectClientP7FrontWides(
    { roomResultsByParameter: { 7: { status: 'scored', level: 'L2' } } }, PLACED, RSP, null, ROOM,
  );
  assert.equal(noValue.maxDeviation, null, 'a missing published value stays absent');
});

test('TEST 5 — the report draws the Room Designer geometry from one implementation', () => {
  const reportSource = fs.readFileSync(path.resolve('src/pages/RP22ClientReport.jsx'), 'utf8');
  assert.ok(
    reportSource.includes('selectClientP7FrontWides(engineeringSummary, placedSpeakers, rsp, analysisResult, roomDims)'),
    'the report page supplies room dimensions, otherwise both ideal markers disappear',
  );
  assert.ok(
    reportSource.includes('[hydrating, engineeringSummary, placedSpeakers, rsp, analysisResult, roomDims]'),
    'the report refreshes the ideal geometry when room dimensions change',
  );
  const rvHookSource = fs.readFileSync(RV_HOOK_PATH, 'utf8');
  const shimSource = fs.readFileSync(RV_SHIM_PATH, 'utf8');
  assert.ok(rvHookSource.includes('computeFrontWideZonesStrict'), 'the Room Designer draws the authority');
  assert.ok(
    shimSource.includes('export { computeFrontWideZonesStrict } from "@/components/utils/frontWideZones"'),
    'the Room Designer resolves to the one implementation',
  );
  assert.ok(
    selectorSource.includes('import { computeFrontWideZonesStrict } from "@/components/utils/frontWideZones"'),
    'the report resolves to that same implementation',
  );
  // Same inputs, same points — which is what "matches the Room Designer" means.
  const again = computeFrontWideZonesStrict({
    mlpPoint: RSP,
    dimensions: { width: ROOM.widthM, length: ROOM.lengthM },
    placedSpeakers: PLACED,
    getModelDimsM,
  });
  assert.deepEqual(
    selected.idealPoints,
    { LW: { x: again.left.xWall, y: again.left.medianY }, RW: { x: again.right.xWall, y: again.right.medianY } },
    'identical inputs produce identical geometry on both screens',
  );
  // No projecting, no angle trigonometry, no second path in the report.
  for (const banned of ['projectToWall', 'toPlanTheta', 'atan2', 'Math.cos', 'Math.tan']) {
    assert.ok(!componentSource.includes(banned), `the drawing no longer contains ${banned}`);
    assert.ok(!selectorSource.includes(banned), `the selector no longer contains ${banned}`);
  }
  assert.ok(componentSource.includes('idealPoints[side.key]'), 'the drawing marks the resolved point directly');
});

test('TEST 6 — an old or incomplete snapshot stays safe', () => {
  // (a) Surrounds absent: the authority cannot resolve, so no ideal marker is drawn
  // — and the page never invents one, crashes, or loses the published result.
  const noSurrounds = PLACED.filter((speaker) => !['SL', 'SR'].includes(speaker.role));
  const partial = selectClientP7FrontWides(SUMMARY, noSurrounds, RSP, null, ROOM);
  assert.equal(partial.idealPoints, null, 'no ideal position is invented without the surrounds');
  const partialMarkup = renderToStaticMarkup(
    React.createElement(ClientP7FrontWides, { ...baseProps, p7Data: partial }),
  );
  const partialMarkers = parseMarkers(drawingOf(partialMarkup));
  assert.equal(partialMarkers.ideal.length, 0, 'no ideal marker is drawn');
  assert.equal(partialMarkers.actual.length, 2, 'the installed wides are still drawn');
  assert.ok(
    textOf(partialMarkup).includes('Maximum deviation from median: 6.1°'),
    'the published result still stands',
  );
  assert.ok(
    !textOf(partialMarkup).includes('Front wide ideal'),
    'the legend does not explain an undrawn marker',
  );

  // (b) Room dimensions absent (older snapshot payload): same safe outcome.
  const noDims = selectClientP7FrontWides(SUMMARY, PLACED, RSP, null, null);
  assert.equal(noDims.idealPoints, null, 'no geometry is guessed without dimensions');
  assert.equal(noDims.level, 'L2', 'the published result is unaffected');

  // (c) The stored snapshot shape of this project — p7Details present, no per-side
  // angles in the summary — still draws the app geometry and the published figure.
  const stored = {
    p7Details: {
      LW: { deviation: 3.816575695460946, targetAngle: 250.00233625919896, actualAngle: 246.1857605637382 },
      RW: { deviation: 3.816575695460754, targetAngle: 109.99766374080104, actualAngle: 113.8142394362618 },
    },
  };
  const storedSelected = selectClientP7FrontWides(SUMMARY, PLACED, RSP, stored, ROOM);
  assert.deepEqual(
    storedSelected.idealPoints,
    selected.idealPoints,
    'the drawn geometry does not depend on the snapshot payload',
  );
  const storedMarkup = renderToStaticMarkup(
    React.createElement(ClientP7FrontWides, { ...baseProps, p7Data: storedSelected }),
  );
  assert.equal(countOf(drawingOf(storedMarkup), '>Ideal<'), 2, 'both ideal markers are drawn');
  assert.ok(
    textOf(storedMarkup).includes('Maximum deviation from median: 6.1°'),
    'the published figure is preserved',
  );
});