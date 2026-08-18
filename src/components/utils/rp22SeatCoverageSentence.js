/**
 * rp22SeatCoverageSentence.js
 * ---------------------------
 * Shared RP22 seating-coverage floor helper.
 *
 * Computes a STRICT RP22 coverage floor — NOT the Design Performance Index,
 * NOT ASDR, NOT an averaged or percentile score. The floor is the highest
 * RP22 Level for which every currently assessed applicable parameter passes
 * that Level across the stated seating group.
 *
 * Consumes the existing canonical paramAuthority from
 * buildArtcousticDesignRatingAuthority (already used by both reports for
 * ASDR scoring). No thresholds, FAIL rules, or bass scoring are
 * reimplemented here — presentation + aggregation only.
 *
 * PRIMARY_FLOOR  = highest L such that every applicable assessed parameter
 *                   passes L across every Primary seat (seat-scoped) AND the
 *                   authoritative room result passes L (room-scoped).
 * ALL_SEAT_FLOOR  = highest L such that every applicable assessed parameter
 *                   passes L across every evaluated seat (Primary + Secondary)
 *                   AND the room result passes L.
 *
 * Primary/Secondary classification uses ONLY the Stage A canonical
 * seat-priority authority (getPrimarySeats / getSecondarySeats). The legacy
 * isPrimary / isSecondary acoustic-role booleans are NOT consulted.
 *
 * Used by BOTH:
 *   - Technical Report (RP22Report)
 *   - Visual Report (RP22ClientReport)
 */

import { getPrimarySeats } from "./seatPriorityAuthority";

/** Map RP22 level strings to comparable numeric ranks. */
const LEVEL_RANK = { L4: 4, L3: 3, L2: 2, L1: 1, FAIL: 0 };

function levelToRank(level) {
  if (level == null) return null;
  const r = LEVEL_RANK[level];
  return r != null ? r : null;
}

/**
 * Compute the RP22 seating-coverage floor from the canonical param authority.
 *
 * @param {Object} params
 * @param {Object} params.paramAuthority — authority.parameters from buildArtcousticDesignRatingAuthority
 * @param {Array}  params.seats          — full seats array (carries `priority` field)
 * @returns {{ primaryFloor, allSeatFloor, hasBelowL1Primary, hasBelowL1AnySeat, allParametersAuthoritative } | null}
 */
export function computeRp22CoverageFloor({ paramAuthority, seats }) {
  if (!paramAuthority) return null;

  const primarySeatIds = getPrimarySeats(seats).map((s) => s?.id).filter(Boolean);
  const allSeatIds = (Array.isArray(seats) ? seats : []).map((s) => s?.id).filter(Boolean);

  if (primarySeatIds.length === 0) return null;

  let primaryFloorRank = 4; // start at highest; weakest result pulls down
  let allSeatFloorRank = 4;
  let hasBelowL1Primary = false;
  let hasBelowL1AnySeat = false;
  let allParametersAuthoritative = true;

  for (const param of Object.values(paramAuthority)) {
    if (!param) continue;

    // V1-excluded params (P8/P15/P21) are permanently excluded — they do
    // not count against allParametersAuthoritative and are not assessed.
    if (param.reason === "v1-excluded") continue;

    // N/A params are not applicable to this layout — skip entirely.
    if (param.state === "na") continue;

    // Provisional params are not yet assessed — means we are in
    // "currently assessed" mode. They do not participate in the floor.
    if (param.state === "provisional") {
      allParametersAuthoritative = false;
      continue;
    }

    // state === "scored"
    if (param.scope === "room") {
      const roomRank = levelToRank(param.level);
      if (roomRank == null) continue;
      if (roomRank < primaryFloorRank) primaryFloorRank = roomRank;
      if (roomRank < allSeatFloorRank) allSeatFloorRank = roomRank;
      if (roomRank === 0) {
        hasBelowL1Primary = true;
        hasBelowL1AnySeat = true;
      }
    } else if (param.scope === "seat") {
      const seatAuths = param.seats || {};

      // Primary floor: every Primary seat's result must pass
      for (const seatId of primarySeatIds) {
        const sa = seatAuths[seatId];
        if (!sa || sa.state === "na" || sa.state !== "scored") continue;
        const r = levelToRank(sa.level);
        if (r == null) continue;
        if (r < primaryFloorRank) primaryFloorRank = r;
        if (r === 0) hasBelowL1Primary = true;
      }

      // All-seat floor: every evaluated seat's result must pass
      for (const seatId of allSeatIds) {
        const sa = seatAuths[seatId];
        if (!sa || sa.state === "na" || sa.state !== "scored") continue;
        const r = levelToRank(sa.level);
        if (r == null) continue;
        if (r < allSeatFloorRank) allSeatFloorRank = r;
        if (r === 0) hasBelowL1AnySeat = true;
      }
    }
  }

  return {
    primaryFloor: primaryFloorRank,
    allSeatFloor: allSeatFloorRank,
    hasBelowL1Primary,
    hasBelowL1AnySeat,
    allParametersAuthoritative,
  };
}

/**
 * Format the coverage floor into the client-facing sentence.
 *
 * Wording rules (exact):
 *   - "meet or exceed" (never "exceed" — a result exactly at threshold qualifies)
 *   - "Level {N}" (never "Level 0" / "L0")
 *   - Below-L1 primary → dedicated fallback, no level number displayed
 *   - Below-L1 secondary only → "although one or more seats fall below Level 1"
 *   - "currently assessed" when any applicable param is still excluded;
 *     "every parameter" when all applicable params are report-authoritative
 *
 * @param {Object} floor — from computeRp22CoverageFloor
 * @returns {string | null}
 */
export function formatRp22CoverageSentence(floor) {
  if (!floor) return null;

  const { primaryFloor, allSeatFloor, hasBelowL1Primary, hasBelowL1AnySeat, allParametersAuthoritative } = floor;

  const primaryLabel = primaryFloor >= 1 ? `Level ${primaryFloor}` : null;
  const allSeatLabel = allSeatFloor >= 1 ? `Level ${allSeatFloor}` : null;

  // Case 1: one or more primary seats below L1 — dedicated fallback
  if (hasBelowL1Primary) {
    return allParametersAuthoritative
      ? "One or more primary seats fall below CEDIA/CTA-RP22 Level 1 across every parameter."
      : "One or more primary seats fall below CEDIA/CTA-RP22 Level 1 across the currently assessed parameters.";
  }

  // Case 2: primary OK, but one or more secondary seats below L1
  if (hasBelowL1AnySeat) {
    return allParametersAuthoritative
      ? `All primary seats meet or exceed ${primaryLabel} across every CEDIA/CTA-RP22 parameter, although one or more seats fall below Level 1.`
      : `Across the currently assessed CEDIA/CTA-RP22 parameters, all primary seats meet or exceed ${primaryLabel}, although one or more seats fall below Level 1.`;
  }

  // Case 3: all seats ≥ L1 — standard wording
  return allParametersAuthoritative
    ? `All primary seats meet or exceed ${primaryLabel} across every CEDIA/CTA-RP22 parameter, with no seat below ${allSeatLabel}.`
    : `Across the currently assessed CEDIA/CTA-RP22 parameters, all primary seats meet or exceed ${primaryLabel}, with no seat below ${allSeatLabel}.`;
}

/**
 * Build the complete RP22 seating-coverage result (floor + sentence).
 *
 * @param {Object} params
 * @param {Object} params.paramAuthority — authority.parameters from buildArtcousticDesignRatingAuthority
 * @param {Array}  params.seats          — full seats array (carries `priority` field)
 * @returns {{ primaryFloor, allSeatFloor, hasBelowL1Primary, hasBelowL1AnySeat, allParametersAuthoritative, statement } | null}
 */
export function buildRp22SeatCoverageResult({ paramAuthority, seats }) {
  const floor = computeRp22CoverageFloor({ paramAuthority, seats });
  if (!floor) return null;
  const statement = formatRp22CoverageSentence(floor);
  return { ...floor, statement };
}