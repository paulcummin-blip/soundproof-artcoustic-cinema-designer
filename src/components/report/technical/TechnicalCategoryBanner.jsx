/**
 * TechnicalCategoryBanner.jsx
 * ---------------------------
 * The RP22 category banner that heads every Technical Report parameter page.
 *
 * One consistent horizontal strip, at the same place on every parameter page:
 *
 *   [ COLOURED STRIP ]
 *   SPATIAL RESOLUTION                          RP22 TECHNICAL REPORT
 *
 * The category name is bold and larger than any parameter-card heading, so the
 * page is immediately identifiable as Spatial Resolution, Dynamic Range or
 * Timbre Matching — on the category's first, second or third page alike. The
 * right-hand report label stays subordinate: a category heading is an
 * engineering category, never a note about which page the reader is on.
 *
 * The colour is section identity only. It comes from the canonical category
 * colour authority, is applied to the banner strip and nothing else, and is
 * never used for a grade, a level pill or any result.
 *
 * The strip is deliberately restrained in height (≈6 mm), so the fixed A4
 * parameter frames carry exactly the card budget they carried before.
 */

import React from "react";

import {
  getCategoryBannerColour,
  PARAM_CATEGORY_BANNER_TEXT,
} from "./technicalParameterMeta";

import {
  REPORT_FONT_HEADING as HEADING_FONT,
  REPORT_FONT_BODY as BODY_FONT,
} from '@/components/report/typography/reportTypography';

/**
 * Props:
 *   category — the canonical category name (Spatial Resolution, Dynamic Range,
 *              Timbre Matching); never derived locally, never re-worded
 *   caption  — the small right-hand label; the caller may shorten it on a
 *              narrow frame, but it is not a heading
 */
export default function TechnicalCategoryBanner({
  category,
  caption = "RP22 Technical Report",
}) {
  if (!category) return null;

  const colour = getCategoryBannerColour(category);

  return (
    <div
      className="tech-param-category-banner"
      data-report-section-heading="true"
      data-report-param-category={category}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "3mm",
        background: colour,
        color: PARAM_CATEGORY_BANNER_TEXT,
        padding: "0.7mm 3.5mm",
        borderRadius: 3,
        WebkitPrintColorAdjust: "exact",
        printColorAdjust: "exact",
      }}
    >
      <span
        style={{
          fontFamily: HEADING_FONT,
          fontWeight: 700,
          fontSize: "12pt",
          lineHeight: 1.12,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: PARAM_CATEGORY_BANNER_TEXT,
        }}
      >
        {category}
      </span>
      <span
        style={{
          fontFamily: BODY_FONT,
          fontSize: "6.5pt",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.72)",
          whiteSpace: "nowrap",
        }}
      >
        {caption}
      </span>
    </div>
  );
}