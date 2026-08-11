/**
 * TechnicalParameterPage.jsx
 * ---------------------------
 * Page wrapper for the Technical Report RP22 parameter print layout.
 *
 * Renders a small category heading bar at the top, followed by exactly
 * 3 parameter cards distributed vertically with deliberate whitespace.
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
      className={`tech-param-page${isFirst ? " tech-param-page--first" : ""}`}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "5mm",
        breakInside: "auto",
        pageBreakInside: "auto",
      }}
    >
      {/* Category heading bar — small, does not consume excessive vertical space */}
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

      {/* Cards — 3 per page, distributed to fill available height */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "5mm",
          flex: 1,
        }}
      >
        {children}
      </div>
    </div>
  );
}