// utils/frontWideUtils.js

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// spanTop/bottom are the usable Y extents of the left/right wall (m) you allow for speakers
export function computeFrontWidesLikeSurrounds(params) {
  const { L, R, LS, RS, spanTop, spanBottom } = params;

  // LW: copy LS.x (same wall inset look), midpoint Y between L and LS, snapped to span
  const LW = {
    x: LS.x,                            // same inset as LS => looks identical on wall
    y: clamp((L.y + LS.y) / 2, spanTop, spanBottom),
  };

  // RW: copy RS.x, midpoint Y between R and RS, snapped
  const RW = {
    x: RS.x,
    y: clamp((R.y + RS.y) / 2, spanTop, spanBottom),
  };

  return { LW, RW };
}

/**
 * Legacy function - now calls the new implementation
 */
export function computeFrontWides({ L, R, LS, RS, room }) {
  if (!L || !R || !LS || !RS || !room) return { LW: null, RW: null };
  
  return computeFrontWidesLikeSurrounds({
    L, R, LS, RS,
    spanTop: room.yMin,
    spanBottom: room.yMax
  });
}