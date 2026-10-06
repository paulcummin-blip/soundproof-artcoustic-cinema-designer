/**
 * TechnicalParameterPage.jsx
 * ---------------------------
 * Page wrapper for the Technical Report RP22 parameter print layout.
 *
 * Renders one or more parameter groups. Each RP22 category on the page carries
 * its own heading strip, so:
 *   - a page that crosses from Spatial Resolution into Dynamic Range shows a
 *     clear Dynamic Range divider before its first Dynamic Range parameter;
 *   - a category that started on an earlier page is labelled
 *     "Dynamic Range continued", so P13/P14/P15 can never appear under a
 *     heading that has floated away from the group it belongs to.
 *
 * The page background is #F1F0EE (Sound Proof page tone); cards are white.
 * Print spacing is deliberately compact so the parameter group fits inside the
 * A4 printable frame.
 */

import React from "react";
import { getCategoryColour } from "./technicalParameterMeta";

import {
  REPORT_FONT_BODY as BODY_FONT,
  reportSectionHeadingStyle,
} from '@/components/report/typography/reportTypography';

/**
 * The category heading strip. `compact` is the mid-page divider used when a
 * second category starts on a page that already carries a heading.
 */
function SegmentHeading({ category, continued, colour, compact = false }) {
  return (
    <div
      data-report-section-heading="true"
      data-report-param-category={category}
      className={`tech-param-segment-heading${compact ? " tech-param-segment-heading--divider" : ""}`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "2.5mm",
        paddingBottom: compact ? "0.8mm" : "1.5mm",
        borderBottom: `${compact ? "1.2px" : "1px"} solid ${compact ? colour : "#D9D5CE"}`,
      }}
    >
      {/* On-brand category colour bar — the divider the eye follows. */}
      <span
        aria-hidden="true"
        style={{
          flex: "0 0 auto",
          alignSelf: "stretch",
          minHeight: compact ? "3mm" : "4mm",
          width: compact ? "1.2mm" : "1.6mm",
          background: colour,
          borderRadius: "1px",
        }}
      />
      <span style={reportSectionHeadingStyle("8pt", { fontWeight: 600, color: colour })}>
        {category}{continued ? " continued" : ""}
      </span>
      {!compact && (
        <>
          <span
            style={{
              flex: 1,
              height: 0,
              borderTop: "1px solid transparent",
            }}
          />
          <span
            style={{
              fontSize: "7pt",
              color: "#9B8E82",
              fontFamily: BODY_FONT,
              whiteSpace: "nowrap",
            }}
          >
            RP22 Technical Report
          </span>
        </>
      )}
    </div>
  );
}

/**
 * Props:
 *   params   — the page's parameters, in canonical order (used for the block id)
 *   segments — [{ category, continued, cards }] — one entry per category
 *              run on this page, each carrying its rendered cards
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
        gap: "3mm",
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
            gap: "3mm",
            breakInside: "avoid",
            pageBreakInside: "avoid",
          }}
        >
          {segment.category && (
            <SegmentHeading
              category={segment.category}
              continued={segment.continued === true}
              colour={getCategoryColour(segment.category)}
              compact={index > 0}
            />
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