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
 *
 * Two modes, ONE document. `handleExport` issues: it passes the
 * complete-document gate and stores the composition it printed in the Project
 * Library. `handlePreview` is genuinely read-only: the same pack, the same print
 * window, the same readiness authority and the same A4 composition, but it
 * creates no issued-export record, changes no proposal status or history, writes
 * no section and regenerates no text — so the document can be inspected before
 * the designer decides to issue or export it. The decision itself lives in
 * ./proposalExportMode, so the non-issuing guarantee is testable on its own.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
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
import {
  recordIssuedExportInBackground,
  snapshotIssuedComposition,
} from '@/components/library/issuedDocument/recordIssuedExport';
import {
  EXPORT_MODE,
  PREVIEW_MODE,
  readLayerAction,
  requiresIssueGate,
  shouldRecordIssuedExport,
} from './proposalExportMode';
import {
  PRINT_NOT_READY_MESSAGE,
  describePrintReadinessFailure,
  preparePrintDocument,
  settleOneFrame,
  waitForDocumentInputs,
} from '@/components/report/printReadiness';

const PRINT_TIMEOUT_MS = 60000;
const EXPORT_BODY_CLASS = 'proposal-export-mode';

/**
 * "The document was not ready" — a failure the designer can act on. It is a real
 * failure: nothing was sent to the printer, so Retry Export must be offered and
 * no incomplete PDF can exist.
 */
function notReadyError(message) {
  const error = new Error(message || PRINT_NOT_READY_MESSAGE);
  error.printNotReady = true;
  return error;
}

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
export function resolveProposalExportReadiness({ proposal, sections, comparisonBlockReason = null }) {
  if (comparisonBlockReason) return comparisonBlockReason;
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
  comparisonBlockReason = null,
  projectName,
  // Optional filename segments: the shared helper omits them when unavailable.
  dealerName = null,
  clientName = null,
  projectReference = null,
  // The exact saved names of the design versions this document was built from:
  // one name for a single-version document, every name for a comparison.
  versionNames = [],
  // When supplied, an issued copy of the exported PDF is stored in the project
  // library in the background. The export itself is unchanged; drafts never
  // reach the library, only the PDF the designer actually exported.
  issuedDocument = null,
  // The document's OWN inputs, resolved before anything is prepared: the identity
  // and display names the export prints. While it is pending, the export waits —
  // so the printed document cannot change because an editor value arrived late.
  // Absent, the props above are used as they stand.
  resolveExportIdentity = null,
}) {
  const [exporting, setExporting] = useState(false);
  // The read-only preview: the same preparation and printing, no issue and no
  // storage. Kept separate only so the toolbar can say which action is running.
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState(null);
  const [blockedReason, setBlockedReason] = useState(null);
  // Whether the last failure was "the document was not ready", which the designer
  // can simply retry from the toolbar.
  const [retryable, setRetryable] = useState(false);

  const printingRef = useRef(false);
  const cleanupTimeoutRef = useRef(null);
  // The app-owned window the pack is printed from, when one could be opened.
  const printWindowRef = useRef(null);

  const cleanup = useCallback(() => {
    if (printingRef.current) {
      printingRef.current = false;
      setExporting(false);
      setPreviewing(false);
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

  const runPrint = useCallback(async (mode = EXPORT_MODE) => {
    if (printingRef.current) return;

    const reason = resolveProposalExportReadiness({ proposal, sections, comparisonBlockReason });
    if (reason) {
      setBlockedReason(reason);
      setError(null);
      setRetryable(false);
      return;
    }

    setBlockedReason(null);
    setError(null);
    setRetryable(false);
    printingRef.current = true;
    setExporting(true);
    setPreviewing(mode === PREVIEW_MODE);

    // The shared filename helper, with the report type this proposal is —
    // System Design Summary / System Design Comparison / Proposal — and the
    // exact saved names of the versions it was built from. This first build only
    // names the window the print is prepared in; the filename the printed
    // document carries is built again below, from the RESOLVED identity.
    const identitySegments = { dealerName, clientName, projectReference };
    const title = buildProposalReportTitle(
      projectName,
      proposal?.proposal_type,
      { ...identitySegments, versionNames }
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
      // The same read-only edit layer, under the same access controls, is asked
      // first in BOTH modes, so a preview cannot show a document this login may
      // not open. An issued export must additionally pass the complete-document
      // gate; a preview deliberately does not, because inspecting the real print
      // document before it is ready to issue is what a preview is for.
      const authorization = await base44.functions.invoke('readProposalEditLayer', { proposal_id: proposal.id, action: readLayerAction(mode), rendered_sections: sections, engineering_snapshot: proposal.engineering_snapshot });
      const validation = authorization?.data?.layer?.document_validation;
      if (requiresIssueGate(mode) && !validation?.valid) throw new Error(authorization?.data?.error || 'The complete proposal must pass validation before export.');

      // 1. The document's OWN inputs are resolved before anything is prepared:
      //    the identity and the saved version names the document prints. This is
      //    the stable snapshot of the document being exported — once it is in
      //    hand, nothing the editor finishes loading afterwards can change what
      //    is prepared. A resolver that fails or runs long stops the export here.
      const inputs = await waitForDocumentInputs(resolveExportIdentity);
      if (!inputs.ok) {
        throw notReadyError(describePrintReadinessFailure({ reason: inputs.reason }));
      }
      const settledIdentity = inputs.value || null;
      const settledVersionNames = settledIdentity?.versionNames?.length
        ? settledIdentity.versionNames
        : versionNames;
      const settledSegments = settledIdentity
        ? {
          dealerName: settledIdentity.dealerName ?? dealerName,
          clientName: settledIdentity.clientName ?? clientName,
          projectReference: settledIdentity.projectReference ?? projectReference,
        }
        : identitySegments;
      const settledTitle = buildProposalReportTitle(
        settledIdentity?.projectName || projectName,
        proposal?.proposal_type,
        { ...settledSegments, versionNames: settledVersionNames }
      );

      // 2. One settled frame, so the inputs just resolved are the ones mounted in
      //    the document that is about to be prepared. Not a stand-in for
      //    readiness — the authority below is what decides that.
      await settleOneFrame();

      const printNode = findPrintNode();
      let printed = false;

      if (printWindow && printNode) {
        // The window's own document is prepared by the shared readiness
        // authority, and the print dialogue opens only when it reports ready.
        const result = await printProposalInWindow(printWindow, {
          title: settledTitle,
          node: printNode,
          onDone: cleanup,
        });
        if (result.printed) {
          printed = true;
          // The window closes itself when the dialog finishes. Settle the button
          // state in case the dialog is left open.
          cleanupTimeoutRef.current = setTimeout(() => {
            printingRef.current = false;
            setExporting(false);
            setPreviewing(false);
          }, PRINT_TIMEOUT_MS);
        } else if (result.reason !== 'window_unavailable') {
          // The document did not become ready: NOTHING was printed, and the
          // designer is told which resource held it up.
          throw notReadyError(result.message || PRINT_NOT_READY_MESSAGE);
        } else {
          closeProposalPrintWindow(printWindowRef.current);
          printWindowRef.current = null;
        }
      }

      if (!printed) {
        // Fallback — popup blocked or the pack is not mounted: print in-page, on
        // the app document and on the host tab. The SAME readiness authority runs
        // first, on this document and on the print node — never a bare
        // animation-frame delay.
        applyPrintDocumentTitle(settledTitle);

        document.body.classList.add(EXPORT_BODY_CLASS);

        const readiness = await preparePrintDocument({ doc: document, root: findPrintNode() });
        if (!readiness.ready) {
          document.body.classList.remove(EXPORT_BODY_CLASS);
          throw notReadyError(describePrintReadinessFailure(readiness));
        }

        cleanupTimeoutRef.current = setTimeout(cleanup, PRINT_TIMEOUT_MS);

        window.print();
      }

      // The issued copy is taken from the SAME composition this export printed —
      // and only for an issued export. A preview never reaches this: nothing is
      // stored, no issued-export record is created and no proposal state changes.
      if (shouldRecordIssuedExport({ mode, issuedDocument })) {
        const issuedSnapshot = snapshotIssuedComposition(issuedDocument.documentType);
        if (issuedSnapshot) recordIssuedExportInBackground({ identity: { ...issuedDocument, filename: settledTitle }, snapshot: issuedSnapshot });
      }
    } catch (err) {
      const notReady = err?.printNotReady === true;
      setError(
        notReady
          ? err.message
          : (err?.response?.data?.error || err?.message
            || (mode === PREVIEW_MODE
              ? 'The document preview could not be prepared for printing.'
              : 'The proposal PDF could not be prepared for printing.'))
      );
      setRetryable(notReady);
      cleanup();
    }
  }, [proposal, sections, comparisonBlockReason, projectName, dealerName, clientName, projectReference, versionNames, issuedDocument, resolveExportIdentity, cleanup]);

  // The two entry points. Both prepare and print the SAME document; only the
  // issued export stores the composition it printed.
  const handleExport = useCallback(() => runPrint(EXPORT_MODE), [runPrint]);
  const handlePreview = useCallback(() => runPrint(PREVIEW_MODE), [runPrint]);

  return { exporting, previewing, error, blockedReason, retryable, handleExport, handlePreview };
}