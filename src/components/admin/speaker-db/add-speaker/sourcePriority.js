// sourcePriority.js
// ---------------------------------------------------------------------------
// Deterministic source priority for specification field values.
//
// When a value already exists from a higher-priority source, it must never be
// overwritten by a lower-priority source. This module provides the ranking and
// a helper to decide whether a new source should replace an existing one.
//
// Priority order (1 = highest, 6 = lowest):
//   1. Official Product Page
//   2. Official PDF  (product-specific specification PDF)
//   3. Official Series Brochure  (correctly scoped section of a series brochure)
//   4. Official Manual
//   5. Engineering Document
//   6. Support Article
//
// Used by:
//   - StepReview.jsx — when promoting raw extraction values (single + bulk)
//   - rawExtraction.js — source label mapping (via mapRawSourceToAuthority)
// ---------------------------------------------------------------------------

export const SOURCE_PRIORITY = {
  "Official Product Page": 1,
  "Official PDF": 2,
  "Official Series Brochure": 3,
  "Official Manual": 4,
  "Engineering Document": 5,
  "Support Article": 6,
};

/**
 * Get the numeric priority of a source type. Lower = higher priority.
 * Unknown / blank sources return 99 (lowest).
 */
export function getSourcePriority(source) {
  if (!source) return 99;
  return SOURCE_PRIORITY[source] ?? 99;
}

/**
 * Decide whether a new source should overwrite an existing source.
 *
 * Returns true if:
 *   - The field has no existing source (empty fields accept any value).
 *   - The new source is strictly higher priority (lower number) than the
 *     existing source.
 *
 * Returns false if:
 *   - The new source is lower or equal priority to the existing source.
 *     Equal priority is not overwritten to avoid churn; the reviewer can
 *     still manually edit the value if they choose.
 */
export function shouldOverwriteByPriority(existingSource, newSource) {
  if (!existingSource) return true;
  if (!newSource) return false;
  return getSourcePriority(newSource) < getSourcePriority(existingSource);
}