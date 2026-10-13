/**
 * highlightsFitting.js
 * --------------------
 * The complete Key Performance Highlights section occupies ONE A4 sheet.
 *
 * The section is a curated summary of the assessment, never a transcript of it:
 * the Project Report remains the full authority and every result it carries is
 * left exactly as it is. What fits one sheet is decided by MEASUREMENT, in this
 * order, and never by shrinking the document:
 *
 *   1. the frame the compositor allocates is applied BEFORE anything is measured,
 *      so the composition measured here is the composition that is allocated. A
 *      row selection is never accepted against a page laid out at another width:
 *      that is how a table once passed as fitting and then overflowed the sheet
 *      it printed on, and the closing note with it;
 *   2. the WHOLE composition is measured every time — the heading, the
 *      introduction, the table header, every selected row, the closing note and
 *      all the spacing between them. A composition that carries a table but not
 *      its closing note is refused rather than accepted, because the note is part
 *      of what the one sheet has to carry;
 *   3. the table's own spacing is tightened first — its type is untouched and
 *      never reduced, because a table a client has to squint at is not a summary;
 *   4. only then are the least valuable rows withdrawn, one at a time, the
 *      complete composition being measured again after each withdrawal: a row
 *      that repeats a point the table already makes goes before a row that states
 *      a new one, a result that says less about this design goes before one that
 *      says more, and a row that states a real limitation is kept while any other
 *      row remains to withdraw;
 *   5. the composition must fit WITH HEADROOM, so the selection the table prints
 *      is the selection that was measured and not a last-millimetre accident.
 *
 * The table is never split across two sheets, never clipped, and its closing note
 * is never handed to the paragraph-fragmentation fallback: a section that cannot
 * be made to fit one sheet legibly is REPORTED, not printed as an accident.
 *
 * Idempotent: the section is fitted once, and a second call is a no-op.
 */

import {
  naturalFrame,
  pageMeasurement,
  setPrintStyle,
} from '@/components/proposal/export/composition/proposalPageGeometry';
import {
  nextHighlightRowToDrop,
  statesSignificantLimitation,
} from '@/components/proposal/keyPerformanceHighlightsAuthority';

/** The cell padding the table is tightened to before any row is withdrawn. */
const TIGHT_CELL_PADDING_MM = '0.9mm';
/** The gap held above the table when its own spacing cannot be afforded. */
const TIGHT_TABLE_GAP_MM = '3mm';
/** The gap held above the closing note when its own spacing cannot be afforded. */
const TIGHT_NOTE_GAP_MM = '1.2mm';
/**
 * The space left free at the foot of the sheet. The summary is accepted only when
 * it fits with this much to spare, so what is measured is what prints.
 */
const HEADROOM_MM = 1.5;
/**
 * The fewest rows the summary is ever trimmed to. Below this the table stops
 * being a summary of the design, so the section is reported as unable to fit
 * instead of being cut again — the requirement is the complete section on ONE
 * sheet, never a smaller type. Four rows carry the viewing geometry, the design
 * structures and the bass result.
 */
const HIGHLIGHT_LEGIBLE_FLOOR = 4;

/** The closing note, which the one sheet must always carry. */
function closingNote(page) {
  return typeof page?.querySelector === 'function' ? page.querySelector('.kph-table__note') : null;
}

/**
 * Whether the COMPLETE composition now fits the sheet, with room to spare.
 * `availableMm`/`usedMm` come from the compositor's own measurement; a measurer
 * that reports only `fits` is still honoured.
 */
function fitsCompleteComposition(page, measure) {
  const measured = measure(page);
  if (!measured?.fits) return false;
  if (typeof measured.usedMm !== 'number' || typeof measured.availableMm !== 'number') return true;
  return measured.availableMm - measured.usedMm >= HEADROOM_MM;
}

/** Tighten the table's own padding, leaving its type exactly as it is. */
function tightenTablePadding(table) {
  if (!table || table.dataset.padding === 'tight') return false;
  setPrintStyle(table, 'border-collapse', 'collapse');
  [...table.querySelectorAll('th,td')].forEach((cell) => {
    setPrintStyle(cell, 'padding-top', TIGHT_CELL_PADDING_MM);
    setPrintStyle(cell, 'padding-bottom', TIGHT_CELL_PADDING_MM);
  });
  [...table.querySelectorAll('tr')].forEach((row) => setPrintStyle(row, 'break-inside', 'avoid'));
  table.dataset.padding = 'tight';
  return true;
}

/** The gap above an element, tightened once: spacing gives way before content. */
function tightenGap(node, millimetres) {
  if (!node || node.dataset.gap === 'tight') return false;
  setPrintStyle(node, 'margin-top', millimetres);
  node.dataset.gap = 'tight';
  return true;
}

/** The printed summary rows, in the order the table states them. */
function printedRows(table) {
  return [...(table?.querySelectorAll('tbody tr') || [])].map((row) => ({
    key: row.dataset.rowKey || '',
    area: row.dataset.rowArea || '',
    // A row that states a Level 1 or Level 2 result is a limitation of this
    // design, and the summary keeps it while anything else can be withdrawn.
    limitation: statesSignificantLimitation(row.textContent),
    node: row,
  }));
}

/**
 * Make the complete section fit one sheet.
 *
 * @param {Element} page — the Key Performance Highlights frame
 * @param {(page: Element) => {fits: boolean, usedMm?: number, availableMm?: number}} measure
 *   the compositor's own measurement
 * @returns {boolean} whether the complete section now fits one sheet, note and all
 */
export function fitHighlightsSection(page, measure = pageMeasurement) {
  if (!page || page.dataset?.highlightsFitted === 'true') return true;
  const finish = (fitted) => {
    if (page.dataset) page.dataset.highlightsFitted = 'true';
    return fitted;
  };
  // (1) Measure the composition in the frame the compositor will allocate.
  naturalFrame(page);
  const table = typeof page.querySelector === 'function' ? page.querySelector('table') : null;
  const note = closingNote(page);
  // (2) A table without its closing note is an incomplete composition: it is
  // never accepted, because the note is part of what the one sheet carries.
  if (table && !note) return finish(false);
  let fitted = fitsCompleteComposition(page, measure);
  // (3) Spacing first — the table's own padding, then the gaps around it.
  if (!fitted && tightenTablePadding(table)) fitted = fitsCompleteComposition(page, measure);
  if (!fitted && tightenGap(table, TIGHT_TABLE_GAP_MM)) fitted = fitsCompleteComposition(page, measure);
  if (!fitted && tightenGap(note, TIGHT_NOTE_GAP_MM)) fitted = fitsCompleteComposition(page, measure);
  // (4) Then the least valuable rows, one at a time, the COMPLETE composition
  // (closing note included) being measured again after each withdrawal.
  let guard = HIGHLIGHT_LEGIBLE_FLOOR * 6;
  while (!fitted && guard > 0) {
    guard -= 1;
    const rows = printedRows(table);
    if (!table || rows.length <= HIGHLIGHT_LEGIBLE_FLOOR) break;
    const key = nextHighlightRowToDrop(rows);
    const target = rows.find((row) => row.key === key) || rows[rows.length - 1];
    target.node.remove();
    fitted = fitsCompleteComposition(page, measure);
  }
  return finish(fitted);
}

export default fitHighlightsSection;