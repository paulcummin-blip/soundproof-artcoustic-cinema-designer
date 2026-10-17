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
      .pp-media--portrait img { height: 62mm; }

      /* ── An inline detail image beside the copy ──────────────────────────
         The same copy-and-image row the portrait accent uses, so an inline
         detail sits with the paragraphs it supports rather than in a card beside
         them. The frame follows the image's own proportions and nothing is
         cropped, so a dimensioned drawing keeps every dimension, label and
         annotation it carries. The row keeps its established keep-together
         rule.

         The image takes the SUPPORTING share of the content column — the same
         share the portrait accent takes, about 38 per cent, and never the whole
         column — so a detail reads as supporting evidence rather than as a
         second hero beside the copy. The selector carries the class twice so it
         outranks the standalone detail treatment's own width wherever the two
         disagree. ── */
      .pp-media-row .pp-media.pp-media--presentation-detail,
      .pp-media-row .pp-media.pp-media--presentation-cropped-detail {
        flex: 0 0 38%;
        max-width: 38%;
        width: 38%;
      }
      /* ── No card around an inline detail image ───────────────────────────
         A detail beside the copy sits on the page as an editorial image: no
         frame, no border, no background box and no padding around it. Its label
         stays beneath it, as the quiet caption it already is.

         The frame follows the image's own proportions — height: auto — so the
         top of the frame and the top of the photograph are one and the same
         line, and that line is the first line of the copy beside it: the two
         columns begin together and the picture is never letterboxed down away
         from the text. Nothing is stretched: object-fit keeps the image whole.

         The selector carries the class twice so it outranks the fixed accent
         height a detail may inherit from the role it landed on, and the hairline
         frame the standalone treatment draws, whatever the order of the sheet. */
      .pp-pillar .pp-media-row .pp-media.pp-media--presentation-detail img {
        height: auto;
        border: 0;
        background: transparent;
      }
      .pp-media-row .pp-media--presentation-detail img {
        height: auto;
        max-height: 84mm;
      }
      .pp-media-row .pp-media--presentation-cropped-detail img { height: 52mm; }

      /* ── The Spatial Resolution accent carries more vertical presence ──
         The right-hand photograph beside the Spatial Resolution copy is about
         20% taller than the standard portrait accent (74mm → 89mm on the sheet),
         so it reads with the copy it supports instead of sitting beside it as a
         small card. ONLY the height changes: the frame's width, the focal crop
         and object-fit: cover are untouched, so the source keeps its proportions,
         nothing is stretched, and the taller window shows more of the photograph
         rather than cropping it further. The other structures' portraits and the
         Timbre Matching feature are unchanged. */
      .pp-pillar[data-editorial-section="spatial_resolution"] .pp-media--portrait img { height: 62mm; }

      /* ── The seating-style page ── */
      .pp-seating {
        margin-top: 6mm;
      }
      .pp-seating .pp-media { margin: 0 0 6mm; }
      .pp-media--seating img { height: 56mm; }
      .pp-seating__lead { margin: 0 0 4mm !important; }

      /* ── The comparison page ────────────────────────────────────────────
         Two options read together: both at the full width of the content
         column and at one visual scale, so the client compares them directly
         rather than reading two small boxes. ── */
      .pp-comparison { margin-top: 6mm; }
      .pp-comparison .pp-media { margin: 0 0 6mm; }
      .pp-comparison .pp-media:last-child { margin-bottom: 0; }
      .pp-comparison__lead { margin: 0 0 5mm !important; }
      .pp-media--comparison img { height: 56mm; }

      /* ── The designer's presentation choice ──────────────────────────────
         Three modes, and the difference between them is the permission to
         crop, not a style. The selectors carry two classes so they outrank the
         role treatments above whatever the order: an image the designer has
         marked as a detail is never cropped, even on a role that normally
         crops to a fixed frame height.

         FULL WIDTH   the prominent editorial image: the full content width and
                      the existing landscape weight, unchanged.
         DETAIL       smaller and whole. The frame takes the image's own aspect
                      ratio (height: auto, object-fit: contain), so nothing is
                      cropped, nothing is stretched and a dimensioned drawing
                      keeps every dimension, label and annotation it carries.
                      The caption stays attached beneath it.
         CROPPED DETAIL  smaller and cropped, framed on the image's own focal
                      point, which is the one mode where the focal controls
                      apply. ── */
      .pp-media.pp-media--presentation-full-width { width: 100%; }
      /* The supporting share of the content column: about 40 per cent, so a
         detail reads as supporting evidence beside the copy rather than as a
         second hero. It is never the full content width. */
      .pp-media.pp-media--presentation-detail,
      .pp-media.pp-media--presentation-cropped-detail {
        width: 40%;
        max-width: 40%;
        margin-bottom: 6mm;
      }
      .pp-media.pp-media--presentation-detail img {
        height: auto;
        max-height: 82mm;
        object-fit: contain;
        background: #FFFFFF;
        border: 0.2mm solid #E7E3DA;
      }
      .pp-media.pp-media--presentation-cropped-detail img {
        height: 52mm;
        object-fit: cover;
      }

      /* ── Print: the sheet is the authority ───────────────────────────────
         Usable page height is 297mm less the 22mm / 20mm content margins, so a
         landscape feature at 118mm is about half of it: dominant, with room for
         the copy above or below and never shrunk into a card. ── */
      @media print {
        .pp-media--landscape img { height: 118mm; }
        .pp-media--landscape { margin-bottom: 8mm; }
        /* A closing feature has more visual weight: 144mm is 22% taller than
           the standard landscape frame. Width, focal crop and typography stay
           unchanged; object-fit: cover preserves the source proportions. */
        .pp-media--closing-feature img { height: 144mm; }
        /* The pair that closes the design: two full-width photographs at ONE
           visual scale, each with its own caption, sharing the sheet with the
           conclusion above them. 78mm is the page budget the comparison page
           already gives two full-width images, and it is what keeps the pair, the
           copy and the heading together on one sheet. A dimensioned drawing keeps
           its own uncropped treatment: it is never cropped to suit this scale. */
        .pp-closing { margin-top: 6mm; }
        .pp-closing .pp-media img { height: 78mm; }
        /* One concluding photograph is the page's editorial hero, not half of a
           pair. It receives the standard full-width feature depth while leaving
           room for the conclusion above it. */
        .pp-closing--1 .pp-media img { height: 118mm; }
        .pp-closing .pp-media { margin-bottom: 6mm; }
        .pp-closing .pp-media:last-child { margin-bottom: 0; }
        .pp-closing .pp-media.pp-media--presentation-detail img,
        .pp-closing .pp-media.pp-media--presentation-detail { height: auto; }
        .pp-media--portrait img { height: 74mm; }
        .pp-media--seating img { height: 74mm; }
        /* The Spatial Resolution accent on the printed sheet: 89mm is about 20%
           taller than the standard 74mm accent, on the same width. */
        .pp-pillar[data-editorial-section="spatial_resolution"] .pp-media--portrait img { height: 89mm; }
        /* A detail drawing on the sheet: about 58 to 60 per cent of the content
           column, with the frame following the drawing's own proportions and
           room for a tall plan, and never cropped. The height is bounded rather
           than fixed, so a dimensioned plan is reduced only as far as it stays
           readable. */
        .pp-media.pp-media--presentation-detail { width: 40%; max-width: 40%; }
        .pp-media.pp-media--presentation-detail img { max-height: 88mm; }
        /* The cropped detail on the sheet: a compact editorial crop, framed on
           the focal point the designer chose. */
        .pp-media.pp-media--presentation-cropped-detail { width: 40%; max-width: 40%; }
        /* A DIMENSIONED DRAWING keeps the legible share rather than the supporting
           share: at 40 per cent its dimensions, symbols and annotations stop
           being readable. It is still shown whole and still never leads a page —
           this is legibility, not prominence. A Full Width choice is untouched. */
        .pp-media.pp-media--presentation-detail[data-purpose="layout_drawing"],
        .pp-media.pp-media--presentation-cropped-detail[data-purpose="layout_drawing"] {
          width: 58%;
          max-width: 58%;
        }
        .pp-media.pp-media--presentation-cropped-detail img { height: 62mm; }
        .pp-media.pp-media--presentation-full-width { width: 100%; }
        /* The comparison page: two full-width options and their captions share
           the sheet with the title, the message and — on the page that closes
           the document — the closing note. The image height is therefore a page
           budget rather than a preference: at 78mm both options, their captions
           and the copy above them fit one sheet, and where a closing note shares
           that sheet the options give back the height it needs (66mm), so the
           explanation and both photographs are always presented together. */
        .pp-media--comparison img { height: 78mm; }
        body.proposal-export-mode .proposal-print-section.pp-page--with-endnote .pp-media--comparison img {
          height: 66mm;
        }
        .pp-media-row { gap: 8mm; }
        /* An inline detail drawing on the sheet: the frame follows the drawing's
           own proportions and its height is bounded rather than fixed, so the
           drawing is reduced only as far as it stays readable and is never
           cropped. */
        .pp-media-row .pp-media--presentation-detail img { max-height: 96mm; }
        .pp-media-row,
        .pp-seating,
        .pp-seating .pp-media,
        .pp-comparison,
        .pp-comparison .pp-media {
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
        body.proposal-export-mode .proposal-print-section.pp-page--comparison {
          padding-top: 16mm;
          break-inside: avoid;
          page-break-inside: avoid;
        }

        /* ── Photographs integrated into the narrative: on the sheet, the layout
             the plan chose is the layout the page carries. These rules carry the
             export mode's own prefix so they outrank the image-page gallery
             treatment above, and an image marked Full Width or Detail still takes
             its own mode's treatment unchanged. ── */
        body.proposal-export-mode .proposal-print-portal .pp-image-flow {
          break-inside: avoid;
          page-break-inside: avoid;
        }
        body.proposal-export-mode .proposal-print-portal .pp-image-flow .pp-gallery {
          display: flex;
          flex-direction: column;
          gap: 8mm;
        }
        body.proposal-export-mode .proposal-print-portal .pp-image-flow .pp-media {
          margin: 0;
        }
        body.proposal-export-mode .proposal-print-portal .pp-image-flow--side_by_side .pp-gallery {
          flex-direction: row;
          align-items: flex-start;
          gap: 6mm;
        }
        body.proposal-export-mode .proposal-print-portal .pp-image-flow--side_by_side .pp-gallery > .pp-media,
        body.proposal-export-mode .proposal-print-portal .pp-image-flow__support .pp-media {
          width: 40%;
          max-width: 40%;
        }
        body.proposal-export-mode .proposal-print-portal .pp-image-flow__support {
          display: flex;
          flex-wrap: wrap;
          align-items: flex-start;
          gap: 6mm;
        }
        body.proposal-export-mode .proposal-print-portal .pp-image-flow--feature_and_support .pp-image-flow__support {
          margin-top: 6mm;
        }
        body.proposal-export-mode .proposal-print-portal .pp-image-flow .pp-media[data-presentation="unstated"] img {
          width: 100%;
          height: auto;
          max-height: none;
          object-fit: contain;
          background: transparent;
        }
      }

      /* ── PHOTOGRAPHS INTEGRATED INTO THE NARRATIVE ────────────────────────
         A project photograph that would otherwise have had a gallery page of
         its own is composed INSIDE the section it supports, below that
         section's copy, so the document reads as one brochure rather than a
         narrative with a gallery bolted onto the end of it. One photograph
         follows the copy; two that share a page are composed by the layout the
         plan chose from the designer's own presentation metadata:

           stacked              two Full Width photographs — or two with nothing
                                recorded — each at the full content width and in
                                its own proportions, one under the other;
           side_by_side         two supporting photographs, each at the
                                supporting share of the content width;
           feature_and_support  the prominent photograph at the full content
                                width, the supporting one beneath it smaller.

         The block is one composition, so the measured compositor keeps a pair
         together on its sheet where the sheet can hold both and continues the
         second photograph onto the section's own next sheet where it cannot.
         Nothing is cropped to make a pair fit, nothing is promoted, and nothing
         is reduced below the share its presentation reserves. ── */
      .pp-image-flow {
        margin: 8mm 0 0;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .pp-image-flow__lead { margin: 0 0 6mm; }
      .pp-image-flow .pp-gallery {
        display: flex;
        flex-direction: column;
        gap: 8mm;
      }
      .pp-image-flow .pp-media { margin: 0; }
      .pp-image-flow--side_by_side .pp-gallery {
        flex-direction: row;
        align-items: flex-start;
        gap: 6mm;
      }
      .pp-image-flow--side_by_side .pp-gallery > .pp-media,
      .pp-image-flow__support .pp-media {
        width: 40%;
        max-width: 40%;
      }
      .pp-image-flow__support {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-start;
        gap: 6mm;
      }
      .pp-image-flow--feature_and_support .pp-image-flow__support { margin-top: 6mm; }
      /* A photograph with no presentation recorded is composed here at its own
         proportions. The established role frame crops to a fixed height, which
         belongs on a page the photograph has to itself; on a page it shares with
         the copy it supports, the photograph is shown as it was uploaded. A
         recorded choice is untouched: Full Width and Detail keep their own rules
         exactly as they are. */
      .pp-image-flow .pp-media[data-presentation="unstated"] img {
        width: 100%;
        height: auto;
        max-height: none;
        object-fit: contain;
        background: transparent;
      }

      /* ── FULL WIDTH: THE UPLOADED IMAGE IS THE COMPOSITION ────────────────
         A FULL WIDTH image is shown exactly as it was uploaded: the full content
         width, its own height and its own proportions. No fixed height, no
         template ratio, no crop and no object-fit: cover — the uploaded
         composition is intentional, so a taller source stays taller and a
         shorter source stays shorter. The height is never derived from the page
         template; the page is composed around the image instead.

         The selector carries the class twice (and the export mode's own prefix
         on the sheet) so it outranks every role treatment above whatever the
         order: the presentation is the designer's instruction, not a style, so
         an image marked Full Width never takes a role's fixed frame.

         Where the copy and the image cannot share a sheet, the measured
         compositor moves the copy and the image keeps its area; an image too
         tall for the printable area is scaled as a whole to fit it, which is a
         scale and never a crop. An image with no presentation recorded keeps the
         established treatment exactly as it was. ── */
      .pp-media.pp-media--presentation-full-width img {
        width: 100%;
        height: auto;
        max-height: none;
        object-fit: contain;
        background: transparent;
      }

      @media print {
        body.proposal-export-mode .proposal-print-portal .pp-media.pp-media--presentation-full-width img {
          width: 100%;
          height: auto;
          max-height: none;
          object-fit: contain;
          background: transparent;
        }
      }
    `}</style>
  );
}