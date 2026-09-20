/**
 * ClientBassResponse
 * -------------------
 * Visual Report PAGE 2 — Bass Response Across the Seats
 * (RP22 Parameters 19 & 20 — Response Quality and Seat Consistency)
 *
 * Shows a single shared room plan with every seat coloured by its achieved
 * P19 (upper halo) and P20 (lower halo) levels — the same two-segment seat
 * marker style used by the Timbre Matching page.
 *
 * Beneath the plan, a simple per-seat row shows the canonical P19 and P20
 * levels with raw ±dB as secondary small text.
 *
 * All data is consumed from the canonical bass authority — no local
 * re-grading. P20 uses its established no-FAIL presentation.
 */

import React from "react";
import { resolveRspLabelPlacement } from "./ClientSpeakerBalance";
import { getSeatGradeColors, PRIORITY_LEGEND, isAssessedLevel } from "./visualReportSeatStyle";
import SeatMarker from "./SeatMarker";
import {
  computeHaloRadiusPx,
  BASS_TWO_SEGMENT_LAYOUT,
  BASS_TWO_SEGMENT_LEGEND,
  PRIMARY_STROKE_WIDTH,
  buildRingSegmentPath,
} from "./seatMarkerGeometry";
import { resolveCoordinate } from "./selectClientSpeakerBalance";

const HEADING_FONT = "'Futura PT Light', 'Century Gothic', sans-serif";
const BODY_FONT = "'Didact Gothic', 'Century Gothic', sans-serif";

const RSP_RING_R = 8;
const RSP_DOT_R = 3;

// ── Level helpers ──

function levelToLabel(level) {
  if (level == null) return null;
  const normalized = String(level).trim().toUpperCase();
  if (normalized === "FAIL") return "FAIL";
  if (normalized === "N/A" || normalized === "NOT_APPLICABLE") return null;
  const n = Number(level);
  if (Number.isFinite(n) && n >= 1 && n <= 4) return `L${n}`;
  if (n === 0) return "FAIL";
  const match = String(level).match(/^L?([1-4])$/i);
  return match ? `L${match[1]}` : null;
}

// ── Build seat data from bass per-seat results + seating positions ──

function buildBassSeats(seatingPositions, p19PerSeat, p20PerSeat) {
  if (!Array.isArray(seatingPositions)) return [];

  const p19Map = new Map();
  if (Array.isArray(p19PerSeat)) {
    p19PerSeat.forEach((s) => {
      if (s?.seatId != null) p19Map.set(s.seatId, s);
    });
  }
  const p20Map = new Map();
  if (Array.isArray(p20PerSeat)) {
    p20PerSeat.forEach((s) => {
      if (s?.seatId != null) p20Map.set(s.seatId, s);
    });
  }

  return seatingPositions
    .filter((s) => {
      if (!s || s.id == null) return false;
      const x = resolveCoordinate(s.x, s.position?.x);
      const y = resolveCoordinate(s.y, s.position?.y);
      return x !== null && y !== null;
    })
    .map((s, i) => {
      const x = resolveCoordinate(s.x, s.position?.x);
      const y = resolveCoordinate(s.y, s.position?.y);
      const p19Result = p19Map.get(s.id);
      const p20Result = p20Map.get(s.id);
      return {
        id: s.id,
        label: s.label || `Seat ${i + 1}`,
        x,
        y,
        isPrimary: !!s.isPrimary,
        p19Level: p19Result ? levelToLabel(p19Result.level) : null,
        p20Level: p20Result ? levelToLabel(p20Result.level) : null,
        p19VariationDb: p19Result?.variationDbRaw != null && Number.isFinite(Number(p19Result.variationDbRaw))
          ? Number(p19Result.variationDbRaw) : null,
        p20VariationDb: p20Result?.variationDbRaw != null && Number.isFinite(Number(p20Result.variationDbRaw))
          ? Number(p20Result.variationDbRaw) : null,
      };
    });
}

// ── Summary sentence ──

function buildSummarySentence(seats) {
  const assessed = seats.filter((s) => s.p19Level || s.p20Level);
  if (assessed.length === 0) return null;

  const primarySeats = assessed.filter((s) => s.isPrimary);
  const secondarySeats = assessed.filter((s) => !s.isPrimary);

  if (assessed.length <= 1) {
    return "Bass response is assessed at the reference seating position.";
  }

  // Compare primary vs secondary P19 levels
  const primaryP19Levels = primarySeats.map((s) => s.p19Level).filter(Boolean);
  const secondaryP19Levels = secondarySeats.map((s) => s.p19Level).filter(Boolean);

  if (primaryP19Levels.length > 0 && secondaryP19Levels.length > 0) {
    const primaryBest = primaryP19Levels.every((l) => l === "L4" || l === "L3");
    const secondaryWorse = secondaryP19Levels.some((l) => l === "L1" || l === "L2" || l === "FAIL");
    if (primaryBest && secondaryWorse) {
      return "Bass response is most consistent around the reference seating area, with greater variation toward the outer seats.";
    }
  }

  // Check if all seats are similar
  const allP19 = assessed.map((s) => s.p19Level).filter(Boolean);
  const allP20 = assessed.map((s) => s.p20Level).filter(Boolean);
  if (allP19.length > 0 && allP20.length > 0) {
    const p19Set = new Set(allP19);
    const p20Set = new Set(allP20);
    if (p19Set.size <= 1 && p20Set.size <= 1) {
      return "Bass response remains consistent across the seating area.";
    }
  }

  return "Bass response varies across the seating area as shown above.";
}

// ── Per-seat level badge ──

function SeatLevelBadge({ level, strong }) {
  if (!level) {
    return <span style={{ color: "#C1B6AD", fontSize: 11, fontFamily: BODY_FONT }}>—</span>;
  }
  const grade = getSeatGradeColors(level);
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 4,
        fontSize: 11,
        fontWeight: strong ? 700 : 600,
        background: grade.fill,
        color: grade.text,
        border: `1px solid ${grade.border}`,
        letterSpacing: "0.02em",
        whiteSpace: "nowrap",
        fontFamily: BODY_FONT,
      }}
    >
      {level}
    </span>
  );
}

// ── Main component ──

export default function ClientBassResponse({
  bassPerformance,
  roomDims,
  seatingPositions,
  rsp,
  screenFrontPlaneM,
  screenWidthM,
  print,
  printPart,
}) {
  if (!bassPerformance) return null;

  const { p19, p20, seatLabelMap } = bassPerformance;

  // NOT CALCULATED guard — screen only. In print mode, the print content
  // component (PrintBassResponseContent) handles the NOT CALCULATED state
  // at the page level to avoid duplicate headings.
  const hasP19 = p19 && isAssessedLevel(p19.achievedLevel);
  const hasP20 = p20 && isAssessedLevel(p20.achievedLevel);
  if (!hasP19 && !hasP20 && !print) {
    return (
      <div style={{
        background: "#FFFFFF",
        borderRadius: 16,
        padding: "48px 40px",
        border: "1px solid #DCDBD6",
        boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
        textAlign: "center",
        fontFamily: BODY_FONT,
      }}>
        <h1 style={{
          margin: 0,
          fontSize: 34,
          fontWeight: 300,
          color: "#213428",
          fontFamily: HEADING_FONT,
          textAlign: "center",
        }}>
          Bass Performance
        </h1>
        <p style={{
          margin: "6px 0 32px 0",
          fontSize: 12,
          color: "#625143",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          textAlign: "center",
        }}>
          RP22 Parameters 19 &amp; 20 — Response Quality and Seat Consistency
        </p>
        <div style={{
          fontSize: 16,
          color: "#8A8580",
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
  // Print mode with no assessed P19/P20 — return null (print content handles it)
  if (!hasP19 && !hasP20 && print) return null;

  const seats = buildBassSeats(
    seatingPositions,
    p19?.perSeatResults,
    p20?.perSeatResults
  );

  if (seats.length === 0) return null;

  // Room geometry
  const W = Number(roomDims?.widthM) || 4.5;
  const L = Number(roomDims?.lengthM) || 6.0;
  const PADDING_M = 0.6;
  const totalW = W + PADDING_M * 2;
  const totalL = L + PADDING_M * 2;
  const SVG_W = 760;
  const SVG_H = Math.round(SVG_W * (totalL / totalW));
  const SCALE = SVG_W / totalW;

  const toPx = (x, y) => ({
    px: (x + PADDING_M) * SCALE,
    py: (y + PADDING_M) * SCALE,
  });

  const seatPointsPx = seats.map((seat) => toPx(seat.x, seat.y));
  const haloRadius = computeHaloRadiusPx(seatPointsPx);

  // Screen geometry
  const screenY = Number(screenFrontPlaneM) || 0.2;
  const screenW = Number(screenWidthM) || 3;
  const screenLeftX = (W - screenW) / 2;
  const screenRightX = (W + screenW) / 2;
  const screenLeftPx = toPx(screenLeftX, screenY);
  const screenRightPx = toPx(screenRightX, screenY);

  const roomTopLeft = toPx(0, 0);
  const roomBottomRight = toPx(W, L);

  // RSP
  const rspX = Number(rsp?.x);
  const rspY = Number(rsp?.y);
  const rspValid = Number.isFinite(rspX) && Number.isFinite(rspY);
  const rspPx = rspValid ? toPx(rspX, rspY) : null;

  // Summary
  const summary = buildSummarySentence(seats);

  // Physical row grouping for per-seat display
  const ROW_TOLERANCE_M = 0.05;
  const sortedByY = [...seats].sort((a, b) => a.y - b.y);
  const clusters = [];
  for (const seat of sortedByY) {
    const last = clusters[clusters.length - 1];
    if (last && Math.abs(seat.y - last.y) <= ROW_TOLERANCE_M) {
      last.seats.push(seat);
    } else {
      clusters.push({ y: seat.y, seats: [seat] });
    }
  }
  const matrixRows = clusters.map((cluster, idx) => {
    const sortedByX = cluster.seats.sort((a, b) => a.x - b.x);
    return {
      rowIndex: idx + 1,
      seats: sortedByX.map((s, i) => ({ ...s, seatNumber: i + 1 })),
    };
  });

  const showDrawing = !print || printPart !== "support";
  const showSupport = !print || printPart !== "drawing";

  const containerStyle = !print
    ? {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
        padding: "32px 36px",
        background: "#FFFFFF",
        borderRadius: 16,
        border: "1px solid #DCDBD6",
        boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
        fontFamily: BODY_FONT,
      }
    : printPart === "drawing"
    ? { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }
    : printPart === "support"
    ? { width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "0 16px", fontFamily: BODY_FONT }
    : { display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "8px 16px", width: "100%", height: "100%", fontFamily: BODY_FONT };

  return (
    <div style={containerStyle}>
      {/* ── Heading hierarchy (screen only) ── */}
      {!print && (
        <div style={{ width: "100%", marginBottom: 8 }}>
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
            margin: "6px 0 0 0",
            fontSize: 12,
            color: "#625143",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            textAlign: "center",
            fontFamily: BODY_FONT,
          }}>
            RP22 Parameters 19 &amp; 20 — Response Quality and Seat Consistency
          </p>
        </div>
      )}

      {showDrawing && (
        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          className="client-report-print-svg"
          style={print && printPart === "drawing"
            ? { width: "100%", height: "100%", maxWidth: "100%", maxHeight: "100%", display: "block" }
            : print
            ? { width: "100%", height: "100%", maxHeight: "none", display: "block" }
            : { width: "100%", maxWidth: 760, height: "auto" }
          }
        >
          {/* Room outline */}
          <rect
            x={roomTopLeft.px}
            y={roomTopLeft.py}
            width={roomBottomRight.px - roomTopLeft.px}
            height={roomBottomRight.py - roomTopLeft.py}
            fill="#F8F8F7"
            stroke="#625143"
            strokeWidth={2}
          />

          {/* Screen */}
          <line
            x1={screenLeftPx.px}
            y1={screenLeftPx.py}
            x2={screenRightPx.px}
            y2={screenRightPx.py}
            stroke="#3E4349"
            strokeWidth={5}
          />
          <text
            x={(screenLeftPx.px + screenRightPx.px) / 2}
            y={screenLeftPx.py - 10}
            fill="#625143"
            fontSize={11}
            textAnchor="middle"
            fontFamily={BODY_FONT}
            letterSpacing="0.06em"
          >
            SCREEN
          </text>

          {/* Seat markers — two-segment halo: UPPER = P19, LOWER = P20 */}
          {seats.map((seat) => {
            const sp = toPx(seat.x, seat.y);
            const segments = BASS_TWO_SEGMENT_LAYOUT.map((seg) => ({
              key: seg.key,
              level: seat[`${seg.key}Level`],
              startAngle: seg.startAngle,
              endAngle: seg.endAngle,
            }));
            return (
              <SeatMarker
                key={seat.id}
                cx={sp.px}
                cy={sp.py}
                haloRadius={haloRadius}
                isPrimary={seat.isPrimary}
                segments={segments}
              />
            );
          })}

          {/* RSP marker */}
          {rspPx && (() => {
            const seatCircles = seats.map((seat) => {
              const sp = toPx(seat.x, seat.y);
              return { cx: sp.px, cy: sp.py, r: haloRadius + PRIMARY_STROKE_WIDTH };
            });
            const screenCx = (screenLeftPx.px + screenRightPx.px) / 2;
            const screenRect = {
              x1: Math.min(screenLeftPx.px, screenCx - 25),
              y1: screenLeftPx.py - 22,
              x2: Math.max(screenRightPx.px, screenCx + 25),
              y2: screenLeftPx.py + 3,
            };
            const placement = resolveRspLabelPlacement(rspPx, seatCircles, [], screenRect, { w: SVG_W, h: SVG_H }, { markerRadius: haloRadius + PRIMARY_STROKE_WIDTH });
            return (
              <g>
                <circle cx={rspPx.px} cy={rspPx.py} r={RSP_RING_R} fill="none" stroke="#213428" strokeWidth={2.5} />
                <circle cx={rspPx.px} cy={rspPx.py} r={RSP_DOT_R} fill="#213428" />
                <text
                  x={placement.x}
                  y={placement.y}
                  fill="#213428"
                  fontSize={12}
                  textAnchor={placement.anchor}
                  dominantBaseline="middle"
                  fontWeight={600}
                  fontFamily={BODY_FONT}
                  letterSpacing="0.08em"
                >
                  RSP
                </text>
              </g>
            );
          })()}
        </svg>
      )}

      {showSupport && (
        <>
          {/* ── Priority + segment-position key ── */}
          <div style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            padding: "12px 16px",
            background: "#F1F0EE",
            borderRadius: 8,
            border: "1px solid #DCDBD6",
            width: "100%",
            maxWidth: print ? "100%" : 600,
            fontFamily: BODY_FONT,
          }}>
            {/* Priority */}
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 16 }}>
              {PRIORITY_LEGEND.map((entry) => (
                <div key={entry.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <svg width={20} height={20} viewBox="0 0 20 20">
                    <circle
                      cx={10}
                      cy={10}
                      r={8}
                      fill="none"
                      stroke={entry.stroke}
                      strokeWidth={entry.strokeWidth}
                    />
                  </svg>
                  <span style={{ fontSize: 12, color: "#3E4349", letterSpacing: "0.02em" }}>
                    {entry.label}
                  </span>
                </div>
              ))}
            </div>
            {/* Divider */}
            <div style={{ height: 1, background: "#DCDBD6", width: "100%" }} />
            {/* Segment position key */}
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 14 }}>
              {BASS_TWO_SEGMENT_LEGEND.map((entry) => {
                const seg = BASS_TWO_SEGMENT_LAYOUT.find((s) => s.key === entry.key);
                return (
                  <div key={entry.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <svg width={18} height={18} viewBox="0 0 20 20">
                      <circle cx={10} cy={10} r={3} fill="#625143" stroke="#F8F8F7" strokeWidth={0.8} />
                      {seg && (
                        <path
                          d={buildRingSegmentPath(10, 10, 6.5, 8, seg.startAngle, seg.endAngle)}
                          fill="#625143"
                          stroke="none"
                        />
                      )}
                    </svg>
                    <span style={{ fontSize: 11, color: "#3E4349", letterSpacing: "0.02em" }}>
                      {entry.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Per-seat P19/P20 levels ── */}
          {matrixRows.length > 0 && (
            <div style={{
              width: "100%",
              maxWidth: print ? "100%" : 600,
              fontFamily: BODY_FONT,
            }}>
              {matrixRows.map((row) => (
                <div key={row.rowIndex} style={{ marginBottom: matrixRows.length > 1 ? 14 : 0 }}>
                  <div style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#213428",
                    marginBottom: 6,
                    letterSpacing: "0.02em",
                  }}>
                    Row {row.rowIndex}
                  </div>
                  <table style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: 11,
                    tableLayout: "fixed",
                  }}>
                    <thead>
                      <tr>
                        <th style={{ padding: "4px 6px", textAlign: "left", width: 100 }}></th>
                        {row.seats.map((seat) => (
                          <th key={seat.id} style={{
                            padding: "4px 6px",
                            textAlign: "center",
                            color: "#213428",
                            fontWeight: seat.isPrimary ? 700 : 400,
                            borderBottom: seat.isPrimary ? "2px solid #213428" : "1px solid #DCDBD6",
                            fontSize: 11,
                            letterSpacing: "0.02em",
                          }}>
                            Seat {seat.seatNumber}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ padding: "4px 6px", color: "#625143", fontSize: 11, letterSpacing: "0.02em" }}>
                          P19 Response
                        </td>
                        {row.seats.map((seat) => (
                          <td key={seat.id} style={{ padding: "4px 6px", textAlign: "center", borderBottom: "1px solid #DCDBD6" }}>
                            <SeatLevelBadge level={seat.p19Level} strong={seat.isPrimary} />
                            {seat.p19VariationDb != null && (
                              <div style={{ fontSize: 9, color: "#8A7B6A", marginTop: 2 }}>
                                ±{Math.abs(seat.p19VariationDb).toFixed(1)} dB
                              </div>
                            )}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td style={{ padding: "4px 6px", color: "#625143", fontSize: 11, letterSpacing: "0.02em" }}>
                          P20 Consistency
                        </td>
                        {row.seats.map((seat) => (
                          <td key={seat.id} style={{ padding: "4px 6px", textAlign: "center", borderBottom: "1px solid #DCDBD6" }}>
                            <SeatLevelBadge level={seat.p20Level} strong={seat.isPrimary} />
                            {seat.p20VariationDb != null && (
                              <div style={{ fontSize: 9, color: "#8A7B6A", marginTop: 2 }}>
                                ±{Math.abs(seat.p20VariationDb).toFixed(1)} dB
                              </div>
                            )}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Summary callout (screen only — print renders in result region) ── */}
      {!print && summary && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "16px 20px",
          background: "#F1F0EE",
          borderRadius: 12,
          border: "1px solid #DCDBD6",
          width: "100%",
          fontFamily: BODY_FONT,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#213428", marginBottom: 4, fontFamily: HEADING_FONT }}>
              Bass Response Across the Seats
            </div>
            <div style={{ fontSize: 13, color: "#3E4349", lineHeight: 1.5 }}>
              {summary}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}