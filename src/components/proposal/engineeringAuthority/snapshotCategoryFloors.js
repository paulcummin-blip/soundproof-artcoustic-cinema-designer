/**
 * Passive proposal adapter for canonical category summaries.
 * No floor, grouping, grading, or index calculation is permitted here.
 */

const EMPTY = Object.freeze({ available: false, categories: [] });

function readScope(scope) {
  if (!scope) return EMPTY;
  return {
    available: !!scope.rating && scope.rating.status !== "NOT_ASSESSED" && scope.rating.status !== "NOT_CONFIGURED",
    categories: Array.isArray(scope.categories)
      ? scope.categories.map((category) => ({
          label: category.label,
          floor: category.governingLevel ?? category.floorLevel ?? null,
          designation: category.designation ?? null,
          index: category.index ?? null,
        }))
      : [],
  };
}

export function buildScopedCategoryFloors(scope) {
  return readScope(scope);
}

export function buildSnapshotCategoryFloors(engineeringSummary) {
  return {
    primary: readScope(engineeringSummary?.primary),
    secondary: readScope(engineeringSummary?.secondary),
    all_seat: readScope(engineeringSummary?.project),
  };
}
