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
import { buildReportTypographyCss } from '@/components/report/typography/reportTypography';

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
        }
        /* No blanket font-family here: a wildcard family would flatten the
           heading roles. Families are set per role below and on the cover. */

        /* ── Cover — one full page of imagery, bled to the paper edge ── */
        body.proposal-export-mode .proposal-print-cover {
          margin: -18mm -18mm 18mm;
          height: 296mm;
          break-after: page;
          page-break-after: always;
          break-inside: avoid;
          page-break-inside: avoid;
          overflow: hidden;
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

        /* ── Key Performance Highlights table ── */
        body.proposal-export-mode .kph-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 4mm;
          font-size: 10pt;
        }

        body.proposal-export-mode .kph-table th {
          text-align: left;
          padding: 2mm 3mm;
          background: #F5F4F0;
          color: #213428;
          font-weight: 600;
          border-bottom: 1px solid #DCDBD6;
        }

        body.proposal-export-mode .kph-table td {
          padding: 2mm 3mm;
          color: #3E4349;
          border-bottom: 1px solid #EAE8E3;
          vertical-align: top;
        }

        body.proposal-export-mode .kph-table tr {
          break-inside: avoid;
          page-break-inside: avoid;
        }

        /* ── Canonical report typography ────────────────────────────────
           The exported proposal document consumes the shared typography
           system, so the PDF matches the Visual and Technical Reports:
           60pt title / 22pt header / 14pt subheader / 9pt body. */
${buildReportTypographyCss({ scope: '.proposal-print-portal', profile: 'a4', prefix: 'body.proposal-export-mode ' })}

        body.proposal-export-mode .proposal-print-portal .proposal-print-section__title {
          font-family: var(--report-font-heading) !important;
          font-size: var(--report-header-size);
          font-weight: 300;
          letter-spacing: var(--report-heading-tracking);
          line-height: var(--report-heading-leading);
          text-transform: uppercase;
        }

        body.proposal-export-mode .proposal-print-portal .proposal-print-section__body {
          font-family: var(--report-font-body) !important;
          font-size: var(--report-body-size);
          letter-spacing: var(--report-body-tracking);
          line-height: var(--report-body-leading);
          text-transform: none;
        }

        body.proposal-export-mode .proposal-print-portal .proposal-print-section__body h2 {
          font-family: var(--report-font-heading) !important;
          font-size: var(--report-subheader-size);
          font-weight: 300;
          letter-spacing: var(--report-heading-tracking);
          line-height: var(--report-heading-leading);
          text-transform: uppercase;
        }

        body.proposal-export-mode .proposal-print-portal .proposal-print-section__body h3 {
          font-family: var(--report-font-heading) !important;
          font-size: 12pt;
          font-weight: 300;
          letter-spacing: var(--report-heading-tracking);
          line-height: var(--report-heading-leading);
          text-transform: uppercase;
        }

        body.proposal-export-mode .proposal-print-portal .kph-table {
          font-family: var(--report-font-body) !important;
          font-size: var(--report-body-size);
          letter-spacing: var(--report-body-tracking);
          line-height: var(--report-body-leading);
        }

        body.proposal-export-mode .proposal-print-portal .kph-table th {
          font-family: var(--report-font-heading) !important;
          font-size: var(--report-subheader-size);
          font-weight: 300;
          letter-spacing: var(--report-heading-tracking);
          line-height: var(--report-heading-leading);
          text-transform: uppercase;
        }

        /* ── Cover — the proposal title in the header face at title scale ── */
        body.proposal-export-mode .proposal-print-cover .proposal-cover-name {
          font-family: var(--report-font-heading) !important;
          font-size: var(--report-title-size) !important;
          font-weight: 300 !important;
          letter-spacing: var(--report-heading-tracking) !important;
          line-height: var(--report-heading-leading) !important;
          text-transform: uppercase;
          overflow-wrap: anywhere;
        }

        body.proposal-export-mode .proposal-print-cover .proposal-cover-label,
        body.proposal-export-mode .proposal-print-cover .proposal-cover-partner {
          font-family: var(--report-font-heading) !important;
          font-size: var(--report-subheader-size) !important;
          font-weight: 300 !important;
          letter-spacing: var(--report-heading-tracking) !important;
          line-height: var(--report-heading-leading) !important;
          text-transform: uppercase;
        }

        body.proposal-export-mode .proposal-print-cover .proposal-cover-meta {
          font-family: var(--report-font-body) !important;
          font-size: var(--report-body-size) !important;
          letter-spacing: var(--report-body-tracking) !important;
          line-height: var(--report-body-leading) !important;
          text-transform: none;
        }
      }

      /* Screen preview of the proposal document uses the same system. */
      .proposal-print-portal .proposal-print-section__title {
        font-family: var(--report-font-heading, "Futura PT Light", "Century Gothic", sans-serif);
        letter-spacing: var(--report-heading-tracking, 0.1em);
        text-transform: uppercase;
      }
    `}</style>
  );
}