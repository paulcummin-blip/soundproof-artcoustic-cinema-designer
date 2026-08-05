/**
 * PrintP5Content
 * -------------
 * Print-only P5 page content: heading + SVG drawing + result summary.
 *
 * Uses the same P5 snapshot data as ClientSoundAroundListener but renders
 * three explicit document regions instead of a single responsive card.
 * The SVG is the primary scaling authority — it scales via CSS to fill
 * the drawing region, not via JS transform on the whole card.
 *
 * Screen behaviour: this component is only rendered inside a print-only
 * container (client-report-print-only) and is never visible on screen.
 */

import React, { useMemo } from "react";
import { isEligibleP5Surround } from "@/components/utils/p5SurroundGaps";

// ── Status copy (frozen — matches ClientSoundAroundListener) ───────────────
const STATUS_COPY = {
  L4: { label: "Excellent spatial continuity", color: "#213428", explanation: "The speaker layout creates smooth, precise movement around the listening position." },
  L3: { label: "Very good spatial continuity", color: "#3E4349", explanation: "The speaker layout creates smooth movement around the listening position, with well-controlled spacing between channels." },
  L2: { label: "Good spatial continuity", color: "#625143", explanation: "The layout provides clear movement around the listening position, with slightly wider spacing between some channels." },
  L1: { label: "Further refinement recommended", color: "#4A230F", explanation: "Reducing the widest gap between the surround channels would create smoother movement around the listener." },
  Fail: { label: "Further refinement recommended", color: "#4A230F", explanation: "Reducing the widest gap between the surround channels would create smoother movement around the listener." },
  "—": { label: "Further refinement recommended", color: "#C1B6AD", explanation: "Reducing the widest gap between the surround channels would create smoother movement around the listener." },
};

function getStatusInfo(level) {
  return STATUS_COPY[level] || STATUS_COPY["—"];
}

const ROLE_COLORS = {
  FL: "#3E4349", FC: "#3E4349", FR: "#3E4349",
  SL: "#625143", SR: "#625143",
  SBL: "#4A230F", SBR: "#4A230F",
  LW: "#213428", RW: "#213428",
};

function getRoleColor(canon) {
  return ROLE_COLORS[canon] || "#625143";
}

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

function azimuthToTheta(az) {
  return (az + 360) % 360;
}

export default function PrintP5Content({ p5Snapshot, roomDims, screen, screenFrontPlaneM }) {
  const W = Number(roomDims?.widthM) || 4.5;
  const L = Number(roomDims?.lengthM) || 6.0;

  const PADDING_M = 0.6;
  const totalW = W + PADDING_M * 2;
  const totalH = L + PADDING_M * 2;
  const SVG_W = 760;
  const SVG_H = Math.round(SVG_W * (totalH / totalW));
  const SCALE = SVG_W / totalW;

  const toPx = (x, y) => ({
    px: (x + PADDING_M) * SCALE,
    py: (y + PADDING_M) * SCALE,
  });

  const rsp = p5Snapshot?.rsp;
  const speakersWithAzimuth = p5Snapshot?.speakersWithAzimuth || [];
  const gaps = p5Snapshot?.gaps || [];
  const level = p5Snapshot?.level || "—";
  const worstGapDeg = p5Snapshot?.worstGapDeg;
  const geometryWorstGapDeg = p5Snapshot?.geometryWorstGapDeg ?? worstGapDeg;
  const statusInfo = getStatusInfo(level);

  const screenViewWm = useMemo(() => {
    const inches = Number(screen?.visibleWidthInches) || 0;
    return inches * 0.0254;
  }, [screen?.visibleWidthInches]);

  const screenCenterX = W / 2;
  const screenY = Math.max(0, Number(screenFrontPlaneM) || 0);
  const screenLineY = toPx(0, screenY).py;

  const rspPx = rsp ? toPx(rsp.x, rsp.y) : null;

  const polarToSvg = (cx, cy, radiusM, thetaDeg) => {
    const rad = (thetaDeg - 90) * (Math.PI / 180);
    return {
      x: cx + radiusM * Math.cos(rad) * SCALE,
      y: cy + radiusM * Math.sin(rad) * SCALE,
    };
  };

  const surroundsWithTheta = useMemo(() => {
    return speakersWithAzimuth
      .filter((item) => isEligibleP5Surround(item.canon))
      .map((item) => ({ ...item, theta: azimuthToTheta(item.azimuth) }))
      .sort((a, b) => a.theta - b.theta);
  }, [speakersWithAzimuth]);

  const SHADING_RADIUS_M = Math.min(W, L) * 0.35;

  const continuityPath = useMemo(() => {
    if (!rspPx || surroundsWithTheta.length < 2) return null;
    const first = surroundsWithTheta[0];
    const last = surroundsWithTheta[surroundsWithTheta.length - 1];
    const startPt = polarToSvg(rspPx.px, rspPx.py, SHADING_RADIUS_M, first.theta);
    const endPt = polarToSvg(rspPx.px, rspPx.py, SHADING_RADIUS_M, last.theta);
    const sweepDeg = last.theta - first.theta;
    const largeArc = sweepDeg > 180 ? 1 : 0;
    return `M ${rspPx.px} ${rspPx.py} L ${startPt.x} ${startPt.y} A ${SHADING_RADIUS_M * SCALE} ${SHADING_RADIUS_M * SCALE} 0 ${largeArc} 1 ${endPt.x} ${endPt.y} Z`;
  }, [rspPx, surroundsWithTheta, SHADING_RADIUS_M, SCALE]);

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
      const isWorst = Number.isFinite(geometryWorstGapDeg) && Math.abs(gap.deg - geometryWorstGapDeg) < 0.01;
      const arcColor = isWorst ? "#4A230F" : "#625143";
      return {
        id: i,
        path: `M ${startPt.x} ${startPt.y} A ${ARC_RADIUS_M * SCALE} ${ARC_RADIUS_M * SCALE} 0 ${largeArc} 1 ${endPt.x} ${endPt.y}`,
        midPt, deg: gap.deg, fromRole: gap.fromRole, toRole: gap.toRole, isWorst, arcColor,
      };
    });
  }, [rspPx, surroundsWithTheta, gaps, geometryWorstGapDeg, SHADING_RADIUS_M, SCALE]);

  if (!p5Snapshot || !rspPx) return null;

  return (
    <>
      {/* ── Heading ── */}
      <div className="client-report-print-heading">
        <h1 className="client-report-print-heading__title">Spatial Resolution</h1>
        <p className="client-report-print-heading__subtitle">RP22 Parameter 5 — Horizontal speaker spacing</p>
      </div>

      {/* ── Drawing ── */}
      <div className="client-report-print-drawing">
        <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="client-report-print-svg">
          <rect width={SVG_W} height={SVG_H} fill="#F8F8F7" rx="12" />

          {/* Room outline */}
          {(() => {
            const tl = toPx(0, 0);
            const br = toPx(W, L);
            return (
              <rect x={tl.px} y={tl.py} width={(br.px - tl.px)} height={(br.py - tl.py)}
                fill="none" stroke="#C1B6AD" strokeOpacity={0.5} strokeWidth={2} rx={4} />
            );
          })()}

          {/* Screen */}
          {(() => {
            const screenHalfW = (screenViewWm || W * 0.6) / 2;
            const left = toPx(screenCenterX - screenHalfW, screenY);
            const right = toPx(screenCenterX + screenHalfW, screenY);
            return (
              <g>
                <line x1={left.px} y1={left.py} x2={right.px} y2={right.py}
                  stroke="#625143" strokeWidth={5} strokeLinecap="round" />
                <text x={(left.px + right.px) / 2} y={left.py - 10} fill="#625143"
                  fontSize={11} textAnchor="middle"
                  fontFamily="Didact Gothic, Century Gothic, sans-serif" letterSpacing="0.08em">SCREEN</text>
              </g>
            );
          })()}

          {/* Angular-continuity shading */}
          {continuityPath && (
            <path d={continuityPath} fill="#213428" fillOpacity={0.06} stroke="none" />
          )}

          {/* Gap arcs */}
          {gapArcs.map((arc) => (
            <g key={`gap-${arc.id}`}>
              <path d={arc.path} fill="none" stroke={arc.arcColor}
                strokeWidth={arc.isWorst ? 3 : 1.5}
                strokeOpacity={arc.isWorst ? 0.9 : 0.5}
                strokeDasharray={arc.isWorst ? "6 4" : "4 4"} />
              <text x={arc.midPt.x} y={arc.midPt.y} fill={arc.arcColor}
                fontSize={11} textAnchor="middle"
                fontFamily="Didact Gothic, Century Gothic, sans-serif"
                fontWeight={arc.isWorst ? 600 : 400}>{Math.round(arc.deg)}°</text>
            </g>
          ))}

          {/* Rays */}
          {speakersWithAzimuth.map((item, i) => {
            const sp = toPx(item.position.x, item.position.y);
            const isFrontLCR = ["FL", "FC", "FR"].includes(item.canon);
            return (
              <line key={`ray-${i}`} x1={rspPx.px} y1={rspPx.py} x2={sp.px} y2={sp.py}
                stroke="#625143" strokeWidth={isFrontLCR ? 1 : 1.5}
                strokeOpacity={isFrontLCR ? 0.2 : 0.3} />
            );
          })}

          {/* Speakers */}
          {speakersWithAzimuth.map((item, i) => {
            const sp = toPx(item.position.x, item.position.y);
            const isFrontLCR = ["FL", "FC", "FR"].includes(item.canon);
            const isEligible = isEligibleP5Surround(item.canon);
            const color = getRoleColor(item.canon);
            const radius = isEligible ? 7 : 5;
            return (
              <g key={`spk-${i}`}>
                <circle cx={sp.px} cy={sp.py} r={radius}
                  fill={isFrontLCR ? "#3E4349" : color} stroke="#F8F8F7" strokeWidth={1.5} />
                <text x={sp.px} y={sp.py - 12}
                  fill={isFrontLCR ? "#3E4349" : color}
                  fontSize={11} textAnchor="middle"
                  fontFamily="Didact Gothic, Century Gothic, sans-serif" fontWeight={600}>{item.role}</text>
                {(() => {
                  let labelX = sp.px;
                  let labelY = sp.py + 18;
                  if (isFrontLCR) { labelX = sp.px; labelY = screenLineY + 25; }
                  return (
                    <text x={labelX} y={labelY} fill="#625143"
                      fontSize={9} textAnchor="middle"
                      fontFamily="Didact Gothic, Century Gothic, sans-serif">{Math.round(item.azimuth)}°</text>
                  );
                })()}
              </g>
            );
          })}

          {/* RSP marker */}
          <g>
            <circle cx={rspPx.px} cy={rspPx.py} r={10} fill="none" stroke="#213428" strokeWidth={2} />
            <circle cx={rspPx.px} cy={rspPx.py} r={4} fill="#FFFFFF" />
            <text x={rspPx.px} y={rspPx.py + 24} fill="#213428"
              fontSize={11} textAnchor="middle"
              fontFamily="Didact Gothic, Century Gothic, sans-serif"
              fontWeight={600} letterSpacing="0.08em">RSP</text>
          </g>
        </svg>
      </div>

      {/* ── Result ── */}
      <div className="client-report-print-result" style={{ borderColor: `${statusInfo.color}40` }}>
        <div className="client-report-print-result__badge" style={{
          borderColor: statusInfo.color,
          background: `${statusInfo.color}25`,
          color: statusInfo.color,
        }}>
          {level}
        </div>
        <div className="client-report-print-result__content">
          <div className="client-report-print-result__label">{statusInfo.label}</div>
          <div className="client-report-print-result__explanation">{statusInfo.explanation}</div>
          {Number.isFinite(worstGapDeg) && (
            <div className="client-report-print-result__supporting">
              {Math.round(worstGapDeg)}° largest spacing — RP22 Parameter 5
            </div>
          )}
        </div>
      </div>
    </>
  );
}