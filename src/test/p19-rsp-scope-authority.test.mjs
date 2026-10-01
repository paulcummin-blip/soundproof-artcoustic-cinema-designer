// p19-rsp-scope-authority.test.mjs
// ---------------------------------
// P19 is RSP-scoped in Sound Proof: ONE result at the reference seating
// position (RSP after EQ vs house target below the transition frequency).
// No per-seat P19 surfaces, counts or dashes anywhere. P20 stays the
// seat-to-seat parameter. P19's thresholds, levels, maths and scoring are
// untouched — only scope and presentation moved.
//
// This file pins the acceptance rows directly against the code that decides
// them, so the rule cannot silently regress:
//
//   TEST 1  catalogue: P19 → RSP, P20 → Seat, values unchanged
//   TEST 2  Technical Report presents P19 as RSP (scope-printed tile)
//   TEST 3  P19 leaves the seat register: no count entry, no dash rows
//   TEST 4  seat counting requires seat scope AND a seat-register entry
//   TEST 5  the seat HUD builds rows from the seat register only
//   TEST 6  no RP22 value moved with the re-scope
// ---------------------------------------------------------------------------
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { RP22_CATALOG } from '../components/data/rp22Catalog.jsx';
import {
  RP22_PRESENTATION_PARAMETERS,
  RP22_SEAT_PARAMETERS,
  RP22_SEAT_PARAMETER_KEYS,
  isSeatScopedParameterKey,
  createEmptySeatRp22Metrics,
} from '../components/utils/rp22ParameterPresentation.js';

const read = (path) => fs.readFileSync(path, 'utf8');

const TILE = read('src/components/rp22/RP22ComplianceParameterTile.jsx');
const GRID = read('src/components/report/RP22ReportParameterGrid.jsx');
const SUMMARY_AUTHORITY = read('src/components/engineering/engineeringSummaryAuthority.js');
const HUD = read('src/components/room/seatHudPresentation.js');

const presented = (number) =>
  RP22_PRESENTATION_PARAMETERS.find((parameter) => parameter.number === number);

test('TEST 1 — the catalogue files P19 under RSP scope, never seat scope', () => {
  assert.equal(RP22_CATALOG['19'].scope, 'RSP');
  assert.equal(RP22_CATALOG['20'].scope, 'Seat', 'P20 remains the seat-to-seat parameter');
});

test('TEST 2 — the report presents P19 as RSP, printed from the scope it is handed', () => {
  assert.equal(presented(19).scope, 'RSP');
  assert.equal(presented(20).scope, 'Seat');
  // The tile prints whatever scope it receives, so a reader sees "SCOPE: RSP".
  assert.ok(
    TILE.includes('param.scope || "").toUpperCase()'),
    'the tile prints the presentation scope',
  );
  assert.ok(!/p19/i.test(TILE), 'the tile holds no parameter-number special case');
  assert.ok(
    !GRID.includes('!== 19'),
    'the report grid holds no parameter-number special case either',
  );
});

test('TEST 3 — P19 leaves the seat register: no count entry, no dash rows', () => {
  const seatNumbers = RP22_SEAT_PARAMETERS.map((parameter) => parameter.number);
  assert.ok(!seatNumbers.includes(19), 'P19 is not a seat parameter');
  assert.ok(seatNumbers.includes(20), 'P20 is');
  assert.ok(!RP22_SEAT_PARAMETER_KEYS.includes('p19'), 'no p19 seat key exists');
  assert.equal(isSeatScopedParameterKey('p19'), false);
  assert.equal(isSeatScopedParameterKey('p20'), true);

  // The per-seat metric set is the source of every seat row and every dash:
  // no p19 entry means no P19 dash row can ever be built.
  const emptySeatMetrics = createEmptySeatRp22Metrics();
  assert.ok(!('p19' in emptySeatMetrics), 'no per-seat P19 dash row is created');
  assert.ok('p20' in emptySeatMetrics, 'P20 keeps its per-seat rows');
});

test('TEST 4 — seat counting requires seat scope AND a seat-register entry', () => {
  assert.ok(
    SUMMARY_AUTHORITY.includes('parameter?.scope === "seat" && isSeatScopedParameterKey(key)'),
    'the compliance seat count cannot include a parameter outside the seat register',
  );
  assert.ok(
    SUMMARY_AUTHORITY.includes('key !== "screen" && parameter?.scope === "seat" && isSeatScopedParameterKey(key)'),
    'the report-count seat list uses the same rule, so P19 is in neither group',
  );
});

test('TEST 5 — the seat HUD builds its rows from the seat register only', () => {
  assert.ok(HUD.includes('RP22_SEAT_PARAMETERS.map'), 'HUD rows come from the seat register');
  assert.ok(
    !HUD.includes('RP22_PRESENTATION_PARAMETERS.map'),
    'never from the full parameter list, which would re-add a P19 row',
  );
});

test('TEST 6 — no RP22 value moved with the re-scope', () => {
  assert.equal(RP22_CATALOG['19'].unit, '± dB');
  assert.equal(RP22_CATALOG['19'].direction, '±max');
  assert.equal(RP22_CATALOG['19'].metric, 'FR vs target below transition (RSP)');
  assert.deepEqual(RP22_CATALOG['19'].levels, { L1: 5, L2: 4, L3: 3, L4: 2 });
  assert.deepEqual(RP22_CATALOG['20'].levels, { L1: null, L2: 4, L3: 3, L4: 2 });
});