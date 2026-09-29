/**
 * ProposalPrintStyles
 * -------------------
 * Scoped print styles for the full proposal PDF export.
 *
 * The print document is portalled to <body> and hidden on screen. During
 * export the hook adds `proposal-export-mode` to <body>, which hides the
 * entire application shell (sidebar, hero, editor) and prints only the
 * proposal document.
 *
 * This is FLOW pagination — unlike the Visual Report's fixed-height page
 * frame, proposal prose must break naturally across A4 pages.
 */

import React from 'react';

export default function ProposalPrintStyles() {
  return (
    <style>{`
      /* ── Screen: the print document is mounted but never visible ── */
      .proposal-print-portal {
        display: none;
      }

      @media print {
        @page {
          size: A4 portrait;
          margin: 18mm;
        }

        /* Hide the whole application (sidebar, hero, editor) and any
           third-party portals, then reveal only the proposal document. */
        body.proposal-export-mode > * {
          display: none !important;
        }
        body.proposal-export-mode .proposal-print-portal {
          display: block !important;
          background: #FFFFFF !important;
          color: #1B1A1A;
        }

        body.proposal-export-mode .proposal-print-portal,
        body.proposal-export-mode .proposal-print-portal * {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          font-family: "Didact Gothic", "Century Gothic", sans-serif !important;
        }

        /* ── Cover ── */
        body.proposal-export-mode .proposal-print-cover {
          break-after: page;
          page-break-after: always;
          text-align: center;
          padding-top: 30mm;
        }

        body.proposal-export-mode .proposal-print-cover__logo {
          display: block;
          height: 30mm;
          width: auto;
          object-fit: contain;
          margin: 0 auto 6mm;
        }

        body.proposal-export-mode .proposal-print-cover__kicker {
          font-size: 12pt;
          font-weight: 600;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #1B1A1A;
          font-family: "Futura PT Light", "Century Gothic", sans-serif !important;
        }

        body.proposal-export-mode .proposal-print-cover__adi {
          font-size: 10pt;
          font-weight: 500;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #625143;
          margin-top: 2mm;
        }

        body.proposal-export-mode .proposal-print-cover__rule {
          width: 30mm;
          height: 1px;
          background: #C1B6AD;
          margin: 8mm auto;
        }

        body.proposal-export-mode .proposal-print-cover__title {
          font-size: 28pt;
          font-weight: 300;
          line-height: 1.15;
          color: #213428;
          margin: 0 0 4mm;
          font-family: "Futura PT Light", "Century Gothic", sans-serif !important;
        }

        body.proposal-export-mode .proposal-print-cover__type {
          font-size: 10pt;
          font-weight: 600;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: #625143;
        }

        body.proposal-export-mode .proposal-print-cover__meta {
          font-size: 10pt;
          color: #625143;
          margin-top: 10mm;
        }

        /* ── Sections — flow content, never fixed-height ── */
        body.proposal-export-mode .proposal-print-section {
          margin-bottom: 10mm;
        }

        body.proposal-export-mode .proposal-print-section__title {
          font-size: 16pt;
          font-weight: 600;
          color: #213428;
          margin: 0 0 4mm;
          padding-bottom: 2mm;
          border-bottom: 1px solid #DCDBD6;
          break-after: avoid;
          page-break-after: avoid;
          font-family: "Futura PT Light", "Century Gothic", sans-serif !important;
        }

        body.proposal-export-mode .proposal-print-section__body {
          font-size: 11pt;
          line-height: 1.65;
          color: #3E4349;
        }

        body.proposal-export-mode .proposal-print-section__body h2 {
          font-size: 13pt;
          color: #213428;
          margin: 6mm 0 2mm;
          break-after: avoid;
          page-break-after: avoid;
          font-family: "Futura PT Light", "Century Gothic", sans-serif !important;
        }

        body.proposal-export-mode .proposal-print-section__body h3 {
          font-size: 12pt;
          color: #213428;
          margin: 5mm 0 2mm;
          break-after: avoid;
          page-break-after: avoid;
        }

        body.proposal-export-mode .proposal-print-section__body p {
          margin: 0 0 3mm;
          orphans: 3;
          widows: 3;
        }

        body.proposal-export-mode .proposal-print-section__body ul,
        body.proposal-export-mode .proposal-print-section__body ol {
          margin: 0 0 3mm;
          padding-left: 6mm;
        }

        body.proposal-export-mode .proposal-print-section__body li {
          margin-bottom: 1.5mm;
        }

        body.proposal-export-mode .proposal-print-section__body strong {
          color: #213428;
        }
      }
    `}</style>
  );
}