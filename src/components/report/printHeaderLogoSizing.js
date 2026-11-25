/**
 * applyPrintHeaderLogoSizing
 * --------------------------
 * Sizes the Sound Proof logo in a report's print header so its rendered width
 * exactly matches the "Powered by Artcoustic Design Intelligence (ADI)"
 * strapline — preserving the logo's fixed aspect ratio — measured in the
 * document that will actually be printed.
 *
 * Why this exists: the on-screen `useStraplineLogoWidth` hook measures the
 * strapline in the app document and bakes a pixel width into the logo's inline
 * style, which must then survive the `outerHTML` clone into the print window
 * and still match the print window's own render. That chain is fragile: the
 * strapline is `display: none` on screen, so the hook measures an off-screen
 * clone whose font resolution and timing can diverge from the print window,
 * and the baked value lands narrower than the strapline actually renders.
 *
 * This runs at print time, in the print window's own document (or, for the
 * in-place path, the app document), AFTER the shared print-readiness authority
 * has loaded the web fonts and measured a stable layout. It measures the
 * exact strapline `<span>` that will be printed and sets the logo to that
 * width, so the logo and strapline are 1:1 in the PDF by construction.
 *
 * Pure DOM helper: no React, no state, no calculations. Presentation only.
 */
import { REPORT_PRINT_HEADER } from './reportPrintHeader';

/**
 * Measure an element's true rendered width. When the element (or an
 * ancestor) is `display: none`, `getBoundingClientRect().width` is 0; fall
 * back to an off-screen clone whose computed font metrics are copied from the
 * original, so it measures the width the element will render at once visible.
 */
function measureElementWidth(doc, el) {
  if (!el) return 0;
  const rect = el.getBoundingClientRect();
  if (rect.width > 0) return rect.width;
  if (!doc.body || !doc.defaultView) return 0;
  const view = doc.defaultView;
  const cs = view.getComputedStyle(el);
  const clone = el.cloneNode(true);
  const s = clone.style;
  s.fontFamily = cs.fontFamily;
  s.fontSize = cs.fontSize;
  s.fontWeight = cs.fontWeight;
  s.letterSpacing = cs.letterSpacing;
  s.textTransform = cs.textTransform;
  s.whiteSpace = cs.whiteSpace || 'nowrap';
  s.display = 'inline-block';
  s.position = 'absolute';
  s.left = '-9999px';
  s.top = '0';
  s.visibility = 'hidden';
  doc.body.appendChild(clone);
  const w = clone.offsetWidth;
  doc.body.removeChild(clone);
  return w > 0 ? w : 0;
}

/**
 * Measure the ADI strapline's rendered width in `doc` and set the Sound Proof
 * logo's inline width/height to match it exactly (height kept proportional via
 * the logo's fixed aspect ratio). Returns true when a logo was sized.
 *
 * @param {Document} doc - the document that will be printed (the print window's
 *   own document for the window path, or the app document for the in-place
 *   path)
 */
export function applyPrintHeaderLogoSizing(doc) {
  if (!doc || typeof doc.querySelector !== 'function') return false;
  const header = doc.querySelector('.sound-proof-print-header');
  if (!header) return false;

  const logo = Array.from(header.children).find((c) => c.tagName === 'IMG');
  if (!logo) return false;

  // The sub-strapline ("Powered by Artcoustic Design Intelligence (ADI)") is
  // the widest branding line and the one the logo must match. Its inline
  // `<span>` is `display: inline-block; white-space: nowrap`, so it shrink-
  // wraps to the text — that span's width is the target.
  const subDiv = header.querySelector('.sound-proof-print-header__strapline--sub');
  const span = subDiv ? subDiv.querySelector('span') : null;
  const width = measureElementWidth(doc, span);
  if (!width || !Number.isFinite(width) || width <= 0) return false;

  const aspect = REPORT_PRINT_HEADER.logoAspectRatio || (1024 / 480);
  logo.style.width = `${width}px`;
  logo.style.height = `${width / aspect}px`;
  logo.style.maxWidth = 'none';
  return true;
}