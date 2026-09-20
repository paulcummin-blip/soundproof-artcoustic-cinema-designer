/**
 * Passive selector for the P9 Visual Report page.
 *
 * Reads the exact P9 seat rows and distribution published by
 * summariseEngineeringResults(). It only joins them to seat geometry.
 */
import { resolveCoordinate } from "./selectClientSpeakerBalance";

export function selectClientP9Overhead({ engineeringSummary, seatingPositions }) {
  const empty = {
    seats: [],
    counts: {},
    hasAnyValidResult: false,
    summary: "This layout uses one overhead row, so spacing between rows is not assessed.",
  };
  if (!engineeringSummary || !Array.isArray(seatingPositions)) return empty;

  const reportCounts = engineeringSummary?.project?.reportCounts;
  const publishedResults = reportCounts?.seatResultsByParameter?.p9 || [];
  const distribution = reportCounts?.seatParameterDistributions?.p9 || null;
  const resultBySeat = new Map(publishedResults.map((result) => [String(result.seatId), result]));

  const seats = seatingPositions
    .filter((seat) => seat?.id != null && seat.id !== "mlp")
    .map((seat) => {
      const x = resolveCoordinate(seat.x, seat.position?.x);
      const y = resolveCoordinate(seat.y, seat.position?.y);
      if (x == null || y == null) return null;
      const result = resultBySeat.get(String(seat.id));
      const assessed = result?.status === "scored";
      return {
        id: seat.id,
        x,
        y,
        isPrimary: result?.isPrimary === true,
        isSecondary: result?.priority === "secondary",
        p9Level: assessed ? result.level : null,
        p9Degrees: assessed && Number.isFinite(Number(result.value)) ? Number(result.value) : null,
        applicable: assessed,
      };
    })
    .filter(Boolean);

  const levelCounts = distribution?.levelCounts || {};
  const counts = {
    L4: levelCounts.L4 || 0,
    L3: levelCounts.L3 || 0,
    L2: levelCounts.L2 || 0,
    L1: levelCounts.L1 || 0,
    FAIL: levelCounts.FAIL || 0,
    not_assessed: levelCounts.unassessed || 0,
  };
  const assessedCount = distribution?.assessedCount || 0;
  const uniformLevel = distribution?.uniformLevel || null;
  const summary = assessedCount === 0
    ? empty.summary
    : uniformLevel
      ? `All seats achieve ${uniformLevel} overhead speaker spacing.`
      : "Overhead spacing levels are shown exactly as published for each seat.";

  return {
    seats,
    counts,
    hasAnyValidResult: assessedCount > 0,
    summary,
  };
}
