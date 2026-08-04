/**
 * ClientSoundAroundListener
 * --------------------------
 * Pure SVG renderer for Client Visual Report Page 1.
 *
 * Shows: muted room outline, screen, RSP marker, active bed-layer speakers,
 * speaker role labels, rays from RSP, actual azimuth labels, adjacent P5
 * surround-gap arcs, translucent angular-continuity shading, one compact
 * status card.
 *
 * FL, FC, FR may be shown for context but are NOT included in P5 gaps.
 * The continuity shading represents angular continuity only — it must not
 * imply SPL, dispersion or measured acoustic coverage.
 */

import React, { useMemo } from "react";
import { getCanonicalRole } from "@/components/utils/surroundRoleMap";
import { isEligibleP5Surround } from "@/components/utils/p5SurroundGaps";

// ── Status copy ────────────────────────────────────────────────────────────
const STATUS_COPY = {
  L4: { label: "Excellent spatial continuity", color: "#213428" },
  L3: { label: "Very good spatial continuity", color: "#3E4349" },
  L2: { label: "Good spatial continuity", color: "#625143" },
  L1: { label: "Noticeable gaps", color: "#4A230F" },
  Fail: { label: "Improvement recommended", color: "#4A230F" },
  "—": { label: "Improvement recommended", color: "#C1B6AD" },
};

function getStatusInfo(level) {
  return STATUS_COPY[level] || STATUS_COPY["—"];
}

// ── Role label colours ─────────────────────────────────────────────────────
const ROLE_COLORS = {
  FL: "#3E4349", FC: "#3E4349", FR: "#3E4349",
  SL: "#625143", SR: "#625143",
  SBL: "#4A230F", SBR: "#4A230F",
  LW: "#213428", RW: "#213428",
};

function getRoleColor(canon) {
  return ROLE_COLORS[canon] || "#625143";
}

// ── Azimuth from RSP ───────────────────────────────────────────────────────
function azimuthDegFromRsp(rsp, pt) {
  if (!rsp || !pt) return null;
  const dx = Number(pt.x) - Number(rsp.x);
  const dy = Number(pt.y) - Number(rsp.y);
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  const rad = Math.atan2(dx, -dy);
  let deg = rad * (180 / Math.PI);
  if (deg > 180) deg -= 360;
  if (deg <= -180) deg += 360;
  return deg;
}

// Convert azimuth (-180..+180) to theta (0..360, 0° = front/screen, clockwise)
function azimuthToTheta(az) {
  return (az + 360) % 360;
}

export default function ClientSoundAroundListener({ p5Snapshot, roomDims, screen, screenFrontPlaneM }) {
  const W = Number(roomDims?.widthM) || 4.5;
  const L = Number(roomDims?.lengthM) || 6.0;

  // SVG canvas dimensions
  const PADDING_M = 0.6;
  const totalW = W + PADDING_M * 2;
  const totalH = L + PADDING_M * 2;
  const SVG_W = 760;
  const SVG_H = Math.round(SVG_W * (totalH / totalW));
  const SCALE = SVG_W / totalW;

  // Coordinate transform: room (x, y) → SVG (px, py)
  // x: left→right, y: front(screen)→back
  const toPx = (x, y) => ({
    px: (x + PADDING_M) * SCALE,
    py: (y + PADDING_M) * SCALE,
  });

  const rsp = p5Snapshot?.rsp;
  const speakersWithAzimuth = p5Snapshot?.speakersWithAzimuth || [];
  const gaps = p5Snapshot?.gaps || [];
  const level = p5Snapshot?.level || "—";
  const worstGapDeg = p5Snapshot?.worstGapDeg;
  const statusInfo = getStatusInfo(level);

  // Screen geometry (simplified — just the front wall region)
  const screenViewWm = useMemo(() => {
    const inches = Number(screen?.visibleWidthInches) || 0;
    return inches * 0.0254;
  }, [screen?.visibleWidthInches]);

  const screenCenterX = W / 2;
  const screenY = Math.max(0, Number(screenFrontPlaneM) || 0);

  // RSP centre in SVG coords
  const rspPx = rsp ? toPx(rsp.x, rsp.y) : null;

  // Ray length for speaker rays (extends slightly past speaker)
  const RAY_EXTEND_M = 0.4;

  // Polar to cartesian in SVG space (0° = up = screen direction)
  const polarToSvg = (cx, cy, radiusM, thetaDeg) => {
    const rad = (thetaDeg - 90) * (Math.PI / 180); // SVG: 0° = up
    return {
      x: cx + radiusM * Math.cos(rad) * SCALE,
      y: cy + radiusM * Math.sin(rad) * SCALE,
    };
  };

  // ── Angular-continuity shading ───────────────────────────────────────────
  // Shade the angular region covered by surround speakers (eligible P5 roles).
  // This represents angular continuity only — NOT SPL, dispersion, or coverage.
  const surroundsWithTheta = useMemo(() => {
    return speakersWithAzimuth
      .filter((item) => isEligibleP5Surround(item.canon))
      .map((item) => ({
        ...item,
        theta: azimuthToTheta(item.azimuth),
      }))
      .sort((a, b) => a.theta - b.theta);
  }, [speakersWithAzimuth]);

  const SHADING_RADIUS_M = Math.min(W, L) * 0.35;

  // Build a single SVG path that sweeps from the first surround theta to the last,
  // creating a translucent wedge showing angular continuity.
  const continuityPath = useMemo(() => {
    if (!rspPx || surroundsWithTheta.length < 2) return null;
    const first = surroundsWithTheta[0];
    const last = surroundsWithTheta[surroundsWithTheta.length - 1];

    const startPt = polarToSvg(rspPx.px, rspPx.py, SHADING_RADIUS_M, first.theta);
    const endPt = polarToSvg(rspPx.px, rspPx.py, SHADING_RADIUS_M, last.theta);

    // Large-arc-flag: 0 if gap < 180°, 1 if gap >= 180°
    const sweepDeg = last.theta - first.theta;
    const largeArc = sweepDeg > 180 ? 1 : 0;

    return `M ${rspPx.px} ${rspPx.py} L ${startPt.x} ${startPt.y} A ${SHADING_RADIUS_M * SCALE} ${SHADING_RADIUS_M * SCALE} 0 ${largeArc} 1 ${endPt.x} ${endPt.y} Z`;
  }, [rspPx, surroundsWithTheta, SHADING_RADIUS_M, SCALE]);

  // ── Gap arcs (between adjacent P5-eligible surrounds) ────────────────────
  const gapArcs = useMemo(() => {
    if (!rspPx || surroundsWithTheta.length < 2) return [];
    const ARC_RADIUS_M = SHADING_RADIUS_M * 0.78;
    return gaps.map((gap, i) => {
      const startTheta = gap.fromTheta;
      const endTheta = gap.toTheta;
      const sweepDeg = endTheta - startTheta;
      const largeArc = sweepDeg > 180 ? 1 : 0;

      const startPt = polarToSvg(rspPx.px, rspPx.py, ARC_RADIUS_M, startTheta);
      const endPt = polarToSvg(rspPx.px, rspPx.py, ARC_RADIUS_M, endTheta);

      const midTheta = (startTheta + endTheta) / 2;
      const midPt = polarToSvg(rspPx.px, rspPx.py, ARC_RADIUS_M + 0.35, midTheta);

      const isWorst = Number.isFinite(worstGapDeg) && Math.abs(gap.deg - worstGapDeg) < 0.01;
      const arcColor = isWorst ? "#4A230F" : "#625143";

      return {
        id: i,
        path: `M ${startPt.x} ${startPt.y} A ${ARC_RADIUS_M * SCALE} ${ARC_RADIUS_M * SCALE} 0 ${largeArc} 1 ${endPt.x} ${endPt.y}`,
        midPt,
        deg: gap.deg,
        fromRole: gap.fromRole,
        toRole: gap.toRole,
        isWorst,
        arcColor,
      };
    });
  }, [rspPx, surroundsWithTheta, gaps, worstGapDeg, SHADING_RADIUS_M, SCALE]);

  // ── Loading / empty state ────────────────────────────────────────────────
  if (!p5Snapshot || !rspPx) {
    return (
      <div style={{
        background: "#FFFFFF",
        borderRadius: 16,
        padding: 48,
        textAlign: "center",
        color: "#625143",
        fontFamily: "Didact Gothic, Century Gothic, sans-serif",
        boxShadow: "0 2px 12px rgba(0, 0, 0, 0.06)",
        border: "1px solid #DCDBD6",
      }}>
        Preparing spatial resolution view…
      </div>
    );
  }

  return (
    <div style={{
      background: "#FFFFFF",
      borderRadius: 16,
      padding: 32,
      fontFamily: "Didact Gothic, Century Gothic, sans-serif",
      boxShadow: "0 2px 12px rgba(0, 0, 0, 0.06)",
      border: "1px solid #DCDBD6",
    }}>
      {/* ── Title + subtitle ── */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{
          margin: 0,
          fontSize: 28,
          fontWeight: 600,
          color: "#213428",
          letterSpacing: "0.01em",
          fontFamily: "Futura PT Light, Century Gothic, sans-serif",
        }}>
          Sound Around the Listener
        </h2>
        <p style={{
          margin: "4px 0 0 0",
          fontSize: 14,
          color: "#625143",
          letterSpacing: "0.04em",
          textTransform: "uppercase",
        }}>
          RP22 Parameter 5 — Spatial resolution
        </p>
      </div>

      {/* ── SVG canvas ── */}
      <div style={{
        display: "flex",
        justifyContent: "center",
        marginBottom: 24,
      }}>
        <svg
          width="100%"
          maxWidth={SVG_W}
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          style={{ maxWidth: SVG_W, width: "100%", height: "auto" }}
        >
          {/* Background */}
          <rect width={SVG_W} height={SVG_H} fill="#F8F8F7" rx="12" />

          {/* ── Room outline ── */}
          {(() => {
            const tl = toPx(0, 0);
            const br = toPx(W, L);
            return (
              <rect
                x={tl.px}
                y={tl.py}
                width={(br.px - tl.px)}
                height={(br.py - tl.py)}
                fill="none"
                stroke="#C1B6AD"
                strokeOpacity={0.5}
                strokeWidth={2}
                rx={4}
              />
            );
          })()}

          {/* ── Screen (front wall) ── */}
          {(() => {
            const screenHalfW = (screenViewWm || W * 0.6) / 2;
            const left = toPx(screenCenterX - screenHalfW, screenY);
            const right = toPx(screenCenterX + screenHalfW, screenY);
            return (
              <g>
                <line
                  x1={left.px}
                  y1={left.py}
                  x2={right.px}
                  y2={right.py}
                  stroke="#625143"
                  strokeWidth={5}
                  strokeLinecap="round"
                />
                <text
                  x={(left.px + right.px) / 2}
                  y={left.py - 10}
                  fill="#625143"
                  fontSize={11}
                  textAnchor="middle"
                  fontFamily="Didact Gothic, Century Gothic, sans-serif"
                  letterSpacing="0.08em"
                >
                  SCREEN
                </text>
              </g>
            );
          })()}

          {/* ── Angular-continuity shading ── */}
          {continuityPath && (
            <path
              d={continuityPath}
              fill="#213428"
              fillOpacity={0.06}
              stroke="none"
            />
          )}

          {/* ── Gap arcs ── */}
          {gapArcs.map((arc) => (
            <g key={`gap-${arc.id}`}>
              <path
                d={arc.path}
                fill="none"
                stroke={arc.arcColor}
                strokeWidth={arc.isWorst ? 3 : 1.5}
                strokeOpacity={arc.isWorst ? 0.9 : 0.5}
                strokeDasharray={arc.isWorst ? "6 4" : "4 4"}
              />
              <text
                x={arc.midPt.x}
                y={arc.midPt.y}
                fill={arc.arcColor}
                fontSize={11}
                textAnchor="middle"
                fontFamily="Didact Gothic, Century Gothic, sans-serif"
                fontWeight={arc.isWorst ? 600 : 400}
              >
                {Math.round(arc.deg)}°
              </text>
            </g>
          ))}

          {/* ── Rays from RSP to each speaker ── */}
          {speakersWithAzimuth.map((item, i) => {
            const sp = toPx(item.position.x, item.position.y);
            const isFrontLCR = ["FL", "FC", "FR"].includes(item.canon);
            return (
              <line
                key={`ray-${i}`}
                x1={rspPx.px}
                y1={rspPx.py}
                x2={sp.px}
                y2={sp.py}
                stroke="#625143"
                strokeWidth={isFrontLCR ? 1 : 1.5}
                strokeOpacity={isFrontLCR ? 0.2 : 0.3}
              />
            );
          })}

          {/* ── Speakers ── */}
          {speakersWithAzimuth.map((item, i) => {
            const sp = toPx(item.position.x, item.position.y);
            const isFrontLCR = ["FL", "FC", "FR"].includes(item.canon);
            const isEligible = isEligibleP5Surround(item.canon);
            const color = getRoleColor(item.canon);
            const radius = isEligible ? 7 : 5;
            return (
              <g key={`spk-${i}`}>
                <circle
                  cx={sp.px}
                  cy={sp.py}
                  r={radius}
                  fill={isFrontLCR ? "#3E4349" : color}
                  stroke="#F8F8F7"
                  strokeWidth={1.5}
                  />
                  {/* Role label */}
                  <text
                  x={sp.px}
                  y={sp.py - 12}
                  fill={isFrontLCR ? "#3E4349" : color}
                  fontSize={11}
                  textAnchor="middle"
                  fontFamily="Didact Gothic, Century Gothic, sans-serif"
                  fontWeight={600}
                >
                  {item.role}
                </text>
                {/* Azimuth label */}
                <text
                  x={sp.px}
                  y={sp.py + 18}
                  fill="#625143"
                  fontSize={9}
                  textAnchor="middle"
                  fontFamily="Didact Gothic, Century Gothic, sans-serif"
                >
                  {Math.round(item.azimuth)}°
                </text>
              </g>
            );
          })}

          {/* ── RSP marker ── */}
          <g>
            <circle
              cx={rspPx.px}
              cy={rspPx.py}
              r={10}
              fill="none"
              stroke="#213428"
              strokeWidth={2}
            />
            <circle
              cx={rspPx.px}
              cy={rspPx.py}
              r={4}
              fill="#FFFFFF"
            />
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
        </svg>
      </div>

      {/* ── Status card ── */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "16px 20px",
        background: "#F1F0EE",
        borderRadius: 12,
        border: `1px solid ${statusInfo.color}40`,
      }}>
        <div style={{
          width: 48,
          height: 48,
          borderRadius: 8,
          background: `${statusInfo.color}25`,
          border: `2px solid ${statusInfo.color}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 18,
          fontWeight: 700,
          color: statusInfo.color,
          fontFamily: "Futura PT Light, Century Gothic, sans-serif",
          flexShrink: 0,
        }}>
          {level}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: 16,
            fontWeight: 600,
            color: "#213428",
            marginBottom: 4,
          }}>
            {statusInfo.label}
          </div>
          <div style={{
            fontSize: 13,
            color: "#3E4349",
            lineHeight: 1.5,
          }}>
            The proposed speaker layout creates smooth, continuous movement around the listening position.
          </div>
        </div>
        {Number.isFinite(worstGapDeg) && (
          <div style={{
            textAlign: "right",
            flexShrink: 0,
          }}>
            <div style={{
              fontSize: 11,
              color: "#625143",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: 2,
            }}>
              Worst gap
            </div>
            <div style={{
              fontSize: 20,
              fontWeight: 600,
              color: statusInfo.color,
            }}>
              {Math.round(worstGapDeg)}°
            </div>
          </div>
        )}
      </div>

      {/* ── Footnote ── */}
      <p style={{
        margin: "16px 0 0 0",
        fontSize: 11,
        color: "#625143",
        opacity: 0.6,
        fontStyle: "italic",
        textAlign: "center",
      }}>
        Shading represents angular continuity only and does not imply SPL, dispersion, or measured acoustic coverage.
      </p>
    </div>
  );
}