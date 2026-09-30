// p20-display-consistency.test.mjs
// ---------------------------------------------------------------------------
// Marquee Home, minimum-L4 target state (the state in the report).
// The fixture values are the real published P20 authority values.
//
//   TEST 1  Integer Floor Policy: 2.99→2, 10.6→10, 12.9→12, 12.0→12
//   TEST 2  Marquee R1S2: exact 12.2436 → displayed ±12 dB at 73 Hz, L1
//   TEST 3  Overall worst all-seat display + marker label
//   TEST 4  Selected seat is scoped apart from the all-seat worst
//   TEST 5  Exactly one module rounds a P20 value
//   TEST 6  display = floor(exact) for every Marquee seat
//   TEST 7  The display authority performs no bass maths
// ---------------------------------------------------------------------------
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

import {
  resolveP20SeatDisplay,
  resolveP20WorstDisplay,
  resolveP20SelectedSeatDisplay,
  formatP20MarkerLabel,
  P20_SCOPE,
  P20_ROUNDING_METHOD,
} from '../components/room/bass/p20DisplayAuthority.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..');
const MARQUEE_FREQ_R1 = 73.4432125982793;
const MARQUEE_FREQ_R2 = 45.27493282780269;

// Real Marquee per-seat P20 authority (variationDbRaw, worstFrequencyHz, level).
const MARQUEE = [
  { seatId: 'seat-r1-c1', variationDbRaw: 12.23459158719821, worstFrequencyHz: MARQUEE_FREQ_R1, level: 1 },
  { seatId: 'seat-r1-c2', variationDbRaw: 12.243607518059065, worstFrequencyHz: MARQUEE_FREQ_R1, level: 1 },
  { seatId: 'seat-r1-c3', variationDbRaw: 12.243607518059065, worstFrequencyHz: MARQUEE_FREQ_R1, level: 1 },
  { seatId: 'seat-r1-c4', variationDbRaw: 12.23459158719821, worstFrequencyHz: MARQUEE_FREQ_R1, level: 1 },
  { seatId: 'seat-r2-c1', variationDbRaw: 10.34582539197099, worstFrequencyHz: MARQUEE_FREQ_R2, level: 1 },
  { seatId: 'seat-r2-c2', variationDbRaw: 10.24101673669125, worstFrequencyHz: MARQUEE_FREQ_R2, level: 1 },
  { seatId: 'seat-r2-c3', variationDbRaw: 10.157913965435498, worstFrequencyHz: MARQUEE_FREQ_R2, level: 1 },
  { seatId: 'seat-r2-c4', variationDbRaw: 10.24101673669125, worstFrequencyHz: MARQUEE_FREQ_R2, level: 1 },
  { seatId: 'seat-r2-c5', variationDbRaw: 10.34582539197099, worstFrequencyHz: MARQUEE_FREQ_R2, level: 1 },
];

test('TEST 1: Integer Floor Policy — floored, never rounded or ceiled', () => {
  const cases = [
    [2.99, 2], [10.6, 10], [12.9, 12], [12.0, 12], [12.991, 12],
    [0.9, 0], [12.243607518059065, 12], [13.0, 13],
  ];
  for (const [exact, expected] of cases) {
    const display = resolveP20SeatDisplay({ seatId: 'seat-x', variationDbRaw: exact, level: 1 });
    assert.equal(display.displayDeviationDb, expected, `${exact} → ${expected} dB`);
    assert.equal(display.displayVariationText, `±${expected} dB`);
    assert.equal(display.roundingMethod, P20_ROUNDING_METHOD);
  }
  // A would-be Math.round value must not leak in: 10.6 must never display as 11.
  assert.notEqual(resolveP20SeatDisplay({ seatId: 'seat-x', variationDbRaw: 10.6, level: 1 }).displayVariationText, '±11 dB');
});

test('TEST 2: Marquee R1S2 states the floored value and the exact value separately', () => {
  const display = resolveP20SeatDisplay(MARQUEE[1], { selectedSeatId: null });
  assert.equal(display.seatId, 'seat-r1-c2');
  assert.equal(display.exactDeviationDb, 12.243607518059065);
  assert.equal(display.displayDeviationDb, 12);
  assert.equal(display.displayVariationText, '±12 dB');
  assert.equal(display.exactVariationText, '±12.2 dB');
  assert.equal(display.displayDiffersFromExact, true, 'exact and display are labelled apart');
  assert.equal(display.limitingFrequencyHz, MARQUEE_FREQ_R1);
  assert.equal(display.displayFrequencyHz, 73);
  assert.equal(display.displayFrequencyText, '73 Hz');
  assert.equal(display.grade, 'L1');
});

test('TEST 3: overall worst all-seat display and graph marker label agree', () => {
  const worst = resolveP20WorstDisplay(MARQUEE);
  assert.equal(worst.seatId, 'seat-r1-c2', 'worst = largest deviation, 12.2436');
  assert.equal(worst.scope, P20_SCOPE.OVERALL_ALL_SEAT);
  assert.equal(worst.displayVariationText, '±12 dB');
  assert.equal(
    formatP20MarkerLabel(worst),
    'P20 worst point · seat-r1-c2 · 73 Hz · ±12 dB',
  );
});

test('TEST 4: a selected seat is never presented as the all-seat worst', () => {
  const selected = resolveP20SelectedSeatDisplay(MARQUEE, 'seat-r2-c3');
  assert.equal(selected.scope, P20_SCOPE.SELECTED_SEAT);
  assert.equal(selected.displayVariationText, '±10 dB', '10.1579 → 10 dB');
  assert.equal(selected.displayFrequencyText, '45 Hz');
  assert.equal(
    formatP20MarkerLabel(selected, { prefix: 'P20 point (selected seat)' }),
    'P20 point (selected seat) · seat-r2-c3 · 45 Hz · ±10 dB',
  );
  // The two scopes carry different values and different frequencies.
  const worst = resolveP20WorstDisplay(MARQUEE);
  assert.notEqual(selected.seatId, worst.seatId);
  assert.notEqual(selected.displayVariationText, worst.displayVariationText);
});

test('TEST 5: exactly one module rounds a P20 value', () => {
  const owners = [];
  for (const file of walk(join(SRC, 'components'))) {
    if (!/\.(js|jsx)$/.test(file)) continue;
    const source = readFileSync(file, 'utf8');
    if (/resolveRp22DesignValue\(\s*20\s*,/.test(source)) owners.push(relative(SRC, file));
  }
  assert.deepEqual(owners.sort(), [
    // ONE display authority rounds a P20 value for display.
    'components/room/bass/p20DisplayAuthority.js',
    // The P20 grading path uses the same shared design-value policy to compute
    // the level. It is a grading consumer of that policy, not a display
    // formatter, and it is the only other caller in the app.
    'components/utils/rp22BassMetrics.jsx',
  ], 'the P20 design-value rounding is shared, never re-implemented per surface');

  // No surface prints its own unrounded P20 deviation any more, exact or not.
  const exactFormatters = [];
  for (const file of walk(join(SRC, 'components'))) {
    if (!/\.(js|jsx)$/.test(file)) continue;
    const source = readFileSync(file, 'utf8');
    if (/p20VariationDb\)\.toFixed\(1\)|variationDbRaw\)\.toFixed\(1\)/.test(source)) {
      exactFormatters.push(relative(SRC, file));
    }
  }
  assert.deepEqual(exactFormatters, [], 'no surface formats a P20 deviation itself');

  // Every P20 surface reads the authority rather than formatting its own value.
  for (const file of [
    'components/room/bass/p20SeatPresentation.js',
    'components/room/bass/BassResultDetailTooltip.jsx',
    'components/room/bass/rp22GraphMarkers.js',
    'components/room/bass/Rp22GraphMarkerKey.jsx',
    'components/room/bass/storyteller/parameterFocusOverlays.js',
  ]) {
    assert.ok(
      readFileSync(join(SRC, file), 'utf8').includes('p20DisplayAuthority'),
      `${file} reads the canonical P20 display authority`,
    );
  }

  // No surface formats a P20 deviation itself any more.
  const overlay = readFileSync(join(SRC, 'components/room/bass/storyteller/parameterFocusOverlays.js'), 'utf8');
  assert.ok(!/variationDbRaw\)\.toFixed\(1\)/.test(overlay),
    'the graph overlay no longer prints an unrounded P20 deviation');
});

test('TEST 6: display is always floor(exact) for every Marquee seat', () => {
  for (const seat of MARQUEE) {
    const display = resolveP20SeatDisplay(seat);
    assert.equal(display.displayDeviationDb, Math.floor(display.exactDeviationDb));
    assert.ok(display.displayDeviationDb <= display.exactDeviationDb);
    assert.ok(display.displayDeviationDb > display.exactDeviationDb - 1);
  }
});

test('TEST 7: the display authority performs no bass maths', () => {
  const source = readFileSync(join(SRC, 'components/room/bass/p20DisplayAuthority.js'), 'utf8');
  for (const forbidden of [
    'rp22BassMetrics', 'p19SeatAuthority', 'canonicalBassOptimiser', 'normalizedRoomTransfer',
    'assessP14', 'assessP18', 'computeParam', 'applyBassSmoothing',
  ]) {
    assert.ok(!source.includes(forbidden), `no maths dependency: ${forbidden}`);
  }
});

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}