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
 *
 * Readiness is asked in two parts, because the two actions do not have the same
 * permission: what a document needs to be COMPOSED at all (the proposal loaded,
 * its written sections present, its comparison evidence in hand, its print
 * resources ready) withholds both actions, while the copy layer's own editorial
 * block withholds the ISSUED document alone. A genuine editorial problem is shown
 * as a warning and never stops the designer inspecting the real A4 document.
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
  PRINT_READINESS_REASON,
  describePrintReadinessFailure,
  settleOneFrame,
  waitForDocumentInputs,
} from '@/components/report/printReadiness';
import {
  createExportDiagnostics,
  recordExportDiagnostics,
} from './proposalExportDiagnostics';

import { prepareBrowserProposalFallback } from '@/components/proposal/export/browserProposalFallback';

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
 * Resolve whether this proposal can reach the printer in this mode.
 *
 * @param {Object} options
 * @param {string} [options.mode] — the action being prepared
 * @param {string|null} [options.comparisonBlockReason] — a reason the document
 *   cannot be composed at all (comparison evidence missing or still being read).
 *   It withholds BOTH actions.
 * @param {string|null} [options.issueBlockReason] — the copy layer's own editorial
 *   block: the copy still needs review, so the document may not be issued. It
 *   withholds the EXPORT only.
 * @returns {string|null} a blocking reason, or null when this mode may proceed
 */
export function resolveProposalExportReadiness({
  proposal,
  sections,
  comparisonBlockReason = null,
  issueBlockReason = null,
  mode = EXPORT_MODE,
}) {
  // The issue gate is an export requirement and nothing else: a preview exists so
  // the designer can inspect the document before it is fit to issue, so a genuine
  // editorial problem is a warning on that document rather than a reason to
  // withhold it.
  if (requiresIssueGate(mode) && issueBlockReason) return issueBlockReason;
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

/**
 * Whether the real A4 composition can be mounted on the page.
 *
 * The pack is composed from the proposal's own loaded sections, and it is mounted
 * for BOTH actions: it is the document the designer inspects and the document that
 * is issued. The issue gate decides whether an EXPORT may print it — it never
 * decides whether the document exists on the page, because a preview that cannot
 * show the document is not a preview. When the composition cannot be prepared the
 * attempt fails visibly; the application interface is never printed in its place.
 *
 * @param {{proposal: Object|null, sections: Array}} options
 * @returns {boolean}
 */
export function canMountPrintComposition({ proposal = null, sections = [] } = {}) {
  return Boolean(proposal?.id)
    && (Array.isArray(sections) ? sections : []).some((section) => section?.is_enabled !== false);
}

export function useProposalExport({
  proposal,
  sections,
  comparisonBlockReason = null,
  // The copy layer's own editorial block. It withholds the issued export, and
  // never the read-only preview.
  issueBlockReason = null,
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
  // The attempt currently in flight. Incremented as each one starts, so anything
  // that completes late can tell whether it still belongs to the live attempt.
  const attemptRef = useRef(0);
  const cleanupTimeoutRef = useRef(null);
  // The app-owned window the pack is printed from, when one could be opened.
  const printWindowRef = useRef(null);
  const fallbackCleanupRef = useRef(null);

  const cleanup = useCallback((win = printWindowRef.current) => {
    fallbackCleanupRef.current?.();
    fallbackCleanupRef.current = null;
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
    // Only the window handed in is taken down — an attempt that finishes late
    // never closes the preparation window a newer attempt owns.
    if (win) closeProposalPrintWindow(win);
    if (printWindowRef.current === win) printWindowRef.current = null;
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
      fallbackCleanupRef.current?.();
      fallbackCleanupRef.current = null;
      if (cleanupTimeoutRef.current) clearTimeout(cleanupTimeoutRef.current);
      document.body.classList.remove(EXPORT_BODY_CLASS);
      restorePrintDocumentTitle();
      closeProposalPrintWindow(printWindowRef.current);
      printWindowRef.current = null;
    };
  }, [cleanup]);

  const runPrint = useCallback(async (mode = EXPORT_MODE) => {
    if (printingRef.current) return;

    const reason = resolveProposalExportReadiness({ proposal, sections, comparisonBlockReason, issueBlockReason, mode });
    if (reason) {
      setBlockedReason(reason);
      setError(null);
      setRetryable(false);
      return;
    }

    // One attempt, one lifecycle. Everything below belongs to THIS attempt: a
    // continuation that arrives after it has failed, or after a newer attempt has
    // begun, ends quietly instead of writing state, closing a newer window or
    // printing twice. Retry is a fresh attempt with a fresh lifecycle.
    const attemptId = attemptRef.current + 1;
    attemptRef.current = attemptId;
    const isCurrent = () => attemptRef.current === attemptId;
    const diagnostics = createExportDiagnostics({ scope: 'proposal-export-attempt' });
    diagnostics.start('attempt', { mode });

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
    diagnostics.start('print_window');
    const printWindow = openProposalPrintWindow(title);
    printWindowRef.current = printWindow;
    diagnostics.done('print_window', { opened: Boolean(printWindow) });

    try {
      // The same read-only edit layer, under the same access controls, is asked
      // first in BOTH modes, so a preview cannot show a document this login may
      // not open. An issued export must additionally pass the complete-document
      // gate; a preview deliberately does not, because inspecting the real print
      // document before it is ready to issue is what a preview is for.
      diagnostics.start('edit_layer');
      const authorization = await base44.functions.invoke('readProposalEditLayer', { proposal_id: proposal.id, action: readLayerAction(mode), rendered_sections: sections, engineering_snapshot: proposal.engineering_snapshot });
      if (!isCurrent()) return;
      diagnostics.done('edit_layer');
      const validation = authorization?.data?.layer?.document_validation;
      if (requiresIssueGate(mode) && !validation?.valid) {
        diagnostics.fail('edit_layer', { gate: 'complete_document' });
        throw new Error(authorization?.data?.error || 'The complete proposal must pass validation before export.');
      }

      // 1. The document's OWN inputs are resolved before anything is prepared:
      //    the identity and the saved version names the document prints. This is
      //    the stable snapshot of the document being exported — once it is in
      //    hand, nothing the editor finishes loading afterwards can change what
      //    is prepared. A resolver that fails or runs long stops the export here.
      diagnostics.start('document_inputs');
      const inputs = await waitForDocumentInputs(resolveExportIdentity);
      if (!inputs.ok) {
        // WHICH operation held preparation up is kept in the internal trace
        // (`readLastExportDiagnostics`); the designer reads one plain sentence
        // naming the cause, and Retry prepares the document again from scratch.
        diagnostics.fail('document_inputs', { reason: inputs.reason });
        throw notReadyError(describePrintReadinessFailure({ reason: inputs.reason }));
      }
      diagnostics.done('document_inputs');
      if (!isCurrent()) return;
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

      // 2. One SETTLED frame, so the inputs just resolved are the ones mounted in
      //    the document that is about to be prepared. The wait is bounded: a
      //    suspended or throttled frame cannot hold the export open, and an
      //    expired frame is recorded rather than mistaken for readiness — the
      //    resource authority below is what decides that.
      diagnostics.start('animation_frame');
      const settledFrame = await settleOneFrame();
      if (settledFrame.expired) diagnostics.expire('animation_frame', { elapsedMs: settledFrame.elapsedMs });
      else diagnostics.done('animation_frame', { elapsedMs: settledFrame.elapsedMs });
      if (!isCurrent()) return;

      const printNode = findPrintNode();
      let printed = false;
      let issuedSnapshot = null;
      const preserveCompletedPages = (root) => {
        if (shouldRecordIssuedExport({ mode, issuedDocument })) {
          issuedSnapshot = snapshotIssuedComposition(issuedDocument.documentType, root);
        }
      };

      if (printWindow && printNode) {
        // The window's own document is prepared by the shared readiness
        // authority, and the print dialogue opens only when it reports ready.
        diagnostics.start('print_window_preparation');
        const result = await printProposalInWindow(printWindow, {
          title: settledTitle,
          node: printNode,
          onComposed: preserveCompletedPages,
          onDone: () => { if (isCurrent()) cleanup(printWindow); },
        });
        if (!isCurrent()) return;
        if (result.printed) {
          printed = true;
          diagnostics.done('print_window_preparation');
          // The window closes itself when the dialog finishes. Settle the button
          // state in case the dialog is left open.
          cleanupTimeoutRef.current = setTimeout(() => {
            if (!isCurrent()) return;
            printingRef.current = false;
            setExporting(false);
            setPreviewing(false);
          }, PRINT_TIMEOUT_MS);
        } else if (result.reason !== 'window_unavailable') {
          // The document did not become ready: NOTHING was printed, and the
          // designer is told which resource held it up.
          diagnostics.fail('print_window_preparation', { reason: result.reason });
          throw notReadyError(result.message || PRINT_NOT_READY_MESSAGE);
        } else {
          diagnostics.done('print_window_preparation', { reason: result.reason });
          closeProposalPrintWindow(printWindow);
          if (printWindowRef.current === printWindow) printWindowRef.current = null;
        }
      }

      if (!printed) {
        if (!isCurrent()) return;
        // Fallback — the print window was blocked: print in-page, on the app
        // document and on the host tab, from the SAME mounted pack node. The SAME
        // readiness authority runs first, on this document and on the print node —
        // never a bare animation-frame delay. The application interface is never
        // printed in the pack's place: with no composition mounted there is no
        // document to print, so the attempt fails visibly and can be retried.
        const fallbackNode = findPrintNode();
        if (!fallbackNode) {
          diagnostics.fail('in_page_fallback', { reason: PRINT_READINESS_REASON.COMPOSITION_UNAVAILABLE });
          throw notReadyError(describePrintReadinessFailure({
            reason: PRINT_READINESS_REASON.COMPOSITION_UNAVAILABLE,
          }));
        }
        diagnostics.start('in_page_fallback');
        applyPrintDocumentTitle(settledTitle);

        document.body.classList.add(EXPORT_BODY_CLASS);

        const completedRoot = await prepareBrowserProposalFallback(fallbackNode, (dispose) => {
          fallbackCleanupRef.current = dispose;
        });
        preserveCompletedPages(completedRoot);

        cleanupTimeoutRef.current = setTimeout(() => cleanup(printWindow), PRINT_TIMEOUT_MS);

        diagnostics.done('in_page_fallback');
        window.print();
      }

      // The issued copy is taken from the SAME composition this export printed —
      // and only for an issued export. A preview never reaches this: nothing is
      // stored, no issued-export record is created and no proposal state changes.
      if (isCurrent() && shouldRecordIssuedExport({ mode, issuedDocument })) {
        if (!issuedSnapshot) throw new Error('The completed proposal pages were not preserved for Project Library.');
        recordIssuedExportInBackground({ identity: { ...issuedDocument, filename: settledTitle }, snapshot: issuedSnapshot });
      }
    } catch (err) {
      const notReady = err?.printNotReady === true;
      if (!diagnostics.snapshot().blockedBy) {
        diagnostics.fail('attempt', {
          printNotReady: notReady,
          blockedBy: err?.exportBlockedBy || null,
        });
      }
      // The trace of this attempt is kept — which operation was outstanding, how
      // long each stage took. It carries no project content.
      recordExportDiagnostics(diagnostics.snapshot());
      // A failure raised by an attempt that has already been superseded changes
      // nothing: no error is shown for it, and the window a newer attempt owns is
      // left alone. Its own preparation window is closed here.
      if (!isCurrent()) return;
      setError(
        notReady
          ? err.message
          : (err?.response?.data?.error || err?.message
            || (mode === PREVIEW_MODE
              ? 'The document preview could not be prepared for printing.'
              : 'The proposal PDF could not be prepared for printing.'))
      );
      setRetryable(notReady);
      cleanup(printWindow);
    }
  }, [proposal, sections, comparisonBlockReason, issueBlockReason, projectName, dealerName, clientName, projectReference, versionNames, issuedDocument, resolveExportIdentity, cleanup]);

  // The two entry points. Both prepare and print the SAME document; only the
  // issued export stores the composition it printed.
  const handleExport = useCallback(() => runPrint(EXPORT_MODE), [runPrint]);
  const handlePreview = useCallback(() => runPrint(PREVIEW_MODE), [runPrint]);

  return { exporting, previewing, error, blockedReason, retryable, handleExport, handlePreview };
}