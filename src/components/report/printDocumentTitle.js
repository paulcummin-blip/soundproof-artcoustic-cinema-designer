/**
 * printDocumentTitle
 * ------------------
 * Applies a Sound Proof report filename as the browser's print title.
 *
 * The browser derives the "Save as PDF" filename from the document title, but
 * only from the title of the TOP-LEVEL document it is printing. The app runs
 * inside a host frame while it is being worked on, and that host tab carries a
 * platform title. Setting only the app document's title therefore still exports
 * the file under the host tab's name.
 *
 * This module sets the title on BOTH documents and restores both afterwards:
 *   - the app document (always)
 *   - the host document, when it is reachable (same origin)
 *
 * When the host is not reachable the app title is still applied, and the export
 * simply falls back to the browser's own naming. Nothing throws.
 *
 * Pure DOM helper: no React, no side effects. Safe to import anywhere.
 */

let appTitleBeforePrint = null;
let hostTitleBeforePrint = null;

/** The host (top-level) document, or null when it cannot be reached. */
function hostDocument() {
  if (typeof window === 'undefined') return null;
  try {
    if (!window.top || window.top === window) return null;
    return window.top.document || null;
  } catch {
    return null;
  }
}

/**
 * Apply the report filename as the print title on the app document and, when
 * reachable, the host document. The original titles are remembered once, so
 * repeated calls cannot overwrite the restore point.
 *
 * @param {string} title - the report filename (no .pdf extension)
 */
export function applyPrintDocumentTitle(title) {
  if (typeof document === 'undefined' || !title) return;
  if (appTitleBeforePrint === null) appTitleBeforePrint = document.title;
  document.title = title;

  const host = hostDocument();
  if (!host) return;
  try {
    if (hostTitleBeforePrint === null) hostTitleBeforePrint = host.title;
    host.title = title;
  } catch {
    // The host title is not writable: the app title still applies.
  }
}

/** Restore the titles that were in place before printing. */
export function restorePrintDocumentTitle() {
  if (typeof document !== 'undefined' && appTitleBeforePrint !== null) {
    document.title = appTitleBeforePrint;
    appTitleBeforePrint = null;
  }
  const host = hostDocument();
  if (host && hostTitleBeforePrint !== null) {
    try {
      host.title = hostTitleBeforePrint;
    } catch {
      // Nothing to restore.
    }
    hostTitleBeforePrint = null;
  }
}