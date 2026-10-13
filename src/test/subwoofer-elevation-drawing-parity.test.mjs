/**
 * subwoofer-elevation-drawing-parity.test.mjs
 * -------------------------------------------
 * The forensic check for "the same cinema shows different subwoofer heights in
 * different drawings".
 *
 * ONE DESIGN, ONE SET OF COORDINATES. A front subwoofer installed behind the
 * screen with its cabinet bottom at 350 mm AFF must be drawn 350 mm AFF by every
 * drawing that shows it — the front elevation, the left/right elevations and the
 * Screen Wall Construction Detail — and a floor-standing subwoofer must stay on
 * the floor.
 *
 * The test renders the REAL drawing components and measures the rendered SVG:
 * each subwoofer rectangle is read out of the markup and converted back into
 * metres above finished floor through the same geometry the drawing uses.
 *
 * Two data shapes are compared, because that is what the two callers really pass:
 *
 *   A. ROOM DESIGNER — `bassInputAdapter(subwooferInstances)`. Every item carries
 *      the derived centre height at position.z AND the stored bottomHeightM.
 *
 *   B. REPORT (published/frozen publication) — the stored instance as it is
 *      published: id, model, enabled, position {x, y}, bottomHeightM. There is
 *      NO position.z: the project schema stores cabinet BOTTOM height only, and
 *      centreZ is derived at each boundary.
 *
 * Shape B is run twice, with bottomHeightM as a number and as the string a
 * JSON-round-tripped record can carry, because a strict `Number.isFinite` guard
 * rejects "0.35" while `Number("0.35")` accepts it.
 *
 * Drawing code is never modified by this file.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import FrontElevation from '../components/room/FrontElevation.jsx';
import SideElevation from '../components/room/SideElevation.jsx';
import ScreenWallConstructionGraphic from '../components/report/ScreenWallConstructionGraphic.jsx';
import { bassInputAdapter } from '../components/utils/subwooferInstanceMigration.js';
import { getSpeakerModelMeta } from '../components/models/speakers/registry.jsx';

// ── The design ────────────────────────────────────────────────────────────────
// Jooced-like: two front subwoofers installed behind the screen, cabinets
// elevated 350 mm above finished floor.
const ROOM = { widthM: 5.2, lengthM: 7.4, heightM: 2.7 };
const ELEVATED_BOTTOM_M = 0.35;
const FLOOR_BOTTOM_M = 0.05;

const installedInstances = (bottomHeightM) => ([
  {
    id: 'sub-front-1', model: 'SUB3-12', enabled: true,
    position: { x: 1.1, y: 0.14 }, bottomHeightM,
    rotationDeg: 0, positionSource: 'user', legacyGroup: 'front', symmetryLinkId: null,
    gainDb: 0, delayMs: 0, polarity: 1, phaseControlDeg: 0,
  },
  {
    id: 'sub-front-2', model: 'SUB3-12', enabled: true,
    position: { x: 4.1, y: 0.14 }, bottomHeightM,
    rotationDeg: 0, positionSource: 'user', legacyGroup: 'front', symmetryLinkId: null,
    gainDb: 0, delayMs: 0, polarity: 1, phaseControlDeg: 0,
  },
]);

/** Shape B — the stored instance exactly as the publication carries it. */
const publishedFrontSubs = (bottomHeightM) => installedInstances(bottomHeightM)
  .map((s) => ({ ...s, group: s.legacyGroup, position: { ...s.position } }));

/** Shape A — the Room Designer's rendering adapter. */
const adapterFrontSubs = (bottomHeightM) => bassInputAdapter(installedInstances(bottomHeightM), {
  frontOrientation: 'horizontal', rearOrientation: 'horizontal',
}).filter((s) => s.group === 'front');

const cabinetHeightM = Number(getSpeakerModelMeta('SUB3-12', 'horizontal')?.heightM);

// ── Reading the rendered drawings ─────────────────────────────────────────────

function rectsWith(markup, matches) {
  const out = [];
  const re = /<rect\b([^>]*)\/?>/g;
  let m;
  while ((m = re.exec(markup)) !== null) {
    const attrs = m[1];
    if (!matches(attrs)) continue;
    const read = (name) => Number((attrs.match(new RegExp(`${name}="([^"]*)"`)) || [])[1]);
    out.push({ x: read('x'), y: read('y'), width: read('width'), height: read('height') });
  }
  return out;
}

/** Front/side elevation subs are the white cabinets stroked in #4A4540. */
const subwooferRects = (markup, strokeWidth) => rectsWith(markup,
  (a) => /fill="#fff"/.test(a) && /stroke="#4A4540"/.test(a) && a.includes(`stroke-width="${strokeWidth}"`));

/**
 * Front/side elevation geometry, exactly as the components compute it.
 * y = offsetY + drawH - (z / roomH) * drawH, so the cabinet BOTTOM is the
 * rectangle's lower edge.
 */
function elevationBottomAFF(rects, spanM) {
  const SVG_W = 640, PADDING = 36, LABEL_TOP = 56, LABEL_LEFT = 36;
  const drawW = SVG_W - PADDING * 2 - LABEL_LEFT;
  const drawH = Math.round(drawW * (ROOM.heightM / spanM));
  const offsetY = PADDING + LABEL_TOP;
  return rects.map((r) => ((offsetY + drawH - (r.y + r.height)) / drawH) * ROOM.heightM);
}

/** Screen Wall Construction Detail subs: black-stroked cabinets on the wall. */
function constructionSubRects(markup) {
  const drawArea = { x: 40, y: 200, width: 500, height: 380 };
  const scale = Math.min(drawArea.width / ROOM.widthM, drawArea.height / ROOM.heightM);
  // The overall screen outline is drawn in the same stroke; a subwoofer cabinet
  // is a small rectangle, never a screen-width one.
  return rectsWith(markup, (a) => /stroke-width="1.1"/.test(a) && /stroke="#111111"/.test(a))
    .filter((r) => r.width < (ROOM.widthM * scale) / 2);
}

/** Screen wall construction detail geometry, exactly as the component computes it. */
function constructionBottomAFF(rects) {
  const drawArea = { x: 40, y: 200, width: 500, height: 380 };
  const scale = Math.min(drawArea.width / ROOM.widthM, drawArea.height / ROOM.heightM);
  const wallPxH = ROOM.heightM * scale;
  const wallY = drawArea.y + (drawArea.height - wallPxH) / 2;
  return rects.map((r) => (wallY + wallPxH - (r.y + r.height)) / scale);
}

const close = (a, b) => Math.abs(a - b) < 0.02;

// ── Renderers ────────────────────────────────────────────────────────────────

function renderFrontElevation(frontSubs) {
  const markup = renderToStaticMarkup(React.createElement(FrontElevation, {
    dimensions: ROOM,
    screen: { heightFromFloorM: 0.5, viewableWidthM: 4.0, viewableHeightM: 2.2, borderThicknessM: 0.05 },
    placedSpeakers: [],
    frontSubs,
    frontSubsCfg: { orientation: 'horizontal', bottomHeightM: frontSubs?.[0]?.bottomHeightM ?? null },
    roomElements: [],
  }));
  return elevationBottomAFF(subwooferRects(markup, 1.2), ROOM.widthM);
}

function renderSideElevation(frontSubs) {
  const markup = renderToStaticMarkup(React.createElement(SideElevation, {
    dimensions: { lengthM: ROOM.lengthM, heightM: ROOM.heightM },
    screen: { heightFromFloorM: 0.5, viewableWidthM: 4.0, viewableHeightM: 2.2, borderThicknessM: 0.05 },
    seatingPositions: [], mlpPoint: null, roomElements: [], placedSpeakers: [],
    frontSubs,
    frontSubsCfg: { orientation: 'horizontal', bottomHeightM: frontSubs?.[0]?.bottomHeightM ?? null },
    rearSubs: [], rearSubsCfg: null,
    wall: 'right',
  }));
  return elevationBottomAFF(subwooferRects(markup, 0.9), ROOM.lengthM);
}

function renderConstructionDetail(frontSubs) {
  const markup = renderToStaticMarkup(React.createElement(ScreenWallConstructionGraphic, {
    showHeader: false,
    roomWidthM: ROOM.widthM, roomHeightM: ROOM.heightM,
    screenWidthM: 4.0, screenHeightM: 2.2, screenTotalWidthM: 4.1, screenTotalHeightM: 2.3,
    screenBottomHeightM: 0.5, screenTopHeightM: 2.7, screenFrontPlaneM: 0.2,
    placedSpeakers: [], frontSubs,
    frontSubsCfg: { orientation: 'horizontal', bottomHeightM: frontSubs?.[0]?.bottomHeightM ?? null },
    primarySeatingPosition: null, lcrAimMode: 'flat', speakerClearanceM: 0.02,
  }));
  return constructionBottomAFF(constructionSubRects(markup));
}

// ── The tests ────────────────────────────────────────────────────────────────

test('every drawing agrees on the height of an ELEVATED front subwoofer — Room Designer data shape', () => {
  const subs = adapterFrontSubs(ELEVATED_BOTTOM_M);
  const expected = ELEVATED_BOTTOM_M;
  const results = {
    front: renderFrontElevation(subs),
    side: renderSideElevation(subs),
    construction: renderConstructionDetail(subs),
  };
  console.log('[ADAPTER SHAPE]', JSON.stringify(results, null, 2));
  for (const [drawing, bottoms] of Object.entries(results)) {
    assert.equal(bottoms.length, 2, `${drawing} drew both front subwoofers`);
    bottoms.forEach((b) => assert.ok(close(b, expected),
      `${drawing} drew a subwoofer at ${b.toFixed(3)} m AFF, expected ${expected} m`));
  }
});

test('every drawing agrees on the height of an ELEVATED front subwoofer — published/frozen data shape (numeric bottomHeightM)', () => {
  const subs = publishedFrontSubs(ELEVATED_BOTTOM_M);
  const expected = ELEVATED_BOTTOM_M;
  const results = {
    front: renderFrontElevation(subs),
    side: renderSideElevation(subs),
    construction: renderConstructionDetail(subs),
  };
  console.log('[PUBLISHED SHAPE · numeric]', JSON.stringify(results, null, 2));
  for (const [drawing, bottoms] of Object.entries(results)) {
    assert.equal(bottoms.length, 2, `${drawing} drew both front subwoofers`);
    bottoms.forEach((b) => assert.ok(close(b, expected),
      `${drawing} drew a subwoofer at ${b.toFixed(3)} m AFF, expected ${expected} m`));
  }
});

test('every drawing agrees on the height of an ELEVATED front subwoofer — published/frozen data shape (string bottomHeightM)', () => {
  const subs = publishedFrontSubs(String(ELEVATED_BOTTOM_M));
  const expected = ELEVATED_BOTTOM_M;
  const results = {
    front: renderFrontElevation(subs),
    side: renderSideElevation(subs),
    construction: renderConstructionDetail(subs),
  };
  console.log('[PUBLISHED SHAPE · string]', JSON.stringify(results, null, 2));
  for (const [drawing, bottoms] of Object.entries(results)) {
    assert.equal(bottoms.length, 2, `${drawing} drew both front subwoofers`);
    bottoms.forEach((b) => assert.ok(close(b, expected),
      `${drawing} drew a subwoofer at ${b.toFixed(3)} m AFF, expected ${expected} m`));
  }
});

test('regression: floor-standing front subwoofers stay on the floor in every drawing', () => {
  const expected = FLOOR_BOTTOM_M;
  for (const shape of [
    { name: 'adapter', subs: adapterFrontSubs(FLOOR_BOTTOM_M) },
    { name: 'published/numeric', subs: publishedFrontSubs(FLOOR_BOTTOM_M) },
    { name: 'published/string', subs: publishedFrontSubs(String(FLOOR_BOTTOM_M)) },
  ]) {
    const results = {
      front: renderFrontElevation(shape.subs),
      side: renderSideElevation(shape.subs),
      construction: renderConstructionDetail(shape.subs),
    };
    console.log(`[FLOOR-STANDING · ${shape.name}]`, JSON.stringify(results));
    for (const [drawing, bottoms] of Object.entries(results)) {
      bottoms.forEach((b) => assert.ok(close(b, expected),
        `${drawing} (${shape.name}) drew a subwoofer at ${b.toFixed(3)} m AFF, expected ${expected} m`));
    }
  }
});

test('the cabinet height the drawings derive matches the registered product', () => {
  assert.ok(Number.isFinite(cabinetHeightM) && cabinetHeightM > 0,
    'SUB3-12 must have a registered cabinet height');
  console.log(`[CABINET] SUB3-12 height = ${cabinetHeightM} m`);
});