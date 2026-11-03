// stage2QuantityOrder.js
// Pure authority for the Stage 2 quantity evaluation order.
//
// Stage 2 should derive the required quantity from the actual promoted
// finalist / current design: the installed (or promoted) subwoofer quantity is
// evaluated FIRST, then the remaining supported quantities in the canonical
// default order. The authoritative supported-quantity mechanism is
// STAGE2_DEFAULT_QUANTITY_ORDER ([2,4,1]) plus the current-quantity prepend;
// STAGE2_QUANTITY_ORDER ([1,2,3,4]) is the overall-best ranking order.
//
// Extracted from useStage2PlacementOptimiser.js so the handoff contract is
// unit-testable without React. Behaviour is unchanged.

import { STAGE2_DEFAULT_QUANTITY_ORDER } from "./stage2Constants.js";

/**
 * Resolve the Stage 2 quantity evaluation order for a given current/promoted
 * subwoofer quantity.
 *
 * @param {number|null|undefined} currentQuantity — installed/promoted sub count (1/2/3/4)
 * @returns {number[]} ordered list of quantities to evaluate, current first
 */
export function resolveQuantityOrder(currentQuantity) {
  if (currentQuantity === 1 || currentQuantity === 2 || currentQuantity === 3 || currentQuantity === 4) {
    return [currentQuantity, ...STAGE2_DEFAULT_QUANTITY_ORDER.filter((q) => q !== currentQuantity)];
  }
  return STAGE2_DEFAULT_QUANTITY_ORDER;
}