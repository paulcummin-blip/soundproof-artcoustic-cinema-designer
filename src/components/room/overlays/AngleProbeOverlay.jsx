import React, { useMemo } from "react";
import { interiorAngleDeg } from "@/components/utils/angles";

/** Brand colours only (no primaries) */
const INK = "#213428";   // lines
const BROWN = "#625143"; // arc
const SLATE = "#3E4349"; // label

/** Simple front-row centre (tolerant) */
function computeFrontRowCenter(seats, W, L) {
  const v = (Array.isArray(seats) ? seats : []).filter(
    (s) => Number.isFinite(s?.x) && Number.isFinite(s?.y)
  );
  if (!v.length) return { x: W / 2, y: Math.min(L * 0.58, L - 1.2) };
  const yFront = Math.min(...v.map((s) => s.y));
  const eps = Math.max(0.01, Math.min(0.12, L * 0.01));
  const row = v
    .filter((s) => Math.abs(s.y - yFront) <= eps)
    .sort((a, b) => a.x - b.x);
  if (!row.length) return { x: W / 2, y: yFront };
  const xs = row.map((s) => s.x);
  const xMid = (xs[0] + xs[xs.length - 1]) / 2;
  const yMid = row.reduce((acc, s) => acc + s.y, 0) / row.length;
  return { x: xMid, y: yMid };
}

/**
 * Draws two rays from the MLP to two speakers and an arc label of their interior angle.
 * Props:
 *  - dimensions {width,length}
 *  - seatingPositions []
 *  - speakers [] (each {role, position:{x,y}})
 *  - pairRoles: ["SR","SBR"] by default
 *  - scale, padding, visible
 */
export default function AngleProbeOverlay({
  dimensions,
  seatingPositions,
  speakers,
  pairRoles = ["SR", "SBR"],
  scale = 1,
  padding = 0,
  visible = true,
}) {
  if (!visible) return null;
  const W = Number(dimensions?.width) || 4.5;
  const L = Number(dimensions?.length) || 6.0;
  const px = (m) => padding + m * scale;

  const mlp = useMemo(
    () => computeFrontRowCenter(seatingPositions || [], W, L),
    [seatingPositions, W, L]
  );

  const byRole = useMemo(() => {
    const m = new Map();
    (Array.isArray(speakers) ? speakers : []).forEach((s) => {
      if (s?.role && s?.position) m.set(String(s.role).toUpperCase(), s.position);
    });
    return m;
  }, [speakers]);

  const A = byRole.get(String(pairRoles[0]).toUpperCase());
  const B = byRole.get(String(pairRoles[1]).toUpperCase());
  if (!A || !B || !mlp) return null;

  const ang = interiorAngleDeg(mlp, A, B);

  // Screen-space points
  const mpx = { x: px(mlp.x), y: px(mlp.y) };
  const ax = { x: px(A.x), y: px(A.y) };
  const bx = { x: px(B.x), y: px(B.y) };

  // Bearings (CW) in radians for arc endpoints
  const aBear = (Math.atan2(ax.x - mpx.x, mpx.y - ax.y) + Math.PI * 2) % (Math.PI * 2);
  const bBear = (Math.atan2(bx.x - mpx.x, mpx.y - bx.y) + Math.PI * 2) % (Math.PI * 2);

  // Ensure we sweep the smaller interior angle (<= π)
  let start = aBear, end = bBear;
  let sweep = end - start;
  if (sweep < 0) sweep += Math.PI * 2;
  if (sweep > Math.PI) {
    [start, end] = [end, start];
    sweep = end - start;
    if (sweep < 0) sweep += Math.PI * 2;
  }

  // Arc geometry (constant radius in px)
  const r = 36;
  const sx = mpx.x + r * Math.sin(start);
  const sy = mpx.y - r * Math.cos(start);
  const ex = mpx.x + r * Math.sin(end);
  const ey = mpx.y - r * Math.cos(end);
  const largeArc = sweep > Math.PI ? 1 : 0;

  return (
    <g data-overlay="angle-probe" style={{ pointerEvents: "none" }}>
      {/* Rays */}
      <path
        d={`M ${mpx.x},${mpx.y} L ${ax.x},${ax.y}`}
        stroke={INK}
        strokeWidth="2"
        strokeDasharray="8 6"
        fill="none"
      />
      <path
        d={`M ${mpx.x},${mpx.y} L ${bx.x},${bx.y}`}
        stroke={INK}
        strokeWidth="2"
        strokeDasharray="8 6"
        fill="none"
      />

      {/* Arc of interior angle */}
      <path
        d={`M ${sx},${sy} A ${r},${r} 0 ${largeArc} 1 ${ex},${ey}`}
        stroke={BROWN}
        strokeWidth="2"
        fill="none"
      />

      {/* Label */}
      <text
        x={mpx.x}
        y={mpx.y - (r + 10)}
        textAnchor="middle"
        fontSize="12"
        fontWeight="700"
        fill={SLATE}
        style={{ paintOrder: "stroke", stroke: "#fff", strokeWidth: 3 }}
      >
        {ang.toFixed(1)}°
      </text>
    </g>
  );
}