/**
 * ClientReportPrintStyles
 * -----------------------
 * Scoped print styles for the Client Visual Report PDF export.
 *
 * Does NOT import or reuse ReportPrintStyles unchanged — the Client PDF
 * needs its own header and footer, so broad selectors like
 * `header { display: none; }` and `footer { display: none; }` are avoided.
 *
 * Uses scoped classes:
 *   client-report-screen-only  — visible on screen, hidden in print
 *   client-report-print-only   — hidden on screen, visible in print
 *   client-report-print-root   — print container
 *   client-report-page         — one A4 page wrapper
 *   client-report-page__header / __visual / __footer
 */

import React from "react";

export default function ClientReportPrintStyles() {
  return (
    <style>{`
      /* ── Screen: hide print-only elements ── */
      .client-report-print-only {
        display: none !important;
      }

      /* ── Screen: spacing between pages ── */
      .client-report-page + .client-report-page {
        margin-top: 24px;
      }

      /* ── Pre-print measurement phase: body class added before window.print() ── */
      body.client-report-printing {
        background: #FFFFFF !important;
      }

      body.client-report-printing .client-report-screen-only {
        display: none !important;
      }

      body.client-report-printing .client-report-print-only {
        display: block !important;
      }

      body.client-report-printing .client-report-print-root {
        display: block !important;
      }

      /* Hide app sidebar during client report print */
      body.client-report-printing aside {
        display: none !important;
      }

      /* ── Print media query ── */
      @media print {
        @page {
          size: A4 portrait;
          margin: 12mm;
        }

        body {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          background: #FFFFFF !important;
        }

        /* Hide screen-only elements */
        .client-report-screen-only {
          display: none !important;
        }

        /* Show print-only elements */
        .client-report-print-only {
          display: block !important;
        }

        /* Hide app sidebar, nav */
        aside,
        nav {
          display: none !important;
        }

        /* Reset root layout constraints */
        html,
        body,
        #root {
          height: auto !important;
          overflow: visible !important;
          background: #FFFFFF !important;
        }

        main,
        main * {
          overflow: visible !important;
          max-height: none !important;
        }

        main {
          display: block !important;
          height: auto !important;
          min-height: 0 !important;
        }

        .overflow-hidden {
          overflow: visible !important;
        }

        .flex-1 {
          height: auto !important;
          min-height: 0 !important;
          max-height: none !important;
        }

        .min-h-screen {
          min-height: 0 !important;
          padding: 0 !important;
          background: #FFFFFF !important;
        }

        /* Reset client report root */
        .client-report-root {
          min-height: 0 !important;
          background: #FFFFFF !important;
        }

        /* Reset body container — remove screen styling */
        .client-report-body {
          padding: 0 !important;
          max-width: none !important;
          margin: 0 !important;
          background: #FFFFFF !important;
        }

        /* Remove screen spacing between pages */
        .client-report-page + .client-report-page {
          margin-top: 0 !important;
        }

        /* ── A4 page frame ── */
        .client-report-page {
          width: 186mm !important;
          height: 270mm !important; /* slightly below 273mm to prevent blank trailing page */
          box-sizing: border-box !important;
          display: flex !important;
          flex-direction: column !important;
          break-inside: avoid !important;
          page-break-inside: avoid !important;
          page-break-after: always;
          break-after: page;
          overflow: hidden !important;
          position: relative;
          background: #FFFFFF !important;
        }

        .client-report-page:last-child {
          page-break-after: auto !important;
          break-after: auto !important;
        }

        /* ── Header (first page only) — max ~34mm ── */
        .client-report-page__header {
          flex-shrink: 0;
          max-height: 34mm;
          overflow: hidden;
          padding-bottom: 3mm;
          border-bottom: 1px solid #DCDBD6;
          margin-bottom: 4mm;
        }

        .client-report-page__header img {
          height: 12mm;
          width: auto;
          object-fit: contain;
          margin-bottom: 3mm;
        }

        .client-report-page__header-title {
          font-size: 15pt;
          font-weight: 600;
          color: #213428;
          font-family: "Futura PT Light", "Century Gothic", sans-serif;
          margin: 0 0 1.5mm 0;
          letter-spacing: 0.01em;
        }

        .client-report-page__header-meta {
          font-size: 9pt;
          color: #625143;
          font-family: "Didact Gothic", "Century Gothic", sans-serif;
          line-height: 1.5;
        }

        .client-report-page__header-meta span {
          margin-right: 6mm;
          white-space: nowrap;
        }

        /* ── Visual area — centred, scaled as one unit ── */
        .client-report-page__visual {
          flex: 1;
          position: relative;
          overflow: hidden !important;
          min-height: 0;
        }

        .client-report-page__visual-inner {
          position: absolute;
          top: 50%;
          left: 50%;
          width: var(--client-report-natural-w, auto) !important;
          transform: translate(-50%, -50%) scale(var(--client-report-scale, 1));
          transform-origin: center center;
        }

        /* Prevent splitting of SVG, heading, status card */
        .client-report-page__visual-inner > * {
          break-inside: avoid !important;
          page-break-inside: avoid !important;
        }

        /* ── Footer (last page only) — max ~13mm ── */
        .client-report-page__footer {
          flex-shrink: 0;
          max-height: 13mm;
          padding-top: 3mm;
          border-top: 1px solid #DCDBD6;
          margin-top: 3mm;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4mm;
        }

        .client-report-page__footer img {
          height: 5mm;
          width: auto;
          object-fit: contain;
        }

        .client-report-page__footer-text {
          font-size: 8pt;
          color: #625143;
          font-family: "Didact Gothic", "Century Gothic", sans-serif;
          letter-spacing: 0.04em;
        }

        /* ── Preserve approved fonts and colours ── */
        * {
          font-family: "Didact Gothic", "Century Gothic", sans-serif !important;
        }

        .client-report-page__header-title,
        h1,
        h2,
        h3 {
          font-family: "Futura PT Light", "Century Gothic", sans-serif !important;
        }

        /* Ensure backgrounds and colours print exactly */
        .client-report-page,
        .client-report-page * {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
      }
    `}</style>
  );
}