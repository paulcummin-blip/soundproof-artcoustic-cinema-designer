import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSelectedSpeakerExplanation } from '../src/components/spl/selectedSpeakerExplanationModel.js';

test('GOOD (calculated): James BE806 MKII-style — sensitivity, impedance, recommended amp max, no max SPL', () => {
  const record = {
    p12_p13_eligible: true,
    max_spl_authority_type: 'none',
    provisional_peak_assumed: false,
    sensitivity_value_db: 96,
    sensitivity_reference: '2.83V/1m',
    sensitivity_impedance_used_ohm: 4,
    rated_impedance_ohm: 4,
    power_authority_w: 150,
    power_authority: 'Manufacturer recommended amplifier maximum',
    normalized_continuous_power_w: null,
    halfspace_published_max_continuous_spl_db_1m: null,
    halfspace_published_max_peak_spl_db_1m: null,
    halfspace_estimated_continuous_from_peak_spl_db_1m: null,
    halfspace_calculated_max_continuous_spl_db_1m: 114.8,
  };
  const e = buildSelectedSpeakerExplanation(record);
  assert.equal(e.label, 'GOOD DATA');
  assert.match(e.calculated, /96/);
  assert.match(e.calculated, /4 Ω/);
  assert.match(e.calculated, /150 W/);
  assert.match(e.calculated, /amplifier recommendation/);
  assert.match(e.dontKnow, /maximum SPL/);
  // The actual normalized calculated SPL at 1 m must appear, not a hardcoded value.
  assert.match(e.calculated, /114\.8 dB/);
  // The −6 dB peak allowance is never mentioned when no max SPL is published.
  assert.doesNotMatch(e.why, /−6 dB/);
  assert.doesNotMatch(e.calculated, /−6 dB/);
  assert.doesNotMatch(e.calculated, /peak-to-continuous/);
});

test('GOOD (peak-derived): KEF Ci200QL-style — published max SPL not confirmed continuous', () => {
  const record = {
    p12_p13_eligible: true,
    max_spl_authority_type: 'assumed_peak',
    provisional_peak_assumed: false,
    halfspace_published_max_peak_spl_db_1m: 107,
    halfspace_published_max_continuous_spl_db_1m: null,
    halfspace_estimated_continuous_from_peak_spl_db_1m: 101,
  };
  const e = buildSelectedSpeakerExplanation(record);
  assert.equal(e.label, 'GOOD DATA');
  assert.match(e.calculated, /107/);
  assert.match(e.calculated, /101/);
  assert.match(e.dontKnow, /continuous/);
});

test('FULL: Ascendo THE12 PRO-style — explicit continuous max SPL', () => {
  const record = {
    p12_p13_eligible: true,
    max_spl_authority_type: 'published_continuous',
    halfspace_published_max_continuous_spl_db_1m: 123,
    halfspace_published_max_peak_spl_db_1m: 135,
  };
  const e = buildSelectedSpeakerExplanation(record);
  assert.equal(e.label, 'FULL DATA');
  assert.match(e.calculated, /No additional SPL estimate/);
  assert.match(e.why, /123/);
  assert.equal(e.dontKnow, null);
});

test('LIMITED: ineligible — no calculation claimed', () => {
  const record = {
    p12_p13_eligible: false,
    max_spl_authority_type: 'none',
    normalization_warnings: ['Missing sensitivity', 'Missing continuous/AES power, recommended amplifier maximum and published peak power'],
  };
  const e = buildSelectedSpeakerExplanation(record);
  assert.equal(e.label, 'LIMITED DATA');
  assert.equal(e.calculated, null);
  assert.match(e.dontKnow, /Missing sensitivity/);
});

test('LIMITED: provisional peak-power assumption — not promoted to GOOD', () => {
  const record = {
    p12_p13_eligible: true,
    max_spl_authority_type: 'none',
    provisional_peak_assumed: true,
    published_peak_power_w: 200,
    assumed_continuous_power_w: 100,
  };
  const e = buildSelectedSpeakerExplanation(record);
  assert.equal(e.label, 'LIMITED DATA');
  assert.match(e.assumed, /50%/);
  assert.equal(e.calculated, null);
});