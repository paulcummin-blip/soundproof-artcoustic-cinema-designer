// coordinatedRspAuthority.js
// Pure validation and resolution of the RSP authority for the Phase 9B
// coordinated physical search.
//
// The coordinated search moves ALL seats by a whole-block offset. The RSP
// must follow the SAME authority the project uses:
//   - seat_bound: the RSP is the designated seat's exact XYZ. After the
//     whole-block translation the RSP follows that seat's moved position.
//     The existing batch worker already translates rspPosition.y by the
//     offset, so when rspPosition was resolved from the designated seat
//     (via buildAuthoritativeRspPosition), the moved RSP is correct.
//   - manual / auto: the RSP is a free-floating synthetic point. The batch
//     worker translates it by the same offset — the existing behaviour.
//
// This module validates that the authority is consistent BEFORE the search
// runs, and records the authority on each candidate. It never performs a
// geometric calculation: it reuses the rspPosition the engine already
// resolved via buildAuthoritativeRspPosition.
//
// Pure reader: no acoustic calculation, no side effects.

/**
 * Validate the RSP authority for the coordinated search.
 *
 * @param {object} params
 * @param {string} [params.rspMode] — project rsp_mode ("seat_bound", "manual_position", etc.)
 * @param {string} [params.designatedRspSeatId] — project designated_rsp_seat_id
 * @param {Array}  params.seatingPositions — original (unmoved) seats
 * @param {object} params.rspPosition — the engine's resolved RSP { x, y, z, designatedRspSeatId }
 * @returns {{ valid: boolean, issues: string[], rspMode: string, designatedRspSeatId: string|null, rspPosition: object }}
 */
export function validateCoordinatedRspAuthority({
  rspMode = null,
  designatedRspSeatId = null,
  seatingPositions = [],
  rspPosition = null,
} = {}) {
  const issues = [];
  const mode = typeof rspMode === "string" && rspMode ? rspMode : null;
  const seatId = typeof designatedRspSeatId === "string" && designatedRspSeatId.trim()
    ? designatedRspSeatId.trim() : null;
  const seats = Array.isArray(seatingPositions) ? seatingPositions : [];

  // RSP position must be finite.
  if (!rspPosition || !Number.isFinite(Number(rspPosition.x)) || !Number.isFinite(Number(rspPosition.y))) {
    issues.push("RSP position is missing or has non-finite coordinates");
    return { valid: false, issues, rspMode: mode, designatedRspSeatId: seatId, rspPosition };
  }

  // seat_bound: the designated seat must be present in the original seating
  // and the engine's RSP must have been resolved from that same seat.
  if (mode === "seat_bound") {
    if (!seatId) {
      issues.push("rsp_mode is seat_bound but designated_rsp_seat_id is missing");
    } else {
      const seat = seats.find((s) => String(s?.id) === seatId);
      if (!seat) {
        issues.push(`rsp_mode is seat_bound but designated seat '${seatId}' is not in the seating layout`);
      } else if (rspPosition.designatedRspSeatId !== seatId) {
        issues.push(
          `rsp_mode is seat_bound (seat '${seatId}') but the engine RSP was resolved from a different seat ('${rspPosition.designatedRspSeatId ?? "none"}')`,
        );
      }
    }
  }

  // When the RSP carries a designatedRspSeatId, it must exist in the seating.
  // This catches a stale designated seat ID that the RSP resolver fell back
  // from silently.
  if (rspPosition.designatedRspSeatId) {
    const seat = seats.find((s) => String(s?.id) === String(rspPosition.designatedRspSeatId));
    if (!seat) {
      issues.push(
        `Engine RSP references designated seat '${rspPosition.designatedRspSeatId}' which is not in the seating layout`,
      );
    }
  }

  return { valid: issues.length === 0, issues, rspMode: mode, designatedRspSeatId: seatId, rspPosition };
}

/**
 * Record the RSP authority on a confirmed coordinated candidate. The actual
 * XYZ is read from the rspPosition the engine resolved (and the batch worker
 * translated). No geometric recalculation.
 *
 * @param {object} result — the confirmed candidate result
 * @param {object} authority — from validateCoordinatedRspAuthority
 * @param {number} offsetMm — the seating offset this candidate used
 * @returns {object} the result with rspAuthority attached
 */
export function attachRspAuthority(result, authority, offsetMm) {
  if (!result || !authority) return result;
  const rspPosition = authority.rspPosition;
  const effectiveOffsetM = Number.isFinite(Number(offsetMm)) ? Number(offsetMm) / 1000 : 0;
  result.rspAuthority = {
    rspMode: authority.rspMode || null,
    designatedRspSeatId: authority.designatedRspSeatId || rspPosition?.designatedRspSeatId || null,
    rspPosition: {
      x: Number(rspPosition?.x) || 0,
      y: Number(rspPosition?.y) || 0,
      z: Number.isFinite(Number(rspPosition?.z)) ? Number(rspPosition.z) : 1.2,
    },
    // The actual XYZ used for canonical evaluation, after the batch worker's
    // whole-block translation. For seat_bound this is the moved designated
    // seat; for manual/auto this is the translated manual RSP.
    evaluatedRspPosition: {
      x: Number(rspPosition?.x) || 0,
      y: (Number(rspPosition?.y) || 0) + effectiveOffsetM,
      z: Number.isFinite(Number(rspPosition?.z)) ? Number(rspPosition.z) : 1.2,
    },
  };
  return result;
}