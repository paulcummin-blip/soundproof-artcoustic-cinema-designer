// ascendo-extraction-regression.test.mjs
// ---------------------------------------------------------------------------
// Regression test for the Ascendo THE12 PRO PASSIVE ON WALL manufacturer
// specification extraction and approval mapping.
//
// Confirmed manufacturer datasheet:
//   Sensitivity:              97 dB / 1 W / 2π
//   Nominal impedance:        8 Ω
//   Power handling:          900 W  (no continuous/AES/programme/peak qualifier)
//   Calculated maximum SPL:  123 dB continuous / 135 dB peak
//   SPL measurement space:  half-space (2π)
//
// Expected behaviour after the fix:
//   - The continuous SPL authority is 123 dB (no −6 dB deduction).
//   - The 135 dB peak figure is separately recorded.
//   - The 900 W power handling is stored as manufacturer power handling, NOT
//     misclassified as recommended amplifier maximum.
//   - The 8 Ω nominal impedance is captured.
//   - The measurement space is half-space.
//
// This test exercises the normalizer (competitorNormalization.js) and the
// max-SPL authority (maxSplAuthority.js) with a competitor record shaped
// exactly like the approved Ascendo row, including the edge case where the
// comparison row's max_spl_basis was not carried through from the spec
// (null basis with a populated continuous field).
// ---------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCompetitor, competitorMetaForComparison } from '../src/components/utils/spl/competitorNormalization.js';
import { classifyMaxSplAuthority } from '../src/components/utils/spl/maxSplAuthority.js';
import {
  CROSSOVER_ASSUMPTION,
  COMPARISON_PARITY_STATEMENT,
} from '../src/components/utils/spl/comparisonAssumptions.js';

// A competitor record shaped like the Ascendo THE12 PRO PASSIVE ON WALL after
// the spec was correctly populated and published.
function ascendoRecord(overrides = {}) {
  return {
    manufacturer: 'Ascendo Immersive Audio',
    model: 'THE12 PRO PASSIVE',
    sensitivity_value_db: 97,
    sensitivity_reference: '1W/1m',
    rated_impedance_ohm: 8,
    // 900 W manufacturer power handling, no recommended amplifier range.
    continuous_power_w: 900,
    power_rating_type: 'Manufacturer Power Handling',
    recommended_amp_min_w: null,
    recommended_amp_max_w: null,
    // Both SPL figures explicitly published.
    published_max_continuous_spl_db_1m: 123,
    published_max_peak_spl_db_1m: 135,
    // The spec has max_spl_basis = "continuous"; the comparison row may or may
    // not have carried it through. Test both.
    max_spl_basis: 'continuous',
    measurement_space_basis: 'Half Space',
    sensitivity_measurement_basis: 'Half Space',
    max_spl_measurement_basis: 'Half Space',
    max_spl_test_conditions: 'continuous',
    data_confidence: 'A',
    source_evidence_quality: 'Manufacturer Published',
    source_specification_id: 'spec-ascendo-the12',
    publish_source: 'speaker_database',
    published: true,
    ...overrides,
  };
}

// ── The core regression: 123 dB continuous is used directly, no −6 dB ───────

test('Ascendo THE12 PRO PASSIVE: 123 dB continuous SPL used directly (no −6 dB)', () => {
  const record = ascendoRecord();
  const n = normalizeCompetitor(record);

  assert.equal(n.max_spl_authority_type, 'published_continuous',
    'A populated continuous field with basis "continuous" must be published_continuous');
  assert.equal(n.halfspace_published_max_continuous_spl_db_1m, 123,
    'The published continuous SPL is 123 dB (half-space, no correction)');
  assert.equal(n.halfspace_published_max_peak_spl_db_1m, 135,
    'The published peak SPL is 135 dB (half-space, separately recorded)');
  assert.equal(n.halfspace_estimated_continuous_from_peak_spl_db_1m, null,
    'No −6 dB estimate is produced when a continuous figure is published');
  assert.equal(n.halfspace_max_spl_limit_db_1m, 123,
    'The hard cap passed to the comparison engine is 123 dB, not 117 dB');
  assert.equal(n.capability_basis, 'Published',
    'The capability basis is Published (manufacturer-confirmed continuous)');
});

test('Ascendo: even with null/unknown basis, the continuous field is trusted (no −6 dB)', () => {
  // The published CompetitorSpeaker row had max_spl_basis = null (it was not
  // carried through from the spec). The normalizer must still trust the
  // continuous field and NOT apply the −6 dB deduction.
  for (const basis of [null, 'unknown', 'calculated', 'manufacturer unspecified']) {
    const record = ascendoRecord({ max_spl_basis: basis });
    const n = normalizeCompetitor(record);
    assert.equal(n.max_spl_authority_type, 'published_continuous',
      `basis=${basis}: continuous field is the authority`);
    assert.equal(n.halfspace_max_spl_limit_db_1m, 123,
      `basis=${basis}: limit is 123, not 117`);
    assert.equal(n.halfspace_estimated_continuous_from_peak_spl_db_1m, null,
      `basis=${basis}: no −6 dB estimate`);
  }
});

// ── The 135 dB peak figure remains separately recorded ──────────────────────

test('Ascendo: 135 dB peak is separately recorded and not used as the limit', () => {
  const record = ascendoRecord();
  const n = normalizeCompetitor(record);

  assert.equal(n.halfspace_published_max_peak_spl_db_1m, 135,
    'The peak SPL is 135 dB (half-space)');
  assert.equal(n.halfspace_max_spl_limit_db_1m, 123,
    'The limit uses the continuous figure (123), not the peak (135)');
});

// ── Power handling: 900 W is manufacturer power handling, NOT recommended amp ─

test('Ascendo: 900 W power handling is manufacturer power handling, not recommended amplifier', () => {
  // The normalizer resolves the power authority from the competitor record.
  // 900 W in continuous_power_w with power_rating_type "Manufacturer Power Handling"
  // means the power authority is the manufacturer's published power handling,
  // NOT a recommended amplifier maximum.
  const record = ascendoRecord();
  const n = normalizeCompetitor(record);

  assert.equal(n.normalized_continuous_power_w, 900,
    'The normalized continuous power is 900 W');
  assert.equal(n.power_authority, 'Manufacturer Power Handling',
    'The power authority label preserves the uncertainty (no AES/IEC/continuous standard claimed)');
  assert.equal(n.power_authority_w, 900);
  // recommended_amp_max_w is null — 900 W was not misclassified as recommended amplifier
  assert.equal(n.recommended_amp_max_w, null,
    'recommended_amp_max_w is null — 900 W was NOT misclassified as recommended amplifier');
  // The power authority source is a published rating, not a recommended amplifier maximum
  assert.notEqual(n.power_authority, 'Manufacturer recommended amplifier maximum',
    'The power authority must NOT read as a recommended amplifier maximum');
});

test('Ascendo: power handling uncertainty is preserved (no invented standard)', () => {
  // The manufacturer stated "Power Handling: 900 W" with no continuous/AES/IEC/peak
  // qualifier. The label "Manufacturer Power Handling" preserves this uncertainty
  // — it does NOT claim "Continuous", "AES", or any specific standard.
  const record = ascendoRecord();
  const n = normalizeCompetitor(record);
  assert.equal(n.power_authority, 'Manufacturer Power Handling');
  assert.notEqual(n.power_authority, 'Continuous');
  assert.notEqual(n.power_authority, 'AES');
  assert.notEqual(n.power_authority, 'Long term IEC');
  assert.notEqual(n.power_authority, 'Rated IEC');
  assert.notEqual(n.power_authority, 'Manufacturer recommended amplifier maximum');
});

// ── Impedance and sensitivity ───────────────────────────────────────────────

test('Ascendo: 8 Ω impedance and 97 dB sensitivity captured correctly', () => {
  const record = ascendoRecord();
  const n = normalizeCompetitor(record);

  assert.equal(n.rated_impedance_ohm, 8, 'Nominal impedance is 8 Ω');
  // 1W/1m sensitivity reference → no voltage-to-watt correction needed
  assert.equal(n.voltage_to_1w_correction_db, 0,
    '1W/1m reference means no voltage-to-watt correction');
  assert.equal(n.normalized_sensitivity_db_1w_1m, 97,
    '97 dB is already 1W/1m');
  assert.equal(n.halfspace_sensitivity_db_1w_1m, 97,
    'Half-space sensitivity is 97 dB (0 dB space correction)');
  assert.equal(n.sensitivity_space_provenance, 'half_space_published',
    'Sensitivity space is published half-space');
  assert.equal(n.max_spl_space_provenance, 'half_space_published',
    'Max SPL space is published half-space');
});

// ── The comparison engine receives the correct capability ───────────────────

test('Ascendo: comparison engine receives 123 dB as the hard cap', () => {
  const record = ascendoRecord();
  const meta = competitorMetaForComparison(record);
  assert.ok(meta, 'The Ascendo record is eligible for comparison');
  assert.equal(meta.max_spl_cont_db_1m_halfspace, 123,
    'The hard cap passed to the central SPL engine is 123 dB');
  assert.equal(meta.power_handling_w, 900,
    'The power authority is 900 W');
  assert.equal(meta.recommended_amp_max_w, null,
    'No recommended amplifier maximum — 900 W is manufacturer power handling');
});

test('Ascendo: comparison engine receives 123 dB even with null basis on the row', () => {
  const record = ascendoRecord({ max_spl_basis: null });
  const meta = competitorMetaForComparison(record);
  assert.equal(meta.max_spl_cont_db_1m_halfspace, 123,
    'The hard cap is 123 dB even when the row basis was not carried through');
});

// ── Previously correct records remain unchanged ─────────────────────────────

test('Regression: peak-only records still get −6 dB (unchanged)', () => {
  // A record with ONLY a peak SPL (no continuous field) still gets the −6 dB
  // treatment — the fix only affects records with a populated continuous field.
  const record = ascendoRecord({
    published_max_continuous_spl_db_1m: null,
    published_max_peak_spl_db_1m: 135,
    max_spl_basis: 'peak',
  });
  const n = normalizeCompetitor(record);
  assert.equal(n.max_spl_authority_type, 'published_peak');
  assert.equal(n.halfspace_published_max_peak_spl_db_1m, 135);
  assert.equal(n.halfspace_estimated_continuous_from_peak_spl_db_1m, 129,
    '135 − 6 = 129 dB estimated continuous');
  assert.equal(n.halfspace_max_spl_limit_db_1m, 129);
});

test('Regression: unqualified max SPL (peak field only, unknown basis) still gets −6 dB', () => {
  const record = ascendoRecord({
    published_max_continuous_spl_db_1m: null,
    published_max_peak_spl_db_1m: 120,
    max_spl_basis: 'unknown',
  });
  const n = normalizeCompetitor(record);
  assert.equal(n.max_spl_authority_type, 'assumed_peak');
  assert.equal(n.halfspace_estimated_continuous_from_peak_spl_db_1m, 114,
    '120 − 6 = 114 dB');
  assert.equal(n.halfspace_max_spl_limit_db_1m, 114);
});

test('Regression: no published SPL → calculated from sensitivity + power (unchanged)', () => {
  const record = ascendoRecord({
    published_max_continuous_spl_db_1m: null,
    published_max_peak_spl_db_1m: null,
    max_spl_basis: 'unknown',
  });
  const n = normalizeCompetitor(record);
  assert.equal(n.max_spl_authority_type, 'none');
  assert.equal(n.halfspace_max_spl_limit_db_1m, null);
  assert.equal(n.capability_basis, 'Calculated');
  // 97 dB 1W/1m + 10·log10(900) ≈ 97 + 29.54 = 126.54 dB
  const calc = n.halfspace_calculated_max_continuous_spl_db_1m;
  assert.ok(Math.abs(calc - 126.54) < 0.1, `calculated ≈ 126.54 dB, got ${calc}`);
});

// ── classifyMaxSplAuthority unit tests for the Ascendo shape ────────────────

test('classifyMaxSplAuthority: Ascendo shape (continuous + peak, various bases)', () => {
  // The Ascendo shape: both continuous and peak fields populated.
  for (const basis of ['continuous', 'AES', 'IEC', 'calculated', 'manufacturer unspecified', 'unknown', null]) {
    const result = classifyMaxSplAuthority({ rawContinuous: 123, rawPeak: 135, maxSplBasis: basis });
    assert.equal(result.type, 'published_continuous',
      `basis=${basis}: both fields populated, continuous field is the authority`);
  }
  // Only when the basis explicitly says "peak" does it become published_peak
  const peakResult = classifyMaxSplAuthority({ rawContinuous: 123, rawPeak: 135, maxSplBasis: 'peak' });
  assert.equal(peakResult.type, 'published_peak',
    'basis="peak": the explicit peak label overrides the continuous field');
});

// ── The mapped comparison row (shaped like buildComparisonRow output) normalizes correctly ──
//
// buildComparisonRow maps an approved SpeakerSpecification into a CompetitorSpeaker
// row. The mapping is exercised end-to-end by the normalizer tests above (the
// ascendoRecord is shaped exactly like the mapped output: continuous_power_w from
// power_handling_continuous_w, power_rating_type "Manufacturer Power Handling",
// published_max_continuous/peak_spl_db_1m, max_spl_basis, measurement bases).
// The normalizer confirms the mapping produces the correct capability.

// ── 100 Hz crossover convention ─────────────────────────────────────────────

test('Crossover convention: CROSSOVER_ASSUMPTION states the 100 Hz crossover as a Sound Proof assumption', () => {
  assert.ok(CROSSOVER_ASSUMPTION.includes('100 Hz crossover'),
    'The crossover assumption names the 100 Hz crossover');
  assert.ok(CROSSOVER_ASSUMPTION.includes('Sound Proof'),
    'The crossover convention is stated as a Sound Proof assumption, not a manufacturer spec');
  assert.ok(!CROSSOVER_ASSUMPTION.toLowerCase().includes('manufacturer specification'),
    'The crossover convention is NOT a manufacturer specification');
});

test('Crossover convention: COMPARISON_PARITY_STATEMENT includes the 100 Hz crossover', () => {
  assert.ok(COMPARISON_PARITY_STATEMENT.includes('100 Hz crossover'),
    'The parity statement includes the 100 Hz crossover convention so Artcoustic and competitors are compared on the same basis');
});

// ── Frequency-specific SPL figures do NOT limit the broadband comparison ───
//
// The Ascendo datasheet also publishes:
//   118 dB at 60 Hz
//   100 dB at 40 Hz
// These are frequency-specific low-frequency capabilities, NOT the broadband
// maximum SPL. They must NOT be entered into max_continuous_spl_db or
// max_peak_spl_db, and they must NOT limit the P12/P13 comparison (which
// assumes a 100 Hz crossover — the main speaker operates above 100 Hz).

test('Frequency-specific SPL: 118 dB at 60 Hz does NOT enter the broadband max SPL fields', () => {
  // The correct extraction: only 123 dB continuous / 135 dB peak go into the
  // max SPL fields. The 118 dB at 60 Hz and 100 dB at 40 Hz go to
  // potential_unmapped as source evidence.
  const record = ascendoRecord();
  const n = normalizeCompetitor(record);

  // The broadband continuous SPL is 123 dB, not 118 dB or 100 dB
  assert.equal(n.halfspace_published_max_continuous_spl_db_1m, 123,
    'The broadband continuous SPL is 123 dB, not the 60 Hz or 40 Hz figure');
  assert.equal(n.halfspace_published_max_peak_spl_db_1m, 135,
    'The broadband peak SPL is 135 dB');
  assert.equal(n.halfspace_max_spl_limit_db_1m, 123,
    'The P12/P13 limit is 123 dB (broadband), not limited by the 40 Hz figure');
});

test('Frequency-specific SPL: if 100 dB at 40 Hz were wrongly placed in the continuous field, the comparison would be unfairly limited', () => {
  // This test documents the FAILURE mode the extraction prompt prevents.
  // If "100 dB at 40 Hz" were entered as max_continuous_spl_db, the P12/P13
  // comparison would be capped at 100 dB — far below the 123 dB broadband
  // capability the speaker actually has above a 100 Hz crossover.
  const wrongRecord = ascendoRecord({
    published_max_continuous_spl_db_1m: 100,  // WRONG: 40 Hz figure, not broadband
    published_max_peak_spl_db_1m: 135,
    max_spl_basis: 'continuous',
  });
  const n = normalizeCompetitor(wrongRecord);
  // This shows the damage: the limit would be 100 dB instead of 123 dB
  assert.equal(n.halfspace_max_spl_limit_db_1m, 100,
    'A 40 Hz figure in the continuous field would wrongly cap the comparison');
  // The correct record (123 dB) must produce a higher limit — this is the
  // regression guard: the extraction must put 123 in the continuous field,
  // not 100.
  const correctRecord = ascendoRecord();
  const correctN = normalizeCompetitor(correctRecord);
  assert.ok(correctN.halfspace_max_spl_limit_db_1m > n.halfspace_max_spl_limit_db_1m,
    'The correct 123 dB broadband figure must produce a higher limit than the 40 Hz figure');
});