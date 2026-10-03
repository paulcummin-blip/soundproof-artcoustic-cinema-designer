/**
 * proposalPrintWindow
 * -------------------
 * Prints the proposal pack from a top-level window the app owns, so the saved
 * PDF is named by the proposal rather than by the host tab the app runs in.
 *
 * The mechanism itself is shared with every other report export — see
 * `@/components/report/reportPrintWindow`. This module only supplies the
 * proposal's own print composition: the hidden `.proposal-print-portal` node
 * and the export body class its stylesheet is written against.
 *
 * Usage:
 *   const win = openProposalPrintWindow(title);      // synchronous, on the click
 *   await printProposalInWindow(win, { title, node, onDone });
 *   closeProposalPrintWindow(win);                   // if the caller must clean up
 */

import {
  findReportPrintNode,
  openReportPrintWindow,
  printReportInWindow,
  closeReportPrintWindow,
} from '@/components/report/reportPrintWindow';

/** Added to the print window's body so the export stylesheet applies unchanged. */
const PRINT_BODY_CLASS = 'proposal-export-mode';
/** The pack node mounted in the editor by ProposalPrintDocument. */
const PRINT_NODE_SELECTOR = '.proposal-print-portal';
/** The pack is hidden on screen in the app; in its own window it is the page. */
const PRINT_WINDOW_CSS = '@media screen {\n    .proposal-print-portal { display: block !important; }\n  }';

/** The mounted print-only pack node, or null when the editor has not rendered it. */
export function findPrintNode(root) {
  return findReportPrintNode(PRINT_NODE_SELECTOR, root);
}

/**
 * Open the app-owned print window. MUST be called synchronously from the click
 * handler, while the browser still treats the action as a user gesture.
 *
 * @param {string} title - the shared report filename (no .pdf extension)
 * @returns {Window|null} the window, or null when it could not be opened
 */
export function openProposalPrintWindow(title) {
  return openReportPrintWindow(title);
}

/** Close the print window, tolerating a window the browser already closed. */
export function closeProposalPrintWindow(win) {
  closeReportPrintWindow(win);
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
  return printReportInWindow(win, {
    title,
    node,
    bodyClass: PRINT_BODY_CLASS,
    extraCss: PRINT_WINDOW_CSS,
    onDone,
  });
}