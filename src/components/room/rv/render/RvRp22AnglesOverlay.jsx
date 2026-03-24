"use client";

export default function RvRp22AnglesOverlay({
  hasRoomRect,
  scale,
  effectiveHoveredSeat,
  visiblePlanSpeakers,
  getCanonicalRole,
  toPx,
  floorDeg,
}) {
  if (!hasRoomRect) return null;
  if (!Number.isFinite(scale)) return null;
  if (!effectiveHoveredSeat) return null;

  const extraSurroundPattern = /^(SL|SR)\d+$/;
  const allSurrounds = (visiblePlanSpeakers || []).filter((s) => {
    if (!s?.position || !Number.isFinite(s.position.x) || !Number.isFinite(s.position.y)) return false;
    const r = getCanonicalRole(s.role);
    const roleUpper = String(s.role || '').toUpperCase();
    return ["SL", "SR", "SBL", "SBR", "LW", "RW"].includes(r) || extraSurroundPattern.test(roleUpper);
  });

  if (allSurrounds.length < 2) return null;

  const azimuthDegFromSeat = (seat, pt) => {
    if (!seat || !pt) return null;
    const dx = Number(pt.x) - Number(seat.x);
    const dy = Number(pt.y) - Number(seat.y);
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
    const rad = Math.atan2(dx, -dy);
    let deg = rad * (180 / Math.PI);
    if (deg > 180) deg -= 360;
    if (deg <= -180) deg += 360;
    return deg;
  };

  const az = [];
  for (const sp of allSurrounds) {
    const a = azimuthDegFromSeat(effectiveHoveredSeat, sp.position);
    if (Number.isFinite(a)) {
      const theta = (a + 360) % 360;
      az.push({ a, theta, sp });
    }
  }

  if (az.length < 2) return null;

  const sortedItems = az.sort((a, b) => a.theta - b.theta);

  const segments = [];
  for (let i = 0; i < sortedItems.length - 1; i++) {
    const current = sortedItems[i];
    const next = sortedItems[i + 1];
    const angle1 = current.a;
    const angle2 = next.a;
    const gapDeg = next.theta - current.theta;
    segments.push({ sp1: current.sp, sp2: next.sp, angleA: angle1, angleB: angle2, gapDeg });
  }

  // Identify the true worst gap (same logic as scoring in useRP22AnalysisEngine)
  const worstGapDeg = segments.length > 0 ? Math.max(...segments.map(s => s.gapDeg)) : null;

  const seatPx = toPx(effectiveHoveredSeat.x, effectiveHoveredSeat.y);
  const labelGroup = [];

  segments.forEach(({ sp1, sp2, angleA, angleB, gapDeg }, idx) => {
    const currentTheta = sortedItems[idx].theta;
    const nextTheta = sortedItems[idx + 1].theta;
    const midTheta = (currentTheta + nextTheta) / 2;
    const rawMid = midTheta;
    const midNorm = ((midTheta + 180) % 360) - 180;
    const isWorstGap = Number.isFinite(worstGapDeg) && gapDeg === worstGapDeg;

    // Show the worst gap regardless of position; skip non-worst front gaps
    if (!isWorstGap && Math.abs(midNorm) < 60) return;

    const deg = gapDeg;
    if (!Number.isFinite(deg) || deg <= 0) return;

    const [x1, y1] = toPx(sp1.position.x, sp1.position.y);
    const [x2, y2] = toPx(sp2.position.x, sp2.position.y);

    const lineColor = isWorstGap ? "#e85" : "#888";
    const lineOpacity = isWorstGap ? "0.9" : "0.6";

    labelGroup.push(
      <line
        key={`rp22-angle-line1-${idx}`}
        x1={x1} y1={y1} x2={seatPx[0]} y2={seatPx[1]}
        stroke={lineColor} strokeWidth="1" opacity={lineOpacity}
      />
    );
    labelGroup.push(
      <line
        key={`rp22-angle-line2-${idx}`}
        x1={x2} y1={y2} x2={seatPx[0]} y2={seatPx[1]}
        stroke={lineColor} strokeWidth="1" opacity={lineOpacity}
      />
    );

    const R = 0.6;
    const [px, py] = toPx(
      effectiveHoveredSeat.x + R * Math.sin((rawMid * Math.PI) / 180),
      effectiveHoveredSeat.y - R * Math.cos((rawMid * Math.PI) / 180)
    );

    const degFloor = floorDeg(deg);
    const text = degFloor !== null ? `${degFloor}°` : '—';

    labelGroup.push(
      <text
        key={`rp22-angle-text-${idx}`}
        x={px} y={py}
        fill={isWorstGap ? "#e85" : "#666"} fontSize={isWorstGap ? "12" : "11"} fontWeight={isWorstGap ? "bold" : "normal"}
        textAnchor="middle" dominantBaseline="middle"
      >
        {text}
      </text>
    );
  });

  if (!labelGroup.length) return null;

  return <g aria-label="rp22-surround-angles">{labelGroup}</g>;
}