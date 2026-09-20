/**
 * Passive selector for the P4/P6/P10 Visual Report page.
 *
 * Composite classifications and counts are calculated once by
 * summariseEngineeringResults(). This selector only joins them to geometry.
 */
import { resolveCoordinate } from "./selectClientSpeakerBalance";

const CATEGORY_PRESENTATION = {
  primary: {
    category: "Level 3 or 4",
    wording: "Lowest achieved level across P4, P6 and P10 is Level 3 or 4.",
  },
  good: {
    category: "Level 2",
    wording: "Lowest achieved level across P4, P6 and P10 is Level 2.",
  },
  acceptable: {
    category: "Level 1",
    wording: "Lowest achieved level across P4, P6 and P10 is Level 1.",
  },
  improvement: {
    category: "Does not achieve Level 1",
    wording: "Lowest achieved level across P4, P6 and P10 does not achieve Level 1.",
  },
  not_assessed: {
    category: "Not assessed",
    wording: "No assessed result for this seat.",
  },
};

export function selectClientBestListeningArea({ engineeringSummary, seatingPositions, rsp }) {
  const empty = { seats: [], rsp: null, counts: {}, hasAny: false, hasAnyValidResult: false, hasPrimary: false, explanation: "" };
  const composite = engineeringSummary?.project?.reportCounts?.clientSeatComposites?.bestListeningArea;
  if (!composite || !Array.isArray(seatingPositions)) return empty;

  const geometry = new Map(
    seatingPositions
      .filter((seat) => seat?.id != null)
      .map((seat) => {
        const x = resolveCoordinate(seat.x, seat.position?.x);
        const y = resolveCoordinate(seat.y, seat.position?.y);
        return x == null || y == null ? null : [String(seat.id), { x, y }];
      })
      .filter(Boolean),
  );

  const seats = composite.seats.map((published) => {
    const point = geometry.get(String(published.seatId));
    if (!point) return null;
    const presentation = CATEGORY_PRESENTATION[published.categoryKey] || CATEGORY_PRESENTATION.not_assessed;
    return {
      id: published.seatId,
      x: point.x,
      y: point.y,
      isPrimary: published.isPrimary,
      categoryKey: published.categoryKey,
      category: presentation.category,
      wording: presentation.wording,
      worstLevel: published.worstLevel || null,
      p4Level: published.levels?.p4 || null,
      p6Level: published.levels?.p6 || null,
      p10Level: published.levels?.p10 || null,
    };
  }).filter(Boolean);

  let rspPoint = null;
  const rx = Number(rsp?.x);
  const ry = Number(rsp?.y);
  if (Number.isFinite(rx) && Number.isFinite(ry)) rspPoint = { x: rx, y: ry };

  const counts = composite.counts || {};
  const hasPrimary = (counts.primary || 0) > 0;
  const primaryCount = counts.primary || 0;
  const explanation = seats.length === 0
    ? ""
    : hasPrimary
      ? `${primaryCount === 1 ? "One seat" : `${primaryCount} seats`} achieve the highest level across P4, P6 and P10. Remaining seats are shaded by their lowest achieved level.`
      : "Seats are shaded by their lowest achieved level across RP22 Parameters 4, 6 and 10.";

  return {
    seats,
    rsp: rspPoint,
    counts,
    hasAny: seats.length > 0,
    hasAnyValidResult: composite.hasAnyValidResult === true,
    hasPrimary,
    explanation,
  };
}
