export function clampToAllowedWithExclusions(x, minX, maxX, exclusions) {
  let intervals = [];
  if (!(maxX > minX)) return minX;
  intervals.push([minX, maxX]);

  for (const ex of exclusions || []) {
    const a = Math.min(ex[0], ex[1]);
    const b = Math.max(ex[0], ex[1]);
    const next = [];
    for (const [s, e] of intervals) {
      if (b <= s || a >= e) { next.push([s, e]); continue; }
      if (a > s) next.push([s, Math.max(s, Math.min(a, e))]);
      if (b < e) next.push([Math.max(s, Math.min(b, e)), e]);
    }
    intervals = next.filter(([s, e]) => e > s);
    if (intervals.length === 0) break;
  }

  if (intervals.length === 0) return Math.min(maxX, Math.max(minX, x));

  let best = intervals[0][0];
  let bestDist = Math.abs(x - best);
  for (const [s, e] of intervals) {
    const cand = Math.min(e, Math.max(s, x));
    const dist = Math.abs(x - cand);
    if (dist < bestDist) { best = cand; bestDist = dist; }
    else if (cand === x) { best = cand; bestDist = 0; break; }
  }
  return best;
}

export function computeBackWallInnerEdges(seatingPositions, roomWidth) {
  const seatXs = (seatingPositions || [])
    .map(s => Number(s?.x))
    .filter(Number.isFinite);
  const leftmostSeatX_m = seatXs.length ? Math.min(...seatXs) : roomWidth * 0.35;
  const rightmostSeatX_m = seatXs.length ? Math.max(...seatXs) : roomWidth * 0.65;
  return { leftmostSeatX_m, rightmostSeatX_m };
}

export function computeRearVisualLanes(roomWidth, seatingPositions, fadeLenM, CORNER_CLEAR_M = 0.50) {
  const { leftmostSeatX_m, rightmostSeatX_m } =
    computeBackWallInnerEdges(seatingPositions, roomWidth);

  const leftLaneMin = CORNER_CLEAR_M;
  const leftLaneMax = Math.max(leftLaneMin, Number(leftmostSeatX_m) + Number(fadeLenM || 0));

  const rightLaneMax = Math.max(CORNER_CLEAR_M, roomWidth - CORNER_CLEAR_M);
  const rightLaneMin = Math.min(rightLaneMax, Number(rightmostSeatX_m) - Number(fadeLenM || 0));

  return {
    left:  { minX: leftLaneMin,  maxX: leftLaneMax },
    right: { minX: rightLaneMin, maxX: rightLaneMax }
  };
}