/**
 * useClientReportPdfExport
 * ------------------------
 * Export lifecycle hook for the Visual Report PDF.
 *
 * With the dedicated print composition (three document regions per page),
 * the SVG scales via CSS to fill the drawing region — no JS transform
 * or measurement is needed. The hook simply:
 *   - waits for fonts and logo
 *   - adds the print-mode body class
 *   - waits two animation frames for layout to settle
 *   - calls window.print()
 *   - cleans up after print
 *
 * Does NOT use html2canvas, jsPDF, raster screenshots, or JS scaling.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { buildVisualReportTitle } from "@/components/report/reportPdfTitle";

const PRINT_TIMEOUT_MS = 60000;

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

export function useClientReportPdfExport({ activePageCount, projectName, logoUrl }) {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(null);
  const printingRef = useRef(false);
  const cleanupTimeoutRef = useRef(null);
  const originalTitleRef = useRef(null);

  const cleanup = useCallback(() => {
    if (printingRef.current) {
      printingRef.current = false;
      setExporting(false);
    }
    document.body.classList.remove("client-report-printing");
    if (originalTitleRef.current !== null) {
      document.title = originalTitleRef.current;
      originalTitleRef.current = null;
    }
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
    };
  }, [cleanup]);

  const handleExport = useCallback(async () => {
    if (exporting || printingRef.current) return;
    if (activePageCount === 0) return;

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
        cleanup();
        return;
      }

      // 3. Add print-mode body class so the print layout and page dimensions exist
      document.body.classList.add("client-report-printing");

      // 4. Set temporary document title
      originalTitleRef.current = document.title;
      document.title = buildVisualReportTitle(projectName);

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
      cleanup();
    }
  }, [exporting, activePageCount, projectName, logoUrl, cleanup]);

  return { exporting, error, handleExport };
}