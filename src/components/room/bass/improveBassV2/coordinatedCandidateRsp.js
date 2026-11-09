// coordinatedCandidateRsp.js
// Resolve the proposed RSP from the designated primary seat identity in the
// proposed seating arrangement.
//
// The proposed RSP must follow the designated primary seat — it is NOT a
// standalone translation of the stored RSP. For a seat-bound RSP, the bass
// engine uses the seat's exact XYZ so P20 for that seat is naturally 0 dB.
//
// This module is a pure reader: no acoustic calculation, no side effects.
// It preserves the exact seat ID and coordinates in the returned identity.

/**
 * Resolve the proposed RSP from a designated seat identity in the proposed
 * seating arrangement.
 *
 * @param {object} params
 * @param {Array}  params.seatingPositions — proposed seats (moved)
 * @param {string} params.designatedSeatId — the canonical RSP seat identity
 * @param {object} [params.fallbackRsp] — { x, y, z } fallback (room centreline + seat Y)
 * @param {number} [params.roomWidthM] — room width for centreline X fallback
 * @returns {{ rspPosition: object, designatedSeatId: string, resolvedFromSeat: boolean, seat: object|null }}
 */
export function resolveProposedRspFromSeat({
  seatingPositions,
  designatedSeatId,
  fallbackRsp = null,
  roomWidthM = null,
}) {
  const seats = Array.isArray(seatingPositions) ? seatingPositions : [];
  const seatId = designatedSeatId ? String(designatedSeatId) : null;

  if (seatId) {
    const seat = seats.find((s) => String(s.id) === seatId);
    if (seat && Number.isFinite(Number(seat.x)) && Number.isFinite(Number(seat.y))) {
      return {
        rspPosition: {
          x: Number(seat.x),
          y: Number(seat.y),
          z: Number.isFinite(Number(seat.z)) ? Number(seat.z) : 1.2,
        },
        designatedSeatId: seatId,
        resolvedFromSeat: true,
        seat: { id: seat.id, x: Number(seat.x), y: Number(seat.y), z: Number(seat.z) },
      };
    }
  }

  // Fallback: room centreline X + the fallback RSP Y (or the first primary
  // seat's Y). This is only used when the designated seat is not found in the
  // proposed arrangement — the caller is expected to provide a valid seat ID.
  const centrelineX = Number.isFinite(Number(roomWidthM)) ? Number(roomWidthM) / 2 : null;
  const firstPrimary = seats.find((s) => s.priority !== "secondary");
  const fallbackY = fallbackRsp && Number.isFinite(Number(fallbackRsp.y))
    ? Number(fallbackRsp.y)
    : firstPrimary && Number.isFinite(Number(firstPrimary.y))
      ? Number(firstPrimary.y)
      : null;
  const fallbackZ = fallbackRsp && Number.isFinite(Number(fallbackRsp.z))
    ? Number(fallbackRsp.z)
    : 1.2;

  return {
    rspPosition: {
      x: centrelineX,
      y: fallbackY,
      z: fallbackZ,
    },
    designatedSeatId: seatId,
    resolvedFromSeat: false,
    seat: null,
  };
}

/**
 * Verify that the designated seat identity is present in the proposed seating.
 * A proposal whose designated seat disappeared is invalid — the RSP cannot
 * be bound to a seat that no longer exists.
 *
 * @param {Array}  seatingPositions
 * @param {string} designatedSeatId
 * @returns {boolean}
 */
export function designatedSeatExists(seatingPositions, designatedSeatId) {
  if (!designatedSeatId) return false;
  const seats = Array.isArray(seatingPositions) ? seatingPositions : [];
  return seats.some((s) => String(s.id) === String(designatedSeatId));
}