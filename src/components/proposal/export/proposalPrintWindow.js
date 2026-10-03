/**
 * proposalPrintWindow
 * -------------------
 * Prints the proposal pack from a top-level window the app owns.
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
 * print-only pack are copied verbatim, so the exported pack is identical to the
 * in-page export.
 *
 * Pure DOM helpers: no React, no app state, no calculations.
 *
 * Usage:
 *   const win = openProposalPrintWindow(title);      // synchronous, on the click
 *   await printProposalInWindow(win, { title, node, onDone });
 *   closeProposalPrintWindow(win);                   // if the caller must clean up
 */

/** Added to the print window's body so the export stylesheet applies unchanged. */
const PRINT_BODY_CLASS = 'proposal-export-mode';
/** The pack node mounted in the editor by ProposalPrintDocument. */
const PRINT_NODE_SELECTOR = '.proposal-print-portal';
/** How long to wait for the print window's images before printing regardless. */
const IMAGE_WAIT_MS = 4000;

/** The mounted print-only pack node, or null when the editor has not rendered it. */
export function findPrintNode(root) {
  const scope = root || (typeof document !== 'undefined' ? document : null);
  if (!scope || typeof scope.querySelector !== 'function') return null;
  return scope.querySelector(PRINT_NODE_SELECTOR);
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
export function openProposalPrintWindow(title) {
  if (typeof window === 'undefined' || typeof window.open !== 'function') return null;
  let win = null;
  try {
    win = window.open('', '_blank');
  } catch {
    return null;
  }
  if (!win || win.closed) return null;
  if (!writeToWindow(win, shellMarkup(title))) {
    closeProposalPrintWindow(win);
    return null;
  }
  return win;
}

/** Close the print window, tolerating a window the browser already closed. */
export function closeProposalPrintWindow(win) {
  if (!win) return;
  try {
    if (!win.closed) win.close();
  } catch {
    // Already gone.
  }
}

/** Resolve once every image in the print window has loaded, errored or timed out. */
function waitForImages(win) {
  return new Promise((resolve) => {
    let images = [];
    try {
      images = Array.from(win.document.images || []);
    } catch {
      resolve();
      return;
    }
    const pending = images.filter((img) => !img.complete);
    if (pending.length === 0) {
      resolve();
      return;
    }
    let remaining = pending.length;
    const timer = setTimeout(resolve, IMAGE_WAIT_MS);
    const done = () => {
      remaining -= 1;
      if (remaining <= 0) {
        clearTimeout(timer);
        resolve();
      }
    };
    pending.forEach((img) => {
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
    });
  });
}

async function waitForPrintWindowAssets(win) {
  try {
    const fonts = win.document.fonts && win.document.fonts.ready
      ? win.document.fonts.ready.catch(() => {})
      : Promise.resolve();
    await Promise.all([fonts, waitForImages(win)]);
  } catch {
    // Print with whatever has rendered.
  }
}

/**
 * Write the pack into the print window, print it, and close the window when the
 * print dialog finishes.
 *
 * @param {Window|null} win - from openProposalPrintWindow
 * @param {{title: string, node: Element, onDone?: Function}} options
 * @returns {Promise<boolean>} true when the print dialog was opened
 */
export async function printProposalInWindow(win, { title, node, onDone } = {}) {
  if (!win || win.closed || !node) return false;

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
  /* The pack is hidden on screen in the app; in its own window it is the page. */
  @media screen {
    .proposal-print-portal { display: block !important; }
  }
</style>
</head>
<body class="${PRINT_BODY_CLASS}">
${content}
</body>
</html>`;

  if (!writeToWindow(win, html)) return false;

  await waitForPrintWindowAssets(win);

  try {
    win.addEventListener('afterprint', () => {
      // The dialog is finished: the window has done its job.
      setTimeout(() => closeProposalPrintWindow(win), 400);
      if (typeof onDone === 'function') onDone();
    }, { once: true });
    win.focus();
    win.print();
    return true;
  } catch {
    return false;
  }
}