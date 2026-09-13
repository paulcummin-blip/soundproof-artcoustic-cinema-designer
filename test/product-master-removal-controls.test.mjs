import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildProductRoleOptions,
  PRODUCT_ROLES,
} from '../src/components/products/productMaster.js';

const [dangerZone, lifecycle, priceList, entitySchema] = await Promise.all([
  readFile(new URL('../src/components/products/ProductDangerZone.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../base44/functions/manageProductLifecycle/entry.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/PriceList.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../base44/entities/ProductPrice.jsonc', import.meta.url), 'utf8'),
]);

test('admin can deactivate a Product Master record without deleting it', () => {
  assert.match(dangerZone, />Deactivate Product</);
  assert.match(dangerZone, /execute\('deactivate'\)/);
  assert.match(
    lifecycle,
    /action === 'deactivate'[\s\S]*?ProductPrice\.update\(productId, \{ active: false \}\)/
  );
  assert.doesNotMatch(lifecycle, /check_references|scanProjectReferences|reference_count/);
});

test('inactive products disappear from every new-design selector', () => {
  const product = {
    id: 'test-product',
    sku: 'evolve-2-1',
    label: 'EVOLVE 2-1',
    category: 'Loudspeaker',
    engineering_key: 'evolve-2-1',
    active: true,
    roles: [PRODUCT_ROLES.LCR, PRODUCT_ROLES.SURROUND],
  };

  assert.equal(buildProductRoleOptions([product], PRODUCT_ROLES.LCR).length, 1);
  assert.equal(buildProductRoleOptions([product], PRODUCT_ROLES.SURROUND).length, 1);
  assert.equal(buildProductRoleOptions([{ ...product, active: false }], PRODUCT_ROLES.LCR).length, 0);
  assert.equal(buildProductRoleOptions([{ ...product, active: false }], PRODUCT_ROLES.SURROUND).length, 0);
  assert.match(priceList, /showInactive \|\| item\.active !== false/);
});

test('admin can permanently delete the commercial product after explicit confirmation', () => {
  assert.match(dangerZone, />Delete Product</);
  assert.match(dangerZone, /Delete this product permanently\?/);
  assert.match(dangerZone, /product\.label \|\| 'Unnamed product'/);
  assert.match(dangerZone, /product\.sku \|\| '—'/);
  assert.match(dangerZone, /formatPrice\(product\.price_ex_vat\)/);
  assert.match(dangerZone, /execute\('delete'\)/);
  assert.match(lifecycle, /ProductPrice\.delete\(productId\)/);
  assert.match(dangerZone, /response\?\.data\?\.success !== true[\s\S]*?await onDone\?\.\(\)/);
  assert.match(priceList, /onDone=\{async \(\) => \{ await onSaved\(\); onClose\(\); \}\}/);
});

test('delete is admin-only in the UI and at both data mutation boundaries', () => {
  const entity = JSON.parse(entitySchema);

  assert.match(priceList, /master\.canEdit && editorProduct !== undefined/);
  assert.deepEqual(entity.rls.update, { user_condition: { role: 'admin' } });
  assert.deepEqual(entity.rls.delete, { user_condition: { role: 'admin' } });
  assert.match(lifecycle, /if \(user\.role !== 'admin'\)[\s\S]*?status: 403/);
});

test('commercial deletion never cascades into linked engineering authority', () => {
  assert.match(dangerZone, /Linked engineering registry data is left unchanged/);
  assert.match(dangerZone, /linked engineering registry record will not be deleted/i);
  assert.doesNotMatch(lifecycle, /MODELS|registry\.jsx|engineering_key|Speaker\.delete|Engineering/);
});
