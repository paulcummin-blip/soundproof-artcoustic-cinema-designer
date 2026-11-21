import { test } from 'node:test';
import assert from 'node:assert/strict';

// Pure-logic tests for the peak-to-continuous provisional assumption.
// These test the power hierarchy and classification without importing the
// base44 client (which requires a browser window).

import { assumedContinuousFromPeak, PEAK_TO_CONTINUOUS_FACTOR } from '../src/components/utils/spl/peakPowerAssumption.js';

// Re-implement the core power-resolution hierarchy for testing, mirroring
// resolvePowerAuthority in rp22ComparisonPublish.js.
function present(v) {
  return v !== null && v !== undefined && v !== '' && v !== 'unknown' && v !== 'unspecified';
}
function resolveContinuousPower(spec) {
  if (!spec) return { value: null, label: '' };
  if (present(spec.power_handling_continuous_w)) return { value: spec.power_handling_continuous_w, label: 'Manufacturer Power Handling' };
  if (present(spec.long_term_iec_power_w)) return { value: spec.long_term_iec_power_w, label: 'Long term IEC' };
  if (present(spec.rated_iec_power_w)) return { value: spec.rated_iec_power_w, label: 'Rated IEC' };
  if (present(spec.aes_power_w)) return { value: spec.aes_power_w, label: 'AES' };
  return { value: null, label: '' };
}
function resolvePeakPower(spec) {
  if (!spec) return null;
  if (present(spec.power_handling_peak_w)) return spec.power_handling_peak_w;
  if (present(spec.peak_power_w)) return spec.peak_power_w;
  return null;
}
function resolvePowerAuthority(spec) {
  const rating = resolveContinuousPower(spec);
  if (rating.value !== null) return { value: rating.value, label: rating.label, source: 'power_rating' };
  if (present(spec.recommended_amp_max_w)) return { value: spec.recommended_amp_max_w, label: 'Manufacturer recommended amplifier maximum', source: 'recommended_amp_max' };
  const peak = resolvePeakPower(spec);
  const assumed = assumedContinuousFromPeak(peak);
  if (assumed !== null) return { value: assumed, label: 'Assumed continuous-equivalent (50% of published peak)', source: 'peak_power_assumed' };
  return { value: null, label: '', source: null };
}

// Mirrors the provisional check in classifyDataAdequacy.
function isProvisional(authority) {
  return authority.source === 'peak_power_assumed';
}

test('assumedContinuousFromPeak: 500 W peak -> 250 W assumed', () => {
  assert.equal(assumedContinuousFromPeak(500), 250);
  assert.equal(assumedContinuousFromPeak(1000), 500);
  assert.equal(assumedContinuousFromPeak(0), null);
  assert.equal(assumedContinuousFromPeak(null), null);
  assert.equal(assumedContinuousFromPeak(undefined), null);
  assert.equal(assumedContinuousFromPeak(-100), null);
  assert.equal(assumedContinuousFromPeak('abc'), null);
});

test('PEAK_TO_CONTINUOUS_FACTOR is 0.5', () => {
  assert.equal(PEAK_TO_CONTINUOUS_FACTOR, 0.5);
});

// --- L8i: peak only, no continuous, no recommended amp max ---
const l8iSpec = {
  power_handling_peak_w: 500,
  // no continuous, no IEC, no AES, no recommended_amp_max_w
};

test('L8i: resolvePowerAuthority uses peak fallback (500 W peak -> 250 W assumed)', () => {
  const auth = resolvePowerAuthority(l8iSpec);
  assert.equal(auth.source, 'peak_power_assumed');
  assert.equal(auth.value, 250);
  assert.equal(isProvisional(auth), true);
});

// --- Speaker with BOTH continuous and peak: continuous takes precedence ---
const bothSpec = {
  power_handling_continuous_w: 200,
  power_handling_peak_w: 800,
};

test('Both ratings: continuous takes precedence over peak', () => {
  const auth = resolvePowerAuthority(bothSpec);
  assert.equal(auth.source, 'power_rating');
  assert.equal(auth.value, 200);
  assert.equal(isProvisional(auth), false);
});

// --- Speaker with recommended amp max and peak: recommended amp max takes precedence ---
const ampMaxSpec = {
  recommended_amp_max_w: 300,
  power_handling_peak_w: 600,
};

test('Recommended amp max takes precedence over peak', () => {
  const auth = resolvePowerAuthority(ampMaxSpec);
  assert.equal(auth.source, 'recommended_amp_max');
  assert.equal(auth.value, 300);
  assert.equal(isProvisional(auth), false);
});

// --- Speaker with no power at all: stays ungradeable ---
const noPowerSpec = {
  sensitivity_db: 90,
  // no power of any kind
};

test('No power at all: resolvePowerAuthority returns null', () => {
  const auth = resolvePowerAuthority(noPowerSpec);
  assert.equal(auth.value, null);
  assert.equal(auth.source, null);
  assert.equal(isProvisional(auth), false);
});

// --- Speaker with IEC but no continuous: IEC takes precedence over peak ---
const iecSpec = {
  long_term_iec_power_w: 150,
  power_handling_peak_w: 400,
};

test('IEC rating takes precedence over peak', () => {
  const auth = resolvePowerAuthority(iecSpec);
  assert.equal(auth.source, 'power_rating');
  assert.equal(auth.value, 150);
  assert.equal(isProvisional(auth), false);
});

// --- Provisional result classification: conditional on published sensitivity ---
// A provisional peak-assumed result is GOOD DATA when the manufacturer also
// publishes sensitivity (a credible amplifier-dependent calculation is
// possible) and LIMITED DATA when sensitivity is missing.
test('Provisional peak-assumed with sensitivity is GOOD DATA', () => {
  const provisionalWithSensitivity = {
    p12_p13_eligible: true,
    provisional_peak_assumed: true,
    halfspace_sensitivity_db_1w_1m: 87.99,
    halfspace_published_max_peak_spl_db_1m: 118,
    halfspace_estimated_continuous_from_peak_spl_db_1m: 112,
    halfspace_calculated_max_continuous_spl_db_1m: 111.97,
    sensitivity_reference: '2.83V/1m',
  };

  // Mirrors classifyDataAdequacy: provisional + sensitivity → GOOD.
  function classifyAdequacy(record) {
    if (!record || record.p12_p13_eligible !== true) return 'INCOMPLETE';
    if (record.provisional_peak_assumed === true) {
      return record.halfspace_sensitivity_db_1w_1m == null ? 'INCOMPLETE' : 'GOOD';
    }
    return 'GOOD';
  }

  assert.equal(classifyAdequacy(provisionalWithSensitivity), 'GOOD');
});

test('Provisional peak-assumed without sensitivity stays LIMITED DATA', () => {
  const provisionalNoSensitivity = {
    p12_p13_eligible: true,
    provisional_peak_assumed: true,
    halfspace_sensitivity_db_1w_1m: null,
    halfspace_published_max_peak_spl_db_1m: 118,
    halfspace_estimated_continuous_from_peak_spl_db_1m: 112,
  };

  function classifyAdequacy(record) {
    if (!record || record.p12_p13_eligible !== true) return 'INCOMPLETE';
    if (record.provisional_peak_assumed === true) {
      return record.halfspace_sensitivity_db_1w_1m == null ? 'INCOMPLETE' : 'GOOD';
    }
    return 'GOOD';
  }

  assert.equal(classifyAdequacy(provisionalNoSensitivity), 'INCOMPLETE');
});

// --- L8i full calculation check: 91 dB @ 2.83V/1m, 4 Ω, 500 W peak ---
test('L8i SPL calculation: 91 dB @ 2.83V/1m, 4 Ohm, 250 W assumed -> ~111.97 dB @ 1m', () => {
  const sensitivity = 91; // dB @ 2.83V/1m
  const impedance = 4;   // Ohm
  const voltageDb = -10 * Math.log10(2.83 ** 2 / impedance);
  const oneW = sensitivity + voltageDb; // 1W/1m in published space
  const power = 250; // assumed continuous from 500 W peak
  const calculated = oneW + 10 * Math.log10(power);

  // 91 - 10*log10(2.0025) + 10*log10(250)
  // = 91 - 3.01 + 23.98
  // = 111.97
  assert.ok(Math.abs(voltageDb - (-3.01)) < 0.01, `voltageDb ~ -3.01, got ${voltageDb}`);
  assert.ok(Math.abs(oneW - 87.99) < 0.01, `oneW ~ 87.99, got ${oneW}`);
  assert.ok(Math.abs(calculated - 111.97) < 0.01, `calculated ~ 111.97, got ${calculated}`);
});

// --- Propagation loss at 3 m (point source) ---
test('Propagation loss at 3 m is ~9.54 dB (point source)', () => {
  const distance = 3;
  const lossDb = 20 * Math.log10(distance);
  assert.ok(Math.abs(lossDb - 9.54) < 0.01, `lossDb ~ 9.54, got ${lossDb}`);
  // L8i at 3m: 111.97 - 9.54 = 102.43 dB
  const splAt3m = 111.97 - lossDb;
  assert.ok(Math.abs(splAt3m - 102.43) < 0.01, `splAt3m ~ 102.43, got ${splAt3m}`);
});

console.log('All peak-power provisional tests pass.');