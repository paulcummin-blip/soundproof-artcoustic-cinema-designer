// p7-wall-markers.test.mjs
// ---------------------------------------------------------------------------
// The Visual Report P7 (Spatial Resolution) page is a client-facing drawing, not
// an engineering geometry panel. It shows, on the front wide wall itself:
//
//   TEST 1  Card says "Level 2", never "P7 — L2", with the official RP22 wording
//   TEST 2  The maximum deviation value is preserved, on screen and in print
//   TEST 3  Actual front wide markers stay on the wall
//   TEST 4  Ideal median markers are drawn ON the same wall
//   TEST 5  Actual vs ideal is visually distinct, with a short local deviation label
//   TEST 6  No large arcs, no dashed off-room rays, no construction geometry
//   TEST 7  The copy is short — no angle tables, no measurement explanation
//   TEST 8  No RP22 value, grading or selector change
//   TEST 9  The live published shape (engine median detail) still draws on the wall
// ---------------------------------------------------------------------------
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import ClientP7FrontWides from '../components/report/client/ClientP7FrontWides.jsx';
import PrintP7Content from '../components/report/client/print/PrintP7Content.jsx';
import { parameterResultHeading } from '../components/report/client/parameterResultCopy.js';
import { getOfficialRp22Title } from '../components/utils/rp22OfficialTitles.js';
import { selectClientP7FrontWides } from '../components/report/client/selectClientP7FrontWides.js';

const COMPONENT_PATH = path.resolve('src/components/report/client/ClientP7FrontWides.jsx');
const PRINT_PATH = path.resolve('src/components/report/client/print/PrintP7Content.jsx');
const GUIDANCE_PATH = path.resolve('src/components/report/client/P7PlacementGuidance.jsx');
const IDEAL_ANGLES_PATH = path.resolve('src/components/report/client/p7IdealAngles.js');
const SELECTOR_PATH = path.resolve('src/components/report/client/selectClientP7FrontWides.js');
const source = fs.readFileSync(COMPONENT_PATH, 'utf8');
const printSource = fs.readFileSync(PRINT_PATH, 'utf8');
const guidanceSource = fs.readFileSync(GUIDANCE_PATH, 'utf8');
const idealAnglesSource = fs.readFileSync(IDEAL_ANGLES_PATH, 'utf8');
const selectorSource = fs.readFileSync(SELECTOR_PATH, 'utf8');

const RP22_P7_DESCRIPTION =
  'Wide speakers maximum allowable horizontal deviation from median angle';

// The component's own wide-speaker colour, so the drawing can be read back.
const LW_RW_COLOR = '#213428';

// Published authority: L2, maximum deviation 6.1° from the median angle.
const perSide = {
  LW: { targetAngle: 225, actualAngle: 231.1, deviation: 6.1 },
  RW: { targetAngle: 135, actualAngle: 131.5, deviation: 3.5 },
};
const p7Data = {
  level: 'L2',
  maxDeviation: 6.1,
  perSide,
  ideal: perSide,
  lwPos: { x: 0.6, y: 3.2 },
  rwPos: { x: 3.9, y: 3.2 },
  flPos: { x: 1.2, y: 0.4 },
  frPos: { x: 3.3, y: 0.4 },
  slPos: { x: 0.1, y: 4.0 },
  srPos: { x: 4.4, y: 4.0 },
  medianPoint: { x: 2.25, y: 3.2 },
  rsp: { x: 2.5, y: 4.2 },
  // The ideal median positions, as the app's front-wide geometry authority resolves
  // them. The drawing marks these points; it never projects an angle of its own.
  idealPoints: { LW: { x: 0.1, y: 2.2 }, RW: { x: 4.4, y: 2.2 } },
};

const baseProps = {
  p7Data,
  roomDims: { widthM: 4.5, lengthM: 6.0, heightM: 2.4 },
  screenFrontPlaneM: 0.2,
  screenWidthM: 3,
};

const render = (props) => renderToStaticMarkup(
  React.createElement(ClientP7FrontWides, { ...baseProps, ...props }),
);

const SCREEN = render({});
const SUPPORT = render({ print: true, printPart: 'support' });
const DRAWING = render({ print: true, printPart: 'drawing' });
const PRINT = renderToStaticMarkup(React.createElement(PrintP7Content, baseProps));

const textOf = (markup) => markup.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const SCREEN_TEXT = textOf(SCREEN);
const SUPPORT_TEXT = textOf(SUPPORT);
const PRINT_TEXT = textOf(PRINT);
const countOf = (haystack, needle) => haystack.split(needle).length - 1;

const drawingOf = (markup) => {
  const svg = markup.slice(markup.indexOf('<svg'), markup.indexOf('</svg>'));
  return svg.slice(svg.indexOf('>') + 1);
};
const DRAWING_BODY = drawingOf(SCREEN);

// Room edges in the drawing, so "on the wall" and "inside the room" can be read
// back from the rendered geometry (0.6 m padding, 760 px across the room width).
const ROOM_WIDTH_M = 4.5;
const ROOM_LENGTH_M = 6.0;
const PADDING_M = 0.6;
const SVG_W = 760;
const SCALE = SVG_W / (ROOM_WIDTH_M + PADDING_M * 2);
const ROOM_LEFT_PX = PADDING_M * SCALE;
const ROOM_RIGHT_PX = (ROOM_WIDTH_M + PADDING_M) * SCALE;
const ROOM_TOP_PX = PADDING_M * SCALE;
const ROOM_BOTTOM_PX = (ROOM_LENGTH_M + PADDING_M) * SCALE;

// The result card region: pill, heading, description, deviation line. Bounded
// at the caption below it, so only the card itself is measured.
const CARD_STYLE = '<div style="display:flex;align-items:center;gap:16px;padding:16px 20px;background:#FFFFFF';
const CALLOUT_STYLE = '<div style="display:flex;align-items:center;gap:16px;padding:16px 20px;background:#F1F0EE';
const cardMarkup = (markup) => {
  const start = markup.indexOf(CARD_STYLE);
  assert.ok(start !== -1, 'the result card renders');
  const end = markup.indexOf(CALLOUT_STYLE, start);
  return end > start ? markup.slice(start, end) : markup.slice(start);
};

/** The drawn markers of the plan: actual wides (solid) and ideal medians (outlined). */
function parseMarkers(drawing) {
  const actual = [...drawing.matchAll(/<circle cx="([\d.-]+)" cy="([\d.-]+)" r="7"/g)]
    .map((match) => ({ x: Number(match[1]), y: Number(match[2]) }));
  const ideal = [...drawing.matchAll(/<rect x="([\d.-]+)" y="([\d.-]+)" width="9" height="9"/g)]
    .map((match) => ({ x: Number(match[1]) + 4.5, y: Number(match[2]) + 4.5 }));
  return { actual, ideal };
}

test('card says "Level 2", never "P7 — L2"', () => {
  assert.ok(SCREEN_TEXT.includes('Level 2'), 'the card heading reads Level 2');
  assert.ok(!SCREEN_TEXT.includes('P7 — L2'), '"P7 — L2" is removed');
  assert.ok(!SCREEN_TEXT.includes('P7 —'), 'no parameter-number-and-level title remains');
  assert.equal(countOf(SCREEN_TEXT, 'L2'), 1, 'L2 appears only in the pill');
  // The card itself is unchanged: level, official wording, published figure.
  assert.equal(getOfficialRp22Title(7), RP22_P7_DESCRIPTION, 'wording comes from the RP22 authority');
  assert.ok(SCREEN_TEXT.includes(RP22_P7_DESCRIPTION), 'official RP22 wording used');
  assert.equal(countOf(SCREEN_TEXT, RP22_P7_DESCRIPTION), 1, 'stated once, not repeated');
  assert.ok(SCREEN_TEXT.includes('RP22 Parameter 7'), 'the page identifies the parameter');
  assert.equal(countOf(SCREEN_TEXT, 'RP22 Parameter 7'), 1, 'identified once, in the subtitle only');
});

test('the maximum deviation value is preserved', () => {
  assert.ok(
    SCREEN_TEXT.includes('Maximum deviation from median: 6.1°'),
    'the published deviation is shown unchanged',
  );
  assert.equal(countOf(SCREEN_TEXT, 'Maximum deviation from median'), 1, 'stated once');
  assert.ok(SUPPORT_TEXT.includes('Maximum deviation from median: 6.1°'), 'and on the printed page');
});

test('actual front wide markers stay on the wall', () => {
  for (const label of ['SCREEN', 'FL', 'FR', 'LW', 'RW', 'SL', 'SR', 'RSP']) {
    assert.ok(SCREEN_TEXT.includes(label), `the graphic still labels ${label}`);
  }
  assert.ok(SCREEN.includes('<svg'), 'the plan drawing renders');
  const { actual } = parseMarkers(DRAWING_BODY);
  assert.equal(actual.length, 2, 'both installed front wides are drawn');
  assert.ok(
    new RegExp(`<circle cx="[\\d.]+" cy="[\\d.]+" r="7" fill="${LW_RW_COLOR}"`).test(DRAWING_BODY),
    'the installed wide marker stays solid and filled',
  );
});

test('ideal median markers are drawn on the same wall', () => {
  const { actual, ideal } = parseMarkers(DRAWING_BODY);
  assert.equal(ideal.length, 2, 'one ideal median marker per front wide');
  // Every marker stays inside the plan.
  for (const marker of [...actual, ...ideal]) {
    assert.ok(
      marker.x > ROOM_LEFT_PX && marker.x < ROOM_RIGHT_PX
        && marker.y > ROOM_TOP_PX && marker.y < ROOM_BOTTOM_PX,
      'every marker is drawn inside the room',
    );
  }
  // Left wide first: the ideal sits ON the left wall, which is nearer the wall
  // than the installed position and forward of it. The right wide mirrors it —
  // if the engine's azimuth were converted with the wrong chirality these flip.
  assert.ok(ideal[0].x < actual[0].x, 'the left ideal is marked on the wall');
  assert.ok(ideal[0].y < actual[0].y, 'the left ideal sits forward of the installed position');
  assert.ok(ideal[1].x > actual[1].x, 'the right ideal is marked on the wall');
  assert.ok(ideal[1].y < actual[1].y, 'the right ideal sits forward of the installed position');
  // Each ideal marker is within 0.15 m of its wall.
  const wallTolerancePx = 0.15 * SCALE;
  assert.ok(ideal[0].x - ROOM_LEFT_PX <= wallTolerancePx, 'the left ideal is on the left wall');
  assert.ok(ROOM_RIGHT_PX - ideal[1].x <= wallTolerancePx, 'the right ideal is on the right wall');
});

test('actual vs ideal is clear, with a short local deviation label', () => {
  // Visually distinct: the ideal is an outlined, dashed diamond; the actual is solid.
  assert.ok(
    DRAWING_BODY.includes('fill="#FFFFFF" stroke="#8A7B6A" stroke-width="2" stroke-dasharray="3 2"'),
    'the ideal marker is outlined, never filled',
  );
  assert.equal(countOf(DRAWING_BODY, '>Ideal<'), 2, 'each ideal marker carries the short label');
  // The deviation is drawn as a short line between the two markers, and the
  // published figure is stated once, next to it.
  assert.ok(/<line x1="[\d.]+" y1="[\d.]+" x2="[\d.]+" y2="[\d.]+" stroke="#213428" stroke-width="2"/.test(DRAWING_BODY)
    || /stroke="#8A7B6A" stroke-width="1.5"/.test(DRAWING_BODY),
    'a short line joins the installed and ideal positions');
  assert.equal(countOf(DRAWING_BODY, '>6.1° deviation<'), 1, 'the published deviation is labelled once');
  assert.ok(!/Level [1-4]/.test(DRAWING_BODY), 'the drawing states no level');
  // Legend explains the two markers, and nothing that is not drawn.
  for (const legend of ['Front wides (actual)', 'Ideal front wide position', 'Screen speakers', 'Side surrounds']) {
    assert.ok(SCREEN_TEXT.includes(legend), `the legend shows ${legend}`);
  }
  assert.ok(!SCREEN_TEXT.includes('Median reference'), 'no legend entry for an undrawn construction');
  // The printed drawing region renders the identical drawing.
  assert.equal(drawingOf(DRAWING), DRAWING_BODY, 'print and screen render one drawing');
  assert.ok(!textOf(DRAWING).includes('Level 2'), 'the printed drawing carries no result block');
});

test('no large arcs, no dashed off-room rays, no construction geometry', () => {
  assert.ok(!DRAWING_BODY.includes('<path d="M '), 'the deviation arc is gone');
  assert.ok(!DRAWING_BODY.includes('stroke-dasharray="6 4"'), 'the dashed median ray is gone');
  assert.ok(!source.includes('arcPath'), 'the arc construction is gone from the page');
  assert.ok(!source.includes('polarToSvg'), 'no polar projection outside the room remains');
  assert.ok(!source.includes('projectToWall'), 'the report no longer projects an angle of its own');
  assert.ok(source.includes('idealPoints[side.key]'), 'the ideal position comes from the app geometry authority');
});

test('the copy is short — no angle tables, no measurement explanation', () => {
  assert.ok(SCREEN_TEXT.includes('Front Wide Placement'), 'the caption is present');
  assert.ok(
    SCREEN_TEXT.includes(
      'The solid markers show the installed front wide positions. The outlined markers show the ideal median positions.',
    ),
    'the markers are explained in one short sentence',
  );
  for (const removed of [
    'Ideal front wide angle',
    'Actual front wide angle',
    'Deviation from median —',
    'Angles are measured',
    'In this design',
    'Median reference',
  ]) {
    assert.ok(!SCREEN_TEXT.includes(removed), `the long text "${removed}" is removed`);
    assert.ok(!PRINT_TEXT.includes(removed), `the long text "${removed}" is not printed`);
  }
  // The result still stands, on screen and in print.
  for (const kept of ['Level 2', 'Maximum deviation from median: 6.1°', RP22_P7_DESCRIPTION]) {
    assert.ok(SCREEN_TEXT.includes(kept), `the page still states ${kept}`);
    assert.ok(PRINT_TEXT.includes(kept), `the printed page still states ${kept}`);
  }
  assert.equal(countOf(PRINT_TEXT, 'L2'), 1, 'printed level code appears in the pill only');
  assert.equal(countOf(PRINT_TEXT, 'Spatial Resolution'), 1, 'one printed page heading');
  assert.equal(countOf(PRINT_TEXT, 'RP22 Parameter 7'), 1, 'one printed parameter line');
  assert.ok(printSource.includes('RP22 Parameter 7'), 'print subtitle identifies the parameter');
  assert.ok(guidanceSource.includes('Front Wide Placement'), 'the caption lives in the guidance component');
  assert.ok(!guidanceSource.includes('toCentreLineDegrees'), 'the caption no longer reads published angles');
});

test('no RP22 value, grading or selector change', () => {
  const published = {
    LW: { targetAngle: 225, actualAngle: 231.1, deviation: 6.1 },
    RW: { targetAngle: 135, actualAngle: 131.5, deviation: 3.5 },
  };
  const analysis = { roomResultsByParameter: { 7: { status: 'scored', level: 'L2', value: 6.1, perSide: published } } };
  const placedSpeakers = [
    { role: 'LW', position: { x: 0.6, y: 3.2 } },
    { role: 'RW', position: { x: 3.9, y: 3.2 } },
    { role: 'FL', position: { x: 1.2, y: 0.4 } },
    { role: 'FR', position: { x: 3.3, y: 0.4 } },
    { role: 'SL', position: { x: 0.1, y: 4.0 } },
    { role: 'SR', position: { x: 4.4, y: 4.0 } },
  ];
  const selected = selectClientP7FrontWides(analysis, placedSpeakers, { x: 2.5, y: 4.2 });
  assert.equal(selected.level, 'L2');
  assert.equal(selected.maxDeviation, 6.1);
  assert.deepEqual(selected.perSide, published, 'perSide is passed through untouched');
  assert.deepEqual(selected.ideal, published, 'the ideal angles are the published ones');
  assert.deepEqual(selected.lwPos, { x: 0.6, y: 3.2 }, 'speaker positions are untouched');
  // No grading, threshold or measurement logic was introduced anywhere in the path.
  const gradingImports = /(bassGradingAuthority|rp22LevelCalculation|rp22BassMetrics|resolveRp22DesignValue|headroomPolicy|p7WideAnalysis|useRP22AnalysisEngine)/;
  for (const src of [source, printSource, guidanceSource, idealAnglesSource, selectorSource]) {
    assert.ok(!gradingImports.test(src), 'no grading authority imported');
    assert.ok(!/function\s+\w*[Gg]rade/.test(src), 'no grading function added');
    assert.ok(!/levelForP7|circDelta|azimuthFromMLP|computeP7Wides|Math\.atan2/.test(src), 'no P7 angle measurement reimplemented');
  }
  assert.ok(source.includes('parameterResultHeading(level)'), 'level heading comes from the copy authority');
  assert.ok(source.includes('levelToLabel(level)'), 'the pill label authority is untouched');
  assert.equal(parameterResultHeading('L2'), 'Level 2', 'levels are spoken as words');
});

test('no layout gap: one card, three lines, no empty reserved row', () => {
  const card = cardMarkup(SCREEN);
  const cardText = textOf(card);
  assert.equal(countOf(card, 'flex:1'), 1, 'the card has one copy column');
  const copyColumn = card.slice(card.indexOf('<div style="flex:1">'));
  const copyText = textOf(copyColumn);
  assert.ok(copyText.startsWith('Level 2'), 'the column opens with the level heading — no blank first line');
  const heading = cardText.indexOf('Level 2');
  const description = cardText.indexOf(RP22_P7_DESCRIPTION);
  const deviation = cardText.indexOf('Maximum deviation from median');
  assert.ok(heading < description && description < deviation, 'lines read level → meaning → detail');
  assert.ok(card.includes('max-width:600px'), 'the card stays inside the page column');
});

// ── The live published shape ────────────────────────────────────────────────
// The P7 result carries the level and the maximum deviation but no per-side
// angles; the engine's median detail travels in the report snapshot instead
// (analysisResult.p7Details). The ideal median position must still be drawn on
// the wall, and the drawing must state the published deviation.
const LIVE_SUMMARY = {
  roomResultsByParameter: { 7: { status: 'scored', level: 'L2', value: 6.1, unit: 'deg (±)' } },
};
const LIVE_ANALYSIS = {
  p7Details: {
    LW: { deviation: 3.816575695460946, targetAngle: 250.00233625919896, actualAngle: 246.1857605637382 },
    RW: { deviation: 3.816575695460754, targetAngle: 109.99766374080104, actualAngle: 113.8142394362618 },
  },
};
const LIVE_PLACED = [
  { role: 'LW', position: { x: 0.6, y: 3.2 } },
  { role: 'RW', position: { x: 3.9, y: 3.2 } },
  { role: 'FL', position: { x: 1.2, y: 0.4 } },
  { role: 'FR', position: { x: 3.3, y: 0.4 } },
  // Side surrounds mounted on the side walls — the placement the shared front-wide
  // geometry authority requires in order to resolve the zones.
  { role: 'SL', position: { x: 0.041, y: 4.0 } },
  { role: 'SR', position: { x: 4.459, y: 4.0 } },
];
const liveSelected = selectClientP7FrontWides(
  LIVE_SUMMARY, LIVE_PLACED, { x: 2.5, y: 4.2 }, LIVE_ANALYSIS,
  { widthM: ROOM_WIDTH_M, lengthM: ROOM_LENGTH_M },
);
const LIVE_SCREEN = renderToStaticMarkup(
  React.createElement(ClientP7FrontWides, { ...baseProps, p7Data: liveSelected }),
);
const LIVE_PRINT = renderToStaticMarkup(
  React.createElement(PrintP7Content, { ...baseProps, p7Data: liveSelected }),
);
const LIVE_TEXT = textOf(LIVE_SCREEN);
const LIVE_DRAWING = drawingOf(LIVE_SCREEN);

test('with only the engine median detail published, the ideal is still drawn on the wall', () => {
  assert.equal(liveSelected.level, 'L2');
  assert.equal(liveSelected.maxDeviation, 6.1);
  assert.equal(liveSelected.idealSource, 'app_front_wide_zones');
  assert.equal(liveSelected.ideal.LW.targetAngle, LIVE_ANALYSIS.p7Details.LW.targetAngle);
  assert.equal(liveSelected.ideal.LW.deviation, undefined, 'the engine per-side deviation is not carried across');

  const { actual, ideal } = parseMarkers(LIVE_DRAWING);
  assert.equal(ideal.length, 2, 'both ideal median markers are drawn');
  assert.ok(ideal[0].x - ROOM_LEFT_PX <= 0.15 * SCALE, 'the left ideal is marked on the left wall');
  assert.ok(ROOM_RIGHT_PX - ideal[1].x <= 0.15 * SCALE, 'the right ideal is marked on the right wall');
  for (const marker of [...actual, ...ideal]) {
    assert.ok(
      marker.x > ROOM_LEFT_PX && marker.x < ROOM_RIGHT_PX
        && marker.y > ROOM_TOP_PX && marker.y < ROOM_BOTTOM_PX,
      'every marker is drawn inside the room',
    );
  }
  assert.equal(countOf(LIVE_TEXT, 'Ideal'), 3, 'two drawn labels plus the legend entry');
  assert.equal(countOf(LIVE_DRAWING, '>6.1° deviation<'), 1, 'the published deviation is labelled');
  assert.equal(countOf(LIVE_TEXT, '3.8'), 0, 'the engine median detail never prints as a deviation');
  assert.ok(!LIVE_DRAWING.includes('<path d="M '), 'no arc is drawn');

  // The published result is untouched, on screen and in the PDF.
  for (const kept of ['Level 2', 'Maximum deviation from median: 6.1°', RP22_P7_DESCRIPTION]) {
    assert.ok(LIVE_TEXT.includes(kept), `the page still states ${kept}`);
    assert.ok(textOf(LIVE_PRINT).includes(kept), `the PDF page still states ${kept}`);
  }
  assert.equal(countOf(drawingOf(LIVE_PRINT), '>Ideal<'), 2, 'the PDF page draws the same two markers');
});