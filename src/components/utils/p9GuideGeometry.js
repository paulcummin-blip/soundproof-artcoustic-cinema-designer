/**
 * P9 guide geometry for the overhead overlay.
 *
 * Computes the Y positions at which placing an overhead speaker row
 * would cause the RP22 Parameter 9 vertical angle (between adjacent
 * upper rows) to cross the L4/L3/L2 thresholds.
 *
 * Uses the SAME elevation geometry as the canonical P9 authority:
 *   computeUpperVerticalAnglesForSeat in rp22UpperSeatMetrics.jsx
 *
 *   elevDeg = atan2(dz, dy) * 180/PI
 *   where dz = speakerZ - listenerZ, dy = speakerY - listenerY
 *
 * P9 = |elevDeg_rowA - elevDeg_rowB| between adjacent rows
 * P9 thresholds: L4 = 50°, L3 = 60°, L2 = 80° (lower = better)
 *
 * No second P9 grading function — this helper only inverts the same
 * elevation formula to find the Y at which a row would produce a given
 * P9 angle relative to a fixed adjacent row.
 */

const P9_THRESHOLDS = [
  { level: 'L4', deg: 50 },
  { level: 'L3', deg: 60 },
  { level: 'L2', deg: 80 },
];

/**
 * @param {Object} params
 * @param {number} params.mlpY          - Listener Y position (m)
 * @param {number} params.ceilingHeightM - Ceiling height (m)
 * @param {number} params.earHeightM    - Listener ear height (m)
 * @param {number} params.frontCenterY  - Ideal front row center Y (m)
 * @param {number} params.rearCenterY   - Ideal rear row center Y (m)
 * @param {number} params.midCenterY    - Mid row center Y (m, ≈ mlpY for 6-height)
 * @param {boolean} params.hasMid       - Whether a mid row exists (6-height)
 * @returns {{ frontGuides: Array<{level, yM}>, rearGuides: Array<{level, yM}> }}
 */
export function computeP9GuideYs({
  mlpY,
  ceilingHeightM,
  earHeightM,
  frontCenterY,
  rearCenterY,
  midCenterY,
  hasMid,
}) {
  const dz = Math.max(0.1, (Number(ceilingHeightM) || 2.7) - (Number(earHeightM) || 1.2));
  const seatY = Number(mlpY) || 0;

  const rad = deg => deg * Math.PI / 180;
  const elevDeg = dy => Math.atan2(dz, dy) * 180 / Math.PI;

  const frontGuides = [];
  const rearGuides = [];

  // Invert: given a target elevation angle, find the Y that produces it.
  // elevDeg = atan2(dz, dy)  →  dy = dz / tan(elevDeg_rad)
  const yFromElev = (elevTarget) => {
    if (!Number.isFinite(elevTarget) || elevTarget <= 0.01 || elevTarget >= 179.99) return null;
    const tanVal = Math.tan(rad(elevTarget));
    if (!Number.isFinite(tanVal) || Math.abs(tanVal) < 1e-6) return null;
    const dy = dz / tanVal;
    if (!Number.isFinite(dy)) return null;
    return seatY + dy;
  };

  if (hasMid) {
    // 6-height: front adjacent to mid, rear adjacent to mid
    const dyMid = (Number(midCenterY) || seatY) - seatY;
    const elevMid = elevDeg(dyMid);

    for (const { level, deg } of P9_THRESHOLDS) {
      // Front row is at higher elevDeg than mid (forward → elevDeg > 90)
      const yFront = yFromElev(elevMid + deg);
      if (yFront != null) frontGuides.push({ level, yM: yFront });

      // Rear row is at lower elevDeg than mid (rearward → elevDeg < 90)
      const yRear = yFromElev(elevMid - deg);
      if (yRear != null) rearGuides.push({ level, yM: yRear });
    }
  } else {
    // 4-height: front adjacent to rear
    const dyRear = (Number(rearCenterY) || seatY) - seatY;
    const dyFront = (Number(frontCenterY) || seatY) - seatY;
    const elevRear = elevDeg(dyRear);
    const elevFront = elevDeg(dyFront);

    for (const { level, deg } of P9_THRESHOLDS) {
      // Front guide: fix rear, vary front. P9 = elevFront - elevRear
      const yFront = yFromElev(elevRear + deg);
      if (yFront != null) frontGuides.push({ level, yM: yFront });

      // Rear guide: fix front, vary rear. P9 = elevFront - elevRear
      const yRear = yFromElev(elevFront - deg);
      if (yRear != null) rearGuides.push({ level, yM: yRear });
    }
  }

  return { frontGuides, rearGuides };
}