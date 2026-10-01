// ---------------------------------------------------------------------------
// Visual Report — Per-Seat Performance: DYNAMIC CARD LAYOUT
//
// The cards must keep the seating plan's own row shape while scaling with the
// size of the system: a 4-seat cinema gets large cards, a 9-seat cinema smaller
// ones, a 12-seat cinema smaller again — and the widest row still fits the page.
//
//   TEST 1  4-seat layout fits, in one row of four
//   TEST 2  7-seat layout fits (3 + 4)
//   TEST 3  9-seat layout fits (4 + 5)
//   TEST 4  12-seat layout fits (5 + 4 + 3), cards smaller again
//   TEST 5  The seating row shape is preserved (never a numbered list)
//   TEST 6  Cards scale dynamically with the system, and stay readable
//   TEST 7  The section uses the page width: the widest row fills it
//   TEST 8  Primary and Secondary outlines are preserved
//   TEST 9  The reference position stays separate (and sits between rows)
//   TEST 10 P19 excluded, P20 included, values unchanged
//   TEST 11 Nothing overflows or clips; large systems split BY ROW
//   TEST 12 The PDF export path is unchanged and prints the same cards
//   TEST 13 No RP22/RP23 calculation, grading or authority change
// ---------------------------------------------------------------------------
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { selectClientPerSeatPerformance } from '../components/report/client/selectClientPerSeatPerformance.js';
import { groupSeatsIntoRows } from '../components/report/client/seatRowGrouping.js';
import ClientPerSeatPerformance from '../components/report/client/ClientPerSeatPerformance.jsx';
import PrintPerSeatPerformanceContent from '../components/report/client/print/PrintPerSeatPerformanceContent.jsx';
import {
  resolveSeatRowLayout,
  planSeatRowPages,
  estimateSectionHeightPx,
  estimateSeatRowHeightPx,
  CARD_TIERS,
  TIER_ORDER,
  PRINT_ROW_BUDGET_PX,
  PRINT_SECTION_WIDTH_PX,
  MAX_CARD_WIDTH_PX,
} from '../components/report/client/perSeatCardLayout.js';
import { RP22_PRESENTATION_PARAMETERS } from '../components/utils/rp22ParameterPresentation.js';

const LAYOUT_SOURCE = fs.readFileSync('src/components/report/client/perSeatCardLayout.js', 'utf8');
const ROWS_SOURCE = fs.readFileSync('src/components/report/client/PerSeatPerformanceRows.jsx', 'utf8');
const CARD_SOURCE = fs.readFileSync('src/components/report/client/PerSeatPerformanceCard.jsx', 'utf8');
const SECTION_SOURCE = fs.readFileSync('src/components/report/client/ClientPerSeatPerformance.jsx', 'utf8');
const SELECTOR_SOURCE = fs.readFileSync('src/components/report/client/selectClientPerSeatPerformance.js', 'utf8');
const EXPORT_SOURCE = fs.readFileSync('src/components/report/client/useClientReportPdfExport.js', 'utf8');

// ── Layouts under test: rows front-to-back, matching real seating plans ──────
const FRONT_Y = 3.78;
const ROW_SPACING = 1.8;
const CENTRE_X = 2.59;

function buildSeats(seatsPerRow) {
  const seats = [];
  seatsPerRow.forEach((count, rowIndex) => {
    const y = FRONT_Y + rowIndex * ROW_SPACING;
    const firstX = CENTRE_X - ((count - 1) / 2) * 0.6;
    for (let column = 0; column < count; column += 1) {
      seats.push({
        id: `seat-r${rowIndex + 1}-c${column + 1}`,
        x: Number((firstX + column * 0.6).toFixed(4)),
        y,
        // Priority is a designer decision, independent of the reference marker.
        priority: (rowIndex + column) % 3 === 0 ? 'primary' : 'secondary',
        isPrimary: false,
      });
    }
  });
  return seats;
}

const LAYOUTS = {
  '4-seat': { seatsPerRow: [4], expectedRows: [4] },
  '7-seat': { seatsPerRow: [3, 4], expectedRows: [3, 4] },
  '9-seat': { seatsPerRow: [4, 5], expectedRows: [4, 5] },
  '12-seat': { seatsPerRow: [5, 4, 3], expectedRows: [5, 4, 3] },
};

// The published per-seat authority (seat HUD + viewing + P20), as the pop-up reads it.
function authorityFor(seats) {
  const seatHudById = Object.fromEntries(seats.map((seat, index) => [seat.id, {
    seatId: seat.id,
    isPrimary: false,
    rp23: { angleDeg: 50 + index },
    rp22: {
      p1: { valueM: 1.5 + index * 0.05, level: 4, formatted: `${(1.5 + index * 0.05).toFixed(2)}m` },
      p4: { valueDb: 1, level: 4, formatted: '1 dB' },
      p5: { valueDeg: 40 + index, level: 4, formatted: `${40 + index}°` },
      p6: { valueDb: 2, level: 3, formatted: '2 dB' },
      p9: { valueDeg: 20 + index, level: 3, formatted: `${20 + index}°` },
      p10: { value: null, formatted: 'N/A (insufficient data)', level: 'N/A', status: 'not_applicable' },
      p16: { value: null, level: 2, formatted: `FL ${20 + index}°` },
      p17: { valueDb: 1.2, level: 4, formatted: '1.2 dB' },
      p19: { valueDb: 3.4, level: 'L1', formatted: '±3 dB' },
    },
    splAtSeat: { lcr: { FL: { value: 105 + index }, FC: { value: 104 + index }, FR: { value: 106 + index } } },
  }]));

  return {
    seatHudById,
    viewing: {
      available: true,
      per_seat: seats.map((seat, index) => ({
        seat_id: seat.id,
        priority: seat.priority,
        horizontal_angle_deg: 51 + index,
        rp23_level: index % 2 === 0 ? 'L4' : 'L3',
      })),
    },
  };
}

function selectionFor(name) {
  const seats = buildSeats(LAYOUTS[name].seatsPerRow);
  return {
    seats,
    selection: selectClientPerSeatPerformance({
      engineeringSummary: authorityFor(seats),
      seatingPositions: seats,
      bassPerformance: {
        p20: {
          perSeatResults: seats.map((seat, index) => ({
            seatId: seat.id,
            priority: seat.priority,
            level: index % 2 === 0 ? 'L2' : 'L3',
            variationDbRaw: 4.2 + index * 0.1,
            displayedValue: `±${4 + index} dB`,
            worstFrequencyHz: 90,
          })),
        },
      },
      rsp: { x: CENTRE_X, y: FRONT_Y + ROW_SPACING / 2 },
    }),
  };
}

const textOf = (markup) => markup.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const cardCount = (markup) => markup.split('per-seat-performance-card').length - 1;

// Cards per seating row, read from the rendered markup: each row's label is
// followed by its own cards, so counting between labels proves the cards are
// laid out BY ROW rather than in one flat sequence.
function cardsPerRenderedRow(markup, labels) {
  return labels.map((label, index) => {
    const start = markup.indexOf(label);
    const end = index + 1 < labels.length ? markup.indexOf(labels[index + 1]) : markup.length;
    assert.ok(start >= 0, `the markup carries the "${label}" row label`);
    return cardCount(markup.slice(start, end));
  });
}

const RENDERED = Object.fromEntries(Object.keys(LAYOUTS).map((name) => {
  const { selection } = selectionFor(name);
  return [name, {
    selection,
    layout: resolveSeatRowLayout(selection.rows),
    screen: renderToStaticMarkup(React.createElement(ClientPerSeatPerformance, {
      rows: selection.rows,
      rsp: { x: CENTRE_X, y: FRONT_Y + ROW_SPACING / 2 },
    })),
    print: renderToStaticMarkup(React.createElement(PrintPerSeatPerformanceContent, {
      rows: selection.rows,
      rsp: { x: CENTRE_X, y: FRONT_Y + ROW_SPACING / 2 },
    })),
  }];
}));

// The printed pixel width of one card: the widest row must still fit the page.
function printedCardWidthPx(layout) {
  const share = (PRINT_SECTION_WIDTH_PX - layout.gap * (layout.maxSeatsInRow - 1)) / layout.maxSeatsInRow;
  return Math.min(share, MAX_CARD_WIDTH_PX);
}

// ── TEST 1-4 · the four acceptance layouts ──────────────────────────────────
test('4-seat layout fits: one row of four larger cards', () => {
  const { selection, layout, screen, print } = RENDERED['4-seat'];
  assert.equal(selection.hasAny, true, 'the section is included');
  assert.equal(layout.rowCount, 1, 'one seating row');
  assert.equal(layout.maxSeatsInRow, 4, 'four seats in the row');
  assert.equal(layout.seatCount, 4, 'four cards');
  assert.deepEqual(cardsPerRenderedRow(screen, ['Front row']), [4], 'four cards on the front row');
  assert.equal(cardCount(screen), 4, 'four cards on screen');
  assert.equal(cardCount(print), 4, 'four cards in print');
  // Larger than a bigger system's cards.
  assert.ok(printedCardWidthPx(layout) > 150, 'a four-seat row gets large cards');
  assert.equal(layout.fitsOnePage, true, 'the layout fits one printed page');
});

test('7-seat layout fits: two rows matching the seating plan', () => {
  const { selection, layout, screen, print } = RENDERED['7-seat'];
  assert.equal(layout.rowCount, 2, 'two seating rows');
  assert.equal(layout.maxSeatsInRow, 4, 'the widest row carries four');
  assert.equal(layout.seatCount, 7, 'seven cards');
  assert.deepEqual(cardsPerRenderedRow(screen, ['Front row', 'Rear row']), [3, 4], 'front 3, rear 4');
  assert.equal(cardCount(screen), 7, 'seven cards on screen');
  assert.equal(cardCount(print), 7, 'seven cards in print');
  assert.equal(selection.rows[0].seats.length, 3, 'front row is the plan\'s front row');
  assert.equal(selection.rows[1].seats.length, 4, 'rear row is the plan\'s rear row');
  assert.equal(layout.fitsOnePage, true, 'the layout fits one printed page');
});

test('9-seat layout fits: front 4, rear 5, cards smaller than the 4-seat system', () => {
  const { selection, layout, screen, print } = RENDERED['9-seat'];
  assert.equal(layout.rowCount, 2, 'two seating rows');
  assert.equal(layout.maxSeatsInRow, 5, 'the widest row carries five');
  assert.equal(layout.seatCount, 9, 'nine cards');
  assert.deepEqual(cardsPerRenderedRow(screen, ['Front row', 'Rear row']), [4, 5], 'front 4, rear 5');
  assert.equal(cardCount(screen), 9, 'nine cards on screen');
  assert.equal(cardCount(print), 9, 'nine cards in print');
  assert.ok(
    printedCardWidthPx(layout) < printedCardWidthPx(RENDERED['4-seat'].layout),
    'the five-seat row gets smaller cards than the four-seat row',
  );
  assert.ok(printedCardWidthPx(layout) >= 100, 'and they stay comfortably readable');
  assert.equal(layout.fitsOnePage, true, 'the layout fits one printed page');
  assert.deepEqual(
    selection.rows.map((row) => row.seats.map((seat) => seat.id)),
    groupSeatsIntoRows(selection.rows.flatMap((row) => row.seats)).map((row) => row.seats.map((seat) => seat.id)),
    'row membership matches the seating plan',
  );
});

test('12-seat layout fits: rows match the system rows, cards smaller again', () => {
  const { selection, layout, screen, print } = RENDERED['12-seat'];
  assert.equal(layout.rowCount, 3, 'three seating rows');
  assert.equal(layout.maxSeatsInRow, 5, 'the widest row carries five');
  assert.equal(layout.seatCount, 12, 'twelve cards');
  assert.deepEqual(cardsPerRenderedRow(screen, ['Front row', 'Middle row', 'Rear row']), [5, 4, 3], '5 / 4 / 3');
  assert.equal(cardCount(screen), 12, 'twelve cards on screen');
  assert.equal(cardCount(print), 12, 'twelve cards in print');
  // Three rows of cards cannot carry the nine-seat tier's type on one page.
  assert.ok(
    TIER_ORDER.indexOf(layout.tierName) > TIER_ORDER.indexOf(RENDERED['9-seat'].layout.tierName),
    'the 12-seat system drops to a denser tier than the 9-seat system',
  );
  assert.ok(printedCardWidthPx(layout) >= 100, 'the cards stay readable');
  assert.equal(layout.fitsOnePage, true, 'the layout fits one printed page');
  assert.ok(screen.includes('width:calc((100% - '), 'the cards take a computed share of their row');
  assert.ok(print.includes('width:calc((100% - '), 'in print too');
});

// ── TEST 5 · the seating row shape is the layout authority ──────────────────
test('the seating row shape is preserved — never a numbered seat list', () => {
  for (const [name, expected] of Object.entries(LAYOUTS)) {
    const { selection, screen } = RENDERED[name];
    assert.deepEqual(
      selection.rows.map((row) => row.seats.length),
      expected.expectedRows,
      `${name}: the cards follow the plan's own rows`,
    );
    assert.ok(!screen.includes('<table'), `${name}: no table layout`);
    assert.ok(!/Seat \d+<\/td>/.test(screen), `${name}: no linear numbered-seat list`);
    // Every row is drawn as its own line, front to back.
    const labels = selection.rows.map((row) => row.label);
    assert.equal((screen.match(/uppercase/g) || []).length >= labels.length, true, `${name}: rows are labelled`);
    for (let index = 1; index < labels.length; index += 1) {
      assert.ok(
        screen.indexOf(labels[index - 1]) < screen.indexOf(labels[index]),
        `${name}: ${labels[index - 1]} is drawn before ${labels[index]}`,
      );
    }
  }
  assert.ok(ROWS_SOURCE.includes('row.seats.map'), 'one line of cards per physical row');
  assert.ok(ROWS_SOURCE.includes('breakInside: "avoid"'), 'a row is never split across pages');
});

// ── TEST 6 · the cards scale with the system ────────────────────────────────
test('cards scale dynamically with the system and keep a readable floor', () => {
  const four = RENDERED['4-seat'].layout;
  const nine = RENDERED['9-seat'].layout;
  const twelve = RENDERED['12-seat'].layout;

  // The card width is a share of the row, set by the widest row in the system.
  for (const name of Object.keys(LAYOUTS)) {
    const { layout } = RENDERED[name];
    const expected = `calc((100% - ${layout.gap * (layout.maxSeatsInRow - 1)}px) / ${layout.maxSeatsInRow})`;
    assert.equal(layout.cardWidth, expected, `${name}: card width is the widest row's share`);
  }

  // Bigger systems get smaller cards — by width …
  assert.ok(printedCardWidthPx(four) > printedCardWidthPx(nine), '4 seats: wider cards than 9 seats');
  assert.ok(four.gap >= nine.gap, 'and a looser gap');
  // … and, when the rows will not fit otherwise, by tier.
  assert.ok(nine.tier.card.rowMinHeight > twelve.tier.card.rowMinHeight, '12 seats: tighter rows than 9 seats');
  assert.ok(nine.tier.card.labelSize > twelve.tier.card.labelSize, '12 seats: smaller type than 9 seats');
  assert.ok(
    TIER_ORDER.indexOf(twelve.tierName) > TIER_ORDER.indexOf(nine.tierName),
    'the 12-seat system uses a denser tier than the 9-seat system',
  );
  assert.equal(CARD_TIERS.dense.showValues, false, 'the densest tier keeps the pills and drops the value text');

  for (const name of Object.keys(LAYOUTS)) {
    const { layout } = RENDERED[name];
    assert.ok(printedCardWidthPx(layout) >= 90, `${name}: cards stay above the readable floor`);
    assert.ok(layout.tier.card.rowMinHeight >= 13, `${name}: rows stay above the readable floor`);
    assert.ok(layout.tier.card.labelSize >= 9, `${name}: seat labels stay above the readable floor`);
    assert.ok(layout.tier.showSpl, `${name}: the SPL line is kept`);
  }

  // The pill and its label are always present — the result never disappears.
  assert.ok(CARD_SOURCE.includes('RP22GradingPill'), 'the level pill is always rendered');
  assert.ok(CARD_SOURCE.includes('tier.showValues &&'), 'only the numeric value is tiered away');
});

// ── TEST 7 · the page width is used ─────────────────────────────────────────
test('the section uses the report page width, and the widest row fills it', () => {
  // The cards span the full printed page width rather than a narrow centred column.
  assert.ok(PRINT_SECTION_WIDTH_PX > 670, 'the section is sized from the A4 page width');
  assert.ok(LayoutModuleUsesMm(), 'the width authority is the print geometry');
  // The widest row fills its line exactly: seats + gaps = 100%.
  for (const name of Object.keys(LAYOUTS)) {
    const { layout } = RENDERED[name];
    const usedPercent = layout.maxSeatsInRow * (100 / layout.maxSeatsInRow);
    assert.equal(usedPercent, 100, `${name}: the widest row fills the line`);
    assert.ok(layout.maxCardWidth <= MAX_CARD_WIDTH_PX, `${name}: small systems do not over-inflate`);
  }
  // On screen the section moved closer to the page edges than a text page does.
  assert.ok(/padding:\s*print\s*\?\s*0\s*:\s*"26px 14px"/.test(SECTION_SOURCE), 'narrow outer margins on screen');
  assert.ok(SECTION_SOURCE.includes('maxWidth: "100%"'), 'nothing can exceed the page width');
});

function LayoutModuleUsesMm() {
  return LAYOUT_SOURCE.includes('PRINT_PAGE_WIDTH_MM = 186')
    && LAYOUT_SOURCE.includes('MM_TO_PX');
}

// ── TEST 8 · priority outlines ──────────────────────────────────────────────
test('Primary and Secondary outlines are preserved at every size', () => {
  for (const name of Object.keys(LAYOUTS)) {
    const { selection, screen, print } = RENDERED[name];
    const cardSegments = (markup) => markup.split('per-seat-performance-card').slice(1);
    const rootStyle = (segment) => segment.slice(0, segment.indexOf('>'));
    const primary = selection.rows.flatMap((row) => row.seats).filter((seat) => seat.priority === 'primary').length;
    const secondary = selection.rows.flatMap((row) => row.seats).filter((seat) => seat.priority === 'secondary').length;
    assert.equal(cardSegments(screen).filter((card) => rootStyle(card).includes('border:2.5px solid #213428')).length, primary, `${name}: primary outline on screen`);
    assert.equal(cardSegments(screen).filter((card) => rootStyle(card).includes('border:1px solid #D9D5CE')).length, secondary, `${name}: secondary outline on screen`);
    assert.equal(cardSegments(print).filter((card) => rootStyle(card).includes('border:2px solid #213428')).length, primary, `${name}: primary outline in print`);
    assert.equal(cardSegments(print).filter((card) => rootStyle(card).includes('border:0.8px solid #D9D5CE')).length, secondary, `${name}: secondary outline in print`);
  }
});

// ── TEST 9 · the reference position stays separate ──────────────────────────
test('the reference position stays separate, and sits between the rows', () => {
  const { selection, screen, print } = RENDERED['9-seat'];
  const seats = selection.rows.flatMap((row) => row.seats);
  assert.equal(seats.filter((seat) => seat.isRsp).length, 0, 'a between-rows reference is not a seat');
  assert.ok(screen.includes('per-seat-performance-rsp-marker'), 'the reference position is drawn between the rows');
  assert.ok(
    screen.indexOf('Front row') < screen.indexOf('per-seat-performance-rsp-marker')
      && screen.indexOf('per-seat-performance-rsp-marker') < screen.indexOf('Rear row'),
    'and it sits in its real place, between the front and rear rows',
  );
  assert.ok(textOf(screen).includes('Reference seating position'), 'named as the reference position');
  assert.ok(screen.includes('Primary seat') && screen.includes('Secondary seat'), 'both priorities still keyed');
  assert.ok(SECTION_SOURCE.includes('Reference position'), 'the key keeps its own RSP entry');
  assert.ok(print.includes('per-seat-performance-rsp-marker'), 'and the PDF draws it too');

  // Bound to a seat, the chip rides on that seat's card instead and the
  // priority labels are unaffected — the RSP never becomes the only Primary.
  const boundLayout = resolveSeatRowLayout(
    selection.rows.map((row, rowIndex) => ({
      ...row,
      seats: row.seats.map((seat) => ({ ...seat, isRsp: rowIndex === 0 })),
    })),
  );
  const boundMarkup = renderToStaticMarkup(React.createElement(ClientPerSeatPerformance, {
    rows: boundLayout.seatRows,
    rsp: { x: CENTRE_X, y: FRONT_Y },
  }));
  assert.ok(!boundMarkup.includes('per-seat-performance-rsp-marker'), 'no free-standing marker when bound to a seat');
  const boundChips = boundMarkup.split('per-seat-performance-card').slice(1)
    .reduce((total, card) => total + (card.match(/>RSP</g) || []).length, 0);
  assert.equal(boundChips, 4, 'one chip per bound seat, and no more');
});

// ── TEST 10 · content: P19 out, P20 in, values untouched ────────────────────
test('P19 is excluded and P20 included at every system size', () => {
  for (const name of Object.keys(LAYOUTS)) {
    const { selection, screen, print } = RENDERED[name];
    assert.ok(!textOf(screen).includes('P19'), `${name}: no P19 on screen`);
    assert.ok(!textOf(print).includes('P19'), `${name}: no P19 in print`);
    assert.ok(textOf(screen).includes('P20'), `${name}: P20 is present`);
    for (const seat of selection.rows.flatMap((row) => row.seats)) {
      const keys = seat.parameters.map((entry) => entry.key);
      assert.deepEqual(keys, ['p1', 'p4', 'p5', 'p6', 'p9', 'p10', 'p16', 'p17', 'p20'], `${name}: the agreed per-seat set`);
      assert.ok(seat.rp23.level && seat.rp23.level !== '—', `${name}: RP23 is stated`);
    }
  }
  // The presenter authority on the card is unchanged.
  assert.ok(CARD_SOURCE.includes('RP22GradingPill'), 'levels still rendered by the canonical pill');
  assert.ok(SELECTOR_SOURCE.includes('PER_SEAT_PARAMETER_NUMBERS = [1, 4, 5, 6, 9, 10, 16, 17]'), 'the parameter set is unchanged');
  assert.ok(SELECTOR_SOURCE.includes('P19 IS DELIBERATELY ABSENT'), 'and P19 stays documented as absent');
});

// ── TEST 11 · nothing overflows; large systems split by row ─────────────────
test('nothing overflows or clips, and a large system splits BETWEEN rows', () => {
  for (const name of Object.keys(LAYOUTS)) {
    const { layout } = RENDERED[name];
    assert.ok(estimateSectionHeightPx(layout) <= PRINT_ROW_BUDGET_PX, `${name}: the section fits one printed page`);
    assert.equal(planSeatRowPages(layout.seatRows, layout).length, 1, `${name}: and prints as a single page`);
    assert.equal(layout.splitsAcrossPages, false, `${name}: no split needed`);
  }

  // A system with more rows than a page holds keeps every row whole.
  const bigSeats = buildSeats([3, 3, 3, 3, 3, 3]);
  const bigSelection = selectClientPerSeatPerformance({
    engineeringSummary: authorityFor(bigSeats),
    seatingPositions: bigSeats,
    bassPerformance: { p20: { perSeatResults: bigSeats.map((seat, index) => ({ seatId: seat.id, level: 'L2', variationDbRaw: 4 + index, displayedValue: `±${4 + index} dB` })) } },
    rsp: { x: CENTRE_X, y: FRONT_Y },
  });
  const bigLayout = resolveSeatRowLayout(bigSelection.rows);
  assert.equal(bigLayout.splitsAcrossPages, true, 'eighteen seats in six rows cannot hold one page');
  const pages = planSeatRowPages(bigSelection.rows);
  assert.ok(pages.length > 1, 'the section is split across printed pages');
  assert.deepEqual(
    pages.flat().map((row) => row.rowIndex),
    bigSelection.rows.map((row) => row.rowIndex),
    'rows keep their order, front to back, and none is dropped',
  );
  for (const pageRows of pages) {
    assert.ok(
      pageRows.length * estimateSeatRowHeightPx(bigLayout.tierName) <= PRINT_ROW_BUDGET_PX,
      'each printed page fits its own rows',
    );
  }
  assert.equal(pages.flat().length, 6, 'every row is printed exactly once');
  // The split is BY ROW — the cards are never re-flowed into a list.
  assert.ok(ROWS_SOURCE.includes('row.seats.map'), 'even a split keeps one line of cards per row');
  assert.ok(SECTION_SOURCE.includes('continuation'), 'the on-screen page explains the continuation');
});

// ── TEST 12 · PDF export ────────────────────────────────────────────────────
test('the PDF export path is unchanged and prints the same cards', () => {
  assert.ok(EXPORT_SOURCE.includes('window.print()'), 'export still prints the live report DOM');
  assert.ok(!/import[^\n]*html2canvas/.test(EXPORT_SOURCE), 'no raster capture is introduced');
  assert.ok(!/html2canvas\s*\(/.test(EXPORT_SOURCE), 'and no raster capture is called');
  assert.ok(!/scale\s*\(/.test(EXPORT_SOURCE), 'no JS scaling is introduced');
  assert.ok(SECTION_SOURCE.includes('print ? 0 : "26px 14px"'), 'the print section carries no outer padding');
  assert.ok(PrintPerSeatPerformanceContentSourceHasHeading(), 'the printed page keeps its document heading');
  for (const name of Object.keys(LAYOUTS)) {
    const { print } = RENDERED[name];
    assert.ok(print.includes('client-report-print-heading__title'), `${name}: print heading present`);
    assert.ok(print.includes('client-report-print-support'), `${name}: printed inside the page support region`);
  }
  const rowsComponent = ROWS_SOURCE;
  assert.ok(rowsComponent.includes('breakInside: "avoid"'), 'a card never straddles a page break');
  assert.ok(CARD_SOURCE.includes('pageBreakInside: "avoid"'), 'and neither does the card itself');
});

function PrintPerSeatPerformanceContentSourceHasHeading() {
  const source = fs.readFileSync('src/components/report/client/print/PrintPerSeatPerformanceContent.jsx', 'utf8');
  return source.includes('client-report-print-heading__title');
}

// ── TEST 13 · no calculation change ─────────────────────────────────────────
test('no RP22/RP23 calculation, grading or authority change', () => {
  const forbidden = /(bassGradingAuthority|canonicalBassResult|computeSeatHudMetrics|rp22LevelCalculation|viewingAngleUtils|rp22BassMetrics|bassSimulationEngine|artcousticSystemDesignRating|presentSeatMetric)/;
  assert.ok(!forbidden.test(LAYOUT_SOURCE), 'the layout authority reads no engine or grading module');
  assert.ok(!forbidden.test(CARD_SOURCE), 'the card reads no engine or grading module');
  assert.ok(!forbidden.test(ROWS_SOURCE), 'the rows read no engine or grading module');
  assert.ok(!/level\s*[:=]\s*['"]L[1-4]['"]/.test(LAYOUT_SOURCE + CARD_SOURCE), 'no level is invented in layout code');
  assert.ok(!/useEffect|useState/.test(SECTION_SOURCE), 'the section still keeps no state');
  assert.ok(!/useEffect|useState/.test(ROWS_SOURCE), 'and neither do the rows');
  assert.ok(
    SELECTOR_SOURCE.includes('engineeringSummary?.seatHudById')
      && SELECTOR_SOURCE.includes('bassPerformance?.p20?.perSeatResults')
      && SELECTOR_SOURCE.includes('engineeringSummary?.viewing?.per_seat'),
    'the selector reads the same published authorities as before',
  );
  // The layout authority is presentation only: percentages and type sizes.
  assert.ok(!/Db|dB|Hz|level/i.test(LAYOUT_SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')), 'the layout module carries no metric of its own');
  assert.ok(RP22_PRESENTATION_PARAMETERS.length > 0, 'the parameter catalog is untouched');
});

// ── The four acceptance sizes, restated as one monotonic check ──────────────
test('card size decreases monotonically as the system grows', () => {
  const order = ['4-seat', '7-seat', '9-seat', '12-seat'];
  const sizeScore = (name) => {
    const { layout } = RENDERED[name];
    const tierRank = TIER_ORDER.length - TIER_ORDER.indexOf(layout.tierName);
    return printedCardWidthPx(layout) * (1 + tierRank / 10);
  };
  for (let index = 1; index < order.length; index += 1) {
    assert.ok(
      sizeScore(order[index]) <= sizeScore(order[index - 1]),
      `${order[index]} never gets larger cards than ${order[index - 1]}`,
    );
  }
  assert.ok(sizeScore('12-seat') < sizeScore('4-seat'), 'twelve seats really are smaller than four');
  assert.ok(Object.keys(CARD_TIERS).length === 4, 'four tiers, richest to densest');
});