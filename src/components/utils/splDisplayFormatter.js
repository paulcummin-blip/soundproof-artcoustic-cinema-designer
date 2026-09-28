// Shared designer/client-facing SPL presentation.
// Display only: callers retain the original full-precision value for all maths,
// persistence, optimisation and acoustic authority.
//
// Sound Proof intentionally grades practical integer values. Lower-is-better
// values are floored; SPL/output values are ceiled. This is a product policy,
// not a raw lab-report comparison.

export function ceilSplDisplayValue(value) {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.ceil(number) : null;
}

export function formatSplDisplay(value, { unit = "dBC", fallback = "—" } = {}) {
  const wholeDb = ceilSplDisplayValue(value);
  return wholeDb === null ? fallback : `${wholeDb} ${unit}`;
}