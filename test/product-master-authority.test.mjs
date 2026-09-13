import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MODELS, getModelsByCategoryOrdered } from '../src/components/models/speakers/registry.jsx';
import {
  buildProductRoleOptions,
  effectiveProductRoles,
  getProductTechnicalStatus,
  PRODUCT_ROLES,
} from '../src/components/products/productMaster.js';

function legacyProduct(model, index) {
  return {
    id: `legacy-${model.key}`,
    sku: model.key,
    label: model.label,
    category: model.category === 'SUBWOOFERS' ? 'Subwoofer' : 'Loudspeaker',
    active: true,
    selector_order: index,
  };
}

const visibleRegistry = getModelsByCategoryOrdered();
const legacyProducts = MODELS.filter((model) => !model.hiddenFromSelector).map(legacyProduct);

test('legacy migration mapping preserves every current selector key and order', () => {
  const expectedLcr = visibleRegistry.LCR.filter((model) => !model.frontStageType).map((model) => model.key);
  const expectedSoundbars = visibleRegistry.LCR.filter((model) => Boolean(model.frontStageType)).map((model) => model.key);
  const expectedSurrounds = visibleRegistry.SURROUNDS.map((model) => model.key);
  const expectedOverheads = visibleRegistry.ARCHITECT.map((model) => model.key);
  const expectedSubs = visibleRegistry.SUBWOOFERS.map((model) => model.key);

  assert.deepEqual(buildProductRoleOptions(legacyProducts, PRODUCT_ROLES.LCR).map((model) => model.key), expectedLcr);
  assert.deepEqual(buildProductRoleOptions(legacyProducts, PRODUCT_ROLES.CENTRE_SOUNDBAR).map((model) => model.key), expectedSoundbars);
  assert.deepEqual(buildProductRoleOptions(legacyProducts, PRODUCT_ROLES.SURROUND).map((model) => model.key), expectedSurrounds);
  assert.deepEqual(buildProductRoleOptions(legacyProducts, PRODUCT_ROLES.REAR_SURROUND).map((model) => model.key), expectedSurrounds);
  assert.deepEqual(buildProductRoleOptions(legacyProducts, PRODUCT_ROLES.FRONT_WIDE).map((model) => model.key), expectedSurrounds);
  assert.deepEqual(buildProductRoleOptions(legacyProducts, PRODUCT_ROLES.OVERHEAD).map((model) => model.key), expectedOverheads);
  assert.deepEqual(buildProductRoleOptions(legacyProducts, PRODUCT_ROLES.SUBWOOFER).map((model) => model.key), expectedSubs);
});

test('explicit roles and active state control new-design availability atomically', () => {
  const product = {
    sku: 'q4-3',
    label: 'Q4-3 Product Master Name',
    category: 'Loudspeaker',
    active: true,
    roles: [PRODUCT_ROLES.LCR],
    selector_order: 0,
  };

  const active = buildProductRoleOptions([product], PRODUCT_ROLES.LCR);
  assert.equal(active.length, 1);
  assert.match(active[0].label, /Q4-3 Product Master Name/);
  assert.equal(buildProductRoleOptions([{ ...product, active: false }], PRODUCT_ROLES.LCR).length, 0);
  assert.equal(buildProductRoleOptions([{ ...product, roles: [] }], PRODUCT_ROLES.LCR).length, 0);
  assert.deepEqual(effectiveProductRoles({ ...product, roles: [] }), []);
});

test('unknown acoustic product is visible to admin but cannot enter calculation selectors', () => {
  const product = {
    sku: 'future-speaker',
    label: 'Future Speaker',
    category: 'Loudspeaker',
    active: true,
    roles: [PRODUCT_ROLES.LCR],
  };
  const technical = getProductTechnicalStatus(product);
  assert.equal(technical.status, 'Missing');
  assert.equal(technical.calculable, false);
  assert.equal(buildProductRoleOptions([product], PRODUCT_ROLES.LCR).length, 0);
});

test('admin writes are protected and live pricing has no static engineering fallback', async () => {
  const [entity, splPage, speakerDb, app] = await Promise.all([
    readFile(new URL('../base44/entities/ProductPrice.jsonc', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/SPLCalculator.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/SpeakerDatabase.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
  ]);

  for (const operation of ['create', 'update', 'delete']) {
    assert.match(entity, new RegExp(`"${operation}"[\\s\\S]*?"role": "admin"`));
  }
  assert.doesNotMatch(splPage, /retailPriceGBP\s*\?\?|price_gbp_exVat\s*;/);
  assert.doesNotMatch(speakerDb, /speaker\.price/);
  assert.doesNotMatch(speakerDb, /AdminPriceEdit/);
  assert.match(app, /\/admin\/product-prices"[\s\S]*?<Navigate to="\/PriceList"/);
});
