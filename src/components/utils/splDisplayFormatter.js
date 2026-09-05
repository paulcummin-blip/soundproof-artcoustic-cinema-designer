// Shared designer/client-facing SPL presentation.
// Display only: callers retain the original full-precision value for all maths,
// grading, persistence, optimisation and acoustic authority.

export function ceilSplDisplayValue(value) {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.ceil(number) : null;
}

export function formatSplDisplay(value, { unit = "dBC", fallback = "—" } = {}) {
  const wholeDb = ceilSplDisplayValue(value);
  return wholeDb === null ? fallback : `${wholeDb} ${unit}`;
}
