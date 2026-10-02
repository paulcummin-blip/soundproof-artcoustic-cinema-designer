// downloadReport.js
// ----------------
// Browser download helpers for the Project Intelligence export. The workbook
// and CSV text are built by the pure export layer; this module only puts the
// text in front of the browser.

import { buildCsv, buildExcelXmlWorkbook, buildReportSheets } from '@/lib/commercial/projectReporting/projectReportingExport';
import { buildSelectionSheets, selectionExportFilename } from '@/lib/commercial/projectReporting/projectSelectionExport';

function stamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

function downloadTextFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Revoke on the next tick so the download has started in every browser.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

const slug = (value) => String(value || 'sheet').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * The default export: a real multi-sheet Excel XML workbook containing
 * Project Summary, Product Demand, Variations Detail and Warnings.
 * Respects the active filters (they are already applied to the report).
 */
export function downloadWorkbook(report) {
  const sheets = buildReportSheets(report);
  downloadTextFile(
    `project-intelligence-${stamp()}.xls`,
    buildExcelXmlWorkbook(sheets),
    'application/vnd.ms-excel',
  );
  return sheets.map((sheet) => sheet.name);
}

/**
 * The fallback: one CSV per workbook tab, for a browser or spreadsheet that
 * will not open the Excel XML workbook.
 */
export function downloadCsvSheets(report) {
  const sheets = buildReportSheets(report);
  const prefix = stamp();
  sheets.forEach((sheet, index) => {
    setTimeout(() => {
      downloadTextFile(`project-intelligence-${prefix}-${slug(sheet.name)}.csv`, buildCsv(sheet), 'text/csv');
    }, index * 250);
  });
  return sheets.map((sheet) => sheet.name);
}

export const WORKBOOK_TABS = ['Project Summary', 'Product Demand', 'Variations Detail', 'Warnings'];

/**
 * The Artcoustic forecast export: the workbook tabs built from the admin's
 * inclusion, status, category and counted-version selection, so the workbook
 * carries exactly what the page shows. Filename follows the forecast convention.
 */
export function downloadSelectionWorkbook(selection) {
  const sheets = buildSelectionSheets(selection);
  downloadTextFile(
    `${selectionExportFilename()}.xls`,
    buildExcelXmlWorkbook(sheets),
    'application/vnd.ms-excel',
  );
  return sheets.map((sheet) => sheet.name);
}

/** The CSV-per-tab fallback for the same tabs. */
export function downloadSelectionCsv(selection) {
  const sheets = buildSelectionSheets(selection);
  const base = selectionExportFilename();
  sheets.forEach((sheet, index) => {
    setTimeout(() => {
      downloadTextFile(`${base} - ${slug(sheet.name)}.csv`, buildCsv(sheet), 'text/csv');
    }, index * 250);
  });
  return sheets.map((sheet) => sheet.name);
}