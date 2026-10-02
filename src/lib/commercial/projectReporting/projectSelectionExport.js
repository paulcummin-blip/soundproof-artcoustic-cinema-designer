/**
 * projectSelectionExport.js
 * -------------------------
 * The Artcoustic forecast export for the Project Intelligence selection workflow.
 *
 * The workbook answers one question: what Artcoustic business is likely coming
 * our way. Every value is Artcoustic catalogue products only, shown as the trade
 * value derived from the catalogue retail ex VAT — never overall project value,
 * never manual extras or third-party items. Retail itself is an internal
 * calculation and is not exported.
 *
 * Tabs, built from the admin's inclusion, status, category and counted-version
 * selection:
 *   1. Included Forecast Projects  — one row per project inside the forecast
 *   2. Excluded Projects           — one row per project left out, with the reason
 *   3. Product Demand              — Artcoustic catalogue lines of counted
 *                                    versions, with trade value
 *   4. Status Inclusion            — every resolved status, included or not
 *   5. Category Inclusion          — every catalogue category, included or not
 *   6. Version Detail              — every version, marked counted or not
 *   7. Pipeline Age Summary        — Artcoustic trade value per age bucket
 *   8. Trend Summary               — Artcoustic trade value per rolling period
 *   9. Excluded Manual Lines       — non-catalogue lines left out, for audit only
 *  10. Excluded Historic Abfusers  — Abfuser left out by the reporting cutoff
 *
 * The workbook and CSV strings are produced by projectReportingExport, so this
 * module returns sheet definitions only.
 *
 * Pure: no React, no DOM, no entity access.
 */

import { BUCKET_LABEL } from './statusBuckets';
import { AGE_BUCKETS, ageBucketKeyOf } from './pipelineAge';
import { tradeValueOf } from './artcousticForecast';

export const SELECTION_WORKBOOK_TABS = [
  'Included Forecast Projects',
  'Excluded Projects',
  'Product Demand',
  'Status Inclusion',
  'Category Inclusion',
  'Version Detail',
  'Pipeline Age Summary',
  'Trend Summary',
  'Excluded Manual Lines',
  'Excluded Historic Abfusers',
];

const YES = 'Yes';
const NO = 'No';

const ageBucketLabel = (family) => (
  AGE_BUCKETS.find((bucket) => bucket.key === ageBucketKeyOf(family))?.label || 'No date recorded'
);

/** The export filename, e.g. "Sound Proof Artcoustic Forecast - 2026-10-02". */
export function selectionExportFilename(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `Sound Proof Artcoustic Forecast - ${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const statusText = (family) => (
  family?.rawStatusLabel
  || BUCKET_LABEL[family?.bucket]
  || family?.bucket
  || ''
);

/**
 * Build the workbook sheets from the resolved forecast.
 *
 * @param {Object} forecast — { families, productDemand, versionRows, statusRows, categoryRows,
 *                              excludedLines, abfuserExclusions, currency }
 * @returns {Array<{ name: string, columns: Array, rows: Array }>}
 */
export function buildSelectionSheets({
  families = [],
  productDemand = [],
  versionRows = [],
  statusRows = [],
  categoryRows = [],
  excludedLines = [],
  abfuserExclusions = [],
  pipelineAge = null,
  trends = null,
  currency = 'GBP',
} = {}) {
  const included = families.filter((family) => family.forecastIncluded === true);
  const excluded = families.filter((family) => family.forecastIncluded !== true);

  const includedColumns = [
    { key: 'name', label: 'Project', type: 'string' },
    { key: 'client', label: 'Client', type: 'string' },
    { key: 'dealer', label: 'Dealer / account', type: 'string' },
    { key: 'status', label: 'Status', type: 'string' },
    { key: 'countedVersion', label: 'Counted version', type: 'string' },
    { key: 'trade', label: `Trade value (${currency})`, type: 'currency' },
    { key: 'units', label: 'Catalogue units', type: 'number' },
    { key: 'ageBucket', label: 'Age bucket', type: 'string' },
  ];

  const excludedColumns = [
    { key: 'name', label: 'Project', type: 'string' },
    { key: 'status', label: 'Status', type: 'string' },
    { key: 'reason', label: 'Exclusion reason', type: 'string' },
  ];

  const demandColumns = [
    { key: 'product', label: 'Product / model', type: 'string' },
    { key: 'sku', label: 'SKU', type: 'string' },
    { key: 'category', label: 'Category', type: 'string' },
    { key: 'quantity', label: 'Quantity', type: 'number' },
    { key: 'trade', label: `Trade value (${currency})`, type: 'currency' },
    { key: 'projectFamilies', label: 'Included forecast projects using it', type: 'number' },
  ];

  const statusColumns = [
    { key: 'label', label: 'Status label', type: 'string' },
    { key: 'included', label: 'Included in forecast', type: 'string' },
    { key: 'count', label: 'Project count', type: 'number' },
    { key: 'trade', label: `Trade value (${currency})`, type: 'currency' },
  ];

  const categoryColumns = [
    { key: 'label', label: 'Category', type: 'string' },
    { key: 'included', label: 'Included in forecast', type: 'string' },
    { key: 'trade', label: `Trade value (${currency})`, type: 'currency' },
  ];

  const versionColumns = [
    { key: 'project', label: 'Project', type: 'string' },
    { key: 'version', label: 'Version', type: 'string' },
    { key: 'counted', label: 'Counted', type: 'string' },
    { key: 'trade', label: `Trade value (${currency})`, type: 'currency' },
  ];

  /** A share as display text. Shares are reported, never scored. */
  const percentText = (share) => (
    share === null || share === undefined ? '' : `${(Number(share) * 100).toFixed(1)}%`
  );

  const ageColumns = [
    { key: 'bucket', label: 'Age bucket', type: 'string' },
    { key: 'count', label: 'Project count', type: 'number' },
    { key: 'trade', label: `Trade value (${currency})`, type: 'currency' },
    { key: 'units', label: 'Catalogue units', type: 'number' },
    { key: 'shareOfTrade', label: 'Share of trade value', type: 'string' },
  ];

  const trendColumns = [
    { key: 'period', label: 'Rolling 90-day period', type: 'string' },
    { key: 'projects', label: 'Forecast project count', type: 'number' },
    { key: 'trade', label: `Trade value (${currency})`, type: 'currency' },
    { key: 'averageTrade', label: `Average trade value per project (${currency})`, type: 'currency' },
    { key: 'units', label: 'Catalogue units', type: 'number' },
    { key: 'changeProjects', label: 'Change vs previous project count', type: 'number' },
    { key: 'changeTrade', label: `Change vs previous trade value (${currency})`, type: 'currency' },
  ];

  const excludedLineColumns = [
    { key: 'project', label: 'Project', type: 'string' },
    { key: 'countedVersion', label: 'Counted version', type: 'string' },
    { key: 'description', label: 'Excluded line', type: 'string' },
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

  return [
    {
      name: SELECTION_WORKBOOK_TABS[0],
      columns: includedColumns,
      rows: included.map((family) => ({
        name: family.name,
        client: family.client,
        dealer: family.dealerName || family.accountName,
        status: statusText(family),
        countedVersion: family.countedVersionName,
        trade: family.artcousticTrade ?? null,
        units: family.artcousticUnits ?? 0,
        ageBucket: ageBucketLabel(family),
      })),
    },
    {
      name: SELECTION_WORKBOOK_TABS[1],
      columns: excludedColumns,
      rows: excluded.map((family) => ({
        name: family.name,
        status: statusText(family),
        reason: family.forecastExclusionReason || 'Not included',
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
        trade: row.tradeValue,
        projectFamilies: row.projectFamilies,
      })),
    },
    {
      name: SELECTION_WORKBOOK_TABS[3],
      columns: statusColumns,
      rows: statusRows.map((row) => ({
        label: row.label,
        included: row.included ? YES : NO,
        count: row.count,
        trade: row.trade,
      })),
    },
    {
      name: SELECTION_WORKBOOK_TABS[4],
      columns: categoryColumns,
      rows: categoryRows.map((row) => ({
        label: row.label,
        included: row.included ? YES : NO,
        trade: row.trade,
      })),
    },
    {
      name: SELECTION_WORKBOOK_TABS[5],
      columns: versionColumns,
      rows: versionRows.map((row) => ({
        project: row.project,
        version: row.versionName || `Version ${row.versionNumber ?? '?'}`,
        counted: row.counted ? YES : NO,
        trade: row.artcousticTrade,
      })),
    },
    {
      // Artcoustic value ageing: how much trade value, and how many catalogue
      // units, sit in each age bucket. Forecast projects only, counted versions
      // only — the same numbers the overview shows. The share is the bucket's
      // share of total trade value; it is scale-invariant, so it is the same share
      // the retail figures would give.
      name: SELECTION_WORKBOOK_TABS[6],
      columns: ageColumns,
      rows: (pipelineAge?.buckets || []).map((bucket) => ({
        bucket: bucket.label,
        count: bucket.count,
        trade: bucket.trade,
        units: bucket.units,
        shareOfTrade: percentText(bucket.shareOfRetail),
      })),
    },
    {
      // Rolling 90-day periods, newest first. Every figure is Artcoustic-only and
      // reported, never scored. The change column is the trade value of the same
      // change the retail figures describe.
      name: SELECTION_WORKBOOK_TABS[7],
      columns: trendColumns,
      rows: (trends?.windows || []).map((row) => ({
        period: row.label,
        projects: row.projects,
        trade: row.trade,
        averageTrade: row.averageTrade,
        units: row.units,
        changeProjects: row.changeProjects,
        changeTrade: tradeValueOf(row.changeRetail),
      })),
    },
    {
      // The audit tab: lines kept OUT of the forecast. Quantity and value here are
      // shown for transparency only and are never part of a forecast total.
      name: SELECTION_WORKBOOK_TABS[8],
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
      // The Abfuser cutoff audit: the historic Abfuser quantity and value left out
      // of Product Demand, and the date the counted version was judged on.
      name: SELECTION_WORKBOOK_TABS[9],
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
  ];
}