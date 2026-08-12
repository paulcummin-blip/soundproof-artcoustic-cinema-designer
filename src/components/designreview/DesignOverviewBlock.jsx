/**
 * DesignOverviewBlock.jsx
 * ------------------------
 * Design Overview content for the in-app Design Review workspace.
 *
 * Consumes the canonical roomDesignRating and designRecommendations from the
 * shared window.__ROOM_DESIGNER_ASDR__ store. Does NOT mount any analysis engine
 * or recommendation engine. Does NOT recalculate or reinterpret scoring.
 *
 * Presentation-only: derives pillar summaries, lowest performance results, and
 * a recommendation snapshot from the existing contributions array.
 *
 * RP22 Performance Levels (L1–L4) are neutral RESULTS. The "LOWEST PERFORMANCE
 * RESULTS" section is a diagnostic shortcut to the lowest current results — it
 * does NOT mean those results are wrong. If the project brief deliberately
 * targets L1, that is still simply the lowest current result.
 */

import React from "react";
import { getCategoryForParam, getHumanTitleForParam } from "@/components/report/technical/technicalParameterMeta";
import {
  getLowestPerformanceResults,
  normalizeLevel,
  LEVEL_TEXT_COLORS,
} from "@/components/designreview/needsAttentionAuthority";

const COLORS = {
  bg: "transparent",
  cardBg: "#FFFFFF",
  primary: "#213428",
  body: "#3E4349",
  secondary: "#625143",
  border: "#E6E4DD",
  borderStrong: "#D9D5CE",
  label: "#9B8E82",
  fail: "#8B2E2E",
  muted: "#77736B",
};

const FONT_HEADING = "'Futura PT Light', 'Century Gothic', sans-serif";
const FONT_BODY = "'Didact Gothic', 'Century Gothic', sans-serif";

const PILLAR_ORDER = [
  "Spatial Resolution",
  "Dynamic Range",
  "Timbre Matching",
  "Screen / Viewing Geometry",
];

// ── Helpers (display-only, no scoring) ──────────────────────────────

function getPillar(contrib) {
  if (contrib.key === "screen") return "Screen / Viewing Geometry";
  return getCategoryForParam(Number(contrib.parameter)) || "General";
}

function getParamLabel(contrib) {
  if (contrib.key === "screen") return "Screen / Viewing Geometry";
  const num = Number(contrib.parameter);
  return `P${num}  ${getHumanTitleForParam(num)}`;
}

function summarizePillar(contribs) {
  const counts = { L4: 0, L3: 0, L2: 0, L1: 0, FAIL: 0, total: 0 };
  for (const c of contribs) {
    if (!c.resultLevel) continue;
    counts.total++;
    const str = String(c.resultLevel);
    if (str.includes("FAIL")) counts.FAIL++;
    else if (str.includes("L1")) counts.L1++;
    else if (str.includes("L2")) counts.L2++;
    else if (str.includes("L3")) counts.L3++;
    else if (str.includes("L4")) counts.L4++;
  }
  return counts;
}

function formatPillarSummary(counts) {
  const parts = [];
  if (counts.L4) parts.push(`${counts.L4}×L4`);
  if (counts.L3) parts.push(`${counts.L3}×L3`);
  if (counts.L2) parts.push(`${counts.L2}×L2`);
  if (counts.L1) parts.push(`${counts.L1}×L1`);
  if (counts.FAIL) parts.push(`${counts.FAIL}×FAIL`);
  return parts.length ? parts.join(" · ") : "—";
}

function levelColor(norm) {
  if (!norm) return COLORS.muted;
  return LEVEL_TEXT_COLORS[norm] || COLORS.body;
}

function formatPoints(earned, maximum) {
  if (!Number.isFinite(earned) || !Number.isFinite(maximum)) return "—";
  const roundedEarned = Math.round(earned * 100) / 100;
  const roundedMaximum = Math.round(maximum * 100) / 100;
  return `${roundedEarned} / ${roundedMaximum}`;
}

// ── Sub-components ───────────────────────────────────────────────────

function RatingCard({ rating }) {
  const pct = rating?.displayPercentage != null ? Math.round(rating.displayPercentage) : null;
  const total =
    rating?.actualPoints != null && rating?.maximumAvailablePoints != null
      ? `${Math.round(rating.actualPoints * 100) / 100} / ${Math.round(rating.maximumAvailablePoints * 100) / 100}`
      : "—";

  return (
    <div
      style={{
        background: COLORS.cardBg,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 8,
        padding: "20px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
      }}
    >
      <div>
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: COLORS.secondary,
            letterSpacing: "0.1em",
            fontFamily: FONT_BODY,
            marginBottom: 6,
          }}
        >
          ARTCOUSTIC SYSTEM DESIGN RATING
        </div>
        <div
          style={{
            fontSize: 36,
            fontWeight: 400,
            color: COLORS.primary,
            fontFamily: FONT_HEADING,
            lineHeight: 1,
          }}
        >
          {pct != null ? `${pct}%` : "NOT ASSESSED"}
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: COLORS.secondary,
            letterSpacing: "0.1em",
            fontFamily: FONT_BODY,
            marginBottom: 6,
          }}
        >
          TOTAL SCORE
        </div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 400,
            color: COLORS.primary,
            fontFamily: FONT_HEADING,
            lineHeight: 1,
          }}
        >
          {total}
        </div>
      </div>
    </div>
  );
}

function PillarSummaryCard({ pillar, contribs }) {
  const counts = summarizePillar(contribs);
  const hasFail = counts.FAIL > 0;

  return (
    <div
      style={{
        background: COLORS.cardBg,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 8,
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          color: COLORS.secondary,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          fontFamily: FONT_BODY,
        }}
      >
        {pillar}
      </div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: hasFail ? COLORS.fail : COLORS.primary,
          fontFamily: FONT_BODY,
          lineHeight: 1.3,
        }}
      >
        {formatPillarSummary(counts)}
      </div>
    </div>
  );
}

function LowestResultRow({ contrib, onParamClick }) {
  const norm = normalizeLevel(contrib.resultLevel);
  const color = levelColor(norm);

  return (
    <div
      data-param-key={contrib.key}
      data-param-number={contrib.parameter}
      onClick={() => onParamClick?.(contrib.key)}
      title="Click to explore parameter"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "10px 14px",
        borderTop: `1px solid ${COLORS.border}`,
        cursor: "pointer",
        transition: "background 0.15s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "#F8F7F5";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: COLORS.primary,
          fontFamily: FONT_BODY,
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {getParamLabel(contrib)}
      </div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color,
          fontFamily: FONT_BODY,
          whiteSpace: "nowrap",
        }}
      >
        {contrib.resultLevel || "—"}
      </div>
    </div>
  );
}

function ScorecardGroup({ pillar, contribs }) {
  if (!contribs.length) return null;

  return (
    <div data-scorecard-pillar={pillar}>
      <div
        style={{
          padding: "8px 14px",
          background: "#F8F7F5",
          borderTop: `1px solid ${COLORS.borderStrong}`,
          borderBottom: `1px solid ${COLORS.border}`,
          fontSize: 9,
          fontWeight: 700,
          color: COLORS.secondary,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          fontFamily: FONT_BODY,
        }}
      >
        {pillar}
      </div>
      {contribs.map((contrib) => {
        const norm = normalizeLevel(contrib.resultLevel);
        const isFail = norm === "FAIL";
        return (
          <div
            key={contrib.key}
            data-scorecard-param={contrib.key}
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(250px, 1fr) minmax(150px, 0.6fr) 70px 110px",
              gap: 14,
              alignItems: "center",
              padding: "10px 14px",
              borderBottom: `1px solid ${COLORS.border}`,
              fontSize: 11,
              fontFamily: FONT_BODY,
              color: COLORS.body,
            }}
          >
            <div style={{ color: COLORS.primary, fontWeight: 600 }}>
              {getParamLabel(contrib)}
            </div>
            <div style={{ color: levelColor(norm), fontWeight: 700 }}>
              {contrib.resultLevel || "—"}
              {contrib.mode === "recommended" && (
                <span style={{ marginLeft: 6, color: COLORS.secondary, fontSize: 9, fontWeight: 400 }}>
                  Recommended
                </span>
              )}
            </div>
            <div style={{ textAlign: "center", color: COLORS.secondary }}>
              {contrib.effectiveWeight ?? "—"}
            </div>
            <div
              style={{
                textAlign: "right",
                color: isFail ? COLORS.fail : COLORS.primary,
                fontWeight: 600,
              }}
            >
              {formatPoints(contrib.earnedPoints, contrib.maximumPoints)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FullScorecard({ contributions, pillarMap, scorecardPillars, open, onToggle }) {
  const panelId = "design-overview-full-scorecard";

  return (
    <div
      data-testid="design-overview-scorecard"
      style={{
        background: COLORS.cardBg,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        style={{
          width: "100%",
          padding: "13px 16px",
          border: 0,
          background: "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          cursor: "pointer",
          color: COLORS.primary,
          fontFamily: FONT_BODY,
          textAlign: "left",
        }}
      >
        <span>
          <span
            style={{
              display: "block",
              fontSize: 10,
              fontWeight: 700,
              color: COLORS.secondary,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            Full Scorecard
          </span>
          <span style={{ display: "block", marginTop: 3, fontSize: 11, color: COLORS.muted }}>
            {contributions.length} scored parameter{contributions.length !== 1 ? "s" : ""}
          </span>
        </span>
        <span aria-hidden="true" style={{ fontSize: 15, lineHeight: 1 }}>
          {open ? "⌃" : "⌄"}
        </span>
      </button>

      {open && (
        <div id={panelId} style={{ borderTop: `1px solid ${COLORS.borderStrong}` }}>
          <div style={{ overflowX: "auto" }}>
            <div style={{ minWidth: 650 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(250px, 1fr) minmax(150px, 0.6fr) 70px 110px",
                  gap: 14,
                  padding: "9px 14px",
                  fontSize: 9,
                  fontWeight: 700,
                  color: COLORS.secondary,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  fontFamily: FONT_BODY,
                }}
              >
                <div>Parameter</div>
                <div>Result</div>
                <div style={{ textAlign: "center" }}>Weight</div>
                <div style={{ textAlign: "right" }}>Score</div>
              </div>
              {scorecardPillars.map((pillar) => (
                <ScorecardGroup
                  key={pillar}
                  pillar={pillar}
                  contribs={pillarMap[pillar] || []}
                />
              ))}
            </div>
          </div>
          <div
            style={{
              padding: "10px 14px",
              background: "#F8F7F5",
              color: COLORS.secondary,
              fontSize: 10,
              fontFamily: FONT_BODY,
              lineHeight: 1.45,
            }}
          >
            Score is points earned / maximum available. Only active, definitively scored
            parameters are included.
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────

export default function DesignOverviewBlock({ rating, recommendations, onParamClick, onShowRecommendations }) {
  const [scorecardOpen, setScorecardOpen] = React.useState(false);

  if (!rating || rating.status === "NOT_ASSESSED") {
    return (
      <div
        style={{
          padding: "32px 16px",
          textAlign: "center",
          color: COLORS.secondary,
          fontFamily: FONT_BODY,
          fontSize: 13,
        }}
      >
        Design Rating not assessed yet. Open the project in the Room Designer to populate the
        Design Review.
      </div>
    );
  }

  const contributions = rating.contributions || [];

  // Group by pillar
  const pillarMap = {};
  for (const contrib of contributions) {
    const pillar = getPillar(contrib);
    if (!pillarMap[pillar]) pillarMap[pillar] = [];
    pillarMap[pillar].push(contrib);
  }
  const scorecardPillars = [
    ...PILLAR_ORDER,
    ...Object.keys(pillarMap).filter((pillar) => !PILLAR_ORDER.includes(pillar)),
  ];

  // Lowest performance results (FAIL first, then L1, then L2)
  const lowestResults = getLowestPerformanceResults(contributions);

  // Recommendation counts
  const improvementCount = Array.isArray(recommendations?.improvements)
    ? recommendations.improvements.length
    : 0;
  const bestPracticeCount = Array.isArray(recommendations?.bestPractice)
    ? recommendations.bestPractice.length
    : 0;
  const simplificationCount = Array.isArray(recommendations?.savings)
    ? recommendations.savings.length
    : 0;
  const recsAvailable = recommendations?.isSettled === true;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "4px 0" }}>
      {/* Rating card */}
      <RatingCard rating={rating} />

      {/* Pillar summaries */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 10,
        }}
      >
        {PILLAR_ORDER.map((pillar) => (
          <PillarSummaryCard
            key={pillar}
            pillar={pillar}
            contribs={pillarMap[pillar] || []}
          />
        ))}
      </div>

      {/* Full canonical scorecard — collapsed by default */}
      <FullScorecard
        contributions={contributions}
        pillarMap={pillarMap}
        scorecardPillars={scorecardPillars}
        open={scorecardOpen}
        onToggle={() => setScorecardOpen((current) => !current)}
      />

      {/* Lowest Performance Results */}
      <div
        style={{
          background: COLORS.cardBg,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "10px 14px",
            fontSize: 10,
            fontWeight: 700,
            color: COLORS.secondary,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            fontFamily: FONT_BODY,
            borderBottom: `1px solid ${COLORS.border}`,
          }}
        >
          Lowest Performance Results
        </div>
        {lowestResults.length === 0 ? (
          <div
            style={{
              padding: "14px",
              fontSize: 12,
              color: COLORS.muted,
              fontFamily: FONT_BODY,
            }}
          >
            All parameters at L3 or above.
          </div>
        ) : (
          lowestResults.map((contrib) => (
            <LowestResultRow key={contrib.key} contrib={contrib} onParamClick={onParamClick} />
          ))
        )}
      </div>

      {/* Recommendation snapshot */}
      <div
        style={{
          background: COLORS.cardBg,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 8,
          padding: "14px 16px",
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: COLORS.secondary,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            fontFamily: FONT_BODY,
            marginBottom: 8,
          }}
        >
          Recommendation Snapshot
        </div>
        {recsAvailable ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                fontSize: 12,
                color: COLORS.body,
                fontFamily: FONT_BODY,
                lineHeight: 1.5,
              }}
            >
              {improvementCount} design improvement{improvementCount !== 1 ? "s" : ""}
              {" · "}
              {bestPracticeCount} best-practice improvement{bestPracticeCount !== 1 ? "s" : ""}
              {" · "}
              {simplificationCount} simplification{simplificationCount !== 1 ? "s" : ""}
            </div>
            {onShowRecommendations && (
              <button
                onClick={onShowRecommendations}
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: COLORS.primary,
                  fontFamily: FONT_BODY,
                  background: "transparent",
                  border: `1px solid ${COLORS.primary}`,
                  borderRadius: 4,
                  padding: "4px 10px",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#F8F7F5";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                View Details →
              </button>
            )}
          </div>
        ) : (
          <div
            style={{
              fontSize: 12,
              color: COLORS.muted,
              fontFamily: FONT_BODY,
            }}
          >
            Evaluating recommendations…
          </div>
        )}
      </div>
    </div>
  );
}