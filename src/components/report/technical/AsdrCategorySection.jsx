/**
 * AsdrCategorySection.jsx
 * -----------------------
 * One design-category block in the Technical Report ASDR scorecard (PDF).
 * Leads with the category name, followed by Primary / Secondary seat-scoped
 * floor results using standard RP22GradingPill / RP23 pills.
 *
 * Pure presentation — consumes floor summaries from getCategoryFloorSummaries()
 * in designRatingPresentation (the SAME shared authority as the Room Designer
 * sidebar). No ASDR maths, no recalculation, no re-grading. No hover tooltips
 * in print; the detailed parameter section provides the full evidence.
 */
import React from "react";
import RP22GradingPill from "@/components/ui/RP22GradingPill";

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

function ScopeLine({ scope, isPrimary, isScreen }) {
  const rowStyle = {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    alignItems: "center",
    gap: "2px 4mm",
    padding: "1.8mm 0",
    borderTop: `1px solid ${COLORS.border}`,
  };

  if (!scope?.hasContribs) {
    return (
      <div style={rowStyle}>
        <span style={{ fontSize: "8pt", fontWeight: 600, color: COLORS.muted, letterSpacing: "0.06em", textTransform: "uppercase", fontFamily: FONT_BODY }}>
          {isPrimary ? "Primary Seats" : "Secondary Seats"}
        </span>
        <span style={{ fontSize: "9pt", color: COLORS.muted, fontFamily: FONT_BODY }}>—</span>
      </div>
    );
  }

  // Screen / Viewing Geometry — RP23 pill + descriptor.
  if (isScreen) {
    const lvl = scope.screenLevel;
    if (!lvl) {
      return (
        <div style={rowStyle}>
          <span style={{ fontSize: "8pt", fontWeight: 600, color: COLORS.muted, letterSpacing: "0.06em", textTransform: "uppercase", fontFamily: FONT_BODY }}>
            {isPrimary ? "Primary Seats" : "Secondary Seats"}
          </span>
          <span style={{ fontSize: "9pt", color: COLORS.muted, fontFamily: FONT_BODY }}>—</span>
        </div>
      );
    }
    const isFail = lvl === "FAIL";
    const lead = isPrimary
      ? (isFail ? "Primary Seats FAIL" : "Primary Seats achieve")
      : (isFail ? "Secondary Seats FAIL" : "Secondary Seats — no lower than");
    const pillLabel = isFail ? "RP23 FAIL" : `RP23 L${levelNum(lvl)}`;
    const descriptor = isFail ? null : (SCREEN_DESCRIPTOR[lvl] ?? null);
    return (
      <div style={rowStyle}>
        <div>
          <span style={{ fontSize: "8pt", fontWeight: 600, color: COLORS.secondary, letterSpacing: "0.06em", textTransform: "uppercase", fontFamily: FONT_BODY }}>
            {lead}
          </span>
          {descriptor && (
            <div style={{ fontSize: "7.5pt", color: COLORS.muted, fontFamily: FONT_BODY, marginTop: "0.5mm" }}>
              {descriptor}
            </div>
          )}
        </div>
        <RP22GradingPill level={lvl} compact>{pillLabel}</RP22GradingPill>
      </div>
    );
  }

  // RP22 performance categories — floor (lowest achieved level).
  const floor = scope.floorLevel;
  if (scope.hasFail || floor === "FAIL") {
    const lead = isPrimary ? "Primary Seats" : "Secondary Seats";
    return (
      <div style={rowStyle}>
        <span style={{ fontSize: "8pt", fontWeight: 600, color: COLORS.secondary, letterSpacing: "0.06em", textTransform: "uppercase", fontFamily: FONT_BODY }}>
          {lead}
        </span>
        <RP22GradingPill level="FAIL" compact />
      </div>
    );
  }

  const lead = isPrimary ? "Primary Seats — no lower than" : "Secondary Seats — no lower than";
  const pill = floor ? (
    <RP22GradingPill level={floor} compact />
  ) : (
    <span style={{ fontSize: "9pt", color: COLORS.muted, fontFamily: FONT_BODY }}>—</span>
  );
  return (
    <div style={rowStyle}>
      <span style={{ fontSize: "8pt", fontWeight: 600, color: COLORS.secondary, letterSpacing: "0.06em", textTransform: "uppercase", fontFamily: FONT_BODY }}>
        {lead}
      </span>
      {pill}
    </div>
  );
}

/**
 * Props:
 *   label     — display label (e.g. "Spatial Resolution", "Screen / Viewing Geometry")
 *   primary   — category floor summary for Primary scope (from getCategoryFloorSummaries)
 *   secondary — category floor summary for Secondary scope (may be null)
 */
export default function AsdrCategorySection({ label, primary, secondary }) {
  const isScreen = primary?.isScreen || secondary?.isScreen;

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
      <div style={{ marginTop: "1mm" }}>
        <ScopeLine scope={primary} isPrimary={true} isScreen={isScreen} />
        {secondary?.hasContribs && (
          <ScopeLine scope={secondary} isPrimary={false} isScreen={isScreen} />
        )}
      </div>
    </div>
  );
}