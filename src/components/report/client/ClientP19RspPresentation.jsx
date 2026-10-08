/**
 * ClientP19RspPresentation
 * ------------------------
 * Visual Report PAGE — P19 Bass Response at RSP.
 *
 * P19 is assessed at the Reference Seating Position only. This page presents
 * that single result — level, deviation from target and what it means — and
 * states plainly that seat-to-seat bass consistency is a separate parameter
 * (P20). It never presents an all-seat P19 grid: P19 has no per-seat result,
 * so showing one would only produce a grid of dashes.
 *
 * The page also carries the P19 evidence graph — the corrected (post-EQ) RSP
 * response against the target across the P19 assessment band — built from the
 * saved completed bass contract by the shared P19 graph authority. When that
 * evidence is unavailable the page states so plainly instead of rendering
 * blank or substituting another curve.
 *
 * All values are read from the published bass authority. Nothing is
 * recalculated here.
 */

import React from "react";
import P19RspGraphContent from "@/components/report/P19RspGraphContent";
import { formatP19P20DeviationText } from "@/components/utils/rp22/resolveRp22DesignValue";
import { resolveRspLabelPlacement } from "./ClientSpeakerBalance";
import { resolveCoordinate } from "./selectClientSpeakerBalance";
import { getSeatGradeColors, PRIORITY_LEGEND } from "./visualReportSeatStyle";
import { PositionMarker } from "./SeatMarker";
import RspReferenceMarker, { RSP_TICK_R } from "./RspReferenceMarker";
import { computeHaloRadiusPx, PRIMARY_STROKE_WIDTH } from "./seatMarkerGeometry";
// Seat PRIORITY is the designer's Primary/Secondary classification. It is NOT
// the internal RSP / MLP flag, which marks the single reference seat: the plan
// below must never present the reference seat as the only primary seat.
import { resolveSeatPriority, PRIMARY } from "@/components/utils/seatPriorityAuthority";

import {
  REPORT_FONT_HEADING as FONT_HEADING,
  REPORT_FONT_BODY as FONT_BODY,
} from "@/components/report/typography/reportTypography";

const COLORS = {
  cardBg: "#FFFFFF",
  primary: "#213428",
  body: "#3E4349",
  secondary: "#625143",
  border: "#DCDBD6",
  muted: "#8A7B6A",
  seat: "#625143",
};

const SCOPE_STATEMENT =
  "P19 is assessed at the Reference Seating Position only. Seat-to-seat bass consistency is assessed separately under P20.";

const LEVEL_INTERPRETATION = {
  L4: "At the reference seat the bass response follows the target curve closely across the assessed band — deep, even bass with no region that stands out.",
  L3: "The bass at the reference seat stays close to the target curve, with only minor deviation in one region of the band.",
  L2: "The bass response at the reference seat is controlled, but one region departs from the target curve enough to be audible on demanding material.",
  L1: "The response at the reference seat shows a clear deviation from the target curve. Calibration is doing useful work, but the seat still benefits from a design change.",
  FAIL: "The response at the reference seat departs from the target curve beyond the P19 window. A design change is required before calibration can resolve it.",
};

function levelToLabel(level) {
  if (level == null) return null;
  const normalized = String(level).trim().toUpperCase();
  if (normalized === "FAIL") return "FAIL";
  if (normalized === "N/A" || normalized === "NOT_APPLICABLE") return null;
  const match = normalized.match(/^L?([1-4])$/);
  return match ? `L${match[1]}` : null;
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

// The single RSP result: the published RSP P19 authority. P19 has no per-seat
// result, so the legacy per-seat rows are only consulted when the published RSP
// row is absent.
function resolveRspResult(bassPerformance) {
  const published = bassPerformance?.p19?.rspResult || null;
  if (published) {
    const publishedLevel = levelToLabel(published.level);
    if (!publishedLevel) return null;
    return {
      level: publishedLevel,
      deviationDb: finiteOrNull(published.deviationDb),
      displayedValue: published.displayedValue || null,
      worstFrequencyHz: finiteOrNull(published.worstFrequencyHz),
    };
  }
  const rows = bassPerformance?.p19?.perSeatResults;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const primary = rows.find((row) => row?.priority === "primary") || rows[0];
  const level = levelToLabel(primary?.level) || levelToLabel(bassPerformance?.p19?.achievedLevel);
  if (!level) return null;
  return {
    level,
    deviationDb: finiteOrNull(primary?.variationDbRaw),
    displayedValue: primary?.displayedValue || null,
    worstFrequencyHz: finiteOrNull(primary?.worstFrequencyHz),
  };
}

export default function ClientP19RspPresentation({
  bassPerformance,
  p19Graph = null,
  roomDims,
  seatingPositions,
  rsp,
  screenFrontPlaneM,
  screenWidthM,
  subwooferInstances,
  print,
  printPart,
}) {
  const result = resolveRspResult(bassPerformance);
  if (!result) return null;

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

  const screenY = Number(screenFrontPlaneM) || 0.2;
  const screenW = Number(screenWidthM) || 3;
  const screenLeftPx = toPx((W - screenW) / 2, screenY);
  const screenRightPx = toPx((W + screenW) / 2, screenY);
  const roomTopLeft = toPx(0, 0);
  const roomBottomRight = toPx(W, L);

  // Every seat carries its own priority group, so all primary seats are drawn
  // as primary — never just the one seat that happens to hold the RSP flag.
  const seatPoints = (Array.isArray(seatingPositions) ? seatingPositions : [])
    .map((seat, index) => {
      const x = resolveCoordinate(seat?.x, seat?.position?.x);
      const y = resolveCoordinate(seat?.y, seat?.position?.y);
      if (x === null || y === null) return null;
      return {
        id: seat?.id || `seat-${index}`,
        isPrimary: resolveSeatPriority(seat) === PRIMARY,
        ...toPx(x, y),
      };
    })
    .filter(Boolean);

  const haloRadius = computeHaloRadiusPx(seatPoints.map((seat) => ({ px: seat.px, py: seat.py })));

  const rspX = Number(rsp?.x);
  const rspY = Number(rsp?.y);
  const rspPx = Number.isFinite(rspX) && Number.isFinite(rspY) ? toPx(rspX, rspY) : null;

  const subPositions = (Array.isArray(subwooferInstances) ? subwooferInstances : [])
    .filter((sub) => sub && sub.enabled !== false && sub.position)
    .map((sub) => ({
      id: sub.id,
      ...toPx(Number(sub.position.x) || 0, Number(sub.position.y) || 0),
    }));

  const grade = getSeatGradeColors(result.level);
  const interpretation = LEVEL_INTERPRETATION[result.level] || null;
  // P19 deviation shown to the client is a whole number, rounded down.
  const deviationText = result.displayedValue
    || (result.deviationDb != null ? formatP19P20DeviationText(result.deviationDb) : null);

  const showDrawing = !print || printPart !== "result";
  const showResult = !print || printPart !== "drawing";

  const containerStyle = !print
    ? {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
        padding: "32px 36px",
        background: COLORS.cardBg,
        borderRadius: 16,
        border: `1px solid ${COLORS.border}`,
        boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
        fontFamily: FONT_BODY,
      }
    : printPart === "drawing"
    ? { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }
    : { width: "100%", display: "flex", flexDirection: "column", gap: 10, padding: "0 16px", fontFamily: FONT_BODY };

  return (
    <div style={containerStyle}>
      {!print && (
        <div style={{ width: "100%", marginBottom: 4 }}>
          <h2 style={{
            margin: 0,
            fontSize: 26,
            fontWeight: 300,
            color: COLORS.primary,
            letterSpacing: "0.01em",
            fontFamily: FONT_HEADING,
            textAlign: "center",
          }}>
            P19 Bass Response at RSP
          </h2>
          <p style={{
            margin: "8px 0 0 0",
            fontSize: 13,
            color: COLORS.body,
            textAlign: "center",
            fontFamily: FONT_BODY,
            maxWidth: 620,
            marginLeft: "auto",
            marginRight: "auto",
            lineHeight: 1.55,
          }}>
            {SCOPE_STATEMENT}
          </p>
        </div>
      )}

      {showDrawing && (
        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          className="client-report-print-svg"
          style={print && printPart === "drawing"
            ? { width: "100%", height: "100%", maxWidth: "100%", maxHeight: "100%", display: "block" }
            : { width: "100%", maxWidth: 620, height: "auto" }
          }
        >
          <rect
            x={roomTopLeft.px}
            y={roomTopLeft.py}
            width={roomBottomRight.px - roomTopLeft.px}
            height={roomBottomRight.py - roomTopLeft.py}
            fill="#FAFAF8"
            stroke={COLORS.secondary}
            strokeWidth={2}
          />

          <line
            x1={screenLeftPx.px}
            y1={screenLeftPx.py}
            x2={screenRightPx.px}
            y2={screenRightPx.py}
            stroke={COLORS.body}
            strokeWidth={5}
          />
          <text
            x={(screenLeftPx.px + screenRightPx.px) / 2}
            y={screenLeftPx.py - 10}
            fill={COLORS.secondary}
            fontSize={11}
            textAnchor="middle"
            fontFamily={FONT_BODY}
            letterSpacing="0.06em"
          >
            SCREEN
          </text>

          {subPositions.map((sub) => (
            <rect
              key={sub.id}
              x={sub.px - 5}
              y={sub.py - 5}
              width={10}
              height={10}
              fill={COLORS.primary}
              stroke="#FFFFFF"
              strokeWidth={1.5}
              rx={1.5}
            />
          ))}

          {/* Seats — position and priority. P19 has no per-seat result, so no
              grade is shown on any seat here; seat-to-seat results live on the
              P20 page. Every primary seat carries the bold keyline, so the
              reference marker can never be read as the only primary seat. */}
          {seatPoints.map((seat) => (
            <PositionMarker
              key={seat.id}
              cx={seat.px}
              cy={seat.py}
              haloRadius={haloRadius}
              isPrimary={seat.isPrimary}
            />
          ))}

          {rspPx && (() => {
            const seatCircles = seatPoints.map((seat) => ({
              cx: seat.px,
              cy: seat.py,
              r: haloRadius + PRIMARY_STROKE_WIDTH,
            }));
            const screenCx = (screenLeftPx.px + screenRightPx.px) / 2;
            const screenRect = {
              x1: Math.min(screenLeftPx.px, screenCx - 25),
              y1: screenLeftPx.py - 22,
              x2: Math.max(screenRightPx.px, screenCx + 25),
              y2: screenLeftPx.py + 3,
            };
            const placement = resolveRspLabelPlacement(
              rspPx,
              seatCircles,
              [],
              screenRect,
              { w: SVG_W, h: SVG_H },
              { markerRadius: RSP_TICK_R },
            );
            return (
              <g>
                <RspReferenceMarker cx={rspPx.px} cy={rspPx.py} />
                <text
                  x={placement.x}
                  y={placement.y}
                  fill={COLORS.primary}
                  fontSize={12}
                  textAnchor={placement.anchor}
                  dominantBaseline="middle"
                  fontWeight={600}
                  fontFamily={FONT_BODY}
                  letterSpacing="0.08em"
                >
                  RSP
                </text>
              </g>
            );
          })()}
        </svg>
      )}

      {showResult && (
        <>
          {/* ── The single RSP result ── */}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: "16px 20px",
            background: "#F1F0EE",
            border: `1px solid ${COLORS.border}`,
            borderLeft: `4px solid ${COLORS.primary}`,
            borderRadius: 8,
            width: "100%",
            maxWidth: print ? "100%" : 620,
            fontFamily: FONT_BODY,
          }}>
            <div style={{
              flexShrink: 0,
              minWidth: 46,
              textAlign: "center",
              padding: "6px 8px",
              borderRadius: 6,
              border: `1px solid ${grade.border}`,
              background: grade.fill,
              color: grade.text,
              fontFamily: FONT_HEADING,
              fontSize: 18,
            }}>
              {result.level}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.primary, lineHeight: 1.4 }}>
                P19 Bass Response at RSP
              </div>
              <div style={{ fontSize: 12, color: COLORS.body, lineHeight: 1.5, marginTop: 2 }}>
                {deviationText
                  ? `${deviationText} from the target response at the reference seating position.`
                  : "Measured against the target response at the reference seating position."}
              </div>
              {result.worstFrequencyHz != null && (
                <div style={{ fontSize: 11, color: COLORS.muted, lineHeight: 1.5, marginTop: 2 }}>
                  Largest deviation at {Math.round(result.worstFrequencyHz)} Hz.
                </div>
              )}
            </div>
          </div>

          {/* ── The P19 evidence: the corrected (post-EQ) RSP response plotted
              against the target across the P19 assessment band. When that saved
              evidence is unavailable the graph states so plainly — it is never
              replaced by the room/layout response or left blank. ── */}
          <div style={{ width: "100%", maxWidth: print ? "100%" : 620 }}>
            <P19RspGraphContent graph={p19Graph} chartId="client-p19-rsp-graph" />
          </div>

          {/* ── Target ── */}
          <div style={{
            width: "100%",
            maxWidth: print ? "100%" : 620,
            background: COLORS.cardBg,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 8,
            padding: "12px 16px",
            fontFamily: FONT_BODY,
          }}>
            <div style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: COLORS.muted,
              marginBottom: 4,
            }}>
              Target
            </div>
            <div style={{ fontSize: 12, color: COLORS.body, lineHeight: 1.55 }}>
              The reference response curve at the reference seating position, assessed across the P19
              bass band after calibration.
            </div>
          </div>

          {/* ── Interpretation ── */}
          {interpretation && (
            <p style={{
              margin: 0,
              width: "100%",
              maxWidth: print ? "100%" : 620,
              fontSize: 12,
              color: COLORS.body,
              lineHeight: 1.55,
              fontFamily: FONT_BODY,
            }}>
              {interpretation}
            </p>
          )}

          {/* ── Scope statement (print needs it too) ── */}
          <p style={{
            margin: 0,
            width: "100%",
            maxWidth: print ? "100%" : 620,
            fontSize: 11,
            color: COLORS.secondary,
            lineHeight: 1.5,
            fontFamily: FONT_BODY,
          }}>
            {SCOPE_STATEMENT}
          </p>

          {/* ── Priority + reference key ── */}
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 16 }}>
            {PRIORITY_LEGEND.map((entry) => (
              <div key={entry.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <svg width={18} height={18} viewBox="0 0 20 20">
                  <circle cx={10} cy={10} r={7} fill="none" stroke={entry.stroke} strokeWidth={entry.strokeWidth} />
                </svg>
                <span style={{ fontSize: 11, color: COLORS.body, letterSpacing: "0.02em", fontFamily: FONT_BODY }}>
                  {entry.label}
                </span>
              </div>
            ))}
            {/* The reference position is a reference POINT, not a seat — its own
                glyph, so it is never read as a Primary seat. */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <svg width={18} height={18} viewBox="0 0 20 20">
                <RspReferenceMarker cx={10} cy={10} ringR={6} dotR={2} tickR={8.5} strokeWidth={1.8} />
              </svg>
              <span style={{ fontSize: 11, color: COLORS.body, letterSpacing: "0.02em", fontFamily: FONT_BODY }}>
                Reference position (RSP)
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}