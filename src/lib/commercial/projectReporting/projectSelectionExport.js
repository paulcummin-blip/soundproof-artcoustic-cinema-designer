/**
 * projectSelectionExport.js
 * -------------------------
 * The product demand export for the Project Intelligence selection workflow.
 *
 * Eight workbook tabs, built from the admin's inclusion and counted-version
 * selection:
 *   1. Included Projects           — one row per included project
 *   2. Excluded Projects           — one row per excluded project, with the reason
 *   3. Product Demand              — Artcoustic catalogue lines, counted versions
 *                                    only, with historic Abfuser excluded. The
 *                                    quantity and value are counted demand only:
 *                                    no quoted snapshot quantity is carried.
 *   4. Version Detail              — every version, marked counted or not
 *   5. Excluded Manual Lines       — the non-catalogue lines left out of demand,
 *                                    for audit only
 *   6. Excluded Historic Abfusers  — Abfuser quantity and value left out because
 *                                    the counted version predates 1 Oct 2026
 *   7. Pipeline Age Summary        — project count, value and catalogue units per
 *                                    age bucket, from the age overview
 *   8. Trend Summary               — rolling 90-day periods with the change
 *                                    against the previous period
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
  'Excluded Manual Lines',
  'Excluded Historic Abfusers',
  'Pipeline Age Summary',
  'Trend Summary',
];

/** A share as display text. Shares are reported, never scored. */
const percentText = (value) => (
  value === null || value === undefined ? '' : `${(Number(value) * 100).toFixed(1)}%`
);

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
 * Build the sheets from the resolved selection.
 *
 * @param {Object} selection — { families, productDemand, excludedLines, abfuserExclusions, pipelineAge, trends }
 * @returns {Array<{ name: string, columns: Array, rows: Array }>}
 */
export function buildSelectionSheets({
  families = [],
  productDemand = [],
  excludedLines = [],
  abfuserExclusions = [],
  pipelineAge = null,
  trends = null,
} = {}) {
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
    { key: 'liveValue', label: `Product Demand catalogue value (${currency})`, type: 'currency' },
    { key: 'derived', label: 'Derived line', type: 'string' },
    { key: 'priced', label: 'Priced', type: 'string' },
  ];

  const excludedLineColumns = [
    { key: 'project', label: 'Project', type: 'string' },
    { key: 'countedVersion', label: 'Counted version', type: 'string' },
    { key: 'description', label: 'Manual line description', type: 'string' },
    { key: 'quantity', label: 'Quantity', type: 'number' },
    { key: 'value', label: `Value (${currency})`, type: 'currency' },
    { key: 'reason', label: 'Reason excluded', type: 'string' },
  ];

  const abfuserColumns = [
    { key: 'project', label: 'Project', type: 'string' },
    { key: 'countedVersion', label: 'Counted version', type: 'string' },
    { key: 'dateUsed', label: 'Date used', type: 'string' },
    { key: 'quantity', label: 'Quantity excluded', type: 'number' },
    { key: 'value', label: `Value excluded (${currency})`, type: 'currency' },
    { key: 'reason', label: 'Reason', type: 'string' },
  ];

  const pipelineAgeColumns = [
    { key: 'bucket', label: 'Age bucket', type: 'string' },
    { key: 'count', label: 'Project count', type: 'number' },
    { key: 'liveValue', label: `Live design value (${currency})`, type: 'currency' },
    { key: 'averageValue', label: `Average project value (${currency})`, type: 'currency' },
    { key: 'units', label: 'Catalogue units', type: 'number' },
    { key: 'shareOfCount', label: 'Share of count', type: 'string' },
    { key: 'shareOfValue', label: 'Share of value', type: 'string' },
  ];

  const trendColumns = [
    { key: 'period', label: 'Rolling 90-day period', type: 'string' },
    { key: 'projects', label: 'Project count', type: 'number' },
    { key: 'totalLiveValue', label: `Total live value (${currency})`, type: 'currency' },
    { key: 'averageValue', label: `Average project value (${currency})`, type: 'currency' },
    { key: 'units', label: 'Catalogue units', type: 'number' },
    { key: 'averageUnitsPerProject', label: 'Average units/project', type: 'number' },
    { key: 'activeAccounts', label: 'Active dealers/accounts', type: 'number' },
    { key: 'changeProjects', label: 'Change vs previous project count', type: 'number' },
    { key: 'changeValue', label: `Change vs previous value (${currency})`, type: 'currency' },
    { key: 'changeAverageValue', label: `Change vs previous average value (${currency})`, type: 'currency' },
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
    {
      // The audit tab: lines kept OUT of Product Demand. Quantity and value here
      // are shown for transparency only and are never part of the demand totals.
      name: SELECTION_WORKBOOK_TABS[4],
      columns: excludedLineColumns,
      rows: excludedLines.map((row) => ({
        project: row.project,
        countedVersion: row.countedVersion,
        description: row.description,
        quantity: row.quantity,
        value: row.value,
        reason: row.reason,
      })),
    },
    {
      // The Abfuser cutoff audit: the historic Abfuser quantity and value left
      // out of Product Demand, and the date the counted version was judged on.
      name: SELECTION_WORKBOOK_TABS[5],
      columns: abfuserColumns,
      rows: abfuserExclusions.map((row) => ({
        project: row.project,
        countedVersion: row.countedVersion,
        dateUsed: row.dateLabel,
        quantity: row.quantity,
        value: row.value,
        reason: row.reason,
      })),
    },
    {
      // Value ageing: how much of the included pipeline, and how many counted
      // catalogue units, sit in each age bucket. Included projects only, counted
      // versions only — the same numbers the overview shows.
      name: SELECTION_WORKBOOK_TABS[6],
      columns: pipelineAgeColumns,
      rows: (pipelineAge?.buckets || []).map((bucket) => ({
        bucket: bucket.label,
        count: bucket.count,
        liveValue: bucket.liveValue,
        averageValue: bucket.averageValue,
        units: bucket.units,
        shareOfCount: percentText(bucket.shareOfCount),
        shareOfValue: percentText(bucket.shareOfValue),
      })),
    },
    {
      // Rolling 90-day periods, newest first, each with the change against the
      // previous period. Every figure is reported, never scored.
      name: SELECTION_WORKBOOK_TABS[7],
      columns: trendColumns,
      rows: (trends?.windows || []).map((row) => ({
        period: row.label,
        projects: row.projects,
        totalLiveValue: row.totalLiveValue,
        averageValue: row.averageValue,
        units: row.units,
        averageUnitsPerProject: row.averageUnitsPerProject === null
          ? null
          : Number(row.averageUnitsPerProject.toFixed(1)),
        activeAccounts: row.activeAccounts,
        changeProjects: row.changeProjects,
        changeValue: row.changeValue,
        changeAverageValue: row.changeAverageValue,
      })),
    },
  ];
}