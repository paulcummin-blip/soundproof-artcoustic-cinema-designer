/**
 * TechnicalParameterPage.jsx
 * ---------------------------
 * Page wrapper for the Technical Report RP22 parameter print layout.
 *
 * Renders one or more parameter groups. Each RP22 category run on the page
 * carries the same full-width category banner — its canonical name, bold, on
 * its own section-identity colour — so:
 *   - a page that crosses from Spatial Resolution into Dynamic Range shows a
 *     clear Dynamic Range banner before its first Dynamic Range parameter;
 *   - a category that began on an earlier page shows the SAME banner as its
 *     first page (SPATIAL RESOLUTION / DYNAMIC RANGE / TIMBRE MATCHING): a
 *     heading is an engineering category, never a page note, so P13/P14/P15 can
 *     never appear under a heading that has floated away from its own group.
 *
 * The banner is deliberately restrained in height, and the gap that used to sit
 * between the old small heading and its first card is reclaimed, so the fixed
 * A4 frame carries the same three-card budget it carried before.
 *
 * The page background is #F1F0EE (Sound Proof page tone); cards are white.
 * Print spacing is deliberately compact so the parameter group fits inside the
 * A4 printable frame.
 */

import React from "react";
import TechnicalCategoryBanner from "./TechnicalCategoryBanner";

import {
  REPORT_FONT_BODY as BODY_FONT,
  reportSectionHeadingStyle,
} from '@/components/report/typography/reportTypography';

/**
 * Props:
 *   params   — the page's parameters, in canonical order (used for the block id)
 *   segments — [{ category, cards }] — one entry per category run on this page,
 *              each carrying its rendered cards
 *   isFirst  — renders the page's own "RP22 PARAMETERS" report title
 */
export default function TechnicalParameterPage({ params, segments, isFirst = false }) {
  const groups = Array.isArray(segments) ? segments : [];
  const isMultiCategory = groups.length > 1;

  return (
    <div
      className={`tech-param-page report-page-block${isFirst ? " tech-param-page--first" : ""}${isMultiCategory ? " tech-param-page--multi" : ""}`}
      data-report-block={`rp22-parameters-${params?.[0]?.id || "page"}`}
      data-report-block-kind="rp22-parameter-cards"
      data-report-page-start="true"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "2mm",
        breakInside: "avoid",
        pageBreakInside: "avoid",
      }}
    >
      {isFirst && (
        <div className="tech-param-report-heading">
          <div className="tech-param-report-title">RP22 PARAMETERS</div>
          <div className="tech-param-report-subtitle">ENGINEERING EVIDENCE</div>
        </div>
      )}

      {/* One group per category run: the heading travels with its own cards
          (breakInside: avoid), so a category heading can never be stranded at
          the foot of a page away from its first parameter. */}
      {groups.map((segment, index) => (
        <div
          key={`${segment.category || "group"}-${index}`}
          className="tech-param-segment"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.8mm",
            breakInside: "avoid",
            pageBreakInside: "avoid",
          }}
        >
          {segment.category && (
            <TechnicalCategoryBanner category={segment.category} />
          )}

          {/* The cards remain atomic on the printed page. */}
          <div
            className="tech-param-page__cards"
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              gap: "3mm",
            }}
          >
            {segment.cards}
          </div>
        </div>
      ))}
    </div>
  );
}