/**
 * ClientBassPerformance
 * ---------------------
 * Visual Report component for the bass performance section.
 *
 * Shows the CURRENT APPLIED DESIGN bass performance (not optimiser proposals):
 *   P14 — LFE total SPL capability (room-scope)
 *   P18 — low-frequency extension (room-scope)
 *   P19 — response below transition (SEAT-scope, per-seat)
 *   P20 — seat-to-seat variance (SEAT-scope, per-seat)
 *
 * Uses canonical RP22 grading pills for levels.
 * Per-seat P19/P20 results are shown individually (not aggregated).
 * FAIL results remain visible.
 * N/A / NOT CALCULATED parameters are omitted (no sheet if entirely unavailable).
 */

import React from "react";
import RP22GradingPill from "@/components/ui/RP22GradingPill";
import { isAssessedLevel, getSeatGradeColors } from "./visualReportSeatStyle";

const HEADING_FONT = "'Futura PT Light', 'Century Gothic', sans-serif";
const BODY_FONT = "'Didact Gothic', 'Century Gothic', sans-serif";

function levelToPillLevel(level) {
  if (level == null) return null;
  if (level === "N/A" || level === "not_applicable") return null;
  const n = Number(level);
  if (Number.isFinite(n)) return n;
  const match = String(level).match(/^L([1-4])$/i);
  return match ? Number(match[1]) : null;
}

function fmtDb(db) {
  if (!Number.isFinite(Number(db))) return "—";
  return `${Number(db).toFixed(1)} dB`;
}

function fmtHz(hz) {
  if (!Number.isFinite(Number(hz))) return "—";
  return `${Number(hz).toFixed(1)} Hz`;
}

function BassParameterCard({ title, subtitle, level, valueText, children }) {
  return (
    <div style={{
      background: "#FFFFFF",
      borderRadius: 12,
      padding: "20px 24px",
      border: "1px solid #DCDBD6",
      boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div>
          <div style={{
            fontSize: 16,
            fontWeight: 600,
            color: "#213428",
            fontFamily: HEADING_FONT,
          }}>
            {title}
          </div>
          {subtitle && (
            <div style={{
              fontSize: 11,
              color: "#625143",
              fontFamily: BODY_FONT,
              marginTop: 2,
            }}>
              {subtitle}
            </div>
          )}
        </div>
        {level != null && isAssessedLevel(level) && (
          <RP22GradingPill level={levelToPillLevel(level)} variant="report">
            {valueText}
          </RP22GradingPill>
        )}
      </div>
      {children}
    </div>
  );
}

function PerSeatResults({ perSeatResults, seatLabelMap, paramLabel }) {
  if (!perSeatResults || perSeatResults.length === 0) return null;

  const hasAssessed = perSeatResults.some((s) => isAssessedLevel(s.level));
  if (!hasAssessed) return null;

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{
        fontSize: 10,
        fontWeight: 600,
        color: "#625143",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        marginBottom: 8,
        fontFamily: BODY_FONT,
      }}>
        Per-seat results
      </div>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
        gap: 8,
      }}>
        {perSeatResults.map((s, i) => {
          const label = seatLabelMap?.get(s.seatId) || `Seat ${i + 1}`;
          const scope = s.isPrimary ? "Primary" : "Secondary";
          const pillLevel = levelToPillLevel(s.level);
          const gradeColors = getSeatGradeColors(s.level);
          return (
            <div key={s.seatId || i} style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 10px",
              borderRadius: 8,
              background: gradeColors.fill,
              border: `1px solid ${gradeColors.border}`,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#1B1A1A",
                  fontFamily: BODY_FONT,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}>
                  {label}
                </div>
                <div style={{
                  fontSize: 9,
                  color: "#625143",
                  fontFamily: BODY_FONT,
                }}>
                  {scope}
                </div>
              </div>
              {isAssessedLevel(s.level) && (
                <RP22GradingPill level={pillLevel} compact>
                  {Math.abs(Number(s.variationDbRaw) || 0).toFixed(2)}
                </RP22GradingPill>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ClientBassPerformance({ bassPerformance, roomDims, seatingPositions, rsp, screenFrontPlaneM, screenWidthM }) {
  if (!bassPerformance) return null;

  const { p14, p18, p19, p20, seatLabelMap, publicationVerified } = bassPerformance;

  return (
    <div style={{
      background: "#FFFFFF",
      borderRadius: 16,
      padding: "28px 32px",
      border: "1px solid #DCDBD6",
      boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
    }}>
      {/* Section heading */}
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
        marginBottom: 20,
      }}>
        Low-frequency capability and response consistency across seating positions.
      </div>

      {/* P14 — LFE total SPL capability */}
      {p14 && isAssessedLevel(p14.achievedLevel) && (
        <div style={{ marginBottom: 12 }}>
          <BassParameterCard
            title="P14 — LFE Total SPL Capability"
            subtitle="Maximum low-frequency output at the listening position"
            level={p14.achievedLevel}
            valueText={p14.achievedCapabilityDb != null ? `${p14.achievedCapabilityDb.toFixed(1)} dB` : "—"}
          >
            <div style={{ fontSize: 11, color: "#625143", fontFamily: BODY_FONT, marginTop: 4 }}>
              {p14.headroomOrShortfallDb != null && (
                <span>
                  {p14.headroomOrShortfallDb >= 0 ? "Headroom" : "Shortfall"}: {Math.abs(p14.headroomOrShortfallDb).toFixed(1)} dB
                </span>
              )}
              {p14.requestedTargetDb != null && (
                <span style={{ marginLeft: 12 }}>
                  Target: {p14.requestedTargetDb.toFixed(1)} dB
                </span>
              )}
            </div>
          </BassParameterCard>
        </div>
      )}

      {/* P18 — Low-frequency extension */}
      {p18 && isAssessedLevel(p18.achievedLevel) && (
        <div style={{ marginBottom: 12 }}>
          <BassParameterCard
            title="P18 — Low-Frequency Extension"
            subtitle="Lowest frequency the system reproduces at target level"
            level={p18.achievedLevel}
            valueText={p18.achievedHz != null ? `${p18.achievedHz.toFixed(1)} Hz` : "—"}
          >
            <div style={{ fontSize: 11, color: "#625143", fontFamily: BODY_FONT, marginTop: 4 }}>
              {p18.designHz != null && (
                <span>Design target: {p18.designHz.toFixed(1)} Hz</span>
              )}
            </div>
          </BassParameterCard>
        </div>
      )}

      {/* P19 — Response below transition (per-seat) */}
      {p19 && isAssessedLevel(p19.achievedLevel) && (
        <div style={{ marginBottom: 12 }}>
          <BassParameterCard
            title="P19 — Response Below Transition"
            subtitle="Low-frequency response smoothness at each seating position"
            level={p19.achievedLevel}
            valueText={p19.achievedVariationDb != null ? `${p19.achievedVariationDb.toFixed(2)} dB` : "—"}
          >
            <PerSeatResults
              perSeatResults={p19.perSeatResults}
              seatLabelMap={seatLabelMap}
              paramLabel="P19"
            />
          </BassParameterCard>
        </div>
      )}

      {/* P20 — Seat-to-seat variance (per-seat) */}
      {p20 && isAssessedLevel(p20.achievedLevel) && (
        <div style={{ marginBottom: 0 }}>
          <BassParameterCard
            title="P20 — Seat-to-Seat Variance"
            subtitle="Consistency of low-frequency response between seating positions"
            level={p20.achievedLevel}
            valueText={p20.achievedVariationDb != null ? `${p20.achievedVariationDb.toFixed(2)} dB` : "—"}
          >
            <PerSeatResults
              perSeatResults={p20.perSeatResults}
              seatLabelMap={seatLabelMap}
              paramLabel="P20"
            />
          </BassParameterCard>
        </div>
      )}

      {!publicationVerified && (
        <div style={{
          marginTop: 16,
          padding: "8px 12px",
          borderRadius: 8,
          background: "#F5F4F1",
          border: "1px solid #D9D5CE",
          fontSize: 10,
          color: "#8A7B6A",
          fontFamily: BODY_FONT,
        }}>
          Bass results are pending verification. Values shown are provisional.
        </div>
      )}
    </div>
  );
}