import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyDataAdequacy, DATA_ADEQUACY } from '../src/components/spl/dataAdequacyClassification.js';
import { normalizeCompetitor } from '../src/components/utils/spl/competitorNormalization.js';

test('INCOMPLETE when not eligible (no specs / brand+model only)', () => {
  assert.equal(classifyDataAdequacy(null).key, 'INCOMPLETE');
  assert.equal(classifyDataAdequacy({ p12_p13_eligible: false }).key, 'INCOMPLETE');
  assert.equal(classifyDataAdequacy({}).key, 'INCOMPLETE');
});

test('FULL: published measured SPL, confirmed space, confirmed sensitivity basis', () => {
  const r = {
    p12_p13_eligible: true,
    halfspace_published_max_continuous_spl_db_1m: 112,
    sensitivity_space_provenance: 'half_space_published',
    max_spl_space_provenance: 'half_space_published',
    sensitivity_reference: '2.83V/1m',
  };
  assert.equal(classifyDataAdequacy(r).key, 'FULL');
});

test('GOOD: calculated SPL (not published) needs a normalisation', () => {
  const r = {
    p12_p13_eligible: true,
    halfspace_published_max_continuous_spl_db_1m: null,
    halfspace_calculated_max_continuous_spl_db_1m: 110,
    sensitivity_space_provenance: 'half_space_published',
    max_spl_space_provenance: 'half_space_published',
    sensitivity_reference: '2.83V/1m',
  };
  assert.equal(classifyDataAdequacy(r).key, 'GOOD');
});

test('GOOD: published SPL but assumed half-space needs an assumption', () => {
  const r = {
    p12_p13_eligible: true,
    halfspace_published_max_continuous_spl_db_1m: 112,
    sensitivity_space_provenance: 'half_space_assumed',
    max_spl_space_provenance: 'half_space_published',
    sensitivity_reference: '2.83V/1m',
  };
  assert.equal(classifyDataAdequacy(r).key, 'GOOD');
});

test('GOOD: published SPL but sensitivity basis unstated', () => {
  const r = {
    p12_p13_eligible: true,
    halfspace_published_max_continuous_spl_db_1m: 112,
    sensitivity_space_provenance: 'half_space_published',
    max_spl_space_provenance: 'half_space_published',
    sensitivity_reference: 'unknown',
  };
  assert.equal(classifyDataAdequacy(r).key, 'GOOD');
});

test('GOOD DATA: sensitivity + impedance + max SPL ceiling (no power) — Wisdom P2i route', () => {
  // Manufacturer publishes sensitivity, nominal impedance and a maximum SPL at
  // 1 m, but no continuous/AES power rating and no stated duration or space.
  const n = normalizeCompetitor({
    manufacturer: 'Wisdom Audio', model: 'P2i',
    sensitivity_value_db: 86,
    sensitivity_reference: '2.83V/1m',
    sensitivity_impedance_used_ohm: 4,
    published_max_continuous_spl_db_1m: 107,
    // max_spl_test_conditions, sensitivity_measurement_basis, max_spl_measurement_basis all unstated
  });
  // The row is eligible for P12/P13 — the defensible estimate route.
  assert.equal(n.p12_p13_eligible, true);
  // 86 dB @ 2.83 V / 1 m into 4 Ω  ≈ 83 dB @ 1 W / 1 m (2.83² / 4 = 2 W → −3 dB).
  assert.ok(Math.abs(n.normalized_sensitivity_db_1w_1m - 83) < 0.5,
    `expected ~83 dB @ 1W/1m, got ${n.normalized_sensitivity_db_1w_1m}`);
  // The ambiguous "Max SPL" is reclassified as peak / short-term — never continuous.
  assert.equal(n.max_spl_duration_assumed, true);
  assert.equal(n.max_spl_reclassified_as_peak, true);
  assert.equal(n.halfspace_published_max_continuous_spl_db_1m, null);
  // The 107 dB peak ceiling is the conservative cap the engine caps the
  // variable-power calc at (continuous ≤ peak; 107 is not proof of continuous).
  assert.ok(Math.abs(n.halfspace_published_max_peak_spl_db_1m - 107) < 0.5);
  assert.ok(Math.abs(n.halfspace_effective_max_continuous_spl_db_1m - 107) < 0.5);
  // Measurement space not stated → Half Space assumed, no +6 dB correction.
  assert.equal(n.max_spl_space_provenance, 'half_space_assumed');
  assert.equal(n.max_spl_space_correction_db, 0);
  assert.equal(n.spl_authority, 'Calculated from sensitivity, capped at max SPL ceiling');
  // Classifies as GOOD DATA — not INCOMPLETE, not FULL.
  const label = classifyDataAdequacy(n);
  assert.equal(label.key, DATA_ADEQUACY.GOOD.key);
  assert.notEqual(label.key, DATA_ADEQUACY.INCOMPLETE.key);
  assert.notEqual(label.key, DATA_ADEQUACY.FULL.key);
});

test('INCOMPLETE DATA: a max SPL ceiling with no sensitivity has no defensible route', () => {
  // "Max SPL" 112 published, no duration, no sensitivity/power — the peak ceiling
  // alone cannot drive the variable-power calc, so the row stays INCOMPLETE.
  const n = normalizeCompetitor({
    manufacturer: 'X', model: 'Y',
    published_max_continuous_spl_db_1m: 112,
    max_spl_measurement_basis: 'Half Space',
  });
  assert.equal(n.p12_p13_eligible, false);
  assert.equal(classifyDataAdequacy(n).key, DATA_ADEQUACY.INCOMPLETE.key);
});

test('labels are the three admin-facing terms, never A/B/C/D', () => {
  const labels = Object.values(DATA_ADEQUACY).map((d) => d.label);
  assert.deepEqual(labels.sort(), ['FULL DATA', 'GOOD DATA', 'INCOMPLETE DATA']);
});