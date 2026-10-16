// loadSheetJs.js
// ---------------------------------------------------------------------------
// The shared SheetJS loader for the canonical Speaker Database export/import.
// Loaded once from the CDN and cached on window, so the export workbook, the
// import reader and the legacy comparison importer all use the same reader.

const SCRIPT_URL = "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";

export function loadSheetJs() {
  if (typeof window === "undefined") return Promise.reject(new Error("Browser only"));
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-soundproof-xlsx="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(window.XLSX), { once: true });
      existing.addEventListener("error", () => reject(new Error("Could not load Excel reader")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.dataset.soundproofXlsx = "true";
    script.onload = () => resolve(window.XLSX);
    script.onerror = () => reject(new Error("Could not load Excel reader"));
    document.head.appendChild(script);
  });
}