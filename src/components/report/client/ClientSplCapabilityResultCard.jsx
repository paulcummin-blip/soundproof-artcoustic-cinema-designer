/**
 * ClientSplCapabilityResultCard
 * ----------------------------
 * Shared wide, low-profile result card for the P12 / P13 SPL Capability client
 * Visual Report pages. Matches the P5 status-card layout — rectangular level
 * badge, heading, explanation, supporting line, target basis and individual
 * speaker SPL values.
 *
 * Spans the full available width (no maxWidth / centring) so it reads as a
 * single low band beneath the drawing, consistent with the P5 page.
 */

import React from "react";

const LEVEL_COLOR = {
  L4: "#213428",
  L3: "#3E4349",
  L2: "#625143",
  L1: "#4A230F",
  FAIL: "#4A230F",
  default: "#C1B6AD",
};

function levelColor(lvl) {
  return LEVEL_COLOR[lvl] || LEVEL_COLOR.default;
}

export default function ClientSplCapabilityResultCard({
  level,
  resultHeading,
  resultExplanation,
  minimum,
  parameterLabel,
  targetBasisLabel,
  speakerSplValues,
}) {
  if (!level) return null;
  const color = levelColor(level);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "16px 20px",
        background: "#F1F0EE",
        borderRadius: 12,
        border: `1px solid ${color}40`,
        width: "100%",
        fontFamily: "Didact Gothic, Century Gothic, sans-serif",
      }}
    >
      {/* Rectangular level badge — matches P5 / P9 (48×48, radius 8) */}
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 8,
          background: `${color}25`,
          border: `2px solid ${color}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 18,
          fontWeight: 700,
          color,
          fontFamily: "Futura PT Light, Century Gothic, sans-serif",
          flexShrink: 0,
        }}
      >
        {level}
      </div>

      <div style={{ flex: 1 }}>
        {/* Heading — dynamic by level */}
        <div style={{ fontSize: 16, fontWeight: 600, color: "#213428", marginBottom: 4 }}>
          {resultHeading}
        </div>

        {/* Plain-English explanation */}
        {resultExplanation && (
          <div style={{ fontSize: 13, color: "#3E4349", lineHeight: 1.5, marginBottom: 8 }}>
            {resultExplanation}
          </div>
        )}

        {/* Supporting line — only for SPL capability pages (P12/P13) */}
        {minimum && (
          <div style={{ fontSize: 12, color: "#625143" }}>
            {minimum?.formatted ?? "—"} {parameterLabel}
          </div>
        )}

        {/* Target basis — only when explicitly provided */}
        {targetBasisLabel && (
          <div style={{ fontSize: 11, color: "#625143", letterSpacing: "0.04em", marginTop: 4 }}>
            Target basis: {targetBasisLabel}
          </div>
        )}

        {/* Individual speaker SPL values */}
        {Array.isArray(speakerSplValues) && speakerSplValues.length > 0 && (
          <div
            style={{
              fontSize: 12,
              color: "#625143",
              marginTop: 8,
              display: "flex",
              flexWrap: "wrap",
              gap: "4px 12px",
            }}
          >
            {speakerSplValues.map((s, i) => (
              <span key={i}>
                {s.role} {s.formatted}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}