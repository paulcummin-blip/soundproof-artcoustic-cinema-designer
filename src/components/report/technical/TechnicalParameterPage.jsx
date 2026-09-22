/**
 * TechnicalParameterPage.jsx
 * ---------------------------
 * Page wrapper for the Technical Report RP22 parameter print layout.
 *
 * Renders a small category heading bar at the top, followed by at most
 * 2 atomic parameter cards. The smaller group leaves enough printable
 * height for variable descriptions, seat rows, thresholds and footers.
 *
 * The page background is #F1F0EE (Sound Proof page tone); cards are white.
 */

import React from "react";
import { getCategoryForParam } from "./technicalParameterMeta";

const HEADING_FONT = "'Futura PT Light', 'Century Gothic', sans-serif";
const BODY_FONT = "'Didact Gothic', 'Century Gothic', sans-serif";

export default function TechnicalParameterPage({ params, children, isFirst = false }) {
  const categories = [];
  const seen = new Set();
  for (const p of params) {
    const cat = getCategoryForParam(p.id);
    if (!seen.has(cat)) {
      seen.add(cat);
      categories.push(cat);
    }
  }
  const categoryLabel = categories.join("   ·   ");

  return (
    <div
      className={`tech-param-page report-page-block${isFirst ? " tech-param-page--first" : ""}`}
      data-report-block={`rp22-parameters-${params?.[0]?.id || "page"}`}
      data-report-block-kind="rp22-parameter-cards"
      data-report-page-start="true"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "5mm",
        breakInside: "auto",
        pageBreakInside: "auto",
      }}
    >
      {isFirst && (
        <div className="tech-param-report-heading">
          <div className="tech-param-report-title">RP22 PARAMETERS</div>
          <div className="tech-param-report-subtitle">ENGINEERING EVIDENCE</div>
        </div>
      )}

      {/* Category heading bar — part of the same atomic page as its cards */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "3mm",
          paddingBottom: "1.5mm",
          borderBottom: "1px solid #D9D5CE",
        }}
      >
        <span
          style={{
            fontSize: "8pt",
            fontWeight: 600,
            color: "#213428",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            fontFamily: HEADING_FONT,
          }}
        >
          {categoryLabel}
        </span>
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
      </div>

      {/* Cards remain atomic; the page wrapper may fragment only between cards. */}
      <div
        className="tech-param-page__cards"
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          gap: "5mm",
          flex: 1,
        }}
      >
        {children}
      </div>
    </div>
  );
}