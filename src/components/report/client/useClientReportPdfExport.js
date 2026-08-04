/**
 * useClientReportPdfExport
 * ------------------------
 * Export lifecycle hook for the Client Visual Report PDF.
 *
 * Reuses the Technical Report's guarded window.print() pattern:
 *   - exporting state
 *   - readiness checks (document.fonts.ready, logo decode, page measurement)
 *   - two animation frames after applying print state
 *   - temporary print-mode body class
 *   - temporary document.title using the project name
 *   - window.print()
 *   - afterprint cleanup
 *   - timeout fallback cleanup
 *   - restore document.title
 *   - clear print-mode state after completion or cancellation
 *
 * Does NOT use html2canvas, jsPDF, raster screenshots, or the SPL Calculator
 * export helper.
 */

import { useState, useCallback, useRef, useEffect } from "react";

const PRINT_TIMEOUT_MS = 60000;
const MM_TO_PX = 3.7795; // 96 DPI
const PRINT_SLOT_W_PX = 186 * MM_TO_PX; // ~703px
const PAGE_H_MM = 270; // slightly below 273mm to prevent blank trailing page
const HEADER_H_MM = 34;
const FOOTER_H_MM = 13;
const VISUAL_SLOT_H_PX = (PAGE_H_MM - HEADER_H_MM - FOOTER_H_MM) * MM_TO_PX; // ~843px

function sanitiseProjectName(name) {
  if (!name) return "Untitled";
  const cleaned = String(name).replace(/[<>:"/\\|?*]/g, " ").trim();
  return cleaned || "Untitled";
}

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
    document.querySelectorAll(".client-report-page").forEach((page) => {
      page.style.removeProperty("--client-report-scale");
      page.style.removeProperty("--client-report-natural-w");
      page.style.removeProperty("--client-report-natural-h");
    });
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

      // 2. Wait for logo to decode
      await decodeLogo(logoUrl);

      // 3. Measure each page's visual natural size and calculate scale
      const pages = document.querySelectorAll(".client-report-page");
      pages.forEach((page) => {
        const visualInner = page.querySelector(".client-report-page__visual-inner");
        if (!visualInner) return;
        const naturalW = visualInner.offsetWidth;
        const naturalH = visualInner.offsetHeight;
        if (naturalW <= 0 || naturalH <= 0) return;
        page.style.setProperty("--client-report-natural-w", `${naturalW}px`);
        page.style.setProperty("--client-report-natural-h", `${naturalH}px`);
        const scale = Math.min(
          PRINT_SLOT_W_PX / naturalW,
          VISUAL_SLOT_H_PX / naturalH,
          1
        );
        page.style.setProperty("--client-report-scale", String(scale));
      });

      // 4. Add print-mode body class
      document.body.classList.add("client-report-printing");

      // 5. Set temporary document title
      originalTitleRef.current = document.title;
      document.title = `Sound Proof - ${sanitiseProjectName(projectName)} - Client Visual Report`;

      // 6. Wait two animation frames for layout to settle
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      );

      // 7. Set timeout fallback (in case afterprint doesn't fire)
      cleanupTimeoutRef.current = setTimeout(() => {
        cleanup();
      }, PRINT_TIMEOUT_MS);

      // 8. Trigger print
      window.print();
    } catch (err) {
      setError("PDF preparation failed. Please try again.");
      printingRef.current = false;
      setExporting(false);
      document.body.classList.remove("client-report-printing");
      if (originalTitleRef.current !== null) {
        document.title = originalTitleRef.current;
        originalTitleRef.current = null;
      }
    }
  }, [exporting, activePageCount, projectName, logoUrl, cleanup]);

  return { exporting, error, handleExport };
}