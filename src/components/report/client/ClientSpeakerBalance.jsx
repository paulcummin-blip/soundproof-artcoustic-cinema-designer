/**
 * ClientSpeakerBalance
 * --------------------
 * Shared SVG plan component for the Speaker Balance Across the Seats
 * Visual Report page (RP22 Parameters 4, 6 & 10).
 *
 * Renders a plan-view SVG showing:
 *   - room outline
 *   - screen position and orientation (same authority as P5 / seating pages)
 *   - all valid real-seat positions with a compact fixed-order result group
 *     (Screen → Surround → Overhead) at each seat
 *   - effective RSP highlighted as a reference marker only (no result badges)
 *   - one restrained legend
 *
 * Works for both screen (card) and print (plain) contexts via the `print` prop.
 * Screen and PDF use the same filtered authority — this is the single shared
 * drawing component for both.
 */

import React from "react";

// ── L-level colour palette (matches existing Visual Report pages) ───────────
const LEVEL_COLORS = {
  4: "#213428", "L4": "#213428",
  3: "#3E4349", "L3": "#3E4349",
  2: "#625143", "L2": "#625143",
  1: "#4A230F", "L1": "#4A230F",
};

function levelColor(level) {
  if (level === null || level === undefined) return "#C1B6AD";
  const key = typeof level === "number" ? level : String(level).trim().toUpperCase();
  return LEVEL_COLORS[key] || "#C1B6AD";
}

// Marker geometry — fixed offsets from seat centre
const MARKER_R = 5;
const MARKER_DX = 12;
const MARKER_DY = 18;

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
    ? { display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "16px 40px" }
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
          ? { width: "100%", height: "100%", maxHeight: "none" }
          : { width: "100%", maxWidth: 600, height: "auto" }
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

        {/* Seats with compact fixed-order result markers */}
        {seats.map((seat) => {
          const sp = toPx(seat.x, seat.y);
          return (
            <g key={seat.id}>
              {/* Seat circle */}
              <circle
                cx={sp.px}
                cy={sp.py}
                r={7}
                fill="#C1B6AD"
                stroke="#F8F8F7"
                strokeWidth={1.5}
              />
              {/* Result markers — fixed order: Screen (P4), Surround (P6), Overhead (P10) */}
              {seat.p4 && (
                <circle
                  cx={sp.px - MARKER_DX}
                  cy={sp.py + MARKER_DY}
                  r={MARKER_R}
                  fill={levelColor(seat.p4.level)}
                  stroke="#F8F8F7"
                  strokeWidth={1}
                />
              )}
              {seat.p6 && (
                <circle
                  cx={sp.px}
                  cy={sp.py + MARKER_DY}
                  r={MARKER_R}
                  fill={levelColor(seat.p6.level)}
                  stroke="#F8F8F7"
                  strokeWidth={1}
                />
              )}
              {seat.p10 && (
                <circle
                  cx={sp.px + MARKER_DX}
                  cy={sp.py + MARKER_DY}
                  r={MARKER_R}
                  fill={levelColor(seat.p10.level)}
                  stroke="#F8F8F7"
                  strokeWidth={1}
                />
              )}
            </g>
          );
        })}

        {/* RSP marker — reference only, no result badges */}
        {rspPx && (
          <g>
            <circle cx={rspPx.px} cy={rspPx.py} r={12} fill="none" stroke="#213428" strokeWidth={3} />
            <circle cx={rspPx.px} cy={rspPx.py} r={5} fill="#213428" />
            <text
              x={rspPx.px}
              y={rspPx.py + 28}
              fill="#213428"
              fontSize={12}
              textAnchor="middle"
              fontWeight={600}
              fontFamily="Didact Gothic, Century Gothic, sans-serif"
              letterSpacing="0.08em"
            >
              RSP
            </text>
          </g>
        )}
      </svg>

      {/* ── Legend ── */}
      <div style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 16,
        justifyContent: "center",
        alignItems: "center",
        padding: "12px 16px",
        background: "#F1F0EE",
        borderRadius: 8,
        border: "1px solid #DCDBD6",
        maxWidth: 600,
        fontFamily: "Didact Gothic, Century Gothic, sans-serif",
      }}>
        {/* Layer order */}
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {hasValidP4 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#625143" }} />
              <span style={{ fontSize: 12, color: "#625143" }}>Screen</span>
            </div>
          )}
          {hasValidP6 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#625143" }} />
              <span style={{ fontSize: 12, color: "#625143" }}>Surround</span>
            </div>
          )}
          {hasValidP10 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#625143" }} />
              <span style={{ fontSize: 12, color: "#625143" }}>Overhead</span>
            </div>
          )}
        </div>
        {/* Divider */}
        <div style={{ width: 1, height: 20, background: "#DCDBD6" }} />
        {/* Level scale */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {[4, 3, 2, 1].map((n) => (
            <div key={n} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: levelColor(n) }} />
              <span style={{ fontSize: 11, color: "#625143" }}>L{n}</span>
            </div>
          ))}
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