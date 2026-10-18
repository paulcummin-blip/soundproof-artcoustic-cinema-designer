/**
 * compositionTextPdf.js
 * ---------------------
 * A PDF of the SAME composed pages, rendered as TEXT — the copy Project Library
 * stores when a page image cannot be painted.
 *
 * Why this exists: the stored PDF is the document, and the page images are its
 * preview. When a composition's sheets cannot be rasterised, refusing to store
 * anything loses the document the designer exported for the sake of a preview.
 * Rendering the composed pages' own words onto their own sheets keeps the
 * document: same pages, same wording, same order.
 *
 * What it is NOT: it is not a facsimile. No photograph, chart, drawing or colour
 * is reproduced, because none of them can be without painting the page. Nothing
 * is invented to stand in for them — no blank sheet, no placeholder image, no
 * invented caption — so the copy is stored and named as a copy without page
 * images rather than presented as the printed document.
 *
 * Pure text reading plus jsPDF writes: no html2canvas, no canvas, no image data.
 */

import { jsPDF } from 'jspdf';

/** The Latin face every PDF viewer has, so no font has to be embedded. */
const PDF_FONT = 'helvetica';
/** A sheet's own type stays inside this band, so one page cannot dominate another. */
const MIN_FONT_PT = 7;
const MAX_FONT_PT = 16;
/** Line spacing, as a multiple of the type size. */
const LINE_FACTOR = 1.35;
const PT_TO_MM = 0.352778;
/** A little air between two blocks on the same sheet. */
const BLOCK_GAP_FACTOR = 0.45;

/**
 * The document's own glyphs, made safe for the one Latin face: what a PDF viewer
 * cannot show is dropped rather than drawn as a box, and the app's own
 * typographic characters (×, ±, °, the dashes, the quotes) are already inside the
 * face's range and are kept exactly as written.
 */
export function pdfSafeText(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u00A0/g, ' ')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[\u2022\u25CF]/g, '-')
    // Anything outside the Latin-1 range the face carries is removed, not guessed
    // at: a stray emoji must never become a visible box in a stored document.
    .replace(/[^\u0000-\u00FF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The type size an element is set in, clamped to the sheet's own band. */
function fontSizeOf(element, win) {
  const computed = win?.getComputedStyle?.(element);
  const size = Number.parseFloat(computed?.fontSize || '');
  if (!Number.isFinite(size) || size <= 0) return 10;
  // A CSS pixel is 0.75pt; the render treats anything under the band as body copy.
  const points = size * 0.75;
  return Math.min(Math.max(points, MIN_FONT_PT), MAX_FONT_PT);
}

/** Whether the element paints at all: a hidden block is not part of the document. */
function isPainted(element, win) {
  const computed = win?.getComputedStyle?.(element);
  if (!computed) return true;
  if (computed.display === 'none' || computed.visibility === 'hidden' || computed.opacity === '0') return false;
  const rect = element.getBoundingClientRect?.();
  return Boolean(rect && rect.width > 0 && rect.height > 0);
}

/**
 * The wording of ONE composed page, in the order it is read.
 *
 * The leaves are taken rather than the page's whole text, so a heading keeps its
 * own type size and a table keeps its cell order. Elements are ordered by their
 * measured position, which is the order the sheet is read in.
 *
 * @param {Element} page — a composed page, laid out in the capture document
 * @returns {Array<{text: string, fontSizePt: number, bold: boolean}>}
 */
export function readPageTextBlocks(page) {
  if (!page?.querySelectorAll) return [];
  const win = page.ownerDocument?.defaultView || null;
  const blocks = [];

  Array.from(page.querySelectorAll('*')).forEach((element) => {
    // A leaf carries the wording; its parents are structure.
    if (element.children && element.children.length > 0) return;
    const text = String(element.textContent || '').replace(/\s+/g, ' ').trim();
    if (!text) return;
    if (!isPainted(element, win)) return;
    const rect = element.getBoundingClientRect();
    const weight = Number.parseInt(win?.getComputedStyle?.(element)?.fontWeight || '', 10);
    blocks.push({
      text,
      fontSizePt: fontSizeOf(element, win),
      bold: Number.isFinite(weight) ? weight >= 600 : false,
      top: rect.top,
      left: rect.left,
    });
  });

  return blocks
    .sort((a, b) => (a.top - b.top) || (a.left - b.left))
    .map(({ text, fontSizePt, bold }) => ({ text, fontSizePt, bold }));
}

/**
 * Render the composed pages' own words into the PDF, one sheet each.
 *
 * The first page is the PDF's own first page; every further composed page takes
 * a page of its own, so the stored copy stays page-for-page with the document.
 * A sheet whose text genuinely does not fit continues onto a following page
 * rather than dropping the end of it: losing wording would be worse than losing
 * page identity, and the continuation is counted and reported.
 *
 * @param {Object} pdf — a jsPDF instance
 * @param {Array<Element>} pages — the composed page elements, in document order
 * @param {{widthMm: number, heightMm: number, marginMm: number}} paper
 * @returns {{pageCount: number, continuations: number, blocks: number}}
 */
export function renderTextPagesToPdf(pdf, pages, paper) {
  const list = Array.isArray(pages) ? pages : [];
  const widthMm = Number(paper?.widthMm) || 210;
  const heightMm = Number(paper?.heightMm) || 297;
  const marginMm = Number.isFinite(Number(paper?.marginMm)) ? Number(paper.marginMm) : 12;
  const contentWidthMm = Math.max(widthMm - marginMm * 2, 40);
  const bottomMm = Math.max(heightMm - marginMm, marginMm + 10);

  let pageCount = 0;
  let continuations = 0;
  let blocks = 0;

  const openSheet = () => {
    // The PDF is created with its first sheet already open; a sheet is added only
    // after one has been written into.
    if (pageCount > 0) pdf.addPage();
    pageCount += 1;
    return marginMm;
  };

  list.forEach((page) => {
    let cursorMm = openSheet();
    const pageBlocks = readPageTextBlocks(page);
    blocks += pageBlocks.length;

    pageBlocks.forEach((block) => {
      const text = pdfSafeText(block.text);
      if (!text) return;
      const sizePt = block.fontSizePt || 10;
      const lineMm = sizePt * PT_TO_MM * LINE_FACTOR;
      pdf.setFont(PDF_FONT, block.bold ? 'bold' : 'normal');
      pdf.setFontSize(sizePt);
      const lines = pdf.splitTextToSize(text, contentWidthMm);
      lines.forEach((line) => {
        if (cursorMm + lineMm > bottomMm) {
          cursorMm = openSheet();
          continuations += 1;
        }
        // jsPDF draws from the text baseline, so the line's own type size lifts it
        // off the top of its line box.
        pdf.text(line, marginMm, cursorMm + sizePt * PT_TO_MM);
        cursorMm += lineMm;
      });
      cursorMm += lineMm * BLOCK_GAP_FACTOR;
    });
  });

  return { pageCount, continuations, blocks };
}

export default renderTextPagesToPdf;