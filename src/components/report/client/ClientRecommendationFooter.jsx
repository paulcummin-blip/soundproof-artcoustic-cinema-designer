// ClientRecommendationFooter.jsx
// --------------------------------
// Compact recommendation footer for the Client Visual Report.
//
// Shows ALL currently published recommendations as short rows at the bottom
// of an existing report page. Visibly secondary to the main client content.
//
// Sections:
//   MATERIAL UPGRADES  — product-range ladder (smallest first, ultimate last)
//   BEST PRACTICE      — existing priority order
//   SIMPLIFICATION     — existing least-damaging order
//
// Each row: PRODUCT/ACTION + PRIMARY CLIENT CONSEQUENCE (one line).
// No rating deltas, disruption labels, confidence labels, or calibration caveats.
//
// Print-safe: break-inside: avoid; page-break-inside: avoid.
// Designed to fit the footer area of an existing A4 page without creating a new page.

import React from "react";
import { applyRecommendationDisplayOrder } from "@/components/recommendations/recommendationDisplayOrder";
import {
  formatP12CapabilityLine,
  formatCapabilityReserveText,
  formatAmplificationGuidance,
} from "@/components/recommendations/p12RecommendationPresentation";
import { formatViewingRecommendationSummary } from "@/components/recommendations/viewingRecommendationPresentation";

const FONT = "'Didact Gothic', 'Century Gothic', sans-serif";
const PRIMARY = "#213428";
const BODY = "#3E4349";
const MUTED = "#625143";
const BORDER = "#E6E4DD";

function formatUpgradeConsequence(item) {
  const parts = [];
  const capLine = formatP12CapabilityLine(item);
  if (capLine) parts.push(capLine);
  const reserve = formatCapabilityReserveText(item);
  if (reserve) parts.push(reserve);
  const amp = formatAmplificationGuidance(item);
  if (amp) parts.push(amp);
  return parts.join(" · ");
}

function formatImprovementRow(item) {
  if (item?.kind === "lcr" && item?.recommendationDirection === "upgrade") {
    const power = item?.amplifierUpgradeRequired && item?.lcrPowerAfterW
      ? ` at ${Math.round(Number(item.lcrPowerAfterW))} W/ch`
      : "";
    return {
      title: `${item.title}${power}`,
      consequence: formatUpgradeConsequence(item) || "Improved screen-stage capability",
    };
  }
  // Viewing/seating/screen improvement
  const viewingText = formatViewingRecommendationSummary(item);
  return {
    title: item?.title,
    consequence: viewingText || item?.description || "Profile improved",
  };
}

function formatSimplificationRow(item) {
  return {
    title: item?.title,
    consequence: item?.description || "Reduces equipment or complexity",
  };
}

function formatBestPracticeRow(item) {
  return {
    title: item?.title,
    consequence: item?.description || "Best-practice improvement",
  };
}

function Row({ title, consequence }) {
  return (
    <div style={{ marginBottom: 3, lineHeight: 1.35 }}>
      <span style={{ fontSize: 8, fontWeight: 700, color: PRIMARY }}>{title}</span>
      <span style={{ fontSize: 7.5, color: MUTED, marginLeft: 4 }}>— {consequence}</span>
    </div>
  );
}

function Section({ label, rows }) {
  if (!rows || rows.length === 0) return null;
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ fontSize: 7, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTED, marginBottom: 2 }}>
        {label}
      </div>
      {rows.map((r, i) => (
        <Row key={i} title={r.title} consequence={r.consequence} />
      ))}
    </div>
  );
}

export default function ClientRecommendationFooter({ recommendations, print = false }) {
  if (!recommendations) return null;

  const ordered = applyRecommendationDisplayOrder(recommendations);
  const improvements = Array.isArray(ordered.improvements) ? ordered.improvements : [];
  const savings = Array.isArray(ordered.savings) ? ordered.savings : [];
  const bestPractice = Array.isArray(ordered.bestPractice) ? ordered.bestPractice : [];

  if (improvements.length === 0 && savings.length === 0 && bestPractice.length === 0) {
    return null;
  }

  const upgradeRows = improvements
    .filter((item) => item?.kind === "lcr" && item?.recommendationDirection === "upgrade")
    .map(formatImprovementRow);
  const otherImprovementRows = improvements
    .filter((item) => !(item?.kind === "lcr" && item?.recommendationDirection === "upgrade"))
    .map(formatImprovementRow);
  const simplificationRows = savings.map(formatSimplificationRow);
  const bestPracticeRows = bestPractice.map(formatBestPracticeRow);

  return (
    <div
      style={{
        marginTop: 16,
        paddingTop: 10,
        borderTop: `1px solid ${BORDER}`,
        fontFamily: FONT,
        breakInside: "avoid",
        pageBreakInside: "avoid",
      }}
    >
      <div style={{
        fontSize: 8,
        fontWeight: 700,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: PRIMARY,
        marginBottom: 6,
      }}>
        Design Recommendations
      </div>
      <Section label="Material Upgrades" rows={upgradeRows} />
      <Section label="Best Practice" rows={bestPracticeRows} />
      <Section label="Other Improvements" rows={otherImprovementRows} />
      <Section label="Simplification" rows={simplificationRows} />
    </div>
  );
}