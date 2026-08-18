/**
 * TechnicalReportRecommendations.jsx
 * ----------------------------------
 * Screen-only RECOMMENDATIONS section for the interactive Technical Report
 * / RP22 Compliance Report web page.
 *
 * NOT included in the printed/downloaded PDF — the parent wraps this in the
 * .screen-only div which is display:none in print CSS. The component itself
 * also carries an explicit print:hidden style as a belt-and-braces guard.
 *
 * Consumes the SAME canonical recommendation snapshot published by the
 * DesignRecommendationEngine used in the live Room Designer. No
 * recommendation logic, ranking, eligibility, or candidate generation is
 * reimplemented here — only presentation.
 *
 * Presentation is wider and more detailed than the former sidebar cards:
 * each recommendation shows title, parameter/level changes, capability /
 * headroom notes, Design Performance Index movement, disruption, and
 * confidence.
 */

import React from "react";
import { applyRecommendationDisplayOrder } from "@/components/recommendations/recommendationDisplayOrder";
import { formatViewingRecommendationSummary } from "@/components/recommendations/viewingRecommendationPresentation";
import {
  formatP12P13Consequences,
  hasAdditionalCalibrationHeadroom,
  formatP12CapabilityLine,
  formatP13CapabilityLine,
  formatP12MinRecLines,
  formatP13MinRecLines,
  formatCapabilityReserveText,
  formatAmplificationGuidance,
} from "@/components/recommendations/p12RecommendationPresentation";

const FONT_HEADING = "'Futura PT Light', 'Century Gothic', sans-serif";
const FONT_BODY = "'Didact Gothic', 'Century Gothic', sans-serif";

const COLORS = {
  primary: "#213428",
  body: "#3E4349",
  secondary: "#625143",
  border: "#E6E4DD",
  muted: "#9B8E82",
  accent: "#9a3500",
};

function formatPoints(value, signed = false) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const prefix = signed && n > 0 ? "+" : "";
  return `${prefix}${n.toFixed(1)} pts`;
}

function formatLevelChanges(levelChanges) {
  if (!Array.isArray(levelChanges) || levelChanges.length === 0) return "";
  return levelChanges
    .map((c) => `${c.display}: ${c.beforeLevel} → ${c.afterLevel}`)
    .join(" · ");
}

function RecommendationCard({ item, mode }) {
  const from = Math.round(Number(item?.currentPercentage) || 0);
  const to = Math.round(Number(item?.newPercentage) || 0);
  const isSaving = mode === "saving";
  const isLcrUpgrade = item?.kind === "lcr" && item?.recommendationDirection === "upgrade";
  const levelChanges = (Array.isArray(item?.parameterLevelChanges) ? item.parameterLevelChanges : [])
    .filter((c) => c?.display !== "P12" && c?.display !== "P13");
  const levelChangeText = formatLevelChanges(levelChanges);
  const viewingText = formatViewingRecommendationSummary(item);
  const headroomNote = hasAdditionalCalibrationHeadroom(item)
    ? "Provides additional calibration/EQ headroom."
    : null;

  const p12CapabilityLine = isLcrUpgrade ? formatP12CapabilityLine(item) : null;
  const p13CapabilityLine = isLcrUpgrade ? formatP13CapabilityLine(item) : null;
  const p12MinRec = isLcrUpgrade ? formatP12MinRecLines(item) : null;
  const p13MinRec = isLcrUpgrade ? formatP13MinRecLines(item) : null;
  const capabilityReserveText = isLcrUpgrade ? formatCapabilityReserveText(item) : null;
  const amplificationText = isLcrUpgrade ? formatAmplificationGuidance(item) : null;

  const p12P13Text = !isLcrUpgrade ? formatP12P13Consequences(item).join(" · ") : null;
  const powerBeforeW = Number(item?.lcrPowerBeforeW);
  const powerAfterW = Number(item?.lcrPowerAfterW);
  const oldAmplifierText =
    !isLcrUpgrade &&
    item?.amplifierUpgradeRequired === true &&
    Number.isFinite(powerBeforeW) &&
    Number.isFinite(powerAfterW)
      ? `Amplification: ${Math.round(powerBeforeW)} → ${Math.round(powerAfterW)} W/ch`
      : null;

  const combinedChangeText = isLcrUpgrade
    ? levelChangeText
    : [p12P13Text, levelChangeText].filter(Boolean).join(" · ");
  const valueText = isSaving
    ? (combinedChangeText || "Profile preserved")
    : (combinedChangeText || "Profile improved");

  return (
    <div style={{ padding: "12px 0", borderTop: `1px solid ${COLORS.border}` }}>
      {item?.priorityLabel && (
        <div style={{ fontSize: 11, fontWeight: 800, color: COLORS.accent, marginBottom: 4, letterSpacing: "0.04em" }}>
          {item.priorityLabel}
        </div>
      )}
      <div style={{ fontSize: 13, lineHeight: 1.35, fontWeight: 700, color: COLORS.primary, fontFamily: FONT_BODY }}>
        {item.title}
      </div>

      {isLcrUpgrade && (
        <>
          {p12CapabilityLine && (
            <div style={{ marginTop: 4, fontSize: 11, lineHeight: 1.4, color: COLORS.primary, fontWeight: 600 }}>
              {p12CapabilityLine}
            </div>
          )}
          {p12MinRec?.minLine && (
            <div style={{ marginTop: 3, fontSize: 11, lineHeight: 1.4, color: COLORS.body }}>
              {p12MinRec.minLine}
            </div>
          )}
          {p12MinRec?.recLine && (
            <div style={{ marginTop: 2, fontSize: 11, lineHeight: 1.4, color: COLORS.body }}>
              {p12MinRec.recLine}
            </div>
          )}
          {p13CapabilityLine && (
            <div style={{ marginTop: 4, fontSize: 11, lineHeight: 1.4, color: COLORS.primary, fontWeight: 600 }}>
              {p13CapabilityLine}
            </div>
          )}
          {p13MinRec?.minLine && (
            <div style={{ marginTop: 3, fontSize: 11, lineHeight: 1.4, color: COLORS.body }}>
              {p13MinRec.minLine}
            </div>
          )}
          {p13MinRec?.recLine && (
            <div style={{ marginTop: 2, fontSize: 11, lineHeight: 1.4, color: COLORS.body }}>
              {p13MinRec.recLine}
            </div>
          )}
          {capabilityReserveText && (
            <div style={{ marginTop: 3, fontSize: 10, lineHeight: 1.4, color: COLORS.primary, fontWeight: 600 }}>
              {capabilityReserveText}
            </div>
          )}
          {amplificationText && (
            <div style={{ marginTop: 2, fontSize: 10, lineHeight: 1.4, color: COLORS.body }}>
              {amplificationText}
            </div>
          )}
          {levelChangeText && (
            <div style={{ marginTop: 3, fontSize: 11, lineHeight: 1.4, color: COLORS.body }}>
              {levelChangeText}
            </div>
          )}
        </>
      )}

      {!isLcrUpgrade && valueText && (
        <div style={{ marginTop: 4, fontSize: 11, lineHeight: 1.4, color: COLORS.body }}>
          {valueText}
        </div>
      )}
      {oldAmplifierText && (
        <div style={{ marginTop: 3, fontSize: 10, lineHeight: 1.4, color: COLORS.body }}>
          {oldAmplifierText}
        </div>
      )}
      {headroomNote && (
        <div style={{ marginTop: 3, fontSize: 10, lineHeight: 1.4, color: COLORS.secondary, fontStyle: "italic" }}>
          {headroomNote}
        </div>
      )}
      {viewingText && (
        <div style={{ marginTop: 3, fontSize: 10, lineHeight: 1.4, color: item?.viewingTradeoff ? "#9a6800" : COLORS.secondary }}>
          {viewingText}
        </div>
      )}
      <div style={{ marginTop: 4, fontSize: 10, lineHeight: 1.4, color: COLORS.muted }}>
        Design Performance Index {from} → {to} · {formatPoints(item.scoreDelta, true)}
      </div>
      <div style={{ marginTop: 2, fontSize: 10, lineHeight: 1.4, color: COLORS.muted }}>
        {item.disruption} disruption · {item.confidence} confidence
      </div>
      {item.caveat && (
        <div style={{ marginTop: 2, fontSize: 10, lineHeight: 1.4, color: COLORS.muted, fontStyle: "italic" }}>
          {item.caveat}
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
    <div style={{ padding: "12px 0", borderTop: `1px solid ${COLORS.border}` }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: COLORS.primary, marginBottom: 4, letterSpacing: "0.05em" }}>
        {item?.recommendationClass || "BEST-PRACTICE IMPROVEMENT"}
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.35, fontWeight: 700, color: COLORS.primary, fontFamily: FONT_BODY }}>
        {item.title}
      </div>
      {item.description && (
        <div style={{ marginTop: 4, fontSize: 11, lineHeight: 1.4, color: COLORS.body }}>
          {item.description}
        </div>
      )}
      {item?.technicalLine && (
        <div style={{ marginTop: 3, fontSize: 10, lineHeight: 1.4, color: COLORS.secondary }}>
          {item.technicalLine}
        </div>
      )}
      {levelChangeText && (
        <div style={{ marginTop: 3, fontSize: 10, lineHeight: 1.4, color: COLORS.primary, fontWeight: 600 }}>
          {levelChangeText}
        </div>
      )}
      {item.caveat && (
        <div style={{ marginTop: 3, fontSize: 10, lineHeight: 1.4, color: COLORS.muted }}>
          {item.caveat}
        </div>
      )}
      <div style={{ marginTop: 3, fontSize: 10, lineHeight: 1.4, color: COLORS.muted }}>
        {item.disruption} disruption · {item.confidence} confidence
      </div>
    </div>
  );
}

function Group({ title, items, mode }) {
  if (!items || items.length === 0) return null;
  return (
    <section style={{ marginBottom: 16 }}>
      <div style={{
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: "0.08em",
        color: COLORS.secondary,
        textTransform: "uppercase",
        fontFamily: FONT_BODY,
        marginBottom: 4,
      }}>
        {title}
      </div>
      {items.map((item) =>
        mode === "best-practice"
          ? <BestPracticeCard key={item.id} item={item} />
          : <RecommendationCard key={item.id} item={item} mode={mode} />
      )}
    </section>
  );
}

export default function TechnicalReportRecommendations({ recommendations }) {
  if (!recommendations) return null;

  const ordered = applyRecommendationDisplayOrder(recommendations);
  const improvements = Array.isArray(ordered.improvements) ? ordered.improvements : [];
  const savings = Array.isArray(ordered.savings) ? ordered.savings : [];
  const bestPractice = Array.isArray(ordered.bestPractice) ? ordered.bestPractice : [];
  const isEvaluating = recommendations.isEvaluating === true;
  const hasAny = improvements.length > 0 || savings.length > 0 || bestPractice.length > 0;

  return (
    <div
      className="tech-report-recommendations screen-only"
      style={{
        background: "#FFFFFF",
        border: "1px solid #DCDBD6",
        borderRadius: 8,
        padding: "20px 24px",
      }}
    >
      <style>{`
        @media print {
          .tech-report-recommendations { display: none !important; }
        }
      `}</style>
      <div style={{
        fontFamily: FONT_HEADING,
        fontSize: 16,
        fontWeight: 400,
        color: COLORS.primary,
        marginBottom: 4,
        letterSpacing: "0.01em",
      }}>
        RECOMMENDATIONS
      </div>
      <div style={{
        fontSize: 11,
        color: COLORS.muted,
        marginBottom: 12,
        fontFamily: FONT_BODY,
      }}>
        Each option is evaluated independently. Combining changes may produce a different result and should be re-evaluated.
      </div>

      {isEvaluating ? (
        <div style={{ fontSize: 12, color: COLORS.muted, fontFamily: FONT_BODY, padding: "12px 0" }}>
          Evaluating low-change alternatives…
        </div>
      ) : !hasAny ? (
        <div style={{ fontSize: 12, color: COLORS.muted, fontFamily: FONT_BODY, padding: "12px 0" }}>
          No material recommendations identified.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 32px", alignItems: "start" }}>
          <div>
            <Group title="Improve the Design" items={improvements} mode="improvement" />
          </div>
          <div>
            <Group title="Simplify the Design" items={savings} mode="saving" />
            <Group title="Best-Practice Improvements" items={bestPractice} mode="best-practice" />
          </div>
        </div>
      )}

      <div style={{
        marginTop: 12,
        paddingTop: 10,
        borderTop: `1px solid ${COLORS.border}`,
        fontSize: 10,
        color: COLORS.muted,
        fontFamily: FONT_BODY,
        lineHeight: 1.4,
      }}>
        Bass is held at the current verified result. Subwoofer alternatives will be added only when scenario re-runs are connected and trusted.
      </div>
    </div>
  );
}