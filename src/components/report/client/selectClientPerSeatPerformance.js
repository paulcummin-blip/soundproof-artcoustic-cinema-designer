/**
 * selectClientPerSeatPerformance
 * ------------------------------
 * The Visual Report's per-seat performance summary: one row of compact seat
 * cards per physical seating row, each card carrying that seat's published
 * RP22 / RP23 levels — the report version of the Room Designer seat pop-up.
 *
 * PASSIVE READ ONLY. Nothing is graded, measured or recomputed here:
 *
 *   · RP23
 *       engineeringSummary.viewing.per_seat — the SAME published per-seat
 *       viewing result the Visual Report's Viewing Experience page reads, so a
 *       card's RP23 angle and level ARE the viewing result. The seat HUD
 *       snapshot carries the RP23 angle but no level, so it cannot state an
 *       RP23 result and is never read for one.
 *
 *   · P1/P4/P5/P6/P9/P10/P16/P17
 *       seatHudById[seatId] — the same published per-seat snapshot the Room
 *       Designer pop-up reads, formatted by the SAME presenters
 *       (presentSeatMetric in seatHudPresentation.js), so a card can never
 *       disagree with the pop-up about a value or a level.
 *
 *   · P20
 *       the published P20 per-seat authority the P20 report page reads,
 *       attached through attachAuthoritativeP20ToSeatSnapshot — the pop-up's
 *       own P20 attachment — so the P20 column matches it exactly.
 *
 * ── P19 IS DELIBERATELY ABSENT ──────────────────────────────────────────────
 * P19 is assessed at the REFERENCE SEATING POSITION only: it is the RSP
 * response against the house target, not a per-seat measurement. Listing it on
 * a per-seat card would fill the cards with dashes and imply a measurement that
 * does not exist. Seat-to-seat bass consistency is P20, which IS per seat and
 * IS included.
 *
 * Seat priority (Primary / Secondary) is read from the seat-priority authority;
 * the internal isPrimary flag is the RSP / MLP marker and is carried separately
 * as `isRsp`-adjacent data, never merged with priority.
 *
 * @param {Object} params
 * @param {Object} params.engineeringSummary - published engineering authority
 * @param {Array}  params.seatingPositions   - discrete seats from app state
 * @param {Object} params.bassPerformance    - published bass authority (P20)
 * @param {Object} params.rsp                - canonical reference position
 * @returns {{ hasAny: boolean, rows: Array }}
 */

import { resolveSeatPriority, PRIMARY } from "@/components/utils/seatPriorityAuthority";
import { formatSeatLabel } from "@/components/utils/seatLabel";
import { groupSeatsIntoRows } from "@/components/report/client/seatRowGrouping";
import {
  presentSeatMetric,
  attachAuthoritativeP20ToSeatSnapshot,
} from "@/components/room/seatHudPresentation";
import { RP22_PRESENTATION_PARAMETERS } from "@/components/utils/rp22ParameterPresentation";
import { isAssessedLevel } from "@/components/report/client/visualReportSeatStyle";
import { formatDb } from "@/components/utils/formatDb";

/**
 * The RP22 parameters that are genuinely assessed at EVERY seat.
 * P19 is not in this list, and must never be added to it: it is published at
 * the reference seating position only.
 */
const PER_SEAT_PARAMETER_NUMBERS = [1, 4, 5, 6, 9, 10, 16, 17];

/** Reference-position tolerance, matching the seat HUD's own RSP bind (m). */
const RSP_BIND_TOLERANCE_M = 0.05;

function parameterFor(number) {
  return RP22_PRESENTATION_PARAMETERS.find((parameter) => parameter.number === number) || null;
}

function seatLabelFor(seat, index) {
  if (seat?.label) return seat.label;
  if (seat?.id) {
    const formatted = formatSeatLabel(seat.id);
    if (formatted && formatted !== seat.id) return formatted;
  }
  return `Seat ${index + 1}`;
}

function isReferenceSeat(seat, rsp) {
  const x = Number(seat?.x ?? seat?.position?.x);
  const y = Number(seat?.y ?? seat?.position?.y);
  const rx = Number(rsp?.x);
  const ry = Number(rsp?.y);
  if (![x, y, rx, ry].every(Number.isFinite)) return false;
  return Math.hypot(x - rx, y - ry) <= RSP_BIND_TOLERANCE_M;
}

export function selectClientPerSeatPerformance({
  engineeringSummary,
  seatingPositions,
  bassPerformance,
  rsp,
} = {}) {
  const seatHudById = engineeringSummary?.seatHudById || null;
  const seats = (Array.isArray(seatingPositions) ? seatingPositions : [])
    .filter((seat) => seat && Number.isFinite(Number(seat.x ?? seat.position?.x)) && Number.isFinite(Number(seat.y ?? seat.position?.y)));
  if (!seatHudById || seats.length === 0) return { hasAny: false, rows: [] };

  const p20Rows = Array.isArray(bassPerformance?.p20?.perSeatResults)
    ? bassPerformance.p20.perSeatResults
    : [];
  const p20Parameter = parameterFor(20);

  // The published per-seat viewing authority (angle + RP23 level). This is the
  // authority the Viewing Experience page reads — not the seat HUD snapshot,
  // whose RP23 entry carries the angle alone.
  const viewingBySeatId = new Map(
    (Array.isArray(engineeringSummary?.viewing?.per_seat) ? engineeringSummary.viewing.per_seat : [])
      .map((result) => [String(result?.seat_id), result]),
  );

  const cards = seats.map((seat, index) => {
    const seatId = String(seat.id || `seat-${index}`);
    const hud = seatHudById[seatId] || {};
    const rp22 = hud.rp22 || {};

    const parameters = PER_SEAT_PARAMETER_NUMBERS.map((number) => {
      const parameter = parameterFor(number);
      const presented = presentSeatMetric(parameter, rp22[`p${number}`]);
      return {
        key: `p${number}`,
        label: `P${number}`,
        level: presented.level,
        valueText: presented.valueText,
      };
    });

    // P20 — read through the pop-up's own P20 attachment, so the card states
    // exactly what the pop-up states.
    if (p20Parameter) {
      const attached = attachAuthoritativeP20ToSeatSnapshot({ rp22: {} }, seatId, p20Rows);
      const presented = presentSeatMetric(p20Parameter, attached?.rp22?.p20);
      parameters.push({
        key: "p20",
        label: "P20",
        level: presented.level,
        valueText: presented.valueText,
      });
    }

    // RP23 horizontal viewing — the published per-seat viewing result, stated
    // exactly as the Viewing Experience page states it (level + angle).
    const viewing = viewingBySeatId.get(seatId) || null;
    const viewingAngleDeg = Number(viewing?.horizontal_angle_deg);
    const viewingLevel = viewing?.rp23_level ? String(viewing.rp23_level) : null;
    const rp23 = Number.isFinite(viewingAngleDeg)
      ? {
          level: viewingLevel || "—",
          valueText: `${viewingAngleDeg.toFixed(1)}°`,
        }
      : { level: "—", valueText: "—" };

    // Screen-channel SPL at the seat — the pop-up's own Screen group.
    const spl = Object.entries(hud.splAtSeat?.lcr || {})
      .filter(([, value]) => Number.isFinite(Number(value?.value)))
      .map(([role, value]) => ({ role, text: formatDb(value.value) }));

    return {
      id: seatId,
      label: seatLabelFor(seat, index),
      x: Number(seat.x ?? seat.position?.x),
      y: Number(seat.y ?? seat.position?.y),
      priority: resolveSeatPriority(seat),
      isPrimary: seat.isPrimary === true,
      isRsp: isReferenceSeat(seat, rsp),
      rp23,
      parameters,
      spl,
    };
  });

  // A seat is assessed when at least one included parameter carries a genuine
  // assessed level (L1–L4 or FAIL). Never infer from dashes or N/A.
  const hasAny = cards.some((card) =>
    [card.rp23, ...card.parameters].some((row) => isAssessedLevel(row?.level))
  );
  if (!hasAny) return { hasAny: false, rows: [] };

  return {
    hasAny: true,
    primaryCount: cards.filter((card) => card.priority === PRIMARY).length,
    rows: groupSeatsIntoRows(cards),
  };
}

export default selectClientPerSeatPerformance;