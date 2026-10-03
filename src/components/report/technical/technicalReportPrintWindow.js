/**
 * technicalReportPrintWindow
 * --------------------------
 * Prints the Technical Report from a top-level window the app owns, so the saved
 * PDF is named by the report —
 * "Sound Proof - Artcoustic Cinema Designer - Technical - [Dealer] - …" —
 * rather than by the host tab the app happens to be running in.
 *
 * Printing in place cannot name the file: the browser derives the saved filename
 * from the title of the TOP-LEVEL document, and while the app runs inside a host
 * page (the workspace preview, a portal page) that document belongs to the host
 * and its title is not writable. A document the app owns is the only place a
 * filename can be written.
 *
 * The mechanism is shared with every other report export — see
 * `@/components/report/reportPrintWindow`. This module supplies only the
 * Technical Report's print composition: the `.print-only` layout block the
 * report mounts, which carries the whole PDF, and its print rules.
 *
 * The wrapper is printed rather than `.print-root` alone, because the report's
 * print stylesheet is written against `.print-only …` descendants — copying the
 * wrapper keeps every one of those rules matching.
 */

import {
  findReportPrintNode,
  openReportPrintWindow,
  printReportInWindow,
  closeReportPrintWindow,
} from '@/components/report/reportPrintWindow';

/** The mounted print-only layout — the report's entire PDF composition. */
export const TECHNICAL_PRINT_NODE_SELECTOR = '.print-only.print-keep-layout';

/** The wrapper is hidden on screen in the app; in its own window it is the page. */
const PRINT_WINDOW_CSS = '@media screen {\n    .print-only.print-keep-layout { display: block !important; }\n  }';

/** The mounted Technical Report print layout, or null when it is not rendered. */
export function findTechnicalReportPrintNode(root) {
  return findReportPrintNode(TECHNICAL_PRINT_NODE_SELECTOR, root);
}

/**
 * Open the app-owned print window. MUST be called synchronously from the export
 * click, while the browser still treats the action as a user gesture.
 *
 * @param {string} title - the report's own filename (no .pdf extension)
 * @returns {Window|null} the window, or null when it could not be opened
 */
export function openTechnicalReportPrintWindow(title) {
  return openReportPrintWindow(title);
}

/** Close the print window, tolerating a window the browser already closed. */
export function closeTechnicalReportPrintWindow(win) {
  closeReportPrintWindow(win);
}

/**
 * Write the report into the print window, print it, and close the window when
 * the print dialog finishes.
 *
 * @param {Window|null} win - from openTechnicalReportPrintWindow
 * @param {{title: string, node: Element, onDone?: Function}} options
 * @returns {Promise<boolean>} true when the print dialog was opened
 */
export async function printTechnicalReportInWindow(win, { title, node, onDone } = {}) {
  return printReportInWindow(win, {
    title,
    node,
    extraCss: PRINT_WINDOW_CSS,
    onDone,
  });
}