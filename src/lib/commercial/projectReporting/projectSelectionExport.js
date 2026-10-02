/**
 * projectSelectionExport.js
 * -------------------------
 * The product demand export for the Project Intelligence selection workflow.
 *
 * Four workbook tabs, built from the admin's inclusion and counted-version
 * selection:
 *   1. Included Projects — one row per included project
 *   2. Excluded Projects — one row per excluded project, with the reason
 *   3. Product Demand    — counted versions only, never every version
 *   4. Version Detail    — every version, marked counted or not
 *
 * The workbook and CSV strings are produced by projectReportingExport, so this
 * module returns sheet definitions only.
 *
 * Pure: no React, no DOM, no entity access.
 */

import { BUCKET_LABEL } from './statusBuckets';

export const SELECTION_WORKBOOK_TABS = [
  'Included Projects',
  'Excluded Projects',
  'Product Demand',
  'Version Detail',
];

/** The export filename, e.g. "Sound Proof Project Intelligence Product Demand - 2026-10-02". */
export function selectionExportFilename(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `Sound Proof Project Intelligence Product Demand - ${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const statusLabel = (family) => BUCKET_LABEL[family?.bucket] || family?.bucket || '';

const noteText = (family) => [
  family?.selection?.inclusionPill,
  family?.selection?.countBasisNote,
  ...(family?.warnings || []),
].filter(Boolean).join('; ');

/**
 * Build the four sheets from the resolved selection.
 *
 * @param {Object} selection — { families, productDemand, summary }
 * @returns {Array<{ name: string, columns: Array, rows: Array }>}
 */
export function buildSelectionSheets({ families = [], productDemand = [] } = {}) {
  const included = families.filter((family) => family.included);
  const excluded = families.filter((family) => !family.included);
  const currency = included.map((family) => family.countedCurrency).find(Boolean) || 'GBP';

  const includedColumns = [
    { key: 'name', label: 'Project', type: 'string' },
    { key: 'client', label: 'Client', type: 'string' },
    { key: 'reference', label: 'Reference', type: 'string' },
    { key: 'dealer', label: 'Dealer / account', type: 'string' },
    { key: 'status', label: 'Status', type: 'string' },
    { key: 'variationCount', label: 'Versions', type: 'number' },
    { key: 'countedVersion', label: 'Counted version', type: 'string' },
    { key: 'countBasis', label: 'Count basis', type: 'string' },
    { key: 'liveValue', label: `Live design value, counted version (${currency})`, type: 'currency' },
    { key: 'productLines', label: 'Product lines', type: 'number' },
    { key: 'updated', label: 'Last updated', type: 'string' },
    { key: 'notes', label: 'Notes / flags', type: 'string' },
  ];

  const excludedColumns = [
    { key: 'name', label: 'Project', type: 'string' },
    { key: 'client', label: 'Client', type: 'string' },
    { key: 'dealer', label: 'Dealer / account', type: 'string' },
    { key: 'status', label: 'Status', type: 'string' },
    { key: 'reason', label: 'Exclusion reason', type: 'string' },
    { key: 'updated', label: 'Last updated', type: 'string' },
  ];

  const demandColumns = [
    { key: 'product', label: 'Product / model', type: 'string' },
    { key: 'sku', label: 'SKU', type: 'string' },
    { key: 'category', label: 'Category', type: 'string' },
    { key: 'quantity', label: 'Quantity', type: 'number' },
    { key: 'projectFamilies', label: 'Included projects using it', type: 'number' },
    { key: 'liveValue', label: `Total live value (${currency})`, type: 'currency' },
    { key: 'derived', label: 'Derived line', type: 'string' },
    { key: 'priced', label: 'Priced', type: 'string' },
  ];

  const versionColumns = [
    { key: 'project', label: 'Project', type: 'string' },
    { key: 'account', label: 'Dealer / account', type: 'string' },
    { key: 'versionNumber', label: 'Version number', type: 'number' },
    { key: 'versionName', label: 'Version name', type: 'string' },
    { key: 'active', label: 'Active version', type: 'string' },
    { key: 'counted', label: 'Counted', type: 'string' },
    { key: 'countedNote', label: 'Counted status', type: 'string' },
    { key: 'liveValue', label: `Live design value (${currency})`, type: 'currency' },
    { key: 'productLines', label: 'Product lines', type: 'number' },
    { key: 'updated', label: 'Last updated', type: 'string' },
  ];

  return [
    {
      name: SELECTION_WORKBOOK_TABS[0],
      columns: includedColumns,
      rows: included.map((family) => ({
        name: family.name,
        client: family.client,
        reference: family.reference,
        dealer: family.dealerName || family.accountName,
        status: statusLabel(family),
        variationCount: family.variationCount,
        countedVersion: family.countedVersionName,
        countBasis: family.selection?.countBasisLabel || '',
        liveValue: family.countedLiveValue,
        productLines: family.countedLineCount,
        updated: family.updatedDate,
        notes: noteText(family),
      })),
    },
    {
      name: SELECTION_WORKBOOK_TABS[1],
      columns: excludedColumns,
      rows: excluded.map((family) => ({
        name: family.name,
        client: family.client,
        dealer: family.dealerName || family.accountName,
        status: statusLabel(family),
        reason: family.selection?.inclusionPill || 'Excluded',
        updated: family.updatedDate,
      })),
    },
    {
      name: SELECTION_WORKBOOK_TABS[2],
      columns: demandColumns,
      rows: productDemand.map((row) => ({
        product: row.product,
        sku: row.sku,
        category: row.category,
        quantity: row.quantity,
        projectFamilies: row.projectFamilies,
        liveValue: row.liveValue,
        derived: row.derived ? 'Yes' : 'No',
        priced: row.status,
      })),
    },
    {
      name: SELECTION_WORKBOOK_TABS[3],
      columns: versionColumns,
      rows: families.flatMap((family) => (family.variations || []).map((variation) => {
        const counted = family.included && variation.id === family.countedVariationId;
        return {
          project: family.name,
          account: family.dealerName || family.accountName,
          versionNumber: variation.versionNumber,
          versionName: variation.versionName,
          active: variation.isActive ? 'Yes' : 'No',
          counted: counted ? 'Yes' : 'No',
          countedNote: counted ? 'Counted in product demand' : 'Not counted in product demand',
          liveValue: variation.liveValue,
          productLines: variation.lineCount,
          updated: variation.updatedDate || variation.createdDate || null,
        };
      })),
    },
  ];
}