/**
 * ClientReportPrintStyles
 * -----------------------
 * Scoped print styles for the Client Visual Report PDF export.
 *
 * Does NOT import or reuse ReportPrintStyles unchanged — the Client PDF
 * needs its own header, so broad selectors like
 * `header { display: none; }` and `footer { display: none; }` are avoided.
 *
 * Uses scoped classes:
 *   client-report-screen-only  — visible on screen, hidden in print
 *   client-report-print-only   — hidden on screen, visible in print
 *   client-report-print-root   — print container
 *   client-report-page         — one A4 page wrapper
 *   client-report-page__header / __visual
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
        --client-report-logo-height: 12mm;
      }

      body.client-report-printing .client-report-screen-only {
        display: none !important;
      }

      body.client-report-printing .client-report-print-only {
        display: block !important;
      }

      body.client-report-printing .client-report-page__header.client-report-print-only {
        display: block !important;
      }

      body.client-report-printing .client-report-print-root {
        display: block !important;
      }

      /* Hide app sidebar during client report print */
      body.client-report-printing aside {
        display: none !important;
      }

      /* ── Print layout rules (active during measurement AND print) ── */
      body.client-report-printing .client-report-page {
        width: 186mm !important;
        height: 271mm !important;
        min-height: 271mm !important;
        box-sizing: border-box !important;
        display: grid !important;
        grid-template-rows: auto minmax(0, 1fr);
        break-inside: avoid !important;
        page-break-inside: avoid !important;
        page-break-after: always;
        break-after: page;
        overflow: hidden !important;
        position: relative;
        background: #FFFFFF !important;
      }

      body.client-report-printing .client-report-page:last-child {
        page-break-after: auto !important;
        break-after: auto !important;
      }

      body.client-report-printing .client-report-page__header {
        grid-row: 1;
        align-self: start;
        max-height: 34mm;
        overflow: hidden;
        padding-bottom: 3mm;
        border-bottom: 1px solid #DCDBD6;
        margin-bottom: 4mm;
      }

      body.client-report-printing .client-report-page__header img {
        height: var(--client-report-logo-height, 12mm);
        width: auto;
        object-fit: contain;
        margin-bottom: 3mm;
      }

      body.client-report-printing .client-report-page__header-title {
        font-size: 15pt;
        font-weight: 600;
        color: #213428;
        font-family: "Futura PT Light", "Century Gothic", sans-serif;
        margin: 0 0 1.5mm 0;
        letter-spacing: 0.01em;
      }

      body.client-report-printing .client-report-page__header-meta {
        font-size: 9pt;
        color: #625143;
        font-family: "Didact Gothic", "Century Gothic", sans-serif;
        line-height: 1.5;
      }

      body.client-report-printing .client-report-page__header-meta span {
        margin-right: 6mm;
        white-space: nowrap;
      }

      body.client-report-printing .client-report-page__visual {
        grid-row: 2;
        min-height: 0;
        width: 100%;
        height: 100%;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        overflow: hidden !important;
        box-sizing: border-box;
      }

      /* Page 1 (with header) — small gap below header, card centred in remaining space */
      body.client-report-printing .client-report-page--first .client-report-page__visual {
        padding: 3mm 0 0 0;
      }

      /* Page 2+ (no header) — optical centring, slight upward shift */
      body.client-report-printing .client-report-page:not(.client-report-page--first) .client-report-page__visual {
        padding: 0 0 8mm 0;
      }

      body.client-report-printing .client-report-page__visual-stage {
        width: var(--client-report-scaled-width, auto);
        height: var(--client-report-scaled-height, auto);
        flex-shrink: 0;
        overflow: hidden;
      }

      body.client-report-printing .client-report-page__visual-inner {
        width: var(--client-report-natural-width, auto);
        transform: scale(var(--client-report-scale, 1));
        transform-origin: top left;
      }

      body.client-report-printing .client-report-page__visual-inner > * {
        break-inside: avoid !important;
        page-break-inside: avoid !important;
      }

      body.client-report-printing .client-report-page,
      body.client-report-printing .client-report-page * {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
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

        /* Header: block (overrides generic print-only block) */
        .client-report-page__header.client-report-print-only {
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
          height: 271mm !important;
          min-height: 271mm !important;
          box-sizing: border-box !important;
          display: grid !important;
          grid-template-rows: auto minmax(0, 1fr);
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
          grid-row: 1;
          align-self: start;
          max-height: 34mm;
          overflow: hidden;
          padding-bottom: 3mm;
          border-bottom: 1px solid #DCDBD6;
          margin-bottom: 4mm;
        }

        .client-report-page__header img {
          height: var(--client-report-logo-height, 12mm);
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

        /* ── Visual area — grid row 2, centred ── */
        .client-report-page__visual {
          grid-row: 2;
          min-height: 0;
          width: 100%;
          height: 100%;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          overflow: hidden !important;
          box-sizing: border-box;
        }

        /* Page 1 (with header) — small gap below header */
        .client-report-page--first .client-report-page__visual {
          padding: 3mm 0 0 0;
        }

        /* Page 2+ (no header) — optical centring, slight upward shift */
        .client-report-page:not(.client-report-page--first) .client-report-page__visual {
          padding: 0 0 8mm 0;
        }

        /* ── Visual stage — sized wrapper, normal flex layout ── */
        .client-report-page__visual-stage {
          width: var(--client-report-scaled-width, auto);
          height: var(--client-report-scaled-height, auto);
          flex-shrink: 0;
          overflow: hidden;
        }

        /* ── Visual inner — scaled content, transform-origin top left ── */
        .client-report-page__visual-inner {
          width: var(--client-report-natural-width, auto);
          transform: scale(var(--client-report-scale, 1));
          transform-origin: top left;
        }

        /* Prevent splitting of SVG, heading, status card */
        .client-report-page__visual-inner > * {
          break-inside: avoid !important;
          page-break-inside: avoid !important;
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