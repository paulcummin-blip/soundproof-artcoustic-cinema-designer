/**
 * ClientSpeakerBalance
 * --------------------
 * Shared SVG plan component for the Speaker Balance Across the Seats
 * Visual Report page (RP22 Parameters 4, 6 & 10).
 *
 * Renders a plan-view SVG showing:
 *   - room outline
 *   - screen position and orientation (same authority as P5 / seating pages)
 *   - all valid real-seat positions with a compact fixed-order L-level badge
 *     row (Screen → Surround → Overhead) at each seat
 *   - effective RSP highlighted as a reference marker only (no result badges)
 *   - one restrained legend with explicit three-position example + level key
 *
 * Works for both screen (card) and print (plain) contexts via the `print` prop.
 * Screen and PDF use the same filtered authority — this is the single shared
 * drawing component for both.
 */

import React from "react";

// ── L-level badge styles (text + fill + border, readable without colour) ──
const LEVEL_STYLES = {
  4: { fill: "#213428", textColor: "#FFFFFF", borderColor: "#213428", label: "L4" },
  3: { fill: "#3E4349", textColor: "#FFFFFF", borderColor: "#3E4349", label: "L3" },
  2: { fill: "#F8F8F7", textColor: "#625143", borderColor: "#625143", label: "L2" },
  1: { fill: "#F8F8F7", textColor: "#4A230F", borderColor: "#4A230F", label: "L1" },
};

function levelStyle(level) {
  if (level === null || level === undefined) return null;
  const key = typeof level === "number" ? level : parseInt(String(level).replace(/[^0-9]/g, ""), 10);
  if (!Number.isFinite(key) || key < 1 || key > 4) return null;
  return LEVEL_STYLES[key];
}

// Badge geometry — fixed offsets from seat centre
const BADGE_W = 28;
const BADGE_H = 18;
const BADGE_RX = 4;
const BADGE_DX = 32; // horizontal spacing between badge centres
const BADGE_DY = 22; // vertical offset from seat centre to badge centre

// RSP marker geometry — smaller to avoid badge collision
const RSP_RING_R = 8;
const RSP_DOT_R = 3;

// RSP label approximate bounding box
const RSP_LABEL_W = 30;
const RSP_LABEL_H = 14;

// ── Pure intersection helpers ──────────────────────────────────────────────
function rectsIntersect(a, b) {
  return !(a.x2 < b.x1 || b.x2 < a.x1 || a.y2 < b.y1 || b.y2 < a.y1);
}

function circleRectIntersect(cx, cy, r, rect) {
  const closestX = Math.max(rect.x1, Math.min(cx, rect.x2));
  const closestY = Math.max(rect.y1, Math.min(cy, rect.y2));
  const dx = cx - closestX;
  const dy = cy - closestY;
  return dx * dx + dy * dy < r * r;
}

/**
 * resolveRspLabelPlacement — pure placement helper for the RSP label.
 *
 * Tests candidate label positions in order: above, left, right, below (last resort).
 * Chooses the first candidate that:
 *   - remains inside the SVG bounds
 *   - does not intersect any seat circle
 *   - does not intersect any badge rectangle
 *   - does not intersect the screen line or SCREEN label
 *
 * @param {Object} rspPx        - { px, py } RSP pixel position
 * @param {Array}  seatCircles - [{ cx, cy, r }] seat circle obstacles
 * @param {Array}  badgeRects  - [{ x1, y1, x2, y2 }] badge rectangle obstacles
 * @param {Object} screenRect  - { x1, y1, x2, y2 } screen line + label bounds
 * @param {Object} svgBounds   - { w, h } SVG dimensions
 * @returns {Object} { x, y, anchor } label anchor position + text-anchor
 */
export function resolveRspLabelPlacement(rspPx, seatCircles, badgeRects, screenRect, svgBounds) {
  const cx = rspPx.px;
  const cy = rspPx.py;
  const hw = RSP_LABEL_W / 2;
  const hh = RSP_LABEL_H / 2;

  const candidates = [
    { name: "above", x: cx, y: cy - RSP_RING_R - hh - 4, anchor: "middle",
      rect: { x1: cx - hw, y1: cy - RSP_RING_R - RSP_LABEL_H - 4, x2: cx + hw, y2: cy - RSP_RING_R - 4 } },
    { name: "left", x: cx - RSP_RING_R - hw - 4, y: cy, anchor: "end",
      rect: { x1: cx - RSP_RING_R - RSP_LABEL_W - 4, y1: cy - hh, x2: cx - RSP_RING_R - 4, y2: cy + hh } },
    { name: "right", x: cx + RSP_RING_R + hw + 4, y: cy, anchor: "start",
      rect: { x1: cx + RSP_RING_R + 4, y1: cy - hh, x2: cx + RSP_RING_R + RSP_LABEL_W + 4, y2: cy + hh } },
    { name: "below", x: cx, y: cy + RSP_RING_R + hh + 4, anchor: "middle",
      rect: { x1: cx - hw, y1: cy + RSP_RING_R + 4, x2: cx + hw, y2: cy + RSP_RING_R + RSP_LABEL_H + 4 } },
  ];

  for (const c of candidates) {
    // Check SVG bounds
    if (c.rect.x1 < 0 || c.rect.y1 < 0 || c.rect.x2 > svgBounds.w || c.rect.y2 > svgBounds.h) continue;
    // Check seat circles
    let ok = true;
    for (const sc of seatCircles) {
      if (circleRectIntersect(sc.cx, sc.cy, sc.r, c.rect)) { ok = false; break; }
    }
    if (!ok) continue;
    // Check badge rects
    for (const br of badgeRects) {
      if (rectsIntersect(br, c.rect)) { ok = false; break; }
    }
    if (!ok) continue;
    // Check screen rect
    if (screenRect && rectsIntersect(screenRect, c.rect)) continue;
    return { x: c.x, y: c.y, anchor: c.anchor, name: c.name };
  }

  // Fallback: above (even if it collides — best effort)
  return { x: cx, y: cy - RSP_RING_R - hh - 4, anchor: "middle", name: "above-fallback" };
}

export default function ClientSpeakerBalance({
  roomDims,
  seats,
  rsp,
  screenFrontPlaneM,
  screenWidthM,
  hasValidP4,
  hasValidP6,
  hasValidP10,
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

  // Screen geometry (same authority as ClientRecommendedSeatingPosition)
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

  // Guard: no valid seats or no valid results
  if (!seats || seats.length === 0 || (!hasValidP4 && !hasValidP6 && !hasValidP10)) return null;

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

  // Badge renderer — renders a rounded rect with L-level text
  const renderBadge = (cx, cy, level) => {
    const ls = levelStyle(level);
    if (!ls) return null;
    return (
      <g>
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
      </g>
    );
  };

  return (
    <div style={containerStyle}>
      {/* ── Heading hierarchy: Category → Parameter reference (screen only) ── */}
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
            RP22 Parameters 4, 6 & 10 — Speaker balance across the seats
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
          Speaker Balance Across the Seats
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

        {/* Seats with compact fixed-order L-level badges */}
        {seats.map((seat) => {
          const sp = toPx(seat.x, seat.y);
          const badgeY = sp.py + BADGE_DY;
          return (
            <g key={seat.id}>
              {/* Seat circle — visually separate above badge row */}
              <circle
                cx={sp.px}
                cy={sp.py}
                r={7}
                fill="#C1B6AD"
                stroke="#F8F8F7"
                strokeWidth={1.5}
              />
              {/* L-level badges — fixed three-column order:
                   Screen (P4) left, Surround (P6) centre, Overhead (P10) right */}
              {seat.p4 && renderBadge(sp.px - BADGE_DX, badgeY, seat.p4.level)}
              {seat.p6 && renderBadge(sp.px, badgeY, seat.p6.level)}
              {seat.p10 && renderBadge(sp.px + BADGE_DX, badgeY, seat.p10.level)}
            </g>
          );
        })}

        {/* RSP marker — reference only, no result badges.
             Smaller marker (8px ring, 3px dot) + label placed via collision-free helper. */}
        {rspPx && (() => {
          // Build obstacle lists for the placement helper
          const seatCircles = seats.map((seat) => {
            const sp = toPx(seat.x, seat.y);
            return { cx: sp.px, cy: sp.py, r: 7 };
          });
          const badgeRects = [];
          seats.forEach((seat) => {
            const sp = toPx(seat.x, seat.y);
            const by = sp.py + BADGE_DY;
            if (seat.p4) badgeRects.push({ x1: sp.px - BADGE_DX - BADGE_W / 2, y1: by - BADGE_H / 2, x2: sp.px - BADGE_DX + BADGE_W / 2, y2: by + BADGE_H / 2 });
            if (seat.p6) badgeRects.push({ x1: sp.px - BADGE_W / 2, y1: by - BADGE_H / 2, x2: sp.px + BADGE_W / 2, y2: by + BADGE_H / 2 });
            if (seat.p10) badgeRects.push({ x1: sp.px + BADGE_DX - BADGE_W / 2, y1: by - BADGE_H / 2, x2: sp.px + BADGE_DX + BADGE_W / 2, y2: by + BADGE_H / 2 });
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

      {/* ── Legend: explicit three-position example + level key ── */}
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
        {/* Three-position example — fixed three-column grid.
             Unavailable layers render only an invisible structural spacer
             (aria-hidden) so canonical left/centre/right positions are preserved. */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", alignItems: "center", justifyContent: "center", gap: 8 }}>
          {hasValidP4 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <svg width={BADGE_W + 4} height={BADGE_H + 4} viewBox={`0 0 ${BADGE_W + 4} ${BADGE_H + 4}`}>
                <rect x={2} y={2} width={BADGE_W} height={BADGE_H} rx={BADGE_RX} fill="#C1B6AD" stroke="#625143" strokeWidth={1.5} />
                <text x={(BADGE_W + 4) / 2} y={(BADGE_H + 4) / 2 + 1} fill="#625143" fontSize={11} fontWeight={700} textAnchor="middle" dominantBaseline="middle" fontFamily="Futura PT Light, Century Gothic, sans-serif">L·</text>
              </svg>
              <span style={{ fontSize: 11, color: "#625143", letterSpacing: "0.04em" }}>Screen</span>
            </div>
          ) : (
            <div aria-hidden="true" style={{ minWidth: 64, minHeight: BADGE_H + 20 }} />
          )}
          {hasValidP6 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <svg width={BADGE_W + 4} height={BADGE_H + 4} viewBox={`0 0 ${BADGE_W + 4} ${BADGE_H + 4}`}>
                <rect x={2} y={2} width={BADGE_W} height={BADGE_H} rx={BADGE_RX} fill="#C1B6AD" stroke="#625143" strokeWidth={1.5} />
                <text x={(BADGE_W + 4) / 2} y={(BADGE_H + 4) / 2 + 1} fill="#625143" fontSize={11} fontWeight={700} textAnchor="middle" dominantBaseline="middle" fontFamily="Futura PT Light, Century Gothic, sans-serif">L·</text>
              </svg>
              <span style={{ fontSize: 11, color: "#625143", letterSpacing: "0.04em" }}>Surround</span>
            </div>
          ) : (
            <div aria-hidden="true" style={{ minWidth: 64, minHeight: BADGE_H + 20 }} />
          )}
          {hasValidP10 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <svg width={BADGE_W + 4} height={BADGE_H + 4} viewBox={`0 0 ${BADGE_W + 4} ${BADGE_H + 4}`}>
                <rect x={2} y={2} width={BADGE_W} height={BADGE_H} rx={BADGE_RX} fill="#C1B6AD" stroke="#625143" strokeWidth={1.5} />
                <text x={(BADGE_W + 4) / 2} y={(BADGE_H + 4) / 2 + 1} fill="#625143" fontSize={11} fontWeight={700} textAnchor="middle" dominantBaseline="middle" fontFamily="Futura PT Light, Century Gothic, sans-serif">L·</text>
              </svg>
              <span style={{ fontSize: 11, color: "#625143", letterSpacing: "0.04em" }}>Overhead</span>
            </div>
          ) : (
            <div aria-hidden="true" style={{ minWidth: 64, minHeight: BADGE_H + 20 }} />
          )}
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
        </div>
      </div>

      {/* ── Client wording (screen only) ── */}
      {!print && (
        <p style={{
          fontSize: 14,
          color: "#625143",
          textAlign: "center",
          maxWidth: 500,
          lineHeight: 1.5,
          margin: 0,
          fontFamily: "Didact Gothic, Century Gothic, sans-serif",
        }}>
          The loudspeaker system is designed to keep dialogue, surround effects and overhead sound appropriately balanced across the seating area.
        </p>
      )}
    </div>
  );
}