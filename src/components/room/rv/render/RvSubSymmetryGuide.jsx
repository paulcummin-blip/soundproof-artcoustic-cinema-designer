import React from "react";

/**
 * RvSubSymmetryGuide — drag-time symmetry snap guide for subwoofers.
 *
 * Renders a dashed line at the snap axis and a SYMMETRY badge near the
 * dragged sub. Read-only overlay; never affects positions or persistence.
 */
export default function RvSubSymmetryGuide({
  subSnapState,
  draggedItemId,
  frontLive,
  rearLive,
  toPx,
  widthM,
  lengthM,
}) {
  if (!subSnapState) return null;

  const all = [
    ...(Array.isArray(frontLive) ? frontLive : []),
    ...(Array.isArray(rearLive) ? rearLive : []),
  ];
  const dragged = all.find((s) => s?.id === draggedItemId);
  if (!dragged?.position) return null;

  const [cx, cy] = toPx(dragged.position.x, dragged.position.y);
  const SNAP_COLOR = "#10B981";

  const badge = (
    <g>
      <rect x={cx + 7} y={cy - 16} width={86} height={22} fill={SNAP_COLOR} rx={2} />
      <text x={cx + 50} y={cy - 5} textAnchor="middle" fontSize={7} fill="white" fontWeight={700} letterSpacing="0.06em">SYMMETRY</text>
      <text x={cx + 50} y={cy + 5} textAnchor="middle" fontSize={6.5} fill="white" fontWeight={600}>{subSnapState.value.toFixed(2)}m</text>
    </g>
  );

  return (
    <g data-layer="sub-symmetry-guide" style={{ pointerEvents: "none" }}>
      {subSnapState.axis === "x" && (() => {
        const [lx] = toPx(subSnapState.value, 0);
        const [, topY] = toPx(0, 0);
        const [, botY] = toPx(0, lengthM);
        return (
          <g>
            <line x1={lx} y1={topY} x2={lx} y2={botY} stroke={SNAP_COLOR} strokeWidth={1.2} strokeDasharray="6 3" />
            {badge}
          </g>
        );
      })()}
      {subSnapState.axis === "y" && (() => {
        const [, ly] = toPx(0, subSnapState.value);
        const [leftX] = toPx(0, 0);
        const [rightX] = toPx(widthM, 0);
        return (
          <g>
            <line x1={leftX} y1={ly} x2={rightX} y2={ly} stroke={SNAP_COLOR} strokeWidth={1.2} strokeDasharray="6 3" />
            {badge}
          </g>
        );
      })()}
    </g>
  );
}