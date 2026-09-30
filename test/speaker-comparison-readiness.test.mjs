// Speaker Database comparison readiness + removal policy.
//
// Covers the acceptance behaviour of the simplified model workflow:
//   B  an M&K MP150-style record is classified from the fields it actually has
//   D  a calculated capability is never presented as published evidence
//   E  a record with nothing to calculate from is Insufficient Data, not a grade
//   C  removal offers Archive when approved/published data exists, Delete only
//      for a draft with no publish history

import test from 'node:test';
import assert from 'node:assert/strict';
import { comparisonReadiness, evidenceText, powerBasisText } from '../src/components/admin/speaker-db/comparisonReadiness.js';
import { assessRemoval } from '../src/components/admin/speaker-db/speakerProductLifecycle.js';

const MP150_PRODUCT = {
  id: 'prod-mp150',
  manufacturer_name: 'M&K Sound',
  model: 'MP150',
  official_product_url: 'https://mksound.com/products/mp150/',
};

// What the model-first flow writes for MP150: sensitivity and impedance
// published, no published power rating (recommended amplifier maximum only),
// no published max SPL, no measurement space stated.
const MP150_SPEC = {
  id: 'spec-mp150',
  product_id: 'prod-mp150',
  sensitivity_db: 90,
  sensitivity_basis: '2.83V/1m',
  nominal_impedance_ohm: 4,
  recommended_amp_max_w: 400,
  frequency_response_low_hz: 80,
  frequency_response_high_hz: 20000,
  max_spl_basis: 'unknown',
  measurement_space: 'unspecified',
  source_date: '2026-05-01',
  evidence_quality: 'Unknown',
  sensitivity_measurement_basis: '',
  max_spl_measurement_basis: '',
};

const PUBLISHED_PRODUCT = {
  id: 'prod-pub',
  manufacturer_name: 'Example',
  model: 'Ref 1',
  official_product_url: 'https://example.com/ref1',
};

const PUBLISHED_SPEC = {
  id: 'spec-pub',
  product_id: 'prod-pub',
  sensitivity_db: 92,
  sensitivity_basis: '1W/1m',
  nominal_impedance_ohm: 8,
  power_handling_continuous_w: 300,
  max_continuous_spl_db: 118,
  max_spl_basis: 'continuous',
  frequency_response_low_hz: 55,
  frequency_response_high_hz: 20000,
  measurement_space: 'half-space',
  source_date: '2026-04-02',
  evidence_quality: 'Manufacturer Published',
  sensitivity_measurement_basis: 'Half Space',
  max_spl_measurement_basis: 'Half Space',
};

test('B. MP150-style record is an ADI estimate, never published-grade evidence', () => {
  const r = comparisonReadiness({ product: MP150_PRODUCT, specification: MP150_SPEC });
  assert.equal(r.confidence, 'C');
  assert.equal(r.label, 'ADI Estimate');
  assert.equal(r.eligible, true);            // gradeable, so it can be compared
  assert.equal(r.capabilityBasis, 'Calculated');
  assert.equal(r.powerAuthority, 'Manufacturer recommended amplifier maximum');
  assert.equal(r.powerAuthorityW, 400);
  assert.equal(r.evidenceQuality, 'Manufacturer Calculated');
  assert.equal(evidenceText(r), 'C · ADI estimate');
  assert.equal(powerBasisText(MP150_SPEC), '400 W · recommended amplifier max');
  // The two gaps that keep it out of Comparable are named, not implied.
  assert.deepEqual(r.missingCriticalLabels, ['Measurement space', 'Evidence quality']);
  assert.equal(r.totalCount, 16); // the RP22 comparison field definition
  assert.equal(r.presentCount, 7);
});

test('D. published capability reaches Comparable and is marked as published evidence', () => {
  const r = comparisonReadiness({ product: PUBLISHED_PRODUCT, specification: PUBLISHED_SPEC });
  assert.equal(r.confidence, 'A');
  assert.equal(r.label, 'Comparable');
  assert.equal(r.capabilityBasis, 'Published');
  assert.equal(r.evidenceQuality, 'Manufacturer Published');
  assert.equal(evidenceText(r), 'A · published capability');
  assert.deepEqual(r.missingCriticalLabels, []);
  // Every critical field is present; the remaining gaps are supporting fields.
  assert.deepEqual(r.missingUsefulLabels, [
    'Max peak SPL',
    'Dispersion',
    'THX / certification',
    'Driver configuration',
    'Cabinet type',
  ]);
  assert.equal(r.presentCount, 11);
});

test('E. nothing to compare from is Insufficient Data — no level is shown', () => {
  const r = comparisonReadiness({
    product: { id: 'x', manufacturer_name: 'Unknown', model: 'Mystery' },
    specification: { id: 's', product_id: 'x' },
  });
  assert.equal(r.confidence, 'D');
  assert.equal(r.label, 'Insufficient Data');
  assert.equal(r.eligible, false);
  assert.equal(evidenceText(r), 'D · insufficient');
  assert.ok(r.missingCriticalLabels.includes('Sensitivity'));
  assert.ok(r.missingCriticalLabels.includes('Nominal impedance'));
});

test('C. removal policy: approved or published data is archived, not deleted', () => {
  const published = assessRemoval(MP150_PRODUCT, [
    { id: 's1', approval_status: 'Approved', rp22_published_competitor_id: 'comp-1' },
  ]);
  assert.equal(published.mode, 'archive');
  assert.match(published.headline, /approved or published data/i);
  assert.match(published.headline, /Archive it instead\?/);
  assert.equal(published.actionLabel, 'Archive product');

  const approvedOnly = assessRemoval(MP150_PRODUCT, [{ id: 's1', approval_status: 'Approved' }]);
  assert.equal(approvedOnly.mode, 'archive');

  const draft = assessRemoval(MP150_PRODUCT, [{ id: 's1', approval_status: 'Draft' }]);
  assert.equal(draft.mode, 'delete');
  assert.equal(draft.actionLabel, 'Delete permanently');

  const empty = assessRemoval(MP150_PRODUCT, []);
  assert.equal(empty.mode, 'delete');
});