import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyDataAdequacy, DATA_ADEQUACY } from '../src/components/spl/dataAdequacyClassification.js';

test('LIMITED when not eligible (no specs / brand+model only)', () => {
  assert.equal(classifyDataAdequacy(null).key, 'INCOMPLETE');
  assert.equal(classifyDataAdequacy({ p12_p13_eligible: false }).key, 'INCOMPLETE');
  assert.equal(classifyDataAdequacy({}).key, 'INCOMPLETE');
});

test('FULL: manufacturer publishes an explicit continuous maximum SPL', () => {
  const r = {
    p12_p13_eligible: true,
    max_spl_authority_type: 'published_continuous',
    halfspace_published_max_continuous_spl_db_1m: 112,
    sensitivity_space_provenance: 'half_space_published',
    max_spl_space_provenance: 'half_space_published',
    sensitivity_reference: '2.83V/1m',
  };
  assert.equal(classifyDataAdequacy(r).key, 'FULL');
});

test('FULL is not downgraded when measurement space is assumed', () => {
  // The continuous max SPL is published directly — an assumed half-space on
  // the sensitivity axis is an unrelated field and does not affect the
  // capability figure.
  const r = {
    p12_p13_eligible: true,
    max_spl_authority_type: 'published_continuous',
    halfspace_published_max_continuous_spl_db_1m: 112,
    sensitivity_space_provenance: 'half_space_assumed',
    max_spl_space_provenance: 'half_space_assumed',
    sensitivity_reference: '2.83V/1m',
  };
  assert.equal(classifyDataAdequacy(r).key, 'FULL');
});

test('FULL is not downgraded when sensitivity basis is unstated', () => {
  const r = {
    p12_p13_eligible: true,
    max_spl_authority_type: 'published_continuous',
    halfspace_published_max_continuous_spl_db_1m: 112,
    sensitivity_space_provenance: 'half_space_published',
    max_spl_space_provenance: 'half_space_published',
    sensitivity_reference: 'unknown',
  };
  assert.equal(classifyDataAdequacy(r).key, 'FULL');
});

test('GOOD: published peak SPL (not confirmed continuous) needs the −6 dB allowance', () => {
  const r = {
    p12_p13_eligible: true,
    max_spl_authority_type: 'assumed_peak',
    halfspace_published_max_peak_spl_db_1m: 118,
    halfspace_estimated_continuous_from_peak_spl_db_1m: 112,
  };
  assert.equal(classifyDataAdequacy(r).key, 'GOOD');
});

test('GOOD: manufacturer explicitly labels the SPL as peak', () => {
  const r = {
    p12_p13_eligible: true,
    max_spl_authority_type: 'published_peak',
    halfspace_published_max_peak_spl_db_1m: 120,
  };
  assert.equal(classifyDataAdequacy(r).key, 'GOOD');
});

test('GOOD: no published max SPL, capability calculated from sensitivity + power authority', () => {
  // Eligible with a recognised sensitivity reference, impedance and a valid
  // (non-provisional) power authority — a credible calculated estimate is GOOD.
  const r = {
    p12_p13_eligible: true,
    max_spl_authority_type: 'none',
    provisional_peak_assumed: false,
    halfspace_published_max_continuous_spl_db_1m: null,
    halfspace_calculated_max_continuous_spl_db_1m: 110,
    sensitivity_value_db: 96,
    sensitivity_reference: '2.83V/1m',
    rated_impedance_ohm: 4,
    power_authority_w: 150,
    power_authority: 'Manufacturer recommended amplifier maximum',
    sensitivity_space_provenance: 'half_space_published',
    max_spl_space_provenance: 'half_space_published',
  };
  assert.equal(classifyDataAdequacy(r).key, 'GOOD');
});

test('LIMITED: provisional peak-to-continuous power estimate', () => {
  const r = {
    p12_p13_eligible: true,
    provisional_peak_assumed: true,
    max_spl_authority_type: 'none',
    halfspace_published_max_continuous_spl_db_1m: null,
    halfspace_calculated_max_continuous_spl_db_1m: 111.97,
  };
  assert.equal(classifyDataAdequacy(r).key, 'INCOMPLETE');
});

test('labels are the three admin-facing terms, never A/B/C/D', () => {
  const labels = Object.values(DATA_ADEQUACY).map((d) => d.label);
  assert.deepEqual(labels.sort(), ['FULL DATA', 'GOOD DATA', 'LIMITED DATA']);
});

test('FULL: Ascendo-style explicit continuous maximum SPL (half space)', () => {
  const r = {
    p12_p13_eligible: true,
    max_spl_authority_type: 'published_continuous',
    halfspace_published_max_continuous_spl_db_1m: 123,
    halfspace_published_max_peak_spl_db_1m: 135,
    sensitivity_value_db: 97,
    sensitivity_reference: '1W/1m',
    rated_impedance_ohm: 8,
    // Amplifier/power fields absent — unrelated, must not downgrade FULL.
    continuous_power_w: null,
    recommended_amp_max_w: null,
  };
  assert.equal(classifyDataAdequacy(r).key, 'FULL');
});

test('GOOD: calculated from published continuous power rating (no max SPL)', () => {
  const r = {
    p12_p13_eligible: true,
    max_spl_authority_type: 'none',
    provisional_peak_assumed: false,
    halfspace_published_max_continuous_spl_db_1m: null,
    halfspace_calculated_max_continuous_spl_db_1m: 112,
    sensitivity_value_db: 90,
    sensitivity_reference: '2.83V/1m',
    rated_impedance_ohm: 8,
    power_authority_w: 120,
    power_authority: 'Continuous',
    normalized_continuous_power_w: 120,
  };
  assert.equal(classifyDataAdequacy(r).key, 'GOOD');
});