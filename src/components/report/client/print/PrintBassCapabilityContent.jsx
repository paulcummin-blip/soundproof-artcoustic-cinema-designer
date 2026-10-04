/**
 * PrintBassCapabilityContent
 * ---------------------------
 * Print/PDF content for Bass Performance Page 1 (P14/P18).
 *
 * Renders the same content as ClientBassCapability but in the print
 * layout — heading region, content region, closing callout.
 */

import React from "react";
import { RP22_GRADE_TOKENS } from "@/components/utils/rp22Colors";
import { isAssessedLevel } from "../visualReportSeatStyle";
import { Check } from "lucide-react";
import BassExtensionScale from "../BassExtensionScale";
import BassResultCallout from "../BassResultCallout";

import {
  REPORT_FONT_HEADING as HEADING_FONT,
  REPORT_FONT_BODY as BODY_FONT,
} from '@/components/report/typography/reportTypography';

function levelToNumber(level) {
  if (level == null) return null;
  const n = Number(level);
  if (Number.isFinite(n) && n >= 1 && n <= 4) return n;
  const match = String(level).match(/^L?([1-4])$/i);
  return match ? Number(match[1]) : null;
}

function levelToLabel(level) {
  const n = levelToNumber(level);
  return n != null ? `L${n}` : null;
}

function P14LevelProgression({ selectedLevel, pass }) {
  const selectedN = levelToNumber(selectedLevel);
  const levels = [1, 2, 3, 4];

  return (
    <div style={{
      display: "flex",
      alignItems: "stretch",
      gap: 0,
      width: "100%",
      maxWidth: 420,
      marginTop: 10,
    }}>
      {levels.map((n, i) => {
        const token = RP22_GRADE_TOKENS[`L${n}`];
        const isSelected = selectedN === n;
        const isAchieved = isSelected && pass !== false;
        return (
          <div
            key={n}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              padding: "10px 6px",
              background: isSelected ? token.bg : "#F8F8F7",
              border: `1px solid ${isSelected ? token.border : "#DCDBD6"}`,
              borderRight: i < 3 ? "none" : `1px solid ${isSelected ? token.border : "#DCDBD6"}`,
              borderRadius: i === 0 ? "6px 0 0 6px" : i === 3 ? "0 6px 6px 0" : 0,
              position: "relative",
            }}
          >
            <div style={{
              fontSize: 18,
              fontWeight: 600,
              fontFamily: HEADING_FONT,
              color: isSelected ? token.text : "#8A8580",
              lineHeight: 1,
            }}>
              L{n}
            </div>
            {isAchieved && (
              <div style={{
                position: "absolute",
                top: 4,
                right: 6,
                width: 14,
                height: 14,
                borderRadius: "50%",
                background: token.border,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}>
                <Check style={{ width: 9, height: 9, color: "#FFFFFF", strokeWidth: 3 }} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function PrintBassCapabilityContent({ bassPerformance }) {
  if (!bassPerformance) return null;

  const { p14, p18 } = bassPerformance;
  const hasP14 = p14 && isAssessedLevel(p14.achievedLevel);
  const hasP18 = p18 && isAssessedLevel(p18.achievedLevel);

  if (!hasP14 && !hasP18) {
    return (
      <>
        <div className="client-report-print-heading">
          <h1 className="client-report-print-heading__title">Bass Performance</h1>
          <p className="client-report-print-heading__subtitle">RP22 Parameters 14 &amp; 18 — Output Capability and Low-Frequency Extension</p>
        </div>
        <div className="client-report-print-drawing" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{
            fontSize: 16,
            color: "#8A8580",
            fontFamily: BODY_FONT,
            padding: "32px 24px",
            background: "#F5F4F1",
            borderRadius: 8,
            border: "1px solid #D9D5CE",
          }}>
            NOT CALCULATED
          </div>
        </div>
      </>
    );
  }

  const p14SelectedLabel = p14 ? levelToLabel(p14.selectedLevel) : null;
  const p14Pass = p14?.pass !== false;
  const p14TargetBasisLabel = p14?.targetBasisLabel || "Minimum";
  const p14TargetDb = p14?.requestedTargetDb;

  const p18LevelLabel = p18 ? levelToLabel(p18.achievedLevel) : null;
  const p18Hz = p18?.achievedHz;
  const p18BasisLabel = p18?.targetBasisLabel || "Minimum";

  return (
    <>
      <div className="client-report-print-heading">
        <h1 className="client-report-print-heading__title">Bass Performance</h1>
        <p className="client-report-print-heading__subtitle">RP22 Parameters 14 &amp; 18 — Output Capability and Low-Frequency Extension</p>
      </div>
      <div className="client-report-print-drawing" style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 34,
        padding: "14px 16px",
        fontFamily: BODY_FONT,
      }}>
        {/* P14 */}
        {hasP14 && (
          <div style={{ width: "100%", maxWidth: 460 }}>
            <div style={{
              fontSize: 10,
              fontWeight: 600,
              color: "#625143",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: 2,
            }}>
              P14 — Bass Output Target
            </div>
            <div style={{
              fontSize: 16,
              fontWeight: 600,
              color: "#213428",
              fontFamily: HEADING_FONT,
            }}>
              {p14Pass
                ? `P14 — ${p14SelectedLabel}`
                : `P14 — ${levelToLabel(p14.rawAchievedLevel) || p14SelectedLabel || "—"}`}
            </div>
            <div style={{ fontSize: 11, color: "#3E4349", marginTop: 2 }}>
              {p14Pass
                ? "Selected bass output target achieved"
                : "Selected bass output target not achieved"}
            </div>
            <div style={{ fontSize: 10, color: "#625143", marginTop: 4 }}>
              {p14TargetBasisLabel} Level {p14SelectedLabel?.replace("L", "") || "—"}
              {p14TargetDb != null ? ` · ${p14TargetDb.toFixed(0)} dBC` : ""}
            </div>
            <P14LevelProgression selectedLevel={p14.selectedLevel} pass={p14.pass} />
          </div>
        )}

        {/* P18 */}
        {hasP18 && (
          <div style={{ width: "100%", maxWidth: 460 }}>
            <div style={{
              fontSize: 10,
              fontWeight: 600,
              color: "#625143",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: 3,
            }}>
              P18 — Low-Frequency Extension
            </div>
            <div style={{
              fontSize: 16,
              fontWeight: 600,
              color: "#213428",
              fontFamily: HEADING_FONT,
            }}>
              P18 — {p18LevelLabel}
            </div>
            <BassResultCallout achievedHz={p18Hz} achievedLevel={p18?.achievedLevel} variant="print" />
            <BassExtensionScale achievedHz={p18Hz} targetBasis={p18?.targetBasis} variant="print" />
            <div style={{ fontSize: 10, color: "#625143", marginTop: 8 }}>
              {p18BasisLabel} grading basis
            </div>
          </div>
        )}
      </div>
      <div className="client-report-print-result">
        <div className="client-report-print-result__content">
          <div className="client-report-print-result__label">Output and extension</div>
          <div className="client-report-print-result__explanation">
            The bass system achieves the selected output target and extends to the frequency shown above at the listening position.
          </div>
        </div>
      </div>
    </>
  );
}