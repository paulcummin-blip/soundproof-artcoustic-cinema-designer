/**
 * TechnicalAsdrRecommendations.jsx
 * --------------------------------
 * Compact "DESIGN RECOMMENDATIONS" footnote section for the ASDR Scorecard
 * page in the Technical Report.
 *
 * Consumes the SAME evaluated recommendation snapshot published by the
 * canonical DesignRecommendationEngine used in the live Room Designer (and
 * in the app sidebar's DesignRatingSummary). No recommendation logic,
 * ranking, eligibility, or candidate generation is reimplemented here.
 *
 * Material-upgrade display order is resolved via the SAME
 * applyRecommendationDisplayOrder authority used by the app, so the report
 * and app always present the identical product-range ladder.
 *
 * Presentation is deliberately compact (footnote-scale typography) so the
 * section reads as supporting guidance beneath the main scorecard table.
 */

import React from "react";
import { applyRecommendationDisplayOrder } from "@/components/recommendations/recommendationDisplayOrder";
import {
  formatP12P13Consequences,
  formatP12CapabilityLine,
  formatP12MinRecLines,
  formatCapabilityReserveText,
  formatAmplificationGuidance,
} from "@/components/recommendations/p12RecommendationPresentation";
import { formatViewingRecommendationSummary } from "@/components/recommendations/viewingRecommendationPresentation";

const FONT_HEADING = "'Futura PT Light', 'Century Gothic', sans-serif";
const FONT_BODY = "'Didact Gothic', 'Century Gothic', sans-serif";

const COLORS = {
  primary: "#213428",
  body: "#3E4349",
  secondary: "#625143",
  border: "#E6E4DD",
  divider: "#F0EFEA",
  muted: "#9B8E82",
};

// ── Compact formatters — transform canonical helper output into the
//    compact footnote style. Values are NOT recomputed; only the string
//    presentation is shortened. ──────────────────────────────────────────

function compactP12Line(item) {
  const line = formatP12CapabilityLine(item);
  if (!line) return null;
  return line.replace(/^P12:\s*/, "P12 ");
}

function compactRecommendedLine(item) {
  const minRec = formatP12MinRecLines(item);
  return minRec?.recLine || null;
}

function compactReserveLine(item) {
  const text = formatCapabilityReserveText(item);
  if (!text) return null;
  return text
    .replace(/^Capability reserve:\s*/, "")
    .replace(/\sabove\s/, " capability reserve above ");
}

function compactAmpLine(item) {
  if (item?.kind !== "lcr") return null;
  const text = formatAmplificationGuidance(item);
  if (text) {
    if (text.startsWith("No amplifier change required")) return "No amplifier change required";
    const m = text.match(/approximately\s+(\d+)\s*W\/ch/);
    if (m) return `Recommended amplification: ~${m[1]} W/ch`;
    return text.split(/\s·\s/)[0];
  }
  if (item?.amplifierUpgradeRequired === true) {
    const powerAfterW = Number(item?.lcrPowerAfterW);
    if (Number.isFinite(powerAfterW) && powerAfterW > 0) return `Recommended amplification: ~${Math.round(powerAfterW)} W/ch`;
    return "Amplifier upgrade recommended";
  }
  return "No amplifier change required";
}

function formatLevelChanges(levelChanges) {
  if (!Array.isArray(levelChanges) || levelChanges.length === 0) return "";
  return levelChanges
    .map((c) => `${c.display}: ${c.beforeLevel} → ${c.afterLevel}`)
    .join(" · ");
}

// ── Row renderers ──────────────────────────────────────────────────────

const ROW_STYLE = {
  padding: "1.4mm 0",
  borderTop: `1px solid ${COLORS.divider}`,
  breakInside: "avoid",
  pageBreakInside: "avoid",
};

const TITLE_STYLE = {
  fontSize: "8pt",
  fontWeight: 600,
  color: COLORS.primary,
  fontFamily: FONT_BODY,
  lineHeight: 1.3,
};

const BODY_STYLE = {
  fontSize: "7.5pt",
  color: COLORS.body,
  fontFamily: FONT_BODY,
  lineHeight: 1.3,
  marginTop: "0.4mm",
};

function LcrUpgradeRow({ item }) {
  const p12Line = compactP12Line(item);
  const recLine = compactRecommendedLine(item);
  const reserve = compactReserveLine(item);
  const amp = compactAmpLine(item);
  const line2 = [p12Line, recLine].filter(Boolean).join(" · ");
  const line3 = reserve || amp;
  return (
    <div style={ROW_STYLE}>
      <div style={TITLE_STYLE}>{item.title}</div>
      {line2 && <div style={BODY_STYLE}>{line2}</div>}
      {line3 && <div style={{ ...BODY_STYLE, color: COLORS.secondary }}>{line3}</div>}
    </div>
  );
}

function GenericImprovementRow({ item }) {
  const p12P13Text = formatP12P13Consequences(item).join(" · ");
  const levelChanges = (Array.isArray(item?.parameterLevelChanges) ? item.parameterLevelChanges : [])
    .filter((c) => c?.display !== "P12" && c?.display !== "P13");
  const consequenceText = [p12P13Text, formatLevelChanges(levelChanges)].filter(Boolean).join(" · ") || "Profile improved";
  const viewingText = formatViewingRecommendationSummary(item);
  return (
    <div style={ROW_STYLE}>
      <div style={TITLE_STYLE}>{item.title}</div>
      <div style={BODY_STYLE}>{consequenceText}</div>
      {viewingText && (
        <div style={{ ...BODY_STYLE, fontSize: "7pt", color: item?.viewingTradeoff ? "#9a6800" : COLORS.secondary }}>
          {viewingText}
        </div>
      )}
    </div>
  );
}

function BestPracticeRow({ item }) {
  return (
    <div style={ROW_STYLE}>
      <div style={TITLE_STYLE}>{item.title}</div>
      {item.description && <div style={BODY_STYLE}>{item.description}</div>}
      {item?.technicalLine && (
        <div style={{ ...BODY_STYLE, color: COLORS.secondary }}>{item.technicalLine}</div>
      )}
    </div>
  );
}

function SimplifyRow({ item }) {
  const p12P13Text = formatP12P13Consequences(item).join(" · ");
  const levelChanges = (Array.isArray(item?.parameterLevelChanges) ? item.parameterLevelChanges : [])
    .filter((c) => c?.display !== "P12" && c?.display !== "P13");
  const consequenceText = [p12P13Text, formatLevelChanges(levelChanges)].filter(Boolean).join(" · ");
  const viewingText = formatViewingRecommendationSummary(item);
  return (
    <div style={ROW_STYLE}>
      <div style={TITLE_STYLE}>{item.title}</div>
      {item.description && <div style={BODY_STYLE}>{item.description}</div>}
      {!item.description && consequenceText && <div style={BODY_STYLE}>{consequenceText}</div>}
      {viewingText && (
        <div style={{ ...BODY_STYLE, fontSize: "7pt", color: item?.viewingTradeoff ? "#9a6800" : COLORS.secondary }}>
          {viewingText}
        </div>
      )}
    </div>
  );
}

function Group({ label, children }) {
  if (!children || (Array.isArray(children) && children.length === 0)) return null;
  return (
    <div style={{ breakInside: "avoid", pageBreakInside: "avoid" }}>
      <div style={{
        fontSize: "7pt",
        fontWeight: 700,
        color: COLORS.secondary,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        fontFamily: FONT_BODY,
        padding: "1.6mm 0 0.8mm",
      }}>
        {label}
      </div>
      {children}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────

export default function TechnicalAsdrRecommendations({ recommendations }) {
  if (!recommendations) return null;

  const ordered = applyRecommendationDisplayOrder(recommendations);
  const improvements = Array.isArray(ordered.improvements) ? ordered.improvements : [];
  const savings = Array.isArray(ordered.savings) ? ordered.savings : [];
  const bestPractice = Array.isArray(ordered.bestPractice) ? ordered.bestPractice : [];
  const isEvaluating = recommendations.isEvaluating === true;
  const hasAny = improvements.length > 0 || savings.length > 0 || bestPractice.length > 0;
  const isLcrUpgrade = (item) => item?.kind === "lcr" && item?.recommendationDirection === "upgrade";

  return (
    <div className="tech-asdr-recommendations" style={{ marginTop: "3mm" }}>
      <div style={{
        fontSize: "9pt",
        fontWeight: 700,
        color: COLORS.secondary,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        fontFamily: FONT_HEADING,
        paddingTop: "2mm",
        borderTop: `1px solid ${COLORS.border}`,
        marginBottom: "0.5mm",
      }}>
        Design Recommendations
      </div>

      {isEvaluating ? (
        <div style={{ fontSize: "7.5pt", color: COLORS.muted, fontFamily: FONT_BODY, padding: "1.5mm 0" }}>
          Evaluating low-change alternatives…
        </div>
      ) : !hasAny ? (
        <div style={{ fontSize: "7.5pt", color: COLORS.muted, fontFamily: FONT_BODY, padding: "1.5mm 0" }}>
          No material recommendations identified.
        </div>
      ) : (
        <>
          {improvements.length > 0 && (
            <Group label="Improve the Design">
              {improvements.map((item) =>
                isLcrUpgrade(item)
                  ? <LcrUpgradeRow key={item.id} item={item} />
                  : <GenericImprovementRow key={item.id} item={item} />
              )}
            </Group>
          )}
          {bestPractice.length > 0 && (
            <Group label="Best Practice">
              {bestPractice.map((item) => <BestPracticeRow key={item.id} item={item} />)}
            </Group>
          )}
          {savings.length > 0 && (
            <Group label="Simplify the Design">
              {savings.map((item) => <SimplifyRow key={item.id} item={item} />)}
            </Group>
          )}
        </>
      )}

      <div style={{
        marginTop: "1.5mm",
        fontSize: "6.5pt",
        color: COLORS.muted,
        fontFamily: FONT_BODY,
        lineHeight: 1.4,
        breakInside: "avoid",
        pageBreakInside: "avoid",
      }}>
        Each option is evaluated independently. Combining changes may produce a different result and should be re-evaluated.
      </div>
    </div>
  );
}