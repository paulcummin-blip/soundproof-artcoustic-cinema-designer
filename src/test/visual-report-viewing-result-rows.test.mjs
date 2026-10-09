// visual-report-viewing-result-rows.test.mjs
// ---------------------------------------------------------------------------
// The Visual Report "Viewing Experience" page presents the RP23 result as a
// seat-mapped block: one line per physical seating row, one pill per seat, each
// seat's viewing angle beneath its pill.
//
//   TEST 1  Seats group into the physical rows of the seating plan
//   TEST 2  Each row is ordered left-to-right, front row first
//   TEST 3  Row labels describe the position in the room
//   TEST 4  Interpretation uses the published levels, per row
//   TEST 5  A single level across the seating area collapses to one sentence
//   TEST 6  A row below Level 1 is reported honestly, never dressed up
//   TEST 7  The linear Seat 1…N table is gone from the page
//   TEST 8  The page renders the mapped block, the angles and the projector
//           output in hierarchy order — with no level key, and with the
//           projector block gated on the canonical display authority
//   TEST 9  Both the screen page and the printed page supply the rows
//   TEST 10 No RP23 or projector maths is performed by the presentation
// ---------------------------------------------------------------------------
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { groupSeatsIntoRows } from '../components/report/client/seatRowGrouping.js';
import {
  buildViewingInterpretation,
  VIEWING_RESULT_HEADING,
} from '../components/report/client/viewingResultCopy.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLIENT = join(HERE, '..', 'components', 'report', 'client');

const seat = (id, x, y, levelLabel, formatted) => ({
  id,
  x,
  y,
  levelLabel,
  formatted,
});

// The example room: 4 front-row seats at Level 4 (63.5°), 5 rear-row seats at
// Level 3 (44.4°).
const FOUR_FRONT_L4 = [
  seat('f1', 1.6, 3.6, 'L4', '63.5°'),
  seat('f2', 2.2, 3.6, 'L4', '63.5°'),
  seat('f3', 2.8, 3.6, 'L4', '63.5°'),
  seat('f4', 3.4, 3.6, 'L4', '63.5°'),
];
const FIVE_REAR_L3 = [
  seat('r1', 1.3, 5.4, 'L3', '44.4°'),
  seat('r2', 1.9, 5.4, 'L3', '44.4°'),
  seat('r3', 2.5, 5.4, 'L3', '44.4°'),
  seat('r4', 3.1, 5.4, 'L3', '44.4°'),
  seat('r5', 3.7, 5.4, 'L3', '44.4°'),
];
const ROOM = [...FOUR_FRONT_L4, ...FIVE_REAR_L3];

test('seats group into the physical rows of the seating plan', () => {
  const rows = groupSeatsIntoRows(ROOM);
  assert.equal(rows.length, 2, 'two physical rows');
  assert.equal(rows[0].seats.length, 4, 'front row holds 4 seats');
  assert.equal(rows[1].seats.length, 5, 'rear row holds 5 seats');
  // Ordering is front-to-back, regardless of input order.
  const shuffled = groupSeatsIntoRows([...FIVE_REAR_L3, ...FOUR_FRONT_L4]);
  assert.deepEqual(
    shuffled.map((row) => row.seats.map((s) => s.id)),
    [['f1', 'f2', 'f3', 'f4'], ['r1', 'r2', 'r3', 'r4', 'r5']],
  );
});

test('each row is ordered left-to-right with the front row first', () => {
  const rows = groupSeatsIntoRows([
    seat('b', 3.4, 3.6, 'L4', '63.5°'),
    seat('a', 1.6, 3.6, 'L4', '63.5°'),
    seat('d', 2.8, 3.6, 'L4', '63.5°'),
    seat('c', 2.2, 3.6, 'L4', '63.5°'),
  ]);
  assert.deepEqual(rows[0].seats.map((s) => s.id), ['a', 'c', 'd', 'b']);
});

test('row labels describe the position in the room', () => {
  const rows = groupSeatsIntoRows(ROOM);
  assert.equal(rows[0].label, 'Front row');
  assert.equal(rows[1].label, 'Rear row');

  const single = groupSeatsIntoRows(FOUR_FRONT_L4);
  assert.equal(single.length, 1);
  assert.equal(single[0].label, 'Front row');

  const three = groupSeatsIntoRows([
    ...FOUR_FRONT_L4,
    seat('m1', 2.2, 4.5, 'L4', '55.0°'),
    ...FIVE_REAR_L3,
  ]);
  assert.deepEqual(three.map((row) => row.label), ['Front row', 'Middle row', 'Rear row']);
});

test('the interpretation states the published level of each row', () => {
  const rows = groupSeatsIntoRows(ROOM);
  assert.equal(
    buildViewingInterpretation(rows),
    'Front row seats achieve Level 4 viewing immersion. '
      + 'Rear row seats achieve Level 3 viewing immersion, giving a comfortable wider-room viewing position.',
  );
});

test('a single level across the seating area collapses to one sentence', () => {
  const allL4 = groupSeatsIntoRows(ROOM.map((s) => ({ ...s, levelLabel: 'L4' })));
  assert.equal(
    buildViewingInterpretation(allL4),
    'All 9 seats achieve Level 4 viewing immersion.',
  );
  assert.equal(buildViewingInterpretation([]), '');
  assert.equal(buildViewingInterpretation(null), '');
});

test('a row spanning two levels reports the span, never the best seat', () => {
  const rows = groupSeatsIntoRows([
    seat('f1', 1.6, 3.6, 'L3', '52.0°'),
    seat('f2', 2.2, 3.6, 'L4', '63.5°'),
    seat('r1', 2.5, 5.4, 'L2', '38.0°'),
  ]);
  const text = buildViewingInterpretation(rows);
  assert.match(text, /Front row seats range from Level 3 to Level 4 viewing immersion\./);
});

test('a row below Level 1 is reported honestly, never dressed up', () => {
  const rows = groupSeatsIntoRows([
    seat('f1', 1.6, 3.6, 'L4', '63.5°'),
    seat('r1', 2.5, 5.4, 'Below L1', '24.0°'),
  ]);
  const text = buildViewingInterpretation(rows);
  assert.match(text, /Rear row seat falls below the Level 1 viewing range\./);
  assert.ok(!/achieve Level 3|comfortable/i.test(text), 'no overstated language for a below-L1 row');
});

test('the linear Seat 1…N table is gone from the viewing page', () => {
  const src = readFileSync(join(CLIENT, 'ClientScreenSeating.jsx'), 'utf8');
  assert.ok(!src.includes('Seat {i + 1}'), 'no linear Seat 1…N heading');
  assert.ok(!src.includes('<table'), 'no seat table remains on the page');
  assert.ok(
    src.includes('VIEWING_RESULT_HEADING'),
    'the RP23 result heading is rendered by the mapped block',
  );
  assert.ok(
    src.includes('<ClientSeatResultRows rows={rows}'),
    'the mapped block is rendered with the row results',
  );
});

test('the page renders the mapped result and angles, then the projector output — with no level key', () => {
  const src = readFileSync(join(CLIENT, 'ClientScreenSeating.jsx'), 'utf8');
  const at = (needle) => {
    const index = src.indexOf(needle);
    assert.ok(index !== -1, `expected to find ${needle}`);
    return index;
  };
  const drawing = at('<svg');
  const result = at('<ClientSeatResultRows');
  const interpretation = at('{explanation}');
  const projector = at('Projector Light Output');
  assert.ok(drawing < result, 'the seating plan precedes the result');
  assert.ok(result < interpretation, 'the interpretation follows the result');
  assert.ok(interpretation < projector, 'projector output sits below the viewing result');

  // The level key is gone — the seat pills state each result — and the projector
  // block is gated on the canonical display authority, so it can only appear for
  // a projection screen.
  assert.ok(!src.includes('LEGEND_LEVELS'), 'no level-key list remains');
  assert.ok(!src.includes('RP22GradingPill'), 'the page supplies no legend pills of its own');
  assert.ok(src.includes('showProjectorOutput'), 'the projector block is gated on the display authority');

  // The result block uses the canonical grading pill, and the seat's viewing
  // angle stays visible beneath it.
  const block = readFileSync(join(CLIENT, 'ClientSeatResultRows.jsx'), 'utf8');
  assert.ok(block.includes('RP22GradingPill'), 'canonical L1/L2/L3/L4 pill styling');
  assert.ok(block.includes('valueKey = "formatted"'), 'angle value shown by default');
  assert.equal(VIEWING_RESULT_HEADING, 'RP23 Viewing Result');
});

test('both the screen page and the printed page supply the mapped rows', () => {
  // The report renders its pages (and each printed part) through the project
  // report composition, so the seat-mapped rows are supplied there.
  const composition = readFileSync(
    join(HERE, '..', 'components', 'report', 'projectReport', 'useProjectReportPages.jsx'),
    'utf8',
  );
  const printPage = readFileSync(join(CLIENT, 'ClientReportPage.jsx'), 'utf8');
  assert.ok(composition.includes('rows={screenSeating.rows}'), 'screen page passes the rows');
  assert.ok(composition.includes('rows: screenSeating.rows'), 'print data carries the rows');
  assert.ok(
    (printPage.match(/rows=\{printData\.rows\}/g) || []).length === 2,
    'both printed parts receive the rows',
  );
});

test('the presentation performs no RP23 or projector maths', () => {
  for (const file of ['seatRowGrouping.js', 'viewingResultCopy.js', 'ClientSeatResultRows.jsx']) {
    const src = readFileSync(join(CLIENT, file), 'utf8');
    for (const banned of ['rp23LevelForAngleDeg', 'atan', 'Math.tan', 'computeProjectorLumens', 'angleDeg']) {
      assert.ok(!src.includes(banned), `${file} must not perform maths (${banned})`);
    }
  }
  const selector = readFileSync(join(CLIENT, 'selectClientScreenSeating.js'), 'utf8');
  assert.ok(selector.includes('groupSeatsIntoRows'), 'rows come from the passive selector');
  assert.ok(selector.includes('authority.rp23_level'), 'levels still come from published authority');
  assert.ok(
    selector.includes('computeProjectorLumens(screenWidthM, aspectRatio)'),
    'projector lumens authority unchanged',
  );
});