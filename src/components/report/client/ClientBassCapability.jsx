/**
 * ClientBassCapability
 * --------------------
 * Visual Report PAGE 1 — Bass Capability & Extension
 * (RP22 Parameters 14 & 18 — Output Capability and Low-Frequency Extension)
 *
 * P14: Shows the designer-SELECTED target level only — never the maximum
 *      available SPL. A four-level horizontal progression (L1–L4) highlights
 *      the selected target. A checkmark confirms achievement; if the target
 *      is not achieved, the actual achieved level is shown honestly.
 *
 * P18: Shows the canonical achieved RP22 level prominently, with a simple
 *      frequency scale marking the achieved extension and the applicable
 *      grading boundaries (Minimum or Recommended basis).
 *
 * All data is consumed from the canonical bass authority — no local
 * re-grading. Uses the same canonical RP22 colours as the rest of the
 * Visual Report.
 */

import React from "react";
import { RP22_GRADE_TOKENS, resolveGradeToken } from "@/components/utils/rp22Colors";
import { isAssessedLevel } from "./visualReportSeatStyle";
import { Check } from "lucide-react";
import BassExtensionScale from "./BassExtensionScale";
import BassResultCallout from "./BassResultCallout";

import {
  REPORT_FONT_HEADING as HEADING_FONT,
  REPORT_FONT_BODY as BODY_FONT,
} from '@/components/report/typography/reportTypography';
import {
  PROJECT_REPORT_SECTION,
  projectReportSectionHeading,
} from '@/components/report/projectReport/projectReportRegistry';

// The detailed P14/P18 page sits under the RP22 category P14 belongs to:
// Dynamic Range. The heading is supplied by the report's composition authority,
// so this page can never headline a category of its own. The default keeps the
// canonical category if the page is ever rendered on its own.
const DEFAULT_HEADING = projectReportSectionHeading(PROJECT_REPORT_SECTION.DYNAMIC_RANGE);

// ── Level helpers ──

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

// ── P14 four-level progression ──

function P14LevelProgression({ selectedLevel, achieved, pass }) {
  const selectedN = levelToNumber(selectedLevel);
  const levels = [1, 2, 3, 4];

  return (
    <div style={{
      display: "flex",
      alignItems: "stretch",
      gap: 0,
      width: "100%",
      maxWidth: 480,
      marginTop: 16,
    }}>
      {levels.map((n, i) => {
        const token = RP22_GRADE_TOKENS[`L${n}`];
        const isSelected = selectedN === n;
        const isAchieved = achieved && isSelected && pass !== false;
        return (
          <div
            key={n}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              padding: "14px 8px",
              background: isSelected ? token.bg : "#F8F8F7",
              border: `1px solid ${isSelected ? token.border : "#DCDBD6"}`,
              borderRight: i < 3 ? "none" : `1px solid ${isSelected ? token.border : "#DCDBD6"}`,
              borderRadius: i === 0 ? "8px 0 0 8px" : i === 3 ? "0 8px 8px 0" : 0,
              position: "relative",
            }}
          >
            <div style={{
              fontSize: 22,
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
                top: 6,
                right: 8,
                width: 18,
                height: 18,
                borderRadius: "50%",
                background: token.border,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}>
                <Check style={{ width: 12, height: 12, color: "#FFFFFF", strokeWidth: 3 }} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main component ──

export default function ClientBassCapability({ bassPerformance, heading = DEFAULT_HEADING }) {
  if (!bassPerformance) return null;

  const { p14, p18 } = bassPerformance;

  // NOT CALCULATED guard — no assessed bass result at all
  const hasP14 = p14 && isAssessedLevel(p14.achievedLevel);
  const hasP18 = p18 && isAssessedLevel(p18.achievedLevel);
  if (!hasP14 && !hasP18) {
    return (
      <div style={{
        background: "#FFFFFF",
        borderRadius: 16,
        padding: "48px 40px",
        border: "1px solid #DCDBD6",
        boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
        textAlign: "center",
      }}>
        <div style={{
          fontSize: 20,
          fontWeight: 600,
          color: "#213428",
          fontFamily: HEADING_FONT,
          marginBottom: 4,
        }}>
          {heading}
        </div>
        <div style={{
          fontSize: 12,
          color: "#625143",
          fontFamily: BODY_FONT,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          marginBottom: 32,
        }}>
          RP22 Parameters 14 &amp; 18 — Output Capability and Low-Frequency Extension
        </div>
        <div style={{
          fontSize: 16,
          color: "#8A8580",
          fontFamily: BODY_FONT,
          padding: "24px 16px",
          background: "#F5F4F1",
          borderRadius: 8,
          border: "1px solid #D9D5CE",
        }}>
          NOT CALCULATED
        </div>
      </div>
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
    <div style={{
      background: "#FFFFFF",
      borderRadius: 16,
      padding: "40px 40px",
      border: "1px solid #DCDBD6",
      boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
      fontFamily: BODY_FONT,
    }}>
      {/* ── Heading hierarchy ── */}
      <h1 style={{
        margin: 0,
        fontSize: 34,
        fontWeight: 300,
        color: "#213428",
        letterSpacing: "0.01em",
        fontFamily: HEADING_FONT,
        textAlign: "center",
      }}>
        {heading}
      </h1>
      <p style={{
        margin: "6px 0 28px 0",
        fontSize: 12,
        color: "#625143",
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        textAlign: "center",
        fontFamily: BODY_FONT,
      }}>
        RP22 Parameters 14 &amp; 18 — Output Capability and Low-Frequency Extension
      </p>

      {/* ── P14 — Output Capability ── */}
      {hasP14 && (
        <div style={{ marginBottom: 52 }}>
          <div style={{
            fontSize: 11,
            fontWeight: 600,
            color: "#625143",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            marginBottom: 4,
          }}>
            P14 — Bass Output Target
          </div>
          <div style={{
            fontSize: 18,
            fontWeight: 600,
            color: "#213428",
            fontFamily: HEADING_FONT,
          }}>
            {p14Pass
              ? `P14 — ${p14SelectedLabel}`
              : `P14 — ${levelToLabel(p14.rawAchievedLevel) || p14SelectedLabel || "—"}`}
          </div>
          <div style={{
            fontSize: 13,
            color: "#3E4349",
            marginTop: 4,
          }}>
            {p14Pass
              ? "Selected bass output target achieved"
              : "Selected bass output target not achieved"}
          </div>
          {/* Supporting line */}
          <div style={{
            fontSize: 12,
            color: "#625143",
            marginTop: 6,
          }}>
            {p14TargetBasisLabel} Level {p14SelectedLabel?.replace("L", "") || "—"}
            {p14TargetDb != null ? ` · ${p14TargetDb.toFixed(0)} dBC` : ""}
          </div>
          {/* Four-level progression */}
          <P14LevelProgression
            selectedLevel={p14.selectedLevel}
            achieved={p14Pass}
            pass={p14.pass}
          />
        </div>
      )}

      {/* ── P18 — Low-Frequency Extension ── */}
      {hasP18 && (
        <div style={{ marginBottom: 36 }}>
          <div style={{
            fontSize: 11,
            fontWeight: 600,
            color: "#625143",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            marginBottom: 6,
          }}>
            P18 — Low-Frequency Extension
          </div>
          <div style={{
            fontSize: 18,
            fontWeight: 600,
            color: "#213428",
            fontFamily: HEADING_FONT,
          }}>
            P18 — {p18LevelLabel}
          </div>
          {/* Result callout — the P18 result stated plainly, sized to be read
              at normal PDF viewing size. */}
          <BassResultCallout achievedHz={p18Hz} achievedLevel={p18?.achievedLevel} />
          {/* Frequency scale — the achieved extension marked and labelled */}
          <BassExtensionScale
            achievedHz={p18Hz}
            targetBasis={p18?.targetBasis}
          />
          <div style={{
            fontSize: 12,
            color: "#625143",
            marginTop: 10,
          }}>
            {p18BasisLabel} grading basis
          </div>
        </div>
      )}

      {/* ── Closing callout ── */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "16px 20px",
        background: "#F1F0EE",
        borderRadius: 12,
        border: "1px solid #DCDBD6",
        marginTop: 8,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#213428", marginBottom: 4, fontFamily: HEADING_FONT }}>
            Output and extension
          </div>
          <div style={{ fontSize: 13, color: "#3E4349", lineHeight: 1.5 }}>
            The bass system achieves the selected output target and extends to the frequency shown above at the listening position.
          </div>
        </div>
      </div>
    </div>
  );
}