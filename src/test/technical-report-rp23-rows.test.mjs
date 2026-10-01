// technical-report-rp23-rows.test.mjs
// ---------------------------------------------------------------------------
// ACCEPTANCE — the Technical Report's RP23 horizontal viewing rows.
//
// Root cause under test: the report read seatHudById[id].rp23, which in a
// published summary carries the angle ALONE (no level, no formatted value), so
// every row printed "—". The published authority that carries the angle AND the
// level — the one the Visual Report Viewing Experience page and the Room
// Designer seat pop-up read — is engineeringSummary.viewing.per_seat.
//
//   TEST 1  Row values are stated, never dashes
//   TEST 2  Values match the published viewing authority
//   TEST 3  Representative seat per row is stated
//   TEST 4  Thresholds preserved
//   TEST 5  Legacy summary (angle-only HUD) still states a value and level
//
// The fixture is the live published shape of the current project.
// ---------------------------------------------------------------------------
import { test } from 'vitest';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import TechnicalRp23Rows from '../components/report/technical/TechnicalRp23Rows.jsx';
import { resolveTechnicalViewingRows } from '../components/report/technical/technicalViewingRowAuthority.js';

// ── The live published fixture ──────────────────────────────────────────────
const SEATS = [
  { id: 'seat-r1-c2', rowNumber: 1 },
  { id: 'seat-r2-c2', rowNumber: 2 },
];

const SUMMARY = {
  viewing: {
    available: true,
    per_seat: [
      { seat_id: 'seat-r1-c2', horizontal_angle_deg: 63.264242551337276, rp23_level: 'L4' },
      { seat_id: 'seat-r2-c2', horizontal_angle_deg: 44.290144595746256, rp23_level: 'L3' },
    ],
  },
  // The published HUD shape — angle only. Reading this alone is what produced "—".
  seatHudById: {
    'seat-r1-c2': { rp23: { angleDeg: 63.264242551337276 } },
    'seat-r2-c2': { rp23: { angleDeg: 44.290144595746256 } },
  },
};

const markup = renderToStaticMarkup(
  React.createElement(TechnicalRp23Rows, { representativeSeats: SEATS, engineeringSummary: SUMMARY }),
);
const textOf = (html) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const TEXT = textOf(markup);

test('TEST 1 — every row states a value, never a dash', () => {
  const { hasAny, rows } = resolveTechnicalViewingRows({
    representativeSeats: SEATS,
    engineeringSummary: SUMMARY,
  });
  assert.equal(hasAny, true, 'the block is shown');
  assert.equal(rows.length, 2, 'both seating rows are stated');
  for (const row of rows) {
    assert.notEqual(row.angleFormatted, '—', `Row ${row.rowNumber} does not print a dash`);
    assert.ok(row.level, `Row ${row.rowNumber} states a level`);
  }
  assert.ok(TEXT.includes('Row 1'), 'row 1 is listed');
  assert.ok(TEXT.includes('Row 2'), 'row 2 is listed');
  assert.ok(!TEXT.includes('—'), 'no dash appears anywhere in the block');
});

test('TEST 2 — the values are the published viewing authority', () => {
  const { rows } = resolveTechnicalViewingRows({
    representativeSeats: SEATS,
    engineeringSummary: SUMMARY,
  });
  const published = new Map(SUMMARY.viewing.per_seat.map((r) => [r.seat_id, r]));
  for (const row of rows) {
    const authority = published.get(row.seatId);
    assert.equal(row.angleDeg, authority.horizontal_angle_deg, `Row ${row.rowNumber} angle is published verbatim`);
    assert.equal(row.level, authority.rp23_level, `Row ${row.rowNumber} level is published verbatim`);
    assert.equal(row.angleFormatted, `${authority.horizontal_angle_deg.toFixed(1)}°`);
  }
  assert.ok(TEXT.includes('63.3°'), 'the row 1 angle is on screen');
  assert.ok(TEXT.includes('44.3°'), 'the row 2 angle is on screen');
  assert.ok(TEXT.includes('L4'), 'the row 1 level pill is on screen');
  assert.ok(TEXT.includes('L3'), 'the row 2 level pill is on screen');
});

test('TEST 3 — the representative seat for each row is stated', () => {
  const { rows } = resolveTechnicalViewingRows({
    representativeSeats: SEATS,
    engineeringSummary: SUMMARY,
  });
  assert.equal(rows[0].seatLabel, 'Row 1 - Seat 2');
  assert.equal(rows[1].seatLabel, 'Row 2 - Seat 2');
  assert.ok(TEXT.includes('Representative seat: Row 1 - Seat 2'), 'row 1 representative seat is stated');
  assert.ok(TEXT.includes('Representative seat: Row 2 - Seat 2'), 'row 2 representative seat is stated');
  assert.ok(TEXT.includes('centre seat of each row'), 'the block says which seat represents a row');
});

test('TEST 4 — the RP23 thresholds are preserved', () => {
  for (const entry of ['L4', 'L3', 'L2', 'L1', '50°–65°', '45°–70°', '40°–80°', '33°–90°']) {
    assert.ok(TEXT.includes(entry), `the ${entry} threshold is still stated`);
  }
});

test('TEST 5 — a legacy angle-only summary still states the value and level', () => {
  // No viewing authority at all: only the HUD angle. The level is derived through
  // the app's own shared RP23 grading authority — never a second maths path.
  const legacy = { seatHudById: { 'seat-r1-c2': { rp23: { angleDeg: 63.264242551337276 } } } };
  const { rows } = resolveTechnicalViewingRows({
    representativeSeats: [SEATS[0]],
    engineeringSummary: legacy,
  });
  assert.equal(rows[0].angleFormatted, '63.3°', 'the legacy angle is stated');
  assert.equal(rows[0].level, 'L4', 'the level comes from the shared grading authority');

  // And with no viewing data whatsoever the block simply is not shown.
  const empty = resolveTechnicalViewingRows({
    representativeSeats: SEATS,
    engineeringSummary: { seatHudById: {} },
  });
  assert.equal(empty.hasAny, false, 'nothing is invented when no authority states a view');
  assert.equal(
    renderToStaticMarkup(
      React.createElement(TechnicalRp23Rows, { representativeSeats: SEATS, engineeringSummary: { seatHudById: {} } }),
    ),
    '',
    'the block renders nothing rather than dashes',
  );
});