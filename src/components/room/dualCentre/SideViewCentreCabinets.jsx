import React from "react";

/**
 * The dual-centre centre cabinets in a side elevation.
 *
 * One physical installation, projected: every outline is a cabinet's real
 * installed depth — rotated by its own live aim angle — drawn at its stored
 * acoustic-centre height with its rear face in the front-wall gap. Where the two
 * projections coincide they are drawn ONCE and labelled "FCL / FCR", because the
 * pair is a single centre channel seen edge-on. Projections that genuinely differ
 * each carry their own role label; neither cabinet is ever offset to make the
 * drawing look tidier.
 *
 * Presentational only. The geometry arrives already resolved from the shared side
 * projection authority, which draws from the same installed footprint, wall
 * anchoring and aim resolver as the Plan View.
 */
export default function SideViewCentreCabinets({ groups = [], rx, rz, bindSpeakerInfo = null }) {
  if (!Array.isArray(groups) || groups.length === 0) return null;
  if (typeof rx !== "function" || typeof rz !== "function") return null;

  return (
    <g data-layer="dual-centre-side-cabinets" opacity={0.9}>
      {groups.map((group, i) => {
        const rearX = rx(group.yM);                       // rear face, at the front wall
        const frontX = rx(group.yM + group.depthM);       // baffle face, into the room
        const topPx = rz(group.zM + group.heightM / 2);
        const botPx = rz(group.zM - group.heightM / 2);
        const boxW = Math.max(3, frontX - rearX);
        const boxH = Math.max(3, botPx - topPx);

        return (
          <g
            key={`dual-centre-side-${group.key ?? i}`}
            {...(typeof bindSpeakerInfo === "function" ? bindSpeakerInfo(group) : {})}
          >
            {/* Cabinet side profile — installed depth × installed height */}
            <rect
              x={rearX} y={topPx}
              width={boxW} height={boxH}
              fill="#fff" stroke="#4A4540" strokeWidth={0.9} rx={1} />
            {/* Baffle face — the cabinet faces into the room, away from the wall */}
            <line
              x1={frontX} y1={topPx}
              x2={frontX} y2={botPx}
              stroke="#4A4540" strokeWidth={1.4} />
            {/* Concise identification: one role for a distinct outline, or the
                pair together where their projections coincide. */}
            <text
              x={frontX + 4} y={topPx + boxH / 2 + 3}
              textAnchor="start" fontSize={6}
              fill="#4A4540" fontWeight={600}>
              {group.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}