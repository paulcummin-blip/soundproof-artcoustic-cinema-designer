/**
 * useClientReportPdfExport
 * ------------------------
 * Export lifecycle hook for the Visual Report PDF.
 *
 * The export prints from a top-level window the app owns (see
 * `@/components/report/reportPrintWindow`), opened on the shared report
 * filename. That is what names the saved PDF after the report —
 * "Sound Proof Project Report - [Project] - [Version]" — instead of the host
 * tab the app happens to be running in. When the browser refuses the window
 * (a pop-up blocker), the export falls back to printing in place with the
 * report title applied to the app and host documents.
 *
 * The SVG scales via CSS to fill the drawing region — no JS transform, no
 * html2canvas, no jsPDF, no raster screenshots.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { buildProjectReportTitle } from "@/components/report/reportPdfTitle";
import {
  applyPrintDocumentTitle,
  restorePrintDocumentTitle,
} from "@/components/report/printDocumentTitle";
import {
  findReportPrintNode,
  openReportPrintWindow,
  printReportInWindow,
  closeReportPrintWindow,
} from "@/components/report/reportPrintWindow";
import {
  PRINT_NOT_READY_MESSAGE,
  describePrintReadinessFailure,
  preparePrintDocument,
} from "@/components/report/printReadiness";
import {
  snapshotIssuedComposition,
} from "@/components/library/issuedDocument/recordIssuedExport";
import {
  storeProjectReportPublication,
  retryPublicationDocument,
  PUBLICATION_DOCUMENT,
} from "@/components/report/projectReport/storeProjectReportPublication";

// Version metadata is optional — only present when the project has a saved
// named design version. The filename helper appends it when meaningful.

const PRINT_TIMEOUT_MS = 60000;
/** The report's own root, printed into the app-owned window. */
const PRINT_NODE_SELECTOR = ".client-report-root";
/** Print mode class the Visual Report stylesheet is written against. */
const PRINT_BODY_CLASS = "client-report-printing";
/** The report root paints a light page backdrop on screen; print on white. */
const PRINT_WINDOW_CSS = "@media print {\n    .client-report-root { background: #FFFFFF !important; min-height: 0 !important; }\n  }";

function decodeLogo(url) {
  return new Promise((resolve) => {
    if (!url || typeof Image === "undefined") {
      resolve(false);
      return;
    }
    const img = new Image();
    img.onload = () => {
      if (typeof img.decode === "function") {
        img
          .decode()
          .then(() => resolve(true))
          .catch(() => resolve(true));
      } else {
        resolve(true);
      }
    };
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

export function useClientReportPdfExport({
  activePageCount,
  projectName,
  logoUrl,
  versionNumber,
  versionName,
  // Dealer, client name and project reference are optional filename segments:
  // the shared helper omits them when they are unavailable.
  dealerName = null,
  clientName = null,
  projectReference = null,
  // When supplied, an issued copy of the exported PDF is stored in the project
  // library in the background. The export itself is unchanged.
  issuedDocument = null,
  // The version's Current Speaker Design, when this report carries one. Exporting
  // the report exports the schedule with it, against the SAME version, so the
  // Library holds both without the designer pressing a second button.
  speakerDesignCompanion = null,
}) {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(null);
  // The publication state: both the Project Report PDF and the companion
  // Speaker Design PDF must land before the publication is treated as complete.
  //   idle       — no export has run yet
  //   storing    — capture, upload and record creation are in flight
  //   complete   — both documents are stored
  //   incomplete — one or both documents failed; retry stores only the missing one
  const [publication, setPublication] = useState({
    status: "idle",
    failed: [],
  });
  const printingRef = useRef(false);
  const cleanupTimeoutRef = useRef(null);
  // The app-owned window the report is printed from, when one could be opened.
  const printWindowRef = useRef(null);
  // The export action itself, held stably so a failed Library storage can offer
  // "Retry export and store" against this very export.
  const retryExportRef = useRef(null);
  // The last export's stored parameters, held so a targeted retry can re-store
  // only the document that failed — from the SAME saved authority, without
  // regenerating the one that succeeded or re-running the whole export.
  const lastExportRef = useRef(null);

  const cleanup = useCallback(() => {
    if (printingRef.current) {
      printingRef.current = false;
      setExporting(false);
    }
    if (typeof document !== "undefined") {
      document.body.classList.remove(PRINT_BODY_CLASS);
    }
    restorePrintDocumentTitle();
    if (cleanupTimeoutRef.current) {
      clearTimeout(cleanupTimeoutRef.current);
      cleanupTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    const handler = () => cleanup();
    window.addEventListener("afterprint", handler);
    return () => {
      window.removeEventListener("afterprint", handler);
      if (cleanupTimeoutRef.current) clearTimeout(cleanupTimeoutRef.current);
      closeReportPrintWindow(printWindowRef.current);
      printWindowRef.current = null;
    };
  }, [cleanup]);

  const handleExport = useCallback(async () => {
    if (exporting || printingRef.current) return;
    if (activePageCount === 0) return;

    const title = buildProjectReportTitle(
      projectName,
      { number: versionNumber, name: versionName },
      { dealerName, clientName, projectReference }
    );

    // Open the app-owned print window FIRST, synchronously, while the browser
    // still treats this as a user gesture. The window is opened on the report
    // filename, so the saved PDF is named by the report itself.
    printWindowRef.current = openReportPrintWindow(title);

    printingRef.current = true;
    setExporting(true);
    setError(null);

    // The Project Report PDF and the companion Speaker Design PDF are stored
    // together, from the SAME saved project/version authority and engineering
    // fingerprint, through the existing storage pipeline. Both are awaited
    // before the publication is treated as complete: if either fails, the
    // publication reads incomplete and a targeted retry re-stores only the
    // document that failed — never the one that succeeded.
    const reportSnapshot = issuedDocument?.documentType
      ? snapshotIssuedComposition(issuedDocument.documentType)
      : null;
    const reportIdentity = issuedDocument?.documentType
      ? {
          ...issuedDocument,
          filename: title,
          // A storage failure that could not be retried from the held PDF can
          // re-run this export, and says so on the button that does it.
          retryExport: () => retryExportRef.current?.(),
        }
      : null;
    const speakerDesignParams = (speakerDesignCompanion?.groups?.length > 0 && issuedDocument?.projectId)
      ? {
          groups: speakerDesignCompanion.groups,
          layout: speakerDesignCompanion.layout || null,
          projectName,
          // The dealer segment is the same one the report itself is named with, so
          // the schedule's own download and this stored copy cannot disagree.
          dealerName,
          clientName,
          projectReference,
          versionName,
          versionNumber,
          projectId: issuedDocument.projectId,
          accountId: issuedDocument.accountId || null,
          resolveSource: issuedDocument.resolveSource || null,
          exportedBy: issuedDocument.exportedBy || null,
        }
      : null;

    lastExportRef.current = { reportIdentity, reportSnapshot, speakerDesignParams };
    setPublication({ status: "storing", failed: [] });

    // Fire both storages in parallel. The print below runs alongside them; the
    // publication promise is awaited after the print so the designer is never
    // blocked, but the publication is only complete once both documents land.
    const publicationPromise = storeProjectReportPublication({
      reportIdentity,
      reportSnapshot,
      speakerDesignParams,
      projectId: issuedDocument?.projectId || null,
      versionId: null,
    }).catch(() => ({ stored: [], failed: [], complete: false }));

    // The publication state follows the storage outcome: both documents must
    // land before it reads complete. The print runs alongside the storage and
    // is never blocked by it.
    publicationPromise.then((outcome) => {
      if (outcome.complete) {
        setPublication({ status: "complete", failed: [] });
      } else if (outcome.failed.length > 0) {
        setPublication({ status: "incomplete", failed: outcome.failed });
      } else {
        setPublication({ status: "idle", failed: [] });
      }
    });

    try {
      // 1. Wait for fonts
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }

      // 2. Wait for logo to decode — abort if the required logo fails to load
      const logoReady = await decodeLogo(logoUrl);
      if (!logoReady) {
        setError("PDF preparation failed because the Sound Proof logo could not be loaded. Please try again.");
        closeReportPrintWindow(printWindowRef.current);
        printWindowRef.current = null;
        cleanup();
        return;
      }

      // 3. Print from the app-owned window. Nothing about the report's layout
      // changes: the same stylesheets and the same print composition are used.
      if (printWindowRef.current) {
        // The window's own document is prepared by the shared readiness
        // authority, and the print dialogue opens only when it reports ready.
        const result = await printReportInWindow(printWindowRef.current, {
          title,
          node: findReportPrintNode(PRINT_NODE_SELECTOR),
          bodyClass: PRINT_BODY_CLASS,
          extraCss: PRINT_WINDOW_CSS,
          onDone: cleanup,
        });
        if (result.printed) {
          printWindowRef.current = null;
          return;
        }
        closeReportPrintWindow(printWindowRef.current);
        printWindowRef.current = null;
        if (result.reason !== 'window_unavailable') {
          // The report did not become ready: nothing was printed.
          setError(result.message || PRINT_NOT_READY_MESSAGE);
          cleanup();
          return;
        }
      }

      // 4. Fallback: print in place, with the report title applied to the app
      // document and the host tab alike — prepared by the SAME readiness
      // authority, never after a bare animation-frame delay.
      document.body.classList.add(PRINT_BODY_CLASS);
      applyPrintDocumentTitle(title);

      const readiness = await preparePrintDocument({
        doc: document,
        root: findReportPrintNode(PRINT_NODE_SELECTOR),
      });
      if (!readiness.ready) {
        document.body.classList.remove(PRINT_BODY_CLASS);
        setError(describePrintReadinessFailure(readiness));
        cleanup();
        return;
      }

      // 5. Set timeout fallback (in case afterprint doesn't fire)
      cleanupTimeoutRef.current = setTimeout(() => {
        cleanup();
      }, PRINT_TIMEOUT_MS);

      // 6. Trigger print
      window.print();
    } catch (err) {
      setError("PDF preparation failed. Please try again.");
      closeReportPrintWindow(printWindowRef.current);
      printWindowRef.current = null;
      cleanup();
    }
  }, [exporting, activePageCount, projectName, logoUrl, dealerName, clientName, projectReference, versionNumber, versionName, issuedDocument, speakerDesignCompanion, cleanup]);

  retryExportRef.current = handleExport;

  // A targeted retry that re-stores only the document that failed — from the
  // SAME saved authority, without regenerating the one that succeeded or
  // re-running the whole export.
  const retryMissing = useCallback(async (documentKey) => {
    const last = lastExportRef.current;
    if (!last) return;
    setPublication((prev) => ({
      ...prev,
      status: "storing",
      failed: prev.failed.filter((entry) => entry.key !== documentKey),
    }));
    const result = await retryPublicationDocument({
      key: documentKey,
      reportIdentity: last.reportIdentity,
      reportSnapshot: last.reportSnapshot,
      speakerDesignParams: last.speakerDesignParams,
    });
    if (result.ok) {
      // Re-evaluate the remaining failures: if none remain, the publication is
      // complete; otherwise the incomplete state persists for the other document.
      setPublication((prev) => {
        const remaining = prev.failed.filter((entry) => entry.key !== documentKey);
        return remaining.length > 0
          ? { status: "incomplete", failed: remaining }
          : { status: "complete", failed: [] };
      });
    } else {
      setPublication((prev) => ({
        status: "incomplete",
        failed: prev.failed.some((entry) => entry.key === documentKey)
          ? prev.failed.map((entry) => entry.key === documentKey
            ? { key: documentKey, error: result.error }
            : entry)
          : [...prev.failed, { key: documentKey, error: result.error }],
      }));
    }
  }, []);

  return { exporting, error, handleExport, publication, retryMissing, PUBLICATION_DOCUMENT };
}