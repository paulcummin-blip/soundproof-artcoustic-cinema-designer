/**
 * territoryConfig.js
 * --------------------------------
 * Canonical territory definitions for the Room Designer pricing system.
 *
 * Each territory has:
 *   code:               short identifier used in state and persistence
 *   label:              display name for the Options dropdown and Price Summary
 *   currency:           ISO 4217 currency code (for future per-territory price lists)
 *   priceListAvailable: whether a connected price authority exists today
 *
 * V1: only UK has a price list. IE and IN are selectable immediately but
 * resolve to a "price list not available" state — no UK fallback, no £0.
 *
 * To add a new territory: add an entry here and (when its price list is ready)
 * set priceListAvailable to true. No other files need to change.
 */
export const TERRITORIES = {
  UK: { code: 'UK', label: 'United Kingdom', currency: 'GBP', priceListAvailable: true },
  IE: { code: 'IE', label: 'Ireland',        currency: 'EUR', priceListAvailable: false },
  IN: { code: 'IN', label: 'India',          currency: 'INR', priceListAvailable: false },
};

export const DEFAULT_TERRITORY = 'UK';

export function getTerritoryConfig(code) {
  return TERRITORIES[code] || TERRITORIES[DEFAULT_TERRITORY];
}

export const TERRITORY_OPTIONS = Object.values(TERRITORIES);