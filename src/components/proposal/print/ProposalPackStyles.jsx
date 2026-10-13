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
import { proposalPackPageBreakCss } from './proposalPageBreakRules';

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

      /* ── Page header: number, kicker, tracked title, lead, rule. The rule is
         followed by a generous gap, so the body of every page sits placed rather
         than pushed up under the heading. ── */
      .proposal-print-portal .pp-header {
        margin: 0 0 14mm;
      }
      .proposal-print-portal .pp-header__meta {
        display: flex;
        align-items: baseline;
        gap: 4mm;
        margin-bottom: 5mm;
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
        margin-top: 7mm;
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

      /* Reading flow: nothing that introduces content is left alone at the foot
         of a page, a table header never prints without its rows, and a paragraph
         never splits into a stranded line. A section too long for its page is
         shortened in its copy, not allowed to overflow. */
      .proposal-print-portal .pp-header,
      .proposal-print-portal .pp-block__title,
      .proposal-print-portal .pp-facts-group__title,
      .proposal-print-portal .pp-decision__title,
      .proposal-print-portal .pp-body > h1,
      .proposal-print-portal .pp-body > h2,
      .proposal-print-portal .pp-body > h3 { break-after: avoid; page-break-after: avoid; }
      .proposal-print-portal .pp-body { orphans: 3; widows: 3; }
      /* The evidence table continues between whole rows when it needs a second
         sheet — never as a heading with no rows under it. The table's own header
         repeats on the continuation, and no row is ever cut. */
      .proposal-print-portal .kph-table thead { break-after: avoid; page-break-after: avoid; }
      .proposal-print-portal .kph-table tr { break-inside: avoid; page-break-inside: avoid; }
      .proposal-print-portal .pp-highlights__intro { break-after: avoid; page-break-after: avoid; }
      .proposal-print-portal .pp-decision { break-inside: avoid; page-break-inside: avoid; }
      .proposal-print-portal .pp-decision__title { font-family: var(--pp-heading); font-size: 9pt; letter-spacing: .08em; text-transform: uppercase; color: var(--pp-warm); margin: 0 0 2mm; }
      .proposal-print-portal .pp-decision__choice { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6mm; margin-top: 6mm; break-inside: avoid; }
      .proposal-print-portal .pp-decision__choice-item { border-top: 2px solid var(--pp-green); padding-top: 3mm; break-inside: avoid; }
      .proposal-print-portal .pp-decision__choice-item dt { font-family: var(--pp-heading); font-size: 8pt; letter-spacing: .08em; text-transform: uppercase; color: var(--pp-warm); margin: 0; }
      .proposal-print-portal .pp-decision__choice-item dd { margin: 1.5mm 0 0; font-family: var(--pp-body); font-size: 10pt; line-height: 1.35; color: var(--pp-ink); }
      .proposal-print-portal .pp-decision__same { margin-top: 6mm; }
      .proposal-print-portal .pp-comparison-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6mm; margin-top: 6mm; break-inside: avoid; }
      .proposal-print-portal .pp-comparison-option { border-top: 2px solid var(--pp-green); padding-top: 4mm; }
      .proposal-print-portal .pp-comparison-option__row { padding: 1.8mm 0; border-bottom: 1px solid var(--pp-rule); }
      .proposal-print-portal .pp-comparison-option__row dt { font-family: var(--pp-heading); font-size: 7.5pt; color: var(--pp-warm); }
      .proposal-print-portal .pp-comparison-option__row dd { margin: 1mm 0 0; font-family: var(--pp-body); font-size: 10pt; line-height: 1.25; color: var(--pp-ink); }

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
      /* The At a Glance package table: the same table, set compactly, so the
         system package shares the glance page with the fact cards instead of
         pushing the page over and leaving a sheet half empty. */
      .proposal-print-portal .pp-table--compact {
        table-layout: fixed;
        margin-top: 3mm;
      }
      .proposal-print-portal .pp-table--compact th {
        padding: 1.8mm 3mm !important;
        font-size: 7.5pt !important;
      }
      .proposal-print-portal .pp-table--compact td {
        padding: 1.8mm 3mm !important;
        font-size: 9pt !important;
        line-height: 1.35 !important;
      }
      .proposal-print-portal .pp-table--compact tr:last-child td { border-bottom: none; }

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

      /* ── Method: what makes great cinema sound ──
         An editorial grid rather than three narrow columns. Every row states one
         quality: its heading and opening sentence in the left column, the
         explanation beside it in the right, on one alignment for the whole page
         so the eye reads down the labels and across the prose. Generous space
         between rows and a clear three-level hierarchy: heading, opening
         sentence, explanation. Green is spent twice only, on the row headings
         and on the closing rule, and nothing is decorative. ── */
      .proposal-print-portal .pp-page--method .pp-header {
        margin-bottom: 5mm;
      }
      .proposal-print-portal .pp-page--method .pp-header__rule {
        margin-top: 6mm;
      }
      .proposal-print-portal .pp-method__intro {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6mm;
        margin-bottom: 5mm;
      }
      .proposal-print-portal .pp-method__intro p {
        font-family: var(--pp-body) !important;
        font-size: 11pt !important;
        line-height: 1.5 !important;
        color: var(--pp-slate) !important;
        margin: 0 !important;
      }
      .proposal-print-portal .pp-method__row {
        display: grid;
        grid-template-columns: 50mm 1fr;
        gap: 6mm;
        border-top: 1px solid var(--pp-rule);
        padding-top: 3mm;
        margin-top: 3.5mm;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .proposal-print-portal .pp-method__row:first-child {
        margin-top: 0;
      }
      .proposal-print-portal .pp-method__heading {
        font-family: var(--pp-heading) !important;
        font-size: 9.5pt !important;
        font-weight: 300 !important;
        letter-spacing: 0.12em !important;
        text-transform: uppercase !important;
        color: var(--pp-green) !important;
        margin: 0 !important;
      }
      .proposal-print-portal .pp-method__lede {
        font-family: var(--pp-heading) !important;
        font-size: 11pt !important;
        line-height: 1.3 !important;
        color: var(--pp-ink) !important;
        margin: 2.5mm 0 0 !important;
      }
      .proposal-print-portal .pp-method__body {
        min-width: 0;
        font-family: var(--pp-body) !important;
        font-size: 9pt !important;
        line-height: 1.42 !important;
        color: var(--pp-slate) !important;
      }
      .proposal-print-portal .pp-method__body p {
        margin: 0 0 2.2mm !important;
      }
      .proposal-print-portal .pp-method__body p:last-child {
        margin-bottom: 0 !important;
      }
      /* The closing statement is the page's own conclusion rather than a fourth
         quality: a heavier green rule separates it, and it is set a size larger
         than the explanations, in the page's own ink colour. */
      .proposal-print-portal .pp-method__row--closing {
        border-top: 2px solid var(--pp-green);
        padding-top: 4.5mm;
        margin-top: 3mm;
      }
      .proposal-print-portal .pp-method__row--closing .pp-method__body {
        font-size: 10pt !important;
        line-height: 1.5 !important;
        color: var(--pp-ink) !important;
      }
      .proposal-print-portal .pp-method__row--closing .pp-method__body p {
        margin-bottom: 3mm !important;
      }

      /* ── Image pages: the hero image leads, with deliberate space above and
         below it, and the supporting images sit under it rather than beside it.
         ── */
      .proposal-print-portal .pp-gallery {
        margin-top: 6mm;
      }
      /* A gallery of the designer's own photographs reads as one full-width
         column, and the gap between photographs is the only spacing in it. That
         keeps the measured sheet and the printed sheet identical whatever the
         sheet carries: one photograph, or two that genuinely fit together. */
      .proposal-print-portal .pp-gallery--natural {
        display: flex;
        flex-direction: column;
        gap: 8mm;
      }
      .proposal-print-portal .pp-gallery__hero {
        margin: 0 0 8mm;
      }
      .proposal-print-portal .pp-gallery__support {
        margin-bottom: 2mm;
      }
      .proposal-print-portal .pp-page--images .pp-header {
        margin-bottom: 6mm;
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

      /* ── Prose column: never a full-width wall of text. One type scale for
         every narrative page, so no section reads narrower, larger or tighter
         than its neighbour. ── */
      .proposal-print-portal {
        --pp-body-size: 11pt;
        --pp-body-leading: 1.55;
        --pp-paragraph-gap: 4.2mm;
      }
      .proposal-print-portal .pp-body {
        max-width: 148mm;
        font-family: var(--pp-body) !important;
        font-size: var(--pp-body-size) !important;
        line-height: var(--pp-body-leading) !important;
        color: var(--pp-slate) !important;
      }
      .proposal-print-portal .pp-body > *:first-child { margin-top: 0; }
      .proposal-print-portal .pp-body p {
        margin: 0 0 var(--pp-paragraph-gap) !important;
      }
      .proposal-print-portal .pp-body p:last-child { margin-bottom: 0 !important; }
      .proposal-print-portal .pp-body h2,
      .proposal-print-portal .pp-body h3 {
        margin: 0 0 3mm !important;
        break-after: avoid;
        page-break-after: avoid;
      }

      /* ── Editorial flow: sections that share a sheet ──
         Consecutive narrative sections are composed into one sheet frame, so a
         short structure section continues under the section before it instead of
         taking a sheet of its own. The section that opens the sheet carries the
         page number; a section continuing on it keeps its own heading and
         hierarchy without stating a second number on the same sheet. */
      .proposal-print-portal .pp-page--flow .pp-header {
        margin-bottom: 10mm;
      }
      .proposal-print-portal .pp-header--continued {
        margin-top: 14mm;
      }
      .proposal-print-portal .pp-header--continued .pp-header__title {
        font-size: 15pt !important;
      }
      .proposal-print-portal .pp-header--continued .pp-header__rule {
        margin-top: 5mm;
      }

      /* ── Editorial compositions ──
         A section's copy is composed in the blocks the document reads it in: the
         opening composition carries the section's own heading, the photograph that
         leads it and its first block, and the rest of the copy continues in one
         further composition. They are measured as one unit each, so a sheet break
         can only fall between them — never midway through a paragraph — and the
         space between two compositions that do share a sheet reads as one
         deliberate step. */
      .proposal-print-portal .pp-composition {
        display: flow-root;
      }
      .proposal-print-portal .pp-composition + .pp-composition {
        margin-top: 10mm;
      }

      /* ── The three design structures: ONE connected editorial section ──
         Spatial Resolution, Dynamic Range and Timbre Matching are read as one
         account under one shared heading. One hierarchy and one rhythm: the shared
         heading, then each structure's own heading and its complete explanation,
         then the photograph that supports it. The structures are the same editorial
         weight as each other, so none of them reads as an unrelated page. */
      .proposal-print-portal .pp-pillars__title {
        font-family: var(--pp-heading) !important;
        font-size: 9pt !important;
        font-weight: 300 !important;
        letter-spacing: 0.24em !important;
        text-transform: uppercase !important;
        color: var(--pp-warm) !important;
        margin: 0 0 6mm !important;
        padding-bottom: 3mm;
        border-bottom: 1px solid var(--pp-rule);
        break-after: avoid;
        page-break-after: avoid;
      }
      .proposal-print-portal .pp-pillar .pp-header--continued {
        margin-top: 0;
      }
      .proposal-print-portal .pp-pillar .pp-header__title {
        font-size: 14pt !important;
      }
      .proposal-print-portal .pp-pillar .pp-header__rule {
        margin-top: 4mm;
      }
      /* Each structure after the first opens with the same hairline rule, so the
         hierarchy reads identically on the sheet the section continues onto: the
         two pages are one explanation, not two unrelated pages. The gap is
         padding, never a margin: it is part of the measured height of the
         structure it introduces, so the allocation can never place a structure
         against the rule. */
      .proposal-print-portal .pp-pillar + .pp-pillar {
        margin-top: 0;
        padding-top: 11mm;
        border-top: 1px solid var(--pp-rule);
      }
      .proposal-print-portal .pp-pillar .pp-body {
        max-width: 148mm;
      }
      /* The photograph that supports a structure's explanation follows it, at a
         deliberate distance. Padding, not a margin and never a negative offset:
         the gap is measured with the photograph, so a sheet break can neither
         close it up nor let the two touch. */
      .proposal-print-portal .pp-pillar .pp-media {
        margin-top: 0;
        padding-top: 10mm;
      }

      /* ── Closing note ──
         A short factual source note closes the page it belongs to instead of
         taking a sheet of its own for a few sentences. */
      .proposal-print-portal .pp-endnote {
        margin-top: 9mm;
        padding-top: 5mm;
        border-top: 1px solid var(--pp-rule);
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .proposal-print-portal .pp-endnote__title {
        font-family: var(--pp-heading) !important;
        font-size: 7.5pt !important;
        letter-spacing: 0.2em !important;
        text-transform: uppercase !important;
        color: var(--pp-warm) !important;
        margin: 0 0 2mm !important;
      }
      .proposal-print-portal .pp-endnote__body {
        max-width: 148mm;
        font-family: var(--pp-body) !important;
        font-size: 9.5pt !important;
        line-height: 1.5 !important;
        color: var(--pp-slate) !important;
      }
      .proposal-print-portal .pp-endnote__body p {
        margin: 0 0 2.5mm !important;
      }
      .proposal-print-portal .pp-endnote__body p:last-child {
        margin-bottom: 0 !important;
      }

      /* ── Print page behaviour ──
         One authority for every print page break (proposalPageBreakRules.js): a
         heading always keeps the first block that belongs to it, a designed block
         or table is never split, a fact group stays with its own heading, a table
         never starts a page away from the heading it belongs to, and each
         one-page section — At a Glance, Key Performance Highlights, an imagery
         page — is read as one thing. Nothing is left carrying a heading alone and
         no page is stranded by a block pushed onto the next. */
      @media print {
${proposalPackPageBreakCss()}

        /* ── Project Images — image-led, one dominant image per page ── */
        body.proposal-export-mode .proposal-print-portal .pp-page--images {
          break-inside: avoid;
          page-break-inside: avoid;
        }
        body.proposal-export-mode .proposal-print-portal .pp-gallery {
          display: flex;
          flex-direction: column;
          gap: 0;
        }
        body.proposal-export-mode .proposal-print-portal .pp-gallery__figure {
          margin: 0;
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
        }
        /* The image heights are a page budget, not a preference: the page frame
           is 297mm with 12mm above and 14mm below, the heading takes about 30mm,
           and what is left is shared out so the hero image is 55 to 65 per cent
           of the image area and nothing is ever pushed onto a second page. */
        /* Three images: a full-width hero image with two supporting images below
           it. The hero is the subject of the page and keeps deliberate space
           under it; the two supporting images sit beneath it without competing. */
        body.proposal-export-mode .proposal-print-portal .pp-gallery--3 .pp-gallery__hero img {
          height: 132mm;
        }
        body.proposal-export-mode .proposal-print-portal .pp-gallery--3 .pp-gallery__support img {
          height: 84mm;
        }
        /* Four images: the hero image full width, with three supporting images
           in one row beneath it. */
        body.proposal-export-mode .proposal-print-portal .pp-gallery--4 .pp-gallery__hero img {
          height: 128mm;
        }
        body.proposal-export-mode .proposal-print-portal .pp-gallery--4 .pp-gallery__support {
          grid-template-columns: repeat(3, 1fr);
        }
        body.proposal-export-mode .proposal-print-portal .pp-gallery--4 .pp-gallery__support img {
          height: 68mm;
        }
        /* Two images: a dominant image with one supporting image below it. */
        body.proposal-export-mode .proposal-print-portal .pp-gallery--2 .pp-gallery__hero img {
          height: 150mm;
        }
        body.proposal-export-mode .proposal-print-portal .pp-gallery--2 .pp-gallery__support {
          grid-template-columns: 1fr;
        }
        body.proposal-export-mode .proposal-print-portal .pp-gallery--2 .pp-gallery__support img {
          height: 56mm;
        }
        /* One image: it is the page. */
        body.proposal-export-mode .proposal-print-portal .pp-gallery--1 .pp-gallery__hero img {
          height: 200mm;
        }
        /* The natural gallery keeps that gap whatever it carries, so a sheet that
           carries a single photograph is composed to the same measurement the
           compositor allocated it by. */
        body.proposal-export-mode .proposal-print-portal .pp-gallery--natural {
          gap: 8mm;
        }
      }
    `}</style>
  );
}