/**
 * ClientRecommendedSeatingPosition
 * --------------------------------
 * Pure client-facing Recommended Seating Position SVG page.
 *
 * Renders a plan-view SVG showing:
 *   - room outline
 *   - all real seats (neutral treatment)
 *   - effective RSP clearly highlighted (or a separate marker if not on a seat)
 *   - screen position/orientation
 *   - one short explanation
 *
 * Uses the effective RSP from useEffectiveRsp — NOT authoritativeSeat
 * (which is the P9 locked-seat authority).
 *
 * Works for both screen (card) and print (plain) contexts via the `print` prop.
 */

import React, { useMemo } from "react";

export default function ClientRecommendedSeatingPosition({
  roomDims,
  seatingPositions,
  rsp,
  rspSourceLabel,
  screenFrontPlaneM,
  screenWidthM,
  screen,
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

  // Normalise real seats
  const seats = useMemo(() => {
    return (Array.isArray(seatingPositions) ? seatingPositions : [])
      .map((s) => {
        const x = Number(s.x ?? s.position?.x);
        const y = Number(s.y ?? s.position?.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        return { id: s.id || `seat-${x.toFixed(2)}-${y.toFixed(2)}`, x, y };
      })
      .filter(Boolean);
  }, [seatingPositions]);

  // RSP validity
  const rspX = Number(rsp?.x);
  const rspY = Number(rsp?.y);
  const rspValid = Number.isFinite(rspX) && Number.isFinite(rspY);

  // Check if RSP coincides with a real seat
  const rspMatchesSeat = rspValid && seats.some((s) =>
    Math.abs(s.x - rspX) < 0.01 && Math.abs(s.y - rspY) < 0.01
  );

  const rspPx = rspValid ? toPx(rspX, rspY) : null;

  // Screen geometry (front wall, matching P5 view)
  const screenY = Number(screenFrontPlaneM) || 0.2;
  const screenW = Number(screenWidthM) || 3;
  const screenLeftX = (W - screenW) / 2;
  const screenRightX = (W + screenW) / 2;
  const screenLeftPx = toPx(screenLeftX, screenY);
  const screenRightPx = toPx(screenRightX, screenY);

  const roomTopLeft = toPx(0, 0);
  const roomBottomRight = toPx(W, L);

  if (!rspValid || seats.length === 0) return null;

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
      {/* ── Heading hierarchy: Category → Parameter reference ── */}
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
          RP22 Parameter 1 — Seating position and wall clearance
        </p>
      </div>

      {/* ── Descriptive title ── */}
      <div style={{
        fontSize: 18,
        fontWeight: 600,
        color: "#213428",
        marginBottom: 8,
        fontFamily: "Futura PT Light, Century Gothic, sans-serif",
      }}>
        Recommended Seating Position
      </div>

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

        {/* Seats — all in neutral treatment */}
        {seats.map((seat) => {
          const sp = toPx(seat.x, seat.y);
          const isRspSeat = rspMatchesSeat &&
            Math.abs(seat.x - rspX) < 0.01 &&
            Math.abs(seat.y - rspY) < 0.01;
          return (
            <circle
              key={seat.id}
              cx={sp.px}
              cy={sp.py}
              r={isRspSeat ? 10 : 7}
              fill={isRspSeat ? "#213428" : "#C1B6AD"}
              stroke={isRspSeat ? "#213428" : "#F8F8F7"}
              strokeWidth={1.5}
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

        {/* RSP label */}
        {rspPx && (
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
        )}
      </svg>

      <p style={{
        fontSize: 14,
        color: "#625143",
        textAlign: "center",
        maxWidth: 500,
        lineHeight: 1.5,
        margin: 0,
        fontFamily: "Didact Gothic, Century Gothic, sans-serif",
      }}>
        The highlighted reference position is the point used to align the cinema's speaker and listening geometry.
      </p>
    </div>
  );
}