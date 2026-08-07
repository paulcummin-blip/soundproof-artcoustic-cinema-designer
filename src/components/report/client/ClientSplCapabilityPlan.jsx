/**
 * ClientSplCapabilityPlan
 * ------------------------
 * Shared SVG room-plan renderer for the P12 / P13 SPL Capability client Visual
 * Report pages.
 *
 * Renders the SAME room plan used by the P5-style pages (identical proportions,
 * outline, screen, seating, RSP marker and drawing scale) plus a single 1.0 m
 * diameter result circle centred exactly on the RSP.
 *
 * The circle is a clean graphical highlight indicating that the parameter is
 * evaluated at the reference seating position. It is NOT an SPL heat map and no
 * acoustic transition is implied at its edge. No text, dB values, threshold
 * information or explanatory annotation appears inside the drawing.
 *
 * Props:
 *   mode — "screen" shows FL/FC/FR only; "non-screen" shows all other speakers.
 *   level — achieved RP22 level, drives the circle's result shading colour.
 */

import React, { useMemo } from "react";

// ── Level → brand colour (mirrors P5 / P9 STATUS_COPY) ──
const LEVEL_COLOR = {
  L4: "#213428",
  L3: "#3E4349",
  L2: "#625143",
  L1: "#4A230F",
  FAIL: "#4A230F",
  default: "#C1B6AD",
};

function levelColor(lvl) {
  return LEVEL_COLOR[lvl] || LEVEL_COLOR.default;
}

// ── Speaker role colours (brand-aligned, same as P5) ──
const ROLE_COLORS = {
  FL: "#3E4349", FC: "#3E4349", FR: "#3E4349",
  SL: "#625143", SR: "#625143",
  SBL: "#4A230F", SBR: "#4A230F",
  LW: "#213428", RW: "#213428",
};

const SCREEN_ROLES = new Set(["FL", "FC", "FR", "L", "C", "R"]);

function canonicalize(role) {
  const r = String(role || "").toUpperCase();
  if (r === "L") return "FL";
  if (r === "C") return "FC";
  if (r === "R") return "FR";
  return r;
}

export default function ClientSplCapabilityPlan({
  roomDims,
  seats,
  rsp,
  screenFrontPlaneM,
  screenWidthM,
  placedSpeakers,
  mode, // "screen" | "non-screen"
  level,
  print,
}) {
  const W = Number(roomDims?.widthM) || 4.5;
  const L = Number(roomDims?.lengthM) || 6.0;

  // Same coordinate system as P5 / BestListeningArea
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

  const plotSeats = useMemo(
    () =>
      (Array.isArray(seats) ? seats : [])
        .map((s) => {
          const x = Number(s.x);
          const y = Number(s.y);
          if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
          return { id: s.id || `seat-${x}-${y}`, x, y };
        })
        .filter(Boolean),
    [seats]
  );

  const rspX = Number(rsp?.x);
  const rspY = Number(rsp?.y);
  const rspValid = Number.isFinite(rspX) && Number.isFinite(rspY);
  const rspPx = rspValid ? toPx(rspX, rspY) : null;

  const screenY = Number(screenFrontPlaneM) || 0.2;
  const screenW = Number(screenWidthM) || 3;
  const screenLeftX = (W - screenW) / 2;
  const screenRightX = (W + screenW) / 2;
  const screenLeftPx = toPx(screenLeftX, screenY);
  const screenRightPx = toPx(screenRightX, screenY);

  const speakers = useMemo(() => {
    if (!Array.isArray(placedSpeakers)) return [];
    return placedSpeakers
      .filter((s) => s?.position && Number.isFinite(s.position.x) && Number.isFinite(s.position.y))
      .map((s) => {
        const canon = canonicalize(s.role);
        const isScreen = SCREEN_ROLES.has(canon);
        const show = mode === "screen" ? isScreen : !isScreen;
        if (!show) return null;
        return { role: canon, x: Number(s.position.x), y: Number(s.position.y) };
      })
      .filter(Boolean);
  }, [placedSpeakers, mode]);

  const roomTopLeft = toPx(0, 0);
  const roomBottomRight = toPx(W, L);

  if (!rspValid || plotSeats.length === 0) return null;

  const color = levelColor(level);
  const circleRpx = 0.5 * SCALE; // 1.0 m diameter → 0.5 m radius

  return (
    <svg
      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
      className="client-report-print-svg"
      style={
        print
          ? { width: "100%", height: "100%", maxHeight: "none" }
          : { width: "100%", maxWidth: 760, height: "auto" }
      }
    >
      {/* Background */}
      <rect width={SVG_W} height={SVG_H} fill="#F8F8F7" rx={12} />

      {/* Room outline */}
      <rect
        x={roomTopLeft.px}
        y={roomTopLeft.py}
        width={roomBottomRight.px - roomTopLeft.px}
        height={roomBottomRight.py - roomTopLeft.py}
        fill="none"
        stroke="#C1B6AD"
        strokeOpacity={0.5}
        strokeWidth={2}
        rx={4}
      />

      {/* Screen */}
      <line
        x1={screenLeftPx.px}
        y1={screenLeftPx.py}
        x2={screenRightPx.px}
        y2={screenRightPx.py}
        stroke="#3E4349"
        strokeWidth={5}
        strokeLinecap="round"
      />
      <text
        x={(screenLeftPx.px + screenRightPx.px) / 2}
        y={screenLeftPx.py - 10}
        fill="#625143"
        fontSize={11}
        textAnchor="middle"
        fontFamily="Didact Gothic, Century Gothic, sans-serif"
        letterSpacing="0.08em"
      >
        SCREEN
      </text>

      {/* 1 m RSP result circle — subtle highlight, no text inside */}
      {rspPx && (
        <circle
          cx={rspPx.px}
          cy={rspPx.py}
          r={circleRpx}
          fill={color}
          fillOpacity={0.12}
          stroke={color}
          strokeOpacity={0.5}
          strokeWidth={2}
        />
      )}

      {/* Seats */}
      {plotSeats.map((seat) => {
        const sp = toPx(seat.x, seat.y);
        return (
          <circle
            key={seat.id}
            cx={sp.px}
            cy={sp.py}
            r={6}
            fill="#625143"
            stroke="#F8F8F7"
            strokeWidth={1.5}
          />
        );
      })}

      {/* Speakers (role labels only — no SPL values in the drawing) */}
      {speakers.map((spk, i) => {
        const sp = toPx(spk.x, spk.y);
        const speakerColor = ROLE_COLORS[spk.role] || "#625143";
        return (
          <g key={`spk-${i}`}>
            <circle
              cx={sp.px}
              cy={sp.py}
              r={6}
              fill={speakerColor}
              stroke="#F8F8F7"
              strokeWidth={1.5}
            />
            <text
              x={sp.px}
              y={sp.py - 12}
              fill={speakerColor}
              fontSize={11}
              textAnchor="middle"
              fontFamily="Didact Gothic, Century Gothic, sans-serif"
              fontWeight={600}
            >
              {spk.role}
            </text>
          </g>
        );
      })}

      {/* RSP marker — on top of the circle */}
      {rspPx && (
        <g>
          <circle cx={rspPx.px} cy={rspPx.py} r={10} fill="none" stroke="#213428" strokeWidth={2} />
          <circle cx={rspPx.px} cy={rspPx.py} r={4} fill="#FFFFFF" />
          <text
            x={rspPx.px}
            y={rspPx.py + 24}
            fill="#213428"
            fontSize={11}
            textAnchor="middle"
            fontFamily="Didact Gothic, Century Gothic, sans-serif"
            fontWeight={600}
            letterSpacing="0.08em"
          >
            RSP
          </text>
        </g>
      )}
    </svg>
  );
}