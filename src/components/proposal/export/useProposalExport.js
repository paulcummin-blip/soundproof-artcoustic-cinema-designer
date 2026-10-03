/**
 * useProposalExport
 * -----------------
 * Export lifecycle for the full proposal PDF.
 *
 * Uses the app's established print-based PDF path (window.print + a print-only
 * composition), the same mechanism as the Visual Report / Technical Report.
 * No html2canvas, no jsPDF, no raster screenshots.
 *
 * Responsibilities:
 *   - resolve whether the proposal is ready to export, and if not, say why
 *   - set document.title so "Save as PDF" uses the shared Sound Proof filename
 *   - activate the export body class so only the proposal document prints
 *   - wait for fonts and layout, then print
 *   - clean up on afterprint (with a timeout fallback)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { buildProposalReportTitle } from '@/components/report/reportPdfTitle';
import {
  applyPrintDocumentTitle,
  restorePrintDocumentTitle,
} from '@/components/report/printDocumentTitle';
import {
  openProposalPrintWindow,
  printProposalInWindow,
  closeProposalPrintWindow,
  findPrintNode,
} from './proposalPrintWindow';

const PRINT_TIMEOUT_MS = 60000;
const EXPORT_BODY_CLASS = 'proposal-export-mode';

function stripHtml(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Resolve whether this proposal can be exported.
 * @returns {string|null} a blocking reason, or null when export is allowed
 */
export function resolveProposalExportReadiness({ proposal, sections }) {
  if (!proposal) {
    return 'This proposal could not be loaded. Reopen it from the Proposal Centre and try again.';
  }
  if (proposal.status === 'generating') {
    return 'This proposal is still being generated. Wait for generation to finish, then export.';
  }
  const enabled = (sections || []).filter((section) => section.is_enabled !== false);
  if (enabled.length === 0) {
    return 'This proposal has no sections yet, so there is nothing to export.';
  }
  const written = enabled.filter(
    (section) => section.section_type !== 'cover' && stripHtml(section.body).length > 0
  );
  if (written.length === 0) {
    return 'This proposal has no written content yet. Generate the proposal, then export.';
  }
  return null;
}

export function useProposalExport({
  proposal,
  sections,
  projectName,
  // Optional filename segments: the shared helper omits them when unavailable.
  dealerName = null,
  projectReference = null,
}) {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(null);
  const [blockedReason, setBlockedReason] = useState(null);

  const printingRef = useRef(false);
  const cleanupTimeoutRef = useRef(null);
  // The app-owned window the pack is printed from, when one could be opened.
  const printWindowRef = useRef(null);

  const cleanup = useCallback(() => {
    if (printingRef.current) {
      printingRef.current = false;
      setExporting(false);
    }
    if (typeof document !== 'undefined') {
      document.body.classList.remove(EXPORT_BODY_CLASS);
      // Restores the app title and the host tab title, whichever were replaced.
      restorePrintDocumentTitle();
    }
    closeProposalPrintWindow(printWindowRef.current);
    printWindowRef.current = null;
    if (cleanupTimeoutRef.current) {
      clearTimeout(cleanupTimeoutRef.current);
      cleanupTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    const handler = () => cleanup();
    window.addEventListener('afterprint', handler);
    return () => {
      window.removeEventListener('afterprint', handler);
      if (cleanupTimeoutRef.current) clearTimeout(cleanupTimeoutRef.current);
      document.body.classList.remove(EXPORT_BODY_CLASS);
      restorePrintDocumentTitle();
      closeProposalPrintWindow(printWindowRef.current);
      printWindowRef.current = null;
    };
  }, [cleanup]);

  const handleExport = useCallback(async () => {
    if (printingRef.current) return;

    const reason = resolveProposalExportReadiness({ proposal, sections });
    if (reason) {
      setBlockedReason(reason);
      setError(null);
      return;
    }

    setBlockedReason(null);
    setError(null);
    printingRef.current = true;
    setExporting(true);

    // The shared filename helper, with the report type this proposal is:
    // System Design Summary / System Design Comparison / Proposal.
    const title = buildProposalReportTitle(
      projectName || proposal?.title || 'Proposal',
      proposal?.proposal_type,
      { dealerName, projectReference }
    );

    // A saved PDF is named after the TOP-LEVEL document's title. Inside a host
    // page (the platform preview) that document belongs to the host, and its
    // title cannot be written from here — the export would be named after the
    // host tab. So the pack is printed from a window of this app's own origin,
    // which carries the shared filename as its title. Opened synchronously,
    // while the click still counts as a user gesture.
    const printWindow = openProposalPrintWindow(title);
    printWindowRef.current = printWindow;

    try {
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }

      const printNode = findPrintNode();
      if (printWindow && printNode) {
        const printed = await printProposalInWindow(printWindow, {
          title,
          node: printNode,
          onDone: cleanup,
        });
        if (printed) {
          // The window closes itself when the dialog finishes. Settle the button
          // state in case the dialog is left open.
          cleanupTimeoutRef.current = setTimeout(() => {
            printingRef.current = false;
            setExporting(false);
          }, PRINT_TIMEOUT_MS);
          return;
        }
      }

      // Fallback — popup blocked or the pack is not mounted: print in-page, on
      // the app document and on the host tab where it is reachable.
      closeProposalPrintWindow(printWindowRef.current);
      printWindowRef.current = null;

      applyPrintDocumentTitle(title);

      document.body.classList.add(EXPORT_BODY_CLASS);

      // Two frames so the print document is laid out before the dialog opens.
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      );

      cleanupTimeoutRef.current = setTimeout(cleanup, PRINT_TIMEOUT_MS);

      window.print();
    } catch (err) {
      setError(
        'The proposal PDF could not be prepared for printing. Check your browser print settings and try again.'
      );
      cleanup();
    }
  }, [proposal, sections, projectName, dealerName, projectReference, cleanup]);

  return { exporting, error, blockedReason, handleExport };
}