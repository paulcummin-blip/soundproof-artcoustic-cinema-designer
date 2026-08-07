/**
 * ClientReportPrintStyles
 * -----------------------
 * Scoped print styles for the Client Visual Report PDF export.
 *
 * The print layout uses three explicit document regions per page:
 *   1. Header  (page 1 only — logo, title, project meta)
 *   2. Drawing (heading + SVG — SVG scales via CSS to fill the region)
 *   3. Result  (level badge, label, explanation, supporting text)
 *
 * The SVG is the primary scaling authority. It scales via CSS
 * (width:100%; height:100%; preserveAspectRatio) to fill the drawing
 * region — no JS transform on the whole card.
 *
 * Uses scoped classes:
 *   client-report-screen-only  — visible on screen, hidden in print
 *   client-report-print-only   — hidden on screen, visible in print
 *   client-report-page         — one A4 page wrapper
 *   client-report-page__header / __screen-visual / __print-content
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
        --client-report-logo-height: 16mm;
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
        grid-template-rows: auto 1fr;
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

      /* ── Header (first page only) ── */
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
        height: var(--client-report-logo-height, 16mm);
        width: auto;
        object-fit: contain;
        margin-bottom: 4mm;
        margin-left: auto;
        margin-right: auto;
        display: block;
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
        white-space: nowrap;
      }
      body.client-report-printing .client-report-page__header-meta span + span::before {
        content: " · ";
        margin-right: 3mm;
      }

      /* ── Screen visual — hidden in print ── */
      body.client-report-printing .client-report-page__screen-visual {
        display: none !important;
      }

      /* ── Print content — flex column: heading, drawing, result ── */
      body.client-report-printing .client-report-page__print-content {
        grid-row: 2;
        display: flex !important;
        flex-direction: column;
        min-height: 0;
        width: 100%;
        height: 100%;
      }

      /* ── Heading region ── */
      body.client-report-printing .client-report-print-heading {
        flex-shrink: 0;
        padding-bottom: 3mm;
      }

      body.client-report-printing .client-report-print-heading__title {
        margin: 0;
        font-size: 24pt;
        font-weight: 300;
        color: #213428;
        letter-spacing: 0.01em;
        font-family: "Futura PT Light", "Century Gothic", sans-serif;
      }

      body.client-report-printing .client-report-print-heading__subtitle {
        margin: 2mm 0 0 0;
        font-size: 9pt;
        color: #625143;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        font-family: "Didact Gothic", "Century Gothic", sans-serif;
        text-align: left;
        overflow-wrap: break-word;
        word-break: break-word;
        max-width: 100%;
      }

      /* ── Drawing region — fills remaining space, SVG centred ── */
      body.client-report-printing .client-report-print-drawing {
        flex: 1;
        min-height: 0;
        display: flex !important;
        align-items: center;
        justify-content: center;
        width: 100%;
      }

      body.client-report-printing .client-report-print-svg {
        width: 100%;
        height: 100%;
        max-width: 100%;
        max-height: 100%;
      }

      /* ── Support region — content-sized, sits between drawing and result ── */
      body.client-report-printing .client-report-print-support {
        flex-shrink: 0;
        display: flex !important;
        flex-direction: column;
        align-items: center;
        width: 100%;
        box-sizing: border-box;
        margin-bottom: 4mm;
      }

      /* ── Result region — sits directly beneath the drawing ── */
      body.client-report-printing .client-report-print-result {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 12px 16px;
        background: #F1F0EE;
        border-radius: 8px;
        border-width: 1px;
        border-style: solid;
        margin-top: 3mm;
        width: 100%;
        box-sizing: border-box;
      }

      body.client-report-printing .client-report-print-result__badge {
        width: 40px;
        height: 40px;
        border-radius: 6px;
        border-width: 2px;
        border-style: solid;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14pt;
        font-weight: 700;
        font-family: "Futura PT Light", "Century Gothic", sans-serif;
        flex-shrink: 0;
      }

      body.client-report-printing .client-report-print-result__content {
        flex: 1;
      }

      body.client-report-printing .client-report-print-result__label {
        font-size: 12pt;
        font-weight: 600;
        color: #213428;
        margin-bottom: 2mm;
      }

      body.client-report-printing .client-report-print-result__explanation {
        font-size: 10pt;
        color: #3E4349;
        line-height: 1.4;
        margin-bottom: 2mm;
      }

      body.client-report-printing .client-report-print-result__supporting {
        font-size: 9pt;
        color: #625143;
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
          grid-template-rows: auto 1fr;
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

        /* ── Header (first page only) ── */
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
          height: var(--client-report-logo-height, 16mm);
          width: auto;
          object-fit: contain;
          margin-bottom: 4mm;
          margin-left: auto;
          margin-right: auto;
          display: block;
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
          white-space: nowrap;
        }
        .client-report-page__header-meta span + span::before {
          content: " · ";
          margin-right: 3mm;
        }

        /* ── Screen visual — hidden in print ── */
        .client-report-page__screen-visual {
          display: none !important;
        }

        /* ── Print content — flex column: heading, drawing, result ── */
        .client-report-page__print-content {
          grid-row: 2;
          display: flex !important;
          flex-direction: column;
          min-height: 0;
          width: 100%;
          height: 100%;
        }

        /* ── Heading region ── */
        .client-report-print-heading {
          flex-shrink: 0;
          padding-bottom: 3mm;
        }

        .client-report-print-heading__title {
          margin: 0;
          font-size: 24pt;
          font-weight: 300;
          color: #213428;
          letter-spacing: 0.01em;
          font-family: "Futura PT Light", "Century Gothic", sans-serif;
        }

        .client-report-print-heading__subtitle {
          margin: 2mm 0 0 0;
          font-size: 9pt;
          color: #625143;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          font-family: "Didact Gothic", "Century Gothic", sans-serif;
          text-align: left;
          overflow-wrap: break-word;
          word-break: break-word;
          max-width: 100%;
        }

        /* ── Drawing region — fills remaining space, SVG centred ── */
        .client-report-print-drawing {
          flex: 1;
          min-height: 0;
          display: flex !important;
          align-items: center;
          justify-content: center;
          width: 100%;
        }

        .client-report-print-svg {
          width: 100%;
          height: 100%;
          max-width: 100%;
          max-height: 100%;
        }

        /* ── Support region — content-sized, sits between drawing and result ── */
        .client-report-print-support {
          flex-shrink: 0;
          display: flex !important;
          flex-direction: column;
          align-items: center;
          width: 100%;
          box-sizing: border-box;
          margin-bottom: 4mm;
        }

        /* ── Result region — sits directly beneath the drawing ── */
        .client-report-print-result {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 12px 16px;
          background: #F1F0EE;
          border-radius: 8px;
          border-width: 1px;
          border-style: solid;
          margin-top: 3mm;
          width: 100%;
          box-sizing: border-box;
        }

        .client-report-print-result__badge {
          width: 40px;
          height: 40px;
          border-radius: 6px;
          border-width: 2px;
          border-style: solid;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14pt;
          font-weight: 700;
          font-family: "Futura PT Light", "Century Gothic", sans-serif;
          flex-shrink: 0;
        }

        .client-report-print-result__content {
          flex: 1;
        }

        .client-report-print-result__label {
          font-size: 12pt;
          font-weight: 600;
          color: #213428;
          margin-bottom: 2mm;
        }

        .client-report-print-result__explanation {
          font-size: 10pt;
          color: #3E4349;
          line-height: 1.4;
          margin-bottom: 2mm;
        }

        .client-report-print-result__supporting {
          font-size: 9pt;
          color: #625143;
        }

        /* ── Preserve approved fonts and colours ── */
        * {
          font-family: "Didact Gothic", "Century Gothic", sans-serif !important;
        }

        .client-report-page__header-title,
        .client-report-print-heading__title,
        .client-report-print-result__badge,
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