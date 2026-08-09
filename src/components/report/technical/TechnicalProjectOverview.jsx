/**
 * TechnicalProjectOverview.jsx
 * ---------------------------
 * Technical Report — Page 2: Project & System Overview.
 *
 * Presents project details, screen & viewing geometry, per-row viewing
 * geometry with rectangular RP23 level badges, and the loudspeaker system
 * configuration in a clean architectural layout using the Stage A design
 * language (#F1F0EE background, white cards, Futura PT Light headings,
 * Didact Gothic body, rectangular TechnicalLevelBadge).
 *
 * Presentation-only — does NOT modify any calculations, grading, or
 * parameter authority. All values are passed as props from live state.
 */

import React from "react";
import TechnicalLevelBadge from "./TechnicalLevelBadge";
import { rp23DisplayAngleDeg, rp23LevelForAngleDeg } from "@/components/utils/viewingAngleUtils";

const FONT_HEADING = "'Futura PT Light', 'Century Gothic', sans-serif";
const FONT_BODY = "'Didact Gothic', 'Century Gothic', sans-serif";

const COLORS = {
  bg: "#F1F0EE",
  cardBg: "#FFFFFF",
  primary: "#213428",
  body: "#3E4349",
  secondary: "#625143",
  accent: "#4A230F",
  border: "#E6E4DD",
  borderStrong: "#D9D5CE",
  label: "#9B8E82",
};

function formatDateShort(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function TechnicalProjectOverview({
  projectDetails,
  exportDateLabel,
  exportSystemConfiguration,
  screenChoiceLabel,
  screenMetrics,
  rowCentralSeats,
  screenFrontPlaneM,
  screen,
  systemSummary,
}) {
  // ── Compute per-row viewing geometry from live seat + screen data ──
  const screenY = Number.isFinite(screenFrontPlaneM) ? screenFrontPlaneM : 0;
  const scrW = screenMetrics?.viewWm || 0;
  const scrH = screenMetrics?.viewHm || 0;
  const scrBottom = Number(screen?.heightFromFloorM ?? 0.5);
  const scrTop = scrBottom + scrH;

  const rowGeometry = (rowCentralSeats || []).map((seat) => {
    const eyeY = seat.y;
    const rowNum = seat.rowNumber || 1;
    const defaultEarHeight = rowNum === 1 ? 1.2 : rowNum === 2 ? 1.5 : rowNum === 3 ? 1.8 : 1.2 + (rowNum - 1) * 0.3;
    const eyeZ = Number.isFinite(seat.z) && seat.z !== 1.2 ? seat.z : defaultEarHeight;
    const dist = Math.abs(eyeY - screenY);
    const hAngle = dist > 0 ? 2 * Math.atan((scrW / 2) / dist) * (180 / Math.PI) : 0;
    const vTop = dist > 0 ? Math.atan2(scrTop - eyeZ, dist) * (180 / Math.PI) : 0;
    const vBot = dist > 0 ? Math.atan2(scrBottom - eyeZ, dist) * (180 / Math.PI) : 0;
    const displayH = rp23DisplayAngleDeg(hAngle);
    return {
      rowNumber: rowNum,
      viewingDistanceM: dist,
      horizontalAngleDeg: displayH,
      verticalAngleDeg: vTop - vBot,
      rp23Level: rp23LevelForAngleDeg(hAngle),
    };
  });

  const fmtCm = (m) => (Number.isFinite(m) ? `${Math.round(m * 100)}` : "—");

  const cardStyle = {
    background: COLORS.cardBg,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 6,
    padding: "6mm 8mm",
    marginBottom: "5mm",
    breakInside: "avoid",
    pageBreakInside: "avoid",
  };

  const sectionLabelStyle = {
    fontFamily: FONT_HEADING,
    fontSize: "9pt",
    fontWeight: 600,
    color: COLORS.secondary,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    marginBottom: "4mm",
  };

  return (
    <div
      className="tech-overview-page"
      style={{
        background: COLORS.bg,
        minHeight: "268mm",
        padding: "8mm 10mm",
        boxSizing: "border-box",
        WebkitPrintColorAdjust: "exact",
        printColorAdjust: "exact",
        fontFamily: FONT_BODY,
        color: COLORS.body,
      }}
    >
      {/* ── Page heading ── */}
      <div style={{ marginBottom: "6mm" }}>
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
          PROJECT &amp; SYSTEM OVERVIEW
        </div>
        <div
          style={{
            fontFamily: FONT_BODY,
            fontSize: "10pt",
            color: COLORS.secondary,
            marginTop: "2mm",
            letterSpacing: "0.04em",
          }}
        >
          System Configuration · {exportSystemConfiguration || "—"}
        </div>
      </div>

      {/* ── Project details card ── */}
      <div className="print-avoid-break" style={cardStyle}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: "6mm",
          }}
        >
          {[
            { label: "PROJECT", value: projectDetails?.name || "—" },
            { label: "CLIENT", value: projectDetails?.client_name || "—" },
            { label: "DATE", value: exportDateLabel || "—" },
            { label: "LAST UPDATED", value: formatDateShort(projectDetails?.updated_date) },
          ].map((item) => (
            <div key={item.label}>
              <div
                style={{
                  fontSize: "7.5pt",
                  fontWeight: 600,
                  color: COLORS.secondary,
                  letterSpacing: "0.1em",
                  marginBottom: "2mm",
                  fontFamily: FONT_BODY,
                }}
              >
                {item.label}
              </div>
              <div
                style={{
                  fontSize: "11pt",
                  fontWeight: 600,
                  color: COLORS.primary,
                  fontFamily: FONT_HEADING,
                  lineHeight: 1.2,
                }}
              >
                {item.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Screen & viewing geometry card ── */}
      <div className="print-avoid-break" style={cardStyle}>
        <div style={sectionLabelStyle}>SCREEN &amp; VIEWING GEOMETRY</div>
        <div
          style={{
            fontFamily: FONT_HEADING,
            fontSize: "22pt",
            fontWeight: 400,
            color: COLORS.primary,
            lineHeight: 1,
            marginBottom: "4mm",
          }}
        >
          {screenChoiceLabel || "—"}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "8mm",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "7.5pt",
                fontWeight: 600,
                color: COLORS.label,
                letterSpacing: "0.08em",
                marginBottom: "1.5mm",
                fontFamily: FONT_BODY,
              }}
            >
              VIEWABLE
            </div>
            <div style={{ fontSize: "11pt", color: COLORS.body, fontFamily: FONT_BODY }}>
              {screenMetrics?.viewWm
                ? `${fmtCm(screenMetrics.viewWm)} × ${fmtCm(screenMetrics.viewHm)} cm`
                : "—"}
            </div>
          </div>
          <div>
            <div
              style={{
                fontSize: "7.5pt",
                fontWeight: 600,
                color: COLORS.label,
                letterSpacing: "0.08em",
                marginBottom: "1.5mm",
                fontFamily: FONT_BODY,
              }}
            >
              OVERALL
            </div>
            <div style={{ fontSize: "11pt", color: COLORS.body, fontFamily: FONT_BODY }}>
              {screenMetrics?.overallWm
                ? `${fmtCm(screenMetrics.overallWm)} × ${fmtCm(screenMetrics.overallHm)} cm`
                : "—"}
            </div>
          </div>
        </div>
      </div>

      {/* ── Viewing geometry by row ── */}
      {rowGeometry.length > 0 && (
        <div className="print-avoid-break" style={cardStyle}>
          <div style={sectionLabelStyle}>VIEWING GEOMETRY BY ROW</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "3mm" }}>
            {rowGeometry.map((row, idx) => (
              <div
                key={row.rowNumber}
                style={{
                  display: "grid",
                  gridTemplateColumns: "18mm 1fr 1fr 1fr auto",
                  alignItems: "center",
                  gap: "4mm",
                  paddingBottom: idx < rowGeometry.length - 1 ? "3mm" : 0,
                  borderBottom:
                    idx < rowGeometry.length - 1 ? `1px solid ${COLORS.border}` : "none",
                }}
              >
                <div
                  style={{
                    fontSize: "10pt",
                    fontWeight: 600,
                    color: COLORS.primary,
                    fontFamily: FONT_HEADING,
                  }}
                >
                  ROW {row.rowNumber}
                </div>
                <div>
                  <div
                    style={{
                      fontSize: "7pt",
                      color: COLORS.label,
                      marginBottom: "0.5mm",
                      fontFamily: FONT_BODY,
                    }}
                  >
                    DISTANCE
                  </div>
                  <div style={{ fontSize: "10pt", color: COLORS.body, fontFamily: FONT_BODY }}>
                    {Number.isFinite(row.viewingDistanceM)
                      ? `${row.viewingDistanceM.toFixed(2)} m`
                      : "—"}
                  </div>
                </div>
                <div>
                  <div
                    style={{
                      fontSize: "7pt",
                      color: COLORS.label,
                      marginBottom: "0.5mm",
                      fontFamily: FONT_BODY,
                    }}
                  >
                    HORIZONTAL
                  </div>
                  <div style={{ fontSize: "10pt", color: COLORS.body, fontFamily: FONT_BODY }}>
                    {Number.isFinite(row.horizontalAngleDeg)
                      ? `${row.horizontalAngleDeg}°`
                      : "—"}
                  </div>
                </div>
                <div>
                  <div
                    style={{
                      fontSize: "7pt",
                      color: COLORS.label,
                      marginBottom: "0.5mm",
                      fontFamily: FONT_BODY,
                    }}
                  >
                    VERTICAL
                  </div>
                  <div style={{ fontSize: "10pt", color: COLORS.body, fontFamily: FONT_BODY }}>
                    {Number.isFinite(row.verticalAngleDeg)
                      ? `${row.verticalAngleDeg.toFixed(1)}°`
                      : "—"}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "3mm" }}>
                  <span
                    style={{
                      fontSize: "7pt",
                      color: COLORS.label,
                      fontFamily: FONT_BODY,
                    }}
                  >
                    RP23
                  </span>
                  <TechnicalLevelBadge level={row.rp23Level} size="small" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── System configuration card ── */}
      <div className="print-avoid-break" style={{ ...cardStyle, marginBottom: 0 }}>
        <div style={sectionLabelStyle}>SYSTEM CONFIGURATION</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "3mm" }}>
          {[
            { label: "LCR", models: systemSummary?.lcr },
            { label: "SURROUNDS", models: systemSummary?.surrounds },
            { label: "OVERHEADS", models: systemSummary?.overheads },
            { label: "SUBWOOFERS", models: systemSummary?.subs },
          ].map(({ label, models }, i, arr) => (
            <div
              key={label}
              style={{
                display: "grid",
                gridTemplateColumns: "32mm 1fr",
                gap: "4mm",
                alignItems: "baseline",
                paddingBottom: i < arr.length - 1 ? "3mm" : 0,
                borderBottom: i < arr.length - 1 ? `1px solid ${COLORS.border}` : "none",
              }}
            >
              <div
                style={{
                  fontSize: "9pt",
                  fontWeight: 600,
                  color: COLORS.primary,
                  fontFamily: FONT_HEADING,
                  letterSpacing: "0.04em",
                }}
              >
                {label}
              </div>
              <div
                style={{
                  fontSize: "10pt",
                  color: COLORS.body,
                  fontFamily: FONT_BODY,
                  lineHeight: 1.3,
                }}
              >
                {(models || ["None specified"]).join(", ")}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}