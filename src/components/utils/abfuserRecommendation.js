// abfuserRecommendation.js
// --------------------------------
// Canonical product reference and simple recommended-quantity calculator
// for the Artcoustic Abfuser acoustic treatment product.
//
// This is deliberately simple — NOT a detailed acoustic simulation.
// The recommendation scales with room floor area and provides a starting
// point; the designer may change the selected quantity freely.

export const ABFUSER_SKU = "500027";
export const ABFUSER_LABEL = "Artcoustic Abfuser, Black";

// Recommended density: 1 Abfuser per ~5 m² of floor area, minimum 4.
// This is a simple heuristic — not a physical acoustic model.
const ABFUSER_PER_M2 = 1 / 5;
const ABFUSER_MIN_QTY = 4;

/**
 * Calculate the recommended Abfuser quantity from room dimensions.
 *
 * @param {Object} roomDims - { widthM, lengthM, heightM }
 * @returns {number} Recommended quantity (integer >= 0)
 */
export function calculateRecommendedAbfuserQty(roomDims) {
  const widthM = Number(roomDims?.widthM);
  const lengthM = Number(roomDims?.lengthM);

  if (!Number.isFinite(widthM) || !Number.isFinite(lengthM)) return 0;
  if (widthM <= 0 || lengthM <= 0) return 0;

  const floorAreaM2 = widthM * lengthM;
  const calculated = Math.round(floorAreaM2 * ABFUSER_PER_M2);

  return Math.max(ABFUSER_MIN_QTY, calculated);
}