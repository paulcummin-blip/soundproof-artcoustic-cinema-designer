/**
 * libraryCaptureResilience.js
 * ---------------------------
 * Turning a list of composition pages into the page rasters a stored PDF is made
 * of, WITHOUT letting one page's raster failure cost the designer their Project
 * Library copy.
 *
 * The order of attempts, and why:
 *
 *   1. Each page is rasterised on its own — the faithful path, at the composition's
 *      preferred scale.
 *   2. A page that comes back with no PNG data (`data:,` from a zero-size canvas,
 *      or a raster call that threw) is recovered from ONE raster of the whole
 *      composition, cut out at that page's own measured rectangle. The recovered
 *      page is the page itself: nothing is reflowed or re-paginated.
 *   3. A page that measures nothing paints nothing, so it is skipped with a
 *      warning rather than guessed at.
 *   4. Only a document whose pages can genuinely not be rasterised by either pass
 *      stops storage — and it stops with the page, the operation and the reason
 *      named, never as a generic export failure. A Library copy is never invented.
 *
 * Pure orchestration: the caller hands in the two raster functions, so every
 * outcome above is exercised by a test without a browser.
 */

import { pageCaptureFailure } from '@/components/library/capturePagePng';

/** The operation codes a failure record can carry. */
export const RESILIENCE_OPERATION = Object.freeze({
  PAGE: 'page_raster',
  FALLBACK: 'composition_raster_fallback',
  NONE: 'none',
});

/** A page that measured nothing: it paints nothing, so it is not a sheet. */
export function isZeroSizePageFailure(error) {
  const diagnostics = error?.captureDiagnostics || null;
  return diagnostics?.operation === 'page_dimensions' || diagnostics?.zeroSize === true;
}

/**
 * Rasterise every page, recovering what the per-page pass could not produce.
 *
 * @param {Object} input
 * @param {Array} input.pages — the page elements, in document order
 * @param {(page: any, index: number) => Promise<{dataUrl: string, width: number, height: number}>} input.rasterPage
 * @param {() => Promise<Array<{dataUrl: string, width: number, height: number}|null>>} [input.rasterAll]
 *   — one pass over the whole composition, one entry per page, in the same order
 * @returns {Promise<{rasters: Array, diagnostics: Object}>}
 * @throws {Error} a failure carrying `captureDiagnostics` when no pass could
 *   rasterise a page
 */
export async function collectPageRasters({ pages, rasterPage, rasterAll = null }) {
  const list = Array.isArray(pages) ? pages : [];
  const rasters = new Array(list.length).fill(null);
  const diagnostics = {
    operation: RESILIENCE_OPERATION.PAGE,
    pages: list.length,
    scales: [],
    recovered: [],
    skipped: [],
    failed: [],
    fallback: RESILIENCE_OPERATION.NONE,
    fallbackFailed: null,
  };
  const unresolved = [];

  for (let index = 0; index < list.length; index += 1) {
    try {
      const raster = await rasterPage(list[index], index);
      if (!raster?.dataUrl) {
        throw pageCaptureFailure(
          new Error('The page produced no image data.'),
          { pageNumber: index + 1, operation: RESILIENCE_OPERATION.PAGE, heading: null },
        );
      }
      rasters[index] = raster;
      if (Number.isFinite(raster.scale)) diagnostics.scales.push({ page: index + 1, scale: raster.scale });
    } catch (error) {
      // A page that measures nothing is not a failed page — it paints nothing, so
      // it is left out of the stored copy and said so.
      if (isZeroSizePageFailure(error)) {
        diagnostics.skipped.push({ page: index + 1, reason: 'page_measures_nothing' });
        continue;
      }
      unresolved.push({ index, error });
    }
  }

  if (unresolved.length > 0 && typeof rasterAll === 'function') {
    diagnostics.fallback = RESILIENCE_OPERATION.FALLBACK;
    let all = null;
    try {
      all = await rasterAll();
    } catch (error) {
      diagnostics.fallbackFailed = String(error?.message || error).slice(0, 240);
    }
    if (Array.isArray(all)) {
      for (const entry of unresolved) {
        const recovered = all[entry.index];
        if (!recovered?.dataUrl) continue;
        rasters[entry.index] = recovered;
        diagnostics.recovered.push({
          page: entry.index + 1,
          fromOperation: entry.error?.captureDiagnostics?.operation || RESILIENCE_OPERATION.PAGE,
        });
      }
    }
  }

  for (const entry of unresolved) {
    if (rasters[entry.index]) continue;
    const pageDiagnostics = entry.error?.captureDiagnostics || null;
    diagnostics.failed.push({
      page: entry.index + 1,
      operation: pageDiagnostics?.operation || RESILIENCE_OPERATION.PAGE,
      heading: pageDiagnostics?.heading || null,
      message: String(entry.error?.message || entry.error).slice(0, 240),
    });
  }

  const stored = rasters.filter(Boolean).length;
  if (stored === 0) {
    diagnostics.failed.push({
      page: null,
      operation: 'no_page_rasterised',
      heading: null,
      message: 'No page of this composition could be rasterised, so there is no document to store.',
    });
  }
  if (diagnostics.failed.length > 0) throw buildResilienceFailure(diagnostics);

  return { rasters, diagnostics };
}

/** The failure a capture stops on: the pages, the operations and the reasons. */
export function buildResilienceFailure(diagnostics) {
  const first = diagnostics.failed[0] || null;
  const error = new Error(first?.page
    ? `Library capture page ${first.page} (${first.heading || 'untitled'}), ${first.operation}: ${first.message}`
    : first?.message || 'The document could not be captured.');
  error.captureDiagnostics = {
    operation: 'library_page_capture',
    pages: diagnostics.pages,
    failed: diagnostics.failed,
    recovered: diagnostics.recovered,
    skipped: diagnostics.skipped,
    fallback: diagnostics.fallback,
    fallbackFailed: diagnostics.fallbackFailed,
    scales: diagnostics.scales,
  };
  return error;
}

export default collectPageRasters;