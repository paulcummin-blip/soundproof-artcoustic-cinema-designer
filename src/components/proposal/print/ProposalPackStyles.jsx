/**
 * ProposalPackStyles
 * ------------------
 * The designed layout of the client specification pack.
 *
 * Artcoustic visual rules applied here:
 *   - restrained palette: #1B1A1A ink, #F8F8F7 and #F1F0EE surfaces, #DCDBD6
 *     rules, #625143 warm accent, #213428 deep green, #3E4349 body ink
 *   - Futura PT Light / Century Gothic headings, uppercase and tracked
 *   - Didact Gothic body copy
 *   - generous spacing, no decoration for its own sake
 *
 * Sizes and families are marked !important so the pack's own type scale wins
 * over the generic report roles, while every family stays the brand family.
 * Declarations are doubled for screen (design review) and print (export).
 */

import React from 'react';

export default function ProposalPackStyles() {
  return (
    <style>{`
      .proposal-print-portal {
        --pp-ink: #1B1A1A;
        --pp-paper: #FFFFFF;
        --pp-surface: #F8F8F7;
        --pp-surface-2: #F1F0EE;
        --pp-rule: #DCDBD6;
        --pp-stone: #C1B6AD;
        --pp-warm: #625143;
        --pp-brown: #4A230F;
        --pp-green: #213428;
        --pp-slate: #3E4349;
        --pp-heading: var(--report-font-heading, "Futura PT Light", "Century Gothic", sans-serif);
        --pp-body: var(--report-font-body, "Didact Gothic", "Century Gothic", sans-serif);
      }

      /* ── Page header: number, kicker, tracked title, lead, rule ── */
      .proposal-print-portal .pp-header {
        margin: 0 0 9mm;
      }
      .proposal-print-portal .pp-header__meta {
        display: flex;
        align-items: baseline;
        gap: 4mm;
        margin-bottom: 3.5mm;
      }
      .proposal-print-portal .pp-header__number {
        font-family: var(--pp-heading) !important;
        font-size: 9pt !important;
        letter-spacing: 0.18em !important;
        color: var(--pp-warm) !important;
      }
      .proposal-print-portal .pp-header__kicker {
        font-family: var(--pp-heading) !important;
        font-size: 8pt !important;
        letter-spacing: 0.22em !important;
        text-transform: uppercase !important;
        color: var(--pp-stone) !important;
      }
      .proposal-print-portal .pp-header__title {
        font-family: var(--pp-heading) !important;
        font-size: 20pt !important;
        font-weight: 300 !important;
        letter-spacing: 0.08em !important;
        line-height: 1.2 !important;
        text-transform: uppercase !important;
        color: var(--pp-ink) !important;
        margin: 0 !important;
      }
      .proposal-print-portal .pp-header__lead {
        font-family: var(--pp-body) !important;
        font-size: 11pt !important;
        line-height: 1.55 !important;
        color: var(--pp-slate) !important;
        margin: 4mm 0 0 !important;
        max-width: 150mm;
      }
      .proposal-print-portal .pp-header__rule {
        height: 1px;
        background: var(--pp-rule);
        margin-top: 6mm;
      }

      /* ── Fact cards ── */
      .proposal-print-portal .pp-cards {
        display: grid;
        gap: 4mm;
      }
      .proposal-print-portal .pp-cards--3 { grid-template-columns: repeat(3, 1fr); }
      .proposal-print-portal .pp-cards--2 { grid-template-columns: repeat(2, 1fr); }
      .proposal-print-portal .pp-card {
        background: var(--pp-surface);
        border: 1px solid var(--pp-rule);
        padding: 4.5mm 5mm;
        min-width: 0;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .proposal-print-portal .pp-card--wide { grid-column: 1 / -1; }
      .proposal-print-portal .pp-card__label {
        font-family: var(--pp-heading) !important;
        font-size: 7.5pt !important;
        letter-spacing: 0.2em !important;
        text-transform: uppercase !important;
        color: var(--pp-warm) !important;
      }
      .proposal-print-portal .pp-card__value {
        font-family: var(--pp-body) !important;
        font-size: 11pt !important;
        line-height: 1.3 !important;
        color: var(--pp-ink) !important;
        margin-top: 2.5mm;
        /* A value that states several facts (the speaker families) keeps its
           own line breaks; every other value stays on one line. */
        white-space: pre-line;
        overflow-wrap: normal;
      }
      .proposal-print-portal .pp-card__hint {
        font-family: var(--pp-body) !important;
        font-size: 8.5pt !important;
        line-height: 1.4 !important;
        color: var(--pp-slate) !important;
        margin-top: 1.8mm;
      }

      /* ── At a glance: the fact groups and their headings ── */
      .proposal-print-portal .pp-facts-group {
        margin-top: 7mm;
      }
      .proposal-print-portal .pp-facts-group__title {
        font-family: var(--pp-heading) !important;
        font-size: 8.5pt !important;
        letter-spacing: 0.2em !important;
        text-transform: uppercase !important;
        color: var(--pp-green) !important;
        margin: 0 0 3mm !important;
      }
      /* A card stating two labelled figures (the screen) holds both on one line
         rather than wrapping mid-phrase. */
      .proposal-print-portal .pp-card--span2 { grid-column: span 2; }

      /* ── Metric (evidence) cards ── */
      .proposal-print-portal .pp-metrics {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 4mm;
        margin-top: 7mm;
      }
      .proposal-print-portal .pp-metric {
        background: var(--pp-paper);
        border: 1px solid var(--pp-rule);
        border-left: 3px solid var(--pp-green);
        padding: 5mm;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .proposal-print-portal .pp-metric__parameter {
        font-family: var(--pp-heading) !important;
        font-size: 8pt !important;
        letter-spacing: 0.16em !important;
        text-transform: uppercase !important;
        color: var(--pp-warm) !important;
      }
      .proposal-print-portal .pp-metric__result {
        font-family: var(--pp-heading) !important;
        font-size: 17pt !important;
        font-weight: 300 !important;
        letter-spacing: 0.04em !important;
        color: var(--pp-ink) !important;
        margin-top: 2.5mm;
      }
      .proposal-print-portal .pp-metric__gain {
        font-family: var(--pp-body) !important;
        font-size: 9pt !important;
        line-height: 1.45 !important;
        color: var(--pp-slate) !important;
        margin-top: 3mm;
      }

      /* ── Tables ── */
      .proposal-print-portal .pp-table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 4mm;
      }
      .proposal-print-portal .pp-table th {
        text-align: left;
        font-family: var(--pp-heading) !important;
        font-size: 8pt !important;
        letter-spacing: 0.16em !important;
        text-transform: uppercase !important;
        color: var(--pp-warm) !important;
        background: var(--pp-surface) !important;
        padding: 3mm !important;
        border-bottom: 1px solid var(--pp-rule);
      }
      .proposal-print-portal .pp-table td {
        font-family: var(--pp-body) !important;
        font-size: 10pt !important;
        color: var(--pp-slate) !important;
        padding: 3mm !important;
        border-bottom: 1px solid var(--pp-surface-2);
        vertical-align: top;
      }
      .proposal-print-portal .pp-table__strong { color: var(--pp-ink) !important; }
      .proposal-print-portal .pp-table tr {
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .proposal-print-portal .pp-table thead { display: table-header-group; }

      /* ── Blocks, notes, chips ── */
      .proposal-print-portal .pp-block {
        margin-top: 8mm;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .proposal-print-portal .pp-block__title {
        font-family: var(--pp-heading) !important;
        font-size: 10pt !important;
        letter-spacing: 0.16em !important;
        text-transform: uppercase !important;
        color: var(--pp-green) !important;
        margin: 0 0 2mm !important;
      }
      .proposal-print-portal .pp-notes { margin-top: 7mm; }
      .proposal-print-portal .pp-note {
        margin: 4mm 0 0 !important;
        padding: 4mm 5mm !important;
        background: var(--pp-surface-2) !important;
        border-left: 3px solid var(--pp-warm);
        font-family: var(--pp-body) !important;
        font-size: 9.5pt !important;
        line-height: 1.5 !important;
        color: var(--pp-slate) !important;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .proposal-print-portal .pp-note__title {
        font-family: var(--pp-heading) !important;
        font-size: 8.5pt !important;
        letter-spacing: 0.14em !important;
        text-transform: uppercase !important;
        color: var(--pp-green) !important;
        margin-bottom: 2mm;
      }
      .proposal-print-portal .pp-note__text {
        margin: 0 !important;
        font-family: var(--pp-body) !important;
        font-size: 9.5pt !important;
        color: var(--pp-slate) !important;
      }
      .proposal-print-portal .pp-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 2mm;
      }
      .proposal-print-portal .pp-chip {
        border: 1px solid var(--pp-rule);
        background: var(--pp-paper);
        padding: 1.8mm 3mm;
        font-family: var(--pp-body) !important;
        font-size: 8.5pt !important;
        color: var(--pp-slate) !important;
      }

      /* ── Method: the three design structures ── */
      .proposal-print-portal .pp-structures {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 4mm;
        margin-top: 7mm;
      }
      .proposal-print-portal .pp-structure {
        border-top: 2px solid var(--pp-green);
        padding-top: 4mm;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .proposal-print-portal .pp-structure__title {
        font-family: var(--pp-heading) !important;
        font-size: 10pt !important;
        letter-spacing: 0.12em !important;
        text-transform: uppercase !important;
        color: var(--pp-ink) !important;
      }
      .proposal-print-portal .pp-structure__text {
        font-family: var(--pp-body) !important;
        font-size: 9.5pt !important;
        line-height: 1.5 !important;
        color: var(--pp-slate) !important;
        margin: 2.5mm 0 0 !important;
      }

      /* ── Editorial image ── */
      .proposal-print-portal .pp-editorial {
        margin: 8mm 0 0;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .proposal-print-portal .pp-editorial img {
        display: block;
        width: 100%;
        height: 88mm;
        object-fit: cover;
        background: var(--pp-surface);
      }

      /* ── Prose column: never a full-width wall of text ── */
      .proposal-print-portal .pp-body {
        max-width: 150mm;
        font-family: var(--pp-body) !important;
        font-size: 11pt !important;
        line-height: 1.6 !important;
        color: var(--pp-slate) !important;
      }
      .proposal-print-portal .pp-body > *:first-child { margin-top: 0; }

      /* ── Print page behaviour ── */
      @media print {
        /* Each designed page starts on its own page, except the first content
           page, which follows the cover's own page break. */
        body.proposal-export-mode .proposal-print-portal .pp-page {
          break-before: page;
          page-break-before: always;
        }
        body.proposal-export-mode .proposal-print-cover + .pp-page {
          break-before: auto;
          page-break-before: auto;
        }
        /* No orphan headings: a title always keeps its first block. */
        body.proposal-export-mode .proposal-print-portal .pp-header {
          break-after: avoid;
          page-break-after: avoid;
        }
        body.proposal-export-mode .proposal-print-portal .pp-header__title,
        body.proposal-export-mode .proposal-print-portal .pp-header__lead {
          break-after: avoid;
          page-break-after: avoid;
        }
        body.proposal-export-mode .proposal-print-portal .pp-cards,
        body.proposal-export-mode .proposal-print-portal .pp-metrics,
        body.proposal-export-mode .proposal-print-portal .pp-structures {
          break-inside: avoid;
          page-break-inside: avoid;
        }

        /* No heading is left at the foot of a page: a title always keeps the
           first paragraph or table that belongs to it. */
        body.proposal-export-mode .proposal-print-portal .pp-block__title {
          break-after: avoid;
          page-break-after: avoid;
        }

        /* A designed block is never split down the middle of a page. */
        body.proposal-export-mode .proposal-print-portal .pp-block,
        body.proposal-export-mode .proposal-print-portal .pp-table,
        body.proposal-export-mode .proposal-print-portal .pp-editorial {
          break-inside: avoid;
          page-break-inside: avoid;
        }

        /* ── At a glance — one page that is never split across two ── */
        body.proposal-export-mode .proposal-print-portal .pp-page--glance,
        body.proposal-export-mode .proposal-print-portal .pp-page--glance .pp-facts-group {
          break-inside: avoid;
          page-break-inside: avoid;
        }

        /* ── Key Performance Highlights — one section, one page, never split ──
           The row count is capped to what fits a page, so the section never
           needs to continue and the table never breaks mid-row. ── */
        body.proposal-export-mode .proposal-print-portal .pp-page--highlights,
        body.proposal-export-mode .proposal-print-portal .pp-page--highlights .pp-body,
        body.proposal-export-mode .proposal-print-portal .pp-page--highlights .kph-table {
          break-inside: avoid;
          page-break-inside: avoid;
        }

        /* ── Project Images — image-led, one dominant image per page ── */
        body.proposal-export-mode .proposal-print-portal .pp-page--images {
          break-inside: avoid;
          page-break-inside: avoid;
        }
        body.proposal-export-mode .proposal-print-portal .pp-gallery {
          display: flex;
          flex-direction: column;
          gap: 5mm;
          break-inside: avoid;
          page-break-inside: avoid;
        }
        body.proposal-export-mode .proposal-print-portal .pp-gallery__figure {
          margin: 0;
          break-inside: avoid;
          page-break-inside: avoid;
        }
        body.proposal-export-mode .proposal-print-portal .pp-gallery__figure img {
          display: block;
          width: 100%;
          object-fit: cover;
          background: var(--pp-surface-2);
        }
        body.proposal-export-mode .proposal-print-portal .pp-gallery__caption {
          margin: 1.5mm 0 0 !important;
        }
        body.proposal-export-mode .proposal-print-portal .pp-gallery__support {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6mm;
          break-inside: avoid;
          page-break-inside: avoid;
        }
        /* Three images: a hero image with two supporting images below it. */
        body.proposal-export-mode .proposal-print-portal .pp-gallery--3 .pp-gallery__hero img {
          height: 146mm;
        }
        body.proposal-export-mode .proposal-print-portal .pp-gallery--3 .pp-gallery__support img {
          height: 82mm;
        }
        /* Two images: a dominant image with one supporting image below it. */
        body.proposal-export-mode .proposal-print-portal .pp-gallery--2 .pp-gallery__hero img {
          height: 162mm;
        }
        body.proposal-export-mode .proposal-print-portal .pp-gallery--2 .pp-gallery__support {
          grid-template-columns: 1fr;
        }
        body.proposal-export-mode .proposal-print-portal .pp-gallery--2 .pp-gallery__support img {
          height: 68mm;
        }
        /* One image: it is the page. */
        body.proposal-export-mode .proposal-print-portal .pp-gallery--1 .pp-gallery__hero img {
          height: 244mm;
        }
      }
    `}</style>
  );
}