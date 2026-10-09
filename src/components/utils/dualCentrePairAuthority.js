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
import { getCanonicalRole } from "@/components/utils/surroundRoleMap";

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

// ── Aiming: the pair's own installation preference ─────────────────────────
//
// The two cabinets are aimed INDEPENDENTLY. Each one turns about its own
// mounting reference towards the RSP from its OWN acoustic centre, so a
// mirrored pair converges on the RSP with equal and opposite angles instead of
// rotating as a single rigid group. The preference below is the only thing
// remembered: the angles themselves are always resolved live from the cabinets'
// current positions and the current RSP by the ONE aim authority
// (speakerAimResolver.resolveSpeakerYaw), so moving either cabinet or the RSP
// updates both immediately and no angle is ever stored stale.
//
// Aiming is a physical installation choice. It is stored on the cabinets — part
// of the dual-centre configuration itself, exactly like their orientation — and
// it changes no SPL, no RP22 input and no centre-channel acoustic authority.

/**
 * The aiming control's two options, in the designer's reading order.
 * `atRsp: false` is "Straight ahead" — the value an unset pair reads as.
 */
export const CENTRE_CABINET_AIM_OPTIONS = Object.freeze([
  { atRsp: false, label: 'Straight ahead' },
  { atRsp: true, label: 'Aim at RSP' },
]);

/** Whether the installed cabinets are aimed at the RSP. Unset pair = straight ahead. */
export function centreCabinetAimAtRsp(placedSpeakers) {
  return (Array.isArray(placedSpeakers) ? placedSpeakers : [])
    .some((s) => isCentreCabinetRole(s?.role) && s?.aimAtRsp === true);
}

/**
 * The cabinets with the aiming preference stamped on BOTH of them — the pair is
 * ONE configuration, so it never carries two different answers.
 *
 * Nothing else on a cabinet is touched: its stored position is the wall anchor
 * and stays exactly where it was (aiming rotates the footprint about that
 * reference, it never translates the cabinet), and its model, orientation and
 * acoustic-centre height are untouched, so Front Elevation is unchanged.
 */
export function withCentreCabinetAim(placedSpeakers, atRsp) {
  const aimed = atRsp === true;
  return (Array.isArray(placedSpeakers) ? placedSpeakers : []).map((s) => (
    isCentreCabinetRole(s?.role) ? { ...s, aimAtRsp: aimed } : s
  ));
}

// ── The aiming mode as part of a speaker's equality ─────────────────────────
//
// The aiming mode changes NO id, role, model or position — it only decides how
// the two cabinets are resolved when they are drawn. The speakers-equality
// guards that filter redundant writes (SpeakerPlacement's write filter and
// AppStateProvider's idempotence check) would therefore judge an aiming change
// to be "the same speakers" and discard it, so the selection never reached the
// cabinets and the Plan View never aimed them.
//
// The mode is configuration, so it is compared here, once, by both guards: a
// change of mode is a change of speakers (the write lands), and an unchanged
// mode stays a no-op (no extra writes, no loops).

/** The pair's aiming mode as a comparable signature, or '' when no cabinet is installed. */
export function centreCabinetAimSignature(placedSpeakers) {
  return (Array.isArray(placedSpeakers) ? placedSpeakers : [])
    .filter((s) => isCentreCabinetRole(s?.role))
    .map((s) => `${getCanonicalRole(s?.role)}:${s?.aimAtRsp === true ? 'rsp' : 'straight'}`)
    .sort()
    .join('|');
}

/** Whether two speaker lists carry the same cabinet aiming mode. */
export function sameCentreCabinetAim(a, b) {
  return centreCabinetAimSignature(a) === centreCabinetAimSignature(b);
}