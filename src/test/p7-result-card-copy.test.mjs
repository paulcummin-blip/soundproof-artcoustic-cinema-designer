// p7-result-card-copy.test.mjs
// ---------------------------------------------------------------------------
// The Visual Report P7 (Spatial Resolution) result card must state its level
// once, in words, with the official RP22 wording — never as "P7 — L2", which
// repeats the page subtitle and the level pill.
//
//   TEST 1  Card says "Level 2", never "P7 — L2"
//   TEST 2  The official RP22 Parameter 7 wording is the card's explanation
//   TEST 3  The maximum deviation value is preserved
//   TEST 4  The front wide graphic is preserved, and now shows the ideal median
//   TEST 5  No RP22 value, grading or selector change
//   TEST 6  No layout gap: one card, three lines, no empty reserved row
//   TEST 7  The printed page (PDF) carries the same trimmed card
//   TEST 8  The repeated "P{n} — L{n}" pattern is gone from every Visual Report page
//   TEST 9  The page explains where the front wides ideally want to be
//   TEST 10 The ideal median drawing follows the published angles
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

// Published authority: L2, maximum deviation 6.1° from the median angle.
// perSide carries, per front wide, the ideal (median) angle, the actual angle
// and the deviation between them — in the engine's own azimuth frame, where 0°
// points away from the screen. The report converts them for drawing and copy.
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

// The result card region: pill, heading, description, deviation line. Bounded
// at the summary callout below it, so only the card itself is measured.
const CARD_STYLE = '<div style="display:flex;align-items:center;gap:16px;padding:16px 20px;background:#FFFFFF';
const CALLOUT_STYLE = '<div style="display:flex;align-items:center;gap:16px;padding:16px 20px;background:#F1F0EE';
const cardMarkup = (markup) => {
  const start = markup.indexOf(CARD_STYLE);
  assert.ok(start !== -1, 'the result card renders');
  const end = markup.indexOf(CALLOUT_STYLE, start);
  return end > start ? markup.slice(start, end) : markup.slice(start);
};

test('card says "Level 2", never "P7 — L2"', () => {
  assert.ok(SCREEN_TEXT.includes('Level 2'), 'the card heading reads Level 2');
  assert.ok(!SCREEN_TEXT.includes('P7 — L2'), '"P7 — L2" is removed');
  assert.ok(!SCREEN_TEXT.includes('P7 —'), 'no parameter-number-and-level title remains');
  assert.ok(!source.includes('P7 — {levelLabel}'), 'the code no longer builds a "P7 — L2" title');
  // The level code appears once, in the pill — nowhere else.
  assert.equal(countOf(SCREEN_TEXT, 'L2'), 1, 'L2 appears only in the pill');
});

test('the official RP22 Parameter 7 wording is the card explanation', () => {
  assert.equal(getOfficialRp22Title(7), RP22_P7_DESCRIPTION, 'wording comes from the RP22 authority');
  assert.ok(SCREEN_TEXT.includes(RP22_P7_DESCRIPTION), 'official RP22 wording used');
  assert.equal(countOf(SCREEN_TEXT, RP22_P7_DESCRIPTION), 1, 'stated once, not repeated');
  // The page still identifies the parameter, concisely, in its subtitle.
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

test('the front wide graphic is preserved, and now shows the ideal median', () => {
  // Screen drawing: room, screen, both wides, both screen speakers, the
  // adjacent surrounds and RSP.
  for (const label of ['SCREEN', 'FL', 'FR', 'LW', 'RW', 'SL', 'SR', 'RSP']) {
    assert.ok(SCREEN_TEXT.includes(label), `the graphic still labels ${label}`);
  }
  assert.ok(SCREEN.includes('<svg'), 'the plan drawing renders');
  assert.ok(SCREEN.includes('stroke-dasharray="6 4"'), 'the median reference line is unchanged');
  // The ideal median position is now drawn and named, once per front wide.
  assert.equal(countOf(SCREEN_TEXT, 'IDEAL'), 2, 'each front wide carries an ideal median marker');
  assert.ok(SCREEN.includes('<path d="M '), 'the deviation arc is drawn from the RSP');
  // Legend names the ideal position, the actual positions, the deviation, the
  // screen speakers and the surrounds.
  for (const legend of [
    'Ideal median position',
    'Front wides (actual)',
    'Deviation from median',
    'Screen speakers',
    'Side surrounds',
  ]) {
    assert.ok(SCREEN_TEXT.includes(legend), `the legend shows ${legend}`);
  }
  // Geometry untouched: the printed drawing region renders the identical
  // drawing (only the outer <svg> sizing wrapper differs for print).
  const drawingOf = (markup) => {
    const svg = markup.slice(markup.indexOf('<svg'), markup.indexOf('</svg>'));
    return svg.slice(svg.indexOf('>') + 1);
  };
  assert.equal(drawingOf(DRAWING), drawingOf(SCREEN), 'print and screen render one drawing');
  assert.ok(drawingOf(SCREEN).includes('IDEAL'), 'the ideal median marker is inside the drawing');
  assert.ok(!textOf(DRAWING).includes('Level 2'), 'the printed drawing carries no result block');
});

test('no RP22 value, grading or selector change', () => {
  // The selector still publishes the same authoritative values, untouched.
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
  // The ideal median angles are read verbatim from the published authority —
  // never re-derived, re-measured or re-graded.
  assert.deepEqual(selected.ideal, published, 'the ideal angles are the published ones');
  // Surround positions are drawing geometry only.
  assert.deepEqual(selected.slPos, { x: 0.1, y: 4.0 });
  assert.deepEqual(selected.srPos, { x: 4.4, y: 4.0 });
  // No grading, threshold or measurement logic was introduced anywhere in the path.
  const gradingImports = /(bassGradingAuthority|rp22LevelCalculation|rp22BassMetrics|resolveRp22DesignValue|headroomPolicy|p7WideAnalysis|useRP22AnalysisEngine)/;
  for (const src of [source, printSource, guidanceSource, idealAnglesSource, selectorSource]) {
    assert.ok(!gradingImports.test(src), 'no grading authority imported');
    assert.ok(!/function\s+\w*[Gg]rade/.test(src), 'no grading function added');
    assert.ok(!/levelForP7|circDelta|azimuthFromMLP|computeP7Wides|Math\.atan2|Math\.hypot\b.*atan/.test(src), 'no P7 angle measurement reimplemented');
  }
  // The card still reads one authority for its level, and one for its copy.
  assert.ok(source.includes('parameterResultHeading(level)'), 'level heading comes from the copy authority');
  assert.ok(source.includes('levelToLabel(level)'), 'the pill label authority is untouched');
  assert.ok(source.includes('resolveGradeToken(level).token.bg'), 'the pill still reads the canonical grade token');
});

test('no layout gap: one card, three lines, no empty reserved row', () => {
  const card = cardMarkup(SCREEN);
  const cardText = textOf(card);
  // One bordered card holds the pill and the copy, and the copy sits in a
  // single column: heading, description and detail stacked with no empty
  // reserved row where the old "P7 — L2" title used to be.
  assert.equal(countOf(card, 'flex:1'), 1, 'the card has one copy column');
  const copyColumn = card.slice(card.indexOf('<div style="flex:1">'));
  const copyText = textOf(copyColumn);
  assert.ok(copyText.startsWith('Level 2'), 'the column opens with the level heading — no blank first line');
  assert.ok(cardText.includes('Level 2'), 'heading inside the card');
  assert.ok(cardText.includes(RP22_P7_DESCRIPTION), 'description inside the card');
  assert.ok(cardText.includes('Maximum deviation from median: 6.1°'), 'deviation inside the card');
  const heading = cardText.indexOf('Level 2');
  const description = cardText.indexOf(RP22_P7_DESCRIPTION);
  const deviation = cardText.indexOf('Maximum deviation from median');
  assert.ok(heading < description && description < deviation, 'lines read level → meaning → detail');
  // No leftover placeholder for the removed title.
  assert.ok(!/Level 2\s*(?:—|-|\s)*\s*L2/.test(cardText), 'no level code repeated as a title');
  assert.ok(card.includes('max-width:600px'), 'the card stays inside the page column');
});

test('the printed page (PDF) carries the same trimmed card', () => {
  assert.ok(PRINT_TEXT.includes('Level 2'), 'printed Level 2 heading');
  assert.ok(PRINT_TEXT.includes(RP22_P7_DESCRIPTION), 'printed official RP22 description');
  assert.ok(PRINT_TEXT.includes('Maximum deviation from median: 6.1°'), 'printed deviation');
  assert.ok(!PRINT_TEXT.includes('P7 —'), 'no parameter-and-level title in print');
  assert.equal(countOf(PRINT_TEXT, 'L2'), 1, 'printed level code appears in the pill only');
  assert.equal(countOf(PRINT_TEXT, RP22_P7_DESCRIPTION), 1, 'one printed official description');
  assert.equal(countOf(PRINT_TEXT, 'Spatial Resolution'), 1, 'one printed page heading');
  assert.equal(countOf(PRINT_TEXT, 'RP22 Parameter 7'), 1, 'one printed parameter line');
  assert.ok(printSource.includes('RP22 Parameter 7'), 'print subtitle identifies the parameter');
});

test('the repeated "P{n} — L{n}" pattern is gone from every Visual Report page', () => {
  const dir = path.resolve('src/components/report/client');
  const files = fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.jsx'))
    .map((entry) => path.join(dir, entry.name));
  const offenders = files.filter((file) => /— \{levelLabel\}/.test(fs.readFileSync(file, 'utf8')));
  assert.deepEqual(offenders, [], 'no result card titles itself with the parameter number and level code');
  assert.equal(parameterResultHeading('L2'), 'Level 2', 'levels are spoken as words');
  assert.equal(parameterResultHeading('L4'), 'Level 4');
});

test('the page explains where the front wides ideally want to be', () => {
  // 1 — where they are, 2 — where the ideal median position is, 3 — how far
  // they deviate, 4 — why that gives the level it does.
  assert.ok(SCREEN_TEXT.includes('Front Wide Placement'), 'the placement guidance is present');
  assert.ok(
    SCREEN_TEXT.includes(
      'The ideal front wide position is the median angle between the screen speaker and the adjacent surround speaker.',
    ),
    'the ideal position is defined in words',
  );
  assert.ok(SCREEN_TEXT.includes('Ideal front wide angle — left 45.0°, right 45.0°'), 'the ideal angle is stated per side');
  assert.ok(SCREEN_TEXT.includes('Actual front wide angle — left 51.1°, right 48.5°'), 'the actual angle is stated per side');
  assert.ok(SCREEN_TEXT.includes('Deviation from median — left 6.1°, right 3.5°'), 'the deviation is stated per side');
  assert.ok(
    SCREEN_TEXT.includes(
      'In this design, the front wide speakers sit 6.1° from the ideal median position, giving a Level 2 result.',
    ),
    'the level is explained by the deviation',
  );
  assert.ok(
    !SCREEN_TEXT.includes('positioned relative to the median angle between the screen and surround channels'),
    'the vague sentence is removed',
  );
  // The result stands, unchanged.
  assert.ok(SCREEN_TEXT.includes('Level 2'), 'the level is preserved');
  assert.ok(SCREEN_TEXT.includes('Maximum deviation from median: 6.1°'), 'the maximum deviation is preserved');
  assert.ok(SCREEN_TEXT.includes(RP22_P7_DESCRIPTION), 'the official RP22 wording is preserved');
  // The same explanation prints.
  assert.ok(PRINT_TEXT.includes('Front Wide Placement'), 'the guidance prints');
  assert.ok(PRINT_TEXT.includes('Ideal front wide angle — left 45.0°, right 45.0°'), 'the ideal angle prints');
  assert.ok(PRINT_TEXT.includes('giving a Level 2 result'), 'the level explanation prints');
  // Copy rules: no parameter-and-level title, no system copy.
  for (const banned of ['P7 —', 'The system meets', 'System Architecture']) {
    assert.ok(!SCREEN_TEXT.includes(banned), `the page does not say "${banned}"`);
    assert.ok(!PRINT_TEXT.includes(banned), `the printed page does not say "${banned}"`);
  }
  assert.ok(guidanceSource.includes('Front Wide Placement'), 'the copy lives in the guidance component');
});

test('without published per-side angles the page degrades gracefully', () => {
  const bare = { ...p7Data, ideal: null };
  const markup = renderToStaticMarkup(
    React.createElement(ClientP7FrontWides, { ...baseProps, p7Data: bare }),
  );
  const text = textOf(markup);
  // No angle rows are invented, and no zero angle is claimed.
  assert.ok(!text.includes('Ideal front wide angle'), 'no ideal angle row without a published angle');
  assert.ok(!text.includes('Actual front wide angle'), 'no actual angle row without a published angle');
  assert.ok(!text.includes('0.0°'), 'a missing angle is never read as zero');
  // The drawing keeps its original median reference and legend.
  assert.ok(markup.includes('stroke-dasharray="6 4"'), 'the median reference line still draws');
  assert.ok(text.includes('Median reference'), 'the original legend entry is kept');
  assert.ok(!text.includes('IDEAL'), 'no ideal marker is invented');
  // The placement statement and the published deviation still explain the result.
  assert.ok(text.includes('Front Wide Placement'), 'the guidance block still renders');
  assert.ok(text.includes('giving a Level 2 result'), 'the level is still explained');
});

test('the ideal median drawing follows the published angles', () => {
  const drawing = SCREEN.slice(SCREEN.indexOf('<svg'), SCREEN.indexOf('</svg>'));
  const dots = [...drawing.matchAll(/<circle cx="([\d.-]+)" cy="([\d.-]+)" r="7"/g)]
    .map((match) => ({ x: Number(match[1]), y: Number(match[2]) }));
  const markers = [...drawing.matchAll(/<rect x="([\d.-]+)" y="([\d.-]+)" width="8" height="8"/g)]
    .map((match) => ({ x: Number(match[1]), y: Number(match[2]) }));
  assert.equal(dots.length, 2, 'both front wides are drawn');
  assert.equal(markers.length, 2, 'one ideal median marker per front wide');
  // Left wide first. The published ideal angle is nearer the centre line and the
  // screen than the actual position; the right wide mirrors it. If the engine's
  // azimuth were converted with the wrong chirality these would flip.
  assert.ok(markers[0].x > dots[0].x && markers[0].y < dots[0].y, 'the left ideal sits toward the centre line');
  assert.ok(markers[1].x < dots[1].x && markers[1].y < dots[1].y, 'the right ideal sits toward the centre line');
  // The arcs are labelled with the published per-side deviations.
  assert.ok(drawing.includes('>6.1°<'), 'the left arc carries its published deviation');
  assert.ok(drawing.includes('>3.5°<'), 'the right arc carries its published deviation');
  // The drawing states no result of its own.
  assert.ok(!/Level [1-4]/.test(drawing), 'the drawing states no level');
});