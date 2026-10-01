/**
 * reportSeatNormalisation.js
 * --------------------------
 * The Visual Report's seat serialisation authority.
 *
 * Report pages read seats from the live app state, but only through this
 * normaliser: it fixes the coordinate shape and carries BOTH seat facts —
 *
 *   priority   — the designer's Primary / Secondary classification
 *                (seatPriorityAuthority), the group a result is read in
 *   isPrimary  — the internal RSP / MLP marker, carried by a single seat
 *
 * The two are independent: a project may hold several Primary seats while only
 * one seat carries the reference flag. Dropping `priority` here left pages able
 * to fall back only to the flag, so the single reference seat was presented as
 * the only primary seat.
 *
 * A seat with no stored priority (legacy projects) resolves to Primary, so old
 * designs load unchanged.
 *
 * Presentation only — no grading, no geometry, no measurement.
 */

import { resolveSeatPriority } from "@/components/utils/seatPriorityAuthority";

export function normalizeSeat(seat) {
  if (!seat) return null;
  const x = Number(seat.x ?? seat.position?.x);
  const y = Number(seat.y ?? seat.position?.y);
  const z = Number(seat.z ?? seat.position?.z ?? seat.earHeightM ?? seat.ear_h ?? 1.2);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
  return {
    id: seat.id || `seat-${x.toFixed(2)}-${y.toFixed(2)}`,
    x,
    y,
    z,
    priority: resolveSeatPriority(seat),
    isPrimary: seat.isPrimary === true,
  };
}

export default normalizeSeat;