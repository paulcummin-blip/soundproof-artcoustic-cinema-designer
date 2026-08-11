// abfuserRecommendation.js
// --------------------------------
// Recommended-quantity calculator for the Artcoustic Abfuser.
//
// The recommendation is now derived from the physical extent of the
// priority wall treatment zones (side reflection zones + rear zone),
// NOT from a floor-area heuristic. See abfuserTreatmentZones.js for
// the full geometry derivation.
//
// This is a SOUND PROOF PRACTICAL GUIDANCE RULE — not an RP22 prescription.

import {
  computeAbfuserTreatmentZones,
  ABFUSER_SKU,
  ABFUSER_LABEL,
} from "./abfuserTreatmentZones";

export { ABFUSER_SKU, ABFUSER_LABEL };

/**
 * Calculate the recommended Abfuser quantity from room geometry,
// speaker positions, and seating positions.
 *
 * @param {Object} roomDims - { widthM, lengthM }
 * @param {Array}  placedSpeakers - speaker objects with role + position
 * @param {Array}  seatingPositions - seat objects with x, y
 * @returns {number} Recommended quantity (integer >= 0)
 */
export function calculateRecommendedAbfuserQty(roomDims, placedSpeakers, seatingPositions) {
  const zones = computeAbfuserTreatmentZones({ roomDims, placedSpeakers, seatingPositions });
  return zones ? zones.recommendedQty : 0;
}