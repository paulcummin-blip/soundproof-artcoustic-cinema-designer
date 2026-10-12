/**
 * reportPrintWindow
 * -----------------
 * Prints a Sound Proof report from a top-level window the app owns.
 *
 * The browser names a saved PDF after the title of the TOP-LEVEL document it is
 * printing. While the app is being worked on inside a host page — the platform
 * preview, a portal page — that top-level document belongs to the host, so the
 * export is named after the host tab and no app code can rename it: a document
 * the app does not own has a title it cannot write.
 *
 * This module removes that dependency. It opens a window of the app's own
 * origin, writes the print document into it under the shared report filename,
 * prints from there, and closes it again. The app's stylesheets and the
 * print-only composition are copied verbatim, so the exported document is
 * identical to the in-page export.
 *
 * Shared by every report export path — the proposal pack and the Visual Report
 * both print through this one implementation, so a filename can never be
 * correct in one report and generic in another.
 *
 * Pure DOM helpers: no React, no app state, no calculations.
 *
 * Preparation is NOT decided here: the window's document is written, then the one
 * shared print-readiness authority (`@/components/report/printReadiness`) is
 * satisfied. The print dialogue opens only when that authority reports the
 * document ready — a resource that failed, or a budget that ran out, means
 * nothing is printed and the caller is told why. There is no "print anyway"
 * timeout, because an incomplete PDF is worse than no PDF.
 *
 * Usage:
 *   const win = openReportPrintWindow(title);      // synchronous, on the click
 *   const outcome = await printReportInWindow(win, { title, node, bodyClass });
 *   // outcome.printed === false → nothing was printed; show outcome.message
 *   closeReportPrintWindow(win);                   // if the caller must clean up
 */

import {
  describePrintReadinessFailure,
  preparePrintDocument,
} from '@/components/report/printReadiness';

/** The mounted print-only node inside `root`, or null when it is not rendered. */
export function findReportPrintNode(selector, root) {
  const scope = root || (typeof document !== 'undefined' ? document : null);
  if (!scope || typeof scope.querySelector !== 'function' || !selector) return null;
  return scope.querySelector(selector);
}

function escapeHtmlText(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Every stylesheet the app is rendering right now, copied for the print window. */
function stylesMarkup() {
  if (typeof document === 'undefined' || !document.querySelectorAll) return '';
  return Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
    .map((el) => {
      if (el.tagName === 'STYLE') return `<style>${el.textContent || ''}</style>`;
      const href = el.getAttribute('href');
      return href ? `<link rel="stylesheet" href="${escapeHtmlText(href)}">` : '';
    })
    .filter(Boolean)
    .join('\n');
}

/** Write a whole document into an app-owned window. False when unwritable. */
function writeToWindow(win, html) {
  try {
    win.document.open();
    win.document.write(html);
    win.document.close();
    return true;
  } catch {
    return false;
  }
}

function shellMarkup(title) {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtmlText(title)}</title>
</head>
<body style="margin:0;background:#FFFFFF;font-family:Helvetica,Arial,sans-serif;color:#3E4349">
<p style="padding:24px;font-size:13px">Preparing your PDF…</p>
</body>
</html>`;
}

/**
 * Open the app-owned print window. MUST be called synchronously from the click
 * handler, while the browser still treats the action as a user gesture.
 *
 * The window is opened on the shared filename straight away, so even the
 * placeholder document is named correctly.
 *
 * @param {string} title - the shared report filename (no .pdf extension)
 * @returns {Window|null} the window, or null when it could not be opened
 */
export function openReportPrintWindow(title) {
  if (typeof window === 'undefined' || typeof window.open !== 'function') return null;
  let win = null;
  try {
    win = window.open('', '_blank');
  } catch {
    return null;
  }
  if (!win || win.closed) return null;
  if (!writeToWindow(win, shellMarkup(title))) {
    closeReportPrintWindow(win);
    return null;
  }
  return win;
}

/** Close the print window, tolerating a window the browser already closed. */
export function closeReportPrintWindow(win) {
  if (!win) return;
  try {
    if (!win.closed) win.close();
  } catch {
    // Already gone.
  }
}

/** The outcome of one attempt to print from the app-owned window. */
function outcome(printed, reason = null, message = null) {
  return { printed, reason, message };
}

/**
 * Write the report into the print window, prepare it, print it, and close the
 * window when the print dialog finishes.
 *
 * `window_unavailable` is the only outcome the caller may fall back from: the
 * window could not be used at all, so the in-page path gets a chance. Every
 * other failure means the document was not ready and nothing was printed.
 *
 * @param {Window|null} win - from openReportPrintWindow
 * @param {{title: string, node: Element, bodyClass?: string, extraCss?: string, onDone?: Function}} options
 * @returns {Promise<{printed: boolean, reason: string|null, message: string|null}>}
 */
export async function printReportInWindow(win, { title, node, bodyClass = '', extraCss = '', onDone, prepareComposition } = {}) {
  if (!win || win.closed || !node) return outcome(false, 'window_unavailable');

  // A literal "</script" inside stored rich text would end the document early.
  const content = String(node.outerHTML || '').replace(/<\/script/gi, '<\\/script');
  const baseHref = typeof document !== 'undefined' ? document.baseURI : '';

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<base href="${escapeHtmlText(baseHref)}">
<title>${escapeHtmlText(title)}</title>
${stylesMarkup()}
<style>
  html, body { margin: 0; background: #FFFFFF; }
${extraCss}
</style>
</head>
<body class="${escapeHtmlText(bodyClass)}">
${content}
</body>
</html>`;

  if (!writeToWindow(win, html)) return outcome(false, 'window_unavailable');

  // The one shared readiness authority, satisfied against the print window's own
  // document: stylesheets parsed, fonts applied, every image loaded and decoded,
  // and the layout measured the same twice in a row. Not ready means not printed.
  const readiness = await preparePrintDocument({ win, root: win.document.body });
  if (!readiness.ready) {
    return outcome(false, readiness.reason, describePrintReadinessFailure(readiness));
  }

  // Optional document-owned measured composition, never applied to other reports.
  if (prepareComposition) await prepareComposition(win.document);

  try {
    win.addEventListener('afterprint', () => {
      // The dialog is finished: the window has done its job.
      setTimeout(() => closeReportPrintWindow(win), 400);
      if (typeof onDone === 'function') onDone();
    }, { once: true });
    win.focus();
    win.print();
    return outcome(true);
  } catch {
    return outcome(false, 'print_dialogue_failed');
  }
}