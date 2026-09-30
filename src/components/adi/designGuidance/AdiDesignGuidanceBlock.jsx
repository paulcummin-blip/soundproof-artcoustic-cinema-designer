/**
 * AdiDesignGuidanceBlock.jsx
 * --------------------------
 * ARTCOUSTIC DESIGN INTELLIGENCE (ADI) — Design Guidance block.
 *
 * The single branded presentation of the canonical ADI limiting-factor
 * guidance. Every surface that shows ADI guidance shows this block, so the
 * designer sees the same answer — the same limiting factor, the same first
 * action — wherever they look.
 *
 * Presentation only. It renders what buildAdiDesignGuidance() returns and
 * recomputes nothing.
 *
 * Naming rule: "Artcoustic Design Intelligence" on first reference, "ADI"
 * afterwards — enforced by the heading/subheading pair below.
 */

import React, { useMemo } from "react";
import { buildAdiDesignGuidance } from "./adiDesignGuidanceEngine";
import {
  REPORT_FONT_HEADING as FONT_HEADING,
  REPORT_FONT_BODY as FONT_BODY,
} from "@/components/report/typography/reportTypography";

const COLORS = {
  cardBg: "#FFFFFF",
  primary: "#213428",
  body: "#3E4349",
  secondary: "#625143",
  border: "#E6E4DD",
  divider: "#F0EFEA",
  muted: "#77736B",
  label: "#9B8E82",
  markBg: "#213428",
};

const SEVERITY_STYLE = {
  HIGH: { background: "#F6E7E1", color: "#8B4A2B", border: "#E4C9BC" },
  MEDIUM: { background: "#F4EFE4", color: "#7A6640", border: "#E2D7BE" },
  LOW: { background: "#EEF1ED", color: "#3E5A47", border: "#D6DFD6" },
  NONE: { background: "#F0EFEA", color: COLORS.secondary, border: COLORS.border },
};

const GUIDANCE_LABELS = [
  ["whatIsWrong", "What is wrong"],
  ["whyItIsHappening", "Why it is happening"],
  ["changeFirst", "Change first"],
  ["expectedImprovement", "Expected improvement"],
  ["remainingLimitation", "Remaining limitation"],
  ["lowerValueChanges", "Lower-value changes"],
];

function AdiMark() {
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 34,
        height: 34,
        borderRadius: 6,
        background: COLORS.markBg,
        color: "#FFFFFF",
        fontFamily: FONT_HEADING,
        fontSize: 14,
        letterSpacing: "0.04em",
        flexShrink: 0,
      }}
    >
      ADI
    </span>
  );
}

export default function AdiDesignGuidanceBlock({
  engineeringSummary,
  seats,
  geometry,
  system,
  compact = false,
}) {
  const guidance = useMemo(
    () => buildAdiDesignGuidance(engineeringSummary, { seats, geometry, system }),
    [engineeringSummary, seats, geometry, system],
  );

  if (!guidance?.available) return null;

  const severity = SEVERITY_STYLE[guidance.severity] || SEVERITY_STYLE.NONE;
  const padding = compact ? "14px 16px" : "18px 20px";

  return (
    <section
      className="adi-design-guidance print-avoid-break"
      style={{
        background: COLORS.cardBg,
        border: `1px solid ${COLORS.border}`,
        borderLeft: `4px solid ${COLORS.primary}`,
        borderRadius: 8,
        padding,
        fontFamily: FONT_BODY,
        color: COLORS.body,
        breakInside: "avoid",
        pageBreakInside: "avoid",
      }}
    >
      {/* ── ADI branding + heading ── */}
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <AdiMark />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontFamily: FONT_HEADING,
              fontSize: compact ? 15 : 17,
              fontWeight: 400,
              color: COLORS.primary,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              lineHeight: 1.2,
            }}
          >
            ADI Design Guidance
          </div>
          <div
            style={{
              marginTop: 4,
              fontSize: compact ? 11 : 12,
              color: COLORS.secondary,
              lineHeight: 1.45,
            }}
          >
            Artcoustic Design Intelligence has identified the main limiting factor in this design.
          </div>
        </div>
        {guidance.severity && guidance.severity !== "NONE" && (
          <span
            style={{
              flexShrink: 0,
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              padding: "3px 8px",
              borderRadius: 4,
              border: `1px solid ${severity.border}`,
              background: severity.background,
              color: severity.color,
            }}
          >
            {guidance.severity} priority
          </span>
        )}
      </div>

      {/* ── ADI has identified ── */}
      <div
        style={{
          marginTop: 14,
          paddingTop: 12,
          borderTop: `1px solid ${COLORS.divider}`,
        }}
      >
        <div
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: COLORS.label,
            marginBottom: 4,
          }}
        >
          ADI has identified
        </div>
        <div
          style={{
            fontFamily: FONT_HEADING,
            fontSize: compact ? 15 : 17,
            color: COLORS.primary,
            lineHeight: 1.3,
          }}
        >
          {guidance.headline}
        </div>
        {guidance.evidenceLines.length > 0 && (
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 3 }}>
            {guidance.evidenceLines.map((line, index) => (
              <div
                key={index}
                style={{ fontSize: 10.5, color: COLORS.muted, lineHeight: 1.45 }}
              >
                {line}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── The six questions ── */}
      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        {GUIDANCE_LABELS.map(([field, label]) => {
          const text = guidance[field];
          if (!text) return null;
          return (
            <div key={field}>
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: COLORS.label,
                  marginBottom: 3,
                }}
              >
                {label}
              </div>
              <div
                style={{
                  fontSize: compact ? 11.5 : 12.5,
                  lineHeight: 1.55,
                  color: field === "changeFirst" ? COLORS.primary : COLORS.body,
                  fontWeight: field === "changeFirst" ? 600 : 400,
                }}
              >
                {text}
              </div>
            </div>
          );
        })}
      </div>

      {guidance.rankedResults.length > 1 && (
        <div
          style={{
            marginTop: 14,
            paddingTop: 10,
            borderTop: `1px solid ${COLORS.divider}`,
            fontSize: 10,
            color: COLORS.muted,
            lineHeight: 1.5,
          }}
        >
          <span style={{ fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", fontSize: 9, color: COLORS.label }}>
            ADI ranked order
          </span>
          {" — "}
          {guidance.rankedResults
            .map((entry) => `${entry.area} (P${entry.number} ${entry.level || "—"})`)
            .join(" · ")}
        </div>
      )}
    </section>
  );
}