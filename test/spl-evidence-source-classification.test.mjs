// spl-evidence-source-classification.test.mjs
// ---------------------------------------------------------------------------
// RP22 Speaker Capability — evidence-classification correction.
//
// Three controlled cases are pushed through the REAL pipeline
// (SpeakerSpecification → buildComparisonRow → normalizeCompetitor → RP22
// comparison candidate):
//
//   1. Manufacturer-measured continuous SPL     → Manufacturer Measured,   A
//   2. Manufacturer-calculated continuous SPL   → Manufacturer Calculated, B
//   3. Sound Proof-calculated from sensitivity  → Sound Proof Estimate,    B
//
// What is asserted, and what is deliberately NOT touched:
//   • the capability SOURCE and the displayed evidence label
//   • the confidence classification (a calculated figure is never A)
//   • the numeric SPL is identical when ONLY provenance changes
//   • 2π (half space) receives no correction; 4π (full space) receives +6 dB once
//   • the identity of a published row does not change, so correcting provenance
//     on an existing model updates that record rather than creating a second one
//   • stored approval / publication provenance survives normalization untouched
//
// No thresholds, propagation, amplifier ceilings, EQ headroom or capability
// calculations are exercised or altered here.

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildComparisonRow } from '../src/components/admin/speaker-db/model-first/rp22ComparisonPublish.js';
import { normalizeCompetitor, competitorMetaForComparison } from '../src/components/utils/spl/competitorNormalization.js';
import { buildCandidate, classifyComparisonRow } from '../src/components/utils/spl/speakerDbComparisonCandidates.js';
import { competitorIdentityKey } from '../src/components/utils/spl/manufacturerIdentity.js';

const PRODUCT = {
  id: 'prod-1',
  manufacturer_name: 'Ascendo Immersive Audio',
  model: 'THE10 PRO PASSIVE',
  category: 'On Wall',
  official_product_url: 'https://www.ascendo-immersive-audio.com/',
};

// Shared controlled values: 92 dB @ 1 W / 1 m, 8 Ω, 300 W continuous rating.
const spec = (over = {}) => ({
  id: 'spec-1',
  product_id: 'prod-1',
  version_label: 'Current',
  approval_status: 'Approved',
  sensitivity_db: 92,
  sensitivity_basis: '1W/1m',
  nominal_impedance_ohm: 8,
  power_handling_continuous_w: 300,
  measurement_space: 'half-space',
  sensitivity_measurement_basis: 'Half Space',
  max_spl_measurement_basis: 'Half Space',
  source_date: '2026-10-01',
  ...over,
});

const toRow = (specification) => buildComparisonRow({
  product: PRODUCT,
  specification,
  manufacturerName: PRODUCT.manufacturer_name,
});

// Case 1 — the manufacturer states the figure as measured under a stated basis.
const MEASURED_SPEC = spec({
  id: 'spec-measured',
  max_continuous_spl_db: 118,
  max_spl_basis: 'continuous',
  evidence_quality: 'Manufacturer Published',
  confidence: 'A',
});

// Case 2 — the same figure, published as a CALCULATION instead of a measurement.
const CALCULATED_SPEC = spec({
  id: 'spec-calculated',
  max_continuous_spl_db: 118,
  max_spl_basis: 'calculated',
  evidence_quality: 'Manufacturer Calculated',
  confidence: 'B',
});

// Case 3 — no manufacturer SPL authority at all: Sound Proof derives it.
const ESTIMATE_SPEC = spec({
  id: 'spec-estimate',
  max_spl_basis: 'unknown',
  evidence_quality: 'Unknown',
});

test('1. a manufacturer-measured continuous SPL is labelled Manufacturer Measured at A', () => {
  const n = normalizeCompetitor(toRow(MEASURED_SPEC));
  assert.equal(n.p12_p13_eligible, true);
  assert.equal(n.spl_evidence_source, 'manufacturer_measured');
  assert.equal(n.spl_evidence_label, 'Manufacturer Measured');
  assert.equal(n.data_confidence, 'A');
  assert.equal(n.spl_authority, 'Published measured continuous SPL');
  // Half space / 2π: the figure is used exactly as published.
  assert.equal(n.max_spl_space_correction_db, 0);
  assert.equal(n.halfspace_published_max_continuous_spl_db_1m, 118);
});

test('2. a manufacturer-CALCULATED SPL is labelled as calculated and never reaches A', () => {
  const n = normalizeCompetitor(toRow(CALCULATED_SPEC));
  assert.equal(n.p12_p13_eligible, true);
  assert.equal(n.spl_evidence_source, 'manufacturer_calculated');
  assert.equal(n.spl_evidence_label, 'Manufacturer Calculated');
  // The defect being corrected: a populated continuous SPL used to be classed as
  // measured capability. It is now held at B.
  assert.notEqual(n.data_confidence, 'A');
  assert.equal(n.data_confidence, 'B');
  assert.equal(n.spl_authority, 'Manufacturer-calculated continuous SPL');

  const candidate = buildCandidate({ row: toRow(CALCULATED_SPEC), id: 'speakerdb:prod-1', published: true });
  assert.equal(candidate.classKey, 'B');
  assert.equal(candidate.basisLabel, 'Manufacturer Calculated');
});

test('3. only the provenance changes: the graded SPL figure is numerically identical', () => {
  const measured = normalizeCompetitor(toRow(MEASURED_SPEC));
  const calculated = normalizeCompetitor(toRow(CALCULATED_SPEC));

  assert.equal(measured.halfspace_published_max_continuous_spl_db_1m, calculated.halfspace_published_max_continuous_spl_db_1m);
  assert.equal(measured.max_spl_space_correction_db, calculated.max_spl_space_correction_db);
  // The engine consumes the same graded value in both cases; only the evidence
  // classification differs.
  const measuredMeta = competitorMetaForComparison(toRow(MEASURED_SPEC));
  const calculatedMeta = competitorMetaForComparison(toRow(CALCULATED_SPEC));
  assert.equal(measuredMeta.max_spl_cont_db_1m_halfspace, 118);
  assert.equal(calculatedMeta.max_spl_cont_db_1m_halfspace, 118);
});

test('4. Sound Proof-calculated capability is named as such and keeps the existing maths', () => {
  const n = normalizeCompetitor(toRow(ESTIMATE_SPEC));
  assert.equal(n.p12_p13_eligible, true);
  assert.equal(n.spl_evidence_source, 'sound_proof_estimate');
  assert.equal(n.spl_evidence_label, 'Sound Proof Estimate');
  assert.equal(n.data_confidence, 'B');
  // Unchanged capability calculation: half-space sensitivity + 10·log10(power).
  assert.equal(Number(n.halfspace_calculated_max_continuous_spl_db_1m.toFixed(2)), 116.77);
  assert.equal(
    competitorMetaForComparison(toRow(ESTIMATE_SPEC)).max_spl_cont_db_1m_halfspace,
    n.halfspace_calculated_max_continuous_spl_db_1m,
  );
  assert.equal(n.power_authority, 'Continuous');
});

test('5. a manufacturer figure with no stated basis is published-but-unverified, never measured', () => {
  const row = { ...toRow(MEASURED_SPEC), max_spl_test_conditions: '', source_evidence_quality: '' };
  const n = normalizeCompetitor(row);
  assert.equal(n.spl_evidence_source, 'manufacturer_unverified');
  assert.equal(n.spl_evidence_label, 'Manufacturer Published (unstated)');
  assert.notEqual(n.data_confidence, 'A');
  assert.equal(n.data_confidence, 'B');
  // The figure itself is untouched.
  assert.equal(n.halfspace_published_max_continuous_spl_db_1m, 118);
});

test('6. a stated Full Space / 4π figure still receives +6 dB exactly once', () => {
  const fullSpace = (over) => spec({
    measurement_space: 'free-space',
    sensitivity_measurement_basis: 'Full Space',
    max_spl_measurement_basis: 'Full Space',
    ...over,
  });
  const measured = normalizeCompetitor(toRow(fullSpace({ max_continuous_spl_db: 112, max_spl_basis: 'IEC', evidence_quality: 'Manufacturer Published' })));
  const calculated = normalizeCompetitor(toRow(fullSpace({ max_continuous_spl_db: 112, max_spl_basis: 'calculated', evidence_quality: 'Manufacturer Calculated' })));

  for (const n of [measured, calculated]) {
    assert.equal(n.max_spl_space_correction_db, 6);
    assert.equal(n.sensitivity_space_provenance, 'full_space_published_converted');
    assert.equal(n.halfspace_published_max_continuous_spl_db_1m, 118);
  }
  assert.equal(measured.spl_evidence_source, 'manufacturer_measured');
  assert.equal(calculated.spl_evidence_source, 'manufacturer_calculated');
});

test('7. correcting the provenance of an existing model keeps one comparison identity', () => {
  // Same manufacturer + model: the corrected row must update that record rather
  // than create a second one.
  assert.equal(
    competitorIdentityKey(toRow(CALCULATED_SPEC)),
    competitorIdentityKey(toRow(MEASURED_SPEC)),
  );
  const row = toRow(CALCULATED_SPEC);
  assert.equal(row.publish_source, 'speaker_database');
  assert.equal(row.source_product_id, 'prod-1');
  assert.equal(row.source_specification_id, 'spec-calculated');
  assert.equal(row.approval_status, 'Approved');
  assert.equal(row.published, true);
});

test('8. approval and publication provenance survive normalization untouched', () => {
  const stored = {
    ...toRow(MEASURED_SPEC),
    id: 'competitor-1',
    published: true,
    published_at: '2026-09-01T10:00:00.000Z',
    approval_status: 'Approved',
    source_product_id: 'prod-1',
    source_specification_id: 'spec-measured',
    spec_version_label: 'Current',
  };
  const n = normalizeCompetitor(stored);
  assert.equal(n.id, 'competitor-1');
  assert.equal(n.published_at, '2026-09-01T10:00:00.000Z');
  assert.equal(n.approval_status, 'Approved');
  assert.equal(n.source_product_id, 'prod-1');
  assert.equal(n.source_specification_id, 'spec-measured');
  assert.equal(n.spec_version_label, 'Current');
  // Classifying the row never writes an approval state of its own.
  assert.equal(n.approval_status, stored.approval_status);
});

test('9. a stated data-quality letter holds the computed class back', () => {
  // The specification declares its data quality as C (estimated): the row is
  // measured in provenance but can no longer present as A.
  const n = normalizeCompetitor(toRow(spec({
    id: 'spec-declared-c',
    max_continuous_spl_db: 118,
    max_spl_basis: 'continuous',
    evidence_quality: 'Manufacturer Published',
    confidence: 'C',
  })));
  assert.equal(n.data_confidence, 'C');
  assert.equal(n.spl_evidence_source, 'manufacturer_measured');
});

test('10. the comparison classification carries the provenance onto every row', () => {
  const { record, classKey } = classifyComparisonRow(toRow(MEASURED_SPEC));
  assert.equal(record.spl_evidence_label, 'Manufacturer Measured');
  assert.equal(classKey, 'A');
  const candidate = buildCandidate({ row: toRow(MEASURED_SPEC), id: 'speakerdb:prod-1', published: true });
  assert.equal(candidate.splEvidenceSource, 'manufacturer_measured');
  assert.equal(candidate.basisLabel, 'Manufacturer Measured');
});