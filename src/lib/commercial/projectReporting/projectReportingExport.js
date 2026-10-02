/**
 * projectReportingExport.js
 * -------------------------
 * Export builders for Project Intelligence.
 *
 * The default format is a SpreadsheetML (Excel XML) workbook, which is a real
 * multi-sheet workbook built from a plain string with no added dependency. The
 * tab names required by the workbook are fixed here:
 *   1. Project Summary      — one row per Project family
 *   2. Product Demand       — aggregated product demand
 *   3. Variations Detail    — one row per ProjectVersion
 *   4. Warnings             — unclassified statuses, unpriced projects,
 *                             inactive products, possible duplicates
 *
 * A CSV-per-tab fallback is also built here, so the page can offer it if a
 * browser will not open the workbook.
 *
 * Pure: no React, no DOM, no entity access.
 */

import { BUCKET_LABEL } from './statusBuckets';

const MAX_SHEET_NAME = 31;
const CURRENCY_TYPES = new Set(['number', 'currency']);

function cellText(value) {
  if (value === null || value === undefined) return '';
  return String(value);
}

function escapeXml(value) {
  return cellText(value)
    // Control characters are not valid in XML 1.0.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeCsv(value) {
  const raw = cellText(value).replace(/"/g, '""');
  return /[",\n]/.test(raw) ? `"${raw}"` : raw;
}

function sheetName(name) {
  const cleaned = String(name || 'Sheet').replace(/[\[\]\*\/\\\?:]/g, ' ').trim();
  return (cleaned || 'Sheet').slice(0, MAX_SHEET_NAME);
}

const cellType = (column, value) => {
  if (column?.type === 'currency' || column?.type === 'number') {
    return Number.isFinite(Number(value)) ? 'Number' : 'String';
  }
  return 'String';
};

/**
 * Build the four workbook sheets from a report model. Respects the active
 * filters, because the report model has already been filtered.
 *
 * @param {Object} report — buildProjectIntelligenceReport output
 * @returns {Array<{ name: string, columns: Array, rows: Array }>}
 */
export function buildReportSheets(report) {
  const families = report?.families || [];
  const currency = report?.summary?.liveCurrency || report?.priceContext?.currency || 'GBP';
  const quotedCurrency = report?.summary?.quotedCurrency || currency;

  const projectColumns = [
    { key: 'name', label: 'Project', type: 'string' },
    { key: 'client', label: 'Client', type: 'string' },
    { key: 'reference', label: 'Reference', type: 'string' },
    { key: 'dealer', label: 'Dealer / account', type: 'string' },
    { key: 'bucket', label: 'Canonical status bucket', type: 'string' },
    { key: 'rawStatus', label: 'Raw status', type: 'string' },
    { key: 'lifecycle', label: 'Lifecycle status', type: 'string' },
    { key: 'variationCount', label: 'Variation count', type: 'number' },
    { key: 'activeVersion', label: 'Active version', type: 'string' },
    { key: 'liveValue', label: `Live Design Value (${currency})`, type: 'currency' },
    { key: 'liveValueExVat', label: `Live Design Value ex VAT (${currency})`, type: 'currency' },
    { key: 'livePriceMode', label: 'Live value basis', type: 'string' },
    { key: 'quotedValue', label: `Quoted Snapshot Value (${quotedCurrency})`, type: 'currency' },
    { key: 'quotedAt', label: 'Quoted snapshot date', type: 'string' },
    { key: 'productLineCount', label: 'Product line count', type: 'number' },
    { key: 'unpricedLineCount', label: 'Unpriced line count', type: 'number' },
    { key: 'created', label: 'Created', type: 'string' },
    { key: 'updated', label: 'Last updated', type: 'string' },
    { key: 'warnings', label: 'Warning flags', type: 'string' },
  ];

  const productColumns = [
    { key: 'sku', label: 'SKU', type: 'string' },
    { key: 'product', label: 'Product / model', type: 'string' },
    { key: 'category', label: 'Category', type: 'string' },
    { key: 'quantity', label: 'Quantity', type: 'number' },
    { key: 'projectFamilies', label: 'Project families using it', type: 'number' },
    { key: 'prospective', label: 'Qty Prospective / Pending', type: 'number' },
    { key: 'live', label: 'Qty Live / Open', type: 'number' },
    { key: 'completed', label: 'Qty Completed / Won', type: 'number' },
    { key: 'lost', label: 'Qty Lost', type: 'number' },
    { key: 'liveValue', label: `Live Design Value (${currency})`, type: 'currency' },
    { key: 'quotedValue', label: `Quoted Snapshot Value (${quotedCurrency})`, type: 'currency' },
    { key: 'derived', label: 'Derived line', type: 'string' },
    { key: 'status', label: 'Priced', type: 'string' },
  ];

  const variationColumns = [
    { key: 'project', label: 'Project', type: 'string' },
    { key: 'account', label: 'Dealer / account', type: 'string' },
    { key: 'bucket', label: 'Canonical status bucket', type: 'string' },
    { key: 'versionNumber', label: 'Version number', type: 'number' },
    { key: 'versionName', label: 'Version name', type: 'string' },
    { key: 'isActive', label: 'Active version', type: 'string' },
    { key: 'created', label: 'Version created', type: 'string' },
    { key: 'updated', label: 'Version updated', type: 'string' },
    { key: 'liveValue', label: `Live Design Value (${currency})`, type: 'currency' },
    { key: 'productLineCount', label: 'Product lines', type: 'number' },
    { key: 'unpricedLineCount', label: 'Unpriced lines', type: 'number' },
    { key: 'format', label: 'Format', type: 'string' },
    { key: 'publication', label: 'RP22 / engineering result', type: 'string' },
    { key: 'warnings', label: 'Warning flags', type: 'string' },
  ];

  const warningColumns = [
    { key: 'type', label: 'Warning type', type: 'string' },
    { key: 'severity', label: 'Severity', type: 'string' },
    { key: 'project', label: 'Project', type: 'string' },
    { key: 'message', label: 'Warning', type: 'string' },
    { key: 'detail', label: 'Detail', type: 'string' },
  ];

  return [
    {
      name: 'Project Summary',
      columns: projectColumns,
      rows: families.map((family) => ({
        name: family.name,
        client: family.client,
        reference: family.reference,
        dealer: family.dealerName || family.accountName,
        bucket: BUCKET_LABEL[family.bucket] || family.bucket,
        rawStatus: family.rawStatusLabel,
        lifecycle: family.lifecycleStatus,
        variationCount: family.variationCount,
        activeVersion: family.activeVersionName,
        liveValue: family.liveValue,
        liveValueExVat: family.liveValueExVat,
        livePriceMode: family.liveValue === null ? 'not calculable' : (family.livePriceMode || ''),
        quotedValue: family.quotedValue,
        quotedAt: family.quotedAt,
        productLineCount: family.productLineCount,
        unpricedLineCount: family.unpricedLineCount,
        created: family.createdDate,
        updated: family.updatedDate,
        warnings: family.warnings.join('; '),
      })),
    },
    {
      name: 'Product Demand',
      columns: productColumns,
      rows: (report?.productDemand || []).map((row) => ({
        sku: row.sku,
        product: row.product,
        category: row.category,
        quantity: row.quantity,
        projectFamilies: row.projectFamilies,
        prospective: row.qtyByBucket.prospective,
        live: row.qtyByBucket.live,
        completed: row.qtyByBucket.completed,
        lost: row.qtyByBucket.lost,
        liveValue: row.liveValue,
        quotedValue: row.quotedValue,
        derived: row.derived ? 'Yes' : 'No',
        status: row.status,
      })),
    },
    {
      name: 'Variations Detail',
      columns: variationColumns,
      rows: families.flatMap((family) => family.variations.map((variation) => ({
        project: family.name,
        account: family.dealerName || family.accountName,
        bucket: BUCKET_LABEL[family.bucket] || family.bucket,
        versionNumber: variation.versionNumber,
        versionName: variation.versionName,
        isActive: variation.isActive ? 'Yes' : 'No',
        created: variation.createdDate,
        updated: variation.updatedDate,
        liveValue: variation.liveValue,
        productLineCount: variation.lineCount,
        unpricedLineCount: variation.unpricedLineCount,
        format: variation.format,
        publication: variation.publicationSummary
          ? `Published ${variation.publicationSummary.publishedAt || ''} (${variation.publicationSummary.engineVersion || 'engine n/a'})`
          : 'Not published',
        warnings: (variation.warnings || []).join('; '),
      }))),
    },
    {
      name: 'Warnings',
      columns: warningColumns,
      rows: (report?.warnings || []).map((warning) => ({
        type: warning.type,
        severity: warning.severity,
        project: warning.projectName,
        message: warning.message,
        detail: warning.detail,
      })),
    },
  ];
}

/**
 * Build a SpreadsheetML 2003 workbook string — a real multi-sheet workbook with
 * no dependency.
 *
 * @param {Array<{ name, columns, rows }>} sheets
 * @returns {string} the workbook XML
 */
export function buildExcelXmlWorkbook(sheets) {
  const styles = [
    '<Style ss:ID="header">',
    '<Font ss:Bold="1"/>',
    '<Interior ss:Color="#EFEDE8" ss:Pattern="Solid"/>',
    '<Alignment ss:Vertical="Bottom"/>',
    '</Style>',
  ].join('');

  const worksheetXml = (sheet) => {
    const headerRow = `<Row>${sheet.columns.map((column) => (
      `<Cell ss:StyleID="header"><Data ss:Type="String">${escapeXml(column.label)}</Data></Cell>`
    )).join('')}</Row>`;

    const bodyRows = sheet.rows.map((row) => `<Row>${sheet.columns.map((column) => {
      const value = row[column.key];
      const type = cellType(column, value);
      if (type === 'Number') {
        return `<Cell><Data ss:Type="Number">${Number(value)}</Data></Cell>`;
      }
      return `<Cell><Data ss:Type="String">${escapeXml(value)}</Data></Cell>`;
    }).join('')}</Row>`).join('');

    return `<Worksheet ss:Name="${escapeXml(sheetName(sheet.name))}"><Table>${headerRow}${bodyRows}</Table></Worksheet>`;
  };

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<?mso-application progid="Excel.Sheet"?>',
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"',
    ' xmlns:o="urn:schemas-microsoft-com:office:office"',
    ' xmlns:x="urn:schemas-microsoft-com:office:excel"',
    ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">',
    `<Styles>${styles}</Styles>`,
    sheets.map(worksheetXml).join(''),
    '</Workbook>',
  ].join('');
}

/** CSV text for one sheet, used by the per-tab fallback. */
export function buildCsv(sheet) {
  const header = sheet.columns.map((column) => escapeCsv(column.label)).join(',');
  const rows = sheet.rows.map((row) => sheet.columns
    .map((column) => {
      const value = row[column.key];
      if (CURRENCY_TYPES.has(column.type) && value !== null && value !== undefined && Number.isFinite(Number(value))) {
        return Number(value);
      }
      return escapeCsv(value);
    })
    .join(','));
  return [header, ...rows].join('\r\n');
}