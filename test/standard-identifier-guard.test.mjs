// standard-identifier-guard.test.mjs
// ---------------------------------------------------------------------------
// Tests for the standard-identifier guard in speakerSourceReading.js.
//
// A specification standard identifier (CTA 426-B, AES75, IEC 60268-5) is the
// NAME of a measurement standard, never an engineering value. These tests
// verify that the shared decoder never accepts the number inside a standard
// identifier as a power or SPL figure, and that it recovers the actual
// engineering value from the source quotation instead.
//
// Scenarios:
//   1. Monitor Audio W2L — CTA 426-B continuous power (225 W, not 426)
//   2. A product with AES75 max SPL (117 dB, not 75)
//   3. A product with IEC 60268-5 power handling (200 W, not 60268)
//   4. Normal extraction without standard identifiers still works
//   5. Recommended amplifier range into 4 Ω is preserved
//   6. Standard identifier with no recoverable wattage is rejected (flag for review)
// ---------------------------------------------------------------------------

import assert from 'node:assert/strict';
import { coerceSpecValue } from '../base44/shared/speakerSourceReading.js';

const NUMERIC_FIELDS = new Set([
  'sensitivity_db', 'nominal_impedance_ohm', 'minimum_impedance_ohm',
  'recommended_amp_min_w', 'recommended_amp_max_w', 'long_term_iec_power_w', 'rated_iec_power_w',
  'aes_power_w', 'peak_power_w', 'power_handling_continuous_w', 'power_handling_peak_w',
  'program_power_w',
  'frequency_response_low_hz', 'frequency_response_high_hz', 'frequency_response_tolerance_db',
  'max_continuous_spl_db', 'max_peak_spl_db',
]);

const ENUMS = {
  sensitivity_basis: ['1W/1m', '2.83V/1m', 'unknown'],
  max_spl_basis: ['AES', 'IEC', 'continuous', 'peak', 'manufacturer unspecified', 'calculated', 'unknown'],
  measurement_space: ['free-space', 'half-space', 'in-room', 'unspecified'],
};

function decode(field, value, rawText) {
  return coerceSpecValue(field, value, rawText, { numericFields: NUMERIC_FIELDS, enums: ENUMS });
}

const tests = [
  {
    name: 'CTA 426-B: standard identifier 426 is not accepted as continuous power; 225 W is recovered',
    field: 'power_handling_continuous_w',
    value: '426',
    rawText: 'Continuous power handling (CTA 426-B): 225 W',
    expected: 225,
  },
  {
    name: 'CTA 426-B: correct 225 W passes through unchanged',
    field: 'power_handling_continuous_w',
    value: '225',
    rawText: 'Continuous power handling (CTA 426-B): 225 W',
    expected: 225,
  },
  {
    name: 'AES75: standard identifier 75 is not accepted as max SPL; 117 dB is recovered',
    field: 'max_peak_spl_db',
    value: '75',
    rawText: 'Maximum peak SPL (AES75): 117 dB',
    expected: 117,
  },
  {
    name: 'AES75: correct 117 dB passes through unchanged',
    field: 'max_peak_spl_db',
    value: '117',
    rawText: 'Maximum peak SPL (AES75): 117 dB',
    expected: 117,
  },
  {
    name: 'IEC 60268-5: standard identifier 60268 is not accepted as power; 200 W is recovered',
    field: 'power_handling_continuous_w',
    value: '60268',
    rawText: 'Power handling (IEC 60268-5): 200 W',
    expected: 200,
  },
  {
    name: 'Normal power extraction without standard identifiers',
    field: 'power_handling_continuous_w',
    value: '150',
    rawText: 'Power handling: 150 W',
    expected: 150,
  },
  {
    name: 'Recommended amplifier max from 4-ohm range is preserved',
    field: 'recommended_amp_max_w',
    value: '450',
    rawText: 'Recommended amplifier power: 110-450 W into 4 Ω',
    expected: 450,
  },
  {
    name: 'Recommended amplifier min from 4-ohm range is preserved',
    field: 'recommended_amp_min_w',
    value: '110',
    rawText: 'Recommended amplifier power: 110-450 W into 4 Ω',
    expected: 110,
  },
  {
    name: 'Standard identifier with no recoverable wattage is rejected (flag for review)',
    field: 'power_handling_continuous_w',
    value: '426',
    rawText: 'Continuous power handling (CTA 426-B)',
    expected: '',
  },
  {
    name: 'Sensitivity with no standard identifier passes through',
    field: 'sensitivity_db',
    value: '88',
    rawText: 'Sensitivity: 88 dB @ 2.83 V / 1 m',
    expected: 88,
  },
  {
    name: 'Sensitivity standard identifier 426 is not accepted; 88 dB is recovered',
    field: 'sensitivity_db',
    value: '426',
    rawText: 'Sensitivity (CTA 426-B): 88 dB',
    expected: 88,
  },
  {
    name: 'Continuous SPL with IEC 60268 standard: 113 dB recovered, not 60268',
    field: 'max_continuous_spl_db',
    value: '60268',
    rawText: 'Max continuous SPL (IEC 60268-5): 113 dB',
    expected: 113,
  },
];

let passed = 0;
let failed = 0;

for (const t of tests) {
  try {
    const result = decode(t.field, t.value, t.rawText);
    assert.strictEqual(result, t.expected, `${t.name}\n  expected: ${t.expected}\n  got: ${result}`);
    console.log(`  ✓ ${t.name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${t.name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);