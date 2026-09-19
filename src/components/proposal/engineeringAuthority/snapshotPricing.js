/**
 * snapshotPricing.js
 * --------------------------------
 * Reads commercial pricing from the existing canonical price calculation
 * (usePriceCalculation output). Engineering product data is kept separate —
 * prices are never derived from speaker engineering metadata.
 *
 * Pure function. No React. No side effects.
 */

/**
 * @param {Object} priceCalculation — from usePriceCalculation
 * @returns {{ available, system_total, currency, territory, price_mode, vat_basis, breakdown }}
 */
export function buildSnapshotPricing(priceCalculation) {
  if (!priceCalculation) {
    return {
      available: false,
      system_total: null,
      currency: null,
      territory: null,
      price_mode: null,
      vat_basis: null,
      breakdown: [],
    };
  }

  const breakdown = (priceCalculation.breakdown || []).map((line) => ({
    model: line.model || null,
    description: line.description || null,
    unit_price_ex_vat: line.unitPriceExVat ?? null,
    quantity: line.qty ?? line.count ?? 0,
    subtotal_ex_vat: line.subtotalExVat ?? null,
    roles: line.roles || null,
    note: line.note || null,
  }));

  return {
    available: priceCalculation.priceListAvailable === true,
    system_total: priceCalculation.finalTotal ?? null,
    base_total: priceCalculation.baseTotal ?? null,
    currency: priceCalculation.currency || null,
    territory: priceCalculation.territoryCode || null,
    price_mode: priceCalculation.priceMode || null,
    vat_basis: priceCalculation.priceMode === 'incVat' ? 'inclusive' : 'exclusive',
    difficulty_multiplier: priceCalculation.difficultyMultiplier ?? null,
    incomplete_price_count: priceCalculation.incompletePriceCount ?? 0,
    breakdown,
  };
}