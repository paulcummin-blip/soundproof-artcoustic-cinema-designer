import React, { useMemo } from 'react';
import {
  getEligibleSurroundsForAngles,
  computeSurroundAnglesSequence,
  computeConsecutiveGaps,
  len
} from './RP22AnglesOverlayHelpers';

/**
 * RP22 Angles Overlay - Stage C
 * Renders rays from MLP to surrounds + gap labels (no wrap)
 */
export default function RP22AnglesOverlay({
  mlp,
  visiblePlacedSpeakers,
  toPx,
  enabled = false
}) {
  // Eligible surrounds for overlay
  const eligibleSurrounds = useMemo(() => {
    return getEligibleSurroundsForAngles(visiblePlacedSpeakers, mlp);
  }, [visiblePlacedSpeakers, mlp]);

  // Ordered sequence (no wrap)
  const surroundAnglesSequence = useMemo(() => {
    return computeSurroundAnglesSequence(eligibleSurrounds, mlp);
  }, [eligibleSurrounds, mlp]);

  // Build overlay JSX
  const overlayContent = useMemo(() => {
    if (!enabled || !mlp || !surroundAnglesSequence || len(surroundAnglesSequence.metas) < 2) {
      return null;
    }

    const { seq, metas } = surroundAnglesSequence;
    if (!len(seq)) return null;

    // Compute gaps between consecutive angles (no wrap)
    const gaps = computeConsecutiveGaps(seq);

    const items = [];
    const labelRadiusM = 0.6; // label distance from MLP
    const seat = mlp;

    // 1) Rays: MLP → each surround
    for (const m of metas) {
      const pt = m.sp.position;
      const [x1, y1] = toPx(seat.x, seat.y);
      const [x2, y2] = toPx(pt.x, pt.y);
      items.push(
        <line
          key={`ray-${m.sp.id}`}
          x1={x1} y1={y1} x2={x2} y2={y2}
          stroke="#888" strokeWidth={1} strokeDasharray="4 4" pointerEvents="none"
        />
      );
    }

    // 2) Angle labels near MLP between consecutive points (no wrap)
    for (let i = 0; i < metas.length - 1; i++) {
      const a1 = seq[i];
      const a2 = seq[i + 1];
      const mid = (a1 + a2) / 2;
      const rad = (mid * Math.PI) / 180;

      // Label point at MLP + radius in the mid direction
      const lx = seat.x + labelRadiusM * Math.sin(rad);
      const ly = seat.y - labelRadiusM * Math.cos(rad);
      const [tx, ty] = toPx(lx, ly);

      const val = gaps[i];
      const text = Number.isFinite(val) ? `${val.toFixed(1)}°` : '—';

      items.push(
        <text
          key={`gap-${i}`}
          x={tx} y={ty}
          fontSize={12}
          fill="#333"
          textAnchor="middle"
          dominantBaseline="middle"
          pointerEvents="none"
          style={{ userSelect: 'none' }}
        >
          {text}
        </text>
      );
    }

    return items;
  }, [enabled, mlp, surroundAnglesSequence, toPx]);

  if (!overlayContent) return null;

  return (
    <g data-testid="rp22-angles-overlay" pointerEvents="none">
      {overlayContent}
    </g>
  );
}