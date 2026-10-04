/**
 * compositionCapture.js
 * ---------------------
 * Turns a mounted print composition into a stored PDF that is page-for-page the
 * document the export prints.
 *
 * How it stays faithful:
 *   - the SAME node the export prints is cloned (the caller clones it at click
 *     time, before any export state is cleared)
 *   - the SAME application stylesheets are copied into an isolated capture
 *     document, with print-media rules applied to the screen so the page frames
 *     lay out at their printed size, and screen-media rules suppressed
 *   - the capture document is exactly the A4 content width (210mm − 2 × 12mm),
 *     so a full-width print container measures as it does on paper
 *   - each page frame becomes exactly one A4 page, placed inside the same 12mm
 *     page margin the print stylesheet declares
 *
 * If a page frame does not fit the printable area, the capture FAILS rather than
 * storing a document that differs from what was printed. A failed capture never
 * creates a Library asset.
 *
 * Only already-installed tooling is used: html2canvas for the page raster and
 * jsPDF to assemble the pages.
 */

import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

const MM_PER_INCH = 25.4;
const CSS_PX_PER_INCH = 96;
const MM_TO_PX = CSS_PX_PER_INCH / MM_PER_INCH;

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
/** The page margin the report print stylesheets declare. */
export const PAGE_MARGIN_MM = 12;
const CONTENT_WIDTH_MM = A4_WIDTH_MM - PAGE_MARGIN_MM * 2;
const CONTENT_HEIGHT_MM = A4_HEIGHT_MM - PAGE_MARGIN_MM * 2;
/** Sub-millimetre rounding is not a fidelity failure. */
const FIT_TOLERANCE_MM = 2;
const RENDER_SCALE = 2;
const CAPTURE_VIEWPORT_HEIGHT_PX = 4000;

function escapeHtml(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Print rules apply on screen inside the capture document; screen rules (which
 * hide the print-only compositions) are made inert. Both transforms are global
 * string replacements so a nested media block is handled too.
 */
function transformStylesForCapture(css) {
  return String(css || '')
    .replace(/@media\s+print/gi, '@media all')
    .replace(/@media\s+screen/gi, '@media not all');
}

/** Every stylesheet the app is rendering right now, captured for the clone. */
function captureStylesMarkup() {
  if (typeof document === 'undefined' || !document.querySelectorAll) return '';
  return Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
    .map((el) => {
      if (el.tagName === 'STYLE') return transformStylesForCapture(el.textContent || '');
      const href = el.getAttribute('href');
      return href ? `@import url("${escapeHtml(href)}");` : '';
    })
    .filter(Boolean)
    .join('\n');
}

/**
 * The print-only compositions are hidden on screen; in the capture document
 * they are the page, so they are shown explicitly.
 */
const CAPTURE_OVERRIDES = `
  html, body { margin: 0; padding: 0; background: #FFFFFF; }
  .print-only, .client-report-print-only, .proposal-print-portal, .client-report-print-root { display: block !important; }
  .client-report-screen-only, .screen-only, .no-print { display: none !important; }
`;

function createCaptureFrame(documentHtml) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.setAttribute('title', 'Issued document capture');
  frame.style.cssText = `position:fixed;left:-20000px;top:0;width:${CONTENT_WIDTH_MM}mm;height:${CAPTURE_VIEWPORT_HEIGHT_PX}px;border:0;background:#FFFFFF;`;
  document.body.appendChild(frame);

  const frameDocument = frame.contentDocument;
  frameDocument.open();
  frameDocument.write(documentHtml);
  frameDocument.close();
  return frame;
}

function captureDocumentHtml({ nodeHtml, bodyClass, styles }) {
  const baseHref = typeof document !== 'undefined' ? document.baseURI : '';
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<base href="${escapeHtml(baseHref)}">
<style>${styles}</style>
<style>${CAPTURE_OVERRIDES}</style>
</head>
<body class="${escapeHtml(bodyClass)}">${nodeHtml}</body>
</html>`;
}

function waitForFrameAssets(frame) {
  return new Promise((resolve) => {
    let win = null;
    try {
      win = frame.contentWindow;
    } catch {
      resolve();
      return;
    }
    const fonts = win?.document?.fonts?.ready?.catch(() => {}) || Promise.resolve();
    const images = Array.from(win?.document?.images || []);
    const pending = images.filter((img) => !img.complete);
    const imagesSettled = pending.length === 0
      ? Promise.resolve()
      : new Promise((done) => {
        let remaining = pending.length;
        const timer = setTimeout(done, 6000);
        const finish = () => {
          remaining -= 1;
          if (remaining <= 0) {
            clearTimeout(timer);
            done();
          }
        };
        pending.forEach((img) => {
          img.addEventListener('load', finish, { once: true });
          img.addEventListener('error', finish, { once: true });
        });
      });

    Promise.all([fonts, imagesSettled]).then(() => {
      const raf = win.requestAnimationFrame?.bind(win);
      if (!raf) {
        resolve();
        return;
      }
      raf(() => raf(() => setTimeout(resolve, 60)));
    }).catch(() => resolve());
  });
}

/**
 * The outermost page frames, in document order. A frame nested inside another
 * frame is part of it, not a page of its own; a frame with no rendered size is
 * not a printed page.
 */
function collectPageFrames(scope, pageSelector) {
  const candidates = Array.from(scope.querySelectorAll(pageSelector));
  return candidates.filter((element) => {
    if (candidates.some((other) => other !== element && other.contains(element))) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 1 && rect.height > 1;
  });
}

function pageSizeMm(element) {
  const rect = element.getBoundingClientRect();
  return { widthMm: rect.width / MM_TO_PX, heightMm: rect.height / MM_TO_PX };
}

/**
 * Capture a composition into a PDF blob.
 *
 * @param {Object} params
 * @param {string} params.nodeHtml  the cloned print composition
 * @param {string} params.pageSelector the page frames inside it
 * @param {string} params.bodyClass  the export body class
 * @returns {Promise<{blob: Blob, pageCount: number}>}
 */
export async function captureCompositionToPdf({ nodeHtml, pageSelector, bodyClass = '' }) {
  if (!nodeHtml || !pageSelector) {
    throw new Error('The print composition could not be captured.');
  }

  const styles = captureStylesMarkup();
  const frame = createCaptureFrame(captureDocumentHtml({ nodeHtml, bodyClass, styles }));

  try {
    await waitForFrameAssets(frame);

    const scope = frame.contentDocument;
    const pages = collectPageFrames(scope, pageSelector);
    if (pages.length === 0) {
      throw new Error('The print composition carried no printable pages.');
    }

    pages.forEach((page, index) => {
      const { widthMm, heightMm } = pageSizeMm(page);
      if (widthMm > CONTENT_WIDTH_MM + FIT_TOLERANCE_MM || heightMm > CONTENT_HEIGHT_MM + FIT_TOLERANCE_MM) {
        throw new Error(`Page ${index + 1} does not fit the printed page area.`);
      }
    });

    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const win = frame.contentWindow;

    for (let index = 0; index < pages.length; index += 1) {
      const canvas = await html2canvas(pages[index], {
        backgroundColor: '#FFFFFF',
        scale: RENDER_SCALE,
        useCORS: true,
        logging: false,
        windowWidth: win?.innerWidth,
        windowHeight: win?.innerHeight,
        scrollX: 0,
        scrollY: 0,
      });

      let renderWidthMm = CONTENT_WIDTH_MM;
      let renderHeightMm = (canvas.height / canvas.width) * CONTENT_WIDTH_MM;
      if (renderHeightMm > CONTENT_HEIGHT_MM) {
        renderHeightMm = CONTENT_HEIGHT_MM;
        renderWidthMm = (canvas.width / canvas.height) * CONTENT_HEIGHT_MM;
      }

      if (index > 0) pdf.addPage();
      pdf.addImage(
        canvas.toDataURL('image/png'),
        'PNG',
        PAGE_MARGIN_MM + (CONTENT_WIDTH_MM - renderWidthMm) / 2,
        PAGE_MARGIN_MM,
        renderWidthMm,
        renderHeightMm,
        undefined,
        'FAST',
      );
    }

    return { blob: pdf.output('blob'), pageCount: pages.length };
  } finally {
    try {
      frame.remove();
    } catch {
      // The frame is already gone.
    }
  }
}

export default captureCompositionToPdf;