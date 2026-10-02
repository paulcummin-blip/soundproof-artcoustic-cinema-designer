// comparison-report-contract.test.mjs
// -----------------------------------
// Guards the System Design Comparison data contract and the calculated
// comparison table.
//
// The point of these tests is that NO comparison value is invented:
//   · every selected version contributes its own frozen engineering evidence;
//   · every table cell can be traced back to that version's evidence;
//   · excluded parameters (P8, P15, P20, P21) and assumed parameters never
//     appear anywhere;
//   · the change column is derived from the values, in the app;
//   · the Design Performance Index appears as supporting evidence only.
//
// The last test prints the generated table and prompt so the values can be
// reviewed by eye.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSelectedVersionEvidence,
  formatVersionEvidenceForPrompt,
} from '../base44/shared/comparisonEvidence.js';
import {
  buildComparisonTable,
  formatComparisonTableForPrompt,
  describeChange,
} from '../base44/shared/comparisonTable.js';
import { EXCLUDED_PARAMETERS } from '../base44/shared/adiReportEvidenceRules.js';

const headline = (parameterId, title, level, value) => ({
  parameter_id: parameterId,
  title,
  achieved_level: level,
  formatted_value: value,
});

const seats = (rows, perRow) => {
  const list = [];
  for (let row = 1; row <= rows; row += 1) {
    for (let column = 1; column <= perRow; column += 1) {
      list.push({
        id: `seat-${row}-${column}`,
        row,
        column,
        position: { x: column, y: row * 1.8, z: 1.2 },
        priority: column === Math.ceil(perRow / 2) ? 'primary' : 'secondary',
        is_reference: false,
      });
    }
  }
  return list;
};

function makeSnapshot({
  versionId,
  versionName,
  versionNumber,
  format,
  channels,
  screenInches,
  aspect = '16:9',
  rows,
  perRow,
  headlineRows,
  bass,
  viewingFloor,
  viewingSummary,
  dpiPrimary,
  dpiAllSeat,
}) {
  return {
    schema_version: '1.0',
    available: true,
    identity: { projectId: 'project-1', versionId },
    version: { id: versionId, name: versionName, number: versionNumber },
    project: { name: 'Demonstration Cinema', client_name: 'Client', project_reference: 'SP-001' },
    room: {
      dimensions_text: '5.2 × 6.8 × 2.7 m',
      screen: { size_inches: screenInches, aspect_ratio: aspect, manual_dimensions: false },
      seating: { interpretation: `${rows} rows, ${rows * perRow} seats` },
    },
    seats: seats(rows, perRow),
    system: {
      configuration: { text: format },
      channel_layout: { total_discrete: channels },
      product_roles: [
        { role: 'lcr', role_description: 'Left/Centre/Right (screen wall)', model_label: 'Evolve 3-1' },
        { role: 'surround', role_description: 'Side surround', model_label: 'Evolve 1-1' },
      ],
      subwoofer_strategy: { strategy_text: `${versionNumber} × SUB2-12` },
    },
    rp22: {
      parameter_headlines: headlineRows,
      categories: { primary: { available: true, categories: [] }, all_seat: { available: true, categories: [] } },
      dpi: {
        primary: { available: true, index: dpiPrimary, designation: 'Good', percentage: dpiPrimary },
        secondary: { available: true, index: dpiPrimary, designation: 'Good', percentage: dpiPrimary },
        all_seat: { available: true, index: dpiAllSeat, designation: 'Good', percentage: dpiAllSeat },
      },
      strengths: [],
      weaknesses: [],
      assumed: {},
      assessment_basis: { p12_mode: 'recommended', p13_mode: 'recommended' },
    },
    bass,
    viewing: { available: true, summary: viewingSummary, primary_floor: viewingFloor },
    products: [],
    product_coherence: { text: 'One matched family' },
    pricing: { available: true, system_total: 0, breakdown: [] },
  };
}

const OPTION_A = makeSnapshot({
  versionId: 'version-a',
  versionName: 'Original Design',
  versionNumber: 1,
  format: '5.1',
  channels: 5,
  screenInches: 120,
  rows: 1,
  perRow: 3,
  headlineRows: [
    headline(2, 'Discrete channels', 'L3', '5 channels'),
    headline(4, 'Screen consistency', 'L3', '±1 dB'),
    headline(5, 'Horizontal spacing', 'L4', '48°'),
    headline(12, 'Screen Dynamic Range', 'L3', '105 dBC'),
    headline(13, 'Non-screen Dynamic Range', 'L3', '102 dBC'),
    headline(16, 'Screen timbre', 'L3', '±3 dB'),
    headline(17, 'Surround timbre', 'L3', '±3.5 dB'),
    // Excluded parameters are present in the snapshot on purpose: they must
    // never reach the evidence or the table.
    headline(8, 'Upfiring speaker allowance', 'L4', 'No'),
    headline(15, 'Background noise assumption', 'L2', 'NCB 22'),
  ],
  bass: {
    available: true,
    p14: { achieved_level: 'L3', formatted_value: '108 dBC' },
    p18: { achieved_level: 'L3', formatted_value: '32 Hz' },
    p19: { rsp: { level: 'L3', display_value: '±4 dB' } },
    p20: { rsp: { level: 'L2', display_value: '±5 dB' } },
  },
  viewingFloor: 'Level 3',
  viewingSummary: '57.5° primary viewing angle',
  dpiPrimary: 58,
  dpiAllSeat: 55,
});

const OPTION_B = makeSnapshot({
  versionId: 'version-b',
  versionName: 'Atmos Upgrade',
  versionNumber: 2,
  format: '9.4.6',
  channels: 15,
  screenInches: 150,
  rows: 2,
  perRow: 4,
  headlineRows: [
    headline(2, 'Discrete channels', 'L4', '15 channels'),
    headline(4, 'Screen consistency', 'L4', '±0.5 dB'),
    // Identical to Option A: this row must be dropped from the table.
    headline(5, 'Horizontal spacing', 'L4', '48°'),
    headline(12, 'Screen Dynamic Range', 'L4', '112 dBC'),
    headline(13, 'Non-screen Dynamic Range', 'L4', '104 dBC'),
    headline(16, 'Screen timbre', 'L4', '±2 dB'),
    headline(17, 'Surround timbre', 'L4', '±2.5 dB'),
    headline(8, 'Upfiring speaker allowance', 'L4', 'No'),
    headline(15, 'Background noise assumption', 'L2', 'NCB 22'),
    headline(20, 'Bass seat-to-seat consistency', 'L3', '±2 dB'),
  ],
  bass: {
    available: true,
    p14: { achieved_level: 'L4', formatted_value: '116 dBC' },
    p18: { achieved_level: 'L3', formatted_value: '24 Hz' },
    p19: { rsp: { level: 'L4', display_value: '±3 dB' } },
    p20: { rsp: { level: 'L3', display_value: '±2 dB' } },
  },
  viewingFloor: 'Level 4',
  viewingSummary: '55° primary viewing angle',
  dpiPrimary: 68,
  dpiAllSeat: 63,
});

const OPTION_C = makeSnapshot({
  versionId: 'version-c',
  versionName: 'Reference Specification',
  versionNumber: 3,
  format: '9.4.6',
  channels: 15,
  screenInches: 180,
  rows: 2,
  perRow: 4,
  headlineRows: [
    headline(2, 'Discrete channels', 'L4', '15 channels'),
    headline(4, 'Screen consistency', 'L4', '±0.5 dB'),
    headline(12, 'Screen Dynamic Range', 'L4', '115 dBC'),
    headline(13, 'Non-screen Dynamic Range', 'L4', '106 dBC'),
    headline(16, 'Screen timbre', 'L4', '±2 dB'),
    headline(17, 'Surround timbre', 'L4', '±2.5 dB'),
  ],
  bass: {
    available: true,
    p14: { achieved_level: 'L4', formatted_value: '119 dBC' },
    p18: { achieved_level: 'L4', formatted_value: '22 Hz' },
    p19: { rsp: { level: 'L4', display_value: '±2 dB' } },
    p20: { rsp: { level: 'L3', display_value: '±2 dB' } },
  },
  viewingFloor: 'Level 4',
  viewingSummary: '52° primary viewing angle',
  dpiPrimary: 71,
  dpiAllSeat: 66,
});

const evidenceFor = (snapshots) => buildSelectedVersionEvidence(snapshots.map((snapshot) => ({
  version_id: snapshot.identity.versionId,
  version_name: snapshot.version.name,
  snapshot,
})));

/** The value a cell must carry, read independently from that version's evidence. */
function expectedCell(evidence, key) {
  if (key === 'screen_size') {
    const screen = evidence.screen_data;
    return `${screen.size_inches}" (${screen.aspect_ratio})`;
  }
  if (key === 'rp23_viewing') {
    return `${evidence.rp23_results.primary_floor} · ${evidence.rp23_results.summary}`;
  }
  if (key === 'system_layout') return evidence.system_format_short;
  if (key === 'p14') return evidence.bass_evidence_if_reliable.p14.text;
  if (key === 'p18') return evidence.bass_evidence_if_reliable.p18.text;
  if (key === 'p19') return evidence.bass_evidence_if_reliable.p19.text;
  if (key === 'dpi_primary') return evidence.design_index.primary.text;
  if (key === 'dpi_secondary') return evidence.design_index.secondary.text;
  if (key === 'dpi_all_seat') return evidence.design_index.all_seat.text;
  const parameterId = Number(String(key).replace('p', ''));
  return evidence.rp22_results.find((row) => Number(row.parameter_id) === parameterId)?.text;
}

test('the comparison payload carries frozen evidence for every selected version', () => {
  const evidence = evidenceFor([OPTION_A, OPTION_B, OPTION_C]);

  assert.equal(evidence.length, 3);
  assert.deepEqual(evidence.map((entry) => entry.label), ['Option A', 'Option B', 'Option C']);
  assert.deepEqual(evidence.map((entry) => entry.version_name), ['Original Design', 'Atmos Upgrade', 'Reference Specification']);

  const requiredKeys = [
    'version_id', 'version_name', 'project_identity', 'system_format', 'screen_data',
    'seating_data', 'speaker_package', 'subwoofer_package', 'rp22_results', 'rp23_results',
    'dynamic_range_evidence', 'spatial_resolution_evidence', 'timbre_matching_evidence',
    'bass_evidence_if_reliable', 'design_index', 'limitations', 'reliable_evidence',
    'excluded_evidence',
  ];
  for (const entry of evidence) {
    assert.equal(entry.available, true);
    for (const key of requiredKeys) {
      assert.ok(key in entry, `evidence entry is missing ${key}`);
    }
    assert.ok(entry.spatial_resolution_evidence.length > 0, 'each version carries its own Spatial Resolution evidence');
    assert.ok(entry.dynamic_range_evidence.length > 0);
    assert.ok(entry.timbre_matching_evidence.length > 0);
  }

  // Each version's evidence is its own: the versions must not share results.
  assert.notDeepEqual(evidence[0].rp22_results, evidence[1].rp22_results);
  assert.equal(evidence[0].system_format_short, '5.1');
  assert.equal(evidence[1].system_format_short, '9.4.6');
  assert.equal(evidence[0].seating_data.seat_count, 3);
  assert.equal(evidence[1].seating_data.row_count, 2);
});

test('the comparison table is calculated from each version and never invents a value', () => {
  const evidence = evidenceFor([OPTION_A, OPTION_B]);
  const table = buildComparisonTable(evidence);

  assert.equal(table.rows.length > 0, true, 'the table carries the calculated differences');
  assert.deepEqual(table.versions.map((column) => column.label), ['Option A', 'Option B']);

  for (const row of table.rows) {
    assert.equal(row.values.length, 2, `${row.key} carries one value per version`);
    row.values.forEach((value, index) => {
      // Every cell must equal the value carried by that version's own evidence.
      assert.equal(
        value,
        expectedCell(evidence[index], row.key),
        `${row.key} cell ${index} must come from that version's frozen evidence`,
      );
      assert.ok(value && value.trim().length > 0, `${row.key} cell ${index} must not be empty`);
    });
    assert.ok(row.change, `${row.key} carries a derived change`);
  }

  const keys = table.rows.map((row) => row.key);
  // Identical results are not differences, so they are not rows.
  assert.ok(!keys.includes('p5'), 'an identical result is not a comparison row');
  // A parameter one version does not carry is never invented for it.
  assert.ok(!keys.includes('p7') && !keys.includes('p9'), 'an unassessed parameter is never invented');
  // The Design Performance Index is carried as supporting evidence.
  assert.ok(keys.includes('dpi_primary') && keys.includes('dpi_all_seat'));
  assert.ok(!keys.includes('dpi_secondary'), 'an identical secondary scope is not a row');
});

test('excluded and assumed parameters never reach the evidence or the table', () => {
  const evidence = evidenceFor([OPTION_A, OPTION_B]);
  const table = buildComparisonTable(evidence);
  const excludedIds = Object.keys(EXCLUDED_PARAMETERS).map(Number);

  for (const entry of evidence) {
    const ids = [
      ...entry.rp22_results.map((row) => Number(row.parameter_id)),
      ...entry.spatial_resolution_evidence.map((row) => Number(row.parameter_id)),
      ...entry.dynamic_range_evidence.map((row) => Number(row.parameter_id)),
      ...entry.timbre_matching_evidence.map((row) => Number(row.parameter_id)),
    ];
    for (const id of excludedIds) {
      assert.ok(!ids.includes(id), `P${id} must never appear in the supplied evidence`);
    }
    // The exclusions are stated, so the writer knows they exist and must not use them.
    const excludedIdsInEvidence = entry.excluded_evidence.map((row) => Number(row.parameter_id));
    for (const id of excludedIds) {
      assert.ok(excludedIdsInEvidence.includes(id), `P${id} must be listed as excluded`);
    }
    assert.equal(entry.bass_evidence_if_reliable.p20 ?? null, null, 'P20 is never supplied as bass evidence');
  }

  for (const row of table.rows) {
    const id = Number(String(row.key).replace('p', ''));
    assert.ok(!excludedIds.includes(id), `${row.key} must never be a comparison row`);
  }

  const text = [
    formatVersionEvidenceForPrompt(evidence),
    formatComparisonTableForPrompt(table),
  ].join('\n');
  assert.match(text, /Never reference these in any version:/);
  assert.match(text, /Assumed parameters \(background noise, early reflections\) are never referenced either\./);
});

test('the change column is derived from the values, not written', () => {
  const table = buildComparisonTable(evidenceFor([OPTION_A, OPTION_B]));
  const byKey = new Map(table.rows.map((row) => [row.key, row]));

  // A level change is stated as a level change.
  assert.equal(byKey.get('p2').change, 'L3 → L4');
  assert.equal(byKey.get('rp23_viewing').change, 'L3 → L4');
  // A measured change is stated as a difference in the same unit.
  assert.equal(byKey.get('screen_size').change, '+30"');
  assert.equal(byKey.get('p14').change, '+8 dBC');
  assert.equal(byKey.get('p18').change, '-8 Hz');
  // A plain number is stated as a difference.
  assert.equal(byKey.get('dpi_primary').change, '+10');
  // Formats are stated as the two formats, never as a stray number.
  assert.equal(byKey.get('system_layout').change, '5.1 → 9.4.6');
  // A tolerance is never turned into a difference of one side.
  assert.ok(!/±/.test(byKey.get('p19').change), `P19 change must not invert a tolerance: ${byKey.get('p19').change}`);
});

test('three versions produce one column each and no change column', () => {
  const evidence = evidenceFor([OPTION_A, OPTION_B, OPTION_C]);
  const table = buildComparisonTable(evidence);

  assert.equal(table.versions.length, 3);
  assert.equal(table.rows.length > 0, true);
  for (const row of table.rows) {
    assert.equal(row.values.length, 3, `${row.key} carries a value per version`);
    assert.equal(row.change, null, 'no single change column is claimed for three options');
  }

  const prompt = formatComparisonTableForPrompt(table);
  assert.match(prompt, /Columns: Performance area \| Option A \| Option B \| Option C/);
  assert.ok(!prompt.includes('What changes'));
});

test('the comparison payload and table contain no em dash and no marketing language', () => {
  const evidence = evidenceFor([OPTION_A, OPTION_B, OPTION_C]);
  const text = [
    formatVersionEvidenceForPrompt(evidence),
    formatComparisonTableForPrompt(buildComparisonTable(evidence)),
  ].join('\n');

  assert.ok(!text.includes('\u2014'), 'no em dash reaches the writer');
  for (const banned of ['World-class', 'Optimise', 'Seamless', 'Revolutionary', 'Unparalleled']) {
    assert.ok(!text.includes(banned), `"${banned}" must not appear in the supplied tables`);
  }
  // The Design Index is never described as an RP22 score.
  assert.match(text, /Design Performance Index \(supporting evidence only, never an RP22 score\)/);
});

test('describeChange never invents a comparison', () => {
  assert.equal(describeChange('L3', 'L3'), null);
  assert.equal(describeChange('', 'L4'), null);
  assert.equal(describeChange('48°', '48°'), null);
  assert.equal(describeChange('±3 dB', '±4 dB'), '±3 dB → ±4 dB');
});

test('sample: the calculated comparison table for review', () => {
  const evidence = evidenceFor([OPTION_A, OPTION_B]);
  const table = buildComparisonTable(evidence);
  const labels = table.versions.map((column) => column.label);

  const lines = [`Performance area | ${labels.join(' | ')} | What changes`];
  for (const row of table.rows) {
    lines.push(`${row.area} | ${row.values.join(' | ')} | ${row.change}`);
  }
  console.log('\n--- CALCULATED COMPARISON TABLE ---\n' + lines.join('\n'));
  console.log('\n--- EVIDENCE + TABLE PROMPT (excerpt) ---\n'
    + formatVersionEvidenceForPrompt(evidence).split('\n').slice(0, 26).join('\n'));
  console.log('\n--- TABLE PROMPT BLOCK ---\n' + formatComparisonTableForPrompt(table));

  assert.ok(table.rows.length >= 10, 'the sample table carries the useful client-facing differences');
});