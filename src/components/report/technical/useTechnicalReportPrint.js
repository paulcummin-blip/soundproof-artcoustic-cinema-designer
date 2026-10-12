/**
 * useTechnicalReportPrint
 * -----------------------
 * How the Technical Report is printed: the report's own filename, printed from an
 * app-owned window so the saved PDF is named by the report rather than by the host
 * tab; the issued copy stored in the project library; and the in-place fallback
 * when the browser refuses that window.
 *
 * Extracted from RP22Report unchanged apart from the preparation itself. Both
 * paths now satisfy the ONE shared print-readiness authority before the print
 * dialogue opens, so neither can print an unprepared report: the window's own
 * document is prepared inside the shared print window, and the in-place path is
 * prepared here. A preparation failure prints nothing and states why.
 *
 * The report's state and refs are passed in rather than re-created, so the page
 * keeps one source of truth for its own print state.
 */

import React from 'react';
import { applyPrintDocumentTitle } from '@/components/report/printDocumentTitle';
import {
  closeTechnicalReportPrintWindow,
  findTechnicalReportPrintNode,
  isTechnicalPrintNotReady,
  printTechnicalReportInPlace,
  printTechnicalReportInWindow,
  TECHNICAL_PRINT_NOT_READY_STATUS,
} from '@/components/report/technical/technicalReportPrintWindow';
import { ISSUED_DOCUMENT_TYPE } from '@/components/library/issuedDocument/issuedDocumentTypes';
import {
  recordIssuedExportInBackground,
  snapshotIssuedComposition,
} from '@/components/library/issuedDocument/recordIssuedExport';
import { REPORT_SNAPSHOT_STATUS } from '@/components/report/reportSnapshotAuthority';

export default function useTechnicalReportPrint({
  title,
  explicitProjectId,
  projectDetails,
  reportVersionId,
  reportSnapshot,
  snapshotFingerprints,
  reportUser,
  printWindowRef,
  cleanupTimeoutRef,
  exportGuardRef,
  printLockRef,
  setAutoPrintDone,
  setExportStatus,
  setExportDebug,
  setIsPrinting,
  setPlanImageDataUrl,
  setPlanDimsImageDataUrl,
  setPlanSpeakerDimsImageDataUrl,
}) {
  const printTechnicalReport = React.useCallback(() => {
    const printWindow = printWindowRef.current;
    printWindowRef.current = null;

    // Exporting this report also stores the issued PDF in the project library,
    // from the SAME print composition, in the background. The export itself is
    // never delayed and never depends on storage. A failure is reported with its
    // reason, and a retry that cannot use a held PDF re-runs this very export.
    recordIssuedExportInBackground({
      identity: {
        projectId: explicitProjectId,
        accountId: projectDetails?.account_id || null,
        documentType: ISSUED_DOCUMENT_TYPE.TECHNICAL,
        title: 'Technical Report',
        filename: title,
        versionId: reportVersionId,
        selectedVersionIds: reportVersionId ? [reportVersionId] : [],
        sourceRecordId: reportSnapshot.saved?.id || null,
        sourceFingerprints: snapshotFingerprints,
        sourceStatusAtExport: reportSnapshot.status === REPORT_SNAPSHOT_STATUS.STALE
          ? 'source_changed'
          : 'current',
        exportedBy: reportUser?.full_name || reportUser?.email || null,
      },
      snapshot: snapshotIssuedComposition(ISSUED_DOCUMENT_TYPE.TECHNICAL),
      retryExport: printTechnicalReport,
    });

    const onDone = () => {
      setAutoPrintDone(true);
      setExportStatus('Done');
      setExportDebug((d) => ({ ...d, isPrinting: false, printReady: false }));
      setIsPrinting(false);
      setPlanImageDataUrl(null);
      setPlanDimsImageDataUrl(null);
      setPlanSpeakerDimsImageDataUrl(null);
      printLockRef.current = false;
      if (cleanupTimeoutRef.current) { clearTimeout(cleanupTimeoutRef.current); cleanupTimeoutRef.current = null; }
      exportGuardRef.current.active = false;
    };

    const printInPlace = () => {
      printTechnicalReportInPlace({
        title,
        node: findTechnicalReportPrintNode(),
        applyTitle: applyPrintDocumentTitle,
        onBeforePrint: () => window.addEventListener('afterprint', () => setAutoPrintDone(true), { once: true }),
      }).then((opened) => {
        if (opened) return;
        // Nothing was printed. The export button remains the retry.
        setExportStatus(TECHNICAL_PRINT_NOT_READY_STATUS);
        onDone();
      });
    };

    if (!printWindow) {
      printInPlace();
      return;
    }

    printTechnicalReportInWindow(printWindow, {
      title,
      node: findTechnicalReportPrintNode(),
      onDone,
    }).then((result) => {
      if (result?.printed) return;
      closeTechnicalReportPrintWindow(printWindow);
      if (isTechnicalPrintNotReady(result)) {
        // The report did not become ready: nothing was printed.
        setExportStatus(TECHNICAL_PRINT_NOT_READY_STATUS);
        onDone();
        return;
      }
      // The window could not be used at all: fall back to printing in place.
      printInPlace();
    });
  }, [
    title,
    explicitProjectId,
    projectDetails,
    reportVersionId,
    reportSnapshot,
    snapshotFingerprints,
    reportUser,
    printWindowRef,
    cleanupTimeoutRef,
    exportGuardRef,
    printLockRef,
    setAutoPrintDone,
    setExportStatus,
    setExportDebug,
    setIsPrinting,
    setPlanImageDataUrl,
    setPlanDimsImageDataUrl,
    setPlanSpeakerDimsImageDataUrl,
  ]);

  return printTechnicalReport;
}