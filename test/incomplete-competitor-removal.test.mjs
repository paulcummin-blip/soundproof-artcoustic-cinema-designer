// incomplete-competitor-removal.test.mjs
//
// Focused tests for the extended permanent-removal lifecycle:
//   - Manual INCOMPLETE row is found during preflight.
//   - Referenced shared row blocks deletion safely (archive).
//   - Unreferenced shared row is removed before canonical product.
//   - Draft spec/product cleanup still works.
//   - Manufacturer with no remaining references is removed.
//   - Manufacturer with other products is preserved.
//   - Eligible/published removal behaviour is unchanged.
//   - Dangling INCOMPLETE row can be safely cleaned up.
//   - After removal, the row is absent from the comparison selection.
//
// Uses an in-memory mock for base44.entities so no real API calls are made.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./_alias-loader.mjs', import.meta.url);

const { base44 } = await import('@/api/base44Client');
const lifecycle = await import('@/components/admin/speaker-db/speakerProductLifecycle');
const removal = await import('@/components/admin/speaker-library/removeSpeakerFromLibrary');
const { selectComparisonLibraryRows } = await import('@/components/utils/spl/competitorSpreadsheetImport');

// ---------------------------------------------------------------------------
// In-memory mock store
// ---------------------------------------------------------------------------

function matchQuery(record, query) {
  for (const [key, value] of Object.entries(query || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if ('$in' in value) { if (!value.$in.includes(record[key])) return false; }
    } else {
      if (record[key] !== value) return false;
    }
  }
  return true;
}

function createEntityMock(records) {
  return {
    filter: async (query) => ({ items: records.filter((r) => matchQuery(r, query)) }),
    list: async () => records.slice(),
    get: async (id) => {
      const r = records.find((r) => r.id === id);
      if (!r) throw new Error('Not found');
      return r;
    },
    delete: async (id) => {
      const idx = records.findIndex((r) => r.id === id);
      if (idx >= 0) records.splice(idx, 1);
    },
    update: async (id, data) => {
      const r = records.find((r) => r.id === id);
      if (r) Object.assign(r, data);
    },
    create: async (data) => {
      const r = { id: 'gen-' + records.length + '-' + Math.random().toString(36).slice(2, 8), ...data };
      records.push(r);
      return r;
    },
    deleteMany: async (query) => {
      const toDelete = records.filter((r) => matchQuery(r, query));
      for (const r of toDelete) {
        const idx = records.indexOf(r);
        if (idx >= 0) records.splice(idx, 1);
      }
    },
  };
}

function setupMock(store) {
  base44.entities = {
    CompetitorSpeaker: createEntityMock(store.competitorSpeakers),
    SpeakerProduct: createEntityMock(store.products),
    SpeakerSpecification: createEntityMock(store.specs),
    SpeakerManufacturer: createEntityMock(store.manufacturers),
    SpeakerChangeHistory: { create: async () => ({ id: 'ch' }) },
    SpeakerDataQuality: { deleteMany: async () => ({}) },
    SpeakerSource: { deleteMany: async () => ({}) },
    SpeakerDocument: { deleteMany: async () => ({}) },
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const INCOMPLETE_ROW = {
  id: 'comp-1',
  manufacturer: 'ZZ QA Temp',
  model: 'No Specs 1',
  source_product_id: 'prod-1',
  source_specification_id: 'spec-1',
  publish_source: 'speaker_database',
  published: true,
  active: true,
  approval_status: 'Draft',
  evidence_source: 'official',
};

const DRAFT_PRODUCT = {
  id: 'prod-1',
  manufacturer_id: 'mfr-1',
  manufacturer_name: 'ZZ QA Temp',
  model: 'No Specs 1',
  status: 'Unknown',
  current_specification_id: 'spec-1',
};

const DRAFT_SPEC = {
  id: 'spec-1',
  product_id: 'prod-1',
  approval_status: 'Draft',
  is_current: true,
  version_label: 'Current',
};

const MANUFACTURER = { id: 'mfr-1', name: 'ZZ QA Temp', status: 'Active' };

function freshStore() {
  return {
    competitorSpeakers: [{ ...INCOMPLETE_ROW }],
    products: [{ ...DRAFT_PRODUCT }],
    specs: [{ ...DRAFT_SPEC }],
    manufacturers: [{ ...MANUFACTURER }],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('1. Manual INCOMPLETE row is found during preflight', async () => {
  const store = freshStore();
  setupMock(store);
  const rows = await lifecycle.loadLinkedCompetitorRows({
    product: { id: 'prod-1' },
    specs: [{ id: 'spec-1' }],
    identity: { manufacturer: 'ZZ QA Temp', model: 'No Specs 1' },
  });
  assert.ok(rows.some((r) => r.id === 'comp-1'), 'INCOMPLETE row found by source_product_id');
});

test('2. Referenced shared row with technical values blocks deletion (archive)', () => {
  const linkedRow = { ...INCOMPLETE_ROW, sensitivity_value_db: 90, active: true };
  const assessment = lifecycle.assessRemoval(DRAFT_PRODUCT, [DRAFT_SPEC], [linkedRow]);
  assert.equal(assessment.mode, 'archive');
});

test('3. Unreferenced INCOMPLETE shared row is removed before canonical product', async () => {
  const store = freshStore();
  setupMock(store);
  const linked = await lifecycle.loadLinkedCompetitorRows({
    product: { id: 'prod-1' },
    specs: [DRAFT_SPEC],
    identity: { manufacturer: 'ZZ QA Temp', model: 'No Specs 1' },
  });
  const result = await lifecycle.deleteProduct({ product: DRAFT_PRODUCT, specs: [DRAFT_SPEC], actorName: 'Tester', linkedCompetitorRows: linked });
  assert.ok(result.deletedCompetitorIds.includes('comp-1'), 'shared row deleted');
  assert.equal(store.competitorSpeakers.length, 0, 'no competitor row remains');
});

test('4. Draft spec and product cleanup still works', async () => {
  const store = freshStore();
  setupMock(store);
  await lifecycle.deleteProduct({ product: DRAFT_PRODUCT, specs: [DRAFT_SPEC], actorName: 'Tester', linkedCompetitorRows: [INCOMPLETE_ROW] });
  assert.equal(store.specs.length, 0, 'spec deleted');
  assert.equal(store.products.length, 0, 'product deleted');
});

test('5. Manufacturer with no remaining references is removed', async () => {
  const store = freshStore();
  setupMock(store);
  // After product deletion, manufacturer has no products or competitor rows.
  store.products.length = 0;
  store.competitorSpeakers.length = 0;
  const result = await lifecycle.deleteManufacturerIfSafe({ manufacturerId: 'mfr-1', manufacturerName: 'ZZ QA Temp' });
  assert.equal(result.deleted, true);
  assert.equal(store.manufacturers.length, 0);
});

test('6. Manufacturer with other products is preserved', async () => {
  const store = freshStore();
  setupMock(store);
  store.products = [{ ...DRAFT_PRODUCT, id: 'prod-2', model: 'Other' }];
  const result = await lifecycle.deleteManufacturerIfSafe({ manufacturerId: 'mfr-1', manufacturerName: 'ZZ QA Temp' });
  assert.equal(result.deleted, false);
  assert.ok(result.reason.includes('products'), 'reason mentions products');
  assert.equal(store.manufacturers.length, 1);
});

test('7. Eligible/published competitor removal is unchanged (archive)', () => {
  const publishedSpec = { ...DRAFT_SPEC, approval_status: 'Approved', rp22_published_competitor_id: 'comp-1' };
  const assessment = lifecycle.assessRemoval(DRAFT_PRODUCT, [publishedSpec], [INCOMPLETE_ROW]);
  assert.equal(assessment.mode, 'archive');
  assert.equal(assessment.actionLabel, 'Archive product');
});

test('8. Existing reference-aware blocker (approved spec) remains intact', () => {
  const approvedSpec = { ...DRAFT_SPEC, approval_status: 'Approved' };
  const assessment = lifecycle.assessRemoval(DRAFT_PRODUCT, [approvedSpec], []);
  assert.equal(assessment.mode, 'archive');
});

test('9. Dangling INCOMPLETE row can be safely cleaned up', async () => {
  const store = {
    competitorSpeakers: [{ ...INCOMPLETE_ROW }],
    products: [], // product already deleted
    specs: [],
    manufacturers: [{ ...MANUFACTURER }],
  };
  setupMock(store);
  const assessment = await lifecycle.assessDanglingRowRemoval({ rowId: 'comp-1' });
  assert.equal(assessment.mode, 'delete_dangling');

  const result = await removal.removeSpeakerFromLibrary({ row: { rowId: 'comp-1' }, actorName: 'Tester' });
  assert.equal(result.mode, 'delete_dangling');
  assert.equal(result.deleted, true);
  assert.equal(store.competitorSpeakers.length, 0, 'row deleted');
  assert.equal(store.manufacturers.length, 0, 'manufacturer cleaned up');
});

test('10. After removal, the row is absent from the comparison selection', async () => {
  const store = freshStore();
  setupMock(store);
  await lifecycle.deleteProduct({ product: DRAFT_PRODUCT, specs: [DRAFT_SPEC], actorName: 'Tester', linkedCompetitorRows: [INCOMPLETE_ROW] });
  const selected = selectComparisonLibraryRows(store.competitorSpeakers);
  assert.equal(selected.length, 0, 'no candidate remains');
});

test('11. Dangling row whose product still exists redirects to product path', async () => {
  const store = freshStore();
  setupMock(store);
  const assessment = await lifecycle.assessDanglingRowRemoval({ rowId: 'comp-1' });
  assert.equal(assessment.redirectProductId, 'prod-1');
});

test('Spreadsheet dangling row is retired, not deleted', async () => {
  const store = {
    competitorSpeakers: [{ ...INCOMPLETE_ROW, publish_source: 'spreadsheet', sensitivity_value_db: 90 }],
    products: [],
    specs: [],
    manufacturers: [{ ...MANUFACTURER }],
  };
  setupMock(store);
  const assessment = await lifecycle.assessDanglingRowRemoval({ rowId: 'comp-1' });
  assert.equal(assessment.mode, 'retire');
});

test('Unreferenced draft product assesses as delete mode', () => {
  const assessment = lifecycle.assessRemoval(DRAFT_PRODUCT, [DRAFT_SPEC], [INCOMPLETE_ROW]);
  assert.equal(assessment.mode, 'delete');
  assert.equal(assessment.actionLabel, 'Delete permanently');
});