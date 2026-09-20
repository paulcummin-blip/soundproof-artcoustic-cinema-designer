/**
 * Passive Visual Report bass adapter.
 *
 * P14/P18 room results, P19/P20 seat results, scoped floors and grades are
 * copied exclusively from the published engineering summary. In particular,
 * P20 can never be reintroduced as FAIL by reading the raw bass contract.
 */

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function selectClientBassPerformance(engineeringSummary, seatingPositions) {
  if (!engineeringSummary) return null;

  const roomResults = engineeringSummary.roomResultsByParameter || {};
  const summaries = engineeringSummary.parameterSummaries || {};
  const reportCounts = engineeringSummary.project?.reportCounts || {};
  const p19Authority = engineeringSummary.p19SeatAuthority || null;
  const p14Result = roomResults[14] || null;
  const p18Result = roomResults[18] || null;
  const p19Rows = reportCounts.seatResultsByParameter?.p19 || [];
  const p20Rows = reportCounts.seatResultsByParameter?.p20 || [];

  const p14 = p14Result ? {
    achievedCapabilityDb: finite(p14Result.achievedCapabilityDb),
    achievedLevel: p14Result.level ?? null,
    rawAchievedLevel: p14Result.level ?? null,
    selectedLevel: p14Result.selectedLevel ?? p14Result.level ?? null,
    requestedTargetDb: finite(p14Result.requestedTargetDb ?? p14Result.value),
    headroomOrShortfallDb: finite(p14Result.headroomOrShortfallDb),
    pass: p14Result.pass ?? null,
    targetBasis: p14Result.targetBasis || null,
    targetBasisLabel: p14Result.targetBasisLabel || (p14Result.targetBasis === "recommended" ? "Recommended" : "Minimum"),
    publicationVerified: p14Result.isAuthoritative === true,
  } : null;

  const p18 = p18Result ? {
    achievedLevel: p18Result.level ?? null,
    achievedHz: finite(p18Result.value),
    designHz: finite(p18Result.designHz),
    targetBasis: p18Result.targetBasis || null,
    targetBasisLabel: p18Result.targetBasisLabel || (p18Result.targetBasis === "recommended" ? "Recommended" : "Minimum"),
    publicationVerified: p18Result.isAuthoritative === true,
  } : null;

  const p19BySeat = new Map(
    (p19Authority?.seats || []).map((seat) => [String(seat?.seatId), seat]),
  );
  const p19 = p19Rows.length ? {
    achievedLevel: summaries.project?.p19?.level ?? null,
    achievedVariationDb: null,
    targetBasis: null,
    publicationVerified: true,
    primary: p19Authority?.primary || null,
    secondary: p19Authority?.secondary || null,
    project: p19Authority?.project || null,
    perSeatResults: p19Rows.map((row) => {
      const detail = p19BySeat.get(String(row.seatId));
      return {
        seatId: row.seatId,
        isPrimary: row.priority === "primary",
        priority: row.priority,
        level: row.level,
        grade: row.level,
        variationDbRaw: row.value,
        displayedValue: row.valueFormatted,
        worstFrequencyHz: detail?.worstFrequencyHz ?? row.worstFrequencyHz ?? null,
      };
    }),
  } : null;

  const p20 = p20Rows.length ? {
    achievedLevel: summaries.project?.p20?.level ?? null,
    achievedVariationDb: null,
    targetBasis: null,
    publicationVerified: true,
    perSeatResults: p20Rows.map((row) => ({
      seatId: row.seatId,
      isPrimary: row.priority === "primary",
      priority: row.priority,
      // This level is the canonical design-rating authority. P20 has no FAIL.
      level: row.level,
      variationDbRaw: finite(row.value),
      displayedValue: row.valueFormatted,
      worstFrequencyHz: finite(row.worstFrequencyHz),
    })),
  } : null;

  const hasAssessed = [
    p14?.achievedLevel,
    p18?.achievedLevel,
    p19?.achievedLevel,
    p20?.achievedLevel,
  ].some((level) => level != null && level !== "N/A" && level !== "—" && level !== "not_applicable");
  if (!hasAssessed) return null;

  const seatLabelMap = new Map();
  (Array.isArray(seatingPositions) ? seatingPositions : []).forEach((seat, index) => {
    seatLabelMap.set(seat?.id || `seat-${index}`, seat?.label || `Seat ${index + 1}`);
  });

  return {
    p14,
    p18,
    p19,
    p20,
    seatLabelMap,
    publicationVerified: true,
  };
}
