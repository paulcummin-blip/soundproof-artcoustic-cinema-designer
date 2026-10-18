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
 *   4. A composition whose pages can genuinely not be rasterised by either pass is
 *      NOT a missing document. The PDF is the document; the page rasters are only
 *      how its sheets are painted for a preview. So the attempt RETURNS, states
 *      the preview as unavailable, and the caller stores the document without page
 *      images rather than refusing to store anything. No sheet is invented and no
 *      blank page is substituted for one that failed.
 *
 * Pure orchestration: the caller hands in the two raster functions, so every
 * outcome above is exercised by a test without a browser.
 */

import { pageCaptureFailure } from '@/components/library/capturePagePng';
import { PREVIEW_STATUS } from '@/components/library/pdfArtifactAuthority';

/** The operation codes a failure record can carry. */
export const RESILIENCE_OPERATION = Object.freeze({
  PAGE: 'page_raster',
  FALLBACK: 'composition_raster_fallback',
  /** No sheet of the composition could be painted: the copy carries no page preview. */
  PAGE_IMAGES_UNAVAILABLE: 'page_images_unavailable',
  NONE: 'none',
});

export { PREVIEW_STATUS };

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
 * @returns {Promise<{rasters: Array, diagnostics: Object}>} one entry per page —
 *   the raster, or null where that page has none. `diagnostics.previewStatus`
 *   states what the preview is ('available', 'partial', 'unavailable'). It never
 *   decides whether a document exists: the caller holds the PDF, and a
 *   composition with no painted sheet still returns.
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

  // A PAGE IMAGE IS A PREVIEW OF THE DOCUMENT, NEVER THE DOCUMENT. A page that
  // could not be painted is recorded and left out — the reader is told which
  // sheet has no preview — and a composition with NO painted sheet is still the
  // document the designer exported. Both outcomes RETURN: there is no raster
  // condition under which storage is refused.
  diagnostics.pageFailures = diagnostics.failed.filter((entry) => entry.page !== null);
  diagnostics.incomplete = diagnostics.pageFailures.length > 0;
  diagnostics.previewStatus = stored === 0
    ? PREVIEW_STATUS.UNAVAILABLE
    : (stored < list.length ? PREVIEW_STATUS.PARTIAL : PREVIEW_STATUS.AVAILABLE);
  diagnostics.previewUnavailable = stored === 0;

  if (stored === 0) {
    diagnostics.failed.push({
      page: null,
      operation: RESILIENCE_OPERATION.PAGE_IMAGES_UNAVAILABLE,
      heading: null,
      message: 'No sheet of this composition could be rendered as a page image, so this stored copy carries no page preview. The document itself is unaffected.',
    });
  }

  return { rasters, diagnostics };
}

export default collectPageRasters;