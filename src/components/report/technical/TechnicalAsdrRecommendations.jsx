/**
 * TechnicalAsdrRecommendations.jsx
 * -------------------------------
 * Compact recommendation summary for the ASDR Scorecard page.
 *
 * Consumes the SAME evaluated recommendation output produced by the
 * canonical DesignRecommendationEngine used in the live Room Designer.
 * No recommendation logic, RP22 comparison, ASDR scoring, cost ranking,
 * candidate generation, or P12 checks are reimplemented here — this is a
 * presentation-only view over the existing `improvements` / `savings`
 * shortlists.
 *
 * Renders two compact side-by-side cards (BEST IMPROVEMENT / BEST COST SAVING)
 * after the scorecard parameter table, before the proprietary disclaimer.
 */

import React from "react";
import { formatViewingRecommendationSummary } from "@/components/recommendations/viewingRecommendationPresentation";
import { formatP12P13Consequences, hasAdditionalCalibrationHeadroom } from "@/components/recommendations/p12RecommendationPresentation";

const FONT_HEADING = "'Futura PT Light', 'Century Gothic', sans-serif";
const FONT_BODY = "'Didact Gothic', 'Century Gothic', sans-serif";

const COLORS = {
  primary: "#213428",
  body: "#3E4349",
  secondary: "#625143",
  border: "#E6E4DD",
  cardBg: "#FFFFFF",
  muted: "#9B8E82",
};

function formatPct(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `${Math.round(n)}%`;
}

function formatLevelChanges(levelChanges) {
  if (!Array.isArray(levelChanges) || levelChanges.length === 0) return "";
  return levelChanges
    .map((c) => `${c.display}: ${c.beforeLevel} → ${c.afterLevel}`)
    .join(" · ");
}

/** Shorten the channel-count caveat to its first sentence (no invented text). */
function shortenCaveat(caveat, kind) {
  if (!caveat || kind !== "channel-count") return null;
  const firstSentence = String(caveat).split(/\.\s+/)[0];
  return firstSentence ? `${firstSentence}.` : null;
}

function CardHeading({ children }) {
  return (
    <div
      style={{
        fontSize: "7.5pt",
        fontWeight: 700,
        color: COLORS.secondary,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        fontFamily: FONT_BODY,
        marginBottom: "2mm",
      }}
    >
      {children}
    </div>
  );
}

function RecommendationCard({ heading, item, mode }) {
  const isSaving = mode === "saving";
  const from = formatPct(item?.currentPercentage);
  const to = formatPct(item?.newPercentage);
  const levelChanges = (Array.isArray(item?.parameterLevelChanges) ? item.parameterLevelChanges : [])
    .filter((c) => c?.display !== "P12" && c?.display !== "P13");
  const levelChangeText = formatLevelChanges(levelChanges);
  const p12P13Text = formatP12P13Consequences(item).join(" · ");
  const combinedChangeText = [p12P13Text, levelChangeText].filter(Boolean).join(" · ");
  const consequenceText = isSaving
    ? (combinedChangeText || "Profile preserved")
    : (combinedChangeText || "Profile improved");
  const viewingText = formatViewingRecommendationSummary(item);
  const powerBeforeW = Number(item?.lcrPowerBeforeW);
  const powerAfterW = Number(item?.lcrPowerAfterW);
  const amplifierLine =
    item?.amplifierUpgradeRequired === true &&
    Number.isFinite(powerBeforeW) &&
    Number.isFinite(powerAfterW)
      ? `Amplification: ${Math.round(powerBeforeW)} → ${Math.round(powerAfterW)} W/ch`
      : null;
  const headroomNote = hasAdditionalCalibrationHeadroom(item)
    ? "Provides additional calibration/EQ headroom."
    : null;

  const caveatText = shortenCaveat(item?.caveat, item?.kind);

  return (
    <div
      style={{
        background: COLORS.cardBg,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 6,
        padding: "4mm 5mm",
        breakInside: "avoid",
        pageBreakInside: "avoid",
        flex: 1,
        minWidth: 0,
      }}
    >
      <CardHeading>{heading}</CardHeading>
      {item?.materialUpgradeLabel && (
        <div style={{
          fontSize: "7pt",
          fontWeight: 700,
          color: COLORS.secondary,
          letterSpacing: "0.08em",
          fontFamily: FONT_BODY,
          marginBottom: "1mm",
        }}>
          {item.materialUpgradeLabel}
        </div>
      )}
      <div
        style={{
          fontSize: "10pt",
          fontWeight: 600,
          color: COLORS.primary,
          fontFamily: FONT_BODY,
          lineHeight: 1.3,
          marginBottom: "1.5mm",
        }}
      >
        {item.title}
      </div>
      {consequenceText && (
        <div style={{ fontSize: "9pt", color: COLORS.body, fontFamily: FONT_BODY, marginBottom: "1mm" }}>
          {consequenceText}
        </div>
      )}
      <div style={{ fontSize: "9pt", color: COLORS.body, fontFamily: FONT_BODY, marginBottom: "1mm" }}>
        Rating {from} → {to}
      </div>
      {amplifierLine && (
        <div style={{ fontSize: "8.5pt", color: COLORS.body, fontFamily: FONT_BODY, marginBottom: "1mm" }}>
          {amplifierLine}
        </div>
      )}
      {headroomNote && (
        <div style={{ fontSize: "8pt", color: COLORS.secondary, fontFamily: FONT_BODY, fontStyle: "italic", marginBottom: "1mm" }}>
          {headroomNote}
        </div>
      )}
      {viewingText && (
        <div style={{
          fontSize: "7.5pt",
          color: item?.viewingTradeoff ? "#9a6800" : COLORS.secondary,
          fontFamily: FONT_BODY,
          lineHeight: 1.3,
          marginBottom: "1mm",
        }}>
          {viewingText}
        </div>
      )}
      <div style={{ fontSize: "8.5pt", color: COLORS.muted, fontFamily: FONT_BODY, marginBottom: caveatText ? "1mm" : 0 }}>
        {item.disruption} disruption · {item.confidence} confidence
      </div>
      {caveatText && (
        <div style={{ fontSize: "8pt", color: COLORS.secondary, fontFamily: FONT_BODY, fontStyle: "italic", lineHeight: 1.3 }}>
          {caveatText}
        </div>
      )}
    </div>
  );
}

function BestPracticeCard({ item }) {
  const genuineLevelChanges = (Array.isArray(item?.parameterLevelChanges) ? item.parameterLevelChanges : [])
    .filter((c) => c?.isImproved);
  const levelChangeText = formatLevelChanges(genuineLevelChanges);

  return (
    <div
      style={{
        background: COLORS.cardBg,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 6,
        padding: "4mm 5mm",
        breakInside: "avoid",
        pageBreakInside: "avoid",
        flex: 1,
        minWidth: 0,
      }}
    >
      <CardHeading>{item?.recommendationClass || "Best-Practice Improvement"}</CardHeading>
      <div style={{
        fontSize: "10pt",
        fontWeight: 600,
        color: COLORS.primary,
        fontFamily: FONT_BODY,
        lineHeight: 1.3,
        marginBottom: "1.5mm",
      }}>
        {item.title}
      </div>
      <div style={{ fontSize: "9pt", color: COLORS.body, fontFamily: FONT_BODY, marginBottom: "1mm" }}>
        {item.description}
      </div>
      {item?.technicalLine && (
        <div style={{ fontSize: "8.5pt", color: COLORS.secondary, fontFamily: FONT_BODY, marginBottom: "1mm" }}>
          {item.technicalLine}
        </div>
      )}
      {levelChangeText && (
        <div style={{ fontSize: "8.5pt", color: COLORS.primary, fontFamily: FONT_BODY, fontWeight: 600, marginBottom: "1mm" }}>
          {levelChangeText}
        </div>
      )}
      {item?.caveat && (
        <div style={{ fontSize: "8pt", color: COLORS.muted, fontFamily: FONT_BODY, marginBottom: "1mm" }}>
          {item.caveat}
        </div>
      )}
      <div style={{ fontSize: "8.5pt", color: COLORS.muted, fontFamily: FONT_BODY }}>
        {item.disruption} disruption · {item.confidence} confidence
      </div>
    </div>
  );
}

function EmptyCard({ heading, text }) {
  return (
    <div
      style={{
        background: COLORS.cardBg,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 6,
        padding: "4mm 5mm",
        breakInside: "avoid",
        pageBreakInside: "avoid",
        flex: 1,
        minWidth: 0,
      }}
    >
      <CardHeading>{heading}</CardHeading>
      <div style={{ fontSize: "9pt", color: COLORS.muted, fontFamily: FONT_BODY, lineHeight: 1.4 }}>
        {text}
      </div>
    </div>
  );
}

export default function TechnicalAsdrRecommendations({ recommendations }) {
  if (!recommendations) return null;

  const improvements = Array.isArray(recommendations.improvements) ? recommendations.improvements : [];
  const savings = Array.isArray(recommendations.savings) ? recommendations.savings : [];
  const bestPractice = Array.isArray(recommendations.bestPractice) ? recommendations.bestPractice : [];
  const isEvaluating = recommendations.isEvaluating === true;

  const bestImprovement = improvements[0] || null;
  const bestSaving = savings[0] || null;

  const emptyImprovement = "No material improvement identified.";
  const emptySaving = "No material simplification identified.";

  return (
    <div style={{ marginTop: "3mm" }}>
      <div style={{ display: "flex", gap: "4mm", alignItems: "stretch" }}>
        {isEvaluating ? (
          <div
            style={{
              flex: 1,
              background: COLORS.cardBg,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 6,
              padding: "4mm 5mm",
              fontSize: "9pt",
              color: COLORS.muted,
              fontFamily: FONT_BODY,
            }}
          >
            Evaluating low-change alternatives…
          </div>
        ) : (
          <div style={{ display: "contents" }}>
            {bestImprovement ? (
              <RecommendationCard heading="Best improvement" item={bestImprovement} mode="improvement" />
            ) : (
              <EmptyCard heading="Best improvement" text={emptyImprovement} />
            )}
            {bestSaving ? (
              <RecommendationCard heading="Best simplification" item={bestSaving} mode="saving" />
            ) : (
              <EmptyCard heading="Best simplification" text={emptySaving} />
            )}
          </div>
        )}
      </div>
      {bestPractice.length > 0 && (
        <div style={{ display: "flex", gap: "4mm", alignItems: "stretch", marginTop: "3mm" }}>
          {bestPractice.map((item) => (
            <BestPracticeCard key={item.id} item={item} />
          ))}
        </div>
      )}
      <div
        style={{
          marginTop: "2mm",
          fontSize: "7.5pt",
          color: COLORS.muted,
          fontFamily: FONT_BODY,
          lineHeight: 1.4,
          breakInside: "avoid",
          pageBreakInside: "avoid",
        }}
      >
        Recommendations are evaluated independently. Combining changes may produce a different result and should be re-evaluated.
      </div>
    </div>
  );
}