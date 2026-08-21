/**
 * AsdrCategorySection.jsx
 * -----------------------
 * One design-category block in the redesigned ASDR scorecard (Technical Report
 * left sidebar). Leads with the category name and a headline result, followed by
 * Primary / Secondary seating subrows.
 *
 * Pure presentation — consumes modal summaries from getCategoryModalSummaries()
 * in designRatingPresentation. No ASDR maths, no recalculation, no re-grading.
 */
import React from "react";
import { formatModalLevels, formatLevelDistribution } from "./designRatingPresentation";

const FONT_HEADING = "'Futura PT Light', 'Century Gothic', sans-serif";
const FONT_BODY = "'Didact Gothic', 'Century Gothic', sans-serif";

const COLORS = {
  primary: "#213428",
  body: "#3E4349",
  secondary: "#625143",
  muted: "#9B9890",
  border: "#E6E4DD",
  fail: "#8B2E2E",
};

const SCREEN_DESCRIPTOR = {
  L4: "Exceptional Performance",
  L3: "Reference Performance",
  L2: "Good Performance",
  L1: "Acceptable Performance",
  FAIL: "Design Improvement Recommended",
};

function levelNum(key) {
  return Number(String(key).replace("L", ""));
}

/**
 * Combine Primary + Secondary modal levels into a single category headline.
 * Same modal → "Predominantly Level 3".
 * Adjacent tie → "Predominantly Level 2–3".
 * Non-adjacent → "Predominantly Level 1 · Level 3".
 */
function combineModalLevels(primaryLevels, secondaryLevels) {
  const all = new Set([...(primaryLevels || []), ...(secondaryLevels || [])]);
  const nums = [...all]
    .map(levelNum)
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  if (nums.length === 0) return null;
  if (nums.length === 1) return `Predominantly Level ${nums[0]}`;
  const allAdjacent = nums.every((n, i) => i === 0 || n === nums[i - 1] + 1);
  if (allAdjacent) return `Predominantly Level ${nums[0]}–${nums[nums.length - 1]}`;
  return `Predominantly ${nums.map((n) => `Level ${n}`).join(" · ")}`;
}

function ScopeSubRow({ label, levelText, distribution, muted }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        padding: "1.8mm 0",
        borderTop: `1px solid ${COLORS.border}`,
      }}
    >
      <span
        style={{
          fontSize: "8pt",
          fontWeight: 600,
          color: COLORS.secondary,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          fontFamily: FONT_BODY,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: "10pt",
          fontWeight: 400,
          color: muted ? COLORS.muted : COLORS.primary,
          fontFamily: FONT_HEADING,
          textAlign: "right",
        }}
      >
        {levelText}
        {distribution && !muted && (
          <span
            style={{
              fontSize: "7.5pt",
              color: COLORS.secondary,
              fontFamily: FONT_BODY,
              marginLeft: "2mm",
            }}
          >
            {distribution}
          </span>
        )}
      </span>
    </div>
  );
}

/**
 * Props:
 *   label     — display label (e.g. "Spatial Resolution", "Viewing Geometry")
 *   primary   — category modal summary for Primary scope (from getCategoryModalSummaries)
 *   secondary — category modal summary for Secondary scope (may be null)
 *   all       — category modal summary for All scope (used for screen headline)
 */
export default function AsdrCategorySection({ label, primary, secondary, all }) {
  const isScreen = primary?.isScreen || secondary?.isScreen || all?.isScreen;

  let headline = null;
  let primaryText = "—";
  let secondaryText = "—";
  let primaryDist = null;
  let secondaryDist = null;

  if (isScreen) {
    const pLvl = primary?.screenLevel;
    const sLvl = secondary?.screenLevel;
    const aLvl = all?.screenLevel;
    const headlineLevel = aLvl || pLvl;
    headline = headlineLevel ? SCREEN_DESCRIPTOR[headlineLevel] ?? null : null;
    primaryText = pLvl
      ? pLvl === "FAIL" ? "RP23 FAIL" : `RP23 Level ${levelNum(pLvl)}`
      : "—";
    secondaryText = sLvl
      ? sLvl === "FAIL" ? "RP23 FAIL" : `RP23 Level ${levelNum(sLvl)}`
      : "—";
  } else {
    if (primary?.hasFail || secondary?.hasFail) {
      headline = "Improvement Required";
    } else {
      headline = combineModalLevels(primary?.modalLevels, secondary?.modalLevels);
    }
    primaryText = primary?.hasFail
      ? "Parameters FAIL"
      : formatModalLevels(primary?.modalLevels) || "—";
    secondaryText = secondary?.hasFail
      ? "Parameters FAIL"
      : formatModalLevels(secondary?.modalLevels) || "—";
    primaryDist = formatLevelDistribution(primary?.distribution);
    secondaryDist = formatLevelDistribution(secondary?.distribution);
  }

  const hasSecondary = !!secondary?.hasContribs;

  return (
    <div
      className="tech-asdr-category-section"
      style={{ marginBottom: "5mm", breakInside: "avoid", pageBreakInside: "avoid" }}
    >
      <div
        style={{
          fontSize: "12pt",
          fontWeight: 700,
          color: COLORS.primary,
          letterSpacing: "0.08em",
          fontFamily: FONT_HEADING,
          textTransform: "uppercase",
          lineHeight: 1.2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: "14pt",
          fontWeight: 400,
          color: COLORS.primary,
          fontFamily: FONT_HEADING,
          lineHeight: 1.2,
          marginTop: "1mm",
          marginBottom: "2mm",
        }}
      >
        {headline || "—"}
      </div>
      <ScopeSubRow
        label="Primary Seating"
        levelText={primaryText}
        distribution={primaryDist}
        muted={!primary?.hasContribs}
      />
      {hasSecondary && (
        <ScopeSubRow
          label="Secondary Seating"
          levelText={secondaryText}
          distribution={secondaryDist}
          muted={!secondary?.hasContribs}
        />
      )}
    </div>
  );
}