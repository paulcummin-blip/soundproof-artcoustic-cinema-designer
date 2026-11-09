import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyDataAdequacy, DATA_ADEQUACY } from '../src/components/spl/dataAdequacyClassification.js';

test('INCOMPLETE when not eligible (no specs / brand+model only)', () => {
  assert.equal(classifyDataAdequacy(null).key, 'INCOMPLETE');
  assert.equal(classifyDataAdequacy({ p12_p13_eligible: false }).key, 'INCOMPLETE');
  assert.equal(classifyDataAdequacy({}).key, 'INCOMPLETE');
});

test('FULL: published measured SPL, confirmed space, confirmed sensitivity basis', () => {
  const r = {
    p12_p13_eligible: true,
    halfspace_published_max_continuous_spl_db_1m: 112,
    sensitivity_space_provenance: 'half_space_published',
    max_spl_space_provenance: 'half_space_published',
    sensitivity_reference: '2.83V/1m',
  };
  assert.equal(classifyDataAdequacy(r).key, 'FULL');
});

test('GOOD: calculated SPL (not published) needs a normalisation', () => {
  const r = {
    p12_p13_eligible: true,
    halfspace_published_max_continuous_spl_db_1m: null,
    halfspace_calculated_max_continuous_spl_db_1m: 110,
    sensitivity_space_provenance: 'half_space_published',
    max_spl_space_provenance: 'half_space_published',
    sensitivity_reference: '2.83V/1m',
  };
  assert.equal(classifyDataAdequacy(r).key, 'GOOD');
});

test('GOOD: published SPL but assumed half-space needs an assumption', () => {
  const r = {
    p12_p13_eligible: true,
    halfspace_published_max_continuous_spl_db_1m: 112,
    sensitivity_space_provenance: 'half_space_assumed',
    max_spl_space_provenance: 'half_space_published',
    sensitivity_reference: '2.83V/1m',
  };
  assert.equal(classifyDataAdequacy(r).key, 'GOOD');
});

test('GOOD: published SPL but sensitivity basis unstated', () => {
  const r = {
    p12_p13_eligible: true,
    halfspace_published_max_continuous_spl_db_1m: 112,
    sensitivity_space_provenance: 'half_space_published',
    max_spl_space_provenance: 'half_space_published',
    sensitivity_reference: 'unknown',
  };
  assert.equal(classifyDataAdequacy(r).key, 'GOOD');
});

test('labels are the three admin-facing terms, never A/B/C/D', () => {
  const labels = Object.values(DATA_ADEQUACY).map((d) => d.label);
  assert.deepEqual(labels.sort(), ['FULL DATA', 'GOOD DATA', 'INCOMPLETE DATA']);
});