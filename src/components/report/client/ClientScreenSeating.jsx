/**
 * ClientScreenSeating
 * -------------------
 * Client-facing RP23 Screen Size / Seating Position visual report page.
 *
 * Hierarchy: the seating plan drawing, then the RP23 result itself — seat pills
 * laid out in the same row/seat arrangement as the plan, with each seat's
 * viewing angle beneath its pill — then the short interpretation, the projector
 * light output, and last the level key as a small footnote. The result is the
 * page's statement; nothing else competes with it.
 *
 * Banded longitudinal viewing zones (L1|L2|L3|L4|L3|L2|L1) are drawn from the
 * SAME RP23 angle thresholds used by the live app. Per-seat levels come from
 * selectClientScreenSeating which uses rp23LevelForAngleDeg — the exact same
 * grading authority. This page is presentation only: it re-grades nothing.
 *
 * Uses the SAME room template as P1/P12/P13 pages (same SVG dimensions,
 * padding, coordinate mapping, seat markers, RSP marker).
 *
 * Works for both screen (card) and print (plain) contexts via the `print` prop.
 */

import React, { useMemo } from "react";
import { zoneLabelPosition, LEVEL_FILLS, LEVEL_LABEL_COLORS } from "./levelFills";
import { PositionMarker } from "./SeatMarker";
import { computeHaloRadiusPx, PRIMARY_STROKE_WIDTH } from "./seatMarkerGeometry";
import { resolveRspLabelPlacement } from "./ClientSpeakerBalance";
import { RP22_GRADE_TOKENS } from "@/components/utils/rp22Colors";
import RP22GradingPill from "@/components/ui/RP22GradingPill";
import { PROJECTOR_BASIS_COPY } from "@/components/report/projectorLumenRecommendation";
import ClientSeatResultRows from "./ClientSeatResultRows";
import { VIEWING_RESULT_HEADING } from "./viewingResultCopy";

const LEGEND_LEVELS = ["L1", "L2", "L3", "L4"];

// Maps zone.level keys from selectClientScreenSeating to canonical grade-token keys.
const ZONE_TOKEN = { l1: "L1", l2: "L2", l3: "L3", l4: "L4" };

export default function ClientScreenSeating({
  roomDims,
  seats,
  rows,
  rsp,
  screenFrontPlaneM,
  screenWidthM,
  zones,
  explanation,
  projectorLumens,
  print,
  printPart,
}) {
  const W = Number(roomDims?.widthM) || 4.5;
  const L = Number(roomDims?.lengthM) || 6.0;

  const { svgW, svgH, toPx } = useMemo(() => {
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
    return { svgW: SVG_W, svgH: SVG_H, toPx };
  }, [W, L]);

  const plotSeats = useMemo(
    () =>
      (Array.isArray(seats) ? seats : [])
        .map((s) => {
          const x = Number(s.x);
          const y = Number(s.y);
          if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
          return {
            id: s.id || `seat-${x.toFixed(2)}-${y.toFixed(2)}`,
            x,
            y,
            levelLabel: s.levelLabel,
            formatted: s.formatted,
            isPrimary: s.isPrimary === true,
          };
        })
        .filter(Boolean),
    [seats]
  );

  const rspX = Number(rsp?.x);
  const rspY = Number(rsp?.y);
  const rspValid = Number.isFinite(rspX) && Number.isFinite(rspY);
  const rspMatchesSeat =
    rspValid && plotSeats.some((s) => Math.abs(s.x - rspX) < 0.01 && Math.abs(s.y - rspY) < 0.01);
  const rspPx = rspValid ? toPx(rspX, rspY) : null;

  const screenY = Number(screenFrontPlaneM) || 0.2;
  const screenW = Number(screenWidthM) || 3;
  const screenLeftX = (W - screenW) / 2;
  const screenRightX = (W + screenW) / 2;
  const screenLeftPx = toPx(screenLeftX, screenY);
  const screenRightPx = toPx(screenRightX, screenY);

  const roomTopLeft = toPx(0, 0);
  const roomBottomRight = toPx(W, L);

  // Compute spacing-aware common halo radius from actual seat centres.
  const seatPointsPx = plotSeats.map((s) => toPx(s.x, s.y));
  const haloRadius = computeHaloRadiusPx(seatPointsPx);

  if (!rspValid || plotSeats.length === 0) return null;

  const showDrawing = !print || printPart !== "support";
  const showSupport = !print || printPart !== "drawing";

  const containerStyle = !print
    ? {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
        padding: 32,
        background: "#FFFFFF",
        borderRadius: 16,
        border: "1px solid #DCDBD6",
        boxShadow: "0 2px 12px rgba(0, 0, 0, 0.06)",
        fontFamily: "Didact Gothic, Century Gothic, sans-serif",
      }
    : printPart === "drawing"
    ? { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }
    : printPart === "support"
    ? { width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, fontFamily: "Didact Gothic, Century Gothic, sans-serif" }
    : { display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "0", width: "100%" };

  return (
    <div style={containerStyle}>
      {/* ── Heading hierarchy (screen only) ── */}
      {!print && (
        <div style={{ width: "100%", marginBottom: 8 }}>
          <h1
            style={{
              margin: 0,
              fontSize: 34,
              fontWeight: 300,
              color: "#213428",
              letterSpacing: "0.01em",
              fontFamily: "Futura PT Light, Century Gothic, sans-serif",
              textAlign: "center",
            }}
          >
            Viewing Experience
          </h1>
          <p
            style={{
              margin: "6px 0 0 0",
              fontSize: 12,
              color: "#625143",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              textAlign: "center",
              fontFamily: "Didact Gothic, Century Gothic, sans-serif",
            }}
          >
            RP23 — Screen Size &amp; Seating Position
          </p>
        </div>
      )}

      {showDrawing && (
        <svg
          viewBox={`0 0 ${svgW} ${svgH}`}
          className="client-report-print-svg"
          style={
            print && printPart === "drawing"
              ? { width: "100%", height: "100%", maxWidth: "100%", maxHeight: "100%" }
              : print
              ? { width: "100%", height: "auto", maxHeight: "none" }
              : { width: "100%", maxWidth: 600, height: "auto" }
          }
        >
        {/* Room background (area behind screen + any uncovered region) */}
        <rect
          x={roomTopLeft.px}
          y={roomTopLeft.py}
          width={roomBottomRight.px - roomTopLeft.px}
          height={roomBottomRight.py - roomTopLeft.py}
          fill="#F8F8F7"
          stroke="none"
        />

        {/* ── Banded RP23 viewing zones (longitudinal) ── */}
        {/* Below L1 zones are rendered with a subtle diluted fill and a clear
            outer boundary line, so the client can see where seats fall outside
            the minimum recommended (Level 1) viewing range. */}
        {(Array.isArray(zones) ? zones : []).map((zone) => {
          const yStart = Math.max(0, zone.yStart);
          const yEnd = Math.min(L, zone.yEnd);
          if (yEnd <= yStart) return null;
          const tl = toPx(0, yStart);
          const br = toPx(W, yEnd);
          const heightPx = br.py - tl.py;
          const isBelowL1 = zone.level === "below-l1";
          const tokenKey = ZONE_TOKEN[zone.level];
          const token = tokenKey ? RP22_GRADE_TOKENS[tokenKey] : null;
          const isL4 = zone.level === "l4";
          const zoneFill = isBelowL1
            ? LEVEL_FILLS["below-l1"]
            : isL4
            ? token.bg
            : "#F8F8F7";
          const zoneFillOpacity = isBelowL1 ? 1 : isL4 ? 0.35 : 1;
          const lineColor = isBelowL1
            ? RP22_GRADE_TOKENS.FAIL.border
            : token?.border || "#D9D5CE";
          const labelColor = isBelowL1
            ? LEVEL_LABEL_COLORS["below-l1"]
            : token?.text || "#3E4349";
          return (
            <g key={zone.key}>
              <rect
                x={tl.px}
                y={tl.py}
                width={br.px - tl.px}
                height={heightPx}
                fill={zoneFill}
                fillOpacity={zoneFillOpacity}
                stroke="none"
              />
              {/* Horizontal zone-transition line — the outer L1 limit for below-l1 zones */}
              <line
                x1={tl.px}
                y1={tl.py}
                x2={br.px}
                y2={tl.py}
                stroke={lineColor}
                strokeWidth={isBelowL1 ? 1.5 : 1}
              />
              {(() => {
                const fontSize = print ? 9 : 11;
                const pos = zoneLabelPosition(br.px, br.py, fontSize, heightPx);
                if (!pos) return null;
                return (
                  <text
                    x={pos.x}
                    y={pos.y}
                    fill={labelColor}
                    fontSize={fontSize}
                    textAnchor={pos.textAnchor}
                    fontFamily="Didact Gothic, Century Gothic, sans-serif"
                    letterSpacing="0.1em"
                    fontWeight={600}
                  >
                    {zone.label}
                  </text>
                );
              })()}
            </g>
          );
        })}

        {/* Room outline */}
        <rect
          x={roomTopLeft.px}
          y={roomTopLeft.py}
          width={roomBottomRight.px - roomTopLeft.px}
          height={roomBottomRight.py - roomTopLeft.py}
          fill="none"
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
          fontFamily="Didact Gothic, Century Gothic, sans-serif"
          letterSpacing="0.06em"
        >
          SCREEN
        </text>

        {/* ── Seats — compact spacing-aware position markers ── */}
        {plotSeats.map((seat) => {
          const sp = toPx(seat.x, seat.y);
          return (
            <PositionMarker
              key={seat.id}
              cx={sp.px}
              cy={sp.py}
              haloRadius={haloRadius}
              isPrimary={seat.isPrimary}
            />
          );
        })}

        {/* RSP marker — separate if not on a seat */}
        {rspPx && !rspMatchesSeat && (
          <g>
            <circle cx={rspPx.px} cy={rspPx.py} r={12} fill="none" stroke="#213428" strokeWidth={3} />
            <circle cx={rspPx.px} cy={rspPx.py} r={5} fill="#213428" />
          </g>
        )}

        {/* RSP label — placed above the seat marker with a clear gap */}
        {rspPx && (() => {
          const markerR = rspMatchesSeat ? (haloRadius + PRIMARY_STROKE_WIDTH) : 12;
          const seatCircles = plotSeats.map((s) => {
            const sp = toPx(s.x, s.y);
            return { cx: sp.px, cy: sp.py, r: haloRadius + PRIMARY_STROKE_WIDTH };
          });
          const placement = resolveRspLabelPlacement(rspPx, seatCircles, [], null, { w: svgW, h: svgH }, { markerRadius: markerR, labelGapPx: 24 });
          return (
            <text
              x={placement.x}
              y={placement.y}
              fill="#213428"
              fontSize={12}
              textAnchor={placement.anchor}
              dominantBaseline="middle"
              fontWeight={600}
              fontFamily="Didact Gothic, Century Gothic, sans-serif"
              letterSpacing="0.08em"
            >
              RSP
            </text>
          );
        })()}
      </svg>
      )}

      {showSupport && (<>
      {/* ── RP23 result — the statement this page exists to make, laid out in
             the same row/seat arrangement as the seating plan above ── */}
      <ClientSeatResultRows rows={rows} heading={VIEWING_RESULT_HEADING} print={print} />

      {/* ── Interpretation. On screen it sits with the result; the printed page
             carries it in the standard result region at the foot of the page. ── */}
      {!print && explanation && (
        <div
          style={{
            maxWidth: 640,
            textAlign: "center",
            fontSize: 13,
            lineHeight: 1.55,
            color: "#3E4349",
            fontFamily: "Didact Gothic, Century Gothic, sans-serif",
          }}
        >
          {explanation}
        </div>
      )}

      {/* ── Projector light output — below the viewing result ── */}
      {projectorLumens != null && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 3,
            padding: print ? "8px 20px" : "10px 24px",
            background: "#F8F8F7",
            borderRadius: 8,
            border: "1px solid #DCDBD6",
            fontFamily: "Didact Gothic, Century Gothic, sans-serif",
          }}
        >
          <div
            style={{
              fontSize: print ? 8.5 : 10,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#625143",
              fontWeight: 600,
            }}
          >
            Projector Light Output
          </div>
          <div
            style={{
              fontSize: print ? 11.5 : 14,
              color: "#3E4349",
              fontWeight: 500,
              textAlign: "center",
            }}
          >
            Minimum calibrated output:{" "}
            {projectorLumens.toLocaleString("en-GB")} lumens
          </div>
          <div style={{ fontSize: print ? 8.5 : 10, color: "#625143" }}>
            {PROJECTOR_BASIS_COPY}
          </div>
        </div>
      )}

      {/* ── Level key — a small footnote beneath the result, never the
             headline. Kept for reference only. ── */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          alignItems: "center",
          gap: print ? 8 : 12,
          fontFamily: "Didact Gothic, Century Gothic, sans-serif",
        }}
      >
        {LEGEND_LEVELS.map((lvl) => (
          <RP22GradingPill key={lvl} level={lvl} variant="printCompact" />
        ))}
        {/* Below L1 — custom swatch matching the diluted zone fill + dark border */}
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span
            style={{
              display: "inline-block",
              width: 22,
              height: 11,
              background: LEVEL_FILLS["below-l1"],
              border: `1px solid ${RP22_GRADE_TOKENS.FAIL.border}`,
              borderRadius: 3,
              boxSizing: "border-box",
            }}
          />
          <span
            style={{
              fontSize: print ? 8.5 : 10,
              color: LEVEL_LABEL_COLORS["below-l1"],
              fontFamily: "Didact Gothic, Century Gothic, sans-serif",
              fontWeight: 600,
              letterSpacing: "0.01em",
              whiteSpace: "nowrap",
            }}
          >
            Below L1
          </span>
        </div>
      </div>
      </>)}

    </div>
  );
}