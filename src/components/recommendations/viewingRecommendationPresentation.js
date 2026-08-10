/**
 * Presentation-only formatter for canonical Stage D viewing metadata.
 * No angle calculation, RP23 grading, or recommendation comparison lives here.
 */
export function formatViewingRecommendationSummary(item) {
  const comparison = item?.viewingComparison;
  const before = item?.viewingBefore;
  const after = item?.viewingAfter;

  if (!comparison?.material || !before || !after) return null;

  const beforeRows = new Map(
    (before.rows || []).map((row) => [Number(row?.rowNumber), row])
  );
  const parts = [];

  for (const rowAfter of after.rows || []) {
    const rowNumber = Number(rowAfter?.rowNumber);
    const rowBefore = beforeRows.get(rowNumber);
    if (!rowBefore) continue;
    if (rowBefore.rp23Level !== rowAfter.rp23Level) {
      parts.push(
        `Row ${rowNumber} ${rowBefore.rp23Level || "Fail"} → ${rowAfter.rp23Level || "Fail"}`
      );
    }
  }

  const beforeSpread = Number(before.angleSpreadDeg);
  const afterSpread = Number(after.angleSpreadDeg);
  if (
    Number.isFinite(beforeSpread) &&
    Number.isFinite(afterSpread) &&
    Math.abs(afterSpread - beforeSpread) >= 0.05
  ) {
    parts.push(
      `angle spread ${beforeSpread.toFixed(1)}° → ${afterSpread.toFixed(1)}°`
    );
  }

  if (parts.length === 0) return null;
  const label = item?.viewingTradeoff ? "Viewing trade-off" : "Viewing";
  return `${label}: ${parts.join(" · ")}`;
}
