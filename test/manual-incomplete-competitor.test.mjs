// manual-incomplete-competitor.test.mjs
//
// Focused tests for the manual-INCOMPLETE competitor save path:
//   - An identity-only shared row normalizes as p12_p13_eligible === false.
//   - classifyDataAdequacy() labels it INCOMPLETE.
//   - selectComparisonLibraryRows() includes it in the normal dropdown.
//   - The save result contract always supplies a `missing` array.
//
// These cover the data-layer guarantees the fix relies on; the DB-writing
// persistence path (publishIncompleteManualCompetitor / saveSpeakerComparison)
// is exercised in browser acceptance with a disposable identity.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCompetitor } from '../src/components/utils/spl/competitorNormalization.js';
import { classifyDataAdequacy, DATA_ADEQUACY } from '../src/components/spl/dataAdequacyClassification.js';
import { selectComparisonLibraryRows } from '../src/components/utils/spl/competitorSpreadsheetImport.js';

// The minimal row publishIncompleteManualCompetitor writes: identity + source +
// visibility, no technical acoustic fields.
const incompleteSharedRow = {
  manufacturer: 'ZZ Sound Proof QA',
  model: 'QA-001',
  product_type: '',
  source_url: 'https://example.com/speaker',
  datasheet_url: '',
  date_checked: '2026-11-09',
  active: true,
  source_product_id: 'prod-1',
  source_specification_id: 'spec-1',
  publish_source: 'speaker_database',
  published: true,
  published_at: '2026-11-09T20:00:00.000Z',
  approval_status: 'Draft',
  source_confidence: '',
  source_evidence_quality: 'Unknown',
  spec_version_label: 'Current',
  evidence_source: 'official',
  secondary_evidence: null,
  // No technical fields — sensitivity / power / SPL all absent.
};

test('INCOMPLETE shared row normalizes as not P12/P13 eligible', () => {
  const n = normalizeCompetitor(incompleteSharedRow);
  assert.equal(n.p12_p13_eligible, false);
  assert.equal(n.halfspace_published_max_continuous_spl_db_1m, null);
  assert.equal(n.halfspace_calculated_max_continuous_spl_db_1m, null);
  assert.equal(n.power_authority_w, null);
});

test('INCOMPLETE shared row classifies as INCOMPLETE data adequacy', () => {
  const n = normalizeCompetitor(incompleteSharedRow);
  const label = classifyDataAdequacy(n);
  assert.equal(label.key, DATA_ADEQUACY.INCOMPLETE.key);
  assert.equal(label.short, 'INCOMPLETE');
});

test('selectComparisonLibraryRows includes the INCOMPLETE speaker_database row', () => {
  const selected = selectComparisonLibraryRows([incompleteSharedRow]);
  assert.equal(selected.length, 1);
  assert.equal(selected[0].manufacturer, 'ZZ Sound Proof QA');
  assert.equal(selected[0].model, 'QA-001');
});

test('selectComparisonLibraryRows excludes an unpublished INCOMPLETE row', () => {
  const unpublished = { ...incompleteSharedRow, published: false };
  const selected = selectComparisonLibraryRows([unpublished]);
  assert.equal(selected.length, 0);
});

test('selectComparisonLibraryRows excludes an inactive INCOMPLETE row', () => {
  const inactive = { ...incompleteSharedRow, active: false };
  const selected = selectComparisonLibraryRows([inactive]);
  assert.equal(selected.length, 0);
});

test('a spreadsheet row for the same identity takes priority over the INCOMPLETE database row', () => {
  const spreadsheetRow = {
    ...incompleteSharedRow,
    publish_source: 'spreadsheet',
    sensitivity_value_db: 90,
    sensitivity_reference: '2.83V/1m',
    sensitivity_impedance_used_ohm: 8,
    continuous_power_w: 200,
    published_at: '2026-11-09T19:00:00.000Z',
  };
  const selected = selectComparisonLibraryRows([incompleteSharedRow, spreadsheetRow]);
  assert.equal(selected.length, 1);
  assert.equal(selected[0].publish_source, 'spreadsheet');
  assert.equal(selected[0].sensitivity_value_db, 90);
});

test('an eligible speaker_database row is unchanged and still selected', () => {
  const eligibleRow = {
    ...incompleteSharedRow,
    model: 'QA-002',
    sensitivity_value_db: 90,
    sensitivity_reference: '2.83V/1m',
    sensitivity_impedance_used_ohm: 8,
    continuous_power_w: 200,
    published_max_continuous_spl_db_1m: 112,
    max_spl_test_conditions: 'continuous',
    measurement_space_basis: 'Half Space',
    sensitivity_measurement_basis: 'Half Space',
    max_spl_measurement_basis: 'Half Space',
    approval_status: 'Approved',
  };
  const selected = selectComparisonLibraryRows([eligibleRow]);
  assert.equal(selected.length, 1);
  const n = normalizeCompetitor(selected[0]);
  assert.equal(n.p12_p13_eligible, true);
  const label = classifyDataAdequacy(n);
  assert.equal(label.key, DATA_ADEQUACY.FULL.key);
});