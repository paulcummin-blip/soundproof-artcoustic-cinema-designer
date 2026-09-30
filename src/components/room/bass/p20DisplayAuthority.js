// p20DisplayAuthority.js
//
// ONE display authority for RP22 P20 (seat-to-seat consistency).
//
// Product rule: the P20 pill, tooltip, graph marker, graph overlay/hover,
// ADI copy and report copy must all tell the same story. They therefore all
// read their displayed value from this module. No surface rounds a P20
// deviation itself, and no surface calculates a second P20 number.
//
// ROUNDING — product policy (Integer Floor Policy), not an RP22 requirement:
// ± dB deviation values are lower-is-better, so they are FLOORED to whole
// integers through the shared design-value authority (Group D — P19/P20).
//   2.99 dB → 2 dB      10.6 dB → 10 dB      12.9 dB → 12 dB
// Never Math.round. Never Math.ceil. The exact value is retained and may be
// shown only where it is explicitly labelled exact (e.g. "exact ±12.2 dB").
//
// METRIC — P20 is the maximum absolute deviation between a seat's 1/3-octave
// smoothed POST-EQ response and the RSP response, below the room transition
// frequency. The ± sign is the RP22 "± dB" unit convention: this is a one-sided
// maximum |seat − RSP|, never a peak-to-peak span.
//
// NOT P20: "response below target" (Final EQ response versus the target curve at
// a hovered frequency) is the P19 relationship. It is a different metric against
// a different reference at a different frequency and must never be presented as
// the P20 result.

import { resolveRp22DesignValue } from "@/components/utils/rp22/resolveRp22DesignValue";
import { formatSeatLabel, formatSeatPillLabel } from "@/components/utils/seatLabel";
import { resolveSeatPriority, PRIMARY, SECONDARY } from "@/components/utils/seatPriorityAuthority";

export const P20_SCOPE = Object.freeze({
  OVERALL_ALL_SEAT: "overall-all-seat",
  SELECTED_SEAT: "selected-seat",
  PRIMARY_GROUP: "primary-group",
  SECONDARY_GROUP: "secondary-group",
  SEAT: "seat",
});

// Stated on every surface that shows an exact figure beside a floored one.
export const P20_ROUNDING_METHOD = "floor to whole dB (RP22 P19/P20 design value)";

const seatId = (value) => String(value ?? "").trim();
const finite = (value) => value !== null && value !== "" && Number.isFinite(Number(value));

function rowNumber(seat) {
  const value = Number(seat?.row ?? seat?.rowNumber);
  return Number.isFinite(value) ? value : null;
}

function columnNumber(seat) {
  const value = Number(seat?.column ?? seat?.col ?? seat?.indexInRow ?? seat?.seatNumber);
  if (Number.isFinite(value)) return value;
  const idMatch = seatId(seat?.id ?? seat?.seatId).match(/-c(\d+)$/i);
  return idMatch ? Number(idMatch[1]) : null;
}

/**
 * Grade text. RP22 P20 does not define Level 1, but Sound Proof grades >4 dB as
 * L1 (not FAIL) because P20 is not applicable at Level 1. Only level 0 (genuine
 * failure / not computed) displays as "FAIL".
 */
export function p20GradeText(level) {
  const upper = String(level ?? "").toUpperCase();
  if (level === 0 || upper === "FAIL") return "FAIL";
  const match = upper.match(/^L?([1-4])$/);
  return match ? `L${match[1]}` : "—";
}

function resolveScope(seatResult, seatingPosition, selectedSeatId, isAllSeatWorst) {
  const id = seatId(seatResult?.seatId ?? seatResult?.id);
  if (isAllSeatWorst) return P20_SCOPE.OVERALL_ALL_SEAT;
  if (selectedSeatId && id && id === seatId(selectedSeatId)) return P20_SCOPE.SELECTED_SEAT;
  const priority = resolveSeatPriority(seatingPosition || seatResult || {});
  if (priority === PRIMARY) return P20_SCOPE.PRIMARY_GROUP;
  if (priority === SECONDARY) return P20_SCOPE.SECONDARY_GROUP;
  return P20_SCOPE.SEAT;
}

/**
 * The canonical P20 display object for one seat result.
 *
 * @param {object} seatResult - authority result: { seatId, variationDbRaw, level, worstFrequencyHz }
 * @param {object} [options]
 * @param {object|null} [options.seatingPosition] - seat geometry (for priority/labels)
 * @param {string|null} [options.selectedSeatId]
 * @param {boolean} [options.isAllSeatWorst] - this seat is the project's worst seat
 * @returns {object|null} null when the result carries no usable deviation
 */
export function resolveP20SeatDisplay(seatResult, {
  seatingPosition = null,
  selectedSeatId = null,
  isAllSeatWorst = false,
} = {}) {
  if (!finite(seatResult?.variationDbRaw)) return null;
  const id = seatId(seatResult?.seatId ?? seatResult?.id);
  const exactDeviationDb = Math.abs(Number(seatResult.variationDbRaw));
  // The one rounding decision in the whole P20 display path.
  const displayDeviationDb = resolveRp22DesignValue(20, exactDeviationDb);
  const limitingFrequencyHz = finite(seatResult?.worstFrequencyHz)
    ? Number(seatResult.worstFrequencyHz)
    : null;
  const seat = seatingPosition || seatResult || {};
  return {
    seatId: id,
    seatLabel: formatSeatLabel(id),
    seatPillLabel: formatSeatPillLabel(id),
    row: rowNumber(seat),
    column: columnNumber(seat),
    scope: resolveScope(seatResult, seatingPosition, selectedSeatId, isAllSeatWorst),
    exactDeviationDb,
    displayDeviationDb,
    // Displayed text. Every surface uses these strings — never its own rounding.
    displayVariationText: `±${displayDeviationDb} dB`,
    exactVariationText: `±${exactDeviationDb.toFixed(1)} dB`,
    displayDiffersFromExact: Number(exactDeviationDb.toFixed(1)) !== displayDeviationDb,
    grade: p20GradeText(seatResult?.level),
    level: seatResult?.level ?? null,
    limitingFrequencyHz,
    displayFrequencyHz: limitingFrequencyHz == null ? null : Math.round(limitingFrequencyHz),
    displayFrequencyText: limitingFrequencyHz == null ? null : `${Math.round(limitingFrequencyHz)} Hz`,
    comparisonPointCount: finite(seatResult?.comparisonPointCount)
      ? Number(seatResult.comparisonPointCount)
      : null,
    roundingMethod: P20_ROUNDING_METHOD,
  };
}

function realSeats(perSeatResults) {
  return (Array.isArray(perSeatResults) ? perSeatResults : [])
    .filter((seat) => seat && finite(seat.variationDbRaw));
}

/** The project's worst seat (largest deviation) as a canonical display object. */
export function resolveP20WorstDisplay(perSeatResults = [], options = {}) {
  const seats = realSeats(perSeatResults);
  if (!seats.length) return null;
  const worst = seats.reduce((current, seat) => (
    !current || Number(seat.variationDbRaw) > Number(current.variationDbRaw) ? seat : current
  ), null);
  return resolveP20SeatDisplay(worst, { ...options, isAllSeatWorst: true });
}

/** One selected seat's own P20 result as a canonical display object. */
export function resolveP20SelectedSeatDisplay(perSeatResults = [], selectedSeatId, options = {}) {
  if (!selectedSeatId) return null;
  const seats = realSeats(perSeatResults);
  const seat = seats.find((entry) => seatId(entry.seatId) === seatId(selectedSeatId));
  if (!seat) return null;
  return resolveP20SeatDisplay(seat, { ...options, selectedSeatId, isAllSeatWorst: false });
}

/**
 * Graph marker label. One shape, one rounding, wherever a P20 marker is drawn:
 *   "P20 worst point · seat-r1-c2 · 73 Hz · ±12 dB"
 */
export function formatP20MarkerLabel(display, { prefix = "P20 worst point" } = {}) {
  if (!display) return null;
  const parts = [prefix];
  if (display.seatId) parts.push(display.seatId);
  if (display.displayFrequencyHz != null) parts.push(`${display.displayFrequencyHz} Hz`);
  parts.push(display.displayVariationText);
  return parts.join(" · ");
}