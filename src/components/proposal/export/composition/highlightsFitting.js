/**
 * highlightsFitting.js
 * --------------------
 * The complete Key Performance Highlights section occupies ONE A4 sheet.
 *
 * The section is a curated summary of the assessment, never a transcript of it:
 * the Project Report remains the full authority and every result it carries is
 * left exactly as it is. What fits one sheet is decided by measurement, in this
 * order, and never by shrinking the document:
 *
 *   1. the table's own padding is tightened — its type is untouched and never
 *      reduced, because a table a client has to squint at is not a summary;
 *   2. only then are the least valuable rows withdrawn from the summary, one at a
 *      time, a row that repeats a point the table already makes going before a
 *      row that states a new one, and a result that says less about this design
 *      going before one that says more.
 *
 * The table is never split across two sheets and never clipped: a section that
 * cannot be made to fit is reported instead of printed as an accident.
 *
 * Idempotent: the section is fitted once, and a second call is a no-op.
 */

import { setPrintStyle } from '@/components/proposal/export/composition/proposalPageGeometry';
import {
  HIGHLIGHT_MIN_PRINTED_ROWS,
  nextHighlightRowToDrop,
} from '@/components/proposal/keyPerformanceHighlightsAuthority';

/** The cell padding the table is tightened to before any row is withdrawn. */
const TIGHT_CELL_PADDING_MM = 0.9;

/** Tighten the table's own padding, leaving its type exactly as it is. */
function tightenTablePadding(table) {
  if (!table || table.dataset.padding === 'tight') return false;
  setPrintStyle(table, 'border-collapse', 'collapse');
  [...table.querySelectorAll('th,td')].forEach((cell) => {
    setPrintStyle(cell, 'padding-top', `${TIGHT_CELL_PADDING_MM}mm`);
    setPrintStyle(cell, 'padding-bottom', `${TIGHT_CELL_PADDING_MM}mm`);
  });
  [...table.querySelectorAll('tr')].forEach((row) => setPrintStyle(row, 'break-inside', 'avoid'));
  table.dataset.padding = 'tight';
  return true;
}

/** The printed summary rows, in the order the table states them. */
function printedRows(table) {
  return [...(table?.querySelectorAll('tbody tr') || [])].map((row) => ({
    key: row.dataset.rowKey || '',
    area: row.dataset.rowArea || '',
    node: row,
  }));
}

/**
 * Make the complete section fit one sheet.
 *
 * @param {Element} page — the Key Performance Highlights frame
 * @param {(page: Element) => ({ fits: boolean })} measure — the compositor's own measurement
 * @returns {boolean} whether the complete section now fits one sheet
 */
export function fitHighlightsSection(page, measure) {
  if (!page || page.dataset?.highlightsFitted === 'true') return true;
  if (measure(page).fits) {
    if (page.dataset) page.dataset.highlightsFitted = 'true';
    return true;
  }
  const table = page.querySelector('table');
  tightenTablePadding(table);
  let guard = HIGHLIGHT_MIN_PRINTED_ROWS * 4;
  while (!measure(page).fits && guard > 0) {
    guard -= 1;
    const rows = printedRows(table);
    if (!table || rows.length <= HIGHLIGHT_MIN_PRINTED_ROWS) break;
    const key = nextHighlightRowToDrop(rows);
    const target = rows.find((row) => row.key === key) || rows[rows.length - 1];
    target.node.remove();
  }
  const fits = measure(page).fits;
  if (page.dataset) page.dataset.highlightsFitted = 'true';
  return fits;
}

export default fitHighlightsSection;