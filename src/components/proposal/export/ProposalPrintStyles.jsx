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
        /* No page margin: the cover image bleeds to the paper edge, and the
           content margins live on the section blocks below. */
        @page {
          size: A4 portrait;
          margin: 0;
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

        /* ── Cover — one full page of imagery, edge to edge ── */
        body.proposal-export-mode .proposal-print-cover {
          width: 210mm;
          height: 297mm;
          margin: 0;
          break-after: page;
          page-break-after: always;
          break-inside: avoid;
          page-break-inside: avoid;
          overflow: hidden;
        }

        /* ── Sections — flow content, never fixed-height. The page frame lives
           here, because the page itself has no margin (the cover bleeds).
           Every content page carries the same top margin, so prose sits placed
           on the sheet instead of being pushed to the top of it, and a bottom
           margin is always kept so no page reads as an overflow of text. ── */
        body.proposal-export-mode .proposal-print-section {
          padding: 22mm 18mm 20mm;
          margin-bottom: 0;
        }

        /* An imagery page is led by the image rather than by text: it takes a
           shorter top margin and gives that space to the hero image. */
        body.proposal-export-mode .proposal-print-section.pp-page--images {
          padding-top: 14mm;
          padding-bottom: 16mm;
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

        /* ── Key Performance Highlights table — compact so the trimmed table
           keeps every row on the one page that carries its heading. ── */
        body.proposal-export-mode .kph-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 5mm;
          font-size: 8.5pt;
        }

        body.proposal-export-mode .kph-table th {
          text-align: left;
          padding: 1.8mm 2.5mm;
          background: #F5F4F0;
          color: #213428;
          font-weight: 600;
          border-bottom: 1px solid #DCDBD6;
        }

        body.proposal-export-mode .kph-table td {
          padding: 1.8mm 2.5mm;
          color: #3E4349;
          border-bottom: 1px solid #EAE8E3;
          vertical-align: top;
        }

        body.proposal-export-mode .kph-table tr {
          break-inside: avoid;
          page-break-inside: avoid;
        }

        /* A table header repeats if the table ever continues on a new page. */
        body.proposal-export-mode .kph-table thead {
          display: table-header-group;
        }

        /* ── Key Performance Highlights — one section, one page ──
           The whole block is kept together: it moves to the next page rather
           than splitting across two. */
        body.proposal-export-mode .proposal-print-section--highlights {
          break-inside: avoid;
          page-break-inside: avoid;
        }

        body.proposal-export-mode .proposal-print-section--highlights .proposal-print-section__title,
        body.proposal-export-mode .proposal-print-section--highlights .pp-header,
        body.proposal-export-mode .proposal-print-section--highlights .pp-body {
          break-after: avoid;
          page-break-after: avoid;
        }

        /* The table is never separated from the heading above it: it may not
           start a new page while its own title sits on the previous one. */
        body.proposal-export-mode .proposal-print-section--highlights .pp-header__rule,
        body.proposal-export-mode .proposal-print-section--highlights .kph-table {
          break-before: avoid;
          page-break-before: avoid;
          break-inside: avoid;
          page-break-inside: avoid;
        }

        /* ── Project Images — imagery only, on its own page ── */
        body.proposal-export-mode .proposal-print-section--images {
          break-before: page;
          page-break-before: always;
        }

        body.proposal-export-mode .proposal-images {
          margin-top: 2mm;
        }

        body.proposal-export-mode .proposal-images__figure {
          margin: 0 0 6mm;
          break-inside: avoid;
          page-break-inside: avoid;
        }

        body.proposal-export-mode .proposal-images__figure img {
          display: block;
          width: 100%;
          object-fit: cover;
          background: #F5F4F0;
        }

        body.proposal-export-mode .proposal-images__lead img {
          height: 110mm;
        }

        body.proposal-export-mode .proposal-images__grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6mm;
        }

        body.proposal-export-mode .proposal-images__grid .proposal-images__figure img {
          height: 74mm;
        }

        body.proposal-export-mode .proposal-images__caption {
          margin-top: 2mm;
        }

        body.proposal-export-mode .proposal-images__empty {
          margin: 4mm 0 0;
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

        /* ── Cover typography — the cover has its own sizes. The document
           title scale is deliberately NOT used here: the project name is
           identity, not the hero of the page. ── */
        body.proposal-export-mode .proposal-print-cover .proposal-cover-name {
          font-family: var(--report-font-heading) !important;
          font-size: 26pt !important;
          font-weight: 300 !important;
          letter-spacing: 0.06em !important;
          line-height: 1.2 !important;
          text-transform: uppercase;
          overflow-wrap: anywhere;
        }

        /* The dealer is smaller than the project name. */
        body.proposal-export-mode .proposal-print-cover .proposal-cover-partner {
          font-family: var(--report-font-heading) !important;
          font-size: 12pt !important;
          font-weight: 300 !important;
          letter-spacing: 0.08em !important;
          line-height: 1.3 !important;
          text-transform: uppercase;
        }

        /* The label above a value is a caption, not a heading. */
        body.proposal-export-mode .proposal-print-cover .proposal-cover-label {
          font-family: var(--report-font-heading) !important;
          font-size: 8pt !important;
          font-weight: 300 !important;
          letter-spacing: 0.26em !important;
          line-height: 1.3 !important;
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