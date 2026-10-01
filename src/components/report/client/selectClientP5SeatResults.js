/**
 * Passive P5 Visual Report seat selector.
 *
 * P5 is assessed AT EVERY SEATING POSITION, not at the reference seating
 * position alone. The RSP-centred drawing shows the surround geometry and
 * intent of the layout; the assessed result is the per-seat P5 publication.
 *
 * This selector reads the exact seat rows and distribution published by
 * summariseEngineeringResults() — it never re-measures, re-grades or
 * recomputes an angle. The only work it does is:
 *   - join each published seat result to its seat geometry (for the map)
 *   - group the seats into the same physical rows as the seating plan
 *   - read the project result published for P5 (the floor across the
 *     assessed seating positions)
 *   - identify the limiting seat: the published result that sets that floor
 *
 * It is a presentation selector: every level, angle and count below comes
 * straight from the published engineering authority.
 *
 * @param {Object} params.engineeringSummary Published engineering summary
 * @param {Array}  params.seatingPositions Canonical seating positions
 */

import { resolveCoordinate } from "./selectClientSpeakerBalance";
import { groupSeatsIntoRows } from "./seatRowGrouping";

// Presentation order for reading a published level — worst first.
const LEVEL_RANK = { FAIL: 0, L1: 1, L2: 2, L3: 3, L4: 4 };

export function selectClientP5SeatResults({ engineeringSummary, seatingPositions }) {
  const empty = {
    seats: [],
    rows: [],
    level: null,
    assessedCount: 0,
    limitingSeat: null,
    hasAnyValidResult: false,
  };
  if (!engineeringSummary || !Array.isArray(seatingPositions)) return empty;

  const published = engineeringSummary?.project?.reportCounts?.seatResultsByParameter?.p5 || [];
  const distribution = engineeringSummary?.project?.reportCounts?.seatParameterDistributions?.p5 || null;
  const publishedBySeat = new Map(published.map((result) => [String(result.seatId), result]));

  const seats = seatingPositions
    .filter((seat) => seat?.id != null && seat.id !== "mlp")
    .map((seat) => {
      const x = resolveCoordinate(seat.x, seat.position?.x);
      const y = resolveCoordinate(seat.y, seat.position?.y);
      if (x == null || y == null) return null;
      const result = publishedBySeat.get(String(seat.id));
      const levelLabel = String(result?.level ?? "").trim().toUpperCase();
      const assessed = result?.status === "scored" && LEVEL_RANK[levelLabel] !== undefined;
      return {
        id: seat.id,
        x,
        y,
        isPrimary: result?.isPrimary === true,
        applicable: assessed,
        levelLabel: assessed ? levelLabel : null,
        formatted: assessed ? (result?.valueFormatted || "—") : "—",
        angleDeg: assessed && Number.isFinite(Number(result?.value)) ? Number(result.value) : null,
      };
    })
    .filter(Boolean);

  const assessedSeats = seats.filter((seat) => seat.applicable);
  const rows = groupSeatsIntoRows(seats);

  // The project result is the level published for P5 across the seating
  // positions (the floor). Never derived from the RSP drawing alone.
  const level = engineeringSummary?.parameterSummaries?.project?.p5?.level
    || distribution?.uniformLevel
    || null;

  // Limiting seat: the published result that sets the project floor — lowest
  // level first, then the largest published angle.
  let leading = null;
  for (const seat of assessedSeats) {
    if (!leading) {
      leading = seat;
      continue;
    }
    const seatRank = LEVEL_RANK[seat.levelLabel];
    const leadingRank = LEVEL_RANK[leading.levelLabel];
    if (seatRank < leadingRank) leading = seat;
    else if (seatRank === leadingRank && (seat.angleDeg ?? -1) > (leading.angleDeg ?? -1)) leading = seat;
  }

  let limitingSeat = null;
  if (leading) {
    const row = rows.find((entry) => entry.seats.some((seat) => seat.id === leading.id)) || null;
    limitingSeat = {
      id: leading.id,
      rowLabel: row?.label || null,
      positionInRow: row ? row.seats.findIndex((seat) => seat.id === leading.id) + 1 : null,
      rowSize: row ? row.seats.length : null,
      levelLabel: leading.levelLabel,
      angleDeg: leading.angleDeg,
      formatted: leading.formatted,
    };
  }

  return {
    seats,
    rows,
    level,
    assessedCount: distribution?.assessedCount ?? assessedSeats.length,
    limitingSeat,
    hasAnyValidResult: assessedSeats.length > 0,
  };
}