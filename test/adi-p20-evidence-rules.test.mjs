/**
 * Acceptance tests for the refined System Design Summary / Comparison rules.
 *
 * Covers the P20 (bass seat-to-seat consistency) rule, the proposal-stage
 * boundary and the hard exclusions. Pure: no React, no database.
 *
 * Run: node test/adi-p20-evidence-rules.test.mjs
 */

import assert from 'node:assert/strict';

import {
  EXCLUDED_PARAMETERS,
  P20_USE_RULE,
  P20_OMIT_RULE,
  assessP20,
  resolveBassEvidence,
  splitParameterEvidence,
} from '../base44/shared/adiReportEvidenceRules.js';
import {
  buildEngineeringEvidence,
  selectHighlightRows,
  buildHighlightsPrompt,
} from '../base44/shared/engineeringSnapshotEvidence.js';
import { buildVersionEvidence } from '../base44/shared/comparisonEvidence.js';
import { buildComparisonTable, formatComparisonTableForPrompt } from '../base44/shared/comparisonTable.js';
import { buildWritingStyleContract } from '../base44/shared/reportWritingStyleContract.js';
import { getSystemSummarySectionPrompt, COMPARISON_REPORT_INSTRUCTIONS } from '../base44/shared/systemDesignSummarySections.js';
import { buildProjectInterpretation, formatInterpretationForPrompt } from '../base44/shared/adiProjectInterpretation.js';

// ── Fixtures ────────────────────────────────────────────────────────────────

const seats = (count) => Array.from({ length: count }, (_, index) => ({
  seat_id: `s${index + 1}`, priority: index === 0 ? 'primary' : 'secondary', row: 1, column: index + 1,
}));

function snapshot({ p20 = null, seatStatus = null, seatCount = 6, p19 = 'L3', p18 = 'L2' } = {}) {
  const rows = seats(seatCount);
  return {
    available: true,
    identity: { projectId: 'proj-1', versionId: 'ver-1' },
    seats: rows,
    room: {
      dimensions: { width_m: 5, length_m: 6, height_m: 2.7 },
      volume_m3: 81,
      screen: { size_inches: 130, aspect_ratio: '16:9' },
      seating: { row_count: 1, total_seats: seatCount, mlp_basis: 'middle' },
    },
    system: {
      configuration: {
        dolby_config: '7.2.4', text: '7.2.4 · 11 discrete channels', bed_channels: 7, overhead_channels: 4, total_discrete_channels: 11,
      },
      product_roles: [{ role: 'lcr', model_key: 'spitfire-q', model_label: 'Spitfire Q' }],
      subwoofer_strategy: { count: 4, strategy_text: 'Four subs' },
    },
    rp22: {
      parameter_headlines: [
        { parameter_id: 2, achieved_level: 'L4', formatted_value: '11' },
        { parameter_id: 4, achieved_level: 'L3', formatted_value: '±1.0 dB' },
        { parameter_id: 5, achieved_level: 'L3', formatted_value: '50°' },
        { parameter_id: 9, achieved_level: 'L3', formatted_value: '45°' },
        { parameter_id: 12, achieved_level: 'L4', formatted_value: '113 dBC' },
        { parameter_id: 13, achieved_level: 'L3', formatted_value: '109 dBC' },
        { parameter_id: 16, achieved_level: 'L3', formatted_value: 'Matched' },
        { parameter_id: 17, achieved_level: 'L3', formatted_value: 'Matched' },
        { parameter_id: 20, achieved_level: p20, formatted_value: null, status: seatStatus },
      ],
      categories: {
        primary: {
          available: true,
          categories: [
            { label: 'Spatial Resolution', floor: 'L3' },
            { label: 'Dynamic Range', floor: 'L3' },
            { label: 'Timbre Matching', floor: 'L3' },
          ],
        },
      },
      assumed: { p15_noise_floor: true, p21_early_reflections: true },
    },
    bass: {
      available: true,
      p14: { achieved_level: 'L3', formatted_value: '109 dBC' },
      p18: { achieved_level: p18, formatted_value: '26 Hz' },
      p19: { rsp: { level: p19, display_value: '±1.4 dB', raw_value: 1.4 } },
      p20: {
        rsp: null,
        primary_floor: p20,
        secondary_floor: p20,
        project_floor: p20,
        per_seat: rows.map((seat) => ({
          seat_id: seat.seat_id, grade: p20, display_value: '±1.4 dB', status: seatStatus,
        })),
      },
    },
    viewing: { available: true, summary: '9.1° max', primary_floor: 'L3', secondary_floor: 'L2' },
  };
}

const results = [];
function test(name, fn) {
  try {
    fn();
    results.push(`PASS  ${name}`);
  } catch (error) {
    results.push(`FAIL  ${name}\n      ${error.message}`);
  }
}

// ── 1. Strong, reliable P20 is positive bass consistency evidence ───────────

const strong = snapshot({ p20: 'L4' });

test('1. a strong P20 is admitted as Timbre Matching evidence', () => {
  assert.equal(assessP20(strong).usable, true, 'assessP20 should admit L4');
  const timbre = splitParameterEvidence(strong).byStructure['Timbre Matching'];
  assert.ok(timbre.some((row) => row.parameter_id === 20), 'P20 should be Timbre Matching evidence');
  assert.equal(resolveBassEvidence(strong).p20.level, 'L4');
});

test('1b. a strong P20 reaches the report evidence and the highlights table', () => {
  const evidence = buildEngineeringEvidence(strong);
  assert.match(evidence, /Bass consistency \(P20\): L4/, 'the writer should be given the consistency result');
  const rows = selectHighlightRows(strong);
  const row = rows.find((entry) => entry.key === 'p20');
  assert.ok(row, 'a bass consistency row should be available');
  assert.equal(row.area, 'Bass consistency');
  const prompt = buildHighlightsPrompt(evidence, rows);
  assert.match(prompt, /Bass consistency/, 'the highlights prompt should carry the row');
});

test('1c. the design story claims consistency only from the P20 result', () => {
  const interpretation = buildProjectInterpretation({ snapshot: strong, reportType: 'system_summary' });
  const areas = interpretation.strongest_areas.map((entry) => entry.area);
  assert.ok(areas.includes('Bass consistency'), 'consistency should be a claimed strength');
  const prompt = formatInterpretationForPrompt(interpretation);
  assert.ok(prompt.includes(P20_USE_RULE), 'the P20 use rule should reach the writer');
});

// ── 2. Weak P20 is omitted, never criticised ───────────────────────────────

const weak = snapshot({ p20: 'L2' });

test('2. a weak P20 is omitted without becoming a limitation', () => {
  const assessment = assessP20(weak);
  assert.equal(assessment.usable, false);
  assert.match(assessment.reason, /strong/i);
  assert.equal(resolveBassEvidence(weak).p20, null);
  assert.equal(selectHighlightRows(weak).some((row) => row.key === 'p20'), false, 'no P20 row when weak');
  const evidence = buildEngineeringEvidence(weak);
  assert.doesNotMatch(evidence, /Bass consistency \(P20\)/, 'a weak result is never offered');
  assert.match(evidence, /Bass consistency - Not used in this report unless the result is strong/);
  assert.doesNotMatch(evidence, /inconsisten/i, 'the writer must never be invited to criticise the bass');
});

test('2b. the writer is told to leave a weak result out rather than report it', () => {
  const interpretation = buildProjectInterpretation({ snapshot: weak, reportType: 'system_summary' });
  const prompt = formatInterpretationForPrompt(interpretation);
  assert.ok(prompt.includes(P20_OMIT_RULE), 'the omit rule should reach the writer');
  assert.equal(interpretation.strongest_areas.some((entry) => entry.area === 'Bass consistency'), false);
});

test('2c. a weak P20 never becomes a suggestion to change the design', () => {
  const contract = buildWritingStyleContract();
  assert.match(contract, /never suggest moving the subwoofers/i);
  assert.match(contract, /the subwoofers should move/i, 'moving subs must be named as forbidden');
});

// ── 3. Stale, provisional, missing and single-seat results are not current ──

test('3. a provisional P20 is not current', () => {
  const provisional = snapshot({ p20: 'L4', seatStatus: 'provisional' });
  assert.equal(assessP20(provisional).usable, false);
  assert.match(assessP20(provisional).reason, /current/i);
});

test('3b. a missing P20 is not assessed', () => {
  const missing = snapshot({ p20: null });
  assert.equal(assessP20(missing).usable, false);
  assert.match(assessP20(missing).reason, /Not assessed/i);
  assert.equal(selectHighlightRows(missing).some((row) => row.key === 'p20'), false);
});

test('3c. bass consistency is not used for a single-seat room', () => {
  const single = snapshot({ p20: 'L4', seatCount: 1 });
  assert.equal(assessP20(single).usable, false);
  assert.match(assessP20(single).reason, /single-seat/i);
});

// ── 4. Comparison: P20 explains which bass layout is more even ──────────────

const optionA = buildVersionEvidence({ snapshot: snapshot({ p20: 'L3' }), versionId: 'ver-a', versionName: 'Two subs', label: 'Option A' });
const optionB = buildVersionEvidence({ snapshot: snapshot({ p20: 'L4' }), versionId: 'ver-b', versionName: 'Four subs', label: 'Option B' });

test('4. a P20 improvement appears as a comparison row', () => {
  const table = buildComparisonTable([optionA, optionB]);
  const row = table.rows.find((entry) => entry.key === 'p20');
  assert.ok(row, 'the comparison should carry a bass consistency row');
  assert.equal(row.area, 'Bass consistency (P20)');
  assert.deepEqual(row.values, ['L3', 'L4']);
  assert.equal(row.change, 'L3 → L4', 'the change column is derived from the values');
  const prompt = formatComparisonTableForPrompt(table);
  assert.match(prompt, /Bass consistency \(P20\) \| L3 \| L4 \| L3 → L4/);
});

test('4b. an identical P20 is not a difference', () => {
  const sameB = buildVersionEvidence({ snapshot: snapshot({ p20: 'L4' }), versionId: 'ver-b', versionName: 'Four subs', label: 'Option B' });
  const sameA = buildVersionEvidence({ snapshot: snapshot({ p20: 'L4' }), versionId: 'ver-a', versionName: 'Two subs', label: 'Option A' });
  assert.equal(buildComparisonTable([sameA, sameB]).rows.some((row) => row.key === 'p20'), false);
});

test('4c. a weak P20 is not comparable, so it never appears in the table', () => {
  const weakB = buildVersionEvidence({ snapshot: snapshot({ p20: 'L2' }), versionId: 'ver-b', versionName: 'Four subs', label: 'Option B' });
  assert.equal(buildComparisonTable([optionA, weakB]).rows.some((row) => row.key === 'p20'), false);
});

test('4d. the comparison instructs consistency language, never criticism', () => {
  assert.match(COMPARISON_REPORT_INSTRUCTIONS, /more even bass between seats/);
  assert.match(COMPARISON_REPORT_INSTRUCTIONS, /never describe the other option as wrong/i);
});

test('4e. the timbre section uses P20 only where supplied, and raises no bass change', () => {
  const prompt = getSystemSummarySectionPrompt('timbre_matching', 'Timbre Matching');
  assert.doesNotMatch(prompt, /Never reference P20/);
  assert.match(prompt, /bass consistency across seats \(P20\) only where it is supplied as reliable, positive and useful/i);
  assert.match(prompt, /Do not raise a bass change of any kind/);
});

// ── 5. Proposal stage explains the design, it never redesigns it ────────────

test('5. the writing contract carries the proposal-stage boundary', () => {
  const contract = buildWritingStyleContract();
  assert.match(contract, /PROPOSAL STAGE: EXPLAIN THE DESIGN, NEVER REDESIGN IT/);
  assert.match(contract, /Never act as a second design consultant/);
  assert.match(contract, /never create a recommendation that is not already in the project data, a saved version or the designer brief/);
});

test('5b. the old invitation to offer an alternative is gone', () => {
  const contract = buildWritingStyleContract();
  assert.doesNotMatch(contract, /Offer a practical alternative/);
  assert.doesNotMatch(contract, /CHALLENGE ASSUMPTIONS/);
});

test('5c. upgrade suggestions are future options only', () => {
  const contract = buildWritingStyleContract();
  // All five conditions of the upgrade-path rule, each stated on its own.
  assert.match(contract, /Upgrade suggestions are allowed only when they are obvious and safe/);
  assert.match(contract, /supported by the data/);
  assert.match(contract, /already represented by another saved version or a compared option/);
  assert.match(contract, /included in the designer brief/);
  assert.match(contract, /always phrased as a future option rather than a correction/);
  assert.match(contract, /If greater overhead movement becomes a priority later/);
  assert.match(contract, /The four-subwoofer option improves bass consistency across more seats/);
  const sectionPrompt = getSystemSummarySectionPrompt('spatial_resolution', 'Spatial Resolution');
  assert.match(sectionPrompt, /always phrased as a future option/);
});

test('5d. the forbidden post-design moves are named as bad examples', () => {
  const contract = buildWritingStyleContract();
  for (const banned of [
    'Move the subwoofers to improve bass consistency.',
    'The designer should add more subs.',
    'ADI recommends changing the layout.',
    'Add a better processor.',
    'Use a different calibration platform.',
  ]) {
    assert.ok(contract.includes(banned), `the contract should name "${banned}" as forbidden`);
  }
});

test('5e. the silent final quality check covers the stage boundary', () => {
  const contract = buildWritingStyleContract();
  assert.match(contract, /Is this explaining the chosen design rather than redesigning it\?/);
  assert.match(contract, /Is bass consistency included only where it is current, positive and useful, and never as criticism of the design\?/);
  assert.match(contract, /Is the report still built around Spatial Resolution, Dynamic Range and Timbre Matching\?/);
  assert.match(contract, /Are the parameters used as evidence rather than as the story\?/);
});

// ── 6. Design-stage versus proposal-stage separation ───────────────────────

test('6. design-stage guidance is not the report authority', () => {
  const contract = buildWritingStyleContract();
  // The report contract states that design-stage ideas belong in the design
  // stage, and the report itself never carries one.
  assert.match(contract, /This report is written after the design is complete/);
  assert.match(contract, /design stage/i);
});

test('6b. hard exclusions are unchanged', () => {
  assert.equal(EXCLUDED_PARAMETERS[8], 'not used');
  assert.equal(EXCLUDED_PARAMETERS[15], 'not used');
  assert.equal(EXCLUDED_PARAMETERS[21], 'not used');
  assert.equal(EXCLUDED_PARAMETERS[20], undefined, 'P20 is no longer hard excluded');
  const contract = buildWritingStyleContract();
  assert.match(contract, /Never reference P15/);
  assert.match(contract, /Ignore P8 completely/);
  assert.match(contract, /Do not mention P21/);
  assert.doesNotMatch(contract, /Never reference P20/);
  assert.doesNotMatch(contract, /never a row for P8, P15 or P20/);
  // P8, P15 and P21 are still never offered to the writer.
  const evidence = buildEngineeringEvidence(strong);
  assert.doesNotMatch(evidence, /\(P8\)|\(P15\)|\(P21\)/);
  assert.match(evidence, /Assumed parameters, never referenced in this report/);
});

test('6c. the Dynamic Range rule is unchanged: P12 and P13 lead, P14 only where reliable', () => {
  const prompt = getSystemSummarySectionPrompt('dynamic_range', 'Dynamic Range');
  assert.match(prompt, /Screen Dynamic Range \(P12\) and Non-screen Dynamic Range \(P13\) are the main evidence/);
  assert.match(prompt, /Never reference P15/);
});

// ── Report ─────────────────────────────────────────────────────────────────

const failures = results.filter((line) => line.startsWith('FAIL'));
console.log(results.join('\n'));
console.log(`\n${results.length - failures.length}/${results.length} checks passed`);
if (failures.length > 0) process.exitCode = 1;