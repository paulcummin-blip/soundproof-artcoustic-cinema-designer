/**
 * useClientReportPdfExport
 * ------------------------
 * Export lifecycle hook for the Visual Report PDF.
 *
 * The export prints from a top-level window the app owns (see
 * `@/components/report/reportPrintWindow`), opened on the shared report
 * filename. That is what names the saved PDF after the report —
 * "Sound Proof - Artcoustic Cinema Designer - Visual - …" — instead of the host
 * tab the app happens to be running in. When the browser refuses the window
 * (a pop-up blocker), the export falls back to printing in place with the
 * report title applied to the app and host documents.
 *
 * The SVG scales via CSS to fill the drawing region — no JS transform, no
 * html2canvas, no jsPDF, no raster screenshots.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { buildVisualReportTitle } from "@/components/report/reportPdfTitle";
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
}) {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(null);
  const printingRef = useRef(false);
  const cleanupTimeoutRef = useRef(null);
  // The app-owned window the report is printed from, when one could be opened.
  const printWindowRef = useRef(null);

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

    const title = buildVisualReportTitle(
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
        const printed = await printReportInWindow(printWindowRef.current, {
          title,
          node: findReportPrintNode(PRINT_NODE_SELECTOR),
          bodyClass: PRINT_BODY_CLASS,
          extraCss: PRINT_WINDOW_CSS,
          onDone: cleanup,
        });
        if (printed) {
          printWindowRef.current = null;
          return;
        }
        closeReportPrintWindow(printWindowRef.current);
        printWindowRef.current = null;
      }

      // 4. Fallback: print in place, with the report title applied to the app
      // document and the host tab alike.
      document.body.classList.add(PRINT_BODY_CLASS);
      applyPrintDocumentTitle(title);

      // 5. Wait two animation frames for print layout to settle
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      );

      // 6. Set timeout fallback (in case afterprint doesn't fire)
      cleanupTimeoutRef.current = setTimeout(() => {
        cleanup();
      }, PRINT_TIMEOUT_MS);

      // 7. Trigger print
      window.print();
    } catch (err) {
      setError("PDF preparation failed. Please try again.");
      closeReportPrintWindow(printWindowRef.current);
      printWindowRef.current = null;
      cleanup();
    }
  }, [exporting, activePageCount, projectName, logoUrl, dealerName, clientName, projectReference, versionNumber, versionName, cleanup]);

  return { exporting, error, handleExport };
}