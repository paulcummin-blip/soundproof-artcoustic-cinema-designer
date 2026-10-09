/**
 * Passive selector for the RP23 Screen Size / Seating client visual.
 * Seat angle, level, scoped floors and explanatory counts come exclusively
 * from engineeringSummary.viewing. This file performs presentation layout
 * only and never re-grades RP23.
 */

import { computeProjectorLumens } from "@/components/report/projectorLumenRecommendation";
import { groupSeatsIntoRows } from "./seatRowGrouping";
import { buildViewingInterpretation } from "./viewingResultCopy";
import { DISPLAY_TYPE_TV, resolveDisplayType } from "@/components/models/screen/displayTypeAuthority";

function levelToKey(level) {
  return level ? String(level).toLowerCase() : "below-l1";
}

function levelToLabel(level) {
  return level || "Below L1";
}

export function selectClientScreenSeating({
  seatingPositions,
  screenFrontPlaneM,
  screenWidthM,
  aspectRatio,
  engineeringSummary,
  displayType = null,
}) {
  // The design's own display authority decides how the display is named here and
  // whether projector-only presentation applies at all.
  const resolvedDisplayType = resolveDisplayType({ display_type: displayType });
  const viewing = engineeringSummary?.viewing;
  if (!Array.isArray(seatingPositions) || !viewing?.available) {
    return {
      seats: [], rows: [], zones: [], hasAny: false, explanation: "",
      projectorLumens: null, displayType: resolvedDisplayType,
    };
  }

  const authorityBySeatId = new Map(
    (viewing.per_seat || []).map((result) => [String(result?.seat_id), result]),
  );
  const frontY = Number(screenFrontPlaneM) || 0.2;
  const seats = seatingPositions.map((seat) => {
    const authority = authorityBySeatId.get(String(seat?.id));
    if (!authority || !Number.isFinite(Number(authority.horizontal_angle_deg))) return null;
    const x = Number(seat?.x);
    const y = Number(seat?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const level = authority.rp23_level || null;
    return {
      id: seat.id,
      x,
      y,
      distanceM: Math.max(0, y - frontY),
      angleDeg: Number(authority.horizontal_angle_deg),
      level: levelToKey(level),
      levelLabel: levelToLabel(level),
      formatted: `${Number(authority.horizontal_angle_deg).toFixed(1)}°`,
      isPrimary: authority.priority === "primary",
    };
  }).filter(Boolean);

  // The seat-mapped presentation: seats grouped into the physical rows of the
  // seating plan, so the result block can be laid out in the same arrangement.
  const rows = groupSeatsIntoRows(seats);

  return {
    seats,
    rows,
    // RP23 zone bands were previously re-derived by re-running the grading
    // function inside the report. They are intentionally omitted: only the
    // canonical published seat results are visualised.
    zones: [],
    hasAny: seats.length > 0,
    explanation: buildViewingInterpretation(rows),
    displayType: resolvedDisplayType,
    // Projector light output is projection presentation only: a television has no
    // projector, so no light-output figure is raised for it. The calculation
    // itself is unchanged.
    projectorLumens: resolvedDisplayType === DISPLAY_TYPE_TV
      ? null
      : computeProjectorLumens(screenWidthM, aspectRatio),
  };
}