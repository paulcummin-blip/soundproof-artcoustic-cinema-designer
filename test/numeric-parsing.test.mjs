// numeric-parsing.test.mjs
// ---------------------------------------------------------------------------
// Regression tests for the ADI source-extraction numeric parser. The bug this
// guards: a manufacturer-formatted thousands figure such as "1,000W" was read
// as 1 W because the comma was treated as a decimal separator. The corrected
// parser (normaliseNumber / parseRangeEndpoints / coerceSpecValue) must turn
// "1,000" into 1000, split a stated range into its endpoints, and reject (or
// recover from the quotation) any value that fails the cross-check.
//
// These tests cover the parser only — they do NOT exercise the P12/P13 engine
// or change RP22 thresholds.
// ---------------------------------------------------------------------------

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normaliseNumber,
  parseRangeEndpoints,
  extractAllNumbers,
  coerceSpecValue,
} from "../base44/shared/speakerSourceReading.js";

const NUMERIC_FIELDS = new Set([
  "sensitivity_db", "nominal_impedance_ohm", "minimum_impedance_ohm",
  "recommended_amp_min_w", "recommended_amp_max_w", "long_term_iec_power_w", "rated_iec_power_w",
  "aes_power_w", "peak_power_w", "power_handling_continuous_w", "power_handling_peak_w",
  "frequency_response_low_hz", "frequency_response_high_hz", "frequency_response_tolerance_db",
  "max_continuous_spl_db", "max_peak_spl_db",
]);
const opts = { numericFields: NUMERIC_FIELDS, enums: {} };

test("normaliseNumber: thousands with comma", () => {
  assert.equal(normaliseNumber("1,000"), 1000);
  assert.equal(normaliseNumber("10,000"), 10000);
  assert.equal(normaliseNumber("1,234,567"), 1234567);
  assert.equal(normaliseNumber("1,000 W"), 1000);
  assert.equal(normaliseNumber("£4,794"), 4794);
});

test("normaliseNumber: thousands with space", () => {
  assert.equal(normaliseNumber("1 000"), 1000);
  assert.equal(normaliseNumber("1 000 W"), 1000);
});

test("normaliseNumber: European thousands with dot", () => {
  assert.equal(normaliseNumber("10.000"), 10000);
  assert.equal(normaliseNumber("1.234.567"), 1234567);
});

test("normaliseNumber: decimals are preserved", () => {
  assert.equal(normaliseNumber("2.83"), 2.83);
  assert.equal(normaliseNumber("2.83 V"), 2.83);
  assert.equal(normaliseNumber("7,9"), 7.9);
  assert.equal(normaliseNumber("93,5"), 93.5);
  assert.equal(normaliseNumber("8.0"), 8);
});

test("normaliseNumber: mixed separators — last is decimal", () => {
  assert.equal(normaliseNumber("1,234.56"), 1234.56);
  assert.equal(normaliseNumber("1.234,56"), 1234.56);
});

test("normaliseNumber: plain and unit-suffixed values", () => {
  assert.equal(normaliseNumber("93 dB"), 93);
  assert.equal(normaliseNumber("8Ω"), 8);
  assert.equal(normaliseNumber("116"), 116);
  assert.equal(normaliseNumber("116 dB @ 1m"), 116);
  assert.equal(normaliseNumber(400), 400);
  assert.equal(normaliseNumber(""), null);
  assert.equal(normaliseNumber(null), null);
  assert.equal(normaliseNumber("N/A"), null);
});

test("1,000 never becomes 1", () => {
  assert.notEqual(normaliseNumber("1,000"), 1);
  assert.equal(normaliseNumber("1,000"), 1000);
});

test("parseRangeEndpoints: en-dash range", () => {
  assert.deepEqual(parseRangeEndpoints("500W – 1,000W"), { min: 500, max: 1000 });
  assert.deepEqual(parseRangeEndpoints("500–1,000W"), { min: 500, max: 1000 });
  assert.deepEqual(parseRangeEndpoints("500W-1,000W"), { min: 500, max: 1000 });
  assert.deepEqual(parseRangeEndpoints("25-150 W"), { min: 25, max: 150 });
  assert.deepEqual(parseRangeEndpoints("500 to 1000 watts"), { min: 500, max: 1000 });
  assert.equal(parseRangeEndpoints("1000 W"), null);
  assert.equal(parseRangeEndpoints("-1,000"), null); // leading minus is not a range
});

test("extractAllNumbers: finds every numeric token", () => {
  assert.deepEqual(extractAllNumbers("500W – 1,000W").sort((a, b) => a - b), [500, 1000]);
  assert.deepEqual(extractAllNumbers("116 dB @ 1m"), [116, 1]);
  assert.deepEqual(extractAllNumbers("into 8Ω on unclipped programme) 500W – 1,000W").sort((a, b) => a - b), [8, 500, 1000]);
});

test("coerceSpecValue: recommended amplifier max reads 1000, not 1", () => {
  const quote = "Recommended amplifier power (into 8Ω on unclipped programme) 500W – 1,000W";
  assert.equal(coerceSpecValue("recommended_amp_max_w", "1,000W", quote, opts), 1000);
  assert.equal(coerceSpecValue("recommended_amp_min_w", "500W", quote, opts), 500);
});

test("coerceSpecValue: range value is split into endpoints", () => {
  const quote = "Recommended amplifier power 500W – 1,000W";
  assert.equal(coerceSpecValue("recommended_amp_max_w", "500W – 1,000W", quote, opts), 1000);
  assert.equal(coerceSpecValue("recommended_amp_min_w", "500W – 1,000W", quote, opts), 500);
});

test("coerceSpecValue: guard recovers a mis-parsed value from the quotation", () => {
  // Simulate the original bug: the LLM value was "1" but the quote states 1,000.
  const quote = "Recommended amplifier power (into 8Ω on unclipped programme) 500W – 1,000W";
  assert.equal(coerceSpecValue("recommended_amp_max_w", "1", quote, opts), 1000);
  // And a value below the 5 W floor with no plausible figure in the quote is rejected.
  assert.equal(coerceSpecValue("recommended_amp_max_w", "1", "Recommended amplifier: 3 W", opts), "");
});

test("coerceSpecValue: non-power fields are not floor-guarded", () => {
  assert.equal(coerceSpecValue("sensitivity_db", "93 dB", "Sensitivity 93 dB", opts), 93);
  assert.equal(coerceSpecValue("nominal_impedance_ohm", "8 Ω", "Nominal impedance 8 Ω", opts), 8);
  assert.equal(coerceSpecValue("max_continuous_spl_db", "116 dB", "Max SPL 116 dB", opts), 116);
});

test("coerceSpecValue: kHz is still expanded for frequency fields", () => {
  assert.equal(coerceSpecValue("frequency_response_high_hz", "20 kHz", "20 Hz – 20 kHz", opts), 20000);
  assert.equal(coerceSpecValue("frequency_response_low_hz", "20 Hz", "20 Hz – 20 kHz", opts), 20);
});

test("coerceSpecValue: enum fields are canonicalised, not number-parsed", () => {
  const enumOpts = { numericFields: NUMERIC_FIELDS, enums: { sensitivity_basis: ["1W/1m", "2.83V/1m", "unknown"] } };
  assert.equal(coerceSpecValue("sensitivity_basis", "2.83 V / 1 m", "Sensitivity: 2.83 V / 1 m", enumOpts), "2.83V/1m");
});

test("CT8 LCR scenario: 1000 W remains a recommended amplifier maximum", () => {
  const quote = "Recommended amplifier power (into 8Ω on unclipped programme) 500W – 1,000W";
  // The max is a recommended amplifier figure, NOT a continuous rating.
  assert.equal(coerceSpecValue("recommended_amp_max_w", "1,000W", quote, opts), 1000);
  // No continuous rating is invented from this quote.
  assert.equal(coerceSpecValue("power_handling_continuous_w", "", quote, opts), "");
});