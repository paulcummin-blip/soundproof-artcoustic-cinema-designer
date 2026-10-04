// comparison-table-coverage.test.mjs
// ---------------------------------------------------------------------------
// The comparison table is the client's evidence that two system options were
// actually compared. Three rules make it complete, and each is held here:
//
//   COVERAGE    every assessed area is carried, including the areas the versions
//               agree on: a matching area states "No change" rather than being
//               dropped, so the client never reads a whole system from a partial
//               table;
//   ORDER       the differences lead, and the areas both versions share follow;
//   DERIVATION  the change column is derived from the two values themselves (a
//               level change leads where both state a level), and a symbol unit
//               attaches to its number while a word unit is spaced from it.
//
// The table is built server-side (base44/shared/comparisonTable.js) from each
// version's frozen evidence, so this test lives beside the other server-side
// contract tests.
// ---------------------------------------------------------------------------
import { test } from 'vitest';
import assert from 'node:assert/strict';

import { buildComparisonTable, describeChange } from '../base44/shared/comparisonTable.js';

/** One version's frozen evidence, as buildVersionEvidence produces it. */
function evidenceEntry(overrides = {}) {
  return {
    available: true,
    label: 'Option A',
    version_name: 'Level 1 version',
    system_format_short: '5.1',
    screen_data: { size_inches: 120, aspect_ratio: '16:9', manual_dimensions: false },
    seating_data: { interpretation: '1 row, 3 seats', seat_count: 3, row_count: 1 },
    rp23_results: { available: true, summary: '63° primary viewing angle', primary_floor: 'Level 4' },
    speaker_package: [{ role: 'lcr', role_description: 'Left/Centre/Right', model: 'Evolve 3-1' }],
    subwoofer_package: { strategy: '2 × SUB2-12', summary: null },
    amplification: '400 W',
    rp22_results: [
      { parameter_id: 2, label: 'P2 discrete channels', text: 'L3 · 5 channels' },
      { parameter_id: 4, label: 'P4 screen consistency', text: 'L3 · ±1 dB' },
      { parameter_id: 12, label: 'P12 screen Dynamic Range', text: 'L3 · 105 dBC' },
      { parameter_id: 13, label: 'P13 non-screen Dynamic Range', text: 'L3 · 102 dBC' },
    ],
    bass_evidence_if_reliable: {
      p14: { parameter_id: 14, text: 'L3 · 108 dBC' },
      p18: { parameter_id: 18, text: '30 Hz' },
      p19: { parameter_id: 19, text: '±3 dB' },
      p20: null,
    },
    ...overrides,
  };
}

/** The same room and seating, specified as a larger system. */
const UPGRADED = evidenceEntry({
  label: 'Option B',
  version_name: 'Level 4 version',
  system_format_short: '9.1.6',
  speaker_package: [{ role: 'lcr', role_description: 'Left/Centre/Right', model: 'Evolve 5-1' }],
  subwoofer_package: { strategy: '4 × SUB4-12', summary: null },
  amplification: '800 W',
  rp22_results: [
    { parameter_id: 2, label: 'P2 discrete channels', text: 'L4 · 15 channels' },
    { parameter_id: 4, label: 'P4 screen consistency', text: 'L3 · ±1 dB' },
    { parameter_id: 12, label: 'P12 screen Dynamic Range', text: 'L4 · 112 dBC' },
    { parameter_id: 13, label: 'P13 non-screen Dynamic Range', text: 'L3 · 102 dBC' },
  ],
  bass_evidence_if_reliable: {
    p14: { parameter_id: 14, text: 'L4 · 116 dBC' },
    p18: { parameter_id: 18, text: '22 Hz' },
    p19: { parameter_id: 19, text: '±3 dB' },
    p20: null,
  },
});

/** Every area both fixtures were assessed in. */
const ASSESSED_AREAS = [
  'screen_size',
  'rp23_viewing',
  'system_layout',
  'speakers',
  'subwoofers',
  'amplification',
  'seating',
  'p2',
  'p4',
  'p12',
  'p13',
  'p14',
  'p18',
  'p19',
];

test('every assessed area is carried, and a shared area says No change', () => {
  const table = buildComparisonTable([evidenceEntry(), UPGRADED]);
  const keys = table.rows.map((row) => row.key);

  for (const key of ASSESSED_AREAS) {
    assert.ok(keys.includes(key), `${key} must be a row: every assessed area is compared`);
  }
  assert.equal(table.rows.length, ASSESSED_AREAS.length, 'and no assessed area is dropped');

  const shared = table.rows.find((row) => row.key === 'p4');
  assert.equal(shared.identical, true, 'the versions match here');
  assert.equal(shared.change, 'No change', 'so the change column says so rather than nothing');
  assert.equal(shared.values.length, 2, 'and both versions are still stated');
});

test('the differences lead, and the shared areas follow them', () => {
  const rows = buildComparisonTable([evidenceEntry(), UPGRADED]).rows;
  const firstShared = rows.findIndex((row) => row.identical);
  const lastDifference = rows.map((row) => !row.identical).lastIndexOf(true);

  assert.ok(lastDifference > -1, 'the differences are carried');
  assert.ok(firstShared > -1, 'the shared areas are carried');
  assert.ok(
    lastDifference < firstShared,
    `every difference is stated before the first shared area (last difference ${lastDifference}, first shared ${firstShared})`,
  );
});

test('the change column is derived from the values, with units that read correctly', () => {
  assert.equal(describeChange('120" (16:9)', '150" (16:9)'), '+30"', 'an inch change attaches its symbol');
  assert.equal(describeChange('30 Hz', '22 Hz'), '-8 Hz', 'a word unit is spaced from the number');
  assert.equal(describeChange('63°', '60°'), '-3°');
  assert.equal(describeChange('400 W', '800 W'), '+400 W');
  assert.equal(describeChange('±3 dB', '±4 dB'), '±3 dB → ±4 dB', 'a tolerance is never turned into a difference of one side');
  assert.equal(describeChange('L3 · ±1 dB', 'L3 · ±1 dB'), null);
  assert.equal(describeChange('5.1', '9.1.6'), '5.1 → 9.1.6', 'a format change is never read as a stray number');

  const rows = buildComparisonTable([evidenceEntry(), UPGRADED]).rows;
  const byKey = new Map(rows.map((row) => [row.key, row]));
  assert.equal(byKey.get('p2').change, 'L3 → L4', 'an RP22 level change leads where both versions state a level');
  assert.equal(byKey.get('p14').change, 'L3 → L4');
  assert.equal(byKey.get('p12').change, 'L3 → L4', 'the dynamic range change is the stated grades and their dBC figures');
  assert.equal(byKey.get('p18').change, '-8 Hz', 'the bass extension change is the stated difference in Hz');
  assert.equal(byKey.get('amplification').change, '+400 W');
});

test('the equipment is compared, not just the grades it produces', () => {
  const rows = buildComparisonTable([evidenceEntry(), UPGRADED]).rows;
  const byKey = new Map(rows.map((row) => [row.key, row]));

  assert.deepEqual(
    byKey.get('speakers').values,
    ['Left/Centre/Right: Evolve 3-1', 'Left/Centre/Right: Evolve 5-1'],
    'the speakers each version specifies are stated side by side',
  );
  assert.deepEqual(byKey.get('subwoofers').values, ['2 × SUB2-12', '4 × SUB4-12']);
  assert.deepEqual(byKey.get('amplification').values, ['400 W', '800 W']);
  assert.deepEqual(byKey.get('system_layout').values, ['5.1', '9.1.6']);
  assert.deepEqual(byKey.get('seating').values, ['1 row, 3 seats', '1 row, 3 seats']);
});

test('a version that was not assessed for an area leaves the row out, never blank', () => {
  const withoutPower = evidenceEntry({ amplification: null });
  const rows = buildComparisonTable([withoutPower, UPGRADED]).rows;
  assert.ok(!rows.some((row) => row.key === 'amplification'), 'no row is invented for a version that states no power');
  for (const row of rows) {
    for (const value of row.values) {
      assert.ok(value && String(value).trim().length > 0, `${row.key} never carries an empty cell`);
    }
  }
});

test('three versions carry a column each, and no single change is claimed', () => {
  const table = buildComparisonTable([
    evidenceEntry({ label: 'Option A' }),
    UPGRADED,
    evidenceEntry({ label: 'Option C', version_name: 'Reference Specification' }),
  ]);

  assert.equal(table.versions.length, 3);
  for (const row of table.rows) {
    assert.equal(row.values.length, 3, `${row.key} carries a value per version`);
    assert.ok(
      row.change === null || row.change === 'No change',
      `${row.key} never claims one change across three options`,
    );
  }
});