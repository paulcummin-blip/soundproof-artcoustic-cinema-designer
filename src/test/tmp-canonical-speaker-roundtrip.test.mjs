// tmp-canonical-speaker-roundtrip.test.mjs
// ---------------------------------------------------------------------------
// TEMPORARY VERIFICATION — the canonical Speaker Database export / import.
//
// The three behaviours that must never regress are asserted here directly:
//   • an untouched export re-imports as ZERO changes (a blank cell means
//     "leave the existing value unchanged");
//   • a value is only ever cleared when the cell says [CLEAR];
//   • a stable ID identifies exactly one record, and an unknown ID is an error
//     rather than a name match.
//
// Read-only: nothing here writes, and no engineering value is calculated.
import { test, expect } from 'vitest';
import { COLUMNS, EDITABLE_COLUMNS, CLEAR_TOKEN } from '@/components/admin/speaker-db/canonical/canonicalSchema.js';
import { planCanonicalImport, ENTRY_KINDS } from '@/components/admin/speaker-db/canonical/planCanonicalImport.js';

const manufacturer = { id: 'mfr-1', name: 'M&K Sound' };
const product = {
  id: 'prd-1',
  manufacturer_id: 'mfr-1',
  manufacturer_name: 'M&K Sound',
  model: 'IW5',
  category: 'In Wall',
  role: 'LCR',
  status: 'Current',
  current_specification_id: 'spec-1',
  official_product_url: 'https://mksound.com/iw5',
};
const specification = {
  id: 'spec-1',
  product_id: 'prd-1',
  is_current: true,
  approval_status: 'Approved',
  version_label: '2026',
  sensitivity_db: 90,
  sensitivity_basis: '1W/1m',
  nominal_impedance_ohm: 4,
  power_handling_continuous_w: 200,
  max_continuous_spl_db: 102,
  measurement_space: 'half-space',
  confidence: 'A',
  evidence_quality: 'Manufacturer Published',
  notes: 'From the 2026 datasheet',
  datasheet_url: 'https://mksound.com/iw5.pdf',
  rp22_published_competitor_id: 'cmp-1',
};

const data = { manufacturers: [manufacturer], products: [product], specifications: [specification] };

// The cell mapping the exporter uses for an untouched workbook: editable columns
// carry the stored value, read-only columns carry the stable identity.
function exportCells(context) {
  const cells = {};
  for (const column of COLUMNS) {
    if (column.key === 'manufacturer_id') { cells[column.key] = context.manufacturer.id; continue; }
    if (column.key === 'product_id') { cells[column.key] = context.product.id; continue; }
    if (column.key === 'specification_id') { cells[column.key] = context.specification.id; continue; }
    if (column.key === 'is_current_specification') { cells[column.key] = 'TRUE'; continue; }
    if (!column.editable) { cells[column.key] = null; continue; }
    const target = column.target === 'manufacturer'
      ? context.manufacturer
      : column.target === 'product' ? context.product : context.specification;
    cells[column.key] = target[column.field] ?? null;
  }
  return { rowNumber: 2, cells };
}

const planFor = (cells) => planCanonicalImport({ rows: [cells], data });

test('an untouched export re-imports as zero changes', () => {
  const plan = planFor(exportCells({ manufacturer, product, specification }));
  expect(plan.counts.errors).toBe(0);
  expect(plan.counts.newProducts).toBe(0);
  expect(plan.counts.updatedProducts).toBe(0);
  expect(plan.counts.newSpecifications).toBe(0);
  expect(plan.counts.unchanged).toBe(1);
  expect(plan.nothingToApply).toBe(true);
  expect(plan.notInWorkbook).toBe(0);
});

test('a blank cell never clears a stored value', () => {
  const cells = exportCells({ manufacturer, product, specification });
  cells.cells.sensitivity_db = null;
  cells.cells.evidence_notes = '';
  const plan = planFor(cells);
  expect(plan.counts.unchanged).toBe(1);
  expect(plan.counts.updatedProducts).toBe(0);
  expect(plan.counts.errors).toBe(0);
});

test('the explicit clear token removes a value and reports it', () => {
  const cells = exportCells({ manufacturer, product, specification });
  cells.cells.evidence_notes = CLEAR_TOKEN;
  const plan = planFor(cells);
  const entry = plan.entries[0];
  expect(plan.counts.errors).toBe(0);
  expect(entry.kind).toBe(ENTRY_KINDS.newSpecification);
  const cleared = entry.specChanges.find((change) => change.key === 'evidence_notes');
  expect(cleared.action).toBe('clear');
  expect(entry.proposedSpec.notes).toBe(null);
});

test('a changed field on an approved specification creates a new version', () => {
  const cells = exportCells({ manufacturer, product, specification });
  cells.cells.published_continuous_spl_db_1m = 104;
  const plan = planFor(cells);
  const entry = plan.entries[0];
  expect(plan.counts.newSpecifications).toBe(1);
  expect(entry.kind).toBe(ENTRY_KINDS.newSpecification);
  expect(entry.previousSpecificationId).toBe('spec-1');
  expect(entry.proposedSpec.max_continuous_spl_db).toBe(104);
  expect(entry.before.specification.max_continuous_spl_db).toBe(102);
  expect(plan.warnings.some((warning) => /new version/.test(warning.message))).toBe(true);
});

test('a draft specification is updated in place instead of versioned', () => {
  const draftSpecification = { ...specification, approval_status: 'Draft', rp22_published_competitor_id: null };
  const draftData = { ...data, specifications: [draftSpecification] };
  const cells = exportCells({ manufacturer, product, specification: draftSpecification });
  cells.cells.sensitivity_db = 91;
  const plan = planCanonicalImport({ rows: [cells], data: draftData });
  expect(plan.entries[0].kind).toBe(ENTRY_KINDS.updateSpecification);
  expect(plan.counts.newSpecifications).toBe(0);
});

test('a new manufacturer and its product are proposed as new, never matched by name', () => {
  const cells = { rowNumber: 3, cells: { manufacturer: 'Perlisten', model: 'S4i', sensitivity_db: 88 } };
  const plan = planCanonicalImport({ rows: [cells], data });
  expect(plan.counts.newManufacturers).toBe(1);
  expect(plan.counts.newProducts).toBe(1);
  expect(plan.entries[0].kind).toBe(ENTRY_KINDS.newProduct);
  expect(plan.entries[0].createsProduct).toBe(true);
  expect(plan.entries[0].createsManufacturer).toBe(true);
  expect(plan.entries[0].manufacturerRename).toBe(null);
  expect(plan.entries[0].proposedSpec.sensitivity_db).toBe(88);
});

test('a second product under the same new manufacturer is counted once', () => {
  const cells = [
    { rowNumber: 3, cells: { manufacturer: 'Perlisten', model: 'S4i' } },
    { rowNumber: 4, cells: { manufacturer: 'Perlisten', model: 'S5m' } },
  ];
  const plan = planCanonicalImport({ rows: cells, data });
  expect(plan.counts.newManufacturers).toBe(1);
  expect(plan.counts.newProducts).toBe(2);
  expect(plan.counts.errors).toBe(0);
});

test('an unknown stable ID is an error, not a name match', () => {
  const cells = { rowNumber: 4, cells: { product_id: 'does-not-exist', manufacturer: 'M&K Sound', model: 'IW5', sensitivity_db: 91 } };
  const plan = planCanonicalImport({ rows: [cells], data });
  expect(plan.counts.errors).toBe(1);
  expect(plan.canApply).toBe(false);
  expect(plan.errors[0].message).toMatch('does-not-exist');
});

test('a name match is allowed but reported as a warning', () => {
  const cells = { rowNumber: 5, cells: { manufacturer: 'MK Sound', model: 'IW-5', sensitivity_db: 90 } };
  const plan = planCanonicalImport({ rows: [cells], data });
  expect(plan.counts.unchanged).toBe(1);
  expect(plan.warnings.some((warning) => /matched on manufacturer and model/.test(warning.message))).toBe(true);
});

test('a value outside a select list is an error', () => {
  const cells = exportCells({ manufacturer, product, specification });
  cells.cells.measurement_space = 'inside-out';
  const plan = planFor(cells);
  expect(plan.counts.errors).toBe(1);
  expect(EDITABLE_COLUMNS.some((column) => column.key === 'measurement_space')).toBe(true);
});

test('a product absent from the workbook is left alone', () => {
  const secondProduct = { ...product, id: 'prd-2', model: 'IW3', current_specification_id: 'spec-2' };
  const secondSpec = { ...specification, id: 'spec-2', product_id: 'prd-2' };
  const wideData = {
    manufacturers: [manufacturer],
    products: [product, secondProduct],
    specifications: [specification, secondSpec],
  };
  const plan = planCanonicalImport({ rows: [exportCells({ manufacturer, product, specification })], data: wideData });
  expect(plan.counts.unchanged).toBe(1);
  expect(plan.notInWorkbook).toBe(1);
});