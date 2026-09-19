/**
 * snapshotCategoryFloors.js
 * --------------------------------
 * Reads canonical published category floors from the scoped Design Rating
 * authority. Does NOT rebuild floors from raw parameter values.
 *
 * Consumes the same getCategoryGoverningLevels() that drives the Room Designer
 * sidebar, Design Rating, and Technical/Compliance presentation.
 *
 * Pure function. No React. No side effects. No re-grading.
 */

import {
  getCategoryGoverningLevels,
  getCategorySummaries,
  getDesignPerformanceIndex,
  getRoomDesignRatingDesignation,
} from '@/components/report/technical/designRatingPresentation';

const CATEGORY_LABELS = [
  'Spatial Resolution',
  'Dynamic Range',
  'Timbre Matching',
  'Screen / Viewing Geometry',
];

/**
 * Build category floors for one scope (primary, secondary, or all-seat).
 *
 * @param {Object} scopedRating — a calculateScopedRoomDesignRating result
 * @returns {{ categories: Array<{label, floor, designation, index}>, available: boolean }}
 */
export function buildScopedCategoryFloors(scopedRating) {
  if (!scopedRating || scopedRating.status === 'NOT_ASSESSED' || scopedRating.status === 'NOT_CONFIGURED') {
    return {
      available: false,
      categories: CATEGORY_LABELS.map((label) => ({ label, floor: null, designation: null, index: null })),
    };
  }

  const governingLevels = getCategoryGoverningLevels(scopedRating);
  const summaries = getCategorySummaries(scopedRating);
  const summaryByLabel = new Map((summaries || []).map((s) => [s.label, s]));

  const categories = CATEGORY_LABELS.map((label) => {
    const gov = governingLevels?.find((g) => g.label === label);
    const sum = summaryByLabel.get(label);
    return {
      label,
      floor: gov?.governingLevel || null,
      designation: sum?.designation || null,
      index: sum?.index ?? null,
    };
  });

  return { available: true, categories };
}

/**
 * Build the full category-floors block for all three scopes.
 *
 * @param {Object} scopedRatings — { primary, secondary, all } from useAppDesignRating
 * @returns {{ primary, secondary, all_seat }}
 */
export function buildSnapshotCategoryFloors(scopedRatings) {
  const primary = buildScopedCategoryFloors(scopedRatings?.primary);
  const secondary = buildScopedCategoryFloors(scopedRatings?.secondary);
  const allSeat = buildScopedCategoryFloors(scopedRatings?.all);

  return { primary, secondary, all_seat: allSeat };
}