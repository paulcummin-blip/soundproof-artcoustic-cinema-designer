// optimiserP20SeatScope.js
// ---------------------------------------------------------------------------
// THE SEAT SCOPE OF EVERY P20 STATEMENT THE OPTIMISER PANEL MAKES.
//
// P20 is a SEAT-SCOPED result: one aggregate figure describes the worst seat,
// never every seat. This module answers two questions and nothing else:
//
//   • WHICH seats a stated improvement is claimed across — the primary seats
//     only, the whole seating area, or no scope at all when the seat-level
//     evidence behind the claim was not retained;
//   • HOW the per-seat P20 result is grouped for Engineer details — Primary
//     seats, Secondary seats and the limiting seat.
//
// A claim is never broader than the seats that support it: the seating area is
// stated only when every seat in the live set carries its own material
// improvement, and the primary seats only when the whole primary set does. With
// no per-seat evidence at all the panel states no scope, so one seat's result is
// never presented as a room-wide result.
//
// READ-ONLY presentation. It reformats per-seat values that already exist, using
// the same whole-dB display authority and the same canonical Primary/Secondary
// scope authority every other surface reads. It calculates no P20, aggregates
// nothing, re-grades nothing, ranks nothing and changes no optimiser maths.
// ---------------------------------------------------------------------------

import { getScopedSeatIds } from "@/components/utils/seatScopeAuthority";
import { formatSeatLabel } from "@/components/utils/seatLabel";
import { deviationText, frequencyText, levelText, wholeDbImprovement } from "./optimiserWholeNumberDb.js";
import { worstP20Seat } from "./optimiserPlanMetrics.js";

/** The two scopes an improvement claim can be made across. */
export const IMPROVEMENT_SCOPE = Object.freeze({
  PRIMARY: "primary",
  ALL: "all",
});

/**
 * The one benefit sentence stated when no seat-level evidence supports a scope.
 * It carries no breadth claim, so a primary-seat result is never read as a
 * room-wide one.
 */
export const NEUTRAL_IMPROVEMENT_SENTENCE = "Improved predicted bass consistency.";

/** The physical change's own next step, stated with the improvement it buys. */
export const SEATING_ADJUSTMENT_REQUIRED = "Requires a seating adjustment.";

const CLAIM = Object.freeze({
  [IMPROVEMENT_SCOPE.PRIMARY]: "Bass consistency across the primary seats can be improved",
  [IMPROVEMENT_SCOPE.ALL]: "Bass consistency across the seating area can be improved",
});

/** The canonical whole-dB improvement a seat must show to support a claim. */
const MATERIAL_SEAT_IMPROVEMENT_DB = 1;

const seatIdOf = (row) => String(row?.seatId ?? row?.id ?? "").trim();

/** The seat's own P20 deviation, from either per-seat row authority. */
const deviationOf = (row) => {
  const value = row?.p20VariationDb ?? row?.variationDbRaw;
  if (value === null || value === undefined || value === "") return null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
};

/** seatId → its own deviation, for the seats that carry one. */
function deviationById(rows = []) {
  const map = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const id = seatIdOf(row);
    const deviation = deviationOf(row);
    if (id && deviation != null) map.set(id, deviation);
  });
  return map;
}

/**
 * The scope the seat-level evidence supports, and the sentence that states it.
 *
 * @param {object} params
 * @param {Array} params.beforeSeats - per-seat P20 rows of the design the
 *   evaluation ran on ({ seatId, p20VariationDb } or the authority's own rows)
 * @param {Array} params.afterSeats - per-seat P20 rows of the result being
 *   described. Empty when the result carries no seat detail — then no scope is
 *   claimed.
 * @param {Array} params.seatingPositions - live seating positions: the scope
 *   authority's own input (which seats are Primary and which are Secondary)
 * @param {number|null} params.improvementDb - the improvement already stated by
 *   the panel, in whole dB. Read, never recalculated.
 * @param {boolean} params.physical - the change requires a physical adjustment
 *   (a seating move), stated with the improvement
 * @returns {{scope: string|null, seatIds: string[], sentence: string}}
 */
export function resolveImprovementClaim({
  beforeSeats = [],
  afterSeats = [],
  seatingPositions = [],
  improvementDb = null,
  physical = false,
} = {}) {
  const note = physical ? ` ${SEATING_ADJUSTMENT_REQUIRED}` : "";
  const neutral = { scope: null, seatIds: [], sentence: `${NEUTRAL_IMPROVEMENT_SENTENCE}${note}` };

  const before = deviationById(beforeSeats);
  const after = deviationById(afterSeats);
  if (!before.size || !after.size) return neutral;

  const { primarySeatIds, secondarySeatIds } = getScopedSeatIds(seatingPositions);
  const primary = new Set(primarySeatIds);
  const secondary = new Set(secondarySeatIds);
  const live = [...primarySeatIds, ...secondarySeatIds];
  if (!live.length) return neutral;

  // A seat supports the claim when its own P20 improves by the canonical whole
  // decibel. Both values are already-published per-seat results.
  const improved = (id) => {
    const gain = wholeDbImprovement(before.get(id), after.get(id));
    return gain != null && gain >= MATERIAL_SEAT_IMPROVEMENT_DB;
  };
  const covered = (ids) => ids.length > 0 && ids.every((id) => before.has(id) && after.has(id));

  const wholeAreaEvidenced = covered(live) && live.every(improved);
  const primaryEvidenced = covered(primarySeatIds) && primarySeatIds.every(improved);

  // The seating area only when a secondary seat was evidenced too; otherwise the
  // primary seats, which is exactly what the evidence covers.
  const scope = wholeAreaEvidenced && secondarySeatIds.length > 0
    ? IMPROVEMENT_SCOPE.ALL
    : (primaryEvidenced ? IMPROVEMENT_SCOPE.PRIMARY : null);
  if (!scope) return neutral;

  const figure = Number.isFinite(Number(improvementDb))
    && Number(improvementDb) >= MATERIAL_SEAT_IMPROVEMENT_DB
    ? ` by approximately ${Math.round(Number(improvementDb))} dB`
    : "";
  return {
    scope,
    seatIds: live.filter((id) => before.has(id) && after.has(id)),
    sentence: `${CLAIM[scope]}${figure}.${note}`,
  };
}

/**
 * The per-seat P20 result grouped for Engineer details: Primary seats, Secondary
 * seats and the limiting seat. This is where a single worst-seat figure is
 * stated with its real scope — never as a bare "Current P20".
 *
 * @returns {{primary: Array, secondary: Array, limiting: object|null, any: boolean}}
 */
export function buildScopedP20SeatGroups({ perSeatRows = [], seatingPositions = [] } = {}) {
  const rows = (Array.isArray(perSeatRows) ? perSeatRows : [])
    .map((row) => {
      const id = seatIdOf(row);
      const deviation = deviationOf(row);
      if (!id || deviation == null) return null;
      return {
        seatId: id,
        label: formatSeatLabel(id),
        deviationDb: deviation,
        deviation: deviationText(deviation),
        level: levelText(row?.p20Level ?? row?.level),
        frequency: frequencyText(row?.p20WorstFrequencyHz ?? row?.worstFrequencyHz),
      };
    })
    .filter(Boolean);
  if (!rows.length) return { primary: [], secondary: [], limiting: null, any: false };

  const { primarySeatIds, secondarySeatIds } = getScopedSeatIds(seatingPositions);
  const primary = new Set(primarySeatIds);
  const secondary = new Set(secondarySeatIds);

  // The limiting seat is the same worst seat the published authority names: the
  // existing worst-seat reader is reused, never re-implemented.
  const worst = worstP20Seat({
    perSeatP20: rows.map((row) => ({ seatId: row.seatId, variationDbRaw: row.deviationDb })),
  });

  return {
    primary: rows.filter((row) => primary.has(row.seatId)),
    secondary: rows.filter((row) => secondary.has(row.seatId)),
    limiting: rows.find((row) => row.seatId === worst?.seatId) || null,
    any: true,
  };
}