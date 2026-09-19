/**
 * snapshotDpi.js
 * --------------------------------
 * Reads canonical Design Performance Index values from the scoped Design
 * Rating authority. Does NOT recalculate scores.
 *
 * Pure function. No React. No side effects.
 */

import { getDesignPerformanceIndex, getRoomDesignRatingDesignation } from '@/components/report/technical/designRatingPresentation';

function buildScopedDpi(scopedRating) {
  if (!scopedRating || scopedRating.status === 'NOT_ASSESSED' || scopedRating.status === 'NOT_CONFIGURED') {
    return { available: false, index: null, designation: null, percentage: null };
  }
  const index = getDesignPerformanceIndex(scopedRating);
  const designation = getRoomDesignRatingDesignation(scopedRating);
  const percentage = Number.isFinite(Number(scopedRating.displayPercentage))
    ? Number(scopedRating.displayPercentage)
    : null;
  return { available: true, index, designation, percentage };
}

/**
 * Build DPI for all three scopes from the published scoped ratings.
 *
 * @param {Object} scopedRatings — { primary, secondary, all } from useAppDesignRating
 * @returns {{ primary, secondary, all_seat }}
 */
export function buildSnapshotDpi(scopedRatings) {
  return {
    primary: buildScopedDpi(scopedRatings?.primary),
    secondary: buildScopedDpi(scopedRatings?.secondary),
    all_seat: buildScopedDpi(scopedRatings?.all),
  };
}