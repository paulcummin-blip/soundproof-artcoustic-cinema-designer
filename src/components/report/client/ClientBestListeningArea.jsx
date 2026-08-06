/**
 * ClientBestListeningArea
 * ------------------------
 * Shared SVG plan component for the Best Listening Area Visual Report page
 * (RP22 Parameters 4, 6 & 10 — Listening Quality Across the Seats).
 *
 * Renders a simple client-facing room-plan visual showing:
 *   - room outline
 *   - screen
 *   - real seats with broad translucent category-coloured zones
 *   - effective RSP as a separate reference marker (no classification)
 *   - a simple category key (only categories that exist in the project)
 *   - a concise count summary with correct singular/plural wording
 *
 * Does NOT show P4/P6/P10 badges, L-level text, dB values, parameter values,
 * technical seat IDs, coverage cones, or interpolated contours.
 *
 * Works for both screen (card) and print (plain) contexts via the `print` prop.
 * This is the single shared drawing component for both screen and PDF.
 */

import React from "react";
import { resolveRspLabelPlacement } from "./ClientSpeakerBalance";

// ── Category visual styles ──
// Restrained brand-aligned palette — no bright traffic-light colours.
// Shape/border treatment supplements colour for accessibility.
const CATEGORY_STYLES = {
  primary: {
    fill: "rgba(33, 52, 40, 0.28)",
    stroke: "#213428",
    strokeWidth: 2.5,
    dasharray: "none",
    dotFill: "#213428",
    dotStroke: "#F8F8F7",
  },
  good: {
    fill: "rgba(33, 52, 40, 0.12)",
    stroke: "#3E4349",
    strokeWidth: 2,
    dasharray: "none",
    dotFill: "#3E4349",
    dotStroke: "#F8F8F7",
  },
  acceptable: {
    fill: "rgba(98, 81, 67, 0.14)",
    stroke: "#625143",
    strokeWidth: 2,
    dasharray: "none",
    dotFill: "#625143",
    dotStroke: "#F8F8F7",
  },
  improvement: {
    fill: "rgba(74, 35, 15, 0.18)",
    stroke: "#4A230F",
    strokeWidth: 2,
    dasharray: "none",
    dotFill: "#4A230F",
    dotStroke: "#F8F8F7",
  },
  not_assessed: {
    fill: "rgba(193, 182, 173, 0.08)",
    stroke: "#C1B6AD",
    strokeWidth: 1.5,
    dasharray: "4 3",
    dotFill: "#C1B6AD",
    dotStroke: "#F8F8F7",
  },
};

// Category display order for key and counts
const CATEGORY_ORDER = ["primary", "good", "acceptable", "improvement", "not_assessed"];
const CATEGORY_LABELS = {
  primary: "Primary seating",
  good: "Good seating",
  acceptable: "Secondary seating",
  improvement: "Improvement recommended",
  not_assessed: "Not assessed",
};
const CATEGORY_COUNT_LABELS = {
  primary: "Primary",
  good: "Good",
  acceptable: "Secondary",
  improvement: "Improvement recommended",
  not_assessed: "Not assessed",
};

// Seat zone radius in meters (broad translucent halo)
const ZONE_RADIUS_M = 0.55;

// RSP marker geometry — same as ClientSpeakerBalance
const RSP_RING_R = 8;
const RSP_DOT_R = 3;
const RSP_LABEL_W = 30;
const RSP_LABEL_H = 14;

export default function ClientBestListeningArea({
  roomDims,
  seats,
  rsp,
  screenFrontPlaneM,
  screenWidthM,
  counts,
  explanation,
  print,
}) {
  const W = Number(roomDims?.widthM) || 4.5;
  const L = Number(roomDims?.lengthM) || 6.0;

  const PADDING_M = 0.6;
  const totalW = W + PADDING_M * 2;
  const totalL = L + PADDING_M * 2;
  const SVG_W = 760;
  const SVG_H = Math.round(SVG_W * (totalL / totalW));
  const SCALE = SVG_W / totalW;
  const ZONE_R_PX = ZONE_RADIUS_M * SCALE;

  const toPx = (x, y) => ({
    px: (x + PADDING_M) * SCALE,
    py: (y + PADDING_M) * SCALE,
  });

  // Screen geometry (same authority as ClientSpeakerBalance)
  const screenY = Number(screenFrontPlaneM) || 0.2;
  const screenW = Number(screenWidthM) || 3;
  const screenLeftX = (W - screenW) / 2;
  const screenRightX = (W + screenW) / 2;
  const screenLeftPx = toPx(screenLeftX, screenY);
  const screenRightPx = toPx(screenRightX, screenY);

  const roomTopLeft = toPx(0, 0);
  const roomBottomRight = toPx(W, L);

  // RSP validity
  const rspX = Number(rsp?.x);
  const rspY = Number(rsp?.y);
  const rspValid = Number.isFinite(rspX) && Number.isFinite(rspY);
  const rspPx = rspValid ? toPx(rspX, rspY) : null;

  // Guard: no valid seats
  if (!seats || seats.length === 0) return null;

  // Build count summary string
  const countEntries = CATEGORY_ORDER
    .filter((key) => (counts?.[key] || 0) > 0)
    .map((key) => {
      const n = counts[key];
      const label = CATEGORY_COUNT_LABELS[key];
      const seatWord = n === 1 ? "seat" : "seats";
      return `${n} ${label} ${seatWord}`;
    });
  const countSummary = countEntries.join(" · ");

  // Categories present in the project (for key)
  const activeCategories = CATEGORY_ORDER.filter((key) => (counts?.[key] || 0) > 0);

  const containerStyle = print
    ? { display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "8px 16px", width: "100%", height: "100%" }
    : {
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
      };

  return (
    <div style={containerStyle}>
      {/* ── Heading hierarchy (screen only) ── */}
      {!print && (
        <div style={{ width: "100%", marginBottom: 16 }}>
          <h1 style={{
            margin: 0,
            fontSize: 34,
            fontWeight: 300,
            color: "#213428",
            letterSpacing: "0.01em",
            fontFamily: "Futura PT Light, Century Gothic, sans-serif",
            textAlign: "center",
          }}>
            Spatial Resolution
          </h1>
          <p style={{
            margin: "6px 0 0 0",
            fontSize: 12,
            color: "#625143",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            textAlign: "center",
            fontFamily: "Didact Gothic, Century Gothic, sans-serif",
          }}>
            RP22 Parameters 4, 6 & 10 — Listening quality across the seats
          </p>
        </div>
      )}

      {/* ── Descriptive title (screen only) ── */}
      {!print && (
        <div style={{
          fontSize: 18,
          fontWeight: 600,
          color: "#213428",
          marginBottom: 8,
          fontFamily: "Futura PT Light, Century Gothic, sans-serif",
        }}>
          Best Listening Area
        </div>
      )}

      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        className="client-report-print-svg"
        style={print
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
          fontFamily="Didact Gothic, Century Gothic, sans-serif"
          letterSpacing="0.06em"
        >
          SCREEN
        </text>

        {/* Seat zones — broad translucent halos with category colours */}
        {seats.map((seat) => {
          const sp = toPx(seat.x, seat.y);
          const style = CATEGORY_STYLES[seat.categoryKey] || CATEGORY_STYLES.not_assessed;
          return (
            <g key={seat.id}>
              {/* Translucent zone */}
              <circle
                cx={sp.px}
                cy={sp.py}
                r={ZONE_R_PX}
                fill={style.fill}
                stroke={style.stroke}
                strokeWidth={style.strokeWidth}
                strokeDasharray={style.dasharray}
              />
              {/* Seat dot */}
              <circle
                cx={sp.px}
                cy={sp.py}
                r={6}
                fill={style.dotFill}
                stroke={style.dotStroke}
                strokeWidth={1.5}
              />
            </g>
          );
        })}

        {/* RSP marker — reference only, no classification.
             Uses the same collision-free placement helper as ClientSpeakerBalance.
             Seat zone circles are the obstacles. */}
        {rspPx && (() => {
          const seatCircles = seats.map((seat) => {
            const sp = toPx(seat.x, seat.y);
            return { cx: sp.px, cy: sp.py, r: ZONE_R_PX };
          });
          const screenCx = (screenLeftPx.px + screenRightPx.px) / 2;
          const screenRect = {
            x1: Math.min(screenLeftPx.px, screenCx - 25),
            y1: screenLeftPx.py - 22,
            x2: Math.max(screenRightPx.px, screenCx + 25),
            y2: screenLeftPx.py + 3,
          };
          const placement = resolveRspLabelPlacement(rspPx, seatCircles, [], screenRect, { w: SVG_W, h: SVG_H });
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
                fontFamily="Didact Gothic, Century Gothic, sans-serif"
                letterSpacing="0.08em"
              >
                RSP
              </text>
            </g>
          );
        })()}
      </svg>

      {/* ── Category key (only categories that exist) ── */}
      <div style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: 16,
        padding: "12px 16px",
        background: "#F1F0EE",
        borderRadius: 8,
        border: "1px solid #DCDBD6",
        width: "100%",
        maxWidth: print ? "100%" : 600,
        fontFamily: "Didact Gothic, Century Gothic, sans-serif",
      }}>
        {activeCategories.map((key) => {
          const style = CATEGORY_STYLES[key];
          const label = CATEGORY_LABELS[key];
          return (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <svg width={20} height={20} viewBox="0 0 20 20">
                <circle
                  cx={10}
                  cy={10}
                  r={8}
                  fill={style.fill}
                  stroke={style.stroke}
                  strokeWidth={style.strokeWidth}
                  strokeDasharray={style.dasharray}
                />
              </svg>
              <span style={{ fontSize: 12, color: "#3E4349", letterSpacing: "0.02em" }}>
                {label}
              </span>
            </div>
          );
        })}
      </div>

      {/* ── Count summary ── */}
      {countSummary && (
        <div style={{
          fontSize: 14,
          fontWeight: 600,
          color: "#213428",
          textAlign: "center",
          fontFamily: "Futura PT Light, Century Gothic, sans-serif",
        }}>
          {countSummary}
        </div>
      )}

      {/* ── Main client explanation (screen only — print renders it in the result region) ── */}
      {!print && explanation && (
        <p style={{
          fontSize: 14,
          color: "#625143",
          textAlign: "center",
          maxWidth: 500,
          lineHeight: 1.5,
          margin: 0,
          fontFamily: "Didact Gothic, Century Gothic, sans-serif",
        }}>
          {explanation}
        </p>
      )}
    </div>
  );
}