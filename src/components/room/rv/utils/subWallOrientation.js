// subWallOrientation.js — pure wall-aware cabinet orientation for subwoofers.
//
// Stage 2B.5: When a subwoofer is positioned near a side wall, its cabinet
// rotates 90° so the longest edge runs parallel to the wall. Front and rear
// walls keep the default orientation. Away from any wall, the sub returns
// to default (0°). This is a PHYSICAL cabinet placement rule only — it does
// not change acoustic source polarity, radiation, or bass simulation in any
// way. Subwoofers always remain positive-pressure sources firing into the
// room. Orientation is derived purely from the instance position; there is
// no manual wall selection and no persistent lock.

const WALL_ZONE_M = 0.15; // centre-to-wall distance (beyond max half-extent) that counts as "near"
const CLEARANCE_M = 0.01; // 10 mm wall clearance

/**
 * Determine which wall (if any) a subwoofer is nearest to, and the
 * corresponding cabinet orientation.
 *
 * Front/rear walls → 0° (default). Left/right walls → 90° (long edge ∥ wall).
 * Away from any wall → 0°.
 *
 * @returns {{ wall: 'front'|'rear'|'left'|'right'|null, rotationDeg: 0|90 }}
 */
export function deriveSubWallOrientation({ x, y, widthM, lengthM, subWidthM, subDepthM }) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { wall: null, rotationDeg: 0 };
  const W = Number(widthM);
  const L = Number(lengthM);
  if (!Number.isFinite(W) || !Number.isFinite(L) || W <= 0 || L <= 0) {
    return { wall: null, rotationDeg: 0 };
  }
  const halfW = (Number(subWidthM) > 0 ? Number(subWidthM) : 0.5) / 2;
  const halfD = (Number(subDepthM) > 0 ? Number(subDepthM) : 0.3) / 2;
  const probe = Math.max(halfW, halfD) + WALL_ZONE_M;

  const candidates = [
    { wall: 'front', dist: y, rot: 0 },
    { wall: 'rear', dist: L - y, rot: 0 },
    { wall: 'left', dist: x, rot: 90 },
    { wall: 'right', dist: W - x, rot: 90 },
  ];

  let nearest = null;
  for (const c of candidates) {
    if (Number.isFinite(c.dist) && c.dist <= probe && (!nearest || c.dist < nearest.dist)) {
      nearest = c;
    }
  }
  if (!nearest) return { wall: null, rotationDeg: 0 };
  return { wall: nearest.wall, rotationDeg: nearest.rot };
}

/**
 * Effective half-extents along the room X and Y axes for a subwoofer given
 * its cabinet dimensions and orientation. Used for wall-clearance clamping.
 *
 * rotation 0  → widthM along X, depthM along Y.
 * rotation 90 → depthM along X, widthM along Y.
 */
export function subHalfExtents(subWidthM, subDepthM, rotationDeg) {
  const halfW = (Number(subWidthM) > 0 ? Number(subWidthM) : 0.5) / 2;
  const halfD = (Number(subDepthM) > 0 ? Number(subDepthM) : 0.3) / 2;
  if (rotationDeg === 90) return { halfX: halfD, halfY: halfW };
  return { halfX: halfW, halfY: halfD };
}

/**
 * Read a subwoofer's effective rotation for rendering. Returns the stored
 * `rotationDeg` when finite, otherwise derives it from the instance
 * position so pre-existing / recommendation-applied subs render correctly
 * before any drag. Pure display helper — never mutates the instance.
 */
export function getSubRotationDeg(sub, subWidthM, subDepthM, widthM, lengthM) {
  const stored = Number(sub?.rotationDeg);
  if (Number.isFinite(stored)) return stored;
  const { rotationDeg } = deriveSubWallOrientation({
    x: sub?.position?.x,
    y: sub?.position?.y,
    widthM,
    lengthM,
    subWidthM,
    subDepthM,
  });
  return rotationDeg;
}

export { WALL_ZONE_M, CLEARANCE_M };