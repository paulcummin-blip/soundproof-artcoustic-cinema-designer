import test from 'node:test';
import assert from 'node:assert/strict';
import { artcousticSpeakers } from '../src/components/data/speakerData.jsx';
import { MODELS } from '../src/components/models/speakers/registry.jsx';
import {
  buildProductRoleOptions,
  defaultProductRolesForEngineeringKey,
  getProductTechnicalStatus,
  productSelectorKey,
  PRODUCT_ENGINEERING_OPTIONS,
  PRODUCT_ROLES,
} from '../src/components/products/productMaster.js';

const EXPECTED = {
  'evolve-2-1': { low: 90, high: 40000, lf: 87, h: 70, v: 90, ohms: 4, sensitivity: 97, power: 60, continuous: 108, peak: 114 },
  'evolve-3-1': { low: 80, high: 40000, lf: 77, h: 90, v: 90, ohms: 3, sensitivity: 97, power: 90, continuous: 110, peak: 116 },
  'evolve-4-2': { low: 85, high: 40000, lf: 82, h: 90, v: 58, ohms: 4, sensitivity: 96, power: 120, continuous: 113, peak: 119 },
  'evolve-6-3': { low: 90, high: 40000, lf: 87, h: 90, v: 54, ohms: 4, sensitivity: 100, power: 180, continuous: 118, peak: 124 },
  'evolve-8-4': { low: 95, high: 30000, lf: 92, h: 90, v: 50, ohms: 3, sensitivity: 102, power: 240, continuous: 120, peak: 126 },
  'architect-2-1': { low: 80, high: 40000, lf: 77, h: 70, v: 90, ohms: 4, sensitivity: 97, power: 60, continuous: 108, peak: 114 },
  'architect-mikro': { low: 300, high: 20000, lf: 297, h: 90, v: 90, ohms: 8, sensitivity: 86, power: 15, continuous: 102, peak: 108 },
  mikro: { low: 300, high: 20000, lf: 297, h: 90, v: 90, ohms: 8, sensitivity: 86, power: 15, continuous: 102, peak: 108 },
};

test('supplied speaker specifications are present in canonical engineering authority', () => {
  for (const [key, expected] of Object.entries(EXPECTED)) {
    const model = MODELS.find((candidate) => candidate.key === key);
    assert.ok(model, `${key} engineering record must exist`);
    assert.equal(model.frequency_response_low, expected.low, `${key} frequency low`);
    assert.equal(model.frequency_response_high, expected.high, `${key} frequency high`);
    assert.equal(model.usable_lf_hz_minus6db, expected.lf, `${key} usable LF`);
    assert.deepEqual(model.coverage_deg, { horizontal: expected.h, vertical: expected.v }, `${key} coverage`);
    assert.equal(model.nominalOhms, expected.ohms, `${key} impedance`);
    assert.equal(model.sensitivity_dB_1w1m, expected.sensitivity, `${key} 1 W sensitivity`);
    assert.equal(model.max_power, expected.power, `${key} power handling`);
    assert.equal(model.max_spl_cont_db_1m_halfspace, expected.continuous, `${key} continuous SPL`);
    assert.equal(model.max_spl_peak_db_cf6_1m_halfspace, expected.peak, `${key} peak SPL`);
  }
});

test('Mikro and Mikro Ci remain separate physical products with the same supplied acoustic ratings', () => {
  const mikroCi = MODELS.find((model) => model.key === 'architect-mikro');
  const mikro = MODELS.find((model) => model.key === 'mikro');
  assert.deepEqual(
    { widthMm: mikroCi.widthMm, depthMm: mikroCi.depthMm, heightMm: mikroCi.heightMm, category: mikroCi.category },
    { widthMm: 54, depthMm: 138, heightMm: 26, category: 'ARCHITECT' }
  );
  assert.deepEqual(
    { widthMm: mikro.widthMm, depthMm: mikro.depthMm, heightMm: mikro.heightMm, category: mikro.category },
    { widthMm: 120, depthMm: 80, heightMm: 120, category: 'SURROUNDS' }
  );

  const staticCi = artcousticSpeakers.find((speaker) => speaker.canonicalProductId === 'architect-mikro');
  const staticMikro = artcousticSpeakers.find((speaker) => speaker.canonicalProductId === 'mikro');
  assert.equal(staticCi?.model, 'Mikro Ci');
  assert.equal(staticMikro?.model, 'Mikro');
  assert.notDeepEqual(
    [staticCi?.widthM, staticCi?.depthM, staticCi?.heightM],
    [staticMikro?.widthM, staticMikro?.depthM, staticMikro?.heightM]
  );
});

test('Product Master exposes verified engineering links and keeps application selection authoritative', () => {
  const availableKeys = PRODUCT_ENGINEERING_OPTIONS.map((option) => option.value);
  assert.ok(availableKeys.includes('architect-mikro'));
  assert.ok(availableKeys.includes('mikro'));

  const unassigned = {
    sku: 'mikro',
    label: 'MIKRO',
    category: 'Loudspeaker',
    active: true,
    engineering_key: 'mikro',
    roles: [],
    selector_order: 99,
  };
  assert.equal(getProductTechnicalStatus(unassigned).status, 'Complete');
  assert.equal(buildProductRoleOptions([unassigned], PRODUCT_ROLES.SURROUND).length, 0);

  const assigned = { ...unassigned, roles: [PRODUCT_ROLES.SURROUND] };
  const surroundOptions = buildProductRoleOptions([assigned], PRODUCT_ROLES.SURROUND);
  assert.equal(surroundOptions.length, 1);
  assert.equal(surroundOptions[0].key, 'mikro');
  assert.equal(surroundOptions[0].label, 'MIKRO');

  assert.deepEqual(defaultProductRolesForEngineeringKey('mikro'), [
    PRODUCT_ROLES.SURROUND,
    PRODUCT_ROLES.REAR_SURROUND,
    PRODUCT_ROLES.FRONT_WIDE,
  ]);
});

test('a commercial SKU may use an existing engineering model in the application selected by admin', () => {
  const product = {
    sku: 'dealer-evolve-2-1-black',
    label: 'EVOLVE 2-1 Black',
    category: 'Loudspeaker',
    active: true,
    engineering_key: 'evolve-2-1',
    roles: [PRODUCT_ROLES.SURROUND],
    selector_order: 100,
  };

  assert.equal(productSelectorKey(product, PRODUCT_ROLES.SURROUND), 'evolve-2-1_s');
  const options = buildProductRoleOptions([product], PRODUCT_ROLES.SURROUND);
  assert.equal(options.length, 1);
  assert.equal(options[0].key, 'evolve-2-1_s');
  assert.equal(options[0].product_sku, 'dealer-evolve-2-1-black');
});
