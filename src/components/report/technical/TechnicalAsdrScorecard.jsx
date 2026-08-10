/**
 * TechnicalAsdrScorecard.jsx
 * ---------------------------
 * Technical Report — ASDR Scorecard page.
 *
 * A proprietary Sound Proof design scorecard that shows which parameters
 * contribute to the Artcoustic System Design Rating, their importance
 * weighting, achieved performance, and points earned vs maximum.
 *
 * Presentation-only: consumes the canonical `contributions` array and
 * `roomDesignRating` from calculateRoomDesignRating(). Does NOT recalculate
 * any points, weights, or levels.
 *
 * Only ACTIVE, definitively scored parameters appear. Excluded parameters
 * (N/A, provisional, V1-excluded, unverified bass) are omitted entirely.
 */

import React from "react";
import { getHumanTitleForParam } from "./technicalParameterMeta";
import TechnicalAsdrRecommendations from "./TechnicalAsdrRecommendations";

const FONT_HEADING = "'Futura PT Light', 'Century Gothic', sans-serif";
const FONT_BODY = "'Didact Gothic', 'Century Gothic', sans-serif";

const COLORS = {
  bg: "#F1F0EE",
  cardBg: "#FFFFFF",
  primary: "#213428",
  body: "#3E4349",
  secondary: "#625143",
  border: "#E6E4DD",
  borderStrong: "#D9D5CE",
  label: "#9B8E82",
  fail: "#8B2E2E",
};

/** Category groupings — only groups with scored parameters are shown. */
const CATEGORY_GROUPS = [
  { label: "SPATIAL RESOLUTION", range: [1, 11] },
  { label: "DYNAMIC RANGE", range: [12, 15] },
  { label: "TIMBRE MATCHING", range: [16, 21] },
  { label: "SCREEN / VIEWING GEOMETRY", range: null }, // screen-only
];

/** Format points for display: handle negative (FAIL) values. */
function formatPoints(earned, maximum) {
  const e = Math.round(earned * 100) / 100;
  const m = Math.round(maximum * 100) / 100;
  return `${e} / ${m}`;
}

/** Format the overall percentage. */
function formatPct(rating) {
  if (!rating || rating.status === "NOT_ASSESSED") return null;
  const pct = rating.displayPercentage;
  if (!Number.isFinite(pct)) return null;
  return `${Math.round(pct)}%`;
}

/** Format the total score line. */
function formatTotal(rating) {
  if (!rating || rating.status === "NOT_ASSESSED") return null;
  const a = Math.round(rating.actualPoints * 100) / 100;
  const m = Math.round(rating.maximumAvailablePoints * 100) / 100;
  return `${a} / ${m}`;
}

/** Get the parameter label for a contribution. */
function getParamLabel(contrib) {
  if (contrib.key === "screen") return "Screen / Viewing Geometry";
  const num = contrib.parameter;
  return `P${num}  ${getHumanTitleForParam(num)}`;
}

/** Determine which group a contribution belongs to. */
function getGroupForContrib(contrib) {
  if (contrib.key === "screen") return "SCREEN / VIEWING GEOMETRY";
  const num = contrib.parameter;
  for (const g of CATEGORY_GROUPS) {
    if (g.range && num >= g.range[0] && num <= g.range[1]) return g.label;
  }
  return null;
}

/** Render a single scorecard row. */
function ScorecardRow({ contrib, isLast }) {
  const isFail = contrib.resultLevel === "FAIL";
  const resultStyle = isFail
    ? { color: COLORS.fail, fontWeight: 700 }
    : { color: COLORS.primary, fontWeight: 600 };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 60mm 18mm 36mm",
        alignItems: "center",
        gap: "3mm",
        padding: "2.2mm 4mm",
        borderTop: isLast ? "none" : `1px solid ${COLORS.border}`,
        fontSize: "9pt",
        fontFamily: FONT_BODY,
        color: COLORS.body,
      }}
    >
      {/* PARAMETER */}
      <div style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
        {getParamLabel(contrib)}
      </div>
      {/* RESULT */}
      <div style={resultStyle}>
        {contrib.resultLevel || "—"}
        {contrib.mode === "recommended" && (
          <span style={{ fontSize: "7.5pt", color: COLORS.secondary, marginLeft: "2mm" }}>
            Recommended
          </span>
        )}
      </div>
      {/* WEIGHT */}
      <div style={{ textAlign: "center", color: COLORS.secondary }}>
        {contrib.effectiveWeight}
      </div>
      {/* SCORE */}
      <div style={{ textAlign: "right", fontWeight: 600, color: isFail ? COLORS.fail : COLORS.primary }}>
        {formatPoints(contrib.earnedPoints, contrib.maximumPoints)}
      </div>
    </div>
  );
}

/** Render a group section with header and rows. */
function ScorecardGroup({ label, contribs }) {
  if (!contribs || contribs.length === 0) return null;
  return (
    <div style={{ marginBottom: "4mm" }}>
      <div
        style={{
          fontSize: "8pt",
          fontWeight: 700,
          color: COLORS.secondary,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          fontFamily: FONT_HEADING,
          padding: "2mm 4mm",
          borderBottom: `1px solid ${COLORS.borderStrong}`,
        }}
      >
        {label}
      </div>
      {contribs.map((contrib, i) => (
        <ScorecardRow
          key={contrib.key}
          contrib={contrib}
          isLast={i === contribs.length - 1}
        />
      ))}
    </div>
  );
}

export default function TechnicalAsdrScorecard({
  roomDesignRating,
  showDesignRating = false,
  recommendations = null,
}) {
  if (!showDesignRating || !roomDesignRating) {
    return null;
  }

  const contributions = roomDesignRating.contributions || [];
  const pct = formatPct(roomDesignRating);
  const total = formatTotal(roomDesignRating);

  // Group contributions by category
  const grouped = {};
  for (const contrib of contributions) {
    const group = getGroupForContrib(contrib);
    if (!group) continue;
    if (!grouped[group]) grouped[group] = [];
    grouped[group].push(contrib);
  }

  return (
    <div
      className="tech-asdr-scorecard"
      style={{
        background: COLORS.bg,
        padding: "8mm 10mm 5mm 10mm",
        boxSizing: "border-box",
        WebkitPrintColorAdjust: "exact",
        printColorAdjust: "exact",
        fontFamily: FONT_BODY,
        color: COLORS.body,
      }}
    >
      {/* ── Page heading ── */}
      <div style={{ marginBottom: "4mm" }}>
        <div
          style={{
            fontFamily: FONT_HEADING,
            fontSize: "18pt",
            fontWeight: 400,
            color: COLORS.primary,
            letterSpacing: "0.01em",
            lineHeight: 1.1,
          }}
        >
          ARTCOUSTIC SYSTEM DESIGN RATING
        </div>
        <div
          style={{
            fontSize: "9pt",
            color: COLORS.secondary,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            fontFamily: FONT_BODY,
            marginTop: "1mm",
          }}
        >
          DESIGN SCORECARD
        </div>
      </div>

      {/* ── Overall result card ── */}
      <div
        className="print-avoid-break"
        style={{
          background: COLORS.cardBg,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 6,
          padding: "6mm 8mm",
          marginBottom: "4mm",
          breakInside: "avoid",
          pageBreakInside: "avoid",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: "8mm",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "8pt",
                fontWeight: 700,
                color: COLORS.secondary,
                letterSpacing: "0.1em",
                fontFamily: FONT_BODY,
                marginBottom: "2mm",
              }}
            >
              ARTCOUSTIC SYSTEM DESIGN RATING
            </div>
            <div
              style={{
                fontSize: "36pt",
                fontWeight: 400,
                color: COLORS.primary,
                fontFamily: FONT_HEADING,
                lineHeight: 1,
              }}
            >
              {pct || "NOT ASSESSED"}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div
              style={{
                fontSize: "8pt",
                fontWeight: 700,
                color: COLORS.secondary,
                letterSpacing: "0.1em",
                fontFamily: FONT_BODY,
                marginBottom: "2mm",
              }}
            >
              TOTAL SCORE
            </div>
            <div
              style={{
                fontSize: "16pt",
                fontWeight: 400,
                color: COLORS.primary,
                fontFamily: FONT_HEADING,
                lineHeight: 1,
              }}
            >
              {total || "—"}
            </div>
          </div>
        </div>
      </div>

      {/* ── Scorecard table ── */}
      <div
        className="print-avoid-break"
        style={{
          background: COLORS.cardBg,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 6,
          breakInside: "avoid",
          pageBreakInside: "avoid",
        }}
      >
        {/* Column headers */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 60mm 18mm 36mm",
            gap: "3mm",
            padding: "3mm 4mm",
            borderBottom: `1px solid ${COLORS.borderStrong}`,
            fontSize: "7.5pt",
            fontWeight: 700,
            color: COLORS.secondary,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            fontFamily: FONT_BODY,
          }}
        >
          <div>PARAMETER</div>
          <div>RESULT</div>
          <div style={{ textAlign: "center" }}>WEIGHT</div>
          <div style={{ textAlign: "right" }}>SCORE</div>
        </div>

        {/* Grouped rows */}
        {CATEGORY_GROUPS.map((group) => (
          <ScorecardGroup
            key={group.label}
            label={group.label}
            contribs={grouped[group.label]}
          />
        ))}
      </div>

      {/* ── Evaluated recommendations (best improvement / best cost saving) ── */}
      <TechnicalAsdrRecommendations recommendations={recommendations} />

      {/* ── Client language note (proprietary disclaimer) ── */}
      <div
        style={{
          marginTop: "2mm",
          fontSize: "8pt",
          color: COLORS.secondary,
          fontFamily: FONT_BODY,
          lineHeight: 1.5,
          fontStyle: "italic",
          breakInside: "avoid",
          pageBreakInside: "avoid",
        }}
      >
        The Artcoustic System Design Rating is a proprietary Sound Proof design metric.
        It combines the achieved performance of the active design parameters with their
        relative importance. It is not a CEDIA RP22 or RP23 Performance Level.
      </div>
    </div>
  );
}