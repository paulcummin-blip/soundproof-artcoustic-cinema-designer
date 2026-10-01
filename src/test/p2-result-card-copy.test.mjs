// p2-result-card-copy.test.mjs
// ---------------------------------------------------------------------------
// The Visual Report P2 (Spatial Resolution) result card must state the result
// once, in RP22 language, with no repetition of the parameter number, the
// level code, or a second summary of the same result.
//
//   TEST 1  Card says "Level 4", never "P2 — L4"
//   TEST 2  The official RP22 parameter description is the card's explanation
//   TEST 3  "The system meets..." copy is gone
//   TEST 4  The "System Architecture" duplicate block is gone
//   TEST 5  No duplicate L4 / Parameter 2 statement remains
//   TEST 6  The Current System block is preserved, ahead of the result
//   TEST 7  Reading the real component: screen card, print support, print drawing
//   TEST 8  The level heading authority speaks levels as words
//   TEST 9  No calculation, grading or selector data changed
// ---------------------------------------------------------------------------
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import ClientP2SystemArchitecture from '../components/report/client/ClientP2SystemArchitecture.jsx';
import PrintP2Content from '../components/report/client/print/PrintP2Content.jsx';
import { parameterResultHeading } from '../components/report/client/parameterResultCopy.js';
import { getOfficialRp22Title } from '../components/utils/rp22OfficialTitles.js';
import { selectClientP2SystemArchitecture } from '../components/report/client/selectClientP2SystemArchitecture.js';

const COMPONENT_PATH = path.resolve('src/components/report/client/ClientP2SystemArchitecture.jsx');
const PRINT_PATH = path.resolve('src/components/report/client/print/PrintP2Content.jsx');
const source = fs.readFileSync(COMPONENT_PATH, 'utf8');
const printSource = fs.readFileSync(PRINT_PATH, 'utf8');

const RP22_P2_DESCRIPTION =
  'Decoder/renderer capability and discretely rendered speaker configuration, excl. subwoofers';

// 9.1.6: 9 bed-layer speakers, 6 overheads, 2 subwoofers → 15 discrete channels.
const p2Data = {
  level: 'L4',
  discreteCount: 15,
  configuration: '9.1.6',
  bedCount: 9,
  overheadCount: 6,
  subCount: 2,
  subwoofers: [],
  upgradePath: null,
};

const placedSpeakers = [
  ...Array.from({ length: 9 }, (_, i) => ({ role: `bed-${i}`, position: { x: 1 + i * 0.2, y: 0.5 } })),
  ...Array.from({ length: 6 }, (_, i) => ({ role: `T${i}`, position: { x: 1 + i * 0.2, y: 2.5 } })),
];
const seatingPositions = [{ id: 's1', x: 2.4, y: 4.2 }];

const noop = () => {};

const render = (props) => renderToStaticMarkup(
  React.createElement(ClientP2SystemArchitecture, {
    p2Data,
    roomDims: { widthM: 5, lengthM: 7, heightM: 2.8 },
    seatingPositions,
    rsp: { x: 2.5, y: 4.2 },
    screenFrontPlaneM: 0.2,
    screenWidthM: 3,
    placedSpeakers,
    ...props,
  }),
);
void noop;

const SCREEN = render({});
const SUPPORT = render({ print: true, printPart: 'support' });
const DRAWING = render({ print: true, printPart: 'drawing' });
const PRINT = renderToStaticMarkup(
  React.createElement(PrintP2Content, {
    p2Data,
    roomDims: { widthM: 5, lengthM: 7, heightM: 2.8 },
    seatingPositions,
    rsp: { x: 2.5, y: 4.2 },
    screenFrontPlaneM: 0.2,
    screenWidthM: 3,
    placedSpeakers,
  }),
);

const textOf = (markup) => markup.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const SCREEN_TEXT = textOf(SCREEN);
const SUPPORT_TEXT = textOf(SUPPORT);
const PRINT_TEXT = textOf(PRINT);
const countOf = (haystack, needle) => haystack.split(needle).length - 1;

test('card says "Level 4", never "P2 — L4"', () => {
  assert.ok(SCREEN_TEXT.includes('Level 4'), 'the card heading reads Level 4');
  assert.ok(!SCREEN_TEXT.includes('P2 — L4'), '"P2 — L4" is removed');
  assert.ok(!SCREEN_TEXT.includes('P2 —'), 'no parameter-number-and-level title remains');
  assert.ok(!source.includes('P2 — {levelLabel}'), 'the code no longer builds a "P2 — L4" title');
  // The level code appears once, in the pill — nowhere else.
  assert.equal(countOf(SCREEN_TEXT, 'L4'), 1, 'L4 appears only in the pill');
});

test('the official RP22 parameter description is the card explanation', () => {
  assert.ok(SCREEN_TEXT.includes(RP22_P2_DESCRIPTION), 'official RP22 wording used');
  assert.equal(SCREEN_TEXT.split(RP22_P2_DESCRIPTION).length - 1, 1, 'stated once, not repeated');
  assert.equal(getOfficialRp22Title(2), RP22_P2_DESCRIPTION, 'wording comes from the RP22 authority');
  // The page still identifies the parameter, concisely, in its subtitle.
  assert.ok(SCREEN_TEXT.includes('RP22 Parameter 2'), 'the page identifies the parameter');
});

test('"The system meets..." copy is gone', () => {
  assert.ok(!SCREEN_TEXT.includes('The system meets'), 'removed from the screen page');
  assert.ok(!SUPPORT_TEXT.includes('The system meets'), 'removed from the printed page');
  assert.ok(!source.includes('The system meets'), 'removed from the component');
});

test('the "System Architecture" duplicate block is gone', () => {
  assert.ok(!SCREEN_TEXT.includes('System Architecture'), 'removed from the screen page');
  assert.ok(!SUPPORT_TEXT.includes('System Architecture'), 'absent from the printed page');
  assert.ok(!source.includes('System Architecture\n'), 'the rendered heading is removed');
  assert.ok(!source.includes('Summary callout'), 'the duplicate summary callout card is removed');
});

test('no duplicate L4 / Parameter 2 statement remains', () => {
  assert.ok(!SCREEN_TEXT.includes('The current layout achieves'), 'duplicate summary removed');
  assert.ok(!SCREEN_TEXT.includes('achieves L4 for RP22 Parameter 2'), 'duplicate result sentence removed');
  assert.ok(!SCREEN_TEXT.includes('RP22 Parameter 2 with 15 discrete speaker channels'), 'no restated result');
  // The result is still stated exactly once: heading, description, configuration.
  assert.equal(countOf(SCREEN_TEXT, 'Level 4'), 1, 'one level heading');
  assert.equal(countOf(SCREEN_TEXT, '9.1.6 configuration'), 1, 'one configuration line');
});

test('the Current System block is preserved, ahead of the result', () => {
  assert.ok(SCREEN_TEXT.includes('Current system'), 'the block headline survives');
  assert.ok(SCREEN_TEXT.includes('9 bed-layer speakers'), 'bed-layer count');
  assert.ok(SCREEN_TEXT.includes('6 overhead speakers'), 'overhead count');
  assert.ok(SCREEN_TEXT.includes('2 subwoofers'), 'subwoofer count');
  assert.ok(SCREEN_TEXT.includes('15 discrete main channels'), 'discrete channel count');
  const currentSystem = SCREEN_TEXT.indexOf('Current system');
  const result = SCREEN_TEXT.indexOf('Level 4');
  assert.ok(currentSystem !== -1 && currentSystem < result, 'Current System leads the result card');
});

test('reading the real component: screen card, print support, print drawing', () => {
  // Screen: plan drawing + the support region.
  assert.ok(SCREEN.includes('<svg'), 'the plan drawing renders');
  // Printed support region carries the same trimmed card.
  assert.ok(SUPPORT_TEXT.includes('Current system'), 'printed Current System block');
  assert.ok(SUPPORT_TEXT.includes('Level 4'), 'printed Level 4 heading');
  assert.ok(SUPPORT_TEXT.includes(RP22_P2_DESCRIPTION), 'printed official RP22 description');
  assert.ok(SUPPORT_TEXT.includes('9.1.6 configuration'), 'printed configuration line');
  assert.equal(countOf(SUPPORT_TEXT, 'L4'), 1, 'printed level code appears in the pill only');
  assert.ok(!SUPPORT_TEXT.includes('P2 —'), 'no parameter-and-level title in print');
  // Printed drawing region is the plan only — no duplicated result block.
  assert.ok(DRAWING.includes('<svg'), 'printed drawing carries the plan');
  assert.ok(!textOf(DRAWING).includes('Level 4'), 'printed drawing carries no result heading');
  // The print shell keeps one page heading and one subtitle, with no repetition.
  assert.equal(countOf(PRINT_TEXT, 'Spatial Resolution'), 1, 'one printed page heading');
  assert.equal(countOf(PRINT_TEXT, 'RP22 Parameter 2'), 1, 'one printed parameter line');
  assert.equal(countOf(PRINT_TEXT, RP22_P2_DESCRIPTION), 1, 'one printed official description');
  assert.ok(printSource.includes('RP22 Parameter 2'), 'print subtitle identifies the parameter');
});

test('the level heading authority speaks levels as words', () => {
  assert.equal(parameterResultHeading('L4'), 'Level 4');
  assert.equal(parameterResultHeading(4), 'Level 4');
  assert.equal(parameterResultHeading('L2'), 'Level 2');
  assert.equal(parameterResultHeading('FAIL'), 'FAIL');
  assert.equal(parameterResultHeading('N/A'), 'N/A');
  assert.equal(parameterResultHeading(null), null);
  assert.equal(parameterResultHeading(''), null);
});

test('no calculation, grading or selector data changed', () => {
  // The selector still publishes the same authoritative fields.
  const analysis = { roomResultsByParameter: { 2: { status: 'scored', level: 'L4', value: 15, configuration: '9.1.6' } } };
  const selected = selectClientP2SystemArchitecture(analysis, placedSpeakers, []);
  assert.equal(selected.level, 'L4');
  assert.equal(selected.discreteCount, 15);
  assert.equal(selected.configuration, '9.1.6');
  assert.equal(selected.bedCount, 9);
  assert.equal(selected.overheadCount, 6);
  // No grading or threshold logic was introduced — the changed files import the
  // copy authority and nothing that grades, and keep their original authorities.
  const gradingImports = /(bassGradingAuthority|rp22LevelCalculation|rp22BassMetrics|resolveRp22DesignValue|headroomPolicy)/;
  for (const src of [source, printSource]) {
    assert.ok(!gradingImports.test(src), 'no grading authority imported');
    assert.ok(!/function\s+\w*[Gg]rade/.test(src), 'no grading function added');
  }
  assert.ok(source.includes('resolveGradeToken(level).token.bg'), 'the pill still reads the canonical grade token');
});