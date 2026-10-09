// Dual-centre linked-pair authority.
//
// The two physical centre cabinets of the "TV with dual centre speakers" front
// stage (FCL / FCR) are ONE linked pair: each is the reflection of the other
// about the room's horizontal centreline, and a height change applies to both.
// Plan View, Front Elevation and the elevation drag commit all read this single
// rule, so the two views can never disagree about where the pair sits.
//
// Pure — no React. Safe for the plan drag solver, the elevation drag handlers
// and the drawing components alike.

import { isCentreCabinetRole } from "@/components/utils/frontStageModeAuthority";

const PAIR_PARTNER = { FCL: "FCR", FCR: "FCL" };

/** The other cabinet of the pair, or null when the role is not a centre cabinet. */
export function centreCabinetPartnerRole(role) {
  const r = String(role || "").toUpperCase();
  if (!isCentreCabinetRole(r)) return null;
  return PAIR_PARTNER[r] || null;
}

/** The room-centreline mirror of a position — the pair's symmetry rule. */
export function mirrorAboutRoomCentre(roomWidthM, x) {
  const roomW = Number(roomWidthM);
  const value = Number(x);
  if (!Number.isFinite(roomW) || roomW <= 0 || !Number.isFinite(value)) return null;
  return roomW - value;
}

/**
 * The linked pair positions for a move of one cabinet.
 *
 * The dragged cabinet keeps the position it was moved to — including the axes
 * it did not move on — and its partner takes the mirrored position: x reflected
 * about the room centreline, y and z shared with the dragged cabinet. So a
 * horizontal move sends the partner the same distance the opposite way, and a
 * vertical move carries both cabinets together.
 *
 * Returns null when the role is not a centre cabinet, when the room width or
 * the dragged x is unusable, or when the partner position is missing.
 */
export function linkedCentreCabinetPositions({
  roomWidthM,
  draggedRole,
  draggedPosition,
  partnerPosition,
}) {
  const partnerRole = centreCabinetPartnerRole(draggedRole);
  if (!partnerRole || !draggedPosition || !partnerPosition) return null;

  const mirroredX = mirrorAboutRoomCentre(roomWidthM, draggedPosition.x);
  if (mirroredX === null) return null;

  const pick = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);

  return {
    partnerRole,
    dragged: { ...draggedPosition },
    partner: {
      ...partnerPosition,
      x: mirroredX,
      y: pick(draggedPosition.y, partnerPosition.y),
      z: pick(draggedPosition.z, partnerPosition.z),
    },
  };
}

/**
 * The effective centre-channel acoustic centre: the midpoint of the pair's
 * acoustic centres. This is the ONE position the centre channel is referenced
 * from — its horizontal angle to the listening position, and its height — never
 * either individual cabinet. With the pair symmetrically flanking the screen the
 * midpoint falls on the screen centreline, exactly where a conventional single
 * centre speaker sits, so the centre channel behaves the same in both cases.
 *
 * Physical cabinet coordinates are untouched: this is a reference position for
 * the centre channel, not a substitute for either cabinet's own position.
 *
 * Returns null when no cabinet carries a usable position.
 */
export function effectiveCentreAcousticMidpoint(cabinets = []) {
  const positions = (Array.isArray(cabinets) ? cabinets : [])
    .map((c) => c?.position)
    .filter((p) => p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y)));
  if (positions.length === 0) return null;

  const mean = (key) => {
    const values = positions.map((p) => Number(p[key])).filter(Number.isFinite);
    if (values.length === 0) return undefined;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  };

  const midpoint = { x: mean('x'), y: mean('y') };
  const z = mean('z');
  if (Number.isFinite(z)) midpoint.z = z;
  return midpoint;
}