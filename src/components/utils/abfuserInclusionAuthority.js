// abfuserInclusionAuthority.js
// --------------------------------
// The single authority for HOW MANY Abfusers are included in a design.
//
//   Acoustic treatment OFF           → nothing included, nothing priced
//   No manual override               → the included quantity follows the live ADI
//                                      recommendation (this is the DEFAULT)
//   Manual override (source "user")  → the designer's quantity, never overwritten
//
// The ADI recommendation itself stays guidance computed from room geometry
// (adiAbfuserRecommendation.js). This module only decides which quantity is the
// design's included quantity — the number that pricing, the product breakdown,
// the engineering snapshots and the reports all follow.

import { ABFUSER_QTY_SOURCE } from "./abfuserQuantityMigration";

/**
 * True when the designer has taken the quantity over manually. Any other source
 * ("none" = never touched, "recommended" = re-accepted) means the included
 * quantity follows the ADI recommendation.
 */
export function isManualAbfuserOverride(quantitySource) {
  return String(quantitySource || "") === ABFUSER_QTY_SOURCE.USER;
}

/**
 * The included (priced) Abfuser quantity.
 *
 * @param {Object} input
 * @param {boolean} input.enabled             Acoustic treatment enabled
 * @param {string}  input.quantitySource      "user" = manual override
 * @param {number}  input.selectedQuantity    Stored designer quantity
 * @param {number}  input.recommendedQuantity Live ADI recommendation
 * @returns {number}
 */
export function resolveIncludedAbfuserQuantity({
  enabled,
  quantitySource,
  selectedQuantity,
  recommendedQuantity,
}) {
  if (enabled !== true) return 0;

  const quantity = (value) => Math.max(0, Math.floor(Number(value) || 0));
  if (isManualAbfuserOverride(quantitySource)) return quantity(selectedQuantity);
  return quantity(recommendedQuantity);
}