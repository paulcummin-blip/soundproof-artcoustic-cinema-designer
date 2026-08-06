/**
 * TechnicalTimbreConsistency
 * --------------------------
 * Technical SVG plan component for the Timbre Consistency Technical Report page
 * (RP22 Parameters 16 & 17).
 *
 * Reuses the detailed Speaker Balance drawing language:
 *   - room outline
 *   - screen
 *   - real-seat markers
 *   - separate RSP reference marker (no P16/P17 attached)
 *   - two fixed result slots at every real seat (P16 left, P17 right)
 *
 * Each slot shows:
 *   - explicit L1/L2/L3/L4 or FAIL badge
 *   - exact formatted dB result below the badge
 *
 * Does NOT combine P16 and P17.
 * Does NOT own heading, title or explanation — a Technical Report wrapper owns those.
 *
 * Works for both screen (card) and print (plain) contexts via the `print` prop.
 */

import React from "react";
import { resolveRspLabelPlacement } from "./ClientSpeakerBalance";

// ── L-level badge styles (text + fill + border, readable without colour) ──
const LEVEL_STYLES = {
  4: { fill: "#213428", textColor: "#FFFFFF", borderColor: "#213428", label: "L4" },
  3: { fill: "#3E4349", textColor: "#FFFFFF", borderColor: "#3E4349", label: "L3" },
  2: { fill: "#F8F8F7", textColor: "#625143", borderColor: "#625143", label: "L2" },
  1: { fill: "#F8F8F7", textColor: "#4A230F", borderColor: "#4A230F", label: "L1" },
  FAIL: { fill: "#4A230F", textColor: "#FFFFFF", borderColor: "#4A230F", label: "FAIL" },
};

function levelStyle(level) {
  if (level === null || level === undefined) return null;
  const str = String(level).trim().toUpperCase();
  if (str === "FAIL") return LEVEL_STYLES.FAIL;
  const key = typeof level === "number" ? level : parseInt(str.replace(/[^0-9]/g, ""), 10);
  if (!Number.isFinite(key) || key < 1 || key > 4) return null;
  return LEVEL_STYLES[key];
}

/**
 * Format a param's dB value for display below the badge.
 * Prefers the engine's `formatted` field; falls back to ±value dB.
 * Returns null when no finite value is available (e.g. FAIL without value).
 */
function formatDb(param) {
  if (!param) return null;
  if (param.formatted) return param.formatted;
  if (param.value != null && Number.isFinite(param.value)) {
    return `±${Math.abs(param.value).toFixed(1)} dB`;
  }
  return null;
}

// Badge geometry — fixed offsets from seat centre
const BADGE_W = 32;
const BADGE_H = 18;
const BADGE_RX = 4;
const BADGE_DX = 28; // horizontal spacing between slot centres
const BADGE_DY = 24; // vertical offset from seat centre to badge centre
const DB_TEXT_DY = BADGE_DY + BADGE_H / 2 + 6; // dB text below badge

// RSP marker geometry
const RSP_RING_R = 8;
const RSP_DOT_R = 3;
const RSP_LABEL_W = 30;
const RSP_LABEL_H = 14;

export default function TechnicalTimbreConsistency({
  roomDims,
  seats,
  rsp,
  screenFrontPlaneM,
  screenWidthM,
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

  // Slot renderer — badge + dB text below
  const renderSlot = (cx, cy, param) => {
    if (!param) return null;
    const ls = levelStyle(param.level);
    if (!ls) return null;
    const dbText = formatDb(param);
    return (
      <g>
        {/* L-level badge */}
        <rect
          x={cx - BADGE_W / 2}
          y={cy - BADGE_H / 2}
          width={BADGE_W}
          height={BADGE_H}
          rx={BADGE_RX}
          ry={BADGE_RX}
          fill={ls.fill}
          stroke={ls.borderColor}
          strokeWidth={1.5}
        />
        <text
          x={cx}
          y={cy + 1}
          fill={ls.textColor}
          fontSize={11}
          fontWeight={700}
          textAnchor="middle"
          dominantBaseline="middle"
          fontFamily="Futura PT Light, Century Gothic, sans-serif"
        >
          {ls.label}
        </text>
        {/* Exact formatted dB result below the badge */}
        {dbText && (
          <text
            x={cx}
            y={cy + BADGE_H / 2 + 12}
            fill="#3E4349"
            fontSize={10}
            fontWeight={500}
            textAnchor="middle"
            dominantBaseline="middle"
            fontFamily="Didact Gothic, Century Gothic, sans-serif"
          >
            {dbText}
          </text>
        )}
      </g>
    );
  };

  return (
    <div style={containerStyle}>
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

        {/* Seats with two fixed result slots: P16 (left), P17 (right) */}
        {seats.map((seat) => {
          const sp = toPx(seat.x, seat.y);
          const badgeY = sp.py + BADGE_DY;
          return (
            <g key={seat.id}>
              {/* Seat circle — visually separate above slot row */}
              <circle
                cx={sp.px}
                cy={sp.py}
                r={7}
                fill="#C1B6AD"
                stroke="#F8F8F7"
                strokeWidth={1.5}
              />
              {/* P16 slot — left (Screen Timbre) */}
              {renderSlot(sp.px - BADGE_DX, badgeY, seat.p16)}
              {/* P17 slot — right (Surround & Overhead Timbre) */}
              {renderSlot(sp.px + BADGE_DX, badgeY, seat.p17)}
            </g>
          );
        })}

        {/* RSP marker — reference only, no P16/P17 results attached.
             Uses the same collision-free placement helper as ClientSpeakerBalance. */}
        {rspPx && (() => {
          const seatCircles = seats.map((seat) => {
            const sp = toPx(seat.x, seat.y);
            return { cx: sp.px, cy: sp.py, r: 7 };
          });
          const badgeRects = [];
          seats.forEach((seat) => {
            const sp = toPx(seat.x, seat.y);
            const by = sp.py + BADGE_DY;
            if (seat.p16) badgeRects.push({ x1: sp.px - BADGE_DX - BADGE_W / 2, y1: by - BADGE_H / 2, x2: sp.px - BADGE_DX + BADGE_W / 2, y2: by + BADGE_H / 2 + 14 });
            if (seat.p17) badgeRects.push({ x1: sp.px + BADGE_DX - BADGE_W / 2, y1: by - BADGE_H / 2, x2: sp.px + BADGE_DX + BADGE_W / 2, y2: by + BADGE_H / 2 + 14 });
          });
          const screenCx = (screenLeftPx.px + screenRightPx.px) / 2;
          const screenRect = {
            x1: Math.min(screenLeftPx.px, screenCx - 25),
            y1: screenLeftPx.py - 22,
            x2: Math.max(screenRightPx.px, screenCx + 25),
            y2: screenLeftPx.py + 3,
          };
          const placement = resolveRspLabelPlacement(rspPx, seatCircles, badgeRects, screenRect, { w: SVG_W, h: SVG_H });
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

      {/* ── Technical legend: P16/P17 descriptions + level key ── */}
      <div style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: "12px 16px",
        background: "#F1F0EE",
        borderRadius: 8,
        border: "1px solid #DCDBD6",
        width: "100%",
        maxWidth: print ? "100%" : 600,
        fontFamily: "Didact Gothic, Century Gothic, sans-serif",
      }}>
        {/* P16 / P17 descriptions — fixed two-column grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <svg width={BADGE_W + 4} height={BADGE_H + 4} viewBox={`0 0 ${BADGE_W + 4} ${BADGE_H + 4}`}>
              <rect x={2} y={2} width={BADGE_W} height={BADGE_H} rx={BADGE_RX} fill="#C1B6AD" stroke="#625143" strokeWidth={1.5} />
              <text x={(BADGE_W + 4) / 2} y={(BADGE_H + 4) / 2 + 1} fill="#625143" fontSize={11} fontWeight={700} textAnchor="middle" dominantBaseline="middle" fontFamily="Futura PT Light, Century Gothic, sans-serif">P16</text>
            </svg>
            <span style={{ fontSize: 11, color: "#625143", letterSpacing: "0.04em", textAlign: "center" }}>Screen speakers</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <svg width={BADGE_W + 4} height={BADGE_H + 4} viewBox={`0 0 ${BADGE_W + 4} ${BADGE_H + 4}`}>
              <rect x={2} y={2} width={BADGE_W} height={BADGE_H} rx={BADGE_RX} fill="#C1B6AD" stroke="#625143" strokeWidth={1.5} />
              <text x={(BADGE_W + 4) / 2} y={(BADGE_H + 4) / 2 + 1} fill="#625143" fontSize={11} fontWeight={700} textAnchor="middle" dominantBaseline="middle" fontFamily="Futura PT Light, Century Gothic, sans-serif">P17</text>
            </svg>
            <span style={{ fontSize: 11, color: "#625143", letterSpacing: "0.04em", textAlign: "center" }}>Wide, surround and overhead speakers</span>
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "#DCDBD6", width: "100%" }} />

        {/* Level key — exact badge treatments used in the plan */}
        <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
          {[4, 3, 2, 1].map((n) => {
            const ls = LEVEL_STYLES[n];
            return (
              <div key={n} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <svg width={BADGE_W + 4} height={BADGE_H + 4} viewBox={`0 0 ${BADGE_W + 4} ${BADGE_H + 4}`}>
                  <rect x={2} y={2} width={BADGE_W} height={BADGE_H} rx={BADGE_RX} fill={ls.fill} stroke={ls.borderColor} strokeWidth={1.5} />
                  <text x={(BADGE_W + 4) / 2} y={(BADGE_H + 4) / 2 + 1} fill={ls.textColor} fontSize={11} fontWeight={700} textAnchor="middle" dominantBaseline="middle" fontFamily="Futura PT Light, Century Gothic, sans-serif">{ls.label}</text>
                </svg>
              </div>
            );
          })}
          {/* FAIL badge in level key */}
          {(() => {
            const ls = LEVEL_STYLES.FAIL;
            return (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <svg width={BADGE_W + 4} height={BADGE_H + 4} viewBox={`0 0 ${BADGE_W + 4} ${BADGE_H + 4}`}>
                  <rect x={2} y={2} width={BADGE_W} height={BADGE_H} rx={BADGE_RX} fill={ls.fill} stroke={ls.borderColor} strokeWidth={1.5} />
                  <text x={(BADGE_W + 4) / 2} y={(BADGE_H + 4) / 2 + 1} fill={ls.textColor} fontSize={10} fontWeight={700} textAnchor="middle" dominantBaseline="middle" fontFamily="Futura PT Light, Century Gothic, sans-serif">{ls.label}</text>
                </svg>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}