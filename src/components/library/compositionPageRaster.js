/**
 * compositionPageRaster.js
 * ------------------------
 * Rasterising ONE page of a mounted print composition, and the two safety rules
 * that keep a page from coming back as an empty canvas.
 *
 * What fails in the browser, exactly:
 *
 *   html2canvas sizes its canvas from the bounds it measures on the CLONED page
 *   and rasterises through a clone window whose viewport was handed to it. A
 *   page whose clone measures nothing returns a 0 × 0 canvas — and
 *   `canvas.toDataURL('image/png')` on a zero-size canvas returns the string
 *   `data:,` rather than throwing. The capture then reports "Canvas did not
 *   return PNG data", the whole Project Library copy is abandoned and the
 *   designer is left with the downloaded PDF and a storage failure.
 *
 * Two things stop that here, neither of which changes the document:
 *
 *   1. The viewport handed to html2canvas covers the WHOLE composition (the
 *      document's own scroll height and the last page's bottom edge), never the
 *      fixed height of the hidden capture frame. A page laid out below that
 *      height, cloned into a viewport shorter than itself, is what produces the
 *      empty canvas.
 *   2. The render scale is clamped to a pixel budget, so an unusually tall or
 *      wide page is rasterised at a lower but still legible scale instead of a
 *      canvas the browser silently refuses to allocate.
 *
 * Pure measurement plus the raster calls. No storage, no PDF, no React.
 */

import capturePagePng, { inspectCanvasPng } from '@/components/library/capturePagePng';

/** A canvas this large is safe in every browser the app supports (16 MP). */
export const MAX_CAPTURE_PIXELS = 16 * 1024 * 1024;
/** The scale a page is rasterised at when nothing forces it lower. */
export const PREFERRED_RENDER_SCALE = 2;
/** Below this the stored page stops being legible; the capture never goes lower. */
export const MIN_RENDER_SCALE = 1;
/** A clone viewport taller than this is capped: no composition is this tall. */
const MAX_VIEWPORT_PX = 30000;

/** A page element's own rendered size, in CSS pixels. */
export function pagePixelSize(element) {
  const rect = element?.getBoundingClientRect?.() || null;
  return {
    widthPx: Math.max(Number(rect?.width) || 0, 0),
    heightPx: Math.max(Number(rect?.height) || 0, 0),
  };
}

/**
 * The render scale for one page: the preferred scale, reduced only as far as the
 * pixel budget requires, and never below the legibility floor.
 */
export function resolveCaptureScale({
  widthPx = 0,
  heightPx = 0,
  preferredScale = PREFERRED_RENDER_SCALE,
  maxPixels = MAX_CAPTURE_PIXELS,
  minScale = MIN_RENDER_SCALE,
} = {}) {
  const preferred = Math.max(minScale, Number(preferredScale) || minScale);
  const area = (Number(widthPx) || 0) * (Number(heightPx) || 0);
  if (!area) return preferred;
  const budget = Math.sqrt(maxPixels / area);
  if (budget >= preferred) return preferred;
  if (budget <= minScale) return minScale;
  return Math.round(budget * 100) / 100;
}

/**
 * The viewport html2canvas is given for this composition: wide enough and tall
 * enough to hold the whole document, so a page is never cloned into a viewport
 * shorter than itself.
 */
export function captureViewport(frame, pages = []) {
  const win = frame?.contentWindow || null;
  const scope = frame?.contentDocument || null;
  const bottoms = (Array.isArray(pages) ? pages : [])
    .map((page) => Number(page?.getBoundingClientRect?.().bottom) || 0);
  const documentHeight = Math.max(
    Number(scope?.documentElement?.scrollHeight) || 0,
    Number(scope?.body?.scrollHeight) || 0,
    ...bottoms,
    0,
  );
  const documentWidth = Math.max(
    Number(scope?.documentElement?.scrollWidth) || 0,
    Number(scope?.body?.scrollWidth) || 0,
    0,
  );
  return {
    width: Math.max(Number(win?.innerWidth) || 0, documentWidth, 1),
    height: Math.min(Math.max(Number(win?.innerHeight) || 0, documentHeight, 1), MAX_VIEWPORT_PX),
  };
}

/** One page rasterised on its own. Throws a pageCaptureFailure when it cannot be. */
export function rasterisePage(element, { pageNumber, scale, windowWidth, windowHeight }) {
  return capturePagePng(element, pageNumber, {
    backgroundColor: '#FFFFFF',
    scale,
    useCORS: true,
    logging: false,
    windowWidth,
    windowHeight,
    scrollX: 0,
    scrollY: 0,
  });
}

/**
 * EVERY page of the composition rasterised in ONE pass and cut out of that single
 * canvas, page by page.
 *
 * This is the recovery path for a page whose own capture returned no PNG data: a
 * page that measures nothing when cloned on its own still rasterises correctly as
 * part of the composition it sits in. Each page is cut at its own measured
 * rectangle, so the recovered page IS that page — nothing is reflowed,
 * re-paginated or re-measured.
 *
 * @returns {Promise<Array<{dataUrl: string, width: number, height: number}|null>>}
 *   one entry per page, in order; null where even this pass produced no PNG data.
 */
export async function rasteriseCompositionPages(container, pages, { scale, windowWidth, windowHeight }) {
  const list = Array.isArray(pages) ? pages : [];
  if (!container || list.length === 0) return list.map(() => null);

  const { canvas } = await capturePagePng(container, 1, {
    backgroundColor: '#FFFFFF',
    scale,
    useCORS: true,
    logging: false,
    windowWidth,
    windowHeight,
    scrollX: 0,
    scrollY: 0,
  });

  const containerRect = container.getBoundingClientRect();
  const ratio = canvas.width / Math.max(Number(containerRect.width) || 0, 1);
  const scope = container.ownerDocument || (typeof document !== 'undefined' ? document : null);

  return list.map((page) => {
    const rect = page?.getBoundingClientRect?.();
    if (!rect || !scope?.createElement) return null;
    const width = Math.round(rect.width * ratio);
    const height = Math.round(rect.height * ratio);
    if (width <= 0 || height <= 0) return null;
    const x = Math.round((rect.left - containerRect.left) * ratio);
    const y = Math.round((rect.top - containerRect.top) * ratio);
    const slice = scope.createElement('canvas');
    slice.width = width;
    slice.height = height;
    const context = slice.getContext?.('2d');
    if (!context) return null;
    context.drawImage(canvas, x, y, width, height, 0, 0, width, height);
    const dataUrl = slice.toDataURL('image/png');
    return inspectCanvasPng(dataUrl).valid ? { dataUrl, width, height } : null;
  });
}

export default rasterisePage;