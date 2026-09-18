// abfuserRecommendation.js
// --------------------------------
// Backward-compatible wrapper around the surface-area-based recommendation
// engine (acousticTreatmentRecommendation.js).
//
// The canonical engine uses room surface areas, subtracts screen/doors/
// windows/large elements, targets 15–25% coverage adjusted by room volume,
// and divides by the product's effectiveCoverageArea. This wrapper keeps
// the original export signature so existing callers (RoomDesigner) don't
// need to change their import.

export {
  ABFUSER_SKU,
  ABFUSER_LABEL,
  calculateTreatmentRecommendation,
  DEFAULT_TREATMENT_SKU,
  TREATMENT_PRODUCTS,
} from './acousticTreatmentRecommendation';

import { calculateTreatmentRecommendation } from './acousticTreatmentRecommendation';

/**
 * Calculate the recommended Abfuser quantity from room geometry.
 *
 * @param {Object} roomDims     - { widthM, lengthM, heightM }
 * @param {Array}  placedSpeakers - (legacy, unused by surface-area method)
 * @param {Array}  seatingPositions - (legacy, unused by surface-area method)
 * @param {Object} screen       - Screen state
 * @param {Array}  roomElements - Room elements array
 * @returns {number} Recommended quantity (integer >= 0)
 */
export function calculateRecommendedAbfuserQty(roomDims, placedSpeakers, seatingPositions, screen, roomElements) {
  const result = calculateTreatmentRecommendation({ roomDims, screen, roomElements });
  return result ? result.recommendedQty : 0;
}