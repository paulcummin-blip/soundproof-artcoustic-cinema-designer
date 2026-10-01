// ---------------------------------------------------------------------------
// Visual Report — Acoustic Treatment. The graphic must show the number of
// Abfuser panels the ADI recommendation actually asks for, each drawn at its
// real scaled plan footprint, with the treatment zones kept visually separate
// from the panels and every zone carrying its count.
//
//   TEST 1  Eight panels are drawn as eight panels
//   TEST 2  Panels are drawn to scale from the product data
//   TEST 3  Panels are positioned on the room scale, against the wall face
//   TEST 4  Panels are never stretched to fill the treatment zone
//   TEST 5  Every zone carries its panel count, and the total is stated
//   TEST 6  The legend distinguishes zone / panel / seat / reference position
//   TEST 7  The page copy states the recommended total and the distribution
//   TEST 8  Missing product size is stated, never guessed
//   TEST 9  No recommendation maths, pricing or quantity-authority change
//   TEST 10 No layout overflow, and the page renders once
//   TEST 11 Both reports render ONE plan authority, with identical panel marks
// ---------------------------------------------------------------------------
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import ClientAcousticTreatment from '../components/report/client/ClientAcousticTreatment.jsx';
import AbfuserTreatmentPlan from '../components/report/client/AbfuserTreatmentPlan.jsx';
import AcousticTreatmentDrawing from '../components/designreview/AcousticTreatmentDrawing.jsx';
import { selectClientAcousticTreatment } from '../components/report/client/selectClientAcousticTreatment.js';
import { ABFUSER_PRODUCT } from '../components/utils/adiAbfuserProduct.js';
import { ZONE_DEPTH_M } from '../components/utils/abfuserTreatmentZones.js';

const PAGE_PATH = path.resolve('src/components/report/client/ClientAcousticTreatment.jsx');
// The drawing itself lives in ONE authority, shared by both reports. The
// assertions below follow the drawing, so any drift between the Visual and
// Technical Report plans fails here.
const PLAN_PATH = path.resolve('src/components/report/AbfuserPlanDrawing.jsx');
const PLAN_PRESENTER_PATH = path.resolve('src/components/report/client/AbfuserTreatmentPlan.jsx');
const TECHNICAL_PATH = path.resolve('src/components/designreview/AcousticTreatmentDrawing.jsx');
const SELECTOR_PATH = path.resolve('src/components/report/client/selectClientAcousticTreatment.js');
const pageSource = fs.readFileSync(PAGE_PATH, 'utf8');
const planSource = fs.readFileSync(PLAN_PATH, 'utf8');
const planPresenterSource = fs.readFileSync(PLAN_PRESENTER_PATH, 'utf8');
const technicalSource = fs.readFileSync(TECHNICAL_PATH, 'utf8');
const selectorSource = fs.readFileSync(SELECTOR_PATH, 'utf8');

// ── The project's real data (Marquee Home) ──────────────────────────────────
const roomDims = { widthM: 5.18, lengthM: 7.29, heightM: 2.8 };

const seatingPositions = [
  { id: 'seat-r1-c1', x: 1.69, y: 3.78 },
  { id: 'seat-r1-c2', x: 2.29, y: 3.78 },
  { id: 'seat-r1-c3', x: 2.89, y: 3.78 },
  { id: 'seat-r1-c4', x: 3.49, y: 3.78 },
  { id: 'seat-r2-c1', x: 1.39, y: 5.58 },
  { id: 'seat-r2-c2', x: 1.99, y: 5.58 },
  { id: 'seat-r2-c3', x: 2.59, y: 5.58 },
  { id: 'seat-r2-c4', x: 3.19, y: 5.58 },
  { id: 'seat-r2-c5', x: 3.79, y: 5.58 },
];

const placedSpeakers = [
  { role: 'FL', position: { x: 1.5, y: 0.6 } },
  { role: 'FC', position: { x: 2.59, y: 0.6 } },
  { role: 'FR', position: { x: 3.68, y: 0.6 } },
];

const rsp = { x: 2.5, y: 4.64 };

const selectionArgs = {
  roomDims,
  seatingPositions,
  placedSpeakers,
  rsp,
  acousticTreatmentEnabled: true,
  selectedAbfuserQty: 6,
  legacyAutoQuantity: 6,
};

const selection = selectClientAcousticTreatment(selectionArgs);
const RECOMMENDED = selection.recommendedQty;
const PANELS = selection.markers;

const pageProps = {
  ...selectionArgs,
  pricedAbfuserQty: 6,
};
const PAGE = renderToStaticMarkup(React.createElement(ClientAcousticTreatment, pageProps));
const textOf = (markup) => markup.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const PAGE_TEXT = textOf(PAGE);
const countOf = (haystack, needle) => haystack.split(needle).length - 1;
const planSvg = (markup) => {
  const start = markup.indexOf('<svg');
  return markup.slice(start, markup.indexOf('</svg>', start));
};
const PLAN_SVG = planSvg(PAGE);

const countZones = (wall) => selection.zones.filter((z) => z.wall === wall);
const panelsOfZone = (wall) => PANELS.filter((p) => p.wall === wall);

test('eight panels are drawn as eight panels', () => {
  // The room is large and two-row, so ADI recommends 3 + 3 + 2 = 8 panels.
  assert.equal(RECOMMENDED, 8, 'ADI recommends eight panels for this room');
  assert.equal(PANELS.length, RECOMMENDED, 'one drawn panel per recommended panel');
  assert.equal(panelsOfZone('left').length, countZones('left')[0].panels);
  assert.equal(panelsOfZone('right').length, countZones('right')[0].panels);
  assert.equal(panelsOfZone('rear').length, countZones('rear')[0].panels);
  assert.equal(countZones('left')[0].panels, 3, 'left first reflection');
  assert.equal(countZones('right')[0].panels, 3, 'right first reflection');
  assert.equal(countZones('rear')[0].panels, 2, 'rear wall');
  assert.equal(PANELS.filter((p) => p.advisory).length, 0, 'no advisory panel is counted in the total');
});

test('panels are drawn to scale from the product data', () => {
  // Real product footprint: 700 mm along the wall × 18 mm thick, drawn once per
  // panel — never shortened, never stretched.
  assert.equal(ABFUSER_PRODUCT.widthMm, 700);
  assert.equal(ABFUSER_PRODUCT.depthMm, 18);
  const alongWallM = ABFUSER_PRODUCT.widthMm / 1000;
  const depthM = ABFUSER_PRODUCT.depthMm / 1000;

  for (const panel of PANELS) {
    if (panel.wall === 'left' || panel.wall === 'right') {
      assert.equal(panel.width, depthM, 'side panel is 18 mm off the wall');
      assert.equal(panel.height, alongWallM, 'side panel is drawn its full 700 mm length');
    } else {
      assert.equal(panel.height, depthM, 'rear panel is 18 mm off the wall');
      assert.equal(panel.width, alongWallM, 'rear panel is drawn its full 700 mm length');
    }
  }
  // The drawing itself carries those scaled sizes — 6 side panels and 2 rear.
  // The leading space keeps stroke-width out of the match.
  assert.equal(countOf(PLAN_SVG, ' width="0.018"'), 6, 'six side panels drawn 18 mm thick');
  assert.equal(countOf(PLAN_SVG, ' height="0.018"'), 2, 'two rear panels drawn 18 mm thick');
  assert.equal(countOf(PLAN_SVG, ' height="0.7"'), 6, 'six side panels drawn 700 mm long');
  assert.equal(countOf(PLAN_SVG, ' width="0.7"'), 2, 'two rear panels drawn 700 mm long');
});

test('panels are positioned on the room scale, against the wall face', () => {
  // One plan scale for the whole drawing: the room plus its margin.
  assert.ok(PLAN_SVG.includes('viewBox="0 0 6.18 8.29"'), 'the plan is drawn on the room scale');
  for (const panel of panelsOfZone('left')) assert.equal(panel.x, 0, 'left panels sit on the left wall face');
  for (const panel of panelsOfZone('right')) {
    assert.equal(panel.x, roomDims.widthM - 0.018, 'right panels sit on the right wall face');
  }
  for (const panel of panelsOfZone('rear')) {
    assert.equal(panel.y, roomDims.lengthM - 0.018, 'rear panels sit on the rear wall face');
  }
  // Panels are inside their zone's wall extent along the run, on the real
  // 700 mm panel pitch plus the drawn joint that keeps them reading separately.
  for (const zone of selection.zones) {
    const zonePanels = PANELS.filter((p) => p.zoneId === zone.id);
    const starts = zonePanels.map((p) => (zone.wall === 'rear' ? p.x : p.y)).sort((a, b) => a - b);
    if (starts.length > 1) {
      const pitch = starts[1] - starts[0];
      assert.ok(Math.abs(pitch - (0.7 + selection.panel.jointM)) < 1e-9, 'one 700 mm panel plus one visible joint');
      assert.ok(selection.panel.jointM > 0, 'the drawn joint is visible, never zero');
    }
    // No panel leaves the room.
    for (const panel of zonePanels) {
      const start = zone.wall === 'rear' ? panel.x : panel.y;
      const length = zone.wall === 'rear' ? panel.width : panel.height;
      assert.ok(start >= 0 && start + length <= (zone.wall === 'rear' ? roomDims.widthM : roomDims.lengthM), 'the panel stays inside the room');
    }
  }
});

test('panels are never stretched to fill the treatment zone', () => {
  for (const panel of PANELS) {
    const zone = selection.zones.find((z) => z.id === panel.zoneId);
    const acrossWall = panel.wall === 'rear' ? panel.height : panel.width;
    assert.equal(acrossWall, 0.018, 'the panel is 18 mm deep, not the zone depth');
    assert.notEqual(acrossWall, zone.width, 'the panel never fills the zone depth');
    assert.notEqual(acrossWall, ZONE_DEPTH_M, 'the panel never uses the schematic zone band');
  }
  // The pale zone band is still drawn, so zone and panel stay distinguishable.
  const zoneRects = countOf(PLAN_SVG, 'fill="rgba(33, 52, 40, 0.06)"');
  assert.equal(zoneRects, 3, 'three pale treatment zones are drawn');
  assert.ok(PLAN_SVG.includes('stroke-dasharray="0.06 0.05"'), 'zones are pale guide outlines, not solid blocks');
  assert.ok(planSource.includes('Treatment zone'), 'the legend names the zone');
  // The optional ceiling zone is a ceiling area with no plan footprint: it is
  // stated in the page copy and never drawn as a centre-room block.
  assert.ok(!planSource.includes('advisoryZones'), 'the plan never draws a centre-room ceiling block');
});

test('every zone carries its panel count, and the total is stated', () => {
  // Each wall is labelled with its location and its count, in horizontal text
  // next to the wall it describes — never rotated through the wall.
  assert.ok(PAGE_TEXT.includes('LEFT FIRST REFLECTION'), 'left zone is named');
  assert.ok(PAGE_TEXT.includes('RIGHT FIRST REFLECTION'), 'right zone is named');
  assert.ok(PAGE_TEXT.includes('REAR WALL'), 'rear zone is named');
  assert.equal(countOf(PAGE_TEXT, '3 PANELS'), 2, 'each side wall states its own count');
  assert.equal(countOf(PAGE_TEXT, '2 PANELS'), 1, 'the rear wall states its count');
  assert.equal(countOf(PAGE_TEXT, 'PANELS'), 3, 'exactly one count label per counted zone');
  // The only rotated text left is the room length dimension outside the room.
  assert.equal(countOf(PLAN_SVG, 'rotate(-90'), 1, 'no zone label is rotated through a wall');
  // The total is stated with the drawing, not only in the copy.
  assert.ok(PAGE_TEXT.includes('Total: 8 Abfuser panels'), 'the drawing states the total');
  // No unlabelled dark block: every panel belongs to a labelled zone.
  for (const panel of PANELS) {
    assert.ok(selection.zones.some((z) => z.id === panel.zoneId), 'every panel sits in a labelled zone');
  }
});

test('the legend distinguishes zone / panel / seat / reference position', () => {
  assert.ok(
    PAGE_TEXT.includes('Individual Abfuser panel — 700 × 18 mm'),
    'the legend states the real panel size',
  );
  for (const entry of ['Treatment zone', 'Listening position', 'Reference position (RSP)']) {
    assert.ok(PAGE_TEXT.includes(entry), `the legend names ${entry}`);
  }
  // The one convention the drawing uses is declared, not hidden.
  assert.ok(PAGE_TEXT.includes('The joints between panels are widened so every panel reads separately'), 'the drawn joint is declared');
  assert.ok(planSource.includes('<RspReferenceMarker'), 'the reference position has its own glyph');
});

test('the reference position is a small marker, never a large cross', () => {
  // The crosshair used to stroke at 1 user unit, which in a metres viewBox is a
  // one-metre-thick black cross that dominated the drawing.
  assert.ok(!PLAN_SVG.includes('stroke-width="1"'), 'no 1-unit crosshair stroke in the plan');
  assert.equal(countOf(PLAN_SVG, 'stroke-width="0.01"'), 2, 'both crosshair ticks are drawn at plan scale');
  assert.ok(PLAN_SVG.includes('r="0.05"'), 'the ring is 50 mm, not a dominant disc');
  assert.ok(PLAN_SVG.includes('r="0.012"'), 'the centre dot is 12 mm');
  assert.ok(!PLAN_SVG.includes('r="0.025"'), 'the old heavy dot is gone');
  assert.ok(PLAN_SVG.includes('>RSP<'), 'the marker is labelled RSP');
});

test('a differing priced schedule is stated, not left to be reconciled', () => {
  assert.ok(
    PAGE_TEXT.includes('Priced schedule currently includes 6 Abfusers. ADI recommendation is 8.'),
    'the page says exactly how the priced schedule differs from the recommendation',
  );
  const agreed = renderToStaticMarkup(
    React.createElement(ClientAcousticTreatment, { ...selectionArgs, pricedAbfuserQty: RECOMMENDED }),
  );
  assert.ok(!textOf(agreed).includes('Priced schedule currently includes'), 'no mismatch sentence when the two agree');
});

test('the page does not repeat its own explanation', () => {
  // The long recommendation paragraph is gone: the heading, the distribution and
  // the WHY cards already carry it.
  assert.ok(!PAGE_TEXT.includes('ADI recommends 8 Abfusers for this room'), 'the duplicated paragraph is removed');
  assert.equal(countOf(PAGE_TEXT, 'ADI recommends 8 Abfusers'), 1, 'the recommendation is stated once');
  assert.ok(!PAGE_TEXT.includes('Approximate treatment surface'), 'the treated area is stated once, not twice more');
});

test('the page copy states the recommended total and the distribution', () => {
  assert.ok(PAGE_TEXT.includes('Recommended: 8 Abfuser panels'), 'the recommendation states the panel count');
  assert.ok(PAGE_TEXT.includes('Distribution'), 'the distribution is headed as such');
  assert.ok(PAGE_TEXT.includes('Left first reflection — 3 panels'), 'left distribution');
  assert.ok(PAGE_TEXT.includes('Right first reflection — 3 panels'), 'right distribution');
  assert.ok(PAGE_TEXT.includes('Rear wall — 2 panels'), 'rear distribution');
  assert.ok(PAGE_TEXT.includes('Total: 8 Abfuser panels (6.16 m²)'), 'the total and treated area are stated');
  // The included quantity stays a separate authority from the recommendation.
  assert.ok(PAGE_TEXT.includes('INCLUDED IN THE PRICED SCHEDULE'), 'the included quantity is still separate');
  assert.ok(PAGE_TEXT.includes('6 Abfusers'), 'the designer selected quantity is unchanged');
});

test('missing product size is stated, never guessed', () => {
  const markup = renderToStaticMarkup(
    React.createElement(AbfuserTreatmentPlan, {
      roomPlan: selection.roomPlan,
      zones: selection.zones,
      panels: selection.markers,
      panel: { ...selection.panel, sizeAvailable: false },
      seatingPositions,
      rsp,
      totalPanels: RECOMMENDED,
    }),
  );
  const text = textOf(markup);
  assert.ok(text.includes('Panel size unavailable — schematic only'), 'the drawing says it is schematic');
  assert.ok(!text.includes('drawn to scale'), 'no scale is claimed when the size is unknown');
  assert.ok(text.includes('Total: 8 Abfuser panels'), 'the count is still stated');
  // With the real product data present, the warning is not shown.
  assert.ok(!PAGE_TEXT.includes('Panel size unavailable'), 'no warning when the size is known');
  assert.equal(selection.panel.sizeAvailable, true, 'the selector reports the size as available');
  assert.equal(selection.panel.depthM, 0.018, 'and passes the real thickness');
});

test('no recommendation maths, pricing or quantity-authority change', () => {
  const mathsImports = /(capacityService|resolveReportQuantity|useProductPriceMap|ProductPrice)/;
  assert.ok(!mathsImports.test(selectorSource), 'the geometry selector reads no pricing');
  assert.ok(!/selectedQuantity\s*=/.test(selectorSource), 'the selector never recomputes a quantity');
  assert.ok(
    selectorSource.includes('calculateAbfuserRecommendation('),
    'the recommendation remains the single quantity authority',
  );
  assert.ok(pageSource.includes('resolveReportQuantity'), 'the priced quantity authority is untouched');
  // The page still shows the same recommended quantity it always did.
  assert.equal(selection.recommendation.quantityByZone.counted, 8);
  assert.equal(selection.quantityBreakdown.treatmentSurfaceArea.toFixed(2), '6.16');
  // Only drawing geometry changed in the selector.
  assert.ok(
    !/recommendedQuantity\s*=/.test(selectorSource),
    'the selector never writes the recommended quantity',
  );
});

test('no layout overflow, and the page renders once', () => {
  assert.ok(PLAN_SVG.includes('width:100%'), 'the plan scales to its column');
  // One plan, one legend, one total — the drawing is not duplicated.
  assert.equal(countOf(PAGE, '<svg'), 2, 'the plan and the reference glyph only');
  assert.equal(countOf(PAGE_TEXT, 'Total: 8 Abfuser panels'), 2, 'once under the plan, once in the distribution');
  assert.ok(pageSource.includes('<AbfuserTreatmentPlan'), 'the page composes the shared plan component');
  assert.equal(countOf(PAGE, '>ACOUSTIC TREATMENT<'), 1, 'one page heading');
  assert.equal(typeof AbfuserTreatmentPlan, 'function', 'the plan is a reusable component');
});

test('both reports render ONE plan authority, with identical panel marks', () => {
  // The Visual Report presenter owns no geometry: it switches the annotation
  // layer on. The Technical Report drawing owns no geometry either.
  assert.ok(planPresenterSource.includes('AbfuserPlanDrawing'), 'the Visual Report uses the shared drawing');
  assert.ok(technicalSource.includes('AbfuserPlanDrawing'), 'the Technical Report uses the shared drawing');
  assert.ok(planPresenterSource.includes('variant="visual"'), 'the Visual Report keeps its annotation layer');
  assert.ok(technicalSource.includes('variant="technical"'), 'the Technical Report keeps its plain layer');
  assert.ok(!planPresenterSource.includes('viewBox'), 'the Visual Report presenter draws no geometry');
  assert.ok(!technicalSource.includes('viewBox'), 'the Technical Report drawing draws no geometry');
  assert.ok(!planPresenterSource.includes('toX('), 'no Visual-Report-only coordinate transform remains');

  // Same drawing, same marks: the Technical Report plan is rendered from the
  // same selector data through the same code, so every panel matches.
  const technicalMarkup = renderToStaticMarkup(
    React.createElement(AcousticTreatmentDrawing, {
      roomDims,
      seatingPositions,
      placedSpeakers,
      acousticTreatmentEnabled: true,
      selectedAbfuserQty: 6,
    }),
  );
  const TECHNICAL_SVG = planSvg(technicalMarkup);
  assert.ok(TECHNICAL_SVG.length > 0, 'the Technical Report renders its plan drawing');
  assert.ok(TECHNICAL_SVG.includes('viewBox="0 0 6.18 8.29"'), 'both plans use the same room scale');
  for (const mark of [' width="0.018"', ' height="0.018"', ' height="0.7"', ' width="0.7"']) {
    assert.equal(
      countOf(TECHNICAL_SVG, mark),
      countOf(PLAN_SVG, mark),
      `the same panels are drawn in both reports (${mark.trim()})`,
    );
  }
  assert.equal(countOf(TECHNICAL_SVG, 'fill="rgba(33, 52, 40, 0.06)"'), 3, 'the same three zones are drawn');
  // Panel count authority is the recommendation in both reports.
  assert.equal(countOf(TECHNICAL_SVG, 'height="0.7"'), 6, 'six side panels');
  assert.equal(countOf(TECHNICAL_SVG, 'width="0.7"'), 2, 'two rear panels');
  // The Technical Report states its own counts; it draws no legend or total.
  assert.ok(!technicalSource.includes('Total:'), 'the Technical Report plan adds no total of its own');
});