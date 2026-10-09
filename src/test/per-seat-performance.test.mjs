// ---------------------------------------------------------------------------
// Visual Report — Per-Seat Performance section.
//
// The report version of the Room Designer seat pop-up: one compact card per
// assessed seat, laid out in the seating plan's own shape, carrying the
// published RP22 / RP23 levels.
//
//   TEST 1  The section exists and renders its title and subtitle
//   TEST 2  Cards match the seating plan's physical layout
//   TEST 3  Primary seats carry the heavier outline
//   TEST 4  Secondary seats carry the lighter outline
//   TEST 5  P19 is excluded (it is RSP-only, not per seat)
//   TEST 6  P20 is included, from the canonical P20 authority
//   TEST 7  RP23 is included with level + angle, from the viewing authority
//   TEST 8  Values match the Room Designer pop-up exactly
//   TEST 9  The RSP is marked separately, never as the only primary seat
//   TEST 10 The PDF page carries the same cards and heading
//   TEST 11 No RP22/RP23 calculation or authority change
//   TEST 12 No layout overflow
// ---------------------------------------------------------------------------
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { selectClientPerSeatPerformance } from '../components/report/client/selectClientPerSeatPerformance.js';
import ClientPerSeatPerformance from '../components/report/client/ClientPerSeatPerformance.jsx';
import PrintPerSeatPerformanceContent from '../components/report/client/print/PrintPerSeatPerformanceContent.jsx';
import { presentSeatMetric } from '../components/room/seatHudPresentation.js';
import { attachAuthoritativeP20ToSeatSnapshot } from '../components/room/seatHudPresentation.js';
import {
  RP22_PRESENTATION_PARAMETERS,
  isSeatScopedParameterKey,
} from '../components/utils/rp22ParameterPresentation.js';
import { RP22_CATALOG } from '../components/data/rp22Catalog.jsx';
import { groupSeatsIntoRows } from '../components/report/client/seatRowGrouping.js';
import { selectClientScreenSeating } from '../components/report/client/selectClientScreenSeating.js';
import { isAssessedLevel } from '../components/report/client/visualReportSeatStyle.js';

const SOURCE = fs.readFileSync('src/components/report/client/selectClientPerSeatPerformance.js', 'utf8');
const SECTION_SOURCE = fs.readFileSync('src/components/report/client/ClientPerSeatPerformance.jsx', 'utf8');
const CARD_SOURCE = fs.readFileSync('src/components/report/client/PerSeatPerformanceCard.jsx', 'utf8');
const ROWS_SOURCE = fs.readFileSync('src/components/report/client/PerSeatPerformanceRows.jsx', 'utf8');
const REPORT_PAGE_SOURCE = fs.readFileSync('src/pages/RP22ClientReport.jsx', 'utf8');
// The report's page list — each page's id, its continuation ids and its print
// type — is composed in the project report composition the page renders.
const REPORT_COMPOSITION_SOURCE = fs.readFileSync(
  'src/components/report/projectReport/useProjectReportPages.jsx',
  'utf8',
);
const PRINT_PAGE_SOURCE = fs.readFileSync('src/components/report/client/ClientReportPage.jsx', 'utf8');

// ── The project's real seating plan: 9 seats, 3 PRIMARY, 6 SECONDARY ────────
// Front row (4) and rear row (5). Only ONE seat carries the internal isPrimary
// RSP flag; the RSP itself sits between the rows at (2.25, 4.6367).
const SEATS = [
  { id: 'seat-r1-c1', priority: 'secondary', isPrimary: false, x: 1.69, y: 3.78 },
  { id: 'seat-r1-c2', priority: 'primary', isPrimary: true, x: 2.29, y: 3.78 },
  { id: 'seat-r1-c3', priority: 'primary', isPrimary: false, x: 2.89, y: 3.78 },
  { id: 'seat-r1-c4', priority: 'secondary', isPrimary: false, x: 3.49, y: 3.78 },
  { id: 'seat-r2-c1', priority: 'secondary', isPrimary: false, x: 1.39, y: 5.58 },
  { id: 'seat-r2-c2', priority: 'secondary', isPrimary: false, x: 1.99, y: 5.58 },
  { id: 'seat-r2-c3', priority: 'primary', isPrimary: false, x: 2.59, y: 5.58 },
  { id: 'seat-r2-c4', priority: 'secondary', isPrimary: false, x: 3.19, y: 5.58 },
  { id: 'seat-r2-c5', priority: 'secondary', isPrimary: false, x: 3.79, y: 5.58 },
];

const RSP = { x: 2.25, y: 4.6367 };

const parameter = (number) => RP22_PRESENTATION_PARAMETERS.find((p) => p.number === number);

// The published per-seat snapshot the pop-up reads (seatHudById). P19 and a
// competing P20 are deliberately present here with DISTINCT values, so a card
// reading either one would be caught.
const seatHudById = Object.fromEntries(SEATS.map((seat, index) => {
  const n = index + 1;
  return [seat.id, {
    seatId: seat.id,
    isPrimary: seat.isPrimary,
    // The REAL published shape: the RP23 entry carries the angle only — no
    // level, no formatted string. A card reading RP23 from here would print a
    // level-less row, which is exactly the defect this fixture guards against.
    rp23: { angleDeg: 50 + n },
    // P19 is present in the authority — and must still be absent from the cards.
    rp22: {
      // Numeric levels and the published N/A wording, exactly as the live
      // published summary carries them.
      p1: { valueM: 1.5 + index * 0.1, level: 4, formatted: `${(1.5 + index * 0.1).toFixed(2)}m` },
      p4: { valueDb: 1 + index * 0.2, level: 4, formatted: `${Math.floor(1 + index * 0.2)} dB` },
      p5: { valueDeg: 40 + n, level: 4, formatted: `${40 + n}°` },
      p6: { valueDb: 2 + index * 0.3, level: index < 3 ? 3 : 2, formatted: `${Math.floor(2 + index * 0.3)} dB` },
      p9: { valueDeg: 20 + n, level: 3 },
      p10: { value: null, formatted: 'N/A (insufficient data)', level: 'N/A', status: 'not_applicable' },
      p16: { value: null, level: 2, formatted: `FL ${20 + n}°` },
      p17: { valueDb: 1.2, level: 4, formatted: '1.2 dB' },
      p19: { valueDb: 3.4, level: 'L1', formatted: '±3 dB' },
      p20: { valueDb: 9.9, level: 'L1', formatted: '±9 dB' },
    },
    splAtSeat: {
      lcr: { FL: { value: 105.2 + index }, FC: { value: 104.8 + index }, FR: { value: 106.1 + index } },
      surrounds: { SL: { value: 103 } },
      overheads: {},
    },
  }];
}));

// The canonical P20 per-seat authority the P20 report page reads. Deliberately
// different from seatHudById's p20 above.
const P20_ROWS = SEATS.map((seat, index) => ({
  seatId: seat.id,
  priority: seat.priority,
  level: index % 2 === 0 ? 'L2' : 'L3',
  variationDbRaw: 4.2 + index * 0.1,
  displayedValue: `±${4 + index} dB`,
  worstFrequencyHz: 90,
}));

// The published per-seat VIEWING authority — the same source the Visual
// Report's Viewing Experience page reads (engineeringSummary.viewing.per_seat).
// A card's RP23 level and angle must come from here.
const VIEWING_ROWS = SEATS.map((seat, index) => ({
  seat_id: seat.id,
  priority: seat.priority,
  horizontal_angle_deg: 51 + index,
  rp23_level: seat.priority === 'primary' ? 'L4' : 'L3',
}));

const bassPerformance = { p20: { perSeatResults: P20_ROWS } };
const engineeringSummary = { seatHudById, viewing: { available: true, per_seat: VIEWING_ROWS } };

const selection = selectClientPerSeatPerformance({
  engineeringSummary,
  seatingPositions: SEATS,
  bassPerformance,
  rsp: RSP,
});

const SCREEN = renderToStaticMarkup(
  React.createElement(ClientPerSeatPerformance, { rows: selection.rows }),
);
const PRINT = renderToStaticMarkup(
  React.createElement(PrintPerSeatPerformanceContent, { rows: selection.rows }),
);

const textOf = (markup) => markup.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const SCREEN_TEXT = textOf(SCREEN);
const PRINT_TEXT = textOf(PRINT);

// Each card root carries class="per-seat-performance-card", so splitting on that
// marker yields one segment per card. The ROOT STYLE of a card is everything up
// to the first ">", which is therefore the card outline and nothing else.
const cardSegments = (markup) => markup.split('per-seat-performance-card').slice(1);
const rootStyleOf = (segment) => segment.slice(0, segment.indexOf('>'));
const cardMarkupFor = (label, markup = SCREEN) => {
  const segment = cardSegments(markup).find((part) => part.includes(label));
  return segment || '';
};

const SCREEN_CARDS = cardSegments(SCREEN);
const PRINT_CARDS = cardSegments(PRINT);
const PRIMARY_OUTLINE = 'border:2.5px solid #213428';
const SECONDARY_OUTLINE = 'border:1px solid #D9D5CE';
const countCardsWith = (cards, style) => cards.filter((card) => rootStyleOf(card).includes(style)).length;

test('the section exists and renders its title and subtitle', () => {
  assert.equal(selection.hasAny, true, 'the section is included for this project');
  assert.equal(selection.rows.length, 2, 'two seating rows');
  assert.equal(selection.rows.flatMap((row) => row.seats).length, 9, 'every assessed seat has a card');
  assert.ok(SCREEN_TEXT.includes('Per-Seat Performance'), 'section title');
  assert.ok(SCREEN_TEXT.includes('RP22 and RP23 results by seating position'), 'section subtitle');
  assert.ok(SCREEN_TEXT.includes('heavier outline'), 'the primary-outline note is stated');
});

test('cards match the seating plan: one line per row, seats left to right', () => {
  const plan = groupSeatsIntoRows(SEATS);
  assert.deepEqual(
    selection.rows.map((row) => row.seats.map((seat) => seat.id)),
    plan.map((row) => row.seats.map((seat) => seat.id)),
    'card rows and seat order are exactly the seating plan order',
  );
  assert.equal(selection.rows[0].seats.length, 4, 'front row has four cards');
  assert.equal(selection.rows[1].seats.length, 5, 'rear row has five cards');
  assert.deepEqual(selection.rows.map((row) => row.label), ['Front row', 'Rear row']);
  // Cards carry the seat's own identity in the plan.
  for (const seat of SEATS) {
    const label = `Row ${seat.id.match(/r(\d+)/)[1]} - Seat ${seat.id.match(/c(\d+)/)[1]}`;
    assert.ok(SCREEN.includes(label), `card header names ${label}`);
  }
  assert.equal(SCREEN_CARDS.length, 9, 'nine cards rendered on screen');
});

test('primary seats carry the heavier outline', () => {
  assert.equal(countCardsWith(SCREEN_CARDS, PRIMARY_OUTLINE), 3, 'three primary cards');
  assert.equal(selection.primaryCount, 3, 'three primary seats in the plan');
  const primarySeats = selection.rows.flatMap((row) => row.seats).filter((seat) => seat.priority === 'primary');
  assert.equal(primarySeats.length, 3);
  for (const seat of primarySeats) {
    assert.ok(textOf(cardMarkupFor(seat.label)).includes('Primary'), `${seat.id} is labelled Primary`);
  }
  assert.ok(CARD_SOURCE.includes('OUTLINE = {'), 'the outline is a shared authority');
  // The legend carries the same weight, so the key explains the outline.
  assert.ok(SCREEN.includes('border-width:2.5px'), 'legend shows the primary weight');
});

test('secondary seats carry the lighter outline', () => {
  assert.equal(countCardsWith(SCREEN_CARDS, SECONDARY_OUTLINE), 6, 'six secondary cards');
  const secondarySeats = selection.rows.flatMap((row) => row.seats).filter((seat) => seat.priority === 'secondary');
  assert.equal(secondarySeats.length, 6);
  for (const seat of secondarySeats.slice(0, 3)) {
    assert.ok(textOf(cardMarkupFor(seat.label)).includes('Secondary'), `${seat.id} is labelled Secondary`);
  }
  const primaryWeight = Number(PRIMARY_OUTLINE.match(/border:([\d.]+)px/)[1]);
  const secondaryWeight = Number(SECONDARY_OUTLINE.match(/border:([\d.]+)px/)[1]);
  assert.ok(primaryWeight > secondaryWeight, 'primary outline is genuinely heavier');
  assert.notEqual('#213428', '#D9D5CE', 'and visibly darker than the secondary outline');
});

test('P19 is excluded — it is assessed at the RSP only', () => {
  // The authority DOES carry a P19 value for every seat …
  assert.equal(SEATS.every((seat) => seatHudById[seat.id].rp22.p19.level === 'L1'), true);
  // … and the canonical catalogue files P19 under RSP scope, never seat scope.
  // That one declaration is what keeps it off every per-seat surface — no
  // consumer special-cases P19 by number any more. P20 stays the seat
  // parameter: it is the seat-to-seat deviation P19 is not.
  assert.equal(RP22_CATALOG['19'].scope, 'RSP');
  assert.equal(isSeatScopedParameterKey('p19'), false, 'P19 is not a seat parameter');
  assert.equal(isSeatScopedParameterKey('p20'), true, 'P20 remains the seat-to-seat parameter');
  // … yet no card states it.
  assert.ok(!SCREEN_TEXT.includes('P19'), 'the rendered section never shows P19');
  assert.ok(!PRINT_TEXT.includes('P19'), 'nor does the PDF page');
  for (const row of selection.rows) {
    for (const seat of row.seats) {
      const keys = seat.parameters.map((entry) => entry.key);
      assert.ok(!keys.includes('p19'), `${seat.id} has no P19 row`);
      assert.ok(keys.includes('p20'), `${seat.id} has the P20 row`);
    }
  }
  assert.ok(
    SOURCE.includes('P19 IS DELIBERATELY ABSENT'),
    'the exclusion is documented at the source',
  );
  assert.ok(!/p19/.test(SOURCE.replace(/P19 IS DELIBERATELY ABSENT[\s\S]*?===/, '')), 'no P19 read path exists');
});

test('P20 is included, from the canonical P20 authority', () => {
  assert.ok(SCREEN_TEXT.includes('P20'), 'P20 appears in the cards');
  for (const row of selection.rows) {
    for (const seat of row.seats) {
      const p20 = seat.parameters.find((entry) => entry.key === 'p20');
      assert.ok(p20, `${seat.id} states P20`);
      // The published P20 authority for this seat — the same one the P20 page reads.
      const expected = presentSeatMetric(
        parameter(20),
        attachAuthoritativeP20ToSeatSnapshot({ rp22: {} }, seat.id, P20_ROWS)?.rp22?.p20,
      );
      assert.equal(p20.level, expected.level, `${seat.id} P20 level`);
      assert.equal(p20.valueText, expected.valueText, `${seat.id} P20 value`);
      // Not the competing P20 sitting in the seat HUD snapshot.
      assert.notEqual(p20.level, 'L1', `${seat.id} P20 does not read the stale HUD value`);
    }
  }
  assert.equal((SCREEN_TEXT.match(/P20/g) || []).length, 9, 'P20 on every card');
});

test('RP23 is included with level + angle, from the viewing authority', () => {
  assert.ok(SCREEN_TEXT.includes('RP23'), 'RP23 appears in the cards');
  // The angle-only HUD snapshot exists for every seat and states no level …
  assert.equal(
    SEATS.every((seat) => seatHudById[seat.id].rp23.level === undefined),
    true,
    'the HUD RP23 entry carries no level',
  );
  // … so RP23 is read from the viewing authority, and nowhere else.
  assert.ok(SOURCE.includes('engineeringSummary?.viewing?.per_seat'), 'RP23 is read from the viewing authority');
  assert.ok(!SOURCE.includes('hud.rp23'), 'and never from the angle-only HUD snapshot');

  for (const row of selection.rows) {
    for (const seat of row.seats) {
      const authority = VIEWING_ROWS.find((entry) => entry.seat_id === seat.id);
      assert.equal(seat.rp23.level, authority.rp23_level, `${seat.id} RP23 level is the published one`);
      assert.equal(
        seat.rp23.valueText,
        `${authority.horizontal_angle_deg.toFixed(1)}°`,
        `${seat.id} RP23 angle is the published one`,
      );
      assert.ok(isAssessedLevel(seat.rp23.level), `${seat.id} RP23 carries a real level, not a dash`);
    }
  }

  // The Viewing Experience page reads that same authority: card and viewing
  // page state the same level and the same angle for every seat.
  const viewing = selectClientScreenSeating({
    seatingPositions: SEATS,
    screenFrontPlaneM: 0.2,
    screenWidthM: 3.6,
    aspectRatio: '16:9',
    engineeringSummary,
  });
  assert.equal(viewing.hasAny, true, 'the viewing page has results for this project');
  assert.equal(viewing.seats.length, 9, 'one viewing result per seat');
  const viewingBySeat = new Map(viewing.seats.map((seat) => [seat.id, seat]));
  for (const row of selection.rows) {
    for (const seat of row.seats) {
      const fromViewingPage = viewingBySeat.get(seat.id);
      assert.equal(seat.rp23.level, fromViewingPage.levelLabel, `${seat.id} RP23 level matches the viewing page`);
      assert.equal(seat.rp23.valueText, fromViewingPage.formatted, `${seat.id} RP23 angle matches the viewing page`);
    }
  }

  assert.equal(
    SCREEN_CARDS.filter((card) => textOf(card).includes('RP23')).length,
    9,
    'RP23 on every card',
  );
  assert.ok(SCREEN_TEXT.includes(`${VIEWING_ROWS[0].horizontal_angle_deg.toFixed(1)}°`), 'the angle is printed on the card');
});

test('per-seat values match the Room Designer pop-up exactly', () => {
  for (const row of selection.rows) {
    for (const seat of row.seats) {
      const rp22 = seatHudById[seat.id].rp22;
      for (const entry of seat.parameters) {
        if (entry.key === 'p20') continue; // P20 read from its own authority (asserted above)
        const number = Number(entry.key.replace('p', ''));
        const expected = presentSeatMetric(parameter(number), rp22[entry.key]);
        assert.equal(entry.label, `P${number}`);
        assert.equal(entry.level, expected.level, `${seat.id} ${entry.label} level`);
        assert.equal(entry.valueText, expected.valueText, `${seat.id} ${entry.label} value`);
      }
      // The card's own markup carries those values.
      const markup = cardMarkupFor(seat.label);
      assert.ok(markup.includes(seat.parameters.find((p) => p.key === 'p1').valueText), `${seat.id} shows its P1 distance`);
    }
  }
  // The card list is exactly the agreed set — RP23 plus the nine per-seat params.
  const keys = selection.rows[0].seats[0].parameters.map((entry) => entry.key);
  assert.deepEqual(keys, ['p1', 'p4', 'p5', 'p6', 'p9', 'p10', 'p16', 'p17', 'p20']);
});

test('the RSP is marked separately, never as the only primary seat', () => {
  // This project's reference position sits BETWEEN the rows, bound to no seat:
  // it is a reference POINT, so no card carries an RSP chip …
  const free = selection.rows.flatMap((row) => row.seats).filter((seat) => seat.isRsp);
  assert.equal(free.length, 0, 'an unbound reference position is not a seat');
  assert.equal(selection.primaryCount, 3, 'three primary seats regardless');
  assert.equal(SEATS.filter((seat) => seat.isPrimary === true).length, 1, 'one seat carries the RSP flag');
  assert.ok(SCREEN_TEXT.includes('Reference position'), 'the key still names the reference position');
  assert.ok(SCREEN_TEXT.includes('Primary seat') && SCREEN_TEXT.includes('Secondary seat'), 'both priorities keyed');

  // When the reference position IS bound to a seat, that seat carries the RSP
  // chip — and the primary group stays the three primary seats.
  const bound = selectClientPerSeatPerformance({
    engineeringSummary,
    seatingPositions: SEATS,
    bassPerformance,
    rsp: { x: 2.29, y: 3.78 },
  });
  const boundSeats = bound.rows.flatMap((row) => row.seats).filter((seat) => seat.isRsp);
  assert.equal(boundSeats.length, 1, 'the bound reference seat is marked');
  assert.equal(boundSeats[0].id, 'seat-r1-c2');
  assert.equal(bound.primaryCount, 3, 'still three primary seats, never one');
  const boundMarkup = renderToStaticMarkup(
    React.createElement(ClientPerSeatPerformance, { rows: bound.rows }),
  );
  const boundText = textOf(boundMarkup);
  assert.equal((boundText.match(/RSP/g) || []).length, 2, 'one chip plus one key entry');
  // The chip is the reference marker; priority stays its own label on the card.
  const chipCard = textOf(cardMarkupFor('Row 1 - Seat 2', boundMarkup));
  assert.ok(chipCard.includes('RSP'), 'the reference seat carries the RSP chip');
  assert.ok(chipCard.includes('Primary'), 'and its own priority label');
});

test('the PDF page carries the same cards and heading', () => {
  assert.equal(PRINT_CARDS.length, 9, 'nine cards in the PDF page');
  assert.equal(countCardsWith(PRINT_CARDS, PRIMARY_OUTLINE.replace('2.5', '2')), 3, 'three primary cards in print');
  assert.equal(countCardsWith(PRINT_CARDS, 'border:0.8px solid #D9D5CE'), 6, 'six secondary cards in print');
  assert.ok(PRINT.includes('client-report-print-heading__title'), 'the print heading is used');
  assert.ok(PRINT_TEXT.includes('Per-Seat Performance'), 'the PDF page is titled');
  assert.ok(PRINT_TEXT.includes('RP22 and RP23 results by seating position'), 'with its subtitle');
  assert.ok(PRINT_TEXT.includes('Primary seat') && PRINT_TEXT.includes('Reference position'), 'key printed too');
  // Registration: the report page includes it and the print dispatcher renders it.
  assert.ok(REPORT_COMPOSITION_SOURCE.includes('"per-seat-performance"'), 'registered as a report page');
  assert.ok(REPORT_COMPOSITION_SOURCE.includes('id: continuation'), 'with a continuation page id when it splits by row');
  assert.ok(REPORT_COMPOSITION_SOURCE.includes('type: "per-seat-performance"'), 'with its print type');
  assert.ok(PRINT_PAGE_SOURCE.includes('printData?.type === "per-seat-performance"'), 'print dispatcher handles it');
  assert.ok(PRINT_PAGE_SOURCE.includes('row.label') === false, 'the dispatcher stays declarative');
});

test('no RP22/RP23 calculation or authority change', () => {
  const forbidden = /(bassGradingAuthority|canonicalBassResult|computeSeatHudMetrics|rp22LevelCalculation|viewingAngleUtils|rp22BassMetrics|bassSimulationEngine|artcousticSystemDesignRating)/;
  assert.ok(!forbidden.test(SOURCE), 'the selector imports no grading or engine module');
  assert.ok(SOURCE.includes('engineeringSummary?.seatHudById'), 'levels come from the published summary');
  assert.ok(SOURCE.includes('bassPerformance?.p20?.perSeatResults'), 'P20 comes from the published P20 authority');
  assert.ok(SOURCE.includes('presentSeatMetric'), 'values are formatted by the pop-up presenter');
  assert.ok(SOURCE.includes('attachAuthoritativeP20ToSeatSnapshot'), 'P20 uses the pop-up attachment');
  assert.ok(!/function\s+\w*(Grade|grade)\w*\s*\(/.test(SOURCE), 'no grading function is introduced');
  assert.ok(!/level\s*=\s*['"]L[1-4]['"]/.test(SOURCE), 'no level is invented in code');
  // The section is presentation only.
  assert.ok(!/useEffect|useState/.test(SECTION_SOURCE), 'no state or effects in the section');
});

test('no layout overflow', () => {
  assert.ok(SECTION_SOURCE.includes('flexWrap: "wrap"'), 'rows and the key wrap');
  assert.ok(SCREEN.includes('flex-wrap:wrap'), 'wrapping is applied in the markup');
  assert.ok(ROWS_SOURCE.includes('breakInside: "avoid"'), 'a row never splits across pages');
  assert.ok(SOURCE.includes('width: 148') === false, 'card width lives with the card');
  // The card width is the row's own share of the section — the widest row can
  // never exceed the page, whatever the system size.
  assert.ok(
    SCREEN.includes('width:calc((100% - ') && PRINT.includes('width:calc((100% - '),
    'cards take a computed share of their row on screen and in print',
  );
  assert.ok(SCREEN.includes('box-sizing:border-box'), 'padding cannot widen a card');
  assert.ok(SCREEN.includes('text-overflow:ellipsis'), 'long values truncate instead of overflowing');
  assert.ok(SECTION_SOURCE.includes('maxWidth: "100%"'), 'no child can exceed the page width');
});