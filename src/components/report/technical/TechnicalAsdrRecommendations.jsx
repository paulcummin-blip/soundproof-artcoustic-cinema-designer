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

function formatMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatPct(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `${Math.round(n)}%`;
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
  const affected = Array.isArray(item?.affectedParameters) ? item.affectedParameters : [];
  const affectedText = affected.length ? affected.join(" · ") : null;
  const viewingText = formatViewingRecommendationSummary(item);

  // Cost / saving line — unknown is never shown as £0.
  let costLine = null;
  if (isSaving) {
    const saving = Number(item?.savingExVat);
    costLine = Number.isFinite(saving) && saving > 0
      ? `Save ${formatMoney(saving)} ex VAT`
      : "Price not connected";
  } else {
    const cost = item?.costDeltaExVat;
    if (cost == null) {
      costLine = "Price not connected";
    } else if (Number(cost) === 0) {
      costLine = "Equipment: £0";
    } else if (Number(cost) > 0) {
      costLine = `Equipment: ${formatMoney(cost)} ex VAT`;
    } else {
      costLine = `saves ${formatMoney(Math.abs(cost))} ex VAT`;
    }
  }

  const showP12 = isSaving && item?.kind === "lcr" && item?.p12Level;
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
      {costLine && (
        <div style={{ fontSize: "9pt", color: COLORS.body, fontFamily: FONT_BODY, marginBottom: "1mm" }}>
          {costLine}
        </div>
      )}
      <div style={{ fontSize: "9pt", color: COLORS.body, fontFamily: FONT_BODY, marginBottom: "1mm" }}>
        Rating {from} → {to}
      </div>
      {affectedText && (
        <div style={{ fontSize: "8.5pt", color: COLORS.secondary, fontFamily: FONT_BODY, marginBottom: "1mm" }}>
          {isSaving ? "Affected" : "Improves"}: {affectedText}
        </div>
      )}
      {showP12 && (
        <div style={{ fontSize: "8.5pt", color: COLORS.body, fontFamily: FONT_BODY, marginBottom: "1mm" }}>
          P12 after change: {item.p12Level}
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
  const isEvaluating = recommendations.isEvaluating === true;

  const bestImprovement = improvements[0] || null;
  const bestSaving = savings[0] || null;

  const emptyImprovement = "No material improvement identified.";
  const emptySaving = "No material cost-saving compromise identified.";

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
              <RecommendationCard heading="Best cost saving" item={bestSaving} mode="saving" />
            ) : (
              <EmptyCard heading="Best cost saving" text={emptySaving} />
            )}
          </div>
        )}
      </div>
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