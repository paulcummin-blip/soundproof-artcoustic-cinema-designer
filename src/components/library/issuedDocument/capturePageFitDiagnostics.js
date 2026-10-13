/**
 * capturePageFitDiagnostics.js
 * ----------------------------
 * WHY a completed browser proposal sheet stopped Project Library storage.
 *
 * PART OF THE EXISTING CAPTURE DIAGNOSTIC CHANNEL — not a second system. The
 * capture already reports itself through the `captureDiagnostics` record on the
 * error it throws; that record already travels into the storage failure, and the
 * Project Library's existing TECHNICAL DETAIL disclosure already renders it.
 * What that record could not say was WHICH sheet overflowed, what overran it, and
 * by how much. This module supplies exactly that evidence and nothing else.
 *
 * The browser's OWN measurement of the same page travels beside the capture's, so
 * the record answers the only question that matters after a stop: is this a
 * rounding difference between the two documents, or did the capture measure the
 * page materially taller than the composition it is storing?
 *
 * Pure: numbers in, records out. No DOM, no network, and no decision about what
 * is stored — the caller decides, from the arithmetic below.
 */

/** Millimetres, to a tenth: the precision a sheet is composed to. */
function mm(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 10) / 10 : null;
}

/** One page's measured content height, printable height and overflow. */
function fitOf(page) {
  const usedMm = mm(page?.usedMm);
  const availableMm = mm(page?.availableMm);
  if (usedMm === null || availableMm === null) return null;
  return { usedMm, availableMm, overflowMm: mm(usedMm - availableMm) };
}

/**
 * Read one page's fit, from the capture's own measurement of it and from the
 * measurement the browser composition recorded for the same page.
 *
 * @param {Object} page — one inventory row from `proposalPageInventory`
 * @param {Array|null} browserPages — the composition's own inventory rows
 */
function pageFitRow(page, browserPages) {
  const fit = fitOf(page);
  if (!fit) return null;
  const browser = (browserPages || []).find((entry) => entry?.page === page.page) || null;
  const browserFit = fitOf(browser);
  return {
    page: mm(page.page),
    kind: String(page.kind || '') || null,
    usedMm: fit.usedMm,
    availableMm: fit.availableMm,
    overflowMm: fit.overflowMm,
    // Null when the composition recorded no measurement for this page.
    browserUsedMm: browserFit ? browserFit.usedMm : null,
    browserOverflowMm: browserFit ? browserFit.overflowMm : null,
    // How much taller the capture measured this page than the composition did.
    measurementDifferenceMm: browserFit ? mm(fit.usedMm - browserFit.usedMm) : null,
  };
}

/**
 * The page-fit record for one capture attempt.
 *
 * @param {Array} pages — every page the capture measured
 * @param {Object} [options]
 * @param {number} [options.toleranceMm] — the overflow tolerated without stopping
 *   storage, in millimetres. The caller supplies the tolerance it already applies
 *   to the paper itself, so one fidelity floor governs this document.
 * @param {Array|null} [options.browserPages] — the completed browser composition's
 *   own inventory, read back beside the capture's measurement.
 * @returns {{toleranceMm: number, pages: Array, overflowing: Array, tolerated: Array, failed: Array}}
 *   `tolerated` overflowed within the tolerance and does not stop storage;
 *   `failed` overflowed past it and does.
 */
export function pageFitRecords(pages, { toleranceMm = 0, browserPages = null } = {}) {
  const rows = (pages || [])
    .map((page) => pageFitRow(page, browserPages))
    .filter(Boolean);
  const overflowing = rows.filter((row) => row.overflowMm > 0);
  const tolerance = Number.isFinite(Number(toleranceMm)) ? Number(toleranceMm) : 0;
  return {
    toleranceMm: tolerance,
    pages: rows,
    overflowing,
    tolerated: overflowing.filter((row) => row.overflowMm <= tolerance),
    failed: overflowing.filter((row) => row.overflowMm > tolerance),
  };
}

export default pageFitRecords;