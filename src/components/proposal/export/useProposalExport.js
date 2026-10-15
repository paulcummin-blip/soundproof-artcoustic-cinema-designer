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
 * ONE action, ONE document. There is no read-only preview: the editor's only
 * document action is Export Proposal PDF, and a PDF may only be created once
 * every generated narrative section has been explicitly approved, with the
 * evidence check passed. So this hook has a single entry point, `handleExport`,
 * and every gate below applies to it — there is no second, ungated print path
 * through which a PDF could be produced.
 *
 * Readiness is asked in two parts: what a document needs to be COMPOSED at all
 * (the proposal loaded, its written sections present, its comparison evidence in
 * hand, its print resources ready), and the editorial gates that decide whether
 * an issued document may be produced — the copy's own review state and the
 * designer's approval of every generated narrative section. A genuine editorial
 * problem is stated on the click and never silently fails.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { authorizePrint } from './printAuthorization';
import { unresolvedPackageQuantities } from '@/components/proposal/print/proposalPackAuthority';
import { equipmentQuantityMessage } from '@/components/proposal/print/equipmentQuantityAuthority';
import { printFailureDiagnostics } from './printFailureDiagnostics';
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
// The one action this hook performs, and the action the read-only copy layer is
// asked to authorize: an issued export.
const EXPORT_ACTION = 'export';

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
 * Resolve whether this proposal may be exported.
 *
 * Every reason below is a reason no PDF is produced — there is no read-only
 * preview for a block to be a mere warning on instead.
 *
 * @param {Object} options
 * @param {string|null} [options.comparisonBlockReason] — a reason the document
 *   cannot be composed at all (comparison evidence missing or still being read).
 * @param {string|null} [options.issueBlockReason] — the copy layer's own editorial
 *   block: the copy still needs review, so the document may not be issued.
 * @param {string|null} [options.approvalBlockReason] — the human approval rule:
 *   generated narrative sections that no one has approved yet.
 * @returns {string|null} a blocking reason, or null when the export may proceed
 */
export function resolveProposalExportReadiness({
  proposal,
  sections,
  comparisonBlockReason = null,
  issueBlockReason = null,
  approvalBlockReason = null,
}) {
  // The approval rule is asked first: it is the gate the designer acts on, and the
  // one that names the sections still to be read.
  if (approvalBlockReason) return approvalBlockReason;
  if (issueBlockReason) return issueBlockReason;
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
 * The pack is composed from the proposal's own loaded sections. The gates decide
 * whether the export may print it — they never decide whether the document exists
 * on the page, because the export prints the real A4 pack. When the composition
 * cannot be prepared the attempt fails visibly; the application interface is never
 * printed in its place.
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
  // The copy layer's own editorial block: it withholds the export.
  issueBlockReason = null,
  // The human approval rule: generated narrative sections nobody has approved yet.
  // The PDF may not be created before every one of them has been read and approved.
  approvalBlockReason = null,
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
  const [error, setError] = useState(null);
  const [blockedReason, setBlockedReason] = useState(null);
  // Whether the last failure was "the document was not ready", which the designer
  // can simply retry from the toolbar.
  const [retryable, setRetryable] = useState(false);
  // WHY a composition refused to print, when that is the failure: which block,
  // which element, how tall it measured. Null for every other failure. Carried
  // separately from the message because only a master-admin login is shown it.
  const [errorDetail, setErrorDetail] = useState(null);

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

  const runPrint = useCallback(async () => {
    if (printingRef.current) return;

    // Whether THIS attempt stores the composition it prints in the Project
    // Library: only an export carrying an issued document does.
    const shouldRecordIssued = Boolean(issuedDocument?.documentType);

    const reason = resolveProposalExportReadiness({ proposal, sections, comparisonBlockReason, issueBlockReason, approvalBlockReason });
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
    diagnostics.start('attempt', { mode: EXPORT_ACTION });

    setBlockedReason(null);
    setError(null);
    setRetryable(false);
    setErrorDetail(null);
    printingRef.current = true;
    setExporting(true);

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
      // The read-only edit layer, under the same access controls, is asked first:
      // the export is authorized server-side against exactly the document about to
      // be printed — access, evidence and the approval of every generated section —
      // and nothing is printed before that answer arrives.
      diagnostics.start('edit_layer');
      const authorization = await authorizePrint(
        (payload) => base44.functions.invoke('readProposalEditLayer', payload),
        { proposal_id: proposal.id, action: EXPORT_ACTION, rendered_sections: sections, engineering_snapshot: proposal.engineering_snapshot },
      );
      if (!isCurrent()) return;
      diagnostics.done('edit_layer');
      const validation = authorization?.data?.layer?.document_validation;
      if (!validation?.valid) {
        diagnostics.fail('edit_layer', { gate: 'complete_document' });
        throw new Error(authorization?.data?.error || 'The complete proposal must pass validation before export.');
      }

      // EQUIPMENT QUANTITY IS AN INVARIANT, NOT A PREFERENCE (equipmentQuantityAuthority.js).
      // A package row whose count cannot be resolved is an equipment-authority failure,
      // so no document is issued with it: the positions are named and nothing is printed.
      const unresolved = unresolvedPackageQuantities(proposal?.engineering_snapshot);
      if (unresolved.length > 0) {
        diagnostics.fail('edit_layer', { gate: 'equipment_quantity', positions: unresolved });
        throw new Error(equipmentQuantityMessage(unresolved));
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
        if (shouldRecordIssued) {
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
          trace: diagnostics,
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
          }, PRINT_TIMEOUT_MS);
        } else if (result.reason !== 'window_unavailable') {
          // The document did not become ready: NOTHING was printed, and the
          // designer is told which resource held it up.
          diagnostics.fail('print_window_preparation', { reason: result.reason });
          const error = notReadyError(result.message || PRINT_NOT_READY_MESSAGE);
          error.readinessDiagnostics = result.diagnostics;
          throw error;
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
        }, diagnostics);
        preserveCompletedPages(completedRoot);

        cleanupTimeoutRef.current = setTimeout(() => cleanup(printWindow), PRINT_TIMEOUT_MS);

        diagnostics.done('in_page_fallback');
        window.print();
      }

      // The issued copy is taken from the SAME composition this export printed.
      if (isCurrent() && shouldRecordIssued) {
        if (!issuedSnapshot) throw new Error('The completed proposal pages were not preserved for Project Library.');
        recordIssuedExportInBackground({ identity: { ...issuedDocument, filename: settledTitle }, snapshot: issuedSnapshot });
      }
    } catch (err) {
      const notReady = err?.printNotReady === true;
      if (!diagnostics.snapshot().blockedBy) {
        diagnostics.fail(err?.exportBlockedBy || diagnostics.snapshot().marks.filter((mark) => mark.phase === 'started').at(-1)?.operation || 'attempt', {
          printNotReady: notReady,
          blockedBy: err?.exportBlockedBy || null,
        });
      }
      // The trace of this attempt is kept — which operation was outstanding, how
      // long each stage took. It carries no project content, and neither does the
      // pagination record beside it: element identity and millimetres only.
      const trace = diagnostics.snapshot();
      const readinessDetail = printFailureDiagnostics(err, trace);
      recordExportDiagnostics({
        ...trace,
        paginationFailure: err?.paginationDiagnostics ?? null,
        readinessFailure: readinessDetail,
      });
      // A failure raised by an attempt that has already been superseded changes
      // nothing: no error is shown for it, and the window a newer attempt owns is
      // left alone. Its own preparation window is closed here.
      if (!isCurrent()) return;
      setErrorDetail(err?.paginationDiagnostics ?? readinessDetail);
      setError(
        notReady
          ? err.message
          : (err?.response?.data?.error || err?.message
            || 'The proposal PDF could not be prepared for printing.')
      );
      setRetryable(notReady);
      cleanup(printWindow);
    }
  }, [proposal, sections, comparisonBlockReason, issueBlockReason, approvalBlockReason, projectName, dealerName, clientName, projectReference, versionNames, issuedDocument, resolveExportIdentity, cleanup]);

  // The one entry point: the export prepares and prints the real A4 document, and
  // stores the composition it printed in the Project Library.
  const handleExport = useCallback(() => runPrint(), [runPrint]);

  return {
    exporting,
    error,
    // The technical record of a pagination stop, rendered only for a master admin.
    errorDetail,
    blockedReason,
    retryable,
    handleExport,
  };
}