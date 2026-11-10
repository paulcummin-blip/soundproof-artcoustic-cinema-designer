// max-spl-basis-authority.test.mjs
// ---------------------------------------------------------------------------
// Conservative max-SPL duration rule for the RP22 competitor comparison.
//
// A manufacturer that publishes a "Maximum SPL" figure without stating whether
// it is continuous or peak / short-term is treated as peak / short-term. The
// figure is NEVER promoted to continuous. Continuous capability falls back to
// the calculated value (sensitivity + power) capped at the reclassified peak
// (continuous ≤ peak), so an ambiguous figure can never increase capability.
//
// These tests exercise the REAL normaliser + data-adequacy classifier through
// the shapes the comparison consumes. No thresholds or P12/P13 physics change.

import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCompetitor, competitorMetaForComparison } from '../src/components/utils/spl/competitorNormalization.js';
import { classifyDataAdequacy, DATA_ADEQUACY } from '../src/components/spl/dataAdequacyClassification.js';
import { AMBIGUOUS_MAX_SPL_ASSUMPTION, resolveMaxSplDuration, MAX_SPL_DURATION } from '../src/components/utils/spl/maxSplBasisAuthority.js';

// 90 dB @ 1 W / 1 m, 8 Ω, 100 W continuous, Half Space — a fully-specified row.
const base = {
  manufacturer: 'Test', model: 'Test',
  sensitivity_value_db: 90, sensitivity_reference: '1W/1m',
  rated_impedance_ohm: 8, continuous_power_w: 100,
  sensitivity_measurement_basis: 'Half Space', max_spl_measurement_basis: 'Half Space',
};
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('resolveMaxSplDuration: continuous / AES / IEC / calculated are continuous', () => {
  for (const b of ['continuous', 'AES', 'IEC', 'aes', 'iec', 'calculated', 'Continuous']) {
    assert.equal(resolveMaxSplDuration(b).isContinuous, true, `${b} should be continuous`);
    assert.equal(resolveMaxSplDuration(b).assumed, false);
  }
});

test('resolveMaxSplDuration: peak / short-term are peak (not assumed)', () => {
  for (const b of ['peak', 'short-term', 'short term', 'Peak']) {
    assert.equal(resolveMaxSplDuration(b).isPeak, true);
    assert.equal(resolveMaxSplDuration(b).isContinuous, false);
    assert.equal(resolveMaxSplDuration(b).assumed, false);
  }
});

test('resolveMaxSplDuration: unspecified / unknown / blank → peak assumed, never continuous', () => {
  for (const b of ['manufacturer unspecified', 'unknown', '', undefined, 'anything else']) {
    const d = resolveMaxSplDuration(b);
    assert.equal(d.isContinuous, false, `${b} must not be continuous`);
    assert.equal(d.isPeak, true);
    assert.equal(d.assumed, true);
    assert.equal(d.key, MAX_SPL_DURATION.PEAK_ASSUMED.key);
  }
});

test('a single ambiguous "Max SPL" with no duration is reclassified as peak, not continuous', () => {
  // 112 dB published as a "Max SPL" with no duration stated, no separate peak.
  const n = normalizeCompetitor({ ...base, published_max_continuous_spl_db_1m: 112 });
  assert.equal(n.max_spl_duration_assumed, true);
  assert.equal(n.max_spl_reclassified_as_peak, true);
  // The figure is NOT graded as continuous.
  assert.equal(n.halfspace_published_max_continuous_spl_db_1m, null);
  // It is recorded as the peak authority.
  near(n.halfspace_published_max_peak_spl_db_1m, 112);
  // The assumption string is carried on the row.
  assert.equal(n.max_spl_duration_assumption, AMBIGUOUS_MAX_SPL_ASSUMPTION);
});

test('an ambiguous figure never increases capability: continuous is capped at the peak', () => {
  // Sensitivity 90 + 100 W → calculated continuous 110 dB. The published
  // ambiguous "Max SPL" is 105 dB. Treated as peak, the continuous capability is
  // min(110, 105) = 105 — the ambiguous figure cannot push capability higher.
  const n = normalizeCompetitor({ ...base, published_max_continuous_spl_db_1m: 105 });
  near(n.halfspace_calculated_max_continuous_spl_db_1m, 110);
  near(n.halfspace_effective_max_continuous_spl_db_1m, 105);
  near(competitorMetaForComparison(n).max_spl_cont_db_1m_halfspace, 105);
  assert.equal(n.p12_p13_eligible, true);
});

test('when calculated is below the reclassified peak, the calculated value stands', () => {
  // Calculated 110 < peak 116 → effective continuous 110 (peak does not bind).
  const n = normalizeCompetitor({ ...base, published_max_continuous_spl_db_1m: 116 });
  near(n.halfspace_calculated_max_continuous_spl_db_1m, 110);
  near(n.halfspace_effective_max_continuous_spl_db_1m, 110);
  near(n.halfspace_published_max_peak_spl_db_1m, 116);
});

test('an explicitly stated continuous basis is graded as continuous (not reclassified)', () => {
  const n = normalizeCompetitor({ ...base, published_max_continuous_spl_db_1m: 112, max_spl_test_conditions: 'continuous' });
  assert.equal(n.max_spl_duration_is_continuous, true);
  assert.equal(n.max_spl_reclassified_as_peak, false);
  assert.equal(n.max_spl_duration_assumed, false);
  near(n.halfspace_published_max_continuous_spl_db_1m, 112);
  near(n.halfspace_effective_max_continuous_spl_db_1m, 112);
  near(competitorMetaForComparison(n).max_spl_cont_db_1m_halfspace, 112);
});

test('an explicitly peak basis is graded as peak (continuous falls to calculated, capped)', () => {
  // Basis says peak; the figure lives in the continuous field but is peak.
  const n = normalizeCompetitor({ ...base, published_max_continuous_spl_db_1m: 105, max_spl_test_conditions: 'peak' });
  assert.equal(n.max_spl_duration_is_continuous, false);
  assert.equal(n.max_spl_duration_assumed, false);
  near(n.halfspace_published_max_continuous_spl_db_1m, null);
  near(n.halfspace_published_max_peak_spl_db_1m, 105);
  near(n.halfspace_effective_max_continuous_spl_db_1m, 105);
});

test('a separate peak figure distinguishes the continuous figure (no reclassification)', () => {
  // Both continuous (103) and peak (116) published: manufacturer distinguished
  // them, so the continuous figure is genuine even with no explicit basis.
  const n = normalizeCompetitor({ ...base, published_max_continuous_spl_db_1m: 103, published_max_peak_spl_db_1m: 116 });
  assert.equal(n.max_spl_reclassified_as_peak, false);
  near(n.halfspace_published_max_continuous_spl_db_1m, 103);
  near(n.halfspace_published_max_peak_spl_db_1m, 116);
  near(n.halfspace_effective_max_continuous_spl_db_1m, 103);
});

test('an ambiguous-only row with no sensitivity/power is INCOMPLETE (no defensible continuous)', () => {
  // "Max SPL" 112 published, no duration, no sensitivity/power → cannot derive a
  // continuous capability → INCOMPLETE DATA.
  const n = normalizeCompetitor({
    manufacturer: 'X', model: 'Y',
    published_max_continuous_spl_db_1m: 112,
    max_spl_measurement_basis: 'Half Space',
  });
  assert.equal(n.p12_p13_eligible, false);
  assert.equal(classifyDataAdequacy(n).key, DATA_ADEQUACY.INCOMPLETE.key);
});

test('an ambiguous row with sensitivity + power is GOOD DATA (not FULL)', () => {
  const n = normalizeCompetitor({ ...base, published_max_continuous_spl_db_1m: 112 });
  assert.equal(n.p12_p13_eligible, true);
  const label = classifyDataAdequacy(n);
  assert.equal(label.key, DATA_ADEQUACY.GOOD.key);
  assert.notEqual(label.key, DATA_ADEQUACY.FULL.key);
});

test('a genuine continuous figure with confirmed space + basis is FULL DATA', () => {
  const n = normalizeCompetitor({
    ...base, published_max_continuous_spl_db_1m: 112, max_spl_test_conditions: 'continuous',
    sensitivity_measurement_basis: 'Half Space', max_spl_measurement_basis: 'Half Space',
  });
  assert.equal(classifyDataAdequacy(n).key, DATA_ADEQUACY.FULL.key);
});

test('the conservative rule changes neither thresholds nor the underlying calculation', () => {
  // The calculated maths is unchanged: 90 dB + 10·log10(100) = 110 dB.
  const n = normalizeCompetitor({ ...base, published_max_continuous_spl_db_1m: 116 });
  near(n.halfspace_calculated_max_continuous_spl_db_1m, 110);
  // A genuine-continuous control gives the same calculated value.
  const g = normalizeCompetitor({ ...base, max_spl_test_conditions: 'continuous', published_max_continuous_spl_db_1m: 116 });
  near(g.halfspace_calculated_max_continuous_spl_db_1m, 110);
});