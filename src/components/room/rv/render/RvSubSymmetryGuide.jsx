import React from "react";

/**
 * RvSubSymmetryGuide — drag-time same-wall symmetry snap guide for subwoofers.
 *
 * Renders a green dashed line connecting the dragged subwoofer to its mirrored
 * partner, a "Symmetrical" badge, and — when the RSP is centrally positioned —
 * equal-distance indicators showing the pair is also equidistant from the RSP.
 * When the RSP is offset, the RSP equidistance indicators are suppressed so the
 * guide never falsely claims equal RSP distances.
 *
 * Read-only overlay; never affects positions or persistence.
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
  if (!subSnapState || subSnapState.type !== "symmetry") return null;

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
  const rspEquidistant = subSnapState.rspEquidistant === true;

  return (
    <g data-layer="sub-symmetry-guide" style={{ pointerEvents: "none" }}>
      {/* Connecting dashed line between the symmetric pair */}
      <line
        x1={dx}
        y1={dy}
        x2={px}
        y2={py}
        stroke={SNAP_COLOR}
        strokeWidth={1.4}
        strokeDasharray="5 3"
      />

      {/* "Symmetrical" pill badge at midpoint */}
      <g>
        <rect
          x={midX - 34}
          y={midY - 8}
          width={68}
          height={16}
          rx={8}
          fill={SNAP_COLOR}
          opacity={0.92}
        />
        <text
          x={midX}
          y={midY + 3}
          textAnchor="middle"
          fontSize={6.5}
          fill="white"
          fontWeight={700}
          letterSpacing="0.08em"
        >
          SYMMETRICAL
        </text>
      </g>

      {/* Equal-distance labels on each side of the pair */}
      <text
        x={dx}
        y={dy - 6}
        textAnchor="middle"
        fontSize={6}
        fill={SNAP_COLOR}
        fontWeight={600}
      >
        Equal
      </text>
      <text
        x={px}
        y={py - 6}
        textAnchor="middle"
        fontSize={6}
        fill={SNAP_COLOR}
        fontWeight={600}
      >
        Equal
      </text>

      {/* RSP equidistance indicator — only when RSP is central */}
      {rspEquidistant && (() => {
        // Small "d" label at each end indicating equal distance from RSP
        return (
          <g>
            <text
              x={dx + 8}
              y={dy + 4}
              textAnchor="start"
              fontSize={5.5}
              fill={SNAP_COLOR}
              fontWeight={500}
            >
              d
            </text>
            <text
              x={px + 8}
              y={py + 4}
              textAnchor="start"
              fontSize={5.5}
              fill={SNAP_COLOR}
              fontWeight={500}
            >
              d
            </text>
          </g>
        );
      })()}
    </g>
  );
}