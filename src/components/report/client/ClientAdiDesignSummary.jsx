/**
 * ClientAdiDesignSummary
 * ----------------------
 * Visual Report PAGE — ADI Design Summary.
 *
 * One client-facing section that presents what Artcoustic Design Intelligence
 * contributes to this COMPLETED design:
 *   - the project-specific strengths the design genuinely achieves
 *   - why the selected design works for this room, in the design's own terms
 *
 * The Visual Report presents a finished design, so the section is strength-led:
 * it never leads with a limiting factor, a parameter level, a worst-affected
 * seat or a "next step", and it never tells the reader to go and optimise.
 * Poorer results and the engineering detail stay in the Technical Report, the
 * RP22 parameter table, the Bass Optimiser panel and Engineer details — all of
 * which keep the full ADI guidance block unchanged.
 *
 * Naming rule: "Artcoustic Design Intelligence" on first reference, "ADI"
 * afterwards. All engineering content is read from the published authority —
 * nothing is recalculated here.
 */

import React from "react";
import ClientAdiVisualSummary from "./ClientAdiVisualSummary";
import { selectClientAdiStrengths } from "./selectClientAdiStrengths";
import { getSeatGradeColors, isAssessedLevel } from "./visualReportSeatStyle";

import {
  REPORT_FONT_HEADING as FONT_HEADING,
  REPORT_FONT_BODY as FONT_BODY,
} from "@/components/report/typography/reportTypography";

const COLORS = {
  cardBg: "#FFFFFF",
  primary: "#213428",
  body: "#3E4349",
  secondary: "#625143",
  border: "#E6E4DD",
  divider: "#F0EFEA",
  label: "#9B8E82",
};

export default function ClientAdiDesignSummary({
  engineeringSummary,
  seats,
  geometry,
  system,
  projectId,
  versionId,
  print,
  printPart,
}) {
  const strengths = selectClientAdiStrengths(engineeringSummary);

  const showStrengths = !print || printPart !== "guidance";
  const showGuidance = !print || printPart !== "strengths";

  const containerStyle = print
    ? { width: "100%", fontFamily: FONT_BODY }
    : {
        display: "flex",
        flexDirection: "column",
        gap: 18,
        padding: "32px 36px",
        background: "#FFFFFF",
        borderRadius: 16,
        border: "1px solid #DCDBD6",
        boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
        fontFamily: FONT_BODY,
      };

  return (
    <div style={containerStyle}>
      {!print && (
        <div style={{ width: "100%", marginBottom: 4 }}>
          <h1 style={{
            margin: 0,
            fontSize: 34,
            fontWeight: 300,
            color: COLORS.primary,
            letterSpacing: "0.01em",
            fontFamily: FONT_HEADING,
            textAlign: "center",
          }}>
            ADI Design Summary
          </h1>
          <p style={{
            margin: "6px 0 0 0",
            fontSize: 12,
            color: COLORS.secondary,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            textAlign: "center",
            fontFamily: FONT_BODY,
          }}>
            Artcoustic Design Intelligence
          </p>
        </div>
      )}

      {/* ── Strengths — only where the published results support them ── */}
      {showStrengths && strengths.length > 0 && (
        <div style={{
          background: COLORS.cardBg,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 8,
          padding: "18px 20px",
          width: "100%",
        }}>
          <div style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: COLORS.label,
            marginBottom: 10,
          }}>
            Where this design is strong
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {strengths.map((strength) => {
              const grade = getSeatGradeColors(strength.level);
              return (
                <div key={strength.key} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <span style={{
                    flexShrink: 0,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    padding: "3px 7px",
                    borderRadius: 4,
                    border: `1px solid ${grade.isFail ? grade.border : grade.border}`,
                    background: grade.fill,
                    color: grade.text,
                    fontFamily: FONT_BODY,
                  }}>
                    {isAssessedLevel(strength.level) ? strength.level : "—"}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.primary, lineHeight: 1.4 }}>
                      {strength.area}
                    </div>
                    <div style={{ fontSize: 11.5, color: COLORS.secondary, lineHeight: 1.5, marginTop: 2 }}>
                      {strength.detail}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── ADI review — the completed design's strengths, never its limits ── */}
      {showGuidance && (
        <div style={{ width: "100%" }}>
          <ClientAdiVisualSummary
            engineeringSummary={engineeringSummary}
            seats={seats}
            geometry={geometry}
            system={system}
            projectId={projectId}
            versionId={versionId}
          />
        </div>
      )}
    </div>
  );
}