/**
 * DesignOverviewBlock.jsx
 * ------------------------
 * Stage B — Design Overview content for the in-app Design Review workspace.
 *
 * Consumes the canonical roomDesignRating and designRecommendations from the
 * shared window.__ROOM_DESIGNER_ASDR__ store. Does NOT mount any analysis engine
 * or recommendation engine. Does NOT recalculate or reinterpret scoring.
 *
 * Presentation-only: derives pillar summaries, weakest areas, and a
 * recommendation snapshot from the existing contributions array.
 */

import React from "react";
import { getCategoryForParam, getHumanTitleForParam } from "@/components/report/technical/technicalParameterMeta";

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
  failBg: "#FCF0F0",
  warn: "#8B5E34",
  warnBg: "#F5EDE3",
  warnBorder: "#E0D4C2",
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

/** Returns 3 (FAIL) > 2 (L1) > 1 (L2) > 0 (OK). Display-only. */
function getWeaknessBand(resultLevel) {
  const str = String(resultLevel || "");
  if (str.includes("FAIL")) return 3;
  if (str.includes("L1")) return 2;
  if (str.includes("L2")) return 1;
  return 0;
}

function getContributionLoss(c) {
  return (c.maximumPoints || 0) - (c.earnedPoints || 0);
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

/** Display-order sort: FAIL first, then L1, then L2. Within band, larger loss first. */
function getNeedsAttention(contributions) {
  return contributions
    .filter((c) => c.resultLevel && getWeaknessBand(c.resultLevel) > 0)
    .sort((a, b) => {
      const bandA = getWeaknessBand(a.resultLevel);
      const bandB = getWeaknessBand(b.resultLevel);
      if (bandA !== bandB) return bandB - bandA;
      const lossA = getContributionLoss(a);
      const lossB = getContributionLoss(b);
      if (lossA !== lossB) return lossB - lossA;
      return (b.effectiveWeight || 0) - (a.effectiveWeight || 0);
    })
    .slice(0, 5);
}

function getSeverityLabel(band) {
  if (band === 3) return "FAIL";
  if (band === 2) return "L1";
  if (band === 1) return "L2";
  return "L3+";
}

function getSeverityColors(band) {
  if (band === 3) return { color: COLORS.fail, bg: COLORS.failBg, border: COLORS.fail };
  if (band === 2) return { color: COLORS.warn, bg: COLORS.warnBg, border: COLORS.warnBorder };
  if (band === 1) return { color: COLORS.secondary, bg: "#F0EFEA", border: COLORS.borderStrong };
  return { color: COLORS.label, bg: "#F3F2EF", border: COLORS.border };
}

// ── Sub-components ───────────────────────────────────────────────────

function RatingCard({ rating }) {
  const pct = rating?.displayPercentage != null ? Math.round(rating.displayPercentage) : null;
  const total = rating?.actualPoints != null && rating?.maximumAvailablePoints != null
    ? `${Math.round(rating.actualPoints * 100) / 100} / ${Math.round(rating.maximumAvailablePoints * 100) / 100}`
    : "—";

  return (
    <div style={{
      background: COLORS.cardBg,
      border: `1px solid ${COLORS.border}`,
      borderRadius: 8,
      padding: "20px 24px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 16,
    }}>
      <div>
        <div style={{
          fontSize: 10,
          fontWeight: 700,
          color: COLORS.secondary,
          letterSpacing: "0.1em",
          fontFamily: FONT_BODY,
          marginBottom: 6,
        }}>
          ARTCOUSTIC SYSTEM DESIGN RATING
        </div>
        <div style={{
          fontSize: 36,
          fontWeight: 400,
          color: COLORS.primary,
          fontFamily: FONT_HEADING,
          lineHeight: 1,
        }}>
          {pct != null ? `${pct}%` : "NOT ASSESSED"}
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{
          fontSize: 10,
          fontWeight: 700,
          color: COLORS.secondary,
          letterSpacing: "0.1em",
          fontFamily: FONT_BODY,
          marginBottom: 6,
        }}>
          TOTAL SCORE
        </div>
        <div style={{
          fontSize: 18,
          fontWeight: 400,
          color: COLORS.primary,
          fontFamily: FONT_HEADING,
          lineHeight: 1,
        }}>
          {total}
        </div>
      </div>
    </div>
  );
}

function PillarSummaryCard({ pillar, contribs }) {
  const counts = summarizePillar(contribs);
  const needsAttn = contribs.filter((c) => getWeaknessBand(c.resultLevel) > 0).length;
  const hasFail = counts.FAIL > 0;

  return (
    <div style={{
      background: COLORS.cardBg,
      border: `1px solid ${COLORS.border}`,
      borderRadius: 8,
      padding: "14px 16px",
      display: "flex",
      flexDirection: "column",
      gap: 6,
    }}>
      <div style={{
        fontSize: 9,
        fontWeight: 700,
        color: COLORS.secondary,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        fontFamily: FONT_BODY,
      }}>
        {pillar}
      </div>
      <div style={{
        fontSize: 13,
        fontWeight: 600,
        color: hasFail ? COLORS.fail : COLORS.primary,
        fontFamily: FONT_BODY,
        lineHeight: 1.3,
      }}>
        {formatPillarSummary(counts)}
      </div>
      {needsAttn > 0 ? (
        <div style={{
          fontSize: 10,
          color: hasFail ? COLORS.fail : COLORS.warn,
          fontFamily: FONT_BODY,
          fontWeight: 600,
        }}>
          {needsAttn} need{needsAttn !== 1 ? "s" : ""} attention
        </div>
      ) : (
        <div style={{
          fontSize: 10,
          color: COLORS.muted,
          fontFamily: FONT_BODY,
        }}>
          No issues
        </div>
      )}
    </div>
  );
}

function NeedsAttentionRow({ contrib }) {
  const band = getWeaknessBand(contrib.resultLevel);
  const sev = getSeverityColors(band);

  return (
    <div
      data-param-key={contrib.key}
      data-param-number={contrib.parameter}
      title="Parameter explorer coming in Stage C"
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
      onMouseEnter={(e) => { e.currentTarget.style.background = "#F8F7F5"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      <div style={{
        fontSize: 12,
        fontWeight: 600,
        color: COLORS.primary,
        fontFamily: FONT_BODY,
        flex: 1,
        minWidth: 0,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}>
        {getParamLabel(contrib)}
      </div>
      <div style={{
        fontSize: 11,
        color: COLORS.body,
        fontFamily: FONT_BODY,
        whiteSpace: "nowrap",
      }}>
        {contrib.resultLevel}
      </div>
      <span style={{
        fontSize: 9,
        fontWeight: 700,
        color: sev.color,
        background: sev.bg,
        border: `1px solid ${sev.border}`,
        padding: "2px 8px",
        borderRadius: 3,
        letterSpacing: "0.06em",
        fontFamily: FONT_BODY,
        whiteSpace: "nowrap",
      }}>
        {getSeverityLabel(band)}
      </span>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────

export default function DesignOverviewBlock({ rating, recommendations }) {
  if (!rating || rating.status === "NOT_ASSESSED") {
    return (
      <div style={{
        padding: "32px 16px",
        textAlign: "center",
        color: COLORS.secondary,
        fontFamily: FONT_BODY,
        fontSize: 13,
      }}>
        Design Rating not assessed yet. Open the project in the Room Designer to populate the Design Review.
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

  // Needs attention
  const needsAttention = getNeedsAttention(contributions);

  // Recommendation counts
  const improvementCount = Array.isArray(recommendations?.improvements) ? recommendations.improvements.length : 0;
  const bestPracticeCount = Array.isArray(recommendations?.bestPractice) ? recommendations.bestPractice.length : 0;
  const simplificationCount = Array.isArray(recommendations?.savings) ? recommendations.savings.length : 0;
  const recsAvailable = recommendations?.isSettled === true;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "4px 0" }}>
      {/* Rating card */}
      <RatingCard rating={rating} />

      {/* Pillar summaries */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: 10,
      }}>
        {PILLAR_ORDER.map((pillar) => (
          <PillarSummaryCard
            key={pillar}
            pillar={pillar}
            contribs={pillarMap[pillar] || []}
          />
        ))}
      </div>

      {/* Needs Attention */}
      <div style={{
        background: COLORS.cardBg,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 8,
        overflow: "hidden",
      }}>
        <div style={{
          padding: "10px 14px",
          fontSize: 10,
          fontWeight: 700,
          color: COLORS.secondary,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          fontFamily: FONT_BODY,
          borderBottom: `1px solid ${COLORS.border}`,
        }}>
          Needs Attention
        </div>
        {needsAttention.length === 0 ? (
          <div style={{
            padding: "14px",
            fontSize: 12,
            color: COLORS.muted,
            fontFamily: FONT_BODY,
          }}>
            No parameters need attention.
          </div>
        ) : (
          needsAttention.map((contrib) => (
            <NeedsAttentionRow key={contrib.key} contrib={contrib} />
          ))
        )}
      </div>

      {/* Recommendation snapshot */}
      <div style={{
        background: COLORS.cardBg,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 8,
        padding: "14px 16px",
      }}>
        <div style={{
          fontSize: 10,
          fontWeight: 700,
          color: COLORS.secondary,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          fontFamily: FONT_BODY,
          marginBottom: 8,
        }}>
          Recommendation Snapshot
        </div>
        {recsAvailable ? (
          <div style={{
            fontSize: 12,
            color: COLORS.body,
            fontFamily: FONT_BODY,
            lineHeight: 1.5,
          }}>
            {improvementCount} design improvement{improvementCount !== 1 ? "s" : ""}
            {" · "}
            {bestPracticeCount} best-practice improvement{bestPracticeCount !== 1 ? "s" : ""}
            {" · "}
            {simplificationCount} simplification{simplificationCount !== 1 ? "s" : ""}
          </div>
        ) : (
          <div style={{
            fontSize: 12,
            color: COLORS.muted,
            fontFamily: FONT_BODY,
          }}>
            Evaluating recommendations…
          </div>
        )}
      </div>
    </div>
  );
}