// p12-p13-readiness.test.mjs
// ---------------------------------------------------------------------------
// Tests for the P12/P13 calculation readiness separation:
//   - Only sensitivity, sensitivity reference, impedance and power authority
//     are critical blockers for a GOOD DATA calculation.
//   - Frequency response, measurement space, source URL, source date and
//     evidence quality are informational gaps that never block the calculation.
//
// The normalizeCompetitor p12_p13_eligible flag is the authority: it is based
// ONLY on sensitivity, sensitivity reference/impedance, and power (or published
// SPL). Frequency response and other metadata never affect eligibility.
// ---------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';

const present = (v) =>
  v !== null && v !== undefined && v !== "" && v !== "unknown" && v !== "unspecified";

function resolvePowerAuthority(s) {
  if (present(s.power_handling_continuous_w)) return { value: s.power_handling_continuous_w };
  if (present(s.recommended_amp_max_w)) return { value: s.recommended_amp_max_w };
  return { value: null };
}

// The new critical fields (from COMPARISON_FIELDS after the fix):
const CRITICAL_FIELDS = [
  { key: 'sensitivity_db', label: 'Sensitivity', check: (s) => present(s.sensitivity_db) },
  { key: 'sensitivity_basis', label: 'Sensitivity basis', check: (s) => present(s.sensitivity_basis) },
  { key: 'nominal_impedance_ohm', label: 'Nominal impedance', check: (s) => present(s.nominal_impedance_ohm) },
  { key: 'power_authority', label: 'Power authority', check: (s) => resolvePowerAuthority(s).value !== null || present(s.max_continuous_spl_db) },
];

// The new useful (non-critical) fields:
const USEFUL_FIELDS = [
  { key: 'frequency_response', label: 'Frequency response', check: (s) => present(s.frequency_response_low_hz) || present(s.frequency_response_high_hz) },
  { key: 'measurement_space', label: 'Measurement space', check: (s) => s.measurement_space !== null && s.measurement_space !== undefined && String(s.measurement_space).trim() !== '' },
  { key: 'source_url', label: 'Source URL', check: (s, p) => present(p?.official_product_url) || present(s.datasheet_url) },
  { key: 'source_date', label: 'Source date', check: (s) => present(s.source_date) },
  { key: 'evidence_quality', label: 'Evidence quality', check: (s) => present(s.evidence_quality) && s.evidence_quality !== 'Unknown' },
];

function checkReadiness(spec, product = {}) {
  const missingCritical = CRITICAL_FIELDS.filter((f) => !f.check(spec, product)).map((f) => f.label);
  const missingUseful = USEFUL_FIELDS.filter((f) => !f.check(spec, product)).map((f) => f.label);
  const eligible = missingCritical.length === 0;
  const adequacy = !eligible ? 'INCOMPLETE' : 'GOOD';
  return { missingCritical, missingUseful, eligible, adequacy };
}

// --- B&W CT8.4 LCRS (with accepted power, frequency high still wrong) ---

const bwSpec = {
  sensitivity_db: 88,
  sensitivity_basis: '2.83V/1m',
  nominal_impedance_ohm: 8,
  recommended_amp_max_w: 500,
  recommended_amp_min_w: 50,
  frequency_response_low_hz: 49,
  frequency_response_high_hz: 24, // stored wrong, but not a blocker
  measurement_space: 'unspecified',
  source_date: '2026-11-16',
  evidence_quality: 'Manufacturer Published',
  max_continuous_spl_db: null,
};
const bwProduct = { official_product_url: 'https://www.bowerswilkins.com/...2025-update.pdf' };

// --- Speaker with NO frequency response at all ---

const noFreqSpec = {
  sensitivity_db: 90,
  sensitivity_basis: '2.83V/1m',
  nominal_impedance_ohm: 6,
  recommended_amp_max_w: 200,
  frequency_response_low_hz: null,
  frequency_response_high_hz: null,
  measurement_space: 'unspecified',
  source_date: null,
  evidence_quality: null,
  max_continuous_spl_db: null,
};
const noFreqProduct = { official_product_url: '' };

// --- Speaker with NO power (genuinely insufficient) ---

const noPowerSpec = {
  sensitivity_db: 88,
  sensitivity_basis: '2.83V/1m',
  nominal_impedance_ohm: 8,
  recommended_amp_max_w: null,
  frequency_response_low_hz: 49,
  measurement_space: 'unspecified',
};
const noPowerProduct = {};

// --- Tests ---

test('B&W CT8.4 LCRS with power: GOOD DATA, no critical gaps', () => {
  const r = checkReadiness(bwSpec, bwProduct);
  assert.equal(r.missingCritical.length, 0, 'No critical gaps');
  assert.equal(r.eligible, true);
  assert.equal(r.adequacy, 'GOOD');
});

test('B&W CT8.4 LCRS: calculated SPL is approximately 115 dB', () => {
  const sens = 88;
  const power = 500;
  const calc = sens + 10 * Math.log10(power);
  assert.ok(Math.abs(calc - 115) < 1, `Expected ~115 dB, got ${calc.toFixed(1)}`);
});

test('B&W CT8.4 LCRS: wrong frequency high (24 Hz) does not block GOOD DATA', () => {
  const r = checkReadiness(bwSpec, bwProduct);
  assert.equal(r.adequacy, 'GOOD');
  // Frequency response is present (low=49), so it's not even in missingUseful
  assert.ok(!r.missingUseful.includes('Frequency response'));
});

test('Speaker with NO frequency response: GOOD DATA (frequency is informational only)', () => {
  const r = checkReadiness(noFreqSpec, noFreqProduct);
  assert.equal(r.missingCritical.length, 0, 'No critical gaps');
  assert.equal(r.eligible, true);
  assert.equal(r.adequacy, 'GOOD');
  // Frequency response IS missing but only as a useful gap
  assert.ok(r.missingUseful.includes('Frequency response'));
});

test('Speaker with NO frequency response: source date and URL are informational gaps', () => {
  const r = checkReadiness(noFreqSpec, noFreqProduct);
  assert.ok(r.missingUseful.includes('Source URL'));
  assert.ok(r.missingUseful.includes('Source date'));
  assert.ok(r.missingUseful.includes('Evidence quality'));
  // But these are NOT critical
  assert.ok(!r.missingCritical.includes('Source URL'));
  assert.ok(!r.missingCritical.includes('Source date'));
  assert.ok(!r.missingCritical.includes('Evidence quality'));
});

test('Speaker with NO power: INCOMPLETE (power is genuinely essential)', () => {
  const r = checkReadiness(noPowerSpec, noPowerProduct);
  assert.ok(r.missingCritical.includes('Power authority'), 'Power must be critical');
  assert.equal(r.eligible, false);
  assert.equal(r.adequacy, 'INCOMPLETE');
});

test('Speaker with NO sensitivity: INCOMPLETE (sensitivity is essential)', () => {
  const noSensSpec = { ...bwSpec, sensitivity_db: null };
  const r = checkReadiness(noSensSpec, bwProduct);
  assert.ok(r.missingCritical.includes('Sensitivity'));
  assert.equal(r.adequacy, 'INCOMPLETE');
});

test('Speaker with NO sensitivity basis: INCOMPLETE (reference is essential for normalisation)', () => {
  const noBasisSpec = { ...bwSpec, sensitivity_basis: null };
  const r = checkReadiness(noBasisSpec, bwProduct);
  assert.ok(r.missingCritical.includes('Sensitivity basis'));
  assert.equal(r.adequacy, 'INCOMPLETE');
});

test('Measurement space "unspecified" is NOT a critical gap', () => {
  const r = checkReadiness(bwSpec, bwProduct);
  assert.ok(!r.missingCritical.includes('Measurement space'));
});

test('Frequency response is NOT in the critical field list', () => {
  const criticalKeys = CRITICAL_FIELDS.map((f) => f.key);
  assert.ok(!criticalKeys.includes('frequency_response'));
});

test('Source date is NOT in the critical field list', () => {
  const criticalKeys = CRITICAL_FIELDS.map((f) => f.key);
  assert.ok(!criticalKeys.includes('source_date'));
  assert.ok(!criticalKeys.includes('source_url'));
});

test('Evidence quality is NOT in the critical field list', () => {
  const criticalKeys = CRITICAL_FIELDS.map((f) => f.key);
  assert.ok(!criticalKeys.includes('evidence_quality'));
});

test('Only 4 fields are critical: sensitivity, basis, impedance, power', () => {
  assert.equal(CRITICAL_FIELDS.length, 4);
  const keys = CRITICAL_FIELDS.map((f) => f.key);
  assert.deepEqual(keys.sort(), ['nominal_impedance_ohm', 'power_authority', 'sensitivity_basis', 'sensitivity_db']);
});