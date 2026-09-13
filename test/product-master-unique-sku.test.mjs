import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [priceList, saveAuthority] = await Promise.all([
  readFile(new URL('../src/pages/PriceList.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../base44/functions/saveProductMaster/entry.ts', import.meta.url), 'utf8'),
]);

test('Product Master saves pass through the admin server authority', () => {
  assert.match(priceList, /functions\.invoke\('saveProductMaster'/);
  assert.doesNotMatch(priceList, /ProductPrice\.(?:create|update)\(payload/);
  assert.match(saveAuthority, /if \(user\.role !== 'admin'\)[\s\S]*?status: 403/);
});

test('server authority normalizes and rejects duplicate commercial SKUs', () => {
  assert.match(saveAuthority, /trim\(\)\.toLowerCase\(\)/);
  assert.match(saveAuthority, /record\.id !== productId/);
  assert.match(saveAuthority, /code: 'DUPLICATE_SKU'/);
  assert.match(saveAuthority, /status: 409/);
});

test('server authority keeps engineering linkage separate from commercial identity', () => {
  assert.match(saveAuthority, /engineering_key: engineeringKey/);
  assert.match(saveAuthority, /ProductPrice\.update\(productId, payload\)/);
  assert.match(saveAuthority, /ProductPrice\.create\(payload\)/);
  assert.doesNotMatch(saveAuthority, /Speaker\.update|Engineering|MODELS/);
});
