import React from "react";

/**
 * RvSubOpposingAlignmentGuide — drag-time opposing-wall alignment guide.
 *
 * Renders a green dashed line connecting the dragged subwoofer to its opposing
 * partner, with an "ALIGNED" checkmark badge at the midpoint. Read-only
 * overlay; never affects positions or persistence. Only renders when
 * subSnapState.type === "opposing".
 */
export default function RvSubOpposingAlignmentGuide({
  subSnapState,
  draggedItemId,
  frontLive,
  rearLive,
  toPx,
}) {
  if (!subSnapState || subSnapState.type !== "opposing") return null;

  const all = [
    ...(Array.isArray(frontLive) ? frontLive : []),
    ...(Array.isArray(rearLive) ? rearLive : []),
  ];
  const dragged = all.find((s) => s?.id === draggedItemId);
  if (!dragged?.position) return null;

  const partnerPos = subSnapState.partnerPosition;
  if (!partnerPos || !Number.isFinite(partnerPos.x) || !Number.isFinite(partnerPos.y)) return null;

  const [dx, dy] = toPx(dragged.position.x, dragged.position.y);
  const [px, py] = toPx(partnerPos.x, partnerPos.y);
  const midX = (dx + px) / 2;
  const midY = (dy + py) / 2;

  const SNAP_COLOR = "#10B981";

  return (
    <g data-layer="sub-opposing-alignment-guide" style={{ pointerEvents: "none" }}>
      {/* Connecting dashed line between the pair */}
      <line
        x1={dx}
        y1={dy}
        x2={px}
        y2={py}
        stroke={SNAP_COLOR}
        strokeWidth={1.4}
        strokeDasharray="5 3"
      />

      {/* Checkmark badge at midpoint */}
      <g>
        <circle cx={midX} cy={midY} r={8} fill={SNAP_COLOR} />
        <path
          d={`M ${midX - 3.5} ${midY} L ${midX - 1} ${midY + 2.5} L ${midX + 3.5} ${midY - 2.5}`}
          stroke="white"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </g>

      {/* "Aligned" label */}
      <text
        x={midX + 12}
        y={midY + 3}
        textAnchor="start"
        fontSize={7.5}
        fill={SNAP_COLOR}
        fontWeight={700}
        letterSpacing="0.04em"
      >
        Aligned
      </text>
    </g>
  );
}