// candidateP20SubgroupSummary.js
// ---------------------------------------------------------------------------
// Primary and Secondary P20 subgroup summaries for ADI Subwoofer Design
// candidates, derived from the EXISTING per-seat P20 evidence and the shared
// seat-priority authority.
//
// Product rules:
//   - Use the existing per-seat P20 evidence (Stage 2 canonical result's
//     perSeatP20 array) and the existing seat-priority groups.
//   - Preserve the existing P20 definition (max |seat − RSP| over the
//     assessment band) and its RSP reference.
//   - Do NOT average Performance Levels or invent separate individual-seat
//     RP22 levels.
//   - If evidence is missing or a group cannot be assessed meaningfully,
//     return unavailable.
//   - Keep published overall P20 unchanged — these are additional predicted
//     subgroup assessments, not a replacement for the overall worst-seat P20.
//
// READ-ONLY: it reads existing per-seat P20 results and seat priorities. It
// evaluates nothing, re-simulates nothing, and changes no bass maths, no
// scoring and no RP22 definition.
// ---------------------------------------------------------------------------

import { resolveSeatPriority, PRIMARY, SECONDARY } from "@/components/utils/seatPriorityAuthority";
import { resolveRp22DesignValue } from "@/components/utils/rp22/resolveRp22DesignValue";
import { lowestBassLevel } from "@/components/utils/rp22/bassGradingAuthority";

const finite = (value) => value !== null && value !== "" && Number.isFinite(Number(value));

/**
 * Build a P20 subgroup summary from the per-seat P20 results that belong to one
 * priority group.
 *
 * The subgroup's "floor" is the LOWEST Performance Level among the group's
 * assessable seats — the same worst-seat-down rule the overall P20 uses, but
 * scoped to the group. No averaging of levels, no invented individual levels.
 *
 * A group is "available" when it has at least two assessable seats (P20 is a
 * seat-to-seat consistency metric — a single seat has no consistency to
 * measure) AND every seat in the group has a valid P20 result. A group with
 * missing or non-assessable seats returns unavailable with the honest reason.
 *
 * @param {Array} perSeatP20 — canonical per-seat P20 results
 * @param {Array} seatingPositions — seat geometry (for priority resolution)
 * @param {string} group — "primary" | "secondary"
 * @returns {object} { available, floor, seatCount, seats, reason }
 */
export function buildP20SubgroupSummary(perSeatP20, seatingPositions, group) {
  const targetPriority = group === "primary" ? PRIMARY : SECONDARY;
  const seats = (Array.isArray(seatingPositions) ? seatingPositions : [])
    .filter((seat) => seat && seat.id != null && resolveSeatPriority(seat) === targetPriority);

  if (seats.length === 0) {
    return { available: false, floor: null, seatCount: 0, seats: [], reason: "no-seats-in-group" };
  }

  const p20BySeatId = new Map();
  for (const seat of (Array.isArray(perSeatP20) ? perSeatP20 : [])) {
    if (seat && seat.seatId != null) p20BySeatId.set(String(seat.seatId), seat);
  }

  const groupResults = [];
  const missing = [];
  for (const seat of seats) {
    const result = p20BySeatId.get(String(seat.id));
    if (!result || !finite(result.variationDbRaw)) {
      missing.push(String(seat.id));
    } else {
      groupResults.push({
        seatId: String(seat.id),
        variationDbRaw: Number(result.variationDbRaw),
        displayDeviationDb: resolveRp22DesignValue(20, Math.abs(Number(result.variationDbRaw))),
        level: result.level,
      });
    }
  }

  if (missing.length > 0) {
    return {
      available: false,
      floor: null,
      seatCount: seats.length,
      seats: [],
      reason: `missing-p20-evidence:${missing.join(",")}`,
    };
  }

  // P20 is a seat-to-seat consistency metric. A single seat has no consistency
  // to measure — return unavailable rather than presenting one seat's deviation
  // as a "consistency" result.
  if (groupResults.length < 2) {
    return {
      available: false,
      floor: null,
      seatCount: seats.length,
      seats: groupResults,
      reason: "single-seat-group-no-consistency",
    };
  }

  const levels = groupResults.map((r) => r.level);
  const floor = lowestBassLevel(levels) || "NOT CALCULATED";

  return {
    available: true,
    floor,
    seatCount: seats.length,
    seats: groupResults,
    reason: null,
  };
}

/**
 * Build BOTH Primary and Secondary P20 subgroup summaries for a candidate.
 *
 * @param {object} canonicalResult — Stage 2 confirmation result with perSeatP20
 * @param {Array} seatingPositions — seat geometry
 * @returns {object} { primary, secondary, overallUnchanged }
 */
export function buildCandidateP20Subgroups(canonicalResult, seatingPositions) {
  const perSeatP20 = canonicalResult?.perSeatP20 || [];
  const primary = buildP20SubgroupSummary(perSeatP20, seatingPositions, "primary");
  const secondary = buildP20SubgroupSummary(perSeatP20, seatingPositions, "secondary");

  // The published overall P20 (worst seat across ALL seats) is unchanged —
  // these subgroup summaries are additional predicted views, not a replacement.
  const overallUnchanged = {
    achievedP20VariationDb: canonicalResult?.achievedP20VariationDb ?? null,
    achievedP20Level: canonicalResult?.achievedP20Level ?? null,
    worstP20SeatId: canonicalResult?.worstP20SeatId ?? null,
  };

  return { primary, secondary, overallUnchanged };
}