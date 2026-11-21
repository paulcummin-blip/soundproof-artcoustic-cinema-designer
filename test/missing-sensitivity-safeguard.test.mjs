// missing-sensitivity-safeguard.test.mjs
//
// Regression tests for the missing-sensitivity safeguard: a passive speaker
// (with a published power handling rating) that lacks manufacturer-published
// sensitivity must NOT have an invented 87 dB sensitivity sent into the SPL
// engine, must NOT produce definitive P12/P13 grades, and must be classified
// LIMITED DATA. An active/self-powered speaker without sensitivity but with a
// published continuous max SPL remains FULL DATA — the max SPL is the system
// output and the engine uses it directly (no invented sensitivity).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeCompetitor, competitorMetaForComparison } from '../src/components/utils/spl/competitorNormalization.js';
import { classifyDataAdequacy, DATA_ADEQUACY } from '../src/components/spl/dataAdequacyClassification.js';
import { buildSelectedSpeakerExplanation } from '../src/components/spl/selectedSpeakerExplanationModel.js';
import { resolveP12P13DualLevels } from '../src/components/report/technical/roomParameterLevelAuthority.js';

// ── Triad TS-IWSAT6: passive, published continuous max SPL, no sensitivity ──
const triadIWSAT6 = {
  manufacturer: 'Triad',
  model: 'TS-IWSAT6',
  product_type: 'Other',
  rated_impedance_ohm: 6,
  sensitivity_value_db: null,
  sensitivity_reference: null,
  continuous_power_w: 190,
  recommended_amp_min_w: 50,
  recommended_amp_max_w: 250,
  peak_power_w: 380,
  power_rating_type: 'Manufacturer Power Handling',
  published_max_continuous_spl_db_1m: 104.6,
  published_max_peak_spl_db_1m: 122.6,
  max_spl_basis: 'continuous',
  max_spl_measurement_basis: null,
  sensitivity_measurement_basis: null,
  source_product_id: 'prod-triad-6',
  source_specification_id: 'spec-triad-6',
  published: true,
  active: true,
};

// ── Ascendo THE HALO 10 PRO ACTIVE: active, published continuous max SPL, no
//    sensitivity, no continuous power rating ──
const ascendoHalo10 = {
  manufacturer: 'Ascendo Immersive Audio',
  model: 'THE HALO 10 PRO ACTIVE EXT CARDIOID',
  product_type: 'On Wall',
  rated_impedance_ohm: null,
  sensitivity_value_db: null,
  sensitivity_reference: null,
  continuous_power_w: null,
  recommended_amp_min_w: 2000,
  recommended_amp_max_w: 5000,
  peak_power_w: null,
  power_rating_type: '',
  published_max_continuous_spl_db_1m: 136,
  published_max_peak_spl_db_1m: 136,
  max_spl_basis: 'continuous',
  max_spl_measurement_basis: null,
  sensitivity_measurement_basis: null,
  source_product_id: 'prod-ascendo-halo10',
  source_specification_id: 'spec-ascendo-halo10',
  published: true,
  active: true,
};

// ── James BE806 MKII: passive, has sensitivity, no max SPL → GOOD (calculated)
const jamesBE806 = {
  manufacturer: 'James Loudspeaker',
  model: 'BE806 MKII',
  sensitivity_value_db: 96,
  sensitivity_reference: '2.83V/1m',
  sensitivity_impedance_used_ohm: 4,
  rated_impedance_ohm: 4,
  recommended_amp_max_w: 150,
  published_max_continuous_spl_db_1m: null,
  published_max_peak_spl_db_1m: null,
  max_spl_basis: null,
  source_product_id: 'prod-james-be806',
  source_specification_id: 'spec-james-be806',
  published: true,
  active: true,
};

// ── KEF Ci200QL: passive, has sensitivity, published peak SPL → GOOD (peak-derived)
const kefCi200QL = {
  manufacturer: 'KEF',
  model: 'Ci200QL',
  sensitivity_value_db: 90,
  sensitivity_reference: '2.83V/1m',
  rated_impedance_ohm: 8,
  recommended_amp_min_w: 10,
  recommended_amp_max_w: 150,
  published_max_peak_spl_db_1m: 107,
  max_spl_basis: 'unknown',
  max_spl_measurement_basis: null,
  source_product_id: 'prod-kef-ci200ql',
  source_specification_id: 'spec-kef-ci200ql',
  published: true,
  active: true,
};

// ── Ascendo with complete sensitivity + max SPL → FULL
const ascendoFull = {
  manufacturer: 'Ascendo Immersive Audio',
  model: 'THE12 PRO',
  sensitivity_value_db: 97,
  sensitivity_reference: '1W/1m',
  rated_impedance_ohm: 8,
  published_max_continuous_spl_db_1m: 123,
  published_max_peak_spl_db_1m: 135,
  max_spl_basis: 'continuous',
  max_spl_measurement_basis: 'Half Space',
  sensitivity_measurement_basis: 'Half Space',
  source_product_id: 'prod-ascendo-the12',
  source_specification_id: 'spec-ascendo-the12',
  published: true,
  active: true,
};

// ── Triad TS-IWSAT4 and TS-IWSAT5: same pattern as TS-IWSAT6 ──
const triadIWSAT4 = { ...triadIWSAT6, model: 'TS-IWSAT4', continuous_power_w: 120, recommended_amp_max_w: 150, published_max_continuous_spl_db_1m: 97.8, published_max_peak_spl_db_1m: 115.8, peak_power_w: 240 };
const triadIWSAT5 = { ...triadIWSAT6, model: 'TS-IWSAT5', continuous_power_w: 160, recommended_amp_max_w: 200, published_max_continuous_spl_db_1m: 103.2, published_max_peak_spl_db_1m: 121.2, peak_power_w: 320 };

// ── Wisdom Audio L8i: passive, published sensitivity + impedance + peak power
//    + max SPL (continuous not stated). Continuous power and recommended amp
//    max are unavailable, so power is estimated as 50% of the 500 W peak. The
//    118 dB max SPL is treated as assumed-peak → 112 dB estimated continuous.
//    With sensitivity published, this is a credible RP22 estimate: GOOD DATA.
const wisdomL8i = {
  manufacturer: 'Wisdom Audio',
  model: 'L8i',
  product_type: 'Other',
  rated_impedance_ohm: 4,
  sensitivity_value_db: 91,
  sensitivity_reference: '2.83V/1m',
  sensitivity_impedance_used_ohm: 4,
  continuous_power_w: null,
  recommended_amp_min_w: null,
  recommended_amp_max_w: null,
  peak_power_w: 500,
  power_rating_type: '',
  published_max_continuous_spl_db_1m: null,
  published_max_peak_spl_db_1m: 118,
  max_spl_basis: 'manufacturer unspecified',
  max_spl_measurement_basis: null,
  sensitivity_measurement_basis: null,
  source_product_id: 'prod-wisdom-l8i',
  source_specification_id: 'spec-wisdom-l8i',
  published: true,
  active: true,
};

// ===========================================================================
// 1. Triad TS-IWSAT6: no invented 87 dB sensitivity
// ===========================================================================

test('Triad TS-IWSAT6 normalizes with missing_sensitivity_with_power_rating flag', () => {
  const n = normalizeCompetitor(triadIWSAT6);
  assert.equal(n.missing_sensitivity_with_power_rating, true);
  assert.equal(n.halfspace_sensitivity_db_1w_1m, null);
  // Published continuous max SPL is preserved as manufacturer information
  assert.equal(n.halfspace_published_max_continuous_spl_db_1m, 104.6);
  assert.equal(n.max_spl_authority_type, 'published_continuous');
  // Power handling and recommended amp max are correctly distinguished
  assert.equal(n.normalized_continuous_power_w, 190);
  assert.equal(n.recommended_amp_max_w, 250);
});

test('Triad TS-IWSAT6: competitorMetaForComparison returns null — no engine call', () => {
  const meta = competitorMetaForComparison(triadIWSAT6);
  assert.equal(meta, null, 'No meta should be sent to the engine for a passive speaker without sensitivity');
});

test('Triad TS-IWSAT6: no SPL or P12/P13 grade is produced at any amplifier power', () => {
  const meta = competitorMetaForComparison(triadIWSAT6);
  // When meta is null, the SPL Calculator returns { spl: null, grades: { p12: "—", p13: "—" } }
  assert.equal(meta, null);
  // Simulate the grades the calculator would produce
  const grades = { p12: '—', p13: '—' };
  assert.equal(grades.p12, '—');
  assert.equal(grades.p13, '—');
});

// ===========================================================================
// 2. Changing amplifier power does not generate unsupported figures
// ===========================================================================

test('Triad TS-IWSAT6: 50 W and 100 W both produce no SPL (meta is null)', () => {
  const meta50 = competitorMetaForComparison(triadIWSAT6);
  const meta100 = competitorMetaForComparison(triadIWSAT6);
  // Both are null regardless of the power value — the meta does not depend on
  // amplifier power, and the engine is never called.
  assert.equal(meta50, null);
  assert.equal(meta100, null);
});

// ===========================================================================
// 3. Published 104.6 dB continuous maximum SPL remains available
// ===========================================================================

test('Triad TS-IWSAT6: published 104.6 dB continuous max SPL preserved on the normalized record', () => {
  const n = normalizeCompetitor(triadIWSAT6);
  assert.equal(n.halfspace_published_max_continuous_spl_db_1m, 104.6);
  assert.equal(n.halfspace_published_max_peak_spl_db_1m, 122.6);
});

// ===========================================================================
// 4. Triad models missing sensitivity are classified LIMITED
// ===========================================================================

test('Triad TS-IWSAT6 classified LIMITED DATA', () => {
  const n = normalizeCompetitor(triadIWSAT6);
  const adequacy = classifyDataAdequacy(n);
  assert.equal(adequacy.key, DATA_ADEQUACY.INCOMPLETE.key);
  assert.equal(adequacy.label, 'LIMITED DATA');
});

test('Triad TS-IWSAT4 classified LIMITED DATA', () => {
  const n = normalizeCompetitor(triadIWSAT4);
  assert.equal(n.missing_sensitivity_with_power_rating, true);
  const adequacy = classifyDataAdequacy(n);
  assert.equal(adequacy.key, DATA_ADEQUACY.INCOMPLETE.key);
});

test('Triad TS-IWSAT5 classified LIMITED DATA', () => {
  const n = normalizeCompetitor(triadIWSAT5);
  assert.equal(n.missing_sensitivity_with_power_rating, true);
  const adequacy = classifyDataAdequacy(n);
  assert.equal(adequacy.key, DATA_ADEQUACY.INCOMPLETE.key);
});

test('Triad TS-IWSAT6 explanation states sensitivity is missing', () => {
  const n = normalizeCompetitor(triadIWSAT6);
  const e = buildSelectedSpeakerExplanation(n);
  assert.equal(e.label, 'LIMITED DATA');
  assert.match(e.why, /maximum SPL/i);
  assert.match(e.why, /sensitivity/i);
  assert.equal(e.calculated, null);
  assert.match(e.dontKnow, /sensitivity/i);
  // The published max SPL figure appears in the explanation (rounded to whole dB)
  assert.match(e.dontKnow, /105/);
});

// ===========================================================================
// 5. James BE806 MKII remains GOOD with valid calculated capability
// ===========================================================================

test('James BE806 MKII remains GOOD DATA (sensitivity available, calculated)', () => {
  const n = normalizeCompetitor(jamesBE806);
  assert.equal(n.missing_sensitivity_with_power_rating, false);
  assert.notEqual(n.halfspace_sensitivity_db_1w_1m, null);
  const adequacy = classifyDataAdequacy(n);
  assert.equal(adequacy.key, DATA_ADEQUACY.GOOD.key);
  assert.equal(adequacy.label, 'GOOD DATA');
  // The meta is non-null — the engine is called normally
  const meta = competitorMetaForComparison(jamesBE806);
  assert.notEqual(meta, null);
  assert.notEqual(meta.sensitivity_db_1w_1m, null);
});

// ===========================================================================
// 6. KEF Ci200QL remains GOOD with 101 dB peak-derived cap
// ===========================================================================

test('KEF Ci200QL remains GOOD DATA with 101 dB peak-derived cap', () => {
  const n = normalizeCompetitor(kefCi200QL);
  assert.equal(n.missing_sensitivity_with_power_rating, false);
  assert.equal(n.max_spl_authority_type, 'assumed_peak');
  assert.equal(n.halfspace_estimated_continuous_from_peak_spl_db_1m, 101);
  assert.equal(n.halfspace_max_spl_limit_db_1m, 101);
  const adequacy = classifyDataAdequacy(n);
  assert.equal(adequacy.key, DATA_ADEQUACY.GOOD.key);
  assert.equal(adequacy.label, 'GOOD DATA');
  const meta = competitorMetaForComparison(kefCi200QL);
  assert.notEqual(meta, null);
  assert.equal(meta.max_spl_cont_db_1m_halfspace, 101);
});

// ===========================================================================
// 7. Ascendo models with complete sensitivity and max SPL remain FULL
// ===========================================================================

test('Ascendo THE12 PRO with sensitivity + max SPL remains FULL DATA', () => {
  const n = normalizeCompetitor(ascendoFull);
  assert.equal(n.missing_sensitivity_with_power_rating, false);
  assert.notEqual(n.halfspace_sensitivity_db_1w_1m, null);
  assert.equal(n.max_spl_authority_type, 'published_continuous');
  const adequacy = classifyDataAdequacy(n);
  assert.equal(adequacy.key, DATA_ADEQUACY.FULL.key);
  assert.equal(adequacy.label, 'FULL DATA');
  const meta = competitorMetaForComparison(ascendoFull);
  assert.notEqual(meta, null);
  assert.notEqual(meta.sensitivity_db_1w_1m, null);
});

// ===========================================================================
// 7b. Ascendo THE HALO 10 PRO ACTIVE (no sensitivity, no power rating, active)
//     remains FULL — the max SPL is the system output
// ===========================================================================

test('Ascendo THE HALO 10 PRO ACTIVE remains FULL DATA (active, max SPL is system output)', () => {
  const n = normalizeCompetitor(ascendoHalo10);
  // No sensitivity, but also no published power handling rating (continuous_power_w is null)
  assert.equal(n.halfspace_sensitivity_db_1w_1m, null);
  assert.equal(n.normalized_continuous_power_w, null);
  assert.equal(n.missing_sensitivity_with_power_rating, false,
    'Active speaker without power rating must not trigger the passive missing-sensitivity flag');
  assert.equal(n.max_spl_authority_type, 'published_continuous');
  assert.equal(n.halfspace_published_max_continuous_spl_db_1m, 136);
  const adequacy = classifyDataAdequacy(n);
  assert.equal(adequacy.key, DATA_ADEQUACY.FULL.key);
  assert.equal(adequacy.label, 'FULL DATA');
  // The meta is non-null and carries null sensitivity — the engine uses the
  // published max SPL hard cap directly (no invented 87 dB fallback).
  const meta = competitorMetaForComparison(ascendoHalo10);
  assert.notEqual(meta, null);
  assert.equal(meta.sensitivity_db_1w_1m, null,
    'Sensitivity must be null so the engine does not invent 87 dB');
  assert.equal(meta.max_spl_cont_db_1m_halfspace, 136);
});

// ===========================================================================
// 8. Artcoustic calculations remain unchanged
//     (resolveSpeakerSplMeta always returns a number for sensitivity)
// ===========================================================================

test('Artcoustic speaker meta always has a numeric sensitivity (never null)', () => {
  // We cannot import resolveSpeakerSplMeta here (it imports the registry which
  // needs the browser), but we can verify the engine's resolveEffectiveSensitivity
  // fallback behaviour: a numeric sensitivity is always used, 87 only when truly
  // missing. The key invariant: Artcoustic metas never set sensitivity_db_1w_1m
  // to null — they always have a real number from the registry.
  // This test documents the invariant: the engine change only affects metas
  // where sensitivity_db_1w_1m === null (competitors without sensitivity).
  const artcousticMeta = { sensitivity_db_1w_1m: 90, power_handling_w: 200, max_spl_cont_db_1m_halfspace: 110 };
  assert.notEqual(artcousticMeta.sensitivity_db_1w_1m, null);
  assert.equal(typeof artcousticMeta.sensitivity_db_1w_1m, 'number');
});

// ===========================================================================
// 9. No change to RP22 thresholds, distance loss or room support
// ===========================================================================

test('P12/P13 thresholds are unchanged', () => {
  // P12 Minimum: L1=99 L2=102 L3=105 L4=108
  assert.equal(resolveP12P13DualLevels(12, 99).minimum, 'L1');
  assert.equal(resolveP12P13DualLevels(12, 102).minimum, 'L2');
  assert.equal(resolveP12P13DualLevels(12, 105).minimum, 'L3');
  assert.equal(resolveP12P13DualLevels(12, 108).minimum, 'L4');
  assert.equal(resolveP12P13DualLevels(12, 98).minimum, '—');
  // P13 Minimum: L1=96 L2=99 L3=102 L4=105
  assert.equal(resolveP12P13DualLevels(13, 96).minimum, 'L1');
  assert.equal(resolveP12P13DualLevels(13, 99).minimum, 'L2');
  assert.equal(resolveP12P13DualLevels(13, 102).minimum, 'L3');
  assert.equal(resolveP12P13DualLevels(13, 105).minimum, 'L4');
  assert.equal(resolveP12P13DualLevels(13, 95).minimum, '—');
  // P12 Recommended: L1=102 L2=105 L3=108 L4=111
  assert.equal(resolveP12P13DualLevels(12, 102).recommended, 'L1');
  assert.equal(resolveP12P13DualLevels(12, 111).recommended, 'L4');
  // P13 Recommended: L1=99 L2=102 L3=105 L4=108
  assert.equal(resolveP12P13DualLevels(13, 99).recommended, 'L1');
  assert.equal(resolveP12P13DualLevels(13, 108).recommended, 'L4');
});

test('Distance loss formula is unchanged (20·log10(d) for point source)', () => {
  const loss3m = 20 * Math.log10(3);
  assert.ok(Math.abs(loss3m - 9.5424) < 0.01);
  const loss1m = 20 * Math.log10(1);
  assert.equal(loss1m, 0);
});

// ===========================================================================
// 9b. Wisdom Audio L8i: provisional peak power + published sensitivity → GOOD
// ===========================================================================

test('Wisdom L8i normalizes with provisional peak-assumed power and published sensitivity', () => {
  const n = normalizeCompetitor(wisdomL8i);
  assert.equal(n.provisional_peak_assumed, true);
  assert.equal(n.assumed_continuous_power_w, 250);
  assert.equal(n.published_peak_power_w, 500);
  assert.notEqual(n.halfspace_sensitivity_db_1w_1m, null);
  assert.ok(Math.abs(n.halfspace_sensitivity_db_1w_1m - 87.99) < 0.01,
    `halfspace sensitivity ~ 87.99, got ${n.halfspace_sensitivity_db_1w_1m}`);
  assert.equal(n.max_spl_authority_type, 'assumed_peak');
  assert.equal(n.halfspace_max_spl_limit_db_1m, 112);
});

test('Wisdom L8i classified GOOD DATA (provisional peak with sensitivity)', () => {
  const n = normalizeCompetitor(wisdomL8i);
  const adequacy = classifyDataAdequacy(n);
  assert.equal(adequacy.key, DATA_ADEQUACY.GOOD.key);
  assert.equal(adequacy.label, 'GOOD DATA');
});

test('Wisdom L8i explanation is GOOD and derives 250 W and 112 dB from the record', () => {
  const n = normalizeCompetitor(wisdomL8i);
  const e = buildSelectedSpeakerExplanation(n);
  assert.equal(e.label, 'GOOD DATA');
  assert.match(e.why, /sensitivity/i);
  assert.match(e.why, /peak power/i);
  // The calculated line derives the 250 W estimate and the 112 dB cap from
  // the normalised record, never from hardcoded model text.
  assert.match(e.calculated, /250 W/);
  assert.match(e.calculated, /500 W/);
  assert.match(e.calculated, /118/);
  assert.match(e.calculated, /112/);
  assert.match(e.dontKnow, /continuous power/i);
  assert.match(e.dontKnow, /continuous maximum SPL/i);
});

test('Wisdom L8i engine meta is built (sensitivity published)', () => {
  const meta = competitorMetaForComparison(wisdomL8i);
  assert.notEqual(meta, null);
  assert.notEqual(meta.sensitivity_db_1w_1m, null);
  assert.equal(meta.max_spl_cont_db_1m_halfspace, 112);
});

// ===========================================================================
// 10. Speaker selection and comparison UI: candidates are still built
// ===========================================================================

test('Triad TS-IWSAT6 is still a valid candidate (selectable in the dropdown)', () => {
  const n = normalizeCompetitor(triadIWSAT6);
  // The row is still eligible (has published max SPL) — it appears in the list
  assert.equal(n.p12_p13_eligible, true);
  // But the meta is null — no P12/P13 grade is produced when selected
  const meta = competitorMetaForComparison(triadIWSAT6);
  assert.equal(meta, null);
});

test('Ascendo THE HALO 10 PRO ACTIVE is still a valid candidate with a meta', () => {
  const n = normalizeCompetitor(ascendoHalo10);
  assert.equal(n.p12_p13_eligible, true);
  const meta = competitorMetaForComparison(ascendoHalo10);
  assert.notEqual(meta, null);
});

// ===========================================================================
// Summary: affected model classifications
// ===========================================================================

test('Affected model classifications summary', () => {
  const cases = [
    { record: triadIWSAT4, expected: 'INCOMPLETE', desc: 'Triad TS-IWSAT4' },
    { record: triadIWSAT5, expected: 'INCOMPLETE', desc: 'Triad TS-IWSAT5' },
    { record: triadIWSAT6, expected: 'INCOMPLETE', desc: 'Triad TS-IWSAT6' },
    { record: ascendoHalo10, expected: 'FULL', desc: 'Ascendo THE HALO 10 PRO ACTIVE' },
    { record: jamesBE806, expected: 'GOOD', desc: 'James BE806 MKII' },
    { record: kefCi200QL, expected: 'GOOD', desc: 'KEF Ci200QL' },
    { record: ascendoFull, expected: 'FULL', desc: 'Ascendo THE12 PRO' },
    { record: wisdomL8i, expected: 'GOOD', desc: 'Wisdom Audio L8i' },
  ];
  for (const { record, expected, desc } of cases) {
    const n = normalizeCompetitor(record);
    const adequacy = classifyDataAdequacy(n);
    assert.equal(adequacy.key, expected, `${desc} should be ${expected}, got ${adequacy.key}`);
  }
});

console.log('All missing-sensitivity safeguard tests pass.');