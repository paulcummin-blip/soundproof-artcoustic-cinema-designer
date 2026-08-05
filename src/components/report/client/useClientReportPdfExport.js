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
      page.style.removeProperty("--client-report-natural-width");
      page.style.removeProperty("--client-report-scaled-width");
      page.style.removeProperty("--client-report-scaled-height");
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

      // 2. Wait for logo to decode — abort if the required logo fails to load
      const logoReady = await decodeLogo(logoUrl);
      if (!logoReady) {
        setError("PDF preparation failed because the Sound Proof logo could not be loaded. Please try again.");
        cleanup();
        return;
      }

      // 3. Add print-mode body class so the real print header, footer and page dimensions exist
      document.body.classList.add("client-report-printing");

      // 4. Set temporary document title
      originalTitleRef.current = document.title;
      document.title = `Sound Proof - ${sanitiseProjectName(projectName)} - Client Visual Report`;

      // 5. Temporarily reset every visual to scale 1
      document.querySelectorAll(".client-report-page").forEach((page) => {
        page.style.removeProperty("--client-report-scale");
        page.style.removeProperty("--client-report-natural-width");
        page.style.removeProperty("--client-report-scaled-width");
        page.style.removeProperty("--client-report-scaled-height");
      });

      // 6. Wait two animation frames for print layout to settle
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      );

      // 7. Measure each page — actual visual slot + natural content size
      const pages = document.querySelectorAll(".client-report-page");
      pages.forEach((page) => {
        const visual = page.querySelector(".client-report-page__visual");
        const visualInner = page.querySelector(".client-report-page__visual-inner");
        if (!visual || !visualInner) return;
        const availRect = visual.getBoundingClientRect();
        const availW = availRect.width;
        const availH = availRect.height;
        const naturalW = visualInner.scrollWidth;
        const naturalH = visualInner.scrollHeight;
        if (availW <= 0 || availH <= 0 || naturalW <= 0 || naturalH <= 0) return;
        const scale = Math.min(availW / naturalW, availH / naturalH, 1);
        const scaledW = naturalW * scale;
        const scaledH = naturalH * scale;
        page.style.setProperty("--client-report-scale", String(scale));
        page.style.setProperty("--client-report-natural-width", `${naturalW}px`);
        page.style.setProperty("--client-report-scaled-width", `${scaledW}px`);
        page.style.setProperty("--client-report-scaled-height", `${scaledH}px`);
      });

      // 8. Wait two further animation frames for scaled layout to settle
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      );

      // 9. Re-measure and confirm the scaled stage fits inside the visual slot
      let allFit = true;
      pages.forEach((page) => {
        const visual = page.querySelector(".client-report-page__visual");
        const stage = page.querySelector(".client-report-page__visual-stage");
        if (!visual || !stage) return;
        const vRect = visual.getBoundingClientRect();
        const sRect = stage.getBoundingClientRect();
        if (sRect.width > vRect.width + 1 || sRect.height > vRect.height + 1) {
          allFit = false;
        }
      });
      if (!allFit) {
        setError("PDF preparation failed — visual content could not be fitted to the page. Please try again.");
        cleanup();
        return;
      }

      // 10. Set timeout fallback (in case afterprint doesn't fire)
      cleanupTimeoutRef.current = setTimeout(() => {
        cleanup();
      }, PRINT_TIMEOUT_MS);

      // 11. Trigger print
      window.print();
    } catch (err) {
      setError("PDF preparation failed. Please try again.");
      cleanup();
    }
  }, [exporting, activePageCount, projectName, logoUrl, cleanup]);

  return { exporting, error, handleExport };
}