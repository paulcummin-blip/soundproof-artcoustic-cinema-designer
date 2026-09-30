import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCompetitor } from '../src/components/utils/spl/competitorNormalization.js';

// Secondary evidence — an admin-approved copy of a manufacturer document held
// outside the manufacturer's own domain. It may be used for comparison, but it
// can never present itself as published measured manufacturer evidence: A and B
// are held at C unless the host belongs to the manufacturer (official CDN or
// archive). These are the Bowers & Wilkins CT8 LR figures as published by the
// manufacturer's own information sheet.
const base = {
  manufacturer: 'Bowers & Wilkins',
  model: 'CT8 LR',
  sensitivity_value_db: 93,
  sensitivity_reference: '2.83V/1m',
  rated_impedance_ohm: 8,
  minimum_impedance_ohm: 4,
  recommended_amp_min_w: 500,
  recommended_amp_max_w: 1000,
  frequency_range: '29–24000 Hz',
  measurement_space_basis: 'Half Space',
};

const evidence = (over = {}) => ({
  source_type: 'Secondary Evidence',
  url: 'https://dealer.example/ct8-lr-product-sheet.pdf',
  host: 'dealer.example',
  document_type: 'manufacturer_product_sheet',
  is_official: false,
  accepted_by: 'Paul',
  accepted_date: '2026-09-30T10:00:00.000Z',
  basis: 'ADI estimate from secondary manufacturer document',
  confidence_cap_reason: 'Admin-approved secondary copy hosted on dealer.example, not the manufacturer\u2019s own domain — capped at C.',
  ...over,
});

test('1. an accepted secondary source grades the model and holds it at C', () => {
  const n = normalizeCompetitor({ ...base, secondary_evidence: evidence() });
  assert.equal(n.p12_p13_eligible, true);
  assert.equal(n.data_confidence, 'C');
  assert.equal(n.evidence_quality, 'Secondary Evidence');
  assert.equal(n.capability_basis, 'ADI estimate from secondary manufacturer document');
  assert.equal(n.evidence_source, 'secondary');
  assert.equal(n.secondary_evidence_url, 'https://dealer.example/ct8-lr-product-sheet.pdf');
  assert.match(n.confidence_cap_reason, /capped at C/);
});

test('2. the same values without secondary evidence reach B — the cap is what holds it', () => {
  const n = normalizeCompetitor({ ...base });
  assert.equal(n.data_confidence, 'B');
  assert.equal(n.evidence_source, 'official');
  assert.equal(n.secondary_evidence, null);
});

test('3. a published continuous SPL would reach A, and secondary evidence still holds it at C', () => {
  const published = {
    ...base,
    continuous_power_w: 500,
    power_rating_type: 'Continuous',
    published_max_continuous_spl_db_1m: 116,
  };
  assert.equal(normalizeCompetitor(published).data_confidence, 'A');
  assert.equal(normalizeCompetitor({ ...published, secondary_evidence: evidence() }).data_confidence, 'C');
});

test('4. an official manufacturer CDN is not capped — it is the manufacturer speaking', () => {
  const n = normalizeCompetitor({
    ...base,
    secondary_evidence: evidence({ is_official: true, host: 'bowerswilkins.com' }),
  });
  assert.equal(n.data_confidence, 'B');
  assert.equal(n.evidence_source, 'secondary');
  assert.equal(n.capability_basis, 'Calculated');
});

test('5. the cap never invents a grade: a model missing a power authority stays ungradeable', () => {
  const n = normalizeCompetitor({
    manufacturer: 'Bowers & Wilkins',
    model: 'CT8 LR',
    sensitivity_value_db: 93,
    sensitivity_reference: '2.83V/1m',
    rated_impedance_ohm: 8,
    secondary_evidence: evidence(),
  });
  assert.equal(n.p12_p13_eligible, false);
  assert.equal(n.data_confidence, 'INSUFFICIENT');
});