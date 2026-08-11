// recommendationDisplayOrder.js
// --------------------------------
// Presentation-only display-order resolver for design recommendations.
//
// Material product upgrades are sorted by CANONICAL PRODUCT-FAMILY PROGRESSION
// (the MODELS array index in the speaker registry), NOT by impact, ASDR score,
// price, or alphabetical order. This presents upgrades as a natural product
// ladder: the smallest sensible upgrade appears first, the ultimate product
// appears last.
//
// This resolver does NOT change:
//   - RP22 maths
//   - candidate eligibility
//   - product-family guardrails
//   - useful-power calculations
//   - ASDR scoring
//   - price-free recommendation authority
//   - physical capability calculations
//
// The ranking/impact data remains intact for internal analysis. This module
// only re-orders the display array.

import { MODELS, normaliseModelKey } from "@/components/models/speakers/registry";

// Build a canonical index map from the MODELS array.
// The MODELS array is declared in EXACT ORDER — this IS the canonical product
// range progression for each family:
//   Q-Series:  q4-3 → q6-3 → q4-5 → q8-5
//   Evolve:    evolve-2-1 → evolve-3-1 → evolve-4-2 → evolve-6-3 → evolve-8-4
//   TV/SB:     c-1 → c4-1 → multi-lcr → multi-mono → hspl-lcr → hspl-mono
const MODEL_RANGE_INDEX = new Map();
for (let i = 0; i < MODELS.length; i++) {
  if (!MODEL_RANGE_INDEX.has(MODELS[i].key)) {
    MODEL_RANGE_INDEX.set(MODELS[i].key, i);
  }
}

/**
 * Get the canonical product-range index for a model key.
 * Returns Infinity for unknown models (sorted last).
 */
export function getModelRangeIndex(modelKey) {
  const key = normaliseModelKey(modelKey);
  return MODEL_RANGE_INDEX.has(key) ? MODEL_RANGE_INDEX.get(key) : Infinity;
}

/**
 * Apply canonical product-range display order to material upgrade recommendations.
 *
 * - Material upgrades (LCR upgrade direction): sorted by MODELS array index
 *   (canonical product range progression). The smallest upgrade appears first,
 *   the ultimate product appears last.
 * - Non-LCR improvements (seating, screen, viewing): retain their existing
 *   impact-ranked order.
 * - Best-practice recommendations: retain existing priority.
 * - Simplifications: retain existing least-damaging order.
 *
 * @param {Object} recommendations - { improvements, savings, bestPractice, ... }
 * @returns {Object} new recommendations object with re-ordered improvements
 */
export function applyRecommendationDisplayOrder(recommendations) {
  if (!recommendations) return recommendations;

  const improvements = Array.isArray(recommendations.improvements) ? recommendations.improvements : [];

  const isLcrUpgrade = (item) =>
    item?.kind === "lcr" && item?.recommendationDirection === "upgrade";

  // Material upgrades: sort by canonical product range progression
  const materialUpgrades = improvements
    .filter(isLcrUpgrade)
    .sort((a, b) => {
      const aIdx = getModelRangeIndex(a?.candidateModelKey);
      const bIdx = getModelRangeIndex(b?.candidateModelKey);
      return aIdx - bIdx;
    });

  // Non-LCR improvements: retain existing (impact-ranked) relative order
  const otherImprovements = improvements.filter((item) => !isLcrUpgrade(item));

  // Material upgrades first (product-range ladder), then other improvements
  const orderedImprovements = [...materialUpgrades, ...otherImprovements];

  return {
    ...recommendations,
    improvements: orderedImprovements,
  };
}