// competitor-max-spl-authority.test.mjs
// Validation tests for the competitor maximum SPL peak-to-continuous authority.
//
// Tests the 10 validation scenarios from the engineering rule:
//   1. Published continuous maximum SPL with adequate supporting data
//   2. Published peak maximum SPL
//   3. Published maximum SPL without continuous/peak designation
//   4. Both published peak and continuous SPL
//   5. No published maximum SPL
//   6. KEF Ci200QL: 107 dB published → 101 dB estimated continuous
//   7. Sensitivity-and-power calculation exceeding a peak-derived SPL limit
//   8. Full-space, half-space and unspecified measurement conditions
//   9. P12/P13 results at 1 m and at the selected listening position
//  10. Comparison against an Artcoustic reference speaker

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCompetitor, competitorMetaForComparison } from '../src/components/utils/spl/competitorNormalization.js';
import {
  classifyMaxSplAuthority,
  estimatedContinuousFromPeak,
  PEAK_TO_CONTINUOUS_ALLOWANCE_DB,
} from '../src/components/utils/spl/maxSplAuthority.js';
import { resolveP12P13DualLevels } from '../src/components/report/technical/roomParameterLevelAuthority.js';

// A base record with enough data to be gradeable (sensitivity + power).
function baseRecord(overrides = {}) {
  return {
    manufacturer: "TestCo",
    model: "TC-100",
    sensitivity_value_db: 90,
    sensitivity_reference: "2.83V/1m",
    rated_impedance_ohm: 8,
    recommended_amp_max_w: 150,
    ...overrides,
  };
}

// P12/P13 thresholds (from roomParameterLevelAuthority.js)
// P12 Minimum: L1=99 L2=102 L3=105 L4=108
// P12 Recommended: L1=102 L2=105 L3=108 L4=111
// P13 Minimum: L1=96 L2=99 L3=102 L4=105
// P13 Recommended: L1=99 L2=102 L3=105 L4=108
function gradeP12P13(splAtSeat) {
  const p12 = resolveP12P13DualLevels(12, splAtSeat);
  const p13 = resolveP12P13DualLevels(13, splAtSeat);
  return { p12: p12?.minimum, p13: p13?.minimum };
}

// Approximate SPL at 1m from sensitivity + power (half-space, 1W/1m normalised)
function spl1mFromSensitivityPower(sensitivityDb1w, powerW) {
  return sensitivityDb1w + 10 * Math.log10(powerW);
}

test('1. Published continuous maximum SPL with adequate supporting data → used directly, no −6 dB', () => {
  const record = baseRecord({
    published_max_continuous_spl_db_1m: 110,
    max_spl_basis: "continuous",
    max_spl_measurement_basis: "Half Space",
  });
  const n = normalizeCompetitor(record);
  assert.equal(n.max_spl_authority_type, "published_continuous");
  assert.equal(n.halfspace_published_max_continuous_spl_db_1m, 110);
  assert.equal(n.halfspace_estimated_continuous_from_peak_spl_db_1m, null);
  assert.equal(n.halfspace_max_spl_limit_db_1m, 110);
  assert.equal(n.capability_basis, "Published");
});

test('2. Published peak maximum SPL → estimated continuous = peak − 6 dB', () => {
  const record = baseRecord({
    published_max_peak_spl_db_1m: 113,
    max_spl_basis: "peak",
    max_spl_measurement_basis: "Half Space",
  });
  const n = normalizeCompetitor(record);
  assert.equal(n.max_spl_authority_type, "published_peak");
  assert.equal(n.halfspace_published_max_peak_spl_db_1m, 113);
  assert.equal(n.halfspace_estimated_continuous_from_peak_spl_db_1m, 107);
  assert.equal(n.halfspace_max_spl_limit_db_1m, 107);
  assert.equal(n.capability_basis, "Estimated");
  assert.ok(n.spl_authority.includes("Estimated continuous SPL"));
});

test('3. Published maximum SPL without continuous/peak designation → assumed peak, −6 dB', () => {
  const record = baseRecord({
    published_max_peak_spl_db_1m: 107,
    max_spl_basis: "manufacturer unspecified",
    max_spl_measurement_basis: "Half Space",
  });
  const n = normalizeCompetitor(record);
  assert.equal(n.max_spl_authority_type, "assumed_peak");
  assert.equal(n.halfspace_estimated_continuous_from_peak_spl_db_1m, 101);
  assert.equal(n.halfspace_max_spl_limit_db_1m, 101);
  assert.equal(n.capability_basis, "Estimated");
});

test('3b. Published max SPL with unknown basis → assumed peak, −6 dB', () => {
  const record = baseRecord({
    published_max_peak_spl_db_1m: 107,
    max_spl_basis: "unknown",
  });
  const n = normalizeCompetitor(record);
  assert.equal(n.max_spl_authority_type, "assumed_peak");
  assert.equal(n.halfspace_max_spl_limit_db_1m, 101);
});

test('3c. Published max SPL with null basis (legacy row) → assumed peak, −6 dB', () => {
  const record = baseRecord({
    published_max_peak_spl_db_1m: 107,
    max_spl_basis: null,
  });
  const n = normalizeCompetitor(record);
  assert.equal(n.max_spl_authority_type, "assumed_peak");
  assert.equal(n.halfspace_max_spl_limit_db_1m, 101);
});

test('4. Both published peak and continuous SPL → continuous used directly, peak retained', () => {
  const record = baseRecord({
    published_max_continuous_spl_db_1m: 105,
    published_max_peak_spl_db_1m: 113,
    max_spl_basis: "continuous",
    max_spl_measurement_basis: "Half Space",
  });
  const n = normalizeCompetitor(record);
  assert.equal(n.max_spl_authority_type, "published_continuous");
  assert.equal(n.halfspace_published_max_continuous_spl_db_1m, 105);
  assert.equal(n.halfspace_published_max_peak_spl_db_1m, 113);
  assert.equal(n.halfspace_estimated_continuous_from_peak_spl_db_1m, null);
  assert.equal(n.halfspace_max_spl_limit_db_1m, 105);
});

test('5. No published maximum SPL → calculated from sensitivity + power, no SPL cap', () => {
  const record = baseRecord({});
  const n = normalizeCompetitor(record);
  assert.equal(n.max_spl_authority_type, "none");
  assert.equal(n.halfspace_estimated_continuous_from_peak_spl_db_1m, null);
  assert.equal(n.halfspace_max_spl_limit_db_1m, null);
  assert.equal(n.capability_basis, "Calculated");
  // The calculated value is passed as the cap (no-op: min of same value)
  const meta = competitorMetaForComparison(record);
  assert.ok(meta !== null);
  const expectedCalculated = n.halfspace_calculated_max_continuous_spl_db_1m;
  assert.equal(meta.max_spl_cont_db_1m_halfspace, expectedCalculated);
});

test('6. KEF Ci200QL: 107 dB published → 101 dB estimated continuous', () => {
  // KEF Ci200QL: 90 dB @ 2.83V/1m, 8 Ω, 10–150 W recommended amp, "Max SPL 107 dB"
  const record = baseRecord({
    manufacturer: "KEF",
    model: "Ci200QL",
    sensitivity_value_db: 90,
    sensitivity_reference: "2.83V/1m",
    rated_impedance_ohm: 8,
    recommended_amp_min_w: 10,
    recommended_amp_max_w: 150,
    published_max_peak_spl_db_1m: 107,
    max_spl_basis: "unknown",
    max_spl_measurement_basis: null,
  });
  const n = normalizeCompetitor(record);
  assert.equal(n.max_spl_authority_type, "assumed_peak");
  // 107 dB + 0 (assumed half-space) − 6 dB = 101 dB
  assert.equal(n.halfspace_estimated_continuous_from_peak_spl_db_1m, 101);
  assert.equal(n.halfspace_max_spl_limit_db_1m, 101);
  // The calculated sensitivity+power value (~111.8 dB) exceeds the limit
  const meta = competitorMetaForComparison(record);
  assert.equal(meta.max_spl_cont_db_1m_halfspace, 101,
    "Engine hard cap must be 101, not the calculated 111.8");
});

test('7. Sensitivity-and-power calculation exceeding a peak-derived SPL limit', () => {
  const record = baseRecord({
    published_max_peak_spl_db_1m: 107,
    max_spl_basis: "manufacturer unspecified",
  });
  const n = normalizeCompetitor(record);
  // Calculated from 90 dB 1W/1m + 150 W ≈ 111.76 dB
  const calculated = n.halfspace_calculated_max_continuous_spl_db_1m;
  assert.ok(calculated > 107, `calculated ${calculated} should exceed 107`);
  // But the limit is 101 (107 − 6)
  assert.equal(n.halfspace_max_spl_limit_db_1m, 101);
  // The engine receives 101 as the hard cap, not 111.76
  const meta = competitorMetaForComparison(record);
  assert.equal(meta.max_spl_cont_db_1m_halfspace, 101);
  // The central SPL engine applies Math.min(amp-limited, hardCap), so the
  // final 1m capability is 101, not 111.76.
  const ampLimited = spl1mFromSensitivityPower(n.halfspace_sensitivity_db_1w_1m, 150);
  const finalCapability = Math.min(ampLimited, meta.max_spl_cont_db_1m_halfspace);
  assert.equal(finalCapability, 101);
});

test('8a. Full-space max SPL → +6 dB space correction, then −6 dB peak allowance', () => {
  const record = baseRecord({
    published_max_peak_spl_db_1m: 101,
    max_spl_basis: "manufacturer unspecified",
    max_spl_measurement_basis: "Full Space",
  });
  const n = normalizeCompetitor(record);
  // peak space-corrected: 101 + 6 = 107 (full → half)
  assert.equal(n.halfspace_published_max_peak_spl_db_1m, 107);
  // estimated continuous: 107 − 6 = 101
  assert.equal(n.halfspace_estimated_continuous_from_peak_spl_db_1m, 101);
  assert.equal(n.halfspace_max_spl_limit_db_1m, 101);
  assert.equal(n.max_spl_space_provenance, "full_space_published_converted");
});

test('8b. Half-space max SPL → 0 dB space correction, then −6 dB peak allowance', () => {
  const record = baseRecord({
    published_max_peak_spl_db_1m: 107,
    max_spl_basis: "peak",
    max_spl_measurement_basis: "Half Space",
  });
  const n = normalizeCompetitor(record);
  assert.equal(n.halfspace_published_max_peak_spl_db_1m, 107);
  assert.equal(n.halfspace_estimated_continuous_from_peak_spl_db_1m, 101);
  assert.equal(n.max_spl_space_provenance, "half_space_published");
});

test('8c. Unspecified measurement space → assumed half-space (0 dB), then −6 dB', () => {
  const record = baseRecord({
    published_max_peak_spl_db_1m: 107,
    max_spl_basis: "unknown",
    max_spl_measurement_basis: null,
  });
  const n = normalizeCompetitor(record);
  assert.equal(n.max_spl_space_provenance, "half_space_assumed");
  assert.equal(n.halfspace_published_max_peak_spl_db_1m, 107);
  assert.equal(n.halfspace_estimated_continuous_from_peak_spl_db_1m, 101);
});

test('9. P12/P13 results at 1 m use the limited capability', () => {
  // KEF at 1m: capability = 101 dB (capped), not 111.8 (uncapped)
  const capped1m = 101;
  const grades = gradeP12P13(capped1m);
  // P12 Minimum: 101 ≥ 99 (L1) but < 102 (L2) → L1
  assert.equal(grades.p12, "L1", "P12 at 101 dB should be L1 (minimum 99)");
  // P13 Minimum: 101 ≥ 99 (L2) but < 102 (L3) → L2
  assert.equal(grades.p13, "L2", "P13 at 101 dB should be L2 (minimum 99)");

  // Without the cap (111.8 dB) the grades would be higher — confirm the cap
  // changes the result.
  const uncappedGrades = gradeP12P13(111.8);
  assert.notEqual(uncappedGrades.p12, grades.p12, "Cap must change P12 grade");
  assert.notEqual(uncappedGrades.p13, grades.p13, "Cap must change P13 grade");
});

test('9b. P12/P13 at a typical listening distance (3 m) with the limit', () => {
  // At 3 m, distance loss ≈ 20·log10(3) ≈ 9.54 dB (+ ~1 dB room support)
  const capped1m = 101;
  const distanceLoss = 20 * Math.log10(3);
  const roomSupport = 1.0; // medium room
  const splAtSeat = capped1m - distanceLoss + roomSupport;
  const grades = gradeP12P13(splAtSeat);
  // 101 - 9.54 + 1 = 92.46 → P12 below L1 (99), P13 below L1 (96)
  assert.equal(grades.p12, "—", `P12 at ${splAtSeat.toFixed(1)} should be below L1`);
  assert.equal(grades.p13, "—", `P13 at ${splAtSeat.toFixed(1)} should be below L1`);
});

test('10. Competitor and Artcoustic use the same P12/P13 thresholds', () => {
  // Both the Artcoustic row and the competitor row pass through the same
  // gradeFromSpl → resolveP12P13DualLevels path. The thresholds are shared.
  const competitorSpl = 101;
  const artcousticSpl = 105;
  const compGrades = gradeP12P13(competitorSpl);
  const artGrades = gradeP12P13(artcousticSpl);
  // The same threshold table grades both — verify they produce valid levels.
  assert.ok(/^(L[1-4]|—)$/.test(compGrades.p12));
  assert.ok(/^(L[1-4]|—)$/.test(artGrades.p12));
  assert.ok(/^(L[1-4]|—)$/.test(compGrades.p13));
  assert.ok(/^(L[1-4]|—)$/.test(artGrades.p13));
  // Higher SPL → higher or equal level
  const LEVEL_RANK = { "—": 0, L1: 1, L2: 2, L3: 3, L4: 4 };
  assert.ok(LEVEL_RANK[artGrades.p12] >= LEVEL_RANK[compGrades.p12]);
});

test('Authority: −6 dB allowance is applied exactly once (not doubled)', () => {
  const record = baseRecord({
    published_max_peak_spl_db_1m: 107,
    max_spl_basis: "manufacturer unspecified",
  });
  const n = normalizeCompetitor(record);
  // The estimated continuous is 101 (107 − 6), not 95 (107 − 12)
  assert.equal(n.halfspace_estimated_continuous_from_peak_spl_db_1m, 101);
  // The max SPL limit passed to the engine is 101, not further reduced
  assert.equal(n.halfspace_max_spl_limit_db_1m, 101);
  const meta = competitorMetaForComparison(record);
  assert.equal(meta.max_spl_cont_db_1m_halfspace, 101);
});

test('Authority: −6 dB allowance is independent of full-space +6 dB correction', () => {
  // Full-space 101 dB → +6 = 107 (half-space peak) → −6 = 101 (estimated continuous)
  // Net: 0 dB from the original 101. The −6 and +6 cancel numerically but are
  // distinct operations applied once each.
  const record = baseRecord({
    published_max_peak_spl_db_1m: 101,
    max_spl_basis: "manufacturer unspecified",
    max_spl_measurement_basis: "Full Space",
  });
  const n = normalizeCompetitor(record);
  assert.equal(n.halfspace_published_max_peak_spl_db_1m, 107); // space-corrected
  assert.equal(n.halfspace_estimated_continuous_from_peak_spl_db_1m, 101); // −6 dB
  assert.equal(n.max_spl_space_provenance, "full_space_published_converted");
});

test('Authority: continuous field with non-continuous basis → treated as assumed peak', () => {
  // Edge case: a value in the continuous field but the basis is "manufacturer unspecified"
  const record = baseRecord({
    published_max_continuous_spl_db_1m: 107,
    max_spl_basis: "manufacturer unspecified",
  });
  const n = normalizeCompetitor(record);
  assert.equal(n.max_spl_authority_type, "assumed_peak");
  assert.equal(n.halfspace_estimated_continuous_from_peak_spl_db_1m, 101);
  assert.equal(n.halfspace_max_spl_limit_db_1m, 101);
});

test('classifyMaxSplAuthority unit tests', () => {
  assert.equal(classifyMaxSplAuthority({ rawContinuous: 110, rawPeak: null, maxSplBasis: "continuous" }).type, "published_continuous");
  assert.equal(classifyMaxSplAuthority({ rawContinuous: 110, rawPeak: null, maxSplBasis: "AES" }).type, "published_continuous");
  assert.equal(classifyMaxSplAuthority({ rawContinuous: 110, rawPeak: null, maxSplBasis: "IEC" }).type, "published_continuous");
  assert.equal(classifyMaxSplAuthority({ rawContinuous: null, rawPeak: 113, maxSplBasis: "peak" }).type, "published_peak");
  assert.equal(classifyMaxSplAuthority({ rawContinuous: null, rawPeak: 107, maxSplBasis: "unknown" }).type, "assumed_peak");
  assert.equal(classifyMaxSplAuthority({ rawContinuous: null, rawPeak: 107, maxSplBasis: null }).type, "assumed_peak");
  assert.equal(classifyMaxSplAuthority({ rawContinuous: null, rawPeak: 107, maxSplBasis: "manufacturer unspecified" }).type, "assumed_peak");
  assert.equal(classifyMaxSplAuthority({ rawContinuous: null, rawPeak: null, maxSplBasis: null }).type, "none");
  // Continuous field with non-continuous basis → assumed peak (basis not confirmed)
  assert.equal(classifyMaxSplAuthority({ rawContinuous: 107, rawPeak: null, maxSplBasis: "unknown" }).type, "assumed_peak");
  // Continuous field but basis explicitly says peak → published_peak (basis is the authority)
  assert.equal(classifyMaxSplAuthority({ rawContinuous: 107, rawPeak: null, maxSplBasis: "peak" }).type, "published_peak");
});

test('estimatedContinuousFromPeak unit test', () => {
  assert.equal(estimatedContinuousFromPeak(107), 101);
  assert.equal(estimatedContinuousFromPeak(113), 107);
  assert.equal(estimatedContinuousFromPeak(null), null);
  assert.equal(estimatedContinuousFromPeak(NaN), null);
  assert.equal(PEAK_TO_CONTINUOUS_ALLOWANCE_DB, 6);
});