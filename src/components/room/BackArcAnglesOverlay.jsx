import React, { useMemo } from "react";
import { computeBackArcGaps } from "@/components/utils/surroundBackSweep";
import { computeFrontRowCenter } from "@/components/room/padsGeometry";

// Brand tones only
const STROKE = "#213428";       // brand deep green
const TEXT   = "#1B1A1A";       // brand ink
const DASH   = "6 6";

export default function BackArcAnglesOverlay({
  dimensions, seatingPositions, speakers, scale = 1, padding = 0, visible = true
}) {
  const W = Number(dimensions?.width) || 4.5;
  const L = Number(dimensions?.length) || 6.0;
  const mlp = useMemo(
    () => computeFrontRowCenter(Array.isArray(seatingPositions) ? seatingPositions : [], W, L),
    [seatingPositions, W, L]
  );

  const bed = (Array.isArray(speakers) ? speakers : []).map(s => ({
    id: String(s.id || s.role || ""),
    role: String(s.role || ""),
    position: { x: Number(s.position?.x) || 0, y: Number(s.position?.y) || 0 }
  }));

  const { backAngles, backPairs } = useMemo(
    () => computeBackArcGaps(bed, mlp),
    [bed, mlp]
  );

  const px = (m) => padding + m * scale;

  // small annotation arc around the MLP, regardless of true radius (just a visual)
  const AnnArc = ({ a0, a1 }) => {
    const r = 46; // px
    const toXY = (deg) => {
      const rad = (deg * Math.PI) / 180;
      const dx = Math.sin(rad), dy = -Math.cos(rad);
      return { x: px(mlp.x) + dx * r, y: px(mlp.y) + dy * r };
    };
    const p0 = toXY(a0), p1 = toXY(a1);
    const large = ((a1 - a0 + 360) % 360) > 180 ? 1 : 0;
    return (
      <path
        d={`M ${p0.x} ${p0.y} A ${r} ${r} 0 ${large} 1 ${p1.x} ${p1.y}`}
        fill="none"
        stroke={STROKE}
        strokeWidth="2"
        strokeDasharray={DASH}
        opacity="0.8"
      />
    );
  };

  // We need the start/end azimuths for annotation; recompute locally
  const ann = useMemo(() => {
    const RAD2DEG = 180 / Math.PI;
    const azCW = (p) => {
      const dx = p.x - mlp.x, dy = mlp.y - p.y;
      let d = Math.atan2(dx, dy) * RAD2DEG;
      if (d < 0) d += 360;
      return d;
    };
    return backPairs.map(([a, b]) => [azCW(a.position), azCW(b.position)]);
  }, [backPairs, mlp]);

  if (!visible) return null;

  return (
    <g data-overlay="angles" style={{ pointerEvents: "none" }}>
      {backPairs.map(([a, b], i) => (
        <g key={`pair-${i}`}>
          <line
            x1={px(mlp.x)} y1={px(mlp.y)} x2={px(a.position.x)} y2={px(a.position.y)}
            stroke={STROKE} strokeWidth="2" strokeDasharray={DASH} opacity="0.7"
          />
          <line
            x1={px(mlp.x)} y1={px(mlp.y)} x2={px(b.position.x)} y2={px(b.position.y)}
            stroke={STROKE} strokeWidth="2" strokeDasharray={DASH} opacity="0.7"
          />
          <AnnArc a0={ann[i][0]} a1={ann[i][1]} />
          <text
            x={px(mlp.x)} y={px(mlp.y) - 60 - i * 16}
            textAnchor="middle" fontSize="12" fontWeight="700" fill={TEXT}
            style={{ paintOrder: "stroke", stroke: "#fff", strokeWidth: 2 }}
          >
            {`${a.role} → ${b.role} ~${Math.round(backAngles[i] || 0)}°`}
          </text>
        </g>
      ))}
    </g>
  );
}