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
import { P18_THRESHOLDS_BY_BASIS } from "@/components/utils/p18ExtensionAuthority";
import { Check } from "lucide-react";

const HEADING_FONT = "'Futura PT Light', 'Century Gothic', sans-serif";
const BODY_FONT = "'Didact Gothic', 'Century Gothic', sans-serif";

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

// ── P18 frequency scale ──

function P18FrequencyScale({ achievedHz, targetBasis }) {
  const basis = targetBasis === "recommended" ? "recommended" : "minimum";
  const thresholds = P18_THRESHOLDS_BY_BASIS[basis];
  const hz = Number(achievedHz);
  const hasHz = Number.isFinite(hz) && hz > 0;

  // Scale: 15 Hz to 35 Hz
  const SCALE_MIN = 15;
  const SCALE_MAX = 35;
  const tickMarks = [15, 20, 25, 30, 35];

  // Position the achieved marker (clamped to scale range)
  const achievedPct = hasHz
    ? Math.max(0, Math.min(100, ((Math.min(hz, SCALE_MAX) - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100))
    : null;

  // Boundary positions for the selected basis
  const boundaryPcts = Object.entries(thresholds).map(([level, thresholdHz]) => ({
    level,
    hz: thresholdHz,
    pct: ((thresholdHz - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100,
  }));

  return (
    <div style={{ width: "100%", maxWidth: 500, marginTop: 16, padding: "0 12px", boxSizing: "border-box" }}>
      {/* Scale bar */}
      <div style={{ position: "relative", height: 28, marginBottom: 4 }}>
        {/* Track */}
        <div style={{
          position: "absolute",
          top: 10,
          left: 0,
          right: 0,
          height: 3,
          background: "#DCDBD6",
          borderRadius: 2,
        }} />
        {/* Boundary marks */}
        {boundaryPcts.map((b) => (
          <div key={b.level} style={{
            position: "absolute",
            top: 6,
            left: `${b.pct}%`,
            width: 1,
            height: 11,
            background: "#B3A89B",
            transform: "translateX(-0.5px)",
          }} />
        ))}
        {/* Achieved marker */}
        {achievedPct != null && (
          <div style={{
            position: "absolute",
            top: 4,
            left: `${achievedPct}%`,
            transform: "translateX(-50%)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}>
            <div style={{
              width: 14,
              height: 14,
              borderRadius: "50%",
              background: "#213428",
              border: "2px solid #FFFFFF",
              boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
            }} />
          </div>
        )}
      </div>
      {/* Tick labels */}
      <div style={{ position: "relative", height: 18 }}>
        {tickMarks.map((tick) => {
          const pct = ((tick - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100;
          return (
            <div key={tick} style={{
              position: "absolute",
              left: `${pct}%`,
              transform: tick === SCALE_MIN ? "translateX(0)" : tick === SCALE_MAX ? "translateX(-100%)" : "translateX(-50%)",
              fontSize: 10,
              color: "#8A8580",
              fontFamily: BODY_FONT,
              whiteSpace: "nowrap",
            }}>
              {tick}
            </div>
          );
        })}
      </div>
      <div style={{
        marginTop: 2,
        textAlign: "right",
        fontSize: 10,
        color: "#8A8580",
        fontFamily: BODY_FONT,
      }}>
        Frequency (Hz)
      </div>
    </div>
  );
}

// ── Main component ──

export default function ClientBassCapability({ bassPerformance }) {
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
          Bass Performance
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
      padding: "32px 36px",
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
        Bass Performance
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
        <div style={{ marginBottom: 36 }}>
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
        <div style={{ marginBottom: 28 }}>
          <div style={{
            fontSize: 11,
            fontWeight: 600,
            color: "#625143",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            marginBottom: 4,
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
          <div style={{
            fontSize: 13,
            color: "#3E4349",
            marginTop: 4,
          }}>
            {p18Hz != null
              ? `${p18Hz.toFixed(0)} Hz low-frequency extension`
              : "Low-frequency extension"}
          </div>
          <div style={{
            fontSize: 12,
            color: "#625143",
            marginTop: 6,
          }}>
            {p18BasisLabel} grading basis
          </div>
          {/* Frequency scale */}
          <P18FrequencyScale
            achievedHz={p18Hz}
            targetBasis={p18?.targetBasis}
          />
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