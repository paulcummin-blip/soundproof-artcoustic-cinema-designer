/**
 * Passive selector for the P16/P17 Visual Report page.
 *
 * Engineering grades and composite classifications come only from the published
 * engineering summary. This selector joins those immutable rows to seat geometry;
 * it does not normalise, grade, rank, group, or reinterpret engineering results.
 */
import { resolveCoordinate } from "./selectClientSpeakerBalance";

const CATEGORY_LABELS = {
  highly_consistent: "Level 4",
  very_consistent: "Level 3",
  consistent: "Level 2",
  acceptable: "Level 1",
  improvement: "Does not achieve Level 1",
  not_assessed: "Not assessed",
};

function resultMap(engineeringSummary, key) {
  const results = engineeringSummary?.project?.reportCounts?.seatResultsByParameter?.[key] || [];
  return new Map(results.map((result) => [String(result.seatId), result]));
}

function toParam(result) {
  if (!result || result.status !== "scored") return null;
  return {
    level: result.level || null,
    value: Number.isFinite(Number(result.value)) ? Number(result.value) : null,
    status: result.status,
    applicable: true,
    formatted: result.valueFormatted || null,
  };
}

export function selectClientTimbreConsistency({ engineeringSummary, seatingPositions }) {
  const empty = { seats: [], counts: {}, hasAnyValidResult: false };
  const composite = engineeringSummary?.project?.reportCounts?.clientSeatComposites?.timbreConsistency;
  if (!composite || !Array.isArray(seatingPositions)) return empty;

  const geometry = new Map(
    seatingPositions
      .filter((seat) => seat?.id != null && seat.id !== "mlp")
      .map((seat) => {
        const x = resolveCoordinate(seat.x, seat.position?.x);
        const y = resolveCoordinate(seat.y, seat.position?.y);
        return x == null || y == null ? null : [String(seat.id), { seat, x, y }];
      })
      .filter(Boolean),
  );
  const p16BySeat = resultMap(engineeringSummary, "p16");
  const p17BySeat = resultMap(engineeringSummary, "p17");

  const seats = composite.seats.map((published) => {
    const joined = geometry.get(String(published.seatId));
    if (!joined) return null;
    const p16 = p16BySeat.get(String(published.seatId)) || null;
    const p17 = p17BySeat.get(String(published.seatId)) || null;
    return {
      id: published.seatId,
      x: joined.x,
      y: joined.y,
      isPrimary: published.isPrimary,
      p16: toParam(p16),
      p17: toParam(p17),
      p16Level: published.levels?.p16 || null,
      p17Level: published.levels?.p17 || null,
      worstLevel: published.worstLevel || null,
      categoryKey: published.categoryKey,
      categoryLabel: CATEGORY_LABELS[published.categoryKey] || "Not assessed",
    };
  }).filter(Boolean);

  return {
    seats,
    counts: composite.counts || {},
    hasAnyValidResult: composite.hasAnyValidResult === true,
  };
}
