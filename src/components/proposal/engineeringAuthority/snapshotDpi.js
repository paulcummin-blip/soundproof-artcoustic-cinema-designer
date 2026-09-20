/**
 * Passive proposal adapter for canonical Design Performance Index values.
 * No index or designation calculation is permitted here.
 */

function readScope(scope) {
  if (!scope) return { available: false, index: null, designation: null, percentage: null };
  const rating = scope.rating || null;
  return {
    available: !!rating && rating.status !== "NOT_ASSESSED" && rating.status !== "NOT_CONFIGURED",
    index: scope.designPerformanceIndex ?? null,
    designation: rating?.designation ?? rating?.label ?? null,
    percentage: rating?.displayPercentage ?? null,
  };
}

export function buildSnapshotDpi(engineeringSummary) {
  return {
    primary: readScope(engineeringSummary?.primary),
    secondary: readScope(engineeringSummary?.secondary),
    all_seat: readScope(engineeringSummary?.project),
  };
}
