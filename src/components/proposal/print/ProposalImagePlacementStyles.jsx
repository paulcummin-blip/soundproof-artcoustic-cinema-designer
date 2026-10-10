/**
 * ProposalImagePlacementStyles
 * ----------------------------
 * The layout of the Proposal's editorial image placements.
 *
 * Two treatments, deliberately different in weight:
 *   - the full-width landscape: the dominant, image-first treatment, spanning the
 *     usable content width at 45 to 65 per cent of the usable page height;
 *   - the portrait editorial accent: a smaller crop sitting beside the copy.
 *
 * Heights are in mm so the printed sheet is the authority. The screen figures are
 * for the editor preview only, where a full sheet does not exist.
 *
 * The rules are deliberately unscoped (`.pp-media…`) rather than nested inside
 * `.proposal-print-portal`, because the same treatments are drawn in two places:
 * the printed pack, which lives inside that portal, and the Proposal Editor's
 * on-screen preview, which does not.
 */

import React from 'react';

export default function ProposalImagePlacementStyles() {
  return (
    <style>{`
      /* ── Shared treatment ───────────────────────────────────────────────
         The image fills its frame and the crop follows the focal point, so a
         landscape source never has to be re-exported to sit in a portrait
         accent. ── */
      .pp-media {
        margin: 0 0 6mm;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .pp-media img {
        display: block;
        width: 100%;
        object-fit: cover;
        background: #F1F0EE;
      }
      .pp-media__caption {
        margin: 2mm 0 0;
        font-family: var(--pp-body, "Didact Gothic", "Century Gothic", sans-serif);
        font-size: 9pt;
        line-height: 1.45;
        color: #625143;
      }

      /* ── The portrait editorial accent, beside the copy ── */
      .pp-media-row {
        display: flex;
        align-items: flex-start;
        gap: 6mm;
      }
      .pp-media-row__copy {
        flex: 1 1 auto;
        min-width: 0;
      }
      .pp-media--portrait {
        flex: 0 0 38%;
        max-width: 38%;
        margin: 0;
      }
      .pp-media--portrait img { height: 52mm; }

      /* ── The seating-style page ── */
      .pp-seating {
        margin-top: 6mm;
      }
      .pp-seating .pp-media { margin: 0 0 6mm; }
      .pp-media--seating img { height: 56mm; }
      .pp-seating__lead { margin: 0 0 4mm !important; }

      /* ── Print: the sheet is the authority ───────────────────────────────
         Usable page height is 297mm less the 22mm / 20mm content margins, so a
         landscape feature at 118mm is about half of it: dominant, with room for
         the copy above or below and never shrunk into a card. ── */
      @media print {
        .pp-media--landscape img { height: 118mm; }
        .pp-media--landscape { margin-bottom: 8mm; }
        .pp-media--portrait img { height: 74mm; }
        .pp-media--seating img { height: 74mm; }
        .pp-media-row { gap: 8mm; }
        .pp-media-row,
        .pp-seating,
        .pp-seating .pp-media {
          break-inside: avoid;
          page-break-inside: avoid;
        }

        /* An image-led page gives part of its top margin to the image it leads
           with, so the dominant treatment still fits beside the copy and the
           evidence cards that share the same sheet. */
        body.proposal-export-mode .proposal-print-section.pp-page--imaged {
          padding-top: 14mm;
        }
        body.proposal-export-mode .proposal-print-section.pp-page--imaged .pp-header {
          margin-bottom: 8mm;
        }
        body.proposal-export-mode .proposal-print-section.pp-page--seating {
          padding-top: 16mm;
          break-inside: avoid;
          page-break-inside: avoid;
        }
      }
    `}</style>
  );
}